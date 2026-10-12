import { z } from "zod";

import {
  CopilotExtractionSchema,
  DermNoteExtractionSchema,
  PsychNoteExtractionSchema,
  type CopilotMode,
} from "./types";

/**
 * The JSON Schema handed to Gemini as `responseSchema`.
 *
 * Derived from the Zod schemas rather than hand-written (the way
 * `OCR_RESPONSE_SCHEMA` is) on purpose: the Zod schema is the contract the drawer
 * validates against, and a second hand-maintained copy of a dozen fields is
 * guaranteed to drift from it — someone adds a field to the Zod object, the
 * constrained decoder keeps refusing to emit it, and the model silently stops
 * returning it. Deriving it means a new field starts working the moment it is
 * added upstream, with nothing to remember here.
 *
 * Each workspace (general / psychology / dermatology) derives its own schema
 * from its own extraction shape, so the SAME drawer keeps one Gemini contract
 * per specialty — `buildCopilotSystemPrompt` matches it on the prompt side.
 *
 * `io: "output"` is the load-bearing option. It asks for the *output* type, which
 * makes Zod treat every field with a `.default()` as required, so the decoder
 * always emits the defaults rather than omitting them and leaving the drawer to
 * guess.
 *
 * `$schema` is kept on purpose: the SDK reads it and switches to
 * `responseJsonSchema` (full JSON-schema constrained decoding) instead of the
 * narrower OpenAPI subset. It is why the OCR scanner works today.
 */
function toStrippedSchema(schema: z.ZodType): Record<string, unknown> {
  const derived = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io: "output",
  });
  return stripUnsupportedKeywords(derived) as Record<string, unknown>;
}

/**
 * Keys Zod emits that Gemini's schema validator rejects or ignores.
 *
 * `additionalProperties` is the one that bites: Zod emits `false` for every
 * object, and Gemini's validator errors on the keyword outright rather than
 * treating it as "no extra fields". `default` has the same problem — the
 * decoder has nowhere to put a default, and the values are already baked into
 * `required` by `io: "output"`, so the keyword carries no information anyway.
 */
const STRIPPED_KEYWORDS = new Set(["additionalProperties", "default", "examples", "$id"]);

function stripUnsupportedKeywords(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(stripUnsupportedKeywords);
  }
  if (node === null || typeof node !== "object") {
    return node;
  }
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (STRIPPED_KEYWORDS.has(key)) continue;
    output[key] = stripUnsupportedKeywords(value);
  }
  return output;
}

export const COPILOT_RESPONSE_SCHEMA = toStrippedSchema(CopilotExtractionSchema);

export const PSYCH_RESPONSE_SCHEMA = toStrippedSchema(PsychNoteExtractionSchema);

export const DERM_RESPONSE_SCHEMA = toStrippedSchema(DermNoteExtractionSchema);

export function responseSchemaFor(mode: CopilotMode): Record<string, unknown> {
  switch (mode) {
    case "psychology":
      return PSYCH_RESPONSE_SCHEMA;
    case "dermatology":
      return DERM_RESPONSE_SCHEMA;
    default:
      return COPILOT_RESPONSE_SCHEMA;
  }
}