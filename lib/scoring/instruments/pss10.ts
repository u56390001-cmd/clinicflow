import type { InstrumentDefinition } from "@/lib/scoring/types";

/**
 * PSS-10 — Perceived Stress Scale (10-item).
 *
 * 10 items rated 0–4 ("Never" … "Very often"), plain sum 0–40. The four
 * positively-worded items (4, 5, 7, 8) are scored in reverse — the respondent
 * picks the same frequency labels, and the engine subtracts the pick from the
 * anchor maximum (4), which is exactly the published key:
 *   0–13 Low perceived stress · 14–26 Moderate · 27–40 High.
 *
 * The reversal lives on the item definitions (`reversed: true`), so it is
 * applied consistently to the total (and any future subscale) by the engine.
 */

const PSS_ANCHORS = [
  { value: 0, label: "Never" },
  { value: 1, label: "Almost never" },
  { value: 2, label: "Sometimes" },
  { value: 3, label: "Fairly often" },
  { value: 4, label: "Very often" },
];

const ITEM_TEXTS: Record<number, string> = {
  1: "In the last month, how often have you been upset because of something that happened unexpectedly?",
  2: "In the last month, how often have you felt that you were unable to control the important things in your life?",
  3: "In the last month, how often have you felt nervous and stressed?",
  4: "In the last month, how often have you felt confident about your ability to handle your personal problems?",
  5: "In the last month, how often have you felt that things were going your way?",
  6: "In the last month, how often have you found that you could not cope with all the things that you had to do?",
  7: "In the last month, how often have you been able to control irritations in your life?",
  8: "In the last month, how often have you felt that you were on top of things?",
  9: "In the last month, how often have you been angered because of things that were outside of your control?",
  10: "In the last month, how often have you felt difficulties were piling up so high that you could not overcome them?",
};

/** Positively-worded items scored in reverse (Cohen, 1994 key). */
const REVERSED_ITEMS = [4, 5, 7, 8];

export const PSS10: InstrumentDefinition = {
  code: "PSS-10",
  version: "1.0.0",
  name: "Perceived Stress Scale",
  shortName: "PSS-10",
  timeframe: "The last month",
  instructions:
    "For each question about the last month, pick how often you felt that way. Answer every question — scores cannot be calculated with gaps.",
  responseOptions: PSS_ANCHORS,
  items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((number) => ({
    id: `pss10_${number}`,
    text: ITEM_TEXTS[number],
    reversed: REVERSED_ITEMS.includes(number),
  })),
  scoring: {
    method: "sum",
    minScore: 0,
    maxScore: 40,
    note: "Sum of 10 items (0-4), with items 4, 5, 7 and 8 reversed (anchor max 4 minus the pick).",
    bands: [
      { min: 0, max: 13, label: "Low perceived stress" },
      { min: 14, max: 26, label: "Moderate perceived stress" },
      { min: 27, max: 40, label: "High perceived stress" },
    ],
  },
  subscales: [],
  imputation: { method: "mean_answered", maxMissing: 1 },
  safetyRules: [],
};
