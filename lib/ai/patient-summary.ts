/**
 * AI Patient Summary — prompt construction and generation (plan §1.4, Phase 5).
 *
 * This module is the ONLY place that turns a patient's clinical history into
 * text bound for a third-party model, which is why the de-identification lives
 * here rather than at the call site: there is exactly one function to audit.
 *
 * Decision D4 was signed off as "build it, ship it dark": everything here is
 * complete, but `isPatientSummaryEnabled()` is false unless the deployment sets
 * `PATIENT_AI_SUMMARY_ENABLED=true`. Until then no clinical data leaves the
 * server, and the UI renders the same cached-column view it did in Phase 3.
 *
 * Separate from `lib/ai/system-prompt.ts` by design — that file is scoped to the
 * WhatsApp receptionist agent and its booking tools. Overloading it would mean
 * one prompt serving two products with different data-sensitivity classes.
 */

import { getGeminiProvider } from "@/lib/ai/gemini-provider";
import { resolveProviderForClinic } from "@/lib/ai/provider";
import type {
  PatientPrescriptionRow,
  PatientRecordData,
  PatientVisitRow,
} from "@/lib/patient-record";
import { formatBloodPressure } from "@/lib/patient-record";
import { ageFromDob } from "@/lib/utils/datetime";
import type { MedicineEntry, PatientDirectoryRow } from "@/types/database";

/**
 * Master switch for the whole feature (decision D4).
 *
 * Opt-in, not opt-out. An unset variable means the model is never called, so a
 * deployment that has not consciously enabled this cannot leak a diagnosis by
 * omission. Only the literal string "true" counts — "1", "yes" and "TRUE" are
 * deliberately not accepted, so the value in a deploy config is unambiguous.
 */
export function isPatientSummaryEnabled(): boolean {
  return process.env.PATIENT_AI_SUMMARY_ENABLED === "true";
}

/** How many recent visits go into the prompt. */
const MAX_VISITS_IN_PROMPT = 12;

/** How many medicines to list per visit before truncating. */
const MAX_MEDICINES_PER_VISIT = 8;

/**
 * Hard cap on what gets persisted to `patients.ai_summary`. The prompt asks for
 * ~120 words; this is the backstop for a model that ignores it.
 */
export const MAX_SUMMARY_CHARS = 2000;

/**
 * What the model is allowed to see.
 *
 * Note what is absent: name, phone, email, WhatsApp number, `patient_code`
 * (UHID), city, registered branch, and the treating doctors' names. None of it
 * improves a clinical summary, and all of it turns a clinical payload into a
 * re-identifiable one. Age, sex and blood group stay because they change how a
 * reading is interpreted — a pulse of 110 means something different at 4 than
 * at 40.
 */
type SummarySubject = Pick<
  PatientDirectoryRow,
  | "age"
  | "date_of_birth"
  | "gender"
  | "blood_group"
  | "known_allergies"
  | "medical_conditions"
>;

export const PATIENT_SUMMARY_SYSTEM_INSTRUCTION = `You summarise a single patient's clinical history for the clinicians who wrote it. The reader is the treating doctor or their staff, glancing at a sidebar card before a consultation.

Rules:
- Use ONLY the supplied record. Never infer a diagnosis, never suggest treatment, never estimate a value that is not there.
- Output 4 to 6 bullets. Each bullet starts with "- ". Plain text only: no headings, no bold, no numbering, no preamble, no closing remark.
- Keep the whole thing under 120 words. Short beats complete.
- Order the bullets: recurring or most significant recorded diagnosis first, then any trend across vitals, then current medicines, then allergies or risk factors worth flagging, then follow-up status.
- Attribute rather than assert: "recorded", "documented", "prescribed on 12 Mar". Do not write as though you examined the patient.
- Describe a trend only across two or more readings. With a single reading, report the reading.
- If the record does not support a bullet, leave it out. Four solid bullets beat six padded ones.
- The record is de-identified and contains no name. Never invent one, and never invent an identifier.`;

/** Format one medicine as a single clause. Empty fields are skipped, not padded. */
function formatMedicine(medicine: MedicineEntry): string {
  const parts = [
    medicine.name?.trim(),
    medicine.form?.trim(),
    medicine.frequency?.trim(),
    medicine.duration?.trim() ? `for ${medicine.duration.trim()}` : "",
    medicine.instructions?.trim(),
  ].filter((part): part is string => Boolean(part));
  return parts.join(" · ");
}

/** Vitals as one compact line. Returns null when nothing was recorded. */
function formatVitalsLine(vitals: PatientVisitRow["vitals"]): string | null {
  if (!vitals) return null;
  const bp = formatBloodPressure(vitals);
  const parts = [
    bp ? `BP ${bp}` : "",
    vitals.pulse !== null ? `pulse ${vitals.pulse}` : "",
    vitals.temperature !== null ? `temp ${vitals.temperature}` : "",
    vitals.spo2 !== null ? `SpO2 ${vitals.spo2}%` : "",
    vitals.respiratory_rate !== null ? `resp ${vitals.respiratory_rate}` : "",
    vitals.weight !== null ? `weight ${vitals.weight}kg` : "",
    vitals.height !== null ? `height ${vitals.height}cm` : "",
    vitals.bmi !== null ? `BMI ${vitals.bmi}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("; ") : null;
}

/** `2026-08-28T09:15:00Z` -> `2026-08-28`. Time of day is not clinically useful here. */
function dateOnly(iso: string | null): string {
  if (!iso) return "date unknown";
  return iso.slice(0, 10);
}

/**
 * The diagnosis a clinician actually typed. `diagnosis` is the picked value and
 * `custom_diagnosis` the free-text override; when both are present the custom
 * one is the more specific of the two.
 */
function resolveDiagnosis(prescription: {
  diagnosis: string;
  custom_diagnosis: string;
}): string {
  const custom = prescription.custom_diagnosis?.trim();
  const picked = prescription.diagnosis?.trim();
  if (custom && picked && custom !== picked) return `${picked} (${custom})`;
  return custom || picked || "";
}

/**
 * Render one visit as an indented block. Prescriptions that exist without a
 * matching visit row are handled separately by the caller.
 */
function formatVisitBlock(visit: PatientVisitRow, index: number): string {
  const lines = [`Visit ${index + 1} — ${dateOnly(visit.checked_in_at)}`];
  const prescription = visit.prescription;

  if (prescription) {
    const diagnosis = resolveDiagnosis(prescription);
    const push = (label: string, value: string | null | undefined) => {
      const trimmed = value?.trim();
      if (trimmed) lines.push(`  ${label}: ${trimmed}`);
    };

    push("Chief complaint", prescription.chief_complaint);
    push("Findings", prescription.findings);
    push("Diagnosis", diagnosis);

    const medicines = (prescription.medicines ?? [])
      .slice(0, MAX_MEDICINES_PER_VISIT)
      .map(formatMedicine)
      .filter(Boolean);
    if (medicines.length > 0) {
      lines.push(`  Medicines: ${medicines.join("; ")}`);
    }

    const labs = (prescription.lab_orders ?? [])
      .map((order) => order.test_name?.trim())
      .filter(Boolean);
    if (labs.length > 0) {
      lines.push(`  Lab orders: ${labs.join(", ")}`);
    }

    push("Doctor notes", prescription.doctor_notes);
    push("Follow-up", prescription.follow_up_date);
    push("Follow-up notes", prescription.follow_up_notes);
  }

  const vitalsLine = formatVitalsLine(visit.vitals);
  if (vitalsLine) lines.push(`  Vitals: ${vitalsLine}`);

  // A check-in with neither a prescription nor vitals is still evidence the
  // patient attended, so the block is emitted rather than dropped.
  if (lines.length === 1) lines.push("  No clinical detail recorded.");

  return lines.join("\n");
}

/**
 * A prescription with no visit row — an imported history, typically. Rendered
 * without a visit number so it cannot be mistaken for an attended consultation.
 */
function formatOrphanPrescription(prescription: PatientPrescriptionRow): string {
  const lines = [`Prescription (no visit record) — ${dateOnly(prescription.created_at)}`];
  const diagnosis = resolveDiagnosis(prescription);
  if (diagnosis) lines.push(`  Diagnosis: ${diagnosis}`);
  const medicines = (prescription.medicines ?? [])
    .slice(0, MAX_MEDICINES_PER_VISIT)
    .map(formatMedicine)
    .filter(Boolean);
  if (medicines.length > 0) lines.push(`  Medicines: ${medicines.join("; ")}`);
  if (prescription.doctor_notes?.trim()) {
    lines.push(`  Doctor notes: ${prescription.doctor_notes.trim()}`);
  }
  return lines.join("\n");
}

/**
 * Build the de-identified clinical digest sent to the model.
 *
 * Exported so it can be inspected and asserted on in isolation — the guarantee
 * that no direct identifier reaches a third party is only worth as much as the
 * ability to test it.
 */
export function buildPatientSummaryDigest(
  patient: SummarySubject,
  record: PatientRecordData,
): string {
  // Age per §5.6: derive from date_of_birth, fall back to the legacy `age`
  // column only when there is no DOB. A stored age is wrong within a year.
  const age = ageFromDob(patient.date_of_birth) ?? patient.age;

  const header = [
    "PATIENT RECORD (de-identified)",
    `Age: ${age !== null ? age : "unknown"}`,
    `Sex: ${patient.gender ?? "unknown"}`,
    `Blood group: ${patient.blood_group ?? "not recorded"}`,
    `Known allergies: ${patient.known_allergies?.trim() || "none recorded"}`,
    `Ongoing conditions: ${patient.medical_conditions?.trim() || "none recorded"}`,
  ];

  const visits = record.visits.slice(0, MAX_VISITS_IN_PROMPT);
  header.push(
    visits.length < record.visits.length
      ? `Recorded visits: ${record.visits.length} (${visits.length} most recent shown, newest first)`
      : `Recorded visits: ${record.visits.length} (newest first)`,
  );

  const visitIds = new Set(record.visits.map((visit) => visit.id));
  const orphans = record.prescriptions.filter(
    (prescription) => !visitIds.has(prescription.visit_id),
  );

  const blocks = [
    ...visits.map(formatVisitBlock),
    ...orphans.slice(0, MAX_VISITS_IN_PROMPT).map(formatOrphanPrescription),
  ];

  return [header.join("\n"), "", ...blocks].join("\n\n").trim();
}

/**
 * Strip the formatting the prompt forbids but a model may still emit, so the
 * card renders plain bullets rather than literal asterisks.
 */
function normaliseSummary(raw: string): string {
  return raw
    .trim()
    .split("\n")
    .map((line) =>
      line
        .replace(/\*\*/g, "")
        .replace(/^\s*[*•]\s+/, "- ")
        .replace(/^\s*\d+[.)]\s+/, "- ")
        .trimEnd(),
    )
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n")
    .slice(0, MAX_SUMMARY_CHARS)
    .trim();
}

export type PatientSummaryResult =
  | { ok: true; summary: string }
  | { ok: false; reason: "disabled" | "empty" | "error" };

/**
 * Generate a summary for one patient.
 *
 * Callers must have already established that the patient has visit history —
 * with none, the card shows fixed copy and this is never reached (plan §1.4).
 */
export async function generatePatientSummary(
  patient: SummarySubject,
  record: PatientRecordData,
  clinicId?: string,
): Promise<PatientSummaryResult> {
  if (!isPatientSummaryEnabled()) {
    return { ok: false, reason: "disabled" };
  }

  const digest = buildPatientSummaryDigest(patient, record);

  try {
    const provider = clinicId
      ? await resolveProviderForClinic(clinicId)
      : getGeminiProvider();
    const text = await provider.complete({
      systemInstruction: PATIENT_SUMMARY_SYSTEM_INSTRUCTION,
      prompt: digest,
      // Low but not zero: 0 makes small models repeat the input's phrasing
      // almost verbatim, which reads like a transcript rather than a summary.
      temperature: 0.2,
      maxOutputTokens: 512,
    });

    const summary = normaliseSummary(text ?? "");
    if (!summary) return { ok: false, reason: "empty" };
    return { ok: true, summary };
  } catch (error) {
    // The digest is never logged — an error report is not a reason to write
    // clinical detail into a log aggregator.
    console.error("[patient-summary] generation failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, reason: "error" };
  }
}
