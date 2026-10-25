/**
 * The Psychology Intake & History model (0083).
 *
 * One source of truth for the Intake tab's section definitions and the
 * per-field provenance map that drives the "Patient reported / AI extracted /
 * Clinician added · Updated" pills. Deliberately free of React and server
 * imports so the client tab, the server actions and the pre-visit submission
 * share exactly one definition.
 */

import type {
  IntakeFieldKey,
  IntakeProvenance,
  IntakeProvenanceEntry,
  PsychIntakeSuggestion,
} from "@/types/database";

/** Every `psych_intake` column the clinician records against. */
export const INTAKE_FIELD_KEYS: readonly IntakeFieldKey[] = [
  "presenting_concern",
  "presenting_concern_duration",
  "presenting_concern_severity",
  "presenting_concern_words",
  "sleep_quality",
  "appetite_energy",
  "personal_crisis_history",
  "previous_therapy_history",
  "previous_diagnosis",
  "family_mental_health_history",
  "trauma_history",
  "psychosocial_background",
  "stressors",
  "substance_use_history",
  "additional_clinical_notes",
];

/** Human labels for the Intake & History fields. */
export const INTAKE_FIELD_LABELS: Record<IntakeFieldKey, string> = {
  presenting_concern: "Main concern",
  presenting_concern_duration: "Duration",
  presenting_concern_severity: "Severity",
  presenting_concern_words: "Patient's own words",
  sleep_quality: "Sleep quality",
  appetite_energy: "Appetite & energy",
  personal_crisis_history: "Personal crisis history",
  previous_therapy_history: "Previous therapy history",
  previous_diagnosis: "Previous diagnosis",
  family_mental_health_history: "Family mental health history",
  trauma_history: "Trauma & adverse events",
  psychosocial_background: "Social & psychosocial history",
  stressors: "Current stressors",
  substance_use_history: "Substance use history",
  additional_clinical_notes: "Additional clinical notes",
};

/**
 * Coerces the stored `field_provenance` JSON (or an untrusted payload) into a
 * clean map. Unknown keys are dropped, the source/status are bounded, labels are
 * trimmed — a malformed row can never render junk.
 */
export function readIntakeProvenance(raw: unknown): IntakeProvenance {
  const out: IntakeProvenance = {};
  if (!raw || typeof raw !== "object") return out;
  const record = raw as Record<string, unknown>;
  for (const key of INTAKE_FIELD_KEYS) {
    const entry = record[key];
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as { source?: unknown; status?: unknown; label?: unknown };
    const source =
      candidate.source === "patient" || candidate.source === "ai" || candidate.source === "clinician"
        ? candidate.source
        : "clinician";
    const status = candidate.status === "updated" ? "updated" : "approved";
    const label =
      typeof candidate.label === "string" ? candidate.label.slice(0, 160).trim() || null : null;
    out[key] = { source, status, label };
  }
  return out;
}

/** A fresh provenance map with `field` set to `entry`. */
export function withIntakeProvenance(
  provenance: IntakeProvenance,
  field: IntakeFieldKey,
  entry: IntakeProvenanceEntry,
): IntakeProvenance {
  return { ...provenance, [field]: entry };
}

/**
 * What a clinician editing a field records. A brand-new value is credited to
 * the clinician; a clinician revising text that came from the patient form or
 * the AI review queue keeps the original source but is flagged "updated" so the
 * reviewer can see the record moved past the imported value.
 */
export function clinicianSaveEntry(
  prior: IntakeProvenanceEntry | undefined,
  hadPriorValue: boolean,
): IntakeProvenanceEntry {
  if (
    prior &&
    prior.source !== "clinician" &&
    prior.status === "approved" &&
    hadPriorValue
  ) {
    return { source: prior.source, status: "updated", label: prior.label ?? null };
  }
  return { source: "clinician", status: "approved", label: null };
}

/** What an approved AI suggestion records for its field. */
export function aiApprovalEntry(
  prior: IntakeProvenanceEntry | undefined,
  hadContent: boolean,
  label: string | null,
): IntakeProvenanceEntry {
  return {
    source: "ai",
    status: hadContent ? "updated" : "approved",
    label: label ?? prior?.label ?? null,
  };
}

/** What a "Accept all" bulk approval records for a field it touched. */
export function aiBulkEntry(
  prior: IntakeProvenanceEntry | undefined,
  hadContent: boolean,
  firstLabel: string | null,
): IntakeProvenanceEntry {
  return {
    source: "ai",
    status: hadContent ? "updated" : "approved",
    label: firstLabel ?? prior?.label ?? null,
  };
}

/** What the patient's own pre-visit form records for a field it filled. */
export function patientFillEntry(): IntakeProvenanceEntry {
  return { source: "patient", status: "approved", label: null };
}

/** The label shown for a suggestion source in the review queue. */
export function suggestionSourceLabel(source: PsychIntakeSuggestion["source"]): string {
  switch (source) {
    case "pre_visit":
      return "Pre-visit form";
    case "document":
      return "Uploaded document";
    case "session":
      return "Session notes";
    case "assessment":
      return "Assessment";
    case "ai":
      return "AI summary";
  }
}