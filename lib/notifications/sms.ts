import type { NotifyInput, NotifyResult } from "@/lib/notifications/types";

/**
 * SMS channel stub (Phase 11). No SMS provider is planned yet; the case must
 * exist so callers never crash on it and future work is a drop-in sender.
 */
export async function sendViaSms(input: NotifyInput): Promise<NotifyResult> {
  console.info(
    `[notifications] sms channel not yet available — dropped ${input.type} for clinic ${input.clinicId}`,
  );
  return { success: false, error: "The SMS channel is not yet available." };
}
