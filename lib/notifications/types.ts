/**
 * Delivery channels for the notification dispatcher. `email` (Phase 8) and
 * `whatsapp` (Phase 13) send today; `sms` is reserved for a later phase.
 */
export type NotificationChannel = "email" | "whatsapp" | "sms";

/**
 * Every notification the product sends. The set mirrors the existing Phase 3/4/8
 * email call sites one-to-one (`team_invite` added beyond the PRD list so ALL
 * senders route through the dispatcher). `appointment_reminder` has no sender
 * yet — it arrives with Phase 13's WhatsApp reminders.
 */
export type NotificationType =
  | "appointment_confirmation"
  | "appointment_cancellation"
  | "appointment_reschedule"
  | "appointment_reminder"
  // Phase 22: post-booking WhatsApp follow-up asking the patient the clinic's
  // configured after-booking pre-consultation questions.
  | "pre_consultation_followup"
  // Clinic-facing: doctor/staff notified of a new booking.
  | "new_appointment_notification"
  | "payment_submitted"
  | "payment_approved"
  | "payment_rejected"
  | "subscription_expiring"
  // Staff-facing invite (Phase 4 settings/team), routed for completeness.
  | "team_invite"
  | "receipt_generated";

/**
 * One entry point for every outbound notification. `payload` carries the
 * type-specific data; its expected shape per type is enforced by the channel
 * implementations (zod-validated, mirroring the existing email template
 * parameters exactly so behavior cannot drift).
 */
export type NotifyInput = {
  clinicId: string;
  /** Optional for clinic/staff-facing types that resolve their own recipient. */
  patientId?: string;
  /** Reserved for clinic-facing notifications to a specific staff member. */
  recipientUserId?: string;
  channel: NotificationChannel;
  type: NotificationType;
  /**
   * Explicit recipient address (email today). Appointment/team types always
   * pass one at call sites; billing types resolve the clinic address
   * themselves. Falls back to the patient's stored email when omitted and
   * `patientId` is provided.
   */
  to?: string;
  payload: Record<string, unknown>;
};

/** Mirrors `ActionResult` semantics without importing app-layer types. */
export type NotifyResult = { success: boolean; error?: string };

export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = [
  "email",
  "whatsapp",
  "sms",
] as const;

export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  "appointment_confirmation",
  "appointment_cancellation",
  "appointment_reschedule",
  "appointment_reminder",
  "pre_consultation_followup",
  "new_appointment_notification",
  "payment_submitted",
  "payment_approved",
  "payment_rejected",
  "subscription_expiring",
  "team_invite",
  "receipt_generated",
] as const;
