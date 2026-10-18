"use server";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { canManageClinical, getCurrentClinic } from "@/lib/clinic-access";
import {
  MAX_UPLOAD_BYTES,
  UPLOAD_KIND_LABEL,
  readSignatureHeader,
  sanitiseFileName,
  sniffFileSignature,
} from "@/lib/file-signature";
import { createClient } from "@/lib/supabase/server";
import { createWidgetClient } from "@/lib/supabase/widget";
import { patientLinkTokenMatches } from "@/lib/zego/server";
import {
  TELEHEALTH_ATTACHMENTS_BUCKET,
  type TelehealthSenderType,
} from "@/types/database";
import type { ActionResult } from "@/types";

/**
 * In-call chat, both directions, over the one conversation the session owns.
 *
 * A message is persisted BEFORE anything is broadcast, so the transcript is the
 * record of the consultation and a reload on either side loses nothing. Files go
 * to the private `telehealth-attachments` bucket and are read back only through
 * short-lived signed URLs minted here, after the caller has been re-authorised.
 *
 * Two doors into the same table:
 *   - the doctor side, authorised by session (clinic membership + role);
 *   - the patient side, authorised by the room id plus the hash of the patient
 *     KitToken that the original join link carried.
 *
 * Chat is strictly additive: nothing here can end or interrupt a call, and a
 * failure is reported as a chat error the client can retry.
 */

const SESSION_ID_SCHEMA = z.uuid();
const ROOM_ID_SCHEMA = z.string().trim().min(4).max(300);
const TOKEN_SCHEMA = z.string().trim().min(8).max(4096);
const BODY_SCHEMA = z.string().trim().max(4000);
const MAX_BODY_CHARS = 4000;
/** Signed-URL lifetime: long enough to scroll a list, short enough to be safe. */
const ATTACHMENT_URL_TTL_SECONDS = 60 * 60;
const MAX_MESSAGES = 300;

export type TelehealthChatAttachment = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** Short-lived signed URL; null when signing failed (the card still renders). */
  url: string | null;
};

export type TelehealthMessageView = {
  id: string;
  senderType: TelehealthSenderType;
  senderName: string;
  body: string | null;
  attachment: TelehealthChatAttachment | null;
  createdAt: string;
};

export type TelehealthChatPage = {
  messages: TelehealthMessageView[];
  /** The patient's name, so either side can label the conversation. */
  patientName: string | null;
  /** False once the room is closed — the composer disables itself. */
  roomOpen: boolean;
};

type MessageRow = {
  id: string;
  sender_type: TelehealthSenderType;
  sender_name: string;
  body: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
  created_at: string;
};

/**
 * Literal (not a function returning `string`) so the typed Supabase client can
 * still infer the row shape from it in every `.select(...)` call.
 */
const MESSAGE_SELECT =
  "id, sender_type, sender_name, body, attachment_path, attachment_name, attachment_mime, attachment_size, created_at" as const;

/** Doctor-side display name, matching the chain the call-start action uses. */
function clinicianDisplayName(
  doctorName: string | null | undefined,
  metadata: Record<string, unknown> | undefined,
  fallback: string,
): string {
  const metaName = metadata?.name;
  const metaFullName = metadata?.full_name;
  if (doctorName) return doctorName;
  if (typeof metaName === "string" && metaName.trim()) return metaName;
  if (typeof metaFullName === "string" && metaFullName.trim()) return metaFullName;
  return fallback;
}

type PreparedAttachment =
  | { ok: true; bytes: File; mimeType: string; fileName: string; size: number }
  | { ok: false; message: string };

/**
 * Validate an attached file the same way the patient-document path does:
 * content-sniffed type, enforced size, sanitised name. Returns the storage
 * metadata the row needs, or an error message for the client.
 */
async function prepareAttachment(file: File): Promise<PreparedAttachment> {
  if (file.size === 0) {
    return { ok: false, message: "That file is empty." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message: `That file is ${(file.size / 1_048_576).toFixed(1)} MB. The limit is 10 MB.`,
    };
  }
  const sniffed = sniffFileSignature(await readSignatureHeader(file));
  if (!sniffed) {
    return {
      ok: false,
      message: `Only ${UPLOAD_KIND_LABEL} files can be shared in a consultation.`,
    };
  }
  return {
    ok: true,
    bytes: file,
    mimeType: sniffed.mimeType,
    fileName: sanitiseFileName(file.name, sniffed.extension),
    size: file.size,
  };
}

/** Sign attachment paths in one round trip; failures leave `url: null`. */
async function signAttachmentUrls(
  paths: string[],
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  if (paths.length === 0) return signed;
  const widget = createWidgetClient();
  const { data, error } = await widget.storage
    .from(TELEHEALTH_ATTACHMENTS_BUCKET)
    .createSignedUrls(paths, ATTACHMENT_URL_TTL_SECONDS);
  if (error || !data) {
    console.error("[telehealth-chat] signed URL batch failed", {
      count: paths.length,
      message: error?.message ?? "no data",
    });
    return signed;
  }
  for (const entry of data) {
    if (entry.signedUrl && entry.path) signed.set(entry.path, entry.signedUrl);
  }
  return signed;
}

function toView(row: MessageRow, url: string | null): TelehealthMessageView {
  return {
    id: row.id,
    senderType: row.sender_type,
    senderName: row.sender_name,
    body: row.body,
    attachment:
      row.attachment_path &&
      row.attachment_name &&
      row.attachment_mime &&
      row.attachment_size
        ? {
            name: row.attachment_name,
            mimeType: row.attachment_mime,
            sizeBytes: row.attachment_size,
            url,
          }
        : null,
    createdAt: row.created_at,
  };
}

function messageProblem(body: string | null, hasAttachment: boolean): string | null {
  if (!hasAttachment && !body) return "Write a message or attach a file.";
  if (body && body.length > MAX_BODY_CHARS) {
    return `Messages are limited to ${MAX_BODY_CHARS} characters.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Doctor side (authenticated)
// ---------------------------------------------------------------------------

/**
 * Send a message from the clinic side of an open session.
 */
export async function sendTelehealthMessageAction(
  formData: FormData,
): Promise<ActionResult<TelehealthMessageView>> {
  const parsed = z
    .object({ sessionId: SESSION_ID_SCHEMA, body: BODY_SCHEMA.optional() })
    .safeParse({
      sessionId: formData.get("sessionId"),
      body: typeof formData.get("body") === "string" ? formData.get("body") : undefined,
    });
  if (!parsed.success) {
    return { ok: false, message: "Missing consultation id." };
  }
  const { sessionId } = parsed.data;
  const body = parsed.data.body?.trim() ? parsed.data.body.trim() : null;

  const rawFile = formData.get("file");
  const file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null;

  const contentProblem = messageProblem(body, file !== null);
  if (contentProblem) return { ok: false, message: contentProblem };

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to use chat." };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't send consultation messages." };
  }
  const clinicId = access.clinic.id;

  const { data: session } = await supabase
    .from("telehealth_sessions")
    .select("id, clinic_id, patient_id, status, metadata")
    .eq("clinic_id", clinicId)
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) {
    return { ok: false, message: "That consultation is not in this clinic." };
  }
  if (session.status !== "ACTIVE" && session.status !== "SCHEDULED") {
    return {
      ok: false,
      message: "This consultation has ended, so messages can't be sent.",
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
    .select("name")
    .eq("clinic_id", clinicId)
    .eq("user_id", user.id)
    .maybeSingle();

  const senderName = clinicianDisplayName(
    doctor?.name,
    user.user_metadata as Record<string, unknown> | undefined,
    access.clinic.doctor_name || "Clinician",
  );

  let attachment:
    | { path: string; mimeType: string; fileName: string; size: number }
    | null = null;

  if (file) {
    const prepared = await prepareAttachment(file);
    if (!prepared.ok) return { ok: false, message: prepared.message };
    // Segment 1 stays the tenant boundary, matching every other object key.
    const objectKey = `${clinicId}/${session.patient_id}/chat/${randomUUID()}-${prepared.fileName}`;
    // The bucket has no client-facing policy: uploads go through the
    // service-role client AFTER the membership and role checks above.
    const widget = createWidgetClient();
    const { error: uploadError } = await widget.storage
      .from(TELEHEALTH_ATTACHMENTS_BUCKET)
      .upload(objectKey, prepared.bytes, {
        contentType: prepared.mimeType,
        upsert: false,
      });
    if (uploadError) {
      console.error("[sendTelehealthMessageAction] upload failed", {
        clinicId,
        sessionId,
        message: uploadError.message,
      });
      return { ok: false, message: "We couldn't upload that file. Please try again." };
    }
    attachment = {
      path: objectKey,
      mimeType: prepared.mimeType,
      fileName: prepared.fileName,
      size: prepared.size,
    };
  }

  // Insert through the caller's own client so the RLS policy is the backstop.
  const { data: inserted, error: insertError } = await supabase
    .from("telehealth_messages")
    .insert({
      clinic_id: clinicId,
      session_id: session.id,
      patient_id: session.patient_id,
      sender_type: "doctor",
      sender_name: senderName.slice(0, 120),
      body,
      attachment_path: attachment?.path ?? null,
      attachment_name: attachment?.fileName ?? null,
      attachment_mime: attachment?.mimeType ?? null,
      attachment_size: attachment?.size ?? null,
    })
    .select(MESSAGE_SELECT)
    .single();

  if (insertError || !inserted) {
    if (attachment) {
      const widget = createWidgetClient();
      const { error: cleanupError } = await widget.storage
        .from(TELEHEALTH_ATTACHMENTS_BUCKET)
        .remove([attachment.path]);
      if (cleanupError) {
        console.error("[sendTelehealthMessageAction] orphaned object", {
          objectKey: attachment.path,
          message: cleanupError.message,
        });
      }
    }
    console.error("[sendTelehealthMessageAction] insert failed", {
      clinicId,
      sessionId,
      code: insertError?.code,
      message: insertError?.message ?? "no row returned",
    });
    return { ok: false, message: "We couldn't send that message. Please try again." };
  }

  const row = inserted as MessageRow;
  const urls = row.attachment_path
    ? await signAttachmentUrls([row.attachment_path])
    : new Map<string, string>();
  return {
    ok: true,
    data: toView(row, row.attachment_path ? urls.get(row.attachment_path) ?? null : null),
  };
}

/**
 * The session's conversation, oldest first. Signing happens in one batch so a
 * poll does not fan out into one request per attachment.
 */
export async function fetchTelehealthMessagesAction(
  sessionId: string,
): Promise<ActionResult<TelehealthChatPage>> {
  if (!SESSION_ID_SCHEMA.safeParse(sessionId).success) {
    return { ok: false, message: "Missing consultation id." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to use chat." };
  }

  const { data: session } = await supabase
    .from("telehealth_sessions")
    .select("id, status, metadata")
    .eq("clinic_id", access.clinic.id)
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) {
    return { ok: false, message: "That consultation is not in this clinic." };
  }

  const { data, error } = await supabase
    .from("telehealth_messages")
    .select(MESSAGE_SELECT)
    .eq("clinic_id", access.clinic.id)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(MAX_MESSAGES);

  if (error) {
    console.error("[fetchTelehealthMessagesAction] read failed", {
      sessionId,
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: "We couldn't load the conversation." };
  }

  const rows = (data ?? []) as MessageRow[];
  const urls = await signAttachmentUrls(
    rows
      .map((row) => row.attachment_path)
      .filter((path): path is string => typeof path === "string" && path.length > 0),
  );

  const meta = (session.metadata ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    data: {
      messages: rows.map((row) =>
        toView(row, row.attachment_path ? urls.get(row.attachment_path) ?? null : null),
      ),
      patientName:
        typeof meta.patient_name === "string" ? meta.patient_name : null,
      roomOpen: session.status === "ACTIVE" || session.status === "SCHEDULED",
    },
  };
}

/**
 * A fresh signed URL for one attachment, minted on demand. Used by the download
 * and retry paths so a URL that has expired mid-call does not dead-end.
 */
export async function getTelehealthAttachmentUrlAction(
  messageId: string,
): Promise<ActionResult<{ url: string }>> {
  if (!SESSION_ID_SCHEMA.safeParse(messageId).success) {
    return { ok: false, message: "Missing attachment id." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to open attachments." };
  }

  // RLS does the authorisation here: a row from another clinic is simply not
  // returned, so there is no separate membership check to forget.
  const { data: message } = await supabase
    .from("telehealth_messages")
    .select("attachment_path")
    .eq("clinic_id", access.clinic.id)
    .eq("id", messageId)
    .maybeSingle();
  if (!message?.attachment_path) {
    return { ok: false, message: "That attachment is not available." };
  }

  const widget = createWidgetClient();
  const { data, error } = await widget.storage
    .from(TELEHEALTH_ATTACHMENTS_BUCKET)
    .createSignedUrl(message.attachment_path, 300);
  if (error || !data?.signedUrl) {
    return { ok: false, message: "We couldn't prepare that file. Please try again." };
  }
  return { ok: true, data: { url: data.signedUrl } };
}

// ---------------------------------------------------------------------------
// Patient side (zero-app: authorised by room + patient link token)
// ---------------------------------------------------------------------------

type PatientSession = {
  id: string;
  clinic_id: string;
  patient_id: string;
  status: string;
  metadata: Record<string, unknown>;
};

/**
 * Resolve the room the patient is claiming to be in. Both halves must hold: the
 * room must be open, and the presented token must hash to the link hash stored
 * when the doctor started the call. Nothing patient-facing runs without this.
 */
async function resolvePatientSession(
  roomId: string,
  token: string,
): Promise<ActionResult<PatientSession>> {
  const widget = createWidgetClient();
  const { data: session } = await widget
    .from("telehealth_sessions")
    .select("id, clinic_id, patient_id, status, metadata")
    .eq("room_id", roomId)
    .maybeSingle();
  if (!session) {
    return { ok: false, message: "This consultation link is no longer valid." };
  }
  if (session.status !== "SCHEDULED" && session.status !== "ACTIVE") {
    return { ok: false, message: "This consultation has ended." };
  }
  const meta = (session.metadata ?? {}) as Record<string, unknown>;
  if (!patientLinkTokenMatches(meta.patient_token_hash, token)) {
    return {
      ok: false,
      message:
        "This consultation link is no longer valid. Ask your clinic for a new link.",
    };
  }
  return {
    ok: true,
    data: {
      id: session.id,
      clinic_id: session.clinic_id,
      patient_id: session.patient_id,
      status: session.status,
      metadata: meta,
    },
  };
}

/** Send a message from the patient's browser (text, image or document). */
export async function sendPatientTelehealthMessageAction(
  formData: FormData,
): Promise<ActionResult<TelehealthMessageView>> {
  const parsed = z
    .object({
      roomId: ROOM_ID_SCHEMA,
      token: TOKEN_SCHEMA,
      body: BODY_SCHEMA.optional(),
    })
    .safeParse({
      roomId: formData.get("roomId"),
      token: formData.get("token"),
      body: typeof formData.get("body") === "string" ? formData.get("body") : undefined,
    });
  if (!parsed.success) {
    return { ok: false, message: "This consultation link is no longer valid." };
  }
  const body = parsed.data.body?.trim() ? parsed.data.body.trim() : null;

  const rawFile = formData.get("file");
  const file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null;

  const contentProblem = messageProblem(body, file !== null);
  if (contentProblem) return { ok: false, message: contentProblem };

  const resolved = await resolvePatientSession(
    parsed.data.roomId,
    parsed.data.token,
  );
  if (!resolved.ok) return resolved;
  const session = resolved.data;

  let attachment:
    | { path: string; mimeType: string; fileName: string; size: number }
    | null = null;

  if (file) {
    const prepared = await prepareAttachment(file);
    if (!prepared.ok) return { ok: false, message: prepared.message };
    const objectKey = `${session.clinic_id}/${session.patient_id}/chat/${randomUUID()}-${prepared.fileName}`;
    const widget = createWidgetClient();
    const { error: uploadError } = await widget.storage
      .from(TELEHEALTH_ATTACHMENTS_BUCKET)
      .upload(objectKey, prepared.bytes, {
        contentType: prepared.mimeType,
        upsert: false,
      });
    if (uploadError) {
      console.error("[sendPatientTelehealthMessageAction] upload failed", {
        sessionId: session.id,
        message: uploadError.message,
      });
      return { ok: false, message: "We couldn't upload that file. Please try again." };
    }
    attachment = {
      path: objectKey,
      mimeType: prepared.mimeType,
      fileName: prepared.fileName,
      size: prepared.size,
    };
  }

  const patientName =
    typeof session.metadata.patient_name === "string" &&
    session.metadata.patient_name.trim()
      ? session.metadata.patient_name.trim()
      : "Patient";

  const widget = createWidgetClient();
  const { data: inserted, error: insertError } = await widget
    .from("telehealth_messages")
    .insert({
      clinic_id: session.clinic_id,
      session_id: session.id,
      patient_id: session.patient_id,
      sender_type: "patient",
      sender_name: patientName.slice(0, 120),
      body,
      attachment_path: attachment?.path ?? null,
      attachment_name: attachment?.fileName ?? null,
      attachment_mime: attachment?.mimeType ?? null,
      attachment_size: attachment?.size ?? null,
    })
    .select(MESSAGE_SELECT)
    .single();

  if (insertError || !inserted) {
    if (attachment) {
      const { error: cleanupError } = await widget.storage
        .from(TELEHEALTH_ATTACHMENTS_BUCKET)
        .remove([attachment.path]);
      if (cleanupError) {
        console.error("[sendPatientTelehealthMessageAction] orphaned object", {
          objectKey: attachment.path,
          message: cleanupError.message,
        });
      }
    }
    console.error("[sendPatientTelehealthMessageAction] insert failed", {
      sessionId: session.id,
      code: insertError?.code,
      message: insertError?.message ?? "no row returned",
    });
    return { ok: false, message: "We couldn't send that message. Please try again." };
  }

  const row = inserted as MessageRow;
  const urls = row.attachment_path
    ? await signAttachmentUrls([row.attachment_path])
    : new Map<string, string>();
  return {
    ok: true,
    data: toView(row, row.attachment_path ? urls.get(row.attachment_path) ?? null : null),
  };
}

/** The patient's view of the same conversation. */
export async function fetchPatientTelehealthMessagesAction(
  roomId: string,
  token: string,
): Promise<ActionResult<TelehealthChatPage>> {
  const parsed = z
    .object({ roomId: ROOM_ID_SCHEMA, token: TOKEN_SCHEMA })
    .safeParse({ roomId, token });
  if (!parsed.success) {
    return { ok: false, message: "This consultation link is no longer valid." };
  }

  const resolved = await resolvePatientSession(
    parsed.data.roomId,
    parsed.data.token,
  );
  if (!resolved.ok) return resolved;
  const session = resolved.data;

  const widget = createWidgetClient();
  const { data, error } = await widget
    .from("telehealth_messages")
    .select(MESSAGE_SELECT)
    .eq("session_id", session.id)
    .order("created_at", { ascending: true })
    .limit(MAX_MESSAGES);
  if (error) {
    console.error("[fetchPatientTelehealthMessagesAction] read failed", {
      sessionId: session.id,
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: "We couldn't load the conversation." };
  }

  const rows = (data ?? []) as MessageRow[];
  const urls = await signAttachmentUrls(
    rows
      .map((row) => row.attachment_path)
      .filter((path): path is string => typeof path === "string" && path.length > 0),
  );

  return {
    ok: true,
    data: {
      messages: rows.map((row) =>
        toView(row, row.attachment_path ? urls.get(row.attachment_path) ?? null : null),
      ),
      patientName:
        typeof session.metadata.patient_name === "string"
          ? session.metadata.patient_name
          : null,
      roomOpen: session.status === "ACTIVE" || session.status === "SCHEDULED",
    },
  };
}

/** Fresh signed URL for one attachment, for the patient's download/retry. */
export async function getPatientTelehealthAttachmentUrlAction(
  roomId: string,
  token: string,
  messageId: string,
): Promise<ActionResult<{ url: string }>> {
  const parsed = z
    .object({
      roomId: ROOM_ID_SCHEMA,
      token: TOKEN_SCHEMA,
      messageId: SESSION_ID_SCHEMA,
    })
    .safeParse({ roomId, token, messageId });
  if (!parsed.success) {
    return { ok: false, message: "This consultation link is no longer valid." };
  }

  const resolved = await resolvePatientSession(
    parsed.data.roomId,
    parsed.data.token,
  );
  if (!resolved.ok) return resolved;
  const session = resolved.data;

  const widget = createWidgetClient();
  const { data: message } = await widget
    .from("telehealth_messages")
    .select("attachment_path")
    .eq("session_id", session.id)
    .eq("id", parsed.data.messageId)
    .maybeSingle();
  if (!message?.attachment_path) {
    return { ok: false, message: "That attachment is not available." };
  }

  const { data, error } = await widget.storage
    .from(TELEHEALTH_ATTACHMENTS_BUCKET)
    .createSignedUrl(message.attachment_path, 300);
  if (error || !data?.signedUrl) {
    return { ok: false, message: "We couldn't prepare that file. Please try again." };
  }
  return { ok: true, data: { url: data.signedUrl } };
}
