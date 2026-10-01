/**
 * Colour + wording for a vital, given the reading and whether it is in range.
 *
 * Lives here rather than inside a tab because the same threshold question gets
 * asked in more than one place — the snapshot card and each expanded visit row —
 * and two copies of "what counts as high" is how a chart ends up contradicting
 * itself. One definition, imported by every surface that needs it.
 */

import type { Vitals } from "@/types/database";

export type StatusTag = { label: string; pill: string } | null;

export const NORMAL_TAG: StatusTag = {
  label: "Normal",
  pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};
export const HIGH_TAG: StatusTag = {
  label: "High",
  pill: "bg-red-50 text-red-700 ring-red-600/20",
};
export const LOW_TAG: StatusTag = {
  label: "Low",
  pill: "bg-amber-50 text-amber-700 ring-amber-600/20",
};
export const MISSING_TAG: StatusTag = {
  label: "Not recorded",
  pill: "bg-slate-100 text-slate-500 ring-slate-500/20",
};

/** Adult reference ranges. Out-of-range readings get a tag, not a colour alone. */
export function bpTag(vitals: Vitals): StatusTag {
  const { systolic_bp: sys, diastolic_bp: dia } = vitals;
  if (sys === null && dia === null) {
    // Legacy free-text readings have no numbers to threshold, so they are
    // reported as recorded rather than guessed at.
    return vitals.blood_pressure?.trim() ? NORMAL_TAG : MISSING_TAG;
  }
  if ((sys !== null && sys >= 140) || (dia !== null && dia >= 90)) return HIGH_TAG;
  if ((sys !== null && sys < 90) || (dia !== null && dia < 60)) return LOW_TAG;
  return NORMAL_TAG;
}

export function pulseTag(pulse: number | null): StatusTag {
  if (pulse === null) return MISSING_TAG;
  if (pulse > 100 || pulse < 60) return HIGH_TAG;
  return NORMAL_TAG;
}

export function spo2Tag(spo2: number | null): StatusTag {
  if (spo2 === null) return MISSING_TAG;
  if (spo2 < 90) return HIGH_TAG;
  if (spo2 < 95) return LOW_TAG;
  return NORMAL_TAG;
}

/**
 * Temperature is stored in **Fahrenheit**, not Celsius: the check-in form labels
 * the field `°F`, `vitalsSchema` accepts 85–115, and the printable Rx sheet
 * prints `°F`. The cut-offs below are therefore the Fahrenheit equivalents of
 * the febrile and hypothermic thresholds — 100.4 °F and 95 °F — so a normal
 * 98.6 °F reads as Normal and a genuine 101.4 °F reads as High.
 *
 * (These thresholds were previously the Celsius numbers 38 and 35, which every
 * Fahrenheit reading cleared, so a patient with a normal temperature was
 * consistently tagged High.)
 */
export function tempTag(temp: number | null): StatusTag {
  if (temp === null) return MISSING_TAG;
  if (temp >= 100.4) return HIGH_TAG;
  if (temp < 95) return LOW_TAG;
  return NORMAL_TAG;
}

/**
 * Blood sugar in mg/dL, against the fasting reference range a clinic screening
 * reading is judged by (70–99 fasting normal; ADA "prediabetes" starts at 100).
 *
 * A random post-meal reading has no single normal range, so this tag is a
 * screen, not a diagnosis — the same caveat the BMI category carries. It is
 * drawn with the established HIGH/LOW/NORMAL vocabulary rather than a new set,
 * so a card that shows one does not stand out from the cards beside it.
 */
export function bloodSugarTag(sugar: number | null): StatusTag {
  if (sugar === null) return MISSING_TAG;
  if (sugar > 140) return HIGH_TAG;
  if (sugar < 70) return LOW_TAG;
  return NORMAL_TAG;
}
