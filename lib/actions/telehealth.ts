"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getBaseUrl } from "@/lib/booking-url";
import { logAuditEvent } from "@/lib/auth/role-guard";
import { canManageClinical, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import { createWidgetClient } from "@/lib/supabase/widget";
import {
  buildTelehealthRoomId,
  generateKitToken,
  getZegoConfig,
} from "@/lib/zego/server";
import {
  WhatsappNotConnectedError,
  getClinicWhatsappCredentials,
  sendWhatsappText,
} from "@/lib/whatsapp/client";
import {
  ensureConversation,
  logWhatsappMessage,
  touchConversation,
} from "@/lib/whatsapp/conversation";
import type { TelehealthStatus } from "@/types/database";
import type { ActionResult } from "@/types";

const uuidSchema = z.string().uuid();

/** Token lifetime: the capability link dies with the token. */
const TOKEN_TTL_SECONDS = 2 * 60 * 60;

export type StartTelehealthResult = {
  sessionId: string;
  roomId: string;
  /** Doctor-facing KitToken (kept in memory only — never persisted). */
  doctorToken: string;
  doctorName: string;
  joinUrl: string;
  whatsappSent: boolean;
  hasWhatsappNumber: boolean;
};

/**
 * Phase 8 — start (or resume) a telehealth video room for a patient.
 *
 * The KitToken is minted here so `ZEGO_SERVER_SECRET` never reaches the
 * browser. The patient's join URL carries a separate, single-purpose token
 * scoped to the same room. Delivery prefers WhatsApp; when the clinic isn't
 * connected or the patient has no number, the caller still gets `joinUrl` so the
 * link can be copied by hand.
 */
export async function startTelehealthSessionAction(
  patientId: string,
): Promise<ActionResult<StartTelehealthResult>> {
  if (!uuidSchema.safeParse(patientId).success) {
    return { ok: false, message: "Missing patient id." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to start a call." };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role cannot start video consultations." };
  }
  const clinicId = access.clinic.id;

  const config = getZegoConfig();
  if (!config) {
    return {
      ok: false,
      message:
        "Video calling isn't configured. Add ZEGO_APP_ID and ZEGO_SERVER_SECRET.",
    };
  }

  const { data: patient } = await supabase
    .from("patients")
    .select("id, name, whatsapp_number")
    .eq("clinic_id", clinicId)
    .eq("id", patientId)
    .maybeSingle();
  if (!patient) {
    return { ok: false, message: "That patient is not in this clinic." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "You need to be signed in to do that." };
  }

  const { data: doctor } = await supabase
    .from("doctors")
    .select("id, name")
    .eq("clinic_id", clinicId)
    .eq("user_id", user.id)
    .maybeSingle();

  const doctorName =
    doctor?.name ||
    (typeof user.user_metadata?.name === "string" && user.user_metadata.name) ||
    (typeof user.user_metadata?.full_name === "string" &&
      user.user_metadata.full_name) ||
    access.clinic.doctor_name ||
    "Clinician";

  const roomId = buildTelehealthRoomId({
    clinicId,
    doctorId: doctor?.id ?? null,
    patientId,
  });

  const doctorToken = generateKitToken(config, {
    roomId,
    userId: user.id,
    userName: doctorName,
    expiresInSeconds: TOKEN_TTL_SECONDS,
  });
  const patientName = (patient.name ?? "").trim() || "Patient";
  const patientToken = generateKitToken(config, {
    roomId,
    userId: `patient_${patientId}`,
    userName: patientName,
    expiresInSeconds: TOKEN_TTL_SECONDS,
  });

  const joinUrl = `${getBaseUrl()}/telehealth/join?room=${encodeURIComponent(
    roomId,
  )}&token=${encodeURIComponent(patientToken)}`;

  const widget = createWidgetClient();
  const { data: session, error: insertError } = await widget
    .from("telehealth_sessions")
    .insert({
      clinic_id: clinicId,
      doctor_id: doctor?.id ?? null,
      patient_id: patientId,
      room_id: roomId,
      status: "ACTIVE",
      started_at: new Date().toISOString(),
      patient_join_url: joinUrl,
      created_by: user.id,
      metadata: {
        patient_name: patientName,
        doctor_name: doctorName,
        token_ttl_seconds: TOKEN_TTL_SECONDS,
      },
    })
    .select("id")
    .maybeSingle();
  if (insertError || !session) {
    console.error("[startTelehealthSessionAction] insert failed", {
      clinicId,
      patientId,
      message: insertError?.message ?? "no row returned",
    });
    return { ok: false, message: "We couldn't start the call. Please try again." };
  }

  const waNumber = (patient.whatsapp_number ?? "").replace(/[^\d]/g, "");
  let whatsappSent = false;
  if (waNumber) {
    const firstName = patientName.split(" ")[0];
    const body = `${firstName ? `Hello ${firstName},` : "Hello,"}\n\n${doctorName} is ready for your video consultation at ${access.clinic.name}. Join here (link valid for 2 hours):\n${joinUrl}\n\nNo app needed — it opens in your browser.`;
    try {
      const credentials = await getClinicWhatsappCredentials(clinicId);
      const result = await sendWhatsappText(credentials, waNumber, body);
      if (result.ok) {
        whatsappSent = true;
        const conversation = await ensureConversation(widget, {
          clinicId,
          patientWhatsappNumber: waNumber,
        });
        if (conversation) {
          await logWhatsappMessage(widget, {
            conversationId: conversation.id,
            clinicId,
            senderType: "staff",
            senderName: "Clinic",
            content: body,
            metaMessageId: result.messageId,
          });
          await touchConversation(widget, {
            conversationId: conversation.id,
            preview: body,
            senderType: "staff",
          });
        }
      } else {
        console.error("[startTelehealthSessionAction] WhatsApp send failed", {
          clinicId,
          patientId,
          error: result.error,
        });
      }
    } catch (error) {
      if (error instanceof WhatsappNotConnectedError) {
        console.error("[startTelehealthSessionAction] WhatsApp not connected", {
          clinicId,
        });
      } else {
        console.error("[startTelehealthSessionAction] WhatsApp error", {
          clinicId,
          patientId,
          message: error instanceof Error ? error.message : "unknown",
        });
      }
    }
  }

  await logAuditEvent({
    clinicId,
    userId: user.id,
    action: "TELEHEALTH_START",
    resourceType: "telehealth_session",
    resourceId: session.id,
    details: { patientId, roomId, whatsappSent },
  });

  revalidatePath("/app/patients");

  return {
    ok: true,
    data: {
      sessionId: session.id,
      roomId,
      doctorToken,
      doctorName,
      joinUrl,
      whatsappSent,
      hasWhatsappNumber: waNumber.length > 0,
    },
  };
}

/**
 * Close a telehealth room. Idempotent — completing an already-completed session
 * is a no-op so a double "End call" never throws.
 */
export async function endTelehealthSessionAction(
  sessionId: string,
): Promise<ActionResult<{ status: TelehealthStatus }>> {
  if (!uuidSchema.safeParse(sessionId).success) {
    return { ok: false, message: "Missing session id." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to end a call." };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role cannot manage video consultations." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "You need to be signed in to do that." };
  }

  const { data: updated, error } = await supabase
    .from("telehealth_sessions")
    .update({ status: "COMPLETED", ended_at: new Date().toISOString() })
    .eq("clinic_id", access.clinic.id)
    .eq("id", sessionId)
    .select("status")
    .maybeSingle();
  if (error || !updated) {
    console.error("[endTelehealthSessionAction] update failed", {
      sessionId,
      message: error?.message ?? "no row returned",
    });
    return { ok: false, message: "We couldn't end the call. Please try again." };
  }

  await logAuditEvent({
    clinicId: access.clinic.id,
    userId: user.id,
    action: "TELEHEALTH_END",
    resourceType: "telehealth_session",
    resourceId: sessionId,
    details: { status: updated.status },
  });

  revalidatePath("/app/patients");
  return { ok: true, data: { status: updated.status as TelehealthStatus } };
}
