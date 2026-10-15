import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_SAFETY_ALERT_TEMPLATE,
  renderSafetyAlertTemplate,
  SAFETY_ALERT_TYPE,
} from "@/lib/engagement-safety";
import { sendAssessmentSafetyAlert } from "@/lib/email/send";
import { engagementLogMessage } from "@/lib/actions/engagement";
import type { Database } from "@/types/database";
import {
  getClinicWhatsappCredentials,
  sendWhatsappText,
  WhatsappNotConnectedError,
} from "@/lib/whatsapp/client";

/**
 * Phase 1 §2.3 / Phase 5 — multi-channel delivery for clinical safety alerts.
 *
 * The scoring pipeline (`lib/scoring/safety.ts`) calls this once per flagged
 * assessment. It fans the same alert out across every channel the clinic can
 * actually deliver on today, best-effort and non-throwing:
 *
 *   1. Email  — always attempted for every care-team member (Resend pipeline).
 *   2. WhatsApp — the clinic's engagement pipeline: the admin-editable
 *      `safety_alert` template from `engagement_templates`, the per-clinic
 *      `safety_alert` automation toggle, the shared Meta Cloud API client, and
 *      an `engagement_logs` entry on success. Recipients are care-team members
 *      with a known phone.
 *   3. SMS    — reserved for a future provider (see `sendSafetySms`); today it
 *      reports "unavailable" without failing the alert.
 *
 * CLINICAL-VALIDATION-REQUIRED: recipient set and the decision to contact staff
 * synchronously on a safety flag need clinical sign-off.
 *
 * WhatsApp limitation (documented in PRD §4.4, mirrors the notification channel):
 * free-form sends require an open 24-hour customer-service window with the
 * recipient. Staff rarely have one, so a WhatsApp send outside the window fails
 * gracefully — the alert still lands by email.
 */

/** A care-team member who should receive a clinical safety alert. */
export type SafetyCareRecipient = {
  /** The staff member's login, when they have one (used to resolve a phone). */
  userId: string | null;
  email: string;
  /** E.164-ish phone for WhatsApp/SMS, when known. Null = email only. */
  phone: string | null;
};

/** The alert content shared by every channel. */
export type SafetyAlertContent = {
  clinicName: string;
  patientName: string;
  instrumentName: string;
  /** Human label, e.g. "Moderate" or "High". */
  riskLevel: string;
  reasons: string[];
  /** Deep link into the patient record where triage must be logged. */
  reviewUrl: string;
};

/** Per-channel delivery record — the addresses each channel reached. */
export type SafetyChannelDelivery = {
  email: string[];
  whatsapp: string[];
  sms: string[];
};

/** Normalize a stored phone to wa_id/SMS format (digits only, incl. country code). */
function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/**
 * SMS remains a defined-but-unimplemented channel: no SMS provider is
 * configured yet. Returns "not delivered" without throwing so the alert is
 * unaffected. Replace this body with the real provider call when one lands.
 */
async function sendSafetySms(phone: string, body: string): Promise<boolean> {
  console.info(
    `[safety-notify] sms channel not yet available — dropped safety alert to ${phone.slice(0, 4)}*** (${body.length} chars)`,
  );
  return false;
}

/**
 * Resolve the clinic's WhatsApp copy + on/off state from the engagement
 * catalogue. A clinic with no `safety_alert` automation row is treated as
 * enabled (same default as the reminders cron).
 */
async function resolveSafetyWhatsappConfig(
  supabase: SupabaseClient<Database>,
  clinicId: string,
): Promise<{ enabled: boolean; template: string }> {
  const [automation, template] = await Promise.all([
    supabase
      .from("engagement_automations")
      .select("enabled")
      .eq("clinic_id", clinicId)
      .eq("automation_type", SAFETY_ALERT_TYPE)
      .maybeSingle(),
    supabase
      .from("engagement_templates")
      .select("template_text")
      .eq("clinic_id", clinicId)
      .eq("type", SAFETY_ALERT_TYPE)
      .maybeSingle(),
  ]);

  return {
    enabled: automation.data?.enabled ?? true,
    template: template.data?.template_text?.trim() || DEFAULT_SAFETY_ALERT_TEMPLATE,
  };
}

/**
 * Deliver one clinical safety alert across all available channels. Never
 * throws: a channel failure is logged and simply absent from the result.
 */
export async function notifyCareTeamSafetyAlert(params: {
  supabase: SupabaseClient<Database>;
  clinicId: string;
  patientId: string;
  content: SafetyAlertContent;
  recipients: SafetyCareRecipient[];
}): Promise<SafetyChannelDelivery> {
  const { supabase, clinicId, patientId, content, recipients } = params;
  const delivery: SafetyChannelDelivery = { email: [], whatsapp: [], sms: [] };

  const emails = Array.from(
    new Set(recipients.map((r) => r.email.trim()).filter((e) => e.length > 0)),
  );

  // 1. Email — the always-on channel.
  if (emails.length > 0) {
    const sent = await sendAssessmentSafetyAlert(content, emails);
    if (sent.ok) delivery.email = sent.delivered;
  }

  // Members with a usable phone, deduped by number (each staff member once).
  const phones = Array.from(
    new Set(
      recipients
        .map((r) => normalizePhone(r.phone))
        .filter((p): p is string => p !== null),
    ),
  );

  if (phones.length === 0) return delivery;

  // The staff alert rides the engagement pipeline: template + toggle + log.
  const config = await resolveSafetyWhatsappConfig(supabase, clinicId);
  const body = renderSafetyAlertTemplate(config.template, {
    patientName: content.patientName,
    instrumentName: content.instrumentName,
    riskLevel: content.riskLevel,
    clinicName: content.clinicName,
    reviewUrl: content.reviewUrl,
  });

  // 2. WhatsApp — only when the automation is on and the clinic has a number.
  if (config.enabled) {
    try {
      const credentials = await getClinicWhatsappCredentials(clinicId);
      const results = await Promise.all(
        phones.map(async (phone) => {
          const result = await sendWhatsappText(credentials, phone, body);
          return result.ok ? phone : null;
        }),
      );
      delivery.whatsapp = results.filter((p): p is string => p !== null);

      // Mirror into engagement_logs so the outbound trail lives with the rest
      // of the clinic's WhatsApp history (best-effort; never fails the alert).
      if (delivery.whatsapp.length > 0) {
        try {
          await engagementLogMessage(supabase, {
            clinicId,
            patientId,
            automationType: SAFETY_ALERT_TYPE,
            status: "sent",
            responseData: {
              channel: "whatsapp",
              riskLevel: content.riskLevel,
              instrument: content.instrumentName,
              recipients: delivery.whatsapp,
            },
          });
        } catch (logError) {
          console.warn("[safety-notify] engagement log skipped", logError);
        }
      }
    } catch (error) {
      if (!(error instanceof WhatsappNotConnectedError)) {
        console.error("[safety-notify] whatsapp safety alert failed", {
          clinicId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // 3. SMS — best-effort placeholder until a provider is configured.
  const smsResults = await Promise.all(
    phones.map(async (phone) => ((await sendSafetySms(phone, body)) ? phone : null)),
  );
  delivery.sms = smsResults.filter((p): p is string => p !== null);

  return delivery;
}
