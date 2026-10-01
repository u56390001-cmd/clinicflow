/**
 * The canonical vitals field set — one source of truth for every form that
 * records vitals.
 *
 * Both the full `VitalsForm` (queue, consultation) and the compact
 * rail form read this list, so a doctor's `standard_vitals` config means the
 * same thing on both screens and a new vital is added in one place.
 */

export type StandardVitalKey =
  | "blood_pressure"
  | "pulse"
  | "temperature"
  | "spo2"
  | "respiratory_rate"
  | "weight"
  | "height"
  | "blood_sugar";

export type StandardVitalMeta = {
  key: StandardVitalKey;
  label: string;
  /** Short label for dense layouts where the full name will not fit. */
  short: string;
  unit: string;
  placeholder: string;
  min?: number;
  max?: number;
  step?: string;
  /** Free-text input (e.g. "120/80") instead of a numeric field. */
  text?: boolean;
};

/** Standard vitals in canonical order (keys match the vitals config). */
export const STANDARD_VITALS: StandardVitalMeta[] = [
  {
    key: "blood_pressure",
    label: "Blood Pressure",
    short: "BP",
    unit: "mmHg",
    placeholder: "120/80",
    text: true,
  },
  { key: "pulse", label: "Pulse", short: "Pulse", unit: "bpm", placeholder: "72", min: 30, max: 300 },
  {
    key: "temperature",
    label: "Temperature",
    short: "Temp",
    unit: "°F",
    placeholder: "98.6",
    min: 85,
    max: 115,
    step: "0.1",
  },
  { key: "spo2", label: "SpO₂", short: "SpO₂", unit: "%", placeholder: "98", min: 0, max: 100 },
  {
    key: "respiratory_rate",
    label: "Respiratory Rate",
    short: "Resp",
    unit: "bpm",
    placeholder: "16",
    min: 4,
    max: 60,
  },
  { key: "weight", label: "Weight", short: "Wt", unit: "kg", placeholder: "70", min: 1, max: 500, step: "0.1" },
  { key: "height", label: "Height", short: "Ht", unit: "cm", placeholder: "170", min: 1, max: 300, step: "0.1" },
  {
    key: "blood_sugar",
    label: "Blood Sugar",
    short: "Sugar",
    unit: "mg/dL",
    placeholder: "95",
    min: 1,
    max: 800,
    step: "0.1",
  },
];

/**
 * Map pre-redesign config keys (split systolic/diastolic BP) onto the single
 * Blood Pressure key so earlier doctor configs keep working.
 */
export function normalizeStandardKeys(keys: string[] | null): string[] {
  const seen = new Set<string>();
  for (const key of keys ?? []) {
    if (key === "systolic_bp" || key === "diastolic_bp") {
      seen.add("blood_pressure");
    } else {
      seen.add(key);
    }
  }
  return [...seen];
}

/** The BP to show when both components are stored, falling back to the raw text. */
export function deriveBloodPressure(
  systolic: number | null | undefined,
  diastolic: number | null | undefined,
  raw: string | null | undefined,
): string {
  if (systolic && diastolic) return `${systolic}/${diastolic}`;
  return raw ?? "";
}

/** BMI from centimetres and kilograms — the same derivation the RPC performs. */
export function computeBmi(heightCm: string, weightKg: string): string | null {
  const h = Number(heightCm);
  const w = Number(weightKg);
  if (!(h > 0) || !(w > 0)) return null;
  const metres = h / 100;
  return (w / (metres * metres)).toFixed(1);
}
