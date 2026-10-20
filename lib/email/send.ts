import { getResend } from "@/lib/email/client";
import { logAppEvent } from "@/lib/observability";
import { createWidgetClient } from "@/lib/supabase/widget";
import {
  type AppointmentCancellationParams,
  type AppointmentConfirmationParams,
  type AppointmentNotificationParams,
  type AppointmentRescheduleParams,
  type AssessmentSafetyAlertParams,
  type BillingApprovedParams,
  type BillingExpiringParams,
  type BillingRejectedParams,
  type BillingSubmittedParams,
  accountCredentials,
  appointmentCancellation,
  appointmentConfirmation,
  appointmentNotification,
  appointmentReschedule,
  assessmentSafetyAlert,
  billingApproved,
  billingExpiring,
  billingRejected,
  billingSubmitted,
  registrationRejected,
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
/*  Delivery                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Hand a message to Resend and report what actually happened.
 *
 * Resend does NOT throw on a rejected send - it resolves with `{ error }` (a
 * 403 for an unverified sender, a 422 for a bad payload, ...). Only checking
 * the thrown error made a failed send look like a successful one, so the
 * registration flow reported "credentials emailed" for a mail that was never
 * delivered. The returned `error` is now inspected as well.
 */
async function deliver(params: {
  to: string | string[];
  subject: string;
  html: string;
  event: string;
  clinicId?: string | null;
}): Promise<SendEmailResult> {
  try {
    const { error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });

    if (error) {
      const message = error.message || "Resend rejected the message.";
      console.error(`[email] ${params.event} failed:`, message);
      await logEmailFailure({
        event: params.event,
        error: message,
        clinicId: params.clinicId ?? null,
      });
      return { ok: false, error: message };
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[email] ${params.event} failed:`, message);
    await logEmailFailure({
      event: params.event,
      error: message,
      clinicId: params.clinicId ?? null,
    });
    return { ok: false, error: message };
  }
}

/* -------------------------------------------------------------------------- */
/*  Appointment emails                                                        */
/* -------------------------------------------------------------------------- */

export async function sendAppointmentConfirmation(
  params: AppointmentConfirmationParams,
  to: string,
): Promise<SendEmailResult> {
  const { subject, html } = appointmentConfirmation(params);
  return deliver({ to, subject, html, event: "appointment_confirmation_send_failed" });
}

export async function sendAppointmentNotification(
  params: AppointmentNotificationParams,
  to: string,
): Promise<SendEmailResult> {
  const { subject, html } = appointmentNotification(params);
  return deliver({ to, subject, html, event: "appointment_notification_send_failed" });
}

export async function sendAppointmentCancellation(
  params: AppointmentCancellationParams,
  to: string,
): Promise<SendEmailResult> {
  const { subject, html } = appointmentCancellation(params);
  return deliver({ to, subject, html, event: "appointment_cancellation_send_failed" });
}

export async function sendAppointmentReschedule(
  params: AppointmentRescheduleParams,
  to: string,
): Promise<SendEmailResult> {
  const { subject, html } = appointmentReschedule(params);
  return deliver({ to, subject, html, event: "appointment_reschedule_send_failed" });
}

/* -------------------------------------------------------------------------- */
/*  Billing emails                                                            */
/* -------------------------------------------------------------------------- */

export async function sendBillingSubmitted(
  params: BillingSubmittedParams,
  to: string,
): Promise<SendEmailResult> {
  const { subject, html } = billingSubmitted(params);
  return deliver({ to, subject, html, event: "billing_submitted_send_failed" });
}

export async function sendBillingApproved(
  params: BillingApprovedParams,
  to: string,
): Promise<SendEmailResult> {
  const { subject, html } = billingApproved(params);
  return deliver({ to, subject, html, event: "billing_approved_send_failed" });
}

export async function sendBillingRejected(
  params: BillingRejectedParams,
  to: string,
): Promise<SendEmailResult> {
  const { subject, html } = billingRejected(params);
  return deliver({ to, subject, html, event: "billing_rejected_send_failed" });
}

export async function sendBillingExpiring(
  params: BillingExpiringParams,
  to: string,
): Promise<SendEmailResult> {
  const { subject, html } = billingExpiring(params);
  return deliver({ to, subject, html, event: "billing_expiring_send_failed" });
}

/* -------------------------------------------------------------------------- */
/*  Clinical safety alert (Phase 1 §2.1)                                      */
/* -------------------------------------------------------------------------- */

/**
 * Send a clinical safety alert to one or more care-team members. Returns the
 * recipients the email was successfully delivered to. Best-effort: a failed
 * send is logged (never thrown) so the clinical write that triggered it stands.
 */
export async function sendAssessmentSafetyAlert(
  params: AssessmentSafetyAlertParams,
  recipients: string[],
): Promise<{ ok: boolean; delivered: string[]; error?: string }> {
  const unique = Array.from(new Set(recipients.filter((r) => r.trim().length > 0)));
  if (unique.length === 0) return { ok: false, delivered: [] };

  const { subject, html } = assessmentSafetyAlert(params);
  const result = await deliver({
    to: unique,
    subject,
    html,
    event: "assessment_safety_alert_send_failed",
  });
  return {
    ok: result.ok,
    delivered: result.ok ? unique : [],
    error: result.error,
  };
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
/*  Registration emails                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Deliver the freshly provisioned account credentials to the applicant. The
 * temporary password is only ever sent here — it is never stored.
 */
export async function sendAccountCredentialsEmail(params: {
  to: string;
  fullName: string;
  clinicName: string;
  temporaryPassword: string;
  planName: string;
  amount: number;
  currency: string;
  periodEnd: Date;
}): Promise<SendEmailResult> {
  const { subject, html } = accountCredentials({
    fullName: params.fullName,
    clinicName: params.clinicName,
    email: params.to,
    temporaryPassword: params.temporaryPassword,
    planName: params.planName,
    amount: `${params.currency} ${params.amount.toLocaleString()}`,
    periodEnd: params.periodEnd.toLocaleDateString(),
    loginUrl: `${SITE_URL}/login`,
  });
  return deliver({ to: params.to, subject, html, event: "account_credentials_send_failed" });
}

/** Tell an applicant that their payment could not be verified. */
export async function sendRegistrationRejectedEmail(params: {
  to: string;
  fullName: string;
  clinicName: string;
  planName: string;
  reason: string;
}): Promise<SendEmailResult> {
  const { subject, html } = registrationRejected({
    fullName: params.fullName,
    clinicName: params.clinicName,
    planName: params.planName,
    reason: params.reason,
    retryUrl: `${SITE_URL}/get-started`,
  });
  return deliver({ to: params.to, subject, html, event: "registration_rejected_send_failed" });
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
  const { subject, html } = teamInvite({
    clinicName: params.clinicName,
    inviterName: params.inviterName,
    role: params.role,
    acceptUrl: params.acceptUrl,
  });
  return deliver({
    to: params.to,
    subject,
    html,
    event: "team_invite_send_failed",
    clinicId: params.clinicId ?? null,
  });
}
