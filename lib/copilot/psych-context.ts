import type { PatientPsychBundle } from "@/lib/patient-record";

/**
 * 🧠 The psychology copilot's full clinical bundle.
 *
 * The drawer's AI reads this string on every capture and command — intake,
 * psychometrics with trend, the structured care plan (0118 goals), the safety
 * snapshot and the last approved session notes — so a drafted BIRP note can
 * reference the patient's baseline ("PHQ-9 fell 18 → 9") instead of inventing
 * history it was never given. Pure string building on data the record already
 * fetched; nothing here re-queries the database.
 */
export function buildPsychClinicalContext(
  psych: PatientPsychBundle,
  patientName: string,
  /** Clinic-local short date formatting lives in the caller. */
  formatShortDate: (iso: string | null | undefined) => string,
): string {
  const cap = (value: string | null | undefined, max = 400): string =>
    (value ?? "").trim().length > max
      ? `${(value ?? "").trim().slice(0, max - 1)}…`
      : (value ?? "").trim();

  const sections: string[] = [];

  /* 1. Intake & history */
  const intake = psych.intake;
  if (intake) {
    const intakeLines: string[] = [];
    const concern = cap(intake.presenting_concern, 300);
    if (concern) {
      intakeLines.push(
        `Presenting concern: ${concern}${
          intake.presenting_concern_severity
            ? ` · severity ${intake.presenting_concern_severity}`
            : ""
        }${
          intake.presenting_concern_duration
            ? ` · duration ${intake.presenting_concern_duration}`
            : ""
        }`,
      );
    }
    if (intake.previous_diagnosis) intakeLines.push(`Previous diagnoses: ${cap(intake.previous_diagnosis, 200)}`);
    if (intake.previous_therapy_history) intakeLines.push(`Therapy history: ${cap(intake.previous_therapy_history, 200)}`);
    if (intake.stressors) intakeLines.push(`Current stressors: ${cap(intake.stressors, 200)}`);
    if (intake.personal_crisis_history) intakeLines.push(`Crisis history: ${cap(intake.personal_crisis_history, 200)}`);
    if (intake.family_mental_health_history) intakeLines.push(`Family mental health: ${cap(intake.family_mental_health_history, 150)}`);
    if (intake.substance_use_history) intakeLines.push(`Substance use: ${cap(intake.substance_use_history, 150)}`);
    if (intake.sleep_quality || intake.appetite_energy) {
      intakeLines.push(
        `Vegetative: sleep ${intake.sleep_quality || "—"} · appetite/energy ${intake.appetite_energy || "—"}`,
      );
    }
    if (intakeLines.length > 0) {
      sections.push(`INTAKE & HISTORY\n${intakeLines.join("\n")}`);
    }
  }

  /* 2. Psychometrics with trend */
  const byInstrument = new Map<string, typeof psych.assessments>();
  for (const assessment of psych.assessments) {
    const code = assessment.instrument_code ?? assessment.assessment_type;
    if (!code) continue;
    const list = byInstrument.get(code) ?? [];
    list.push(assessment);
    byInstrument.set(code, list);
  }
  const metricLines: string[] = [];
  for (const [code, list] of byInstrument) {
    const latest = list[0];
    const prior = list.find(
      (a) => a.id !== latest.id && a.conducted_at < latest.conducted_at,
    );
    const parts: string[] = [];
    if (latest.score !== null) {
      parts.push(
        `${latest.severity ? `${latest.severity} ` : ""}score ${latest.score}`,
      );
    } else if (latest.severity) {
      parts.push(latest.severity);
    }
    const when = formatShortDate(latest.conducted_at);
    let line = `- ${code}${when ? ` (last: ${when})` : ""}`;
    if (parts.length > 0) line += `: ${parts.join(", ")}`;
    if (
      prior?.score !== null &&
      prior?.score !== undefined &&
      latest.score !== null
    ) {
      const delta = latest.score - prior.score;
      line += ` · ${delta === 0 ? "no change" : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} vs previous (${prior.score})`}`;
    }
    if (latest.risk_level && latest.risk_level !== "NONE") {
      line += ` · RISK ${latest.risk_level}`;
    }
    metricLines.push(line);
  }
  if (metricLines.length > 0) {
    sections.push(`PSYCHOMETRICS (newest first)\n${metricLines.join("\n")}`);
  }

  /* 3. Structured care plan (0118) */
  const plan = psych.carePlan;
  if (plan) {
    const planLines: string[] = [];
    if (plan.diagnosis_problem_list?.trim()) {
      planLines.push(`Diagnosis/problem list: ${cap(plan.diagnosis_problem_list, 300)}`);
    }
    const goals = (plan.goals ?? []).filter(
      (goal) => goal.status === "active" || goal.status === "in_progress",
    );
    if (goals.length > 0) {
      planLines.push(
        `Active SMART goals:\n${goals
          .map((goal) => {
            const metrics =
              goal.baseline_metric || goal.target_metric
                ? ` (${[goal.baseline_metric, goal.target_metric]
                    .filter(Boolean)
                    .join(" → ")})`
                : "";
            const date = goal.target_date ? ` by ${goal.target_date}` : "";
            return `  - ${goal.title || "(untitled)"}${metrics}${date}`;
          })
          .join("\n")}`,
      );
    }
    if (plan.intervention_plan?.trim()) planLines.push(`Interventions: ${cap(plan.intervention_plan, 200)}`);
    if (plan.homework_assignments?.trim()) planLines.push(`Homework: ${cap(plan.homework_assignments, 200)}`);
    if (plan.follow_up_frequency?.trim()) planLines.push(`Follow-up: ${plan.follow_up_frequency}`);
    if (plan.psychiatrist_referral) planLines.push("Psychiatrist referral flagged");
    if (planLines.length > 0) {
      sections.push(`CARE PLAN\n${planLines.join("\n")}`);
    }
  }

  /* 4. Safety snapshot */
  const safety = psych.safety;
  if (safety) {
    const safetyLines = [
      `Risk level: ${safety.risk_level}`,
      safety.current_concerns ? `Current concerns: ${cap(safety.current_concerns, 250)}` : "",
      safety.risk_factors ? `Risk factors: ${cap(safety.risk_factors, 200)}` : "",
      safety.mental_health_summary ? `Summary: ${cap(safety.mental_health_summary, 250)}` : "",
    ].filter(Boolean);
    sections.push(`SAFETY\n${safetyLines.join("\n")}`);
  }

  /* 5. Recent approved session notes */
  const approved = psych.sessions
    .filter((session) => session.status === "approved")
    .slice(0, 2);
  if (approved.length > 0) {
    const sessionLines = approved.map((session) => {
      const between = [session.assessment, session.plan]
        .map((part) => cap(part, 300))
        .filter(Boolean)
        .join("\n  Plan/assess excerpt: ");
      return `- ${session.format} ${session.session_type} · ${formatShortDate(session.session_date)}:\n  ${between}`;
    });
    sections.push(`RECENT SESSION NOTES (approved)\n${sessionLines.join("\n")}`);
  }

  const bundle = sections.join("\n\n");
  return `Patient: ${patientName}\n\n${bundle}\n\nUse this context: reference real scores/trends and the active goals when they are relevant, and never invent history that is not listed above.`;
}
