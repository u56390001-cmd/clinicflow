import type { PatientPsychBundle } from "@/lib/patient-record";

/**
 * Whether a psychology bundle carries anything worth summarising.
 *
 * Shared by the server-side AI summary (to decide if a psych-only patient has a
 * record to generate from) and the client card (to decide whether to offer the
 * generate button). It lives in its own module because `lib/ai/patient-summary`
 * pulls in server-only provider code and must not be imported by a client
 * component.
 */
export function hasPsychSummaryContent(
  psych: PatientPsychBundle | undefined | null,
): boolean {
  if (!psych) return false;
  const safety = psych.safety;
  const intake = psych.intake;
  return Boolean(
    psych.assessments.length > 0 ||
      psych.sessions.length > 0 ||
      (safety &&
        (safety.risk_level !== "low" ||
          safety.risk_factors?.trim() ||
          safety.current_concerns?.trim() ||
          safety.mental_health_summary?.trim())) ||
      (intake &&
        (intake.stressors?.trim() ||
          intake.previous_diagnosis?.trim() ||
          intake.previous_therapy_history?.trim() ||
          intake.family_mental_health_history?.trim() ||
          intake.psychosocial_background?.trim() ||
          intake.substance_use_history?.trim())),
  );
}
