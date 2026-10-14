/**
 * Built-in psychometric instrument bank (PHQ-9, GAD-7, BDI-II, PCL-5).
 *
 * Each instrument owns its item list, its response anchors, and its scoring
 * bands, so the public assessment link can render and score a questionnaire
 * entirely from this data — there is no per-instrument branch in the UI.
 *
 * Scoring is a plain sum of the selected option values, which is how all four
 * instruments are scored. Severity comes from the band the total falls into.
 */

export const PSYCHOMETRIC_KEYS = ["PHQ-9", "GAD-7", "BDI-II", "PCL-5"] as const;

export type PsychometricKey = (typeof PSYCHOMETRIC_KEYS)[number];

export type PsychometricOption = { value: number; label: string };
export type PsychometricItem = { id: string; text: string };
export type SeverityBand = { min: number; max: number; label: string };

export type PsychometricInstrument = {
  key: PsychometricKey;
  name: string;
  shortName: string;
  timeframe: string;
  instructions: string;
  maxScore: number;
  options: readonly PsychometricOption[];
  items: readonly PsychometricItem[];
  bands: readonly SeverityBand[];
};

const FREQ_PHQ_GAD: readonly PsychometricOption[] = [
  { value: 0, label: "Not at all" },
  { value: 1, label: "Several days" },
  { value: 2, label: "More than half the days" },
  { value: 3, label: "Nearly every day" },
];

const FREQ_PCL: readonly PsychometricOption[] = [
  { value: 0, label: "Not at all" },
  { value: 1, label: "A little bit" },
  { value: 2, label: "Moderately" },
  { value: 3, label: "Quite a bit" },
  { value: 4, label: "Extremely" },
];

const SEVERITY_BDI: readonly PsychometricOption[] = [
  { value: 0, label: "None" },
  { value: 1, label: "Mild" },
  { value: 2, label: "Moderate" },
  { value: 3, label: "Severe" },
];

function items(prefix: string, texts: readonly string[]): readonly PsychometricItem[] {
  return texts.map((text, index) => ({ id: `${prefix}_${index + 1}`, text }));
}

const PHQ9 = {
  key: "PHQ-9",
  name: "Patient Health Questionnaire-9",
  shortName: "PHQ-9",
  timeframe: "Over the last 2 weeks",
  instructions:
    "Over the last 2 weeks, how often have you been bothered by any of the following problems?",
  maxScore: 27,
  options: FREQ_PHQ_GAD,
  items: items("phq9", [
    "Little interest or pleasure in doing things",
    "Feeling down, depressed, or hopeless",
    "Trouble falling or staying asleep, or sleeping too much",
    "Feeling tired or having little energy",
    "Poor appetite or overeating",
    "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
    "Trouble concentrating on things, such as reading the newspaper or watching television",
    "Moving or speaking so slowly that other people could have noticed — or the opposite, being so fidgety or restless that you have been moving around a lot more than usual",
    "Thoughts that you would be better off dead, or of hurting yourself in some way",
  ]),
  bands: [
    { min: 0, max: 4, label: "Minimal" },
    { min: 5, max: 9, label: "Mild" },
    { min: 10, max: 14, label: "Moderate" },
    { min: 15, max: 19, label: "Moderately severe" },
    { min: 20, max: 27, label: "Severe" },
  ],
} as const satisfies PsychometricInstrument;

const GAD7 = {
  key: "GAD-7",
  name: "Generalised Anxiety Disorder-7",
  shortName: "GAD-7",
  timeframe: "Over the last 2 weeks",
  instructions:
    "Over the last 2 weeks, how often have you been bothered by the following problems?",
  maxScore: 21,
  options: FREQ_PHQ_GAD,
  items: items("gad7", [
    "Feeling nervous, anxious, or on edge",
    "Not being able to stop or control worrying",
    "Worrying too much about different things",
    "Trouble relaxing",
    "Being so restless that it is hard to sit still",
    "Becoming easily annoyed or irritable",
    "Feeling afraid as if something awful might happen",
  ]),
  bands: [
    { min: 0, max: 4, label: "Minimal" },
    { min: 5, max: 9, label: "Mild" },
    { min: 10, max: 14, label: "Moderate" },
    { min: 15, max: 21, label: "Severe" },
  ],
} as const satisfies PsychometricInstrument;

const BDI2 = {
  key: "BDI-II",
  name: "Beck Depression Inventory-II",
  shortName: "BDI-II",
  timeframe: "Today",
  instructions:
    "Each item lists a group of statements. Choose the one that best describes the way you have been feeling today.",
  maxScore: 63,
  options: SEVERITY_BDI,
  items: items("bdi2", [
    "Sadness",
    "Pessimism",
    "Past failure",
    "Loss of pleasure",
    "Guilty feelings",
    "Punishment feelings",
    "Self-dislike",
    "Self-criticalness",
    "Suicidal thoughts or wishes",
    "Crying",
    "Agitation",
    "Loss of interest",
    "Indecisiveness",
    "Worthlessness",
    "Loss of energy",
    "Changes in sleeping pattern",
    "Irritability",
    "Changes in appetite",
    "Concentration difficulty",
    "Tiredness or fatigue",
    "Loss of interest in sex",
  ]),
  bands: [
    { min: 0, max: 13, label: "Minimal" },
    { min: 14, max: 19, label: "Mild" },
    { min: 20, max: 28, label: "Moderate" },
    { min: 29, max: 63, label: "Severe" },
  ],
} as const satisfies PsychometricInstrument;

const PCL5 = {
  key: "PCL-5",
  name: "PTSD Checklist for DSM-5",
  shortName: "PCL-5",
  timeframe: "Over the past month",
  instructions:
    "In the past month, how much were you bothered by each of the following problems?",
  maxScore: 80,
  options: FREQ_PCL,
  items: items("pcl5", [
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
  ]),
  // PCL-5 provisional cut-off per spec: >=31 indicates probable PTSD.
  bands: [
    { min: 0, max: 30, label: "Below clinical threshold" },
    { min: 31, max: 80, label: "Probable PTSD" },
  ],
} as const satisfies PsychometricInstrument;

export const PSYCHOMETRIC_INSTRUMENTS: Record<PsychometricKey, PsychometricInstrument> = {
  "PHQ-9": PHQ9,
  "GAD-7": GAD7,
  "BDI-II": BDI2,
  "PCL-5": PCL5,
};

export function isPsychometricKey(value: unknown): value is PsychometricKey {
  return typeof value === "string" && (PSYCHOMETRIC_KEYS as readonly string[]).includes(value);
}

/** Sum of the selected option values across an instrument's items. */
export function scoreInstrument(
  instrument: PsychometricInstrument,
  answers: Record<string, number>,
): number {
  return instrument.items.reduce((total, item) => total + (answers[item.id] ?? 0), 0);
}

/** The band label a score falls into, or null when out of range. */
export function severityFor(instrument: PsychometricInstrument, score: number): string | null {
  const band = instrument.bands.find((b) => score >= b.min && score <= b.max);
  return band?.label ?? null;
}
