import type {
  AssessmentRaterType,
  PsychAssessmentAdministrationMode,
  PsychAssessmentCompletedBy,
} from "@/types/database";

/**
 * Phase 7 — multi-rater respondent model (migration 0093).
 *
 * Pure, client-safe: no DB or server imports, so the workspace, the invite
 * panel and the manual-entry form all share one source of truth for rater
 * labels and the derived administration metadata.
 */

export const DEFAULT_RATER_TYPE: AssessmentRaterType = "SELF";

/** Ordered list for selectors + comparison rows (self → proxies). */
export const ASSESSMENT_RATERS: ReadonlyArray<{
  value: AssessmentRaterType;
  label: string;
}> = [
  { value: "SELF", label: "Patient (self-report)" },
  { value: "PARENT", label: "Parent" },
  { value: "TEACHER", label: "Teacher" },
  { value: "CAREGIVER", label: "Caregiver" },
  { value: "PARTNER", label: "Partner" },
  { value: "CLINICIAN", label: "Clinician" },
  { value: "OTHER", label: "Other informant" },
];

const RATER_LABELS: Record<AssessmentRaterType, string> = Object.fromEntries(
  ASSESSMENT_RATERS.map((rater) => [rater.value, rater.label]),
) as Record<AssessmentRaterType, string>;

export function raterLabel(rater: AssessmentRaterType | null | undefined): string {
  if (!rater) return RATER_LABELS.SELF;
  return RATER_LABELS[rater] ?? rater;
}

export function isAssessmentRaterType(value: unknown): value is AssessmentRaterType {
  return (
    typeof value === "string" &&
    ASSESSMENT_RATERS.some((rater) => rater.value === value)
  );
}

/**
 * The coarse administration mode implied by a respondent. Kept in lock-step
 * with the 0093 backfill: the patient's own report is SELF_REPORT, the
 * clinician's is CLINICIAN_ENTERED, and every third-party informant is PROXY.
 */
export function administrationModeForRater(
  rater: AssessmentRaterType,
): PsychAssessmentAdministrationMode {
  if (rater === "SELF") return "SELF_REPORT";
  if (rater === "CLINICIAN") return "CLINICIAN_ENTERED";
  return "PROXY";
}

/** Who typed the administration in, mirroring the 0087 backfill. */
export function completedByForRater(rater: AssessmentRaterType): PsychAssessmentCompletedBy {
  const mode = administrationModeForRater(rater);
  if (mode === "SELF_REPORT") return "patient_online";
  if (mode === "CLINICIAN_ENTERED") return "psychologist";
  return "reception";
}
