import type { PsychIntake } from "@/types/database";

/**
 * The pre-visit questionnaire a patient completes before a psychology
 * appointment. Basic, low-friction questions that map onto the `psych_intake`
 * snapshot so the psychologist opens a partially-prepared record.
 *
 * `intakeField` names the `psych_intake` column a value lands in; patient
 * answers only ever fill a column that is still empty, never overwrite what a
 * clinician has written. `riskFlag` marks the one answer that also raises the
 * safety risk level.
 */

export type PreVisitAnswerKey =
  | "previous_therapy_history"
  | "previous_diagnosis"
  | "family_mental_health_history"
  | "psychosocial_background"
  | "stressors"
  | "substance_use_history"
  | "self_harm";

export type PreVisitQuestion = {
  key: PreVisitAnswerKey;
  label: string;
  help?: string;
  type: "choice" | "text" | "textarea";
  options?: readonly string[];
  required?: boolean;
  intakeField?: keyof Pick<
    PsychIntake,
    | "previous_therapy_history"
    | "previous_diagnosis"
    | "family_mental_health_history"
    | "psychosocial_background"
    | "stressors"
    | "substance_use_history"
  >;
  riskFlag?: boolean;
};

export const PRE_VISIT_QUESTIONS: readonly PreVisitQuestion[] = [
  {
    key: "stressors",
    label: "What has been worrying you most lately?",
    help: "In your own words — this is the main reason for your visit.",
    type: "textarea",
    required: true,
    intakeField: "stressors",
  },
  {
    key: "previous_therapy_history",
    label: "Have you had therapy or counselling before?",
    type: "choice",
    options: ["No", "Yes, in the past", "Yes, currently"],
    required: true,
    intakeField: "previous_therapy_history",
  },
  {
    key: "previous_diagnosis",
    label: "Have you ever been given a mental-health diagnosis?",
    help: "If yes, what was it? If no, leave this blank.",
    type: "textarea",
    intakeField: "previous_diagnosis",
  },
  {
    key: "family_mental_health_history",
    label: "Any mental-health conditions in your family?",
    type: "textarea",
    intakeField: "family_mental_health_history",
  },
  {
    key: "psychosocial_background",
    label: "Tell us a little about your background and support.",
    help: "Living situation, work or study, and the people around you.",
    type: "textarea",
    intakeField: "psychosocial_background",
  },
  {
    key: "substance_use_history",
    label: "Do you use alcohol, tobacco or other substances?",
    help: "How often, if at all — this stays private with your clinician.",
    type: "textarea",
    intakeField: "substance_use_history",
  },
  {
    key: "self_harm",
    label: "In the past month, have you had thoughts of harming yourself?",
    type: "choice",
    options: ["No", "Yes"],
    required: true,
    riskFlag: true,
  },
];
