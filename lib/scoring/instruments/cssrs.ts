import type { InstrumentDefinition, InstrumentOption } from "@/lib/scoring/types";

/**
 * C-SSRS — Columbia-Suicide Severity Rating Scale, Screening Version.
 *
 * Spec §1.3. Binary (Yes/No) structured branching.
 *   Q1 Wish to be dead. Q2 Non-specific active suicidal thoughts.
 *   Q3 Active ideation, any methods, no intent. Q4 Active ideation with some
 *   intent, no specific plan. Q5 Active ideation with specific plan and intent.
 *   Q6 Suicidal behavior history.
 *
 * Branching: Q1, Q2, Q6 always administered. Q3-Q5 administered only when Q2=Yes;
 * when Q2=No they are *not applicable* (not "missing").
 *
 * Risk stratification (spec §1.3 matrix):
 *   LOW      Q1 or Q2 = Yes; Q3-Q6 = No
 *   MODERATE Q3 = Yes
 *   HIGH     Q4, Q5 or Q6 = Yes
 *
 * CLINICAL-VALIDATION-REQUIRED: this is the specification's 6-item screener
 * matrix. It is a simplification of the full published C-SSRS triage (which
 * uses 5 ideation levels, 4 behavior categories, past-month vs lifetime
 * windows). Requires psychiatrist/clinical sign-off before clinical use.
 */

const OPTIONS: InstrumentOption[] = [
  { value: 0, label: "No" },
  { value: 1, label: "Yes" },
];

const ITEMS: Array<{ id: string; text: string }> = [
  { id: "cssrs_1", text: "Wish to be dead" },
  { id: "cssrs_2", text: "Non-specific active suicidal thoughts" },
  {
    id: "cssrs_3",
    text: "Active suicidal ideation with any methods (not plan) without intent to act",
  },
  {
    id: "cssrs_4",
    text: "Active suicidal ideation with some intent to act, without specific plan",
  },
  {
    id: "cssrs_5",
    text: "Active suicidal ideation with specific plan and intent",
  },
  { id: "cssrs_6", text: "Suicidal behavior history (past 3 months / lifetime)" },
];

export const CSSRS: InstrumentDefinition = {
  code: "C-SSRS",
  version: "1.0.0",
  name: "Columbia-Suicide Severity Rating Scale (Screen)",
  shortName: "C-SSRS",
  timeframe: "Past month (behaviour: lifetime / past 3 months)",
  instructions:
    "Please answer each question as it applies to you over the stated timeframe. Some questions are only asked depending on your previous answer.",
  responseOptions: OPTIONS,
  items: ITEMS,
  scoring: {
    method: "sum",
    minScore: 0,
    maxScore: 6,
    note: "Not a numeric sum — risk stratification (Low / Moderate / High).",
    bands: [],
  },
  subscales: [],
  imputation: { method: "none", maxMissing: 0 },
  safetyRules: [],
  branching: [
    {
      items: ["cssrs_3", "cssrs_4", "cssrs_5"],
      dependsOn: "cssrs_2",
      showWhen: [1],
    },
  ],
  riskOverride: ({ answers }) => {
    const yes = (id: string) => answers[id] === 1;
    const reasons: string[] = [];
    if (yes("cssrs_4")) reasons.push("C-SSRS Q4: active ideation with intent");
    if (yes("cssrs_5")) reasons.push("C-SSRS Q5: active ideation with plan and intent");
    if (yes("cssrs_6")) reasons.push("C-SSRS Q6: suicidal behavior history");
    if (reasons.length > 0) return { riskLevel: "HIGH", reasons };
    if (yes("cssrs_3")) {
      return { riskLevel: "MODERATE", reasons: ["C-SSRS Q3: active ideation, any methods, no intent"] };
    }
    if (yes("cssrs_1")) reasons.push("C-SSRS Q1: wish to be dead");
    if (yes("cssrs_2")) reasons.push("C-SSRS Q2: non-specific active suicidal thoughts");
    if (reasons.length > 0) return { riskLevel: "LOW", reasons };
    return { riskLevel: "NONE", reasons: [] };
  },
  deriveSeverity: ({ riskLevel }) => {
    switch (riskLevel) {
      case "HIGH":
        return "High Risk";
      case "MODERATE":
        return "Moderate Risk";
      case "LOW":
        return "Low Risk";
      default:
        return "No Risk";
    }
  },
  diagnosticCriteria: ({ answers }) => {
    const yes = (id: string) => answers[id] === 1;
    let highestIdeation = 0;
    for (const n of [1, 2, 3, 4, 5]) {
      if (yes(`cssrs_${n}`)) highestIdeation = n;
    }
    return {
      result: {
        highestIdeationLevel: highestIdeation,
        suicidalBehavior: yes("cssrs_6"),
      },
    };
  },
};
