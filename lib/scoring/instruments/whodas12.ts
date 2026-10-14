import type { InstrumentDefinition, InstrumentOption } from "@/lib/scoring/types";

/**
 * WHODAS 2.0 — WHO Disability Assessment Schedule, 12-item self-report.
 *
 * Spec §1.5. 12 items (2 per domain), 0-4 Likert, raw sum 0-48, and a scaled
 * 0-100 metric: round(raw / 48 × 100, 1 dp).
 *
 * CLINICAL-VALIDATION-REQUIRED:
 *   * This implements the specification's "simple scoring" approximation.
 *     The official WHODAS 2.0 uses a complex weighted scoring algorithm and,
 *     in the 36-item version, recoding of "days" items. Neither is applied.
 *   * Severity bands below follow the spec but are unverified against the WHO
 *     published reference tables.
 */

const OPTIONS: InstrumentOption[] = [
  { value: 0, label: "None" },
  { value: 1, label: "Mild" },
  { value: 2, label: "Moderate" },
  { value: 3, label: "Severe" },
  { value: 4, label: "Extreme or cannot do" },
];

const DOMAINS: Array<{ id: string; label: string }> = [
  { id: "cognition", label: "Cognition" },
  { id: "mobility", label: "Mobility" },
  { id: "self_care", label: "Self-care" },
  { id: "getting_along", label: "Getting along" },
  { id: "life_activities", label: "Life activities" },
  { id: "participation", label: "Participation" },
];

const ITEM_TEXTS = [
  "Standing for long periods such as 30 minutes",
  "Taking care of your household responsibilities",
  "Learning a new task, for example learning how to get to a new place",
  "How much of a problem did you have joining in community activities?",
  "How much of a problem did you have because of your health conditions, emotionally?",
  "Concentrating on doing something for 10 minutes",
  "Walking a long distance such as a kilometre",
  "Washing your whole body",
  "Getting dressed",
  "Dealing with people you do not know",
  "Maintaining a friendship",
  "Your day-to-day work or school activities",
];

const items = ITEM_TEXTS.map((text, index) => {
  const n = index + 1;
  // 2 items per domain: (1,2)->cognition, (3,4)->mobility, etc.
  const domain = DOMAINS[Math.floor(index / 2)];
  return { id: `whodas_${n}`, text, subscaleId: domain.id };
});

export const WHODAS12: InstrumentDefinition = {
  code: "WHODAS-2.0",
  version: "1.0.0",
  name: "WHO Disability Assessment Schedule 2.0 (12-item)",
  shortName: "WHODAS 2.0",
  timeframe: "In the last 30 days",
  instructions:
    "In the last 30 days, how much difficulty did you have in doing each of the following?",
  responseOptions: OPTIONS,
  items,
  scoring: {
    method: "sum",
    minScore: 0,
    maxScore: 48,
    note: "Sum of 12 items (0-4); scaled metric = raw / 48 × 100.",
    bands: [
      { min: 0, max: 4, label: "Little to no disability" },
      { min: 5, max: 9, label: "Mild disability" },
      { min: 10, max: 19, label: "Moderate disability" },
      { min: 20, max: 29, label: "Severe disability" },
      { min: 30, max: 48, label: "Extreme disability" },
    ],
  },
  subscales: DOMAINS.map((d) => ({
    id: d.id,
    label: d.label,
    itemIds: items.filter((i) => i.subscaleId === d.id).map((i) => i.id),
  })),
  imputation: { method: "mean_answered", maxMissing: 1 },
  safetyRules: [],
  scaledScore: (rawScore) => Math.round((rawScore / 48) * 100 * 10) / 10,
};
