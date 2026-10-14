import { z } from "zod";
import { applicableItemIds, getInstrument } from "@/lib/scoring/registry";
import type { InstrumentDefinition } from "@/lib/scoring/types";

/**
 * Per-instrument submission schemas.
 *
 * These validate *shape and value range* only. Whether a submission is
 * complete enough to be scored (branching, missing-data limits, never-impute
 * items) is decided by the deterministic engine in `registry.ts`, so partial
 * submissions can be persisted with `is_valid = false` rather than rejected.
 */

export type InstrumentAnswers = Record<string, number>;

const EMPTY_SCHEMA = z.object({}).catchall(z.coerce.number());

function buildShape(def: InstrumentDefinition): z.ZodRawShape {
  const allowed = new Set(def.responseOptions.map((option) => option.value));
  const min = Math.min(...allowed);
  const max = Math.max(...allowed);
  const shape: Record<string, z.ZodType> = {};
  for (const item of def.items) {
    shape[item.id] = z.coerce
      .number()
      .int()
      .min(min)
      .max(max)
      .refine((value) => allowed.has(value), "Invalid response option.")
      .optional();
  }
  return shape as z.ZodRawShape;
}

/**
 * Build a Zod schema for an instrument.
 *
 * @param def     Instrument definition.
 * @param partial When true (patient drafts), missing items are allowed and the
 *                engine marks the response invalid instead. When false, every
 *                *applicable* item must be answered.
 */
export function buildInstrumentSchema(def: InstrumentDefinition, partial = false) {
  const schema = z.object(buildShape(def)).strict();
  if (partial) return schema;
  return schema.superRefine((answers, ctx) => {
    const applicable = applicableItemIds(def, answers as InstrumentAnswers);
    for (const id of applicable) {
      if ((answers as InstrumentAnswers)[id] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [id],
          message: "This question is required.",
        });
      }
    }
  });
}

/** Build a schema from an instrument code; unknown codes get a permissive schema. */
export function instrumentSchemaForCode(code: string, partial = false) {
  const def = getInstrument(code);
  if (!def) return EMPTY_SCHEMA;
  return buildInstrumentSchema(def, partial);
}

/** Validate answers for a given instrument code without throwing. */
export function validateInstrumentAnswers(
  code: string,
  answers: unknown,
  partial = false,
):
  | { success: true; data: InstrumentAnswers }
  | { success: false; error: string } {
  const def = getInstrument(code);
  if (!def) return { success: false, error: `Unknown instrument: ${code}` };
  const parsed = buildInstrumentSchema(def, partial).safeParse(answers ?? {});
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid answers." };
  }
  return { success: true, data: parsed.data as InstrumentAnswers };
}
