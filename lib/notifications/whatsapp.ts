import { z } from "zod";

import type { NotifyInput, NotifyResult } from "@/lib/notifications/types";
import {
  getClinicWhatsappCredentials,
  sendWhatsappText,
  WhatsappNotConnectedError,
  type WhatsappCredentials,
} from "@/lib/whatsapp/client";
import { ensureConversation, logWhatsappMessage } from "@/lib/whatsapp/conversation";
import { createWidgetClient } from "@/lib/supabase/widget";

/**
 * The `whatsapp` channel (Phase 13): plain-text delivery over the shared Meta
 * Cloud API client (`lib/whatsapp/client.ts` — THE single sending path).
 *
 * Scope: patient-facing appointment notifications only. Clinic-facing types
 * (`new_appointment_notification`, billing, team invites) stay on email.
 *
 * Payload schemas mirror the email channel's fields exactly so call sites can
 * pass the same data to either channel without reshaping. Reminders are sent
 * by the cron endpoint (`/api/cron/appointment-reminders`).
 *
 * Known limitation (documented in PRD §4.4): free-form sends require an open
 * 24-hour customer-service window with the patient. When Meta rejects a send
 * outside that window the failure is returned/logged gracefully — approved
 * template messages are a future work item.
 */

const nonEmpty = (max: number) => z.string().trim().min(1).max(max);

const dateField = nonEmpty(60);
const nameField = nonEmpty(200);
const serviceField = nonEmpty(200);

const confirmationPayload = z.object({
  recipientRole: z.enum(["patient", "doctor", "clinic"]).optional().default("patient"),
  patientName: nameField,
  date: dateField,
  time: dateField,
  service: serviceField,
  clinicName: nameField,
  doctorName: nameField.optional(),
  appointmentType: z.enum(["CLINIC_VISIT", "ONLINE_VIDEO"]).optional(),
  chiefComplaint: z.string().max(1000).optional(),
  phone: z.string().max(40).optional(),
});

const cancellationPayload = z.object({
  recipientRole: z.enum(["patient", "doctor", "clinic"]).default("patient"),
  patientName: nameField,
  clinicName: nameField,
  date: dateField,
  time: dateField,
  service: serviceField,
  doctorName: nameField.optional(),
  appointmentType: z.enum(["CLINIC_VISIT", "ONLINE_VIDEO"]).optional(),
  reason: z.string().max(1000).optional(),
});

const reschedulePayload = z.object({
  recipientRole: z.enum(["patient", "doctor", "clinic"]).default("patient"),
  patientName: nameField,
  clinicName: nameField,
  oldDate: dateField,
  oldTime: dateField,
  newDate: dateField,
  newTime: dateField,
  service: serviceField,
  doctorName: nameField.optional(),
  appointmentType: z.enum(["CLINIC_VISIT", "ONLINE_VIDEO"]).optional(),
});

const reminderPayload = z.object({
  patientName: nameField,
  date: dateField,
  time: dateField,
  service: serviceField,
  clinicName: nameField,
  doctorName: nameField.optional(),
  appointmentType: z.enum(["CLINIC_VISIT", "ONLINE_VIDEO"]).optional(),
  /**
   * Clinic-authored reminder copy from the Engagement page
   * (engagement_templates.appointment_reminder). When present it replaces the
   * hardcoded reminder text and gets the same variable interpolation.
   */
  template: z.string().trim().max(2000).optional(),
  location: nonEmpty(2048).optional(),
});

/**
 * Phase 22 follow-up: the clinic's configured after-booking questions, sent
 * once the appointment is confirmed. `questions` carries each row's id so the
 * receptionist can map the patient's replies onto `pre_consultation_answers`
 * deterministically (no LLM involved).
 */
const preConsultationFollowupPayload = z.object({
  patientName: nameField,
  clinicName: nameField,
  questions: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(40),
        text: z.string().trim().min(1).max(100),
      }),
    )
    .min(1, "At least one question is required.")
    .max(3, "At most 3 questions."),
});

/** Render the plain-text WhatsApp body for a validated payload. */
function renderBody(
  type: NotifyInput["type"],
  payload: Record<string, unknown>,
): string | null {
  switch (type) {
    case "appointment_confirmation": {
      const p = confirmationPayload.parse(payload);
      if (p.recipientRole === "doctor" || p.recipientRole === "clinic") {
        const typeLabel =
          p.appointmentType === "ONLINE_VIDEO"
            ? "Online Video Consultation"
            : "In-Clinic Visit";
        return [
          `🩺 New Appointment Booked at ${p.clinicName}`,
          `Doctor: Dr. ${p.doctorName ?? "Doctor"}`,
          `Patient: ${p.patientName}${p.phone ? ` (${p.phone})` : ""}`,
          `Type: ${typeLabel}`,
          `Service: ${p.service} — ${p.date} at ${p.time}`,
          p.chiefComplaint ? `Chief Complaint: ${p.chiefComplaint}` : null,
          p.appointmentType === "ONLINE_VIDEO"
            ? "Note: Please prepare and share the consultation video link with the patient prior to the appointment."
            : null,
        ]
          .filter(Boolean)
          .join("\n");
      }

      const isOnline = p.appointmentType === "ONLINE_VIDEO";
      return [
        `Hello ${p.patientName}, your appointment at ${p.clinicName} is confirmed.`,
        `${p.service} — ${p.date} at ${p.time}.`,
        isOnline
          ? "Your online video consultation is confirmed. The doctor will share your video call link prior to the appointment."
          : "Reply here if you need to change it.",
      ].join("\n");
    }
    case "appointment_cancellation": {
      const p = cancellationPayload.parse(payload);
      if (p.recipientRole === "doctor" || p.recipientRole === "clinic") {
        const typeLabel =
          p.appointmentType === "ONLINE_VIDEO"
            ? "Online Video Consultation"
            : "In-Clinic Visit";
        return [
          `⚠️ Appointment Cancelled at ${p.clinicName}`,
          `Doctor: Dr. ${p.doctorName ?? "Doctor"}`,
          `Patient: ${p.patientName}`,
          `Type: ${typeLabel}`,
          `Schedule: ${p.service} (${p.date} at ${p.time}) has been cancelled.`,
          p.reason ? `Reason: ${p.reason}` : null,
        ]
          .filter(Boolean)
          .join("\n");
      }
      return [
        `Hello ${p.patientName}, your ${p.service} at ${p.clinicName} (${p.date} at ${p.time}) has been cancelled.`,
        "Reply here if you would like to book another time.",
      ].join("\n");
    }
    case "appointment_reschedule": {
      const p = reschedulePayload.parse(payload);
      if (p.recipientRole === "doctor" || p.recipientRole === "clinic") {
        const typeLabel =
          p.appointmentType === "ONLINE_VIDEO"
            ? "Online Video Consultation"
            : "In-Clinic Visit";
        return [
          `📅 Appointment Rescheduled at ${p.clinicName}`,
          `Doctor: Dr. ${p.doctorName ?? "Doctor"}`,
          `Patient: ${p.patientName}`,
          `Type: ${typeLabel}`,
          `Service: ${p.service}`,
          `New Time: ${p.newDate} at ${p.newTime} (was ${p.oldDate} at ${p.oldTime}).`,
        ].join("\n");
      }
      const isOnline = p.appointmentType === "ONLINE_VIDEO";
      return [
        `Hello ${p.patientName}, your ${p.service} at ${p.clinicName} was moved.`,
        `New time: ${p.newDate} at ${p.newTime} (was ${p.oldDate} at ${p.oldTime}).`,
        isOnline
          ? "Your online video consultation is confirmed for the new time. The doctor will share your video call link prior to the appointment."
          : "Reply here if this no longer works for you.",
      ].join("\n");
    }
    case "appointment_reminder": {
      const p = reminderPayload.parse(payload);
      if (p.template) {
        return interpolateReminderTemplate(p);
      }
      const isOnline = p.appointmentType === "ONLINE_VIDEO";
      return [
        `Hi ${p.patientName}! A friendly reminder about your upcoming appointment at ${p.clinicName}:`,
        `${p.service} — ${p.date} at ${p.time}.`,
        isOnline
          ? "This is an Online Video Consultation. The doctor will share your video call link prior to the appointment."
          : "Reply CONFIRM to let us know you're coming, or reply here if you need to reschedule.",
      ].join("\n");
    }
    case "pre_consultation_followup": {
      const p = preConsultationFollowupPayload.parse(payload);
      return [
        `Hello ${p.patientName}, thank you for booking at ${p.clinicName}!`,
        "Please reply with your answers to these quick questions:",
        ...p.questions.map((q, index) => `${index + 1}. ${q.text}`),
        "Send your answer to question 1 first, then each next answer as its own message.",
      ].join("\n");
    }
    default:
      return null;
  }
}

function interpolateReminderTemplate(p: z.infer<typeof reminderPayload>): string {
  const location = p.location?.trim() ? p.location.trim() : p.clinicName;
  return p.template!
    .replace(/\{patient_name\}/g, p.patientName)
    .replace(/\{doctor_name\}/g, p.doctorName ?? "")
    .replace(/\{clinic_name\}/g, p.clinicName)
    .replace(/\{appointment_date\}/g, p.date)
    .replace(/\{appointment_time\}/g, p.time)
    .replace(/\{service\}/g, p.service)
    .replace(/\{slot_name\}/g, p.service)
    .replace(/\{clinic_location\}/g, location);
}

const PATIENT_FACING_TYPES: ReadonlySet<NotifyInput["type"]> = new Set([
  "appointment_confirmation",
  "appointment_cancellation",
  "appointment_reschedule",
  "appointment_reminder",
  "pre_consultation_followup",
]);

async function resolveRecipientNumber(
  input: NotifyInput,
): Promise<string | null> {
  const raw =
    input.to ??
    (input.patientId
      ? await fetchPatientWhatsappNumber(input.clinicId, input.patientId)
      : null);
  if (!raw) return null;
  // wa_id format: digits only (country code included), e.g. "15551234567".
  const normalized = raw.replace(/[^\d]/g, "");
  return normalized.length >= 8 && normalized.length <= 15 ? normalized : null;
}

async function fetchPatientWhatsappNumber(
  clinicId: string,
  patientId: string,
): Promise<string | null> {
  try {
    const { data } = await createWidgetClient()
      .from("patients")
      .select("whatsapp_number")
      .eq("clinic_id", clinicId)
      .eq("id", patientId)
      .maybeSingle();
    return data?.whatsapp_number ?? null;
  } catch {
    return null;
  }
}

export async function sendViaWhatsapp(
  input: NotifyInput,
): Promise<NotifyResult> {
  if (!PATIENT_FACING_TYPES.has(input.type)) {
    return {
      success: false,
      error: `"${input.type}" is not supported on the WhatsApp channel.`,
    };
  }

  const body = (() => {
    try {
      return renderBody(input.type, input.payload);
    } catch {
      return null;
    }
  })();
  if (!body) {
    return { success: false, error: "Invalid or empty WhatsApp payload." };
  }

  const to = await resolveRecipientNumber(input);
  if (!to) {
    return {
      success: false,
      error: "No usable WhatsApp number for the recipient.",
    };
  }

  let credentials: WhatsappCredentials;
  try {
    credentials = await getClinicWhatsappCredentials(input.clinicId);
  } catch (error) {
    if (error instanceof WhatsappNotConnectedError) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  const result = await sendWhatsappText(credentials, to, body);
  if (!result.ok) {
    console.error("[notifications] whatsapp send failed", {
      clinicId: input.clinicId,
      type: input.type,
      error: result.error,
    });
    return { success: false, error: result.error };
  }

  // Best-effort: mirror the reminder/notification into the thread log so the
  // Phase 14 inbox shows the full conversation history. Never fails the send.
  try {
    const supabase = createWidgetClient();
    const conversation = await ensureConversation(supabase, {
      clinicId: input.clinicId,
      patientWhatsappNumber: to,
    });
    if (conversation) {
      await logWhatsappMessage(supabase, {
        conversationId: conversation.id,
        clinicId: input.clinicId,
        senderType: "ai",
        content: body,
      });
    }
  } catch (error) {
    console.warn("[notifications] thread mirroring skipped", error);
  }

  return { success: true };
}

// ── WhatsApp Message Template Payload Generators ────────────────────────────

export interface BookingConfirmationPayloadOptions {
  recipientRole?: "patient" | "doctor" | "clinic";
  patientName: string;
  clinicName: string;
  service: string;
  date: string;
  time: string;
  doctorName?: string;
  appointmentType?: "CLINIC_VISIT" | "ONLINE_VIDEO";
  chiefComplaint?: string;
  phone?: string;
}

export function generateBookingConfirmationPayload(
  options: BookingConfirmationPayloadOptions,
): Record<string, unknown> {
  return {
    recipientRole: options.recipientRole ?? "patient",
    patientName: options.patientName,
    clinicName: options.clinicName,
    service: options.service,
    date: options.date,
    time: options.time,
    doctorName: options.doctorName,
    appointmentType: options.appointmentType ?? "CLINIC_VISIT",
    chiefComplaint: options.chiefComplaint,
    phone: options.phone,
  };
}

export interface CancellationPayloadOptions {
  recipientRole?: "patient" | "doctor" | "clinic";
  patientName: string;
  clinicName: string;
  service: string;
  date: string;
  time: string;
  doctorName?: string;
  appointmentType?: "CLINIC_VISIT" | "ONLINE_VIDEO";
  reason?: string;
}

export function generateCancellationPayload(
  options: CancellationPayloadOptions,
): Record<string, unknown> {
  return {
    recipientRole: options.recipientRole ?? "patient",
    patientName: options.patientName,
    clinicName: options.clinicName,
    service: options.service,
    date: options.date,
    time: options.time,
    doctorName: options.doctorName,
    appointmentType: options.appointmentType ?? "CLINIC_VISIT",
    reason: options.reason,
  };
}

export interface ReschedulePayloadOptions {
  recipientRole?: "patient" | "doctor" | "clinic";
  patientName: string;
  clinicName: string;
  service: string;
  oldDate: string;
  oldTime: string;
  newDate: string;
  newTime: string;
  doctorName?: string;
  appointmentType?: "CLINIC_VISIT" | "ONLINE_VIDEO";
}

export function generateReschedulePayload(
  options: ReschedulePayloadOptions,
): Record<string, unknown> {
  return {
    recipientRole: options.recipientRole ?? "patient",
    patientName: options.patientName,
    clinicName: options.clinicName,
    service: options.service,
    oldDate: options.oldDate,
    oldTime: options.oldTime,
    newDate: options.newDate,
    newTime: options.newTime,
    doctorName: options.doctorName,
    appointmentType: options.appointmentType ?? "CLINIC_VISIT",
  };
}

