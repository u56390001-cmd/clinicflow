import { resend } from "@/lib/email/client";
import { logAppEvent } from "@/lib/observability";
import { createWidgetClient } from "@/lib/supabase/widget";
import {
  type AppointmentCancellationParams,
  type AppointmentConfirmationParams,
  type AppointmentNotificationParams,
  type AppointmentRescheduleParams,
  type BillingApprovedParams,
  type BillingExpiringParams,
  type BillingRejectedParams,
  type BillingSubmittedParams,
  appointmentCancellation,
  appointmentConfirmation,
  appointmentNotification,
  appointmentReschedule,
  billingApproved,
  billingExpiring,
  billingRejected,
  billingSubmitted,
  teamInvite,
} from "@/lib/email/templates";
import { createClient } from "@/lib/supabase/server";

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "MedBook AI <onboarding@resend.dev>";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export type SendEmailResult = { ok: boolean; error?: string };

/**
 * Record a Resend send failure in `app_event_logs` (Phase 9 observability).
 * Uses the service-role client because email sends happen in contexts that
 * may have no session. Best-effort: never throws.
 */
async function logEmailFailure(params: {
  event: string;
  error: string;
  clinicId?: string | null;
}): Promise<void> {
  try {
    const supabase = createWidgetClient();
    await logAppEvent(supabase, {
      clinicId: params.clinicId ?? null,
      category: "email",
      event: params.event,
      metadata: { error: params.error.slice(0, 500) },
    });
  } catch {
    // Observability env not configured; the console.error already fired.
  }
}

/* -------------------------------------------------------------------------- */
/*  Appointment emails                                                        */
/* -------------------------------------------------------------------------- */

export async function sendAppointmentConfirmation(
  params: AppointmentConfirmationParams,
  to: string,
): Promise<SendEmailResult> {
  try {
    const { subject, html } = appointmentConfirmation(params);
    await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] sendAppointmentConfirmation failed:", message);
    await logEmailFailure({ event: "appointment_confirmation_send_failed", error: message });
    return { ok: false, error: message };
  }
}

export async function sendAppointmentNotification(
  params: AppointmentNotificationParams,
  to: string,
): Promise<SendEmailResult> {
  try {
    const { subject, html } = appointmentNotification(params);
    await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] sendAppointmentNotification failed:", message);
    await logEmailFailure({ event: "appointment_notification_send_failed", error: message });
    return { ok: false, error: message };
  }
}

export async function sendAppointmentCancellation(
  params: AppointmentCancellationParams,
  to: string,
): Promise<SendEmailResult> {
  try {
    const { subject, html } = appointmentCancellation(params);
    await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] sendAppointmentCancellation failed:", message);
    await logEmailFailure({ event: "appointment_cancellation_send_failed", error: message });
    return { ok: false, error: message };
  }
}

export async function sendAppointmentReschedule(
  params: AppointmentRescheduleParams,
  to: string,
): Promise<SendEmailResult> {
  try {
    const { subject, html } = appointmentReschedule(params);
    await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] sendAppointmentReschedule failed:", message);
    await logEmailFailure({ event: "appointment_reschedule_send_failed", error: message });
    return { ok: false, error: message };
  }
}

/* -------------------------------------------------------------------------- */
/*  Billing emails                                                            */
/* -------------------------------------------------------------------------- */

export async function sendBillingSubmitted(
  params: BillingSubmittedParams,
  to: string,
): Promise<SendEmailResult> {
  try {
    const { subject, html } = billingSubmitted(params);
    await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] sendBillingSubmitted failed:", message);
    await logEmailFailure({ event: "billing_submitted_send_failed", error: message });
    return { ok: false, error: message };
  }
}

export async function sendBillingApproved(
  params: BillingApprovedParams,
  to: string,
): Promise<SendEmailResult> {
  try {
    const { subject, html } = billingApproved(params);
    await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] sendBillingApproved failed:", message);
    await logEmailFailure({ event: "billing_approved_send_failed", error: message });
    return { ok: false, error: message };
  }
}

export async function sendBillingRejected(
  params: BillingRejectedParams,
  to: string,
): Promise<SendEmailResult> {
  try {
    const { subject, html } = billingRejected(params);
    await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] sendBillingRejected failed:", message);
    await logEmailFailure({ event: "billing_rejected_send_failed", error: message });
    return { ok: false, error: message };
  }
}

export async function sendBillingExpiring(
  params: BillingExpiringParams,
  to: string,
): Promise<SendEmailResult> {
  try {
    const { subject, html } = billingExpiring(params);
    await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] sendBillingExpiring failed:", message);
    await logEmailFailure({ event: "billing_expiring_send_failed", error: message });
    return { ok: false, error: message };
  }
}

/* -------------------------------------------------------------------------- */
/*  Adapter functions — match existing call sites in lib/actions/billing.ts   */
/* -------------------------------------------------------------------------- */

async function getClinicInfo(
  clinicId: string,
): Promise<{ email: string; name: string } | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("clinics")
      .select("email, name")
      .eq("id", clinicId)
      .single();
    if (!data?.email) return null;
    return { email: data.email, name: data.name };
  } catch {
    return null;
  }
}

type BillingSubmittedEmailParams = {
  clinicId: string;
  clinicName: string;
  submissionId: string;
  amount: number;
};

export async function sendBillingSubmittedEmail(
  params: BillingSubmittedEmailParams,
): Promise<SendEmailResult> {
  const clinic = await getClinicInfo(params.clinicId);
  if (!clinic) return { ok: false, error: "Clinic not found or missing email" };

  return sendBillingSubmitted(
    {
      clinicName: params.clinicName || clinic.name,
      planName: "Subscription",
      amount: `$${params.amount.toFixed(2)}`,
      submittedDate: new Date().toLocaleDateString(),
      dashboardUrl: `${SITE_URL}/app/billing`,
    },
    clinic.email,
  );
}

type BillingApprovedEmailParams = {
  clinicId: string;
  submissionId: string;
  amount: number;
};

export async function sendBillingApprovedEmail(
  params: BillingApprovedEmailParams,
): Promise<SendEmailResult> {
  const clinic = await getClinicInfo(params.clinicId);
  if (!clinic) return { ok: false, error: "Clinic not found or missing email" };

  const now = new Date();
  const end = new Date(now);
  end.setMonth(end.getMonth() + 1);

  return sendBillingApproved(
    {
      clinicName: clinic.name,
      planName: "Subscription",
      amount: `$${params.amount.toFixed(2)}`,
      periodStart: now.toLocaleDateString(),
      periodEnd: end.toLocaleDateString(),
      dashboardUrl: `${SITE_URL}/app/billing`,
    },
    clinic.email,
  );
}

type BillingRejectedEmailParams = {
  clinicId: string;
  submissionId: string;
  reason: string;
};

export async function sendBillingRejectedEmail(
  params: BillingRejectedEmailParams,
): Promise<SendEmailResult> {
  const clinic = await getClinicInfo(params.clinicId);
  if (!clinic) return { ok: false, error: "Clinic not found or missing email" };

  return sendBillingRejected(
    {
      clinicName: clinic.name,
      planName: "Subscription",
      reason: params.reason,
      dashboardUrl: `${SITE_URL}/app/billing`,
    },
    clinic.email,
  );
}

/* -------------------------------------------------------------------------- */
/*  Team invite email                                                         */
/* -------------------------------------------------------------------------- */

export async function sendTeamInviteEmail(params: {
  clinicId?: string | null;
  clinicName: string;
  inviterName: string;
  role: string;
  to: string;
  acceptUrl: string;
}): Promise<SendEmailResult> {
  try {
    const { subject, html } = teamInvite({
      clinicName: params.clinicName,
      inviterName: params.inviterName,
      role: params.role,
      acceptUrl: params.acceptUrl,
    });
    await resend.emails.send({ from: FROM_EMAIL, to: params.to, subject, html });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] sendTeamInviteEmail failed:", message);
    await logEmailFailure({
      event: "team_invite_send_failed",
      error: message,
      clinicId: params.clinicId ?? null,
    });
    return { ok: false, error: message };
  }
}
