import type { InstrumentDefinition } from "@/lib/scoring/types";

/**
 * DASS-21 — Depression, Anxiety and Stress Scale (21-item short form).
 *
 * 21 items rated 0–3. Published short-form scoring doubles each subscale sum
 * (D/A/S) before applying the severity table, so subscale ranges run 0–42.
 * The record stores the raw 21-item sum (0–63) as the total score; severity
 * comes from the *most severe* subscale after doubling, via `deriveSeverity`.
 *
 * THE three subscale sums land in `subscale_scores` under the ids D / A / S —
 * these are the published raw sums (0–21 each); every consumer applies the ×2
 * multiplier through the bands below before comparing, which keeps the stored
 * numbers in one convention (raw picks).
 *
 * The item texts are the public-domain Lovibond & Lovibond (1995) short form.
 */

const DASS_ANCHORS = [
  { value: 0, label: "Did not apply to me at all" },
  { value: 1, label: "Applied to me to some degree, or some of the time" },
  { value: 2, label: "Applied to me to a considerable degree, or a good part of the time" },
  { value: 3, label: "Applied to me very much, or most of the time" },
];

/** Subscale band tables, on the DOUBLED (0–42) published scale. */
const DEPRESSION_BANDS = [
  { min: 0, max: 9, label: "Normal", rank: 0 },
  { min: 10, max: 13, label: "Mild", rank: 1 },
  { min: 14, max: 20, label: "Moderate", rank: 2 },
  { min: 21, max: 27, label: "Severe", rank: 3 },
  { min: 28, max: 42, label: "Extremely severe", rank: 4 },
];

const ANXIETY_BANDS = [
  { min: 0, max: 7, label: "Normal", rank: 0 },
  { min: 8, max: 9, label: "Mild", rank: 1 },
  { min: 10, max: 14, label: "Moderate", rank: 2 },
  { min: 15, max: 19, label: "Severe", rank: 3 },
  { min: 20, max: 42, label: "Extremely severe", rank: 4 },
];

const STRESS_BANDS = [
  { min: 0, max: 14, label: "Normal", rank: 0 },
  { min: 15, max: 18, label: "Mild", rank: 1 },
  { min: 19, max: 25, label: "Moderate", rank: 2 },
  { min: 26, max: 33, label: "Severe", rank: 3 },
  { min: 34, max: 42, label: "Extremely severe", rank: 4 },
];

const ITEM_TEXTS = [
  "I found it hard to wind down",
  "I was aware of dryness of my mouth",
  "I couldn't seem to experience any positive feeling at all",
  "I experienced breathing difficulty (e.g. excessively rapid breathing, breathlessness in the absence of physical exertion)",
  "I found it difficult to work up the initiative to do things",
  "I tended to over-react to situations",
  "I experienced trembling (e.g. in the hands)",
  "I felt that I was using a lot of nervous energy",
  "I was worried about situations in which I might panic and make a fool of myself",
  "I felt that I had nothing to look forward to",
  "I found myself getting agitated",
  "I found it difficult to relax",
  "I felt down-hearted and blue",
  "I was intolerant of anything that kept me from getting on with what I was doing",
  "I felt I was close to panic",
  "I was unable to become enthusiastic about anything",
  "I felt I wasn't worth much as a person",
  "I felt that I was rather touchy",
  "I was aware of the action of my heart in the absence of physical exertion (e.g. sense of heart rate increase, heart missing a beat)",
  "I felt scared without any good reason",
  "I felt that life was meaningless",
];

/** 1-indexed item numbers per subscale (Lovibond & Lovibond, 1995). */
const DEPRESSION_ITEMS = [3, 5, 10, 13, 16, 17, 21];
const ANXIETY_ITEMS = [2, 4, 7, 9, 15, 19, 20];
const STRESS_ITEMS = [1, 6, 8, 11, 12, 14, 18];

export const DASS21: InstrumentDefinition = {
  code: "DASS-21",
  version: "1.0.0",
  name: "Depression, Anxiety and Stress Scale (21)",
  shortName: "DASS-21",
  timeframe: "Over the past week",
  instructions:
    "Over the past week, how much did each statement apply to you? There are no right or wrong answers.",
  responseOptions: DASS_ANCHORS,
  items: ITEM_TEXTS.map((text, index) => ({
    id: `dass21_${index + 1}`,
    text,
    subscaleId: DEPRESSION_ITEMS.includes(index + 1)
      ? "D"
      : ANXIETY_ITEMS.includes(index + 1)
        ? "A"
        : "S",
  })),
  scoring: {
    method: "sum",
    minScore: 0,
    maxScore: 63,
    note: "Sum of 21 items (0-3). Severity reads the D/A/S subscale sums doubled (x2, DASS-21 short form), taking the highest band of the three.",
    // The published severity table lives on the subscales, not the total —
    // `deriveSeverity` below is the authority. The bands kept here cover only
    // the raw total for fallback display.
    bands: [],
  },
  subscales: [
    { id: "D", label: "Depression", itemIds: DEPRESSION_ITEMS.map((n) => `dass21_${n}`) },
    { id: "A", label: "Anxiety", itemIds: ANXIETY_ITEMS.map((n) => `dass21_${n}`) },
    { id: "S", label: "Stress", itemIds: STRESS_ITEMS.map((n) => `dass21_${n}`) },
  ],
  imputation: { method: "mean_answered", maxMissing: 2 },
  safetyRules: [],
  deriveSeverity: ({ subscaleScores }) => {
    const highest = (sum: number, bandsrows: typeof DEPRESSION_BANDS) => {
      const row = bandsrows.find((band) => sum >= band.min && sum <= band.max);
      return row ? { label: row.label, rank: row.rank } : null;
    };
    const candidates = [
      highest((subscaleScores.D ?? 0) * 2, DEPRESSION_BANDS),
      highest((subscaleScores.A ?? 0) * 2, ANXIETY_BANDS),
      highest((subscaleScores.S ?? 0) * 2, STRESS_BANDS),
    ].filter((entry): entry is { label: string; rank: number } => entry !== null);
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => b.rank - a.rank)[0].label;
  },
};
