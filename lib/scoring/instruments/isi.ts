import type { InstrumentDefinition } from "@/lib/scoring/types";

/**
 * ISI — Insomnia Severity Index.
 *
 * 7 items rated 0–4, plain sum 0–28. Published bands:
 *   0–7    No clinically significant insomnia
 *   8–14   Subthreshold insomnia
 *   15–21  Clinical insomnia (moderate)
 *   22–28  Clinical insomnia (severe)
 */

const ISI_ANCHORS = [
  { value: 0, label: "Not at all / None" },
  { value: 1, label: "A little" },
  { value: 2, label: "Somewhat" },
  { value: 3, label: "Much" },
  { value: 4, label: "Very much / Severe" },
];

const ITEM_TEXTS = [
  "Difficulty falling asleep",
  "Difficulty staying asleep",
  "Problem waking up too early",
  "How SATISFIED/DISSATISFIED are you with your current sleep pattern?",
  "How noticeable to others do you think your sleep problem is in terms of impairing the quality of your life?",
  "How WORRIED/DISTRESSED are you about your current sleep problem?",
  "To what extent do you consider your sleep problem to interfere with daily functioning (e.g. daytime fatigue, mood, ability to function at work/daily chores)?",
];

export const ISI: InstrumentDefinition = {
  code: "ISI",
  version: "1.0.0",
  name: "Insomnia Severity Index",
  shortName: "ISI",
  timeframe: "The past 2 weeks",
  instructions:
    "Rate your sleep over the past two weeks. Answer all seven questions for an accurate score.",
  responseOptions: ISI_ANCHORS,
  items: ITEM_TEXTS.map((text, index) => ({ id: `isi_${index + 1}`, text })),
  scoring: {
    method: "sum",
    minScore: 0,
    maxScore: 28,
    note: "Sum of 7 items (0-4).",
    bands: [
      { min: 0, max: 7, label: "No clinically significant insomnia" },
      { min: 8, max: 14, label: "Subthreshold insomnia" },
      { min: 15, max: 21, label: "Clinical insomnia (moderate)" },
      { min: 22, max: 28, label: "Clinical insomnia (severe)" },
    ],
  },
  subscales: [],
  imputation: { method: "mean_answered", maxMissing: 1 },
  safetyRules: [],
};
