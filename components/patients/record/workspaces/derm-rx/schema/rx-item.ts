/**
 * Dermatology Rx v2 data model — the typed contract shared by the client
 * editor, the server action and the render pipeline.
 *
 * Storage contract: the Rx rows keep their existing `medicines` jsonb column.
 * The value is either
 *   - a legacy v1 array of `MedicineEntry` objects (strings like "1-0-1"), or
 *   - a v2 envelope `{ schema_version: 2, items: RxItem[] }`.
 * Neither shape needs a DB migration; `saveDermRxSchema` accepts both and
 * `readRxItems` reads both. Identity in v2 is always `id` (uuid) — never the
 * array index.
 *
 * The `custom` frequency/duration variants exist ONLY as a loss-free fallback
 * for legacy strings the parser cannot map to a structured value; new drafts
 * never produce them. Nothing editable is ever dropped.
 */

import { z } from "zod";

export const RX_SCHEMA_VERSION = 2;

/*---------------------------------- Frequency ------------------------------*/

const dayNumber = z.number().int().min(0).max(9);

export const frequencySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("daily"),
    morning: dayNumber,
    noon: dayNumber,
    night: dayNumber,
  }),
  z.object({
    kind: z.literal("everyNDays"),
    n: z.number().int().min(2).max(60),
  }),
  z.object({
    kind: z.literal("weekdays"),
    days: z
      .array(
        z.union([
          z.literal(0 as const),
          z.literal(1 as const),
          z.literal(2 as const),
          z.literal(3 as const),
          z.literal(4 as const),
          z.literal(5 as const),
          z.literal(6 as const),
        ]),
      )
      .max(7),
  }),
  z.object({
    kind: z.literal("timesPerWeek"),
    n: z.number().int().min(1).max(7),
  }),
  z.object({
    kind: z.literal("sos"),
    maxPerDay: z.number().int().min(1).max(12).optional(),
  }),
  z.object({
    kind: z.literal("custom"),
    text: z.string().trim().min(1).max(120),
  }),
]);

export type Frequency = z.infer<typeof frequencySchema>;

/*---------------------------------- Duration -------------------------------*/

export const durationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("fixed"),
    value: z.number().int().min(1).max(365),
    unit: z.enum(["day", "week", "month"]),
  }),
  z.object({ kind: z.literal("continue") }),
  z.object({ kind: z.literal("untilNextVisit") }),
  z.object({
    kind: z.literal("custom"),
    text: z.string().trim().min(1).max(120),
  }),
]);

export type Duration = z.infer<typeof durationSchema>;

/*----------------------------------- Taper ---------------------------------*/

export const taperStepSchema = z.object({
  frequency: frequencySchema,
  duration: durationSchema,
});

export type TaperStep = z.infer<typeof taperStepSchema>;

/*------------------------------- Shared pieces -----------------------------*/

export const ROUTES = ["topical", "oral", "intralesional"] as const;
export type RxRoute = (typeof ROUTES)[number];

export const strengthSchema = z.object({
  value: z.number().min(0).max(10_000),
  unit: z.enum(["mg", "%", "mcg", "ml", "IU"]),
});

export type RxStrength = z.infer<typeof strengthSchema>;

export const instructionSchema = z.object({
  mode: z.enum(["auto", "custom"]),
  text: z.string().trim().max(240),
});

export type RxInstruction = z.infer<typeof instructionSchema>;

/*--------------------------- Per-route item schemas ------------------------*/
/**
 * A zod discriminated union on `route`: each route only admits its own
 * fields (strict objects reject foreign keys, so a topical row can never
 * carry `foodTiming` and vice versa).
 */

export const topicalItemSchema = z.strictObject({
  id: z.string().min(1),
  catalogId: z.string().optional(),
  brand: z.string().trim().min(1).max(160),
  generic: z.string().trim().max(160).optional(),
  isCustom: z.boolean(),
  route: z.literal("topical"),
  form: z.string().trim().max(80).optional(),
  amount: z.string().trim().max(80).optional(),
  sites: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
  washOffMin: z.number().int().min(0).max(240).optional(),
  strength: strengthSchema.optional(),
  frequency: frequencySchema,
  duration: durationSchema,
  quantity: z.string().trim().max(80).optional(),
  taper: z.array(taperStepSchema).max(6).optional(),
  instruction: instructionSchema,
  substitutionAllowed: z.boolean(),
});

export const oralItemSchema = z.strictObject({
  id: z.string().min(1),
  catalogId: z.string().optional(),
  brand: z.string().trim().min(1).max(160),
  generic: z.string().trim().max(160).optional(),
  isCustom: z.boolean(),
  route: z.literal("oral"),
  strength: strengthSchema.optional(),
  foodTiming: z.enum(["before", "after", "with"]).optional(),
  frequency: frequencySchema,
  duration: durationSchema,
  quantity: z.string().trim().max(80).optional(),
  taper: z.array(taperStepSchema).max(6).optional(),
  instruction: instructionSchema,
  substitutionAllowed: z.boolean(),
});

export const intralesionalItemSchema = z.strictObject({
  id: z.string().min(1),
  catalogId: z.string().optional(),
  brand: z.string().trim().min(1).max(160),
  generic: z.string().trim().max(160).optional(),
  isCustom: z.boolean(),
  route: z.literal("intralesional"),
  concentration: z.string().trim().max(80).optional(),
  volumeMl: z.number().min(0).max(20).optional(),
  repeatIntervalDays: z.number().int().min(1).max(180).optional(),
  strength: strengthSchema.optional(),
  frequency: frequencySchema,
  duration: durationSchema,
  quantity: z.string().trim().max(80).optional(),
  taper: z.array(taperStepSchema).max(6).optional(),
  instruction: instructionSchema,
  substitutionAllowed: z.boolean(),
});

export const rxItemSchema = z.discriminatedUnion("route", [
  topicalItemSchema,
  oralItemSchema,
  intralesionalItemSchema,
]);

export type RxItem = z.infer<typeof rxItemSchema>;

/*------------------------------ Storage envelope ---------------------------*/

export const rxEnvelopeSchema = z.object({
  schema_version: z.literal(RX_SCHEMA_VERSION),
  items: z.array(rxItemSchema),
});

export type RxEnvelope = z.infer<typeof rxEnvelopeSchema>;

/** Legacy v1 row — mirrors `MedicineEntry` in types/database.ts. */
export const legacyMedicineEntrySchema = z.object({
  name: z.string(),
  route: z.string(),
  form: z.string(),
  frequency: z.string(),
  duration: z.string(),
  unit: z.string(),
  instructions: z.string(),
});

export type LegacyMedicineEntry = z.infer<typeof legacyMedicineEntrySchema>;

/** What a `derm_prescriptions.medicines` jsonb value may contain. */
export const dermMedicinesPayloadSchema = z.union([
  rxEnvelopeSchema,
  z.array(legacyMedicineEntrySchema),
]);

export type DermMedicinesPayload = z.infer<typeof dermMedicinesPayloadSchema>;

/*------------------------- Legacy-string parsers (pure) --------------------*/

/** Rules: unparseable strings become `custom` / `instruction.text` — never dropped. */

export function parseFrequency(text: string): Frequency {
  const raw = text.trim();
  if (!raw) return { kind: "daily", morning: 1, noon: 0, night: 1 };

  // "1-0-1 (BD)" / "0-0-1 (Night)" / "2-0-2" — morning-noon-night slots.
  const slots = raw.match(/^(\d)-(\d)-(\d)\b(?!\s*-)/);
  if (slots) {
    return {
      kind: "daily",
      morning: Number(slots[1]),
      noon: Number(slots[2]),
      night: Number(slots[3]),
    };
  }

  const t = raw.toLowerCase();

  if (/^once\s*(a|per)?\s*week/.test(t) || t === "weekly")
    return { kind: "timesPerWeek", n: 1 };
  if (/twice\s*(a|per)?\s*week|2\s*x\s*(a\s*)?week/.test(t))
    return { kind: "timesPerWeek", n: 2 };
  const daysAWeek = t.match(/(\d+)\s*days?\s*(?:a|per|\/)?\s*week/i);
  if (daysAWeek)
    return { kind: "timesPerWeek", n: Math.min(7, Number(daysAWeek[1])) };
  const timesAWeek = t.match(/(\d+)\s*(?:x|times)?\s*(?:a|per\s*|\/)?\s*week/);
  if (timesAWeek)
    return { kind: "timesPerWeek", n: Math.min(7, Number(timesAWeek[1])) };

  if (/alternate\s*day|every\s*other\s*day/.test(t))
    return { kind: "everyNDays", n: 2 };
  const everyNDays = t.match(/every\s*(\d+)\s*days?/);
  if (everyNDays)
    return {
      kind: "everyNDays",
      n: Math.min(60, Number(everyNDays[1]) || 2),
    };

  if (/\bsos\b|as\s*needed|\bprn\b/.test(t)) return { kind: "sos" };

  // Weekday names → structured weekdays.
  const dayNames: Array<[RegExp, 0 | 1 | 2 | 3 | 4 | 5 | 6]> = [
    [/^sun|\bsunday\b/, 0],
    [/\bmon(?:day)?\b/, 1],
    [/\btue(?:sday)?\b/, 2],
    [/\bwed(?:nesday)?\b/, 3],
    [/\bthu(?:rsday)?\b/, 4],
    [/\bfri(?:day)?\b/, 5],
    [/\bsat(?:urday)?\b/, 6],
  ];
  const days: Array<0 | 1 | 2 | 3 | 4 | 5 | 6> = dayNames
    .filter(([re]) => re.test(t))
    .map(([, d]) => d);
  if (days.length > 0) return { kind: "weekdays", days };

  if (/\b(?:qid|four\s*times\s*a\s*day|1-1-1-1)\b/.test(raw))
    return { kind: "custom", text: raw };
  if (/\b(?:tds|tid|thrice|three\s*times\s*a\s*day)\b/.test(t))
    return { kind: "daily", morning: 1, noon: 1, night: 1 };
  if (/\b(?:bd|bid|twice\s*(?:a\s*)?daily|two\s*times\s*a\s*day)\b/.test(t))
    return { kind: "daily", morning: 1, noon: 0, night: 1 };
  if (/\b(?:od|once\s*(?:a\s*)?day|once\s*daily|daily)\b/.test(t))
    return { kind: "daily", morning: 1, noon: 0, night: 0 };
  if (
    /\b(?:hs|nocte|after\s*dinner|in\s*the\s*(?:evening|night))\b/.test(t) ||
    /\bnight\b/.test(t)
  )
    return { kind: "daily", morning: 0, noon: 0, night: 1 };
  if (/\b(?:morning|before\s*breakfast)\b/.test(t))
    return { kind: "daily", morning: 1, noon: 0, night: 0 };

  return { kind: "custom", text: raw };
}

export function parseDuration(text: string): Duration {
  const raw = text.trim();
  if (!raw) return { kind: "continue" };

  const t = raw.toLowerCase();

  if (/\b(?:until|till)\s*next\s*visit\b/.test(t))
    return { kind: "untilNextVisit" };

  const fixed = t.match(/(\d+)\s*(day|week|month)s?\b/);
  if (fixed)
    return {
      kind: "fixed",
      value: Math.min(365, Number(fixed[1])),
      unit: fixed[2] === "day" ? "day" : fixed[2] === "week" ? "week" : "month",
    };

  const shorthand = t.match(/^(\d+)\s*([dwm])$/);
  if (shorthand)
    return {
      kind: "fixed",
      value: Math.min(365, Number(shorthand[1])),
      unit: shorthand[2] === "d" ? "day" : shorthand[2] === "w" ? "week" : "month",
    };

  const continued = t.match(/continue(?:\s*(?:for|x)\s*)?(\d+)\s*(day|week|month)?/);
  if (continued?.[1])
    return {
      kind: "fixed",
      value: Math.min(365, Number(continued[1])),
      unit: continued[2] === "day" ? "day" : continued[2] === "week" ? "week" : "month",
    };
  if (/\bcontinue|lifelong|long[-\s]*term|until\s*review|till\s*review|no\s*stop\s*date\b/.test(t))
    return { kind: "continue" };

  return { kind: "custom", text: raw };
}

/** Splits the legacy `unit` free string into structured strength / amount. */
type StrengthUnit = "mg" | "mcg" | "%" | "ml" | "IU";

const STRENGTH_UNIT_MAP: Record<string, StrengthUnit> = {
  mg: "mg",
  mcg: "mcg",
  "%": "%",
  ml: "ml",
  iu: "IU",
};

export function parseStrengthOrAmount(
  unit: string,
): { amount?: string; strength?: RxStrength } {
  const raw = unit.trim();
  if (!raw) return {};

  const strength = raw.match(/^(\d+(?:\.\d+)?)\s*(mg|mcg|%|ml|iu)(?![a-z])/i);
  if (strength) {
    return {
      strength: {
        value: Number(strength[1]),
        unit: STRENGTH_UNIT_MAP[strength[2].toLowerCase()],
      },
    };
  }
  // FTU strings and anything else stay as a free-form amount ("0.5 FTU", "15 g").
  return { amount: raw };
}

const FOOD_TIMING_PATTERNS: Array<{
  re: RegExp;
  timing: "before" | "after" | "with";
}> = [
  { re: /\bafter\s*(?:meals|food|dinner|lunch)\b/i, timing: "after" },
  { re: /\bwith\s*(?:meals?|food)\b/i, timing: "with" },
  { re: /\bbefore\s*(?:meals|food|breakfast)\b/i, timing: "before" },
];

function extractFoodTiming(
  text: string,
): { text: string; foodTiming?: "before" | "after" | "with" } {
  let text2 = text;
  let foodTiming: "before" | "after" | "with" | undefined;
  for (const { re, timing } of FOOD_TIMING_PATTERNS) {
    if (re.test(text2)) {
      foodTiming = foodTiming ?? timing;
      text2 = text2.replace(re, "").trim();
    }
  }
  return { text: text2.replace(/^[-–—,;:.\s]+|[-–—,;:.\s]+$/g, ""), foodTiming };
}

/**
 * Legacy site phrases look like "Apply to Pin #1 - Face - thin layer only":
 * segment 1 = pin tag, segment 2 = body region, rest = instruction text.
 */
function extractSite(text: string): { text: string; site?: string } {
  const lead = text.match(/^apply\s+to\s+(.*)$/i);
  if (!lead) return { text };
  const body = lead[1].trim();
  if (!/^pin\s*#\d+/i.test(body)) return { text };
  const parts = body.split(/\s+[-–—]\s+/);
  if (parts.length === 1) {
    return { text: "", site: parts[0].trim() };
  }
  return {
    text: parts.slice(2).join(" - ").trim(),
    site: `${parts[0].trim()} - ${parts[1].trim()}`,
  };
}

let legacySeq = 0;
function legacyId(): string {
  legacySeq += 1;
  return `legacy-v1-${Date.now().toString(36)}-${legacySeq}`;
}

/** Converts one legacy `MedicineEntry` row into a typed v2 `RxItem`. */
export function parseLegacyItem(
  entry: LegacyMedicineEntry,
  id?: string,
): RxItem {
  const routeWord = (entry.route || "").trim().toLowerCase();
  const formWord = (entry.form || "").trim().toLowerCase();
  let route: RxRoute = "topical";
  let isCustom = false;
  if (routeWord === "topical") route = "topical";
  else if (routeWord === "oral") route = "oral";
  else if (routeWord === "intralesional") route = "intralesional";
  else if (formWord) route = "topical";
  else {
    route = "oral";
    isCustom = true;
  }

  const base = {
    id: id ?? legacyId(),
    brand: (entry.name || "").trim() || "Unnamed item",
    isCustom,
    frequency: parseFrequency(entry.frequency ?? ""),
    duration: parseDuration(entry.duration ?? ""),
    instruction: {
      mode: "custom" as const,
      text: "",
    },
    substitutionAllowed: false,
  };

  if (route === "topical") {
    // Site phrase is carved out of the text into the structured field.
    const sitePart = extractSite(entry.instructions ?? "");
    const { amount, strength } = parseStrengthOrAmount(entry.unit ?? "");
    return topicalItemSchema.parse({
      ...base,
      route: "topical",
      form: (entry.form || "").trim() || undefined,
      amount: amount ?? undefined,
      strength: strength ?? undefined,
      sites: sitePart.site ? [sitePart.site] : undefined,
      instruction: { mode: "custom", text: sitePart.text },
    });
  }

  if (route === "intralesional") {
    const { foodTiming, text } = extractFoodTiming(entry.instructions ?? "");
    return intralesionalItemSchema.parse({
      ...base,
      route: "intralesional",
      // Legacy free "unit" (e.g. "10 mg") maps onto concentration text.
      concentration: (entry.unit || "").trim() || undefined,
      instruction: { mode: "custom", text: foodTiming ? entry.instructions ?? "" : text || entry.instructions || "" },
    });
  }

  // Oral: site phrases stay inside the text; food timing becomes structured.
  const timingPart = extractFoodTiming(entry.instructions ?? "");
  const { amount, strength } = parseStrengthOrAmount(entry.unit ?? "");
  return oralItemSchema.parse({
    ...base,
    route: "oral",
    strength: strength ?? undefined,
    foodTiming: timingPart.foodTiming,
    quantity: amount ?? undefined,
    instruction: { mode: "custom", text: timingPart.text },
  });
}

/** Parses a full legacy v1 array. */
export function parseLegacyMedicines(
  list: LegacyMedicineEntry[] | null | undefined,
): RxItem[] {
  if (!Array.isArray(list)) return [];
  return list.map((entry, index) => parseLegacyItem(entry, `legacy-${index + 1}`));
}

/**
 * Central read helper: accepts the raw `medicines` jsonb value (v1 array or
 * v2 envelope) and returns typed items either way.
 */
export function readRxItems(value: unknown): RxItem[] {
  if (Array.isArray(value)) return parseLegacyMedicines(value as LegacyMedicineEntry[]);
  const envelope = rxEnvelopeSchema.safeParse(value);
  return envelope.success ? envelope.data.items : [];
}
