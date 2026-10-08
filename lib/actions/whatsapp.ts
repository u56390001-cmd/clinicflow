"use server";

import { canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import { createWidgetClient } from "@/lib/supabase/widget";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";

/**
 * Phase 12 — WhatsApp Business connection (Meta Cloud API / Embedded Signup).
 *
 * Connection-and-configuration only: this module stores the credentials the
 * Embedded Signup flow produces so Phase 13's webhook can use them. No
 * inbound/outbound messaging happens here.
 *
 * Secrets discipline:
 * - The business access token NEVER crosses back to the browser. It is stored
 *   in `clinic_whatsapp_secrets` — an RLS-enabled table with ZERO client
 *   policies — and only ever written/read through the service-role client
 *   (`createWidgetClient`) inside server actions.
 * - The code→token exchange happens exclusively server-side using
 *   META_APP_SECRET; the 30-second-TTL exchangeable code arrives from the
 *   Embedded Signup popup and is consumed immediately.
 * - Every action re-verifies the signed-in owner/admin against the session's
 *   clinic — the completion endpoint cannot be driven cross-tenant.
 */

// Required env (documented in .env.example):
//   NEXT_PUBLIC_META_APP_ID      — Meta app id (browser-safe, launches popup)
//   NEXT_PUBLIC_META_CONFIG_ID   — Facebook Login for Business configuration id
//   META_APP_SECRET              — server-only, code→token exchange
const GRAPH_BASE = "https://graph.facebook.com";
const DEFAULT_GRAPH_VERSION = "v23.0";

type SignupLaunchConfig = {
  appId: string;
  configId: string;
  graphVersion: string;
};

/**
 * Launch parameters for the client-side Embedded Signup popup. Both values are
 * public by design (Meta's JS SDK needs them in the browser) — no secret is
 * returned. Owner/admin gated so the button only works for people who could
 * complete the flow anyway.
 */
export async function getWhatsappSignupConfig(): Promise<
  ActionResult<SignupLaunchConfig>
> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access || !canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can manage WhatsApp." };
  }

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !configId || !appSecret) {
    return {
      ok: false,
      message:
        "WhatsApp signup isn't configured on this deployment yet. Add the Meta app credentials (.env) first.",
    };
  }

  // Verify the Meta app actually exists before handing the browser a popup
  // URL — Facebook shows a dead-end "content isn't available" page for a bogus
  // app id, so fail fast with a clear message instead. client_credentials
  // works for any app with a client secret regardless of dev/live mode.
  try {
    const probe = await fetch(
      `${GRAPH_BASE}/oauth/access_token?client_id=${encodeURIComponent(
        appId,
      )}&client_secret=${encodeURIComponent(appSecret)}&grant_type=client_credentials`,
      { cache: "no-store" },
    );
    if (!probe.ok) {
      return {
        ok: false,
        message:
          "The Meta app ID in .env.local isn't valid (Meta rejected it). Check NEXT_PUBLIC_META_APP_ID in your Meta app dashboard → App Settings → Basic.",
      };
    }
  } catch {
    return {
      ok: false,
      message: "Could not reach Meta to verify the app. Try again in a moment.",
    };
  }

  return {
    ok: true,
    data: {
      appId,
      configId,
      graphVersion: process.env.META_GRAPH_VERSION ?? DEFAULT_GRAPH_VERSION,
    },
  };
}

/**
 * Complete the Embedded Signup flow: exchange the short-lived code for a
 * business token, read the display phone number, subscribe our app to the
 * WABA's webhooks (Phase 13 depends on it), and persist everything
 * server-side. Called by the browser immediately when the popup finishes.
 */
export async function completeWhatsappSignupAction(
  rawCode: unknown,
  rawWabaId: unknown,
  rawPhoneNumberId: unknown,
): Promise<ActionResult> {
  const code = typeof rawCode === "string" ? rawCode.trim() : "";
  const wabaId = typeof rawWabaId === "string" ? rawWabaId.trim() : "";
  const phoneNumberId =
    typeof rawPhoneNumberId === "string" ? rawPhoneNumberId.trim() : "";

  // Meta ids are numeric strings; the code is opaque base64-ish. Strict
  // shapes prevent junk from ever reaching the Graph API.
  if (!/^[A-Za-z0-9._-]{8,512}$/.test(code)) {
    return { ok: false, message: "Invalid signup code." };
  }
  if (!/^\d{5,32}$/.test(wabaId) || !/^\d{5,32}$/.test(phoneNumberId)) {
    return { ok: false, message: "Invalid WhatsApp account identifiers." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to connect WhatsApp." };
  }
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can connect WhatsApp." };
  }

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return {
      ok: false,
      message:
        "WhatsApp signup isn't configured on this deployment yet. Add the Meta app credentials (.env) first.",
    };
  }
  const version = process.env.META_GRAPH_VERSION ?? DEFAULT_GRAPH_VERSION;

  // 1. Exchange the 30-second-TTL code for a business access token.
  let businessToken: string | null = null;
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${version}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`,
      { method: "GET", cache: "no-store" },
    );
    const json = (await res.json()) as { access_token?: string };
    businessToken = json.access_token ?? null;
  } catch (err) {
    console.error("[whatsapp] token exchange network error", err instanceof Error ? err.message : err);
  }

  if (!businessToken) {
    await markConnectionState(access.clinic.id, {
      connection_status: "error",
      status_message: "Meta rejected the signup code — please reconnect.",
    });
    return {
      ok: false,
      message:
        "We couldn't verify your WhatsApp connection with Meta. Please try the signup again.",
    };
  }

  // 2. Read the display phone number (non-fatal if it fails).
  let displayPhone: string | null = null;
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${version}/${phoneNumberId}?fields=display_phone_number&access_token=${encodeURIComponent(businessToken)}`,
      { method: "GET", cache: "no-store" },
    );
    const json = (await res.json()) as { display_phone_number?: string };
    displayPhone = json.display_phone_number ?? null;
  } catch (err) {
    console.error("[whatsapp] display phone lookup failed", err instanceof Error ? err.message : err);
  }

  // 3. Subscribe our app to the WABA's webhooks (needed for Phase 13;
  //    non-fatal here — the webhook route doesn't exist yet).
  try {
    await fetch(`${GRAPH_BASE}/${version}/${wabaId}/subscribed_apps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: businessToken }),
      cache: "no-store",
    });
  } catch (err) {
    console.error("[whatsapp] webhook subscription failed", err instanceof Error ? err.message : err);
  }

  // 4. Persist credentials via the service-role client: non-secret state in
  //    `clinic_whatsapp_config`, the token alone in `clinic_whatsapp_secrets`
  //    (zero RLS policies — no client role can ever read it).
  const serviceRole = createWidgetClient();
  const { data: configRow, error: configError } = await serviceRole
    .from("clinic_whatsapp_config")
    .upsert(
      {
        clinic_id: access.clinic.id,
        whatsapp_business_account_id: wabaId,
        phone_number_id: phoneNumberId,
        display_phone_number: displayPhone,
        connection_status: "connected",
        status_message: null,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "clinic_id" },
    )
    .select("id")
    .single();

  if (configError || !configRow) {
    console.error("[whatsapp] config upsert failed", {
      code: configError?.code,
      message: configError?.message,
    });
    return { ok: false, message: "We couldn't save your WhatsApp connection. Please try again." };
  }

  const { error: secretError } = await serviceRole
    .from("clinic_whatsapp_secrets")
    .upsert(
      { config_id: configRow.id, access_token: businessToken },
      { onConflict: "config_id" },
    );

  if (secretError) {
    console.error("[whatsapp] secret upsert failed", {
      code: secretError.code,
      message: secretError.message,
    });
    return { ok: false, message: "We couldn't save your WhatsApp connection. Please try again." };
  }

  return { ok: true, data: undefined };
}

/**
 * Disconnect: clears the stored connection state and deletes the token row
 * (which lives in the zero-policy secrets table). Owner/admin gated; runs
 * through the service-role client.
 */
export async function disconnectWhatsappAction(): Promise<ActionResult> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic." };
  }
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can disconnect WhatsApp." };
  }

  const serviceRole = createWidgetClient();

  // Delete the secret first (config_id FK cascades on row delete anyway, but
  // an explicit delete keeps this working even if the config row is absent).
  const { data: configRow } = await serviceRole
    .from("clinic_whatsapp_config")
    .select("id")
    .eq("clinic_id", access.clinic.id)
    .maybeSingle();
  if (configRow) {
    await serviceRole
      .from("clinic_whatsapp_secrets")
      .delete()
      .eq("config_id", configRow.id);
  }

  const { error } = await serviceRole
    .from("clinic_whatsapp_config")
    .update({
      whatsapp_business_account_id: null,
      phone_number_id: null,
      display_phone_number: null,
      connection_status: "not_connected",
      status_message: null,
      connected_at: null,
    })
    .eq("clinic_id", access.clinic.id);

  if (error) {
    console.error("[whatsapp] disconnect failed", { code: error.code, message: error.message });
    return { ok: false, message: "We couldn't disconnect WhatsApp. Please try again." };
  }

  return { ok: true, data: undefined };
}

/**
 * Manual credential paste (test/dev path) — the alternative to Embedded
 * Signup. The caller supplies the values Meta shows on its API Setup page
 * (test number / temporary token, or a System User permanent token) and we
 * store them exactly the way the signup completion does: non-secret state in
 * `clinic_whatsapp_config`, the token alone in `clinic_whatsapp_secrets`.
 *
 * Why it exists: the Embedded Signup popup needs a Facebook Login for Business
 * config and an app in live mode, which local/dev testing does not have. This
 * action bypasses only the popup — webhook, adapter, and reminders are
 * untouched. The token never crosses back to the browser on read.
 */
export async function connectWhatsappManualAction(
  rawPhoneNumberId: unknown,
  rawAccessToken: unknown,
  rawWabaId?: unknown,
  rawDisplayPhone?: unknown,
): Promise<ActionResult> {
  const phoneNumberId =
    typeof rawPhoneNumberId === "string" ? rawPhoneNumberId.trim() : "";
  const accessToken =
    typeof rawAccessToken === "string" ? rawAccessToken.trim() : "";
  const wabaId = typeof rawWabaId === "string" ? rawWabaId.trim() : "";
  const displayPhone =
    typeof rawDisplayPhone === "string" ? rawDisplayPhone.trim() : "";

  // Meta ids are numeric; the token is an opaque string with a DB cap (1024).
  if (!/^\d{5,32}$/.test(phoneNumberId)) {
    return { ok: false, message: "Invalid Phone Number ID." };
  }
  if (!accessToken || accessToken.length > 1024) {
    return { ok: false, message: "Invalid access token." };
  }
  if (wabaId && !/^\d{5,32}$/.test(wabaId)) {
    return { ok: false, message: "Invalid WhatsApp Business Account ID." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to connect WhatsApp." };
  }
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can connect WhatsApp." };
  }

  // Validate the token against Meta before saving: a dead/expired token would
  // only fail later, when a patient actually messages us. Lookup of the phone
  // number doubles as the display-number discovery the signup flow does.
  let displayPhoneResolved = displayPhone.slice(0, 32) || null;
  try {
    const version = process.env.META_GRAPH_VERSION ?? DEFAULT_GRAPH_VERSION;
    const res = await fetch(
      `${GRAPH_BASE}/${version}/${phoneNumberId}?fields=display_phone_number&access_token=${encodeURIComponent(accessToken)}`,
      { method: "GET", cache: "no-store" },
    );
    if (!res.ok) {
      return {
        ok: false,
        message:
          "Meta rejected this token or phone number ID. If the token was just generated, copy it again and retry.",
      };
    }
    const json = (await res.json()) as { display_phone_number?: string };
    displayPhoneResolved = json.display_phone_number ?? displayPhoneResolved;
  } catch {
    // Network hiccup — save anyway; connectivity will be proven by the first
    // real send. Never block a credentials paste on a transient fetch error.
    console.warn("[whatsapp] token validation probe failed (continuing)");
  }

  const serviceRole = createWidgetClient();
  const { data: configRow, error: configError } = await serviceRole
    .from("clinic_whatsapp_config")
    .upsert(
      {
        clinic_id: access.clinic.id,
        whatsapp_business_account_id: wabaId || null,
        phone_number_id: phoneNumberId,
        display_phone_number: displayPhoneResolved,
        connection_status: "connected",
        status_message: null,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "clinic_id" },
    )
    .select("id")
    .single();

  if (configError || !configRow) {
    console.error("[whatsapp] manual config upsert failed", {
      code: configError?.code,
      message: configError?.message,
    });
    return {
      ok: false,
      message: "We couldn't save your WhatsApp connection. Please try again.",
    };
  }

  const { error: secretError } = await serviceRole
    .from("clinic_whatsapp_secrets")
    .upsert(
      { config_id: configRow.id, access_token: accessToken },
      { onConflict: "config_id" },
    );

  if (secretError) {
    console.error("[whatsapp] manual secret upsert failed", {
      code: secretError.code,
      message: secretError.message,
    });
    return {
      ok: false,
      message: "We couldn't save your WhatsApp connection. Please try again.",
    };
  }

  return { ok: true, data: undefined };
}

/** Record a terminal connection state without touching credentials. */
async function markConnectionState(
  clinicId: string,
  patch: { connection_status: "error"; status_message: string },
): Promise<void> {
  try {
    const serviceRole = createWidgetClient();
    await serviceRole
      .from("clinic_whatsapp_config")
      .upsert({ clinic_id: clinicId, ...patch }, { onConflict: "clinic_id" });
  } catch (err) {
    console.error("[whatsapp] marking error state failed", err instanceof Error ? err.message : err);
  }
}
