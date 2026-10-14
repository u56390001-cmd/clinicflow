import { FREQ_0_3 } from "@/lib/scoring/instruments/phq9";
import type { InstrumentDefinition } from "@/lib/scoring/types";

/**
 * GAD-7 — Generalised Anxiety Disorder-7 (Anxiety).
 *
 * Spec §1.2. 7 items, 0-3 Likert, sum 0-21.
 *
 * CLINICAL-VALIDATION-REQUIRED: spec permits mean-imputing exactly 1 missing
 * item (its `round(7/6 × Σ)` proration is the same as single mean imputation).
 * GAD-7 has no suicide/safety item.
 */

const ITEM_TEXTS = [
  "Feeling nervous, anxious, or on edge",
  "Not being able to stop or control worrying",
  "Worrying too much about different things",
  "Trouble relaxing",
  "Being so restless that it is hard to sit still",
  "Becoming easily annoyed or irritable",
  "Feeling afraid as if something awful might happen",
];

export const GAD7: InstrumentDefinition = {
  code: "GAD-7",
  version: "1.0.0",
  name: "Generalised Anxiety Disorder-7",
  shortName: "GAD-7",
  timeframe: "Over the last 2 weeks",
  instructions:
    "Over the last 2 weeks, how often have you been bothered by the following problems?",
  responseOptions: FREQ_0_3,
  items: ITEM_TEXTS.map((text, index) => ({ id: `gad7_${index + 1}`, text })),
  scoring: {
    method: "sum",
    minScore: 0,
    maxScore: 21,
    note: "Sum of 7 items (0-3).",
    bands: [
      { min: 0, max: 4, label: "Minimal" },
      { min: 5, max: 9, label: "Mild" },
      { min: 10, max: 14, label: "Moderate" },
      { min: 15, max: 21, label: "Severe" },
    ],
  },
  subscales: [],
  imputation: { method: "mean_answered", maxMissing: 1 },
  safetyRules: [],
};
