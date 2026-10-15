/**
 * Clinical safety alert — the WhatsApp template that carries a flagged
 * assessment to the care team. Lives in a client-safe module (no server imports)
 * because both sides use it:
 *
 *   - the scoring pipeline (`lib/scoring/safety-notify.ts`) renders + sends it;
 *   - the Engagement page (`components/engagement/safety-alert-card.tsx`) edits it.
 *
 * It slots into the existing engagement catalogue (migration 0062) as the
 * `safety_alert` template/automation type, so admins manage it exactly like the
 * patient reminders — same editor, same toggle, same WhatsApp connection.
 */

export const SAFETY_ALERT_TYPE = "safety_alert";

/** Variable tokens offered as one-tap chips in the Engagement editor. */
export const SAFETY_ALERT_VARIABLES = [
  "patient_name",
  "instrument_name",
  "risk_level",
  "clinic_name",
  "review_url",
] as const;

/**
 * Shipped default copy. Deliberately stark and actionable: who, what, why, and
 * a direct link to the record where triage must be logged. `*bold*` is WhatsApp
 * markup. Admins may override this in the Engagement page.
 */
export const DEFAULT_SAFETY_ALERT_TEMPLATE =
  "⚠ *Clinical Safety Alert*\n\nPatient: {patient_name}\nInstrument: {instrument_name}\nRisk level: {risk_level}\n\nPlease review the responses and record the appropriate triage action:\n{review_url}";

export type SafetyAlertTemplateVars = {
  patientName: string;
  instrumentName: string;
  riskLevel: string;
  clinicName: string;
  reviewUrl: string;
};

/**
 * Interpolate the safety-alert variables into the (admin-editable) template.
 * Unknown tokens are left untouched, mirroring the reminder interpolator.
 */
export function renderSafetyAlertTemplate(
  template: string,
  vars: SafetyAlertTemplateVars,
): string {
  return template
    .replace(/\{patient_name\}/g, vars.patientName)
    .replace(/\{instrument_name\}/g, vars.instrumentName)
    .replace(/\{risk_level\}/g, vars.riskLevel)
    .replace(/\{clinic_name\}/g, vars.clinicName)
    .replace(/\{review_url\}/g, vars.reviewUrl);
}
