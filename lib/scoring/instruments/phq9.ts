import type { InstrumentDefinition, InstrumentOption } from "@/lib/scoring/types";

/**
 * PHQ-9 — Patient Health Questionnaire-9 (Depression).
 *
 * Spec §1.1. 9 items, 0-3 Likert, sum 0-27.
 *
 * CLINICAL-VALIDATION-REQUIRED:
 *   * Missing items: spec permits mean-imputing exactly 1 missing item.
 *   * We deliberately DO NOT impute item 9 (self-harm) — a missing self-harm
 *     item invalidates the score rather than inventing a value for it.
 */

export const FREQ_0_3: InstrumentOption[] = [
  { value: 0, label: "Not at all" },
  { value: 1, label: "Several days" },
  { value: 2, label: "More than half the days" },
  { value: 3, label: "Nearly every day" },
];

const ITEM_TEXTS = [
  "Little interest or pleasure in doing things",
  "Feeling down, depressed, or hopeless",
  "Trouble falling or staying asleep, or sleeping too much",
  "Feeling tired or having little energy",
  "Poor appetite or overeating",
  "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
  "Trouble concentrating on things, such as reading the newspaper or watching television",
  "Moving or speaking so slowly that other people could have noticed — or the opposite, being so fidgety or restless that you have been moving around a lot more than usual",
  "Thoughts that you would be better off dead, or of hurting yourself in some way",
];

export const PHQ9: InstrumentDefinition = {
  code: "PHQ-9",
  version: "1.0.0",
  name: "Patient Health Questionnaire-9",
  shortName: "PHQ-9",
  timeframe: "Over the last 2 weeks",
  instructions:
    "Over the last 2 weeks, how often have you been bothered by any of the following problems?",
  responseOptions: FREQ_0_3,
  items: ITEM_TEXTS.map((text, index) => ({ id: `phq9_${index + 1}`, text })),
  scoring: {
    method: "sum",
    minScore: 0,
    maxScore: 27,
    note: "Sum of 9 items (0-3).",
    bands: [
      { min: 0, max: 4, label: "Minimal" },
      { min: 5, max: 9, label: "Mild" },
      { min: 10, max: 14, label: "Moderate" },
      { min: 15, max: 19, label: "Moderately severe" },
      { min: 20, max: 27, label: "Severe" },
    ],
  },
  subscales: [],
  imputation: { method: "mean_answered", maxMissing: 1 },
  neverImpute: ["phq9_9"],
  safetyRules: [
    {
      id: "phq9-self-harm-moderate",
      label: "PHQ-9 item 9 endorsed (self-harm thoughts)",
      itemId: "phq9_9",
      threshold: 1,
      riskLevel: "MODERATE",
    },
    {
      id: "phq9-self-harm-high",
      label: "PHQ-9 item 9 endorsed on most days",
      itemId: "phq9_9",
      threshold: 2,
      riskLevel: "HIGH",
    },
  ],
};
