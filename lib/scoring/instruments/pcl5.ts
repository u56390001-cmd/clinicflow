import type { InstrumentDefinition, InstrumentOption } from "@/lib/scoring/types";

/**
 * PCL-5 — PTSD Checklist for DSM-5 (Trauma / PTSD).
 *
 * Spec §1.4. 20 items, 0-4 Likert, sum 0-80, with DSM-5 symptom clusters:
 *   B intrusion (items 1-5), C avoidance (6-7), D negative cognitions/mood (8-14),
 *   E arousal/reactivity (15-20).
 *
 * Provisional PTSD (deterministic): >=1 cluster-B item, >=1 cluster-C item,
 * >=2 cluster-D items and >=2 cluster-E items each endorsed at >=2.
 *
 * CLINICAL-VALIDATION-REQUIRED:
 *   * Cutoff: spec §1.4 uses 0-30 below / 31-80 probable. (The pre-existing
 *     three-band UI table has been aligned to this.)
 *   * Imputation: cluster-specific mean, <=1 missing per cluster, <=4 overall.
 */

const OPTIONS: InstrumentOption[] = [
  { value: 0, label: "Not at all" },
  { value: 1, label: "A little bit" },
  { value: 2, label: "Moderately" },
  { value: 3, label: "Quite a bit" },
  { value: 4, label: "Extremely" },
];

const ITEM_TEXTS = [
  "Repeated, disturbing, and unwanted memories of the stressful experience",
  "Repeated, disturbing dreams of the stressful experience",
  "Suddenly feeling or acting as if the stressful experience were happening again",
  "Feeling very upset when something reminded you of the stressful experience",
  "Having strong physical reactions when something reminded you of the stressful experience",
  "Avoiding memories, thoughts, or feelings related to the stressful experience",
  "Avoiding external reminders of the stressful experience",
  "Trouble remembering important parts of the stressful experience",
  "Having strong negative beliefs about yourself, other people, or the world",
  "Blaming yourself or someone else for the stressful experience or what happened after it",
  "Having strong negative feelings such as fear, horror, anger, guilt, or shame",
  "Loss of interest in activities you used to enjoy",
  "Feeling distant or cut off from other people",
  "Trouble experiencing positive feelings",
  "Irritable behaviour, angry outbursts, or acting aggressively",
  "Taking too many risks or doing things that could cause you harm",
  "Being super alert or watchful or on guard",
  "Feeling jumpy or easily startled",
  "Having difficulty concentrating",
  "Trouble falling or staying asleep",
];

const CLUSTERS: Array<{ id: string; label: string; start: number; end: number }> = [
  { id: "B", label: "Cluster B · Intrusion", start: 1, end: 5 },
  { id: "C", label: "Cluster C · Avoidance", start: 6, end: 7 },
  { id: "D", label: "Cluster D · Negative cognition/mood", start: 8, end: 14 },
  { id: "E", label: "Cluster E · Arousal/reactivity", start: 15, end: 20 },
];

const items = ITEM_TEXTS.map((text, index) => {
  const n = index + 1;
  const cluster = CLUSTERS.find((c) => n >= c.start && n <= c.end);
  return { id: `pcl5_${n}`, text, subscaleId: cluster?.id };
});

export const PCL5: InstrumentDefinition = {
  code: "PCL-5",
  version: "1.0.0",
  name: "PTSD Checklist for DSM-5",
  shortName: "PCL-5",
  timeframe: "Over the past month",
  instructions:
    "In the past month, how much were you bothered by each of the following problems?",
  responseOptions: OPTIONS,
  items,
  scoring: {
    method: "sum",
    minScore: 0,
    maxScore: 80,
    note: "Sum of 20 items (0-4).",
    bands: [
      { min: 0, max: 30, label: "Below clinical threshold" },
      { min: 31, max: 80, label: "Probable PTSD" },
    ],
  },
  subscales: CLUSTERS.map((c) => ({
    id: c.id,
    label: c.label,
    itemIds: items.filter((i) => i.subscaleId === c.id).map((i) => i.id),
  })),
  imputation: { method: "subscale_mean", maxMissing: 4, maxMissingPerSubscale: 1 },
  safetyRules: [],
  diagnosticCriteria: ({ answers }) => {
    const endorsed = (id: string) => (answers[id] ?? 0) >= 2;
    const count = (ids: string[]) => ids.filter(endorsed).length;
    const clusterIds = (cluster: string) =>
      items.filter((i) => i.subscaleId === cluster).map((i) => i.id);
    const b = count(clusterIds("B"));
    const c = count(clusterIds("C"));
    const d = count(clusterIds("D"));
    const e = count(clusterIds("E"));
    const provisional = b >= 1 && c >= 1 && d >= 2 && e >= 2;
    return {
      result: {
        provisionalPtsd: provisional,
        endorsedCounts: { B: b, C: c, D: d, E: e },
        criteria: {
          B: b >= 1,
          C: c >= 1,
          D: d >= 2,
          E: e >= 2,
        },
      },
      note: provisional
        ? "DSM-5 provisional PTSD criteria met."
        : "DSM-5 provisional PTSD criteria not met.",
    };
  },
};
