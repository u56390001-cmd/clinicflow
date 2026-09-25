/** Shared layout wrapper for all transactional emails. */

function wrapper(title: string, bodyHtml: string): string {
  const year = new Date().getFullYear();
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background-color:#0D9488;padding:20px 32px;text-align:center;">
              <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">MedBook AI</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:13px;color:#6b7280;">
                MedBook AI &mdash; Healthcare Management Platform
              </p>
              <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">&copy; ${year}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  return `
  <a href="${href}" style="display:inline-block;background-color:#0D9488;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:6px;margin-top:8px;">
    ${label}
  </a>`;
}

function fieldRow(label: string, value: string): string {
  return `
  <tr>
    <td style="padding:8px 0;font-size:14px;color:#6b7280;width:140px;vertical-align:top;">${label}</td>
    <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:500;">${value}</td>
  </tr>`;
}

/* -------------------------------------------------------------------------- */
/*  Appointment templates                                                     */
/* -------------------------------------------------------------------------- */

export type AppointmentConfirmationParams = {
  patientName: string;
  date: string;
  time: string;
  service: string;
  clinicName: string;
  dashboardUrl: string;
};

export function appointmentConfirmation(
  p: AppointmentConfirmationParams,
): { subject: string; html: string } {
  return {
    subject: `Appointment Confirmed — ${p.service} at ${p.clinicName}`,
    html: wrapper(
      "Appointment Confirmed",
      `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Appointment Confirmed</h2>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">
          Hi ${p.patientName}, your appointment has been confirmed.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdfa;border-radius:6px;padding:16px;">
          <tr>
            <td style="padding:16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${fieldRow("Date", p.date)}
                ${fieldRow("Time", p.time)}
                ${fieldRow("Service", p.service)}
                ${fieldRow("Clinic", p.clinicName)}
              </table>
            </td>
          </tr>
        </table>
        <div style="margin-top:24px;text-align:center;">
          ${ctaButton(p.dashboardUrl, "View Appointment")}
        </div>
      `,
    ),
  };
}

export type AppointmentNotificationParams = {
  clinicName: string;
  patientName: string;
  date: string;
  time: string;
  service: string;
  dashboardUrl: string;
};

export function appointmentNotification(
  p: AppointmentNotificationParams,
): { subject: string; html: string } {
  return {
    subject: `New Booking — ${p.patientName} (${p.service})`,
    html: wrapper(
      "New Appointment Booked",
      `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">New Appointment Booked</h2>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">
          A new appointment has been booked at ${p.clinicName}.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdfa;border-radius:6px;padding:16px;">
          <tr>
            <td style="padding:16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${fieldRow("Patient", p.patientName)}
                ${fieldRow("Date", p.date)}
                ${fieldRow("Time", p.time)}
                ${fieldRow("Service", p.service)}
              </table>
            </td>
          </tr>
        </table>
        <div style="margin-top:24px;text-align:center;">
          ${ctaButton(p.dashboardUrl, "View in Dashboard")}
        </div>
      `,
    ),
  };
}

export type AppointmentCancellationParams = {
  recipientName: string;
  recipientRole: "patient" | "clinic";
  patientName: string;
  clinicName: string;
  date: string;
  time: string;
  service: string;
  reason: string;
  dashboardUrl: string;
};

export function appointmentCancellation(
  p: AppointmentCancellationParams,
): { subject: string; html: string } {
  const contextNote =
    p.recipientRole === "patient"
      ? `${p.patientName}, your appointment at ${p.clinicName} has been cancelled.`
      : `The appointment for ${p.patientName} at ${p.clinicName} has been cancelled.`;

  return {
    subject: `Appointment Cancelled — ${p.date} ${p.time}`,
    html: wrapper(
      "Appointment Cancelled",
      `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Appointment Cancelled</h2>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">
          Hi ${p.recipientName}, ${contextNote}
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border-radius:6px;padding:16px;">
          <tr>
            <td style="padding:16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${fieldRow("Date", p.date)}
                ${fieldRow("Time", p.time)}
                ${fieldRow("Service", p.service)}
                ${fieldRow("Reason", p.reason || "No reason provided")}
              </table>
            </td>
          </tr>
        </table>
        <div style="margin-top:24px;text-align:center;">
          ${ctaButton(p.dashboardUrl, "View Details")}
        </div>
      `,
    ),
  };
}

export type AppointmentRescheduleParams = {
  recipientName: string;
  recipientRole: "patient" | "clinic";
  patientName: string;
  clinicName: string;
  oldDate: string;
  oldTime: string;
  newDate: string;
  newTime: string;
  service: string;
  dashboardUrl: string;
};

export function appointmentReschedule(
  p: AppointmentRescheduleParams,
): { subject: string; html: string } {
  return {
    subject: `Appointment Rescheduled — ${p.newDate} ${p.newTime}`,
    html: wrapper(
      "Appointment Rescheduled",
      `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Appointment Rescheduled</h2>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">
          Hi ${p.recipientName}, the appointment for ${p.patientName} at ${p.clinicName} has been rescheduled.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdfa;border-radius:6px;padding:16px;">
          <tr>
            <td style="padding:16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${fieldRow("Service", p.service)}
                <tr>
                  <td colspan="2" style="padding:8px 0 4px;font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Previous</td>
                </tr>
                ${fieldRow("Date", p.oldDate)}
                ${fieldRow("Time", p.oldTime)}
                <tr>
                  <td colspan="2" style="padding:16px 0 4px;font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">New</td>
                </tr>
                ${fieldRow("Date", p.newDate)}
                ${fieldRow("Time", p.newTime)}
              </table>
            </td>
          </tr>
        </table>
        <div style="margin-top:24px;text-align:center;">
          ${ctaButton(p.dashboardUrl, "View Appointment")}
        </div>
      `,
    ),
  };
}

/* -------------------------------------------------------------------------- */
/*  Billing templates                                                         */
/* -------------------------------------------------------------------------- */

export type BillingSubmittedParams = {
  clinicName: string;
  planName: string;
  amount: string;
  submittedDate: string;
  dashboardUrl: string;
};

export function billingSubmitted(
  p: BillingSubmittedParams,
): { subject: string; html: string } {
  return {
    subject: `Payment Proof Received — ${p.planName}`,
    html: wrapper(
      "Payment Proof Received",
      `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Payment Proof Received</h2>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">
          Hi ${p.clinicName}, we've received your payment proof for the <strong>${p.planName}</strong> plan.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb;border-radius:6px;padding:16px;">
          <tr>
            <td style="padding:16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${fieldRow("Plan", p.planName)}
                ${fieldRow("Amount", p.amount)}
                ${fieldRow("Submitted", p.submittedDate)}
              </table>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:14px;color:#6b7280;">
          Your payment is currently under review. We'll notify you once it's confirmed.
        </p>
        <div style="margin-top:24px;text-align:center;">
          ${ctaButton(p.dashboardUrl, "View Billing")}
        </div>
      `,
    ),
  };
}

export type BillingApprovedParams = {
  clinicName: string;
  planName: string;
  amount: string;
  periodStart: string;
  periodEnd: string;
  dashboardUrl: string;
};

export function billingApproved(
  p: BillingApprovedParams,
): { subject: string; html: string } {
  return {
    subject: `Payment Approved — ${p.planName}`,
    html: wrapper(
      "Payment Approved",
      `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Payment Approved</h2>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">
          Hi ${p.clinicName}, your payment has been approved. Your subscription is now active.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-radius:6px;padding:16px;">
          <tr>
            <td style="padding:16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${fieldRow("Plan", p.planName)}
                ${fieldRow("Amount", p.amount)}
                ${fieldRow("Period Start", p.periodStart)}
                ${fieldRow("Period End", p.periodEnd)}
              </table>
            </td>
          </tr>
        </table>
        <div style="margin-top:24px;text-align:center;">
          ${ctaButton(p.dashboardUrl, "View Subscription")}
        </div>
      `,
    ),
  };
}

export type BillingRejectedParams = {
  clinicName: string;
  planName: string;
  reason: string;
  dashboardUrl: string;
};

export function billingRejected(
  p: BillingRejectedParams,
): { subject: string; html: string } {
  return {
    subject: `Payment Rejected — ${p.planName}`,
    html: wrapper(
      "Payment Rejected",
      `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Payment Rejected</h2>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">
          Hi ${p.clinicName}, unfortunately your payment for the <strong>${p.planName}</strong> plan could not be verified.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border-radius:6px;padding:16px;">
          <tr>
            <td style="padding:16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${fieldRow("Plan", p.planName)}
                ${fieldRow("Reason", p.reason)}
              </table>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:14px;color:#6b7280;">
          Please review the reason above and resubmit your payment proof, or contact our support team for assistance.
        </p>
        <div style="margin-top:24px;text-align:center;">
          ${ctaButton(p.dashboardUrl, "Resubmit Payment")}
        </div>
      `,
    ),
  };
}

export type BillingExpiringParams = {
  clinicName: string;
  planName: string;
  expiryDate: string;
  renewUrl: string;
  dashboardUrl: string;
};

export function billingExpiring(
  p: BillingExpiringParams,
): { subject: string; html: string } {
  return {
    subject: `Subscription Expiring Soon — ${p.planName}`,
    html: wrapper(
      "Subscription Expiring Soon",
      `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Subscription Expiring Soon</h2>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">
          Hi ${p.clinicName}, your <strong>${p.planName}</strong> subscription is expiring soon. Renew now to avoid service interruption.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb;border-radius:6px;padding:16px;">
          <tr>
            <td style="padding:16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${fieldRow("Plan", p.planName)}
                ${fieldRow("Expires", p.expiryDate)}
              </table>
            </td>
          </tr>
        </table>
        <div style="margin-top:24px;text-align:center;">
          ${ctaButton(p.renewUrl, "Renew Now")}
        </div>
        <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;text-align:center;">
          Or <a href="${p.dashboardUrl}" style="color:#0D9488;text-decoration:underline;">view your subscription</a> in the dashboard.
        </p>
      `,
    ),
  };
}

/* -------------------------------------------------------------------------- */
/*  Team invite template                                                      */
/* -------------------------------------------------------------------------- */

export type TeamInviteParams = {
  clinicName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
};

export function teamInvite(p: TeamInviteParams): { subject: string; html: string } {
  const roleLabel = p.role === "admin" ? "Administrator" : "Staff Member";
  return {
    subject: `You've been invited to join ${p.clinicName} on MedBook AI`,
    html: wrapper(
      `Join ${p.clinicName} on MedBook AI`,
      `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">You're invited!</h2>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">
          <strong>${p.inviterName}</strong> has invited you to join
          <strong>${p.clinicName}</strong> as a <strong>${roleLabel}</strong> on MedBook AI.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdfa;border-radius:6px;padding:16px;">
          <tr>
            <td style="padding:16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${fieldRow("Clinic", p.clinicName)}
                ${fieldRow("Role", roleLabel)}
                ${fieldRow("Invited by", p.inviterName)}
              </table>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:14px;color:#6b7280;">
          This invitation link is valid for 7 days and can only be used once. Sign in
          with <strong>this email address</strong> to accept it.
        </p>
        <div style="margin-top:24px;text-align:center;">
          ${ctaButton(p.acceptUrl, "Accept Invitation")}
        </div>
      `,
    ),
  };
}
