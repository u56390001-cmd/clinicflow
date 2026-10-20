"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getBaseUrl } from "@/lib/booking-url";
import { logAuditEvent } from "@/lib/auth/role-guard";
import { canManageClinical, getCurrentClinic } from "@/lib/clinic-access";
import { APP_ROUTES } from "@/lib/constants";
import { saveDermPhotoAction } from "@/lib/actions/specialty-workspaces";
import { createClient } from "@/lib/supabase/server";
import { createWidgetClient } from "@/lib/supabase/widget";
import {
  buildTelehealthRoomId,
  generateKitToken,
  resolveZegoConfigForClinic,
  hashPatientLinkToken,
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
import {
  PATIENT_DOCUMENT_MAX_BYTES,
  PATIENT_DOCUMENTS_BUCKET,
  type TelehealthStatus,
} from "@/types/database";
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
  /** The ZEGO app the room runs on — not a secret (it rides inside the token). */
  zegoAppId: number;
  /** The publisher identity baked into the token, used as the stream id. */
  zegoUserId: string;
  joinUrl: string;
  whatsappSent: boolean;
  hasWhatsappNumber: boolean;
};

/**
 * Encounter context for the call, so the room lands on the same visit (and
 * appointment) the clinician is already working in. Optional: a call with no
 * open encounter is still perfectly valid.
 */
export type StartTelehealthOptions = {
  visitId?: string | null;
  appointmentId?: string | null;
};

/**
 * Phase 8 — start (or resume) a telehealth video room for a patient.
 *
 * The KitToken is minted here so `ZEGO_SERVER_SECRET` never reaches the
 * browser. The patient's join URL carries a separate, single-purpose token
 * scoped to the same room. Delivery prefers WhatsApp; when the clinic isn't
 * connected or the patient has no number, the caller still gets `joinUrl` so the
 * link can be copied by hand.
 *
 * Only a SHA-256 hash of the patient token is persisted (`metadata
 * .patient_token_hash`), never the token itself — see `hashPatientLinkToken`.
 */
export async function startTelehealthSessionAction(
  patientId: string,
  options?: StartTelehealthOptions,
): Promise<ActionResult<StartTelehealthResult>> {
  if (!uuidSchema.safeParse(patientId).success) {
    return { ok: false, message: "Missing patient id." };
  }
  if (options?.visitId && !uuidSchema.safeParse(options.visitId).success) {
    return { ok: false, message: "Missing encounter id." };
  }
  if (
    options?.appointmentId &&
    !uuidSchema.safeParse(options.appointmentId).success
  ) {
    return { ok: false, message: "Missing appointment id." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to start a call." };
  }
  if (!canManageClinical(access.role)) {
    return {
      ok: false,
      message: "Your role cannot start video consultations.",
    };
  }
  const clinicId = access.clinic.id;

  // Per-clinic ZEGO project when connected, otherwise the platform env pair.
  const { config, source } = await resolveZegoConfigForClinic(clinicId);
  if (!config) {
    return {
      ok: false,
      message:
        "Video calling isn't configured for this clinic yet. Connect a ZEGOcloud App ID under Telehealth settings.",
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

  // Encounter linkage: prefer an appointment passed in explicitly, otherwise
  // inherit it from the visit the clinician is working in. Either may be null.
  let appointmentId = options?.appointmentId ?? null;
  if (!appointmentId && options?.visitId) {
    const { data: visit } = await supabase
      .from("visits")
      .select("appointment_id")
      .eq("clinic_id", clinicId)
      .eq("id", options.visitId)
      .maybeSingle();
    appointmentId = visit?.appointment_id ?? null;
  }

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
      visit_id: options?.visitId ?? null,
      appointment_id: appointmentId,
      room_id: roomId,
      status: "ACTIVE",
      started_at: new Date().toISOString(),
      patient_join_url: joinUrl,
      created_by: user.id,
      metadata: {
        patient_name: patientName,
        doctor_name: doctorName,
        token_ttl_seconds: TOKEN_TTL_SECONDS,
        // Lets the patient side prove it holds this link's token (0105).
        patient_token_hash: hashPatientLinkToken(patientToken),
        // Token04 carries no identity on the wire, so the join page sources
        // the app id and the room identity the token was minted for from
        // here (both public — the app id is not a secret, the user id is
        // just the room-scoped publisher identity baked into the token).
        zego_app_id: config.appId,
        zego_user_id: `patient_${patientId}`,
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
    return {
      ok: false,
      message: "We couldn't start the call. Please try again.",
    };
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
    details: { patientId, roomId, whatsappSent, visitId: options?.visitId ?? null, appointmentId, zegoCredentials: source },
  });

  revalidatePath("/app/patients");

  return {
    ok: true,
    data: {
      sessionId: session.id,
      roomId,
      doctorToken,
      doctorName,
      zegoAppId: config.appId,
      zegoUserId: user.id,
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
    return {
      ok: false,
      message: "Your role cannot manage video consultations.",
    };
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
    return {
      ok: false,
      message: "We couldn't end the call. Please try again.",
    };
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

/**
 * Re-mint a doctor KitToken for a session that is still open, so a refreshed
 * browser (or a dropped connection) can rejoin the same room.
 *
 * Tokens are deliberately never persisted — the workspace keeps its own in
 * memory only — so resuming has to ask the server for a fresh one instead of
 * replaying a stored token. Ownership, clinic scope and the room's open/closed
 * state are all re-checked here; a completed room is refused outright.
 */
export async function resumeTelehealthSessionAction(
  sessionId: string,
): Promise<ActionResult<StartTelehealthResult>> {
  if (!uuidSchema.safeParse(sessionId).success) {
    return { ok: false, message: "Missing session id." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to rejoin a call." };
  }
  if (!canManageClinical(access.role)) {
    return {
      ok: false,
      message: "Your role cannot rejoin video consultations.",
    };
  }
  const clinicId = access.clinic.id;

  const { config } = await resolveZegoConfigForClinic(clinicId);
  if (!config) {
    return {
      ok: false,
      message:
        "Video calling isn't configured for this clinic yet. Connect a ZEGOcloud App ID under Telehealth settings.",
    };
  }

  const { data: session } = await supabase
    .from("telehealth_sessions")
    .select("id, room_id, status, patient_join_url")
    .eq("clinic_id", clinicId)
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) {
    return { ok: false, message: "That consultation is not in this clinic." };
  }
  if (session.status === "COMPLETED" || session.status === "CANCELLED") {
    return {
      ok: false,
      message: "This consultation has ended. Start a new call instead.",
    };
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

  const doctorToken = generateKitToken(config, {
    roomId: session.room_id,
    userId: user.id,
    userName: doctorName,
    expiresInSeconds: TOKEN_TTL_SECONDS,
  });

  if (session.status !== "ACTIVE") {
    await supabase
      .from("telehealth_sessions")
      .update({ status: "ACTIVE" })
      .eq("clinic_id", clinicId)
      .eq("id", session.id);
  }

  await logAuditEvent({
    clinicId,
    userId: user.id,
    action: "TELEHEALTH_RESUME",
    resourceType: "telehealth_session",
    resourceId: session.id,
    details: { roomId: session.room_id },
  });

  return {
    ok: true,
    data: {
      sessionId: session.id,
      roomId: session.room_id,
      doctorToken,
      doctorName,
      zegoAppId: config.appId,
      zegoUserId: user.id,
      joinUrl: session.patient_join_url,
      whatsappSent: false,
      hasWhatsappNumber: false,
    },
  };
}

const captureSchema = z.object({
  patientId: z.uuid(),
  bodyRegion: z.string().trim().max(80).optional(),
  photoType: z.enum(["baseline", "follow_up", "post_treatment"]).optional(),
  lesionNotes: z.string().trim().max(500).optional(),
  visitId: z.uuid().optional(),
  tagDermPhoto: z.enum(["true", "false"]).optional(),
  documentName: z.string().trim().max(255).optional(),
});

/** The three image types a captured frame could sniff as; PNG is ours. */
const CAPTURE_MAGIC = [
  {
    mimeType: "image/png",
    extension: "png",
    prefix: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  { mimeType: "image/jpeg", extension: "jpg", prefix: [0xff, 0xd8, 0xff] },
  {
    mimeType: "image/webp",
    extension: "webp",
    prefix: [0x52, 0x49, 0x46, 0x46],
  },
] as const;

function sniffCapturedImage(header: Uint8Array) {
  for (const candidate of CAPTURE_MAGIC) {
    if (header.length < candidate.prefix.length) continue;
    if (candidate.prefix.every((byte, index) => header[index] === byte)) {
      return candidate;
    }
  }
  return null;
}

export type CaptureFrameResult = {
  documentId: string;
  photoTagged: boolean;
  /** Present when the document saved but the derm photo tag did not. */
  photoMessage?: string;
};

/**
 * Save a frame the clinician captured from the live call. The frame is already
 * a PNG the browser composed from the video stream, so this follows the same
 * document rules as `uploadPatientDocumentAction`: sniff the bytes, enforce the
 * size ceiling, and write under the clinic/patient storage prefix.
 *
 * When the record is a dermatology one the clinician can ask for the frame to
 * be tagged as a derm photo in the same call, which reuses the existing
 * `saveDermPhotoAction` — including its encounter (`visit_id`) stamping. A tag
 * failure never loses the document; the caller is told what to do instead.
 */
export async function captureTelehealthFrameAction(
  formData: FormData,
): Promise<ActionResult<CaptureFrameResult>> {
  const parsed = captureSchema.safeParse({
    patientId: formData.get("patientId"),
    bodyRegion: formData.get("bodyRegion") ?? undefined,
    photoType: formData.get("photoType") ?? undefined,
    lesionNotes: formData.get("lesionNotes") ?? undefined,
    visitId: formData.get("visitId") ?? undefined,
    tagDermPhoto: formData.get("tagDermPhoto") ?? undefined,
    documentName: formData.get("documentName") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: "Missing patient id." };
  }
  const {
    patientId,
    bodyRegion,
    photoType,
    lesionNotes,
    visitId,
    tagDermPhoto,
    documentName,
  } = parsed.data;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "The captured frame was empty." };
  }
  if (file.size > PATIENT_DOCUMENT_MAX_BYTES) {
    return {
      ok: false,
      message: `That frame is ${(file.size / 1_048_576).toFixed(1)} MB. The limit is 10 MB.`,
    };
  }

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const sniffed = sniffCapturedImage(header);
  if (!sniffed) {
    return {
      ok: false,
      message: "Only PNG, JPEG and WebP images can be saved as a frame.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to save frames." };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't save consultation frames." };
  }
  const clinicId = access.clinic.id;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "You need to be signed in to save frames." };
  }

  const { data: patient } = await supabase
    .from("patients")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("id", patientId)
    .maybeSingle();
  if (!patient) {
    return { ok: false, message: "That patient is not in this clinic." };
  }

  const stampedName =
    (documentName || "").trim() ||
    `Telehealth frame ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  const objectKey = `${clinicId}/${patientId}/${randomUUID()}-frame.${sniffed.extension}`;

  const { error: uploadError } = await supabase.storage
    .from(PATIENT_DOCUMENTS_BUCKET)
    .upload(objectKey, file, { contentType: sniffed.mimeType, upsert: false });
  if (uploadError) {
    console.error("[captureTelehealthFrameAction] storage upload failed", {
      clinicId,
      patientId,
      message: uploadError.message,
    });
    return {
      ok: false,
      message: "We couldn't save this frame. Please try again.",
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("patient_documents")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      document_name: stampedName.slice(0, 255),
      file_path: objectKey,
      mime_type: sniffed.mimeType,
      size_bytes: file.size,
      uploaded_by_user_id: user.id,
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    const { error: cleanupError } = await supabase.storage
      .from(PATIENT_DOCUMENTS_BUCKET)
      .remove([objectKey]);
    if (cleanupError) {
      console.error("[captureTelehealthFrameAction] orphaned object", {
        objectKey,
        message: cleanupError.message,
      });
    }
    console.error("[captureTelehealthFrameAction] metadata insert failed", {
      clinicId,
      patientId,
      code: insertError?.code,
      message: insertError?.message ?? "no row returned",
    });
    return {
      ok: false,
      message: "We couldn't save this frame. Please try again.",
    };
  }

  let photoTagged = false;
  let photoMessage: string | undefined;
  if (tagDermPhoto === "true") {
    if (!bodyRegion) {
      photoMessage =
        "Saved to documents. Add a body region to tag it as a derm photo.";
    } else {
      const tagged = await saveDermPhotoAction(
        patientId,
        {
          document_id: inserted.id,
          body_region: bodyRegion,
          photo_type: photoType ?? "baseline",
          lesion_notes: lesionNotes ?? null,
          paired_with: null,
          lesion_id: null,
          taken_at: new Date().toISOString().slice(0, 10),
        },
        visitId ?? null,
      );
      if (tagged.ok) {
        photoTagged = true;
      } else {
        photoMessage = `Saved to documents. ${tagged.message}`;
      }
    }
  }

  await logAuditEvent({
    clinicId,
    userId: user.id,
    action: "TELEHEALTH_FRAME_CAPTURE",
    resourceType: "patient_document",
    resourceId: inserted.id,
    details: { patientId, photoTagged },
  });

  revalidatePath(APP_ROUTES.app.patients);

  return {
    ok: true,
    data: { documentId: inserted.id, photoTagged, photoMessage },
  };
}
