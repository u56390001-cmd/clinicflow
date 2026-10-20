"use server";

import { revalidatePath } from "next/cache";

import { logAuditEvent } from "@/lib/auth/role-guard";
import { canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import { createWidgetClient } from "@/lib/supabase/widget";
import {
  getZegoConfig,
  validateZegoCredentials,
} from "@/lib/zego/server";
import type { ZegoConnectionStatus } from "@/types/database";
import type { ActionResult } from "@/types";

/**
 * Per-clinic ZEGOcloud connection (migration 0107) — the same self-serve
 * credentials flow as AI provider keys (0029) and WhatsApp (0019):
 *
 * - Public connection state lives in `clinic_zego_config`, readable by any
 *   member through RLS.
 * - The Server Secret lives only in `clinic_zego_secrets`, a zero-policy,
 *   service-role-only table: every write below goes through the widget
 *   client and the secret is never returned to any caller.
 * - `saveZegoConnectionAction` verifies credential FORMAT (the secret is
 *   AES-encrypted into every Token04, so its byte length must be exactly
 *   16/24/32); the real cross-check happens at call time, when token minting
 *   resolves this row against the room.
 */

export type ZegoConnectionState = {
  appId: string | null;
  status: ZegoConnectionStatus;
  connectedAt: string | null;
  statusMessage: string | null;
  /** True when the platform-wide env pair is available as a fallback. */
  platformFallbackAvailable: boolean;
};

/** Read the clinic's own connection state plus whether the env fallback exists. */
export async function getZegoConnectionStateAction(): Promise<
  ActionResult<ZegoConnectionState>
> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to see these settings." };
  }

  const { data: config } = await supabase
    .from("clinic_zego_config")
    .select("app_id, connection_status, connected_at, status_message")
    .eq("clinic_id", access.clinic.id)
    .maybeSingle();

  return {
    ok: true,
    data: {
      appId: config?.app_id ?? null,
      status:
        (config?.connection_status as ZegoConnectionStatus | undefined) ??
        "not_connected",
      connectedAt: config?.connected_at ?? null,
      statusMessage: config?.status_message ?? null,
      platformFallbackAvailable: getZegoConfig() !== null,
    },
  };
}

type SaveConnectionInput = { appId: string; serverSecret: string };

/** Validate the credentials strictly on the server, mirroring the UI hints. */
export async function verifyZegoCredentialsAction(
  input: SaveConnectionInput,
): Promise<ActionResult<{ message: string }>> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to verify credentials." };
  }
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can verify video-calling credentials.",
    };
  }
  const parsed = validateZegoCredentials(input.appId, input.serverSecret);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message };
  }
  return {
    ok: true,
    data: {
      message:
        "Credentials look valid: the App ID is numeric and the Server Secret length is token-compatible (16/24/32).",
    },
  };
}

export async function saveZegoConnectionAction(
  input: SaveConnectionInput,
): Promise<ActionResult<{ appId: string }>> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to integrate calling." };
  }
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can change video-calling credentials.",
    };
  }
  const clinicId = access.clinic.id;

  const parsed = validateZegoCredentials(input.appId, input.serverSecret);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message };
  }
  const { appId, serverSecret } = parsed.config;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "You need to be signed in to do that." };
  }

  const widget = createWidgetClient();
  const { data: config, error: configError } = await widget
    .from("clinic_zego_config")
    .upsert(
      {
        clinic_id: clinicId,
        app_id: String(appId),
        connection_status: "connected",
        status_message: null,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "clinic_id" },
    )
    .select("id")
    .maybeSingle();
  if (configError || !config) {
    console.error("[zego-settings] config upsert failed", {
      clinicId,
      message: configError?.message ?? "no row returned",
    });
    return {
      ok: false,
      message: "We couldn't save the connection. Please try again.",
    };
  }

  const { error: secretError } = await widget
    .from("clinic_zego_secrets")
    .upsert(
      { config_id: config.id, server_secret: serverSecret },
      { onConflict: "config_id" },
    );
  if (secretError) {
    console.error("[zego-settings] secret upsert failed", {
      clinicId,
      message: secretError.message,
    });
    // Leave no half-saved state behind: the config row with a `connected`
    // status but no secret would lime every call attempt into a confusing
    // error. Reset the status instead.
    await widget
      .from("clinic_zego_config")
      .update({
        connection_status: "error",
        status_message: "Server Secret could not be stored.",
      })
      .eq("id", config.id);
    return {
      ok: false,
      message: "We couldn't store the Server Secret. Nothing was changed.",
    };
  }

  await logAuditEvent({
    clinicId,
    userId: user.id,
    action: "ZEGO_CONNECTION_SAVE",
    resourceType: "clinic_zego_config",
    resourceId: config.id,
    details: { appId },
  });

  revalidatePath("/app/telehealth");
  return { ok: true, data: { appId: String(appId) } };
}

/** Remove the clinic's own credentials; calls fall back to the platform pair. */
export async function disconnectZegoAction(): Promise<ActionResult<undefined>> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to disconnect." };
  }
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can disconnect video calling.",
    };
  }
  const clinicId = access.clinic.id;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "You need to be signed in to do that." };
  }

  const widget = createWidgetClient();
  // The FK cascade removes the zero-policy secret row along with the config.
  const { data: deleted, error } = await widget
    .from("clinic_zego_config")
    .delete()
    .eq("clinic_id", clinicId)
    .select("id")
    .maybeSingle();
  if (error || !deleted) {
    console.error("[zego-settings] disconnect failed", {
      clinicId,
      message: error?.message ?? "no row returned",
    });
    return { ok: false, message: "We couldn't disconnect. Please try again." };
  }

  await logAuditEvent({
    clinicId,
    userId: user.id,
    action: "ZEGO_CONNECTION_DISCONNECT",
    resourceType: "clinic_zego_config",
    resourceId: deleted.id,
    details: {},
  });

  revalidatePath("/app/telehealth");
  return { ok: true, data: undefined };
}
