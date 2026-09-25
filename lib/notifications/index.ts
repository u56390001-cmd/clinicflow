import { sendViaEmail } from "@/lib/notifications/email";
import { sendViaSms } from "@/lib/notifications/sms";
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  type NotificationChannel,
  type NotificationType,
  type NotifyInput,
  type NotifyResult,
} from "@/lib/notifications/types";
import { sendViaWhatsapp } from "@/lib/notifications/whatsapp";

export type {
  NotificationChannel,
  NotificationType,
  NotifyInput,
  NotifyResult,
} from "@/lib/notifications/types";

/**
 * The single entry point every outbound notification flows through
 * (PRD-Feature-Expansion §4.2, Phase 11). Mirrors the AIProvider/GeminiProvider
 * pattern from Phase 5: one stable interface, channel implementations behind it.
 *
 * Today `email` (Phase 8 Resend pipeline, unchanged templates) and `whatsapp`
 * (Phase 13 Meta Cloud API, patient-facing appointment types + reminders)
 * send. `sms` remains defined-but-stubbed: it never throws, it returns a clear
 * unsuccessful result.
 */
export async function notifyPatient(
  input: NotifyInput,
): Promise<NotifyResult> {
  if (!isNotificationChannel(input.channel)) {
    return { success: false, error: `Unknown channel "${String(input.channel)}".` };
  }
  if (!isNotificationType(input.type)) {
    return { success: false, error: `Unknown notification type "${String(input.type)}".` };
  }

  switch (input.channel) {
    case "email":
      return sendViaEmail(input);
    case "whatsapp":
      return sendViaWhatsapp(input);
    case "sms":
      // Reserved for a later phase; defined-but-unimplemented by design.
      return sendViaSms(input);
  }
}

function isNotificationChannel(value: unknown): value is NotificationChannel {
  return (
    typeof value === "string" &&
    (NOTIFICATION_CHANNELS as readonly string[]).includes(value)
  );
}

function isNotificationType(value: unknown): value is NotificationType {
  return (
    typeof value === "string" &&
    (NOTIFICATION_TYPES as readonly string[]).includes(value)
  );
}
