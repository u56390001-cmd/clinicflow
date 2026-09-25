import { z } from "zod";

import {
  sendAppointmentCancellation,
  sendAppointmentConfirmation,
  sendAppointmentNotification,
  sendAppointmentReschedule,
  sendBillingApprovedEmail,
  sendBillingExpiring,
  sendBillingRejectedEmail,
  sendBillingSubmittedEmail,
  sendTeamInviteEmail,
} from "@/lib/email/send";
import type { NotifyInput, NotifyResult } from "@/lib/notifications/types";

/**
 * The `email` channel: a 1:1 wrapper over the existing Phase 3/4/8 Resend
 * senders in `lib/email/send.ts`. Templates, trigger conditions, recipients
 * and failure logging are untouched — this module only re-shapes the call
 * (senders return `{ ok }`; the dispatcher contract is `{ success }`).
 *
 * Each payload schema below mirrors the corresponding template/adapter
 * parameter type EXACTLY; anything else is rejected before a send is
 * attempted, so invalid payloads fail loudly instead of silently changing
 * what an email looks like.
 */

const nonEmpty = (max: number) => z.string().trim().min(1).max(max);

/* Appointment types — recipient required (`to`, or resolvable via patientId). */

const appointmentConfirmationPayload = z.object({
  patientName: nonEmpty(200),
  date: nonEmpty(60),
  time: nonEmpty(60),
  service: nonEmpty(200),
  clinicName: nonEmpty(200),
  dashboardUrl: z.string().url(),
});

const appointmentNotificationPayload = z.object({
  clinicName: nonEmpty(200),
  patientName: nonEmpty(200),
  date: nonEmpty(60),
  time: nonEmpty(60),
  service: nonEmpty(200),
  dashboardUrl: z.string().url(),
});

const recipientRole = z.enum(["patient", "clinic"]);

const appointmentCancellationPayload = z.object({
  recipientName: nonEmpty(200),
  recipientRole,
  patientName: nonEmpty(200),
  clinicName: nonEmpty(200),
  date: nonEmpty(60),
  time: nonEmpty(60),
  service: nonEmpty(200),
  reason: z.string().max(1000),
  dashboardUrl: z.string().url(),
});

const appointmentReschedulePayload = z.object({
  recipientName: nonEmpty(200),
  recipientRole,
  patientName: nonEmpty(200),
  clinicName: nonEmpty(200),
  oldDate: nonEmpty(60),
  oldTime: nonEmpty(60),
  newDate: nonEmpty(60),
  newTime: nonEmpty(60),
  service: nonEmpty(200),
  dashboardUrl: z.string().url(),
});

/* Billing types — these reuse the existing adapter functions, which resolve
   the clinic's email from `clinicId` themselves. Payload = adapter inputs. */

const billingSubmittedPayload = z.object({
  clinicId: z.string().uuid(),
  clinicName: nonEmpty(200),
  submissionId: z.string().uuid(),
  amount: z.number(),
});

const billingApprovedPayload = z.object({
  clinicId: z.string().uuid(),
  submissionId: z.string().uuid(),
  amount: z.number(),
});

const billingRejectedPayload = z.object({
  clinicId: z.string().uuid(),
  submissionId: z.string().uuid(),
  reason: nonEmpty(500),
});

const billingExpiringPayload = z.object({
  clinicId: z.string().uuid(),
  planName: nonEmpty(120),
  expiryDate: nonEmpty(60),
});

/* Team invite — mirrors `sendTeamInviteEmail` params. */

const teamInvitePayload = z.object({
  clinicId: z.string().uuid().nullish(),
  clinicName: nonEmpty(200),
  inviterName: nonEmpty(254),
  role: nonEmpty(40),
  acceptUrl: z.string().url(),
});

/** The underlying senders' shape (`SendEmailResult`, not exported). */
type SenderResult = { ok: boolean; error?: string };

function toNotifyResult(result: SenderResult): NotifyResult {
  return result.ok
    ? { success: true }
    : { success: false, error: result.error };
}

async function resolveRecipientEmail(
  input: NotifyInput,
): Promise<string | null> {
  if (input.to) return input.to;
  if (!input.patientId) return null;
  try {
    const { createWidgetClient } = await import("@/lib/supabase/widget");
    const { data } = await createWidgetClient()
      .from("patients")
      .select("email")
      .eq("clinic_id", input.clinicId)
      .eq("id", input.patientId)
      .maybeSingle();
    return data?.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Dispatch one notification over email. Success/failure semantics are
 * identical to the pre-dispatcher senders.
 */
export async function sendViaEmail(input: NotifyInput): Promise<NotifyResult> {
  const payload = input.payload;

  switch (input.type) {
    case "appointment_confirmation": {
      const parsed = appointmentConfirmationPayload.safeParse(payload);
      if (!parsed.success) return invalidPayload(input.type, parsed.error);
      const to = await resolveRecipientEmail(input);
      if (!to) return missingRecipient();
      return toNotifyResult(await sendAppointmentConfirmation(parsed.data, to));
    }

    case "new_appointment_notification": {
      const parsed = appointmentNotificationPayload.safeParse(payload);
      if (!parsed.success) return invalidPayload(input.type, parsed.error);
      const to = await resolveRecipientEmail(input);
      if (!to) return missingRecipient();
      return toNotifyResult(await sendAppointmentNotification(parsed.data, to));
    }

    case "appointment_cancellation": {
      const parsed = appointmentCancellationPayload.safeParse(payload);
      if (!parsed.success) return invalidPayload(input.type, parsed.error);
      const to = await resolveRecipientEmail(input);
      if (!to) return missingRecipient();
      return toNotifyResult(await sendAppointmentCancellation(parsed.data, to));
    }

    case "appointment_reschedule": {
      const parsed = appointmentReschedulePayload.safeParse(payload);
      if (!parsed.success) return invalidPayload(input.type, parsed.error);
      const to = await resolveRecipientEmail(input);
      if (!to) return missingRecipient();
      return toNotifyResult(await sendAppointmentReschedule(parsed.data, to));
    }

    case "payment_submitted": {
      const parsed = billingSubmittedPayload.safeParse(payload);
      if (!parsed.success) return invalidPayload(input.type, parsed.error);
      return toNotifyResult(await sendBillingSubmittedEmail(parsed.data));
    }

    case "payment_approved": {
      const parsed = billingApprovedPayload.safeParse(payload);
      if (!parsed.success) return invalidPayload(input.type, parsed.error);
      return toNotifyResult(await sendBillingApprovedEmail(parsed.data));
    }

    case "payment_rejected": {
      const parsed = billingRejectedPayload.safeParse(payload);
      if (!parsed.success) return invalidPayload(input.type, parsed.error);
      return toNotifyResult(await sendBillingRejectedEmail(parsed.data));
    }

    case "subscription_expiring": {
      // No caller exists yet (Phase 8 never shipped the expiring cron); the
      // dispatcher exposes the existing sender for when one arrives.
      const parsed = billingExpiringPayload.safeParse(payload);
      if (!parsed.success) return invalidPayload(input.type, parsed.error);
      const to = await resolveRecipientEmail(input);
      if (!to) return missingRecipient();
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
      const clinic = await getClinicNameForAdapter(parsed.data.clinicId);
      return toNotifyResult(
        await sendBillingExpiring(
          {
            clinicName: clinic ?? "",
            planName: parsed.data.planName,
            expiryDate: parsed.data.expiryDate,
            renewUrl: `${siteUrl}/app/billing`,
            dashboardUrl: `${siteUrl}/app/billing`,
          },
          to,
        ),
      );
    }

    case "team_invite": {
      const parsed = teamInvitePayload.safeParse(payload);
      if (!parsed.success) return invalidPayload(input.type, parsed.error);
      const to = input.to;
      if (!to) return missingRecipient();
      return toNotifyResult(await sendTeamInviteEmail({ ...parsed.data, to }));
    }

    case "appointment_reminder":
      // Reminders ship on the WhatsApp channel only (Phase 13); email
      // reminders are future scope.
      return {
        success: false,
        error: "appointment_reminder is not available on the email channel.",
      };

    default: {
      return {
        success: false,
        error: `Unhandled notification type "${input.type}" on the email channel.`,
      };
    }
  }
}

function invalidPayload(type: string, error: z.ZodError): NotifyResult {
  const issue = error.issues[0];
  const where = issue ? ` at "${issue.path.join(".")}"` : "";
  return {
    success: false,
    error: `Invalid ${type} payload${where}.`,
  };
}

function missingRecipient(): NotifyResult {
  return { success: false, error: "No recipient email address available." };
}

async function getClinicNameForAdapter(
  clinicId: string,
): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase
      .from("clinics")
      .select("name")
      .eq("id", clinicId)
      .single();
    return data?.name ?? null;
  } catch {
    return null;
  }
}
