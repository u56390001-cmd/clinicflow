import { z } from "zod";

import { INTAKE_CATEGORIES } from "@/lib/medical-history-mapping";

/**
 * One medical-history entry the OCR model emits. `onset_date` is deliberately a
 * loose string ("2018", "Childhood") — the DB stores a DATE, and
 * `parseOnsetDate` degrades gracefully instead of rejecting a document that
 * happens to name a season. `relationship` only ever applies to family entries.
 */
export const ocrExtractedItemSchema = z.object({
  category: z.enum(INTAKE_CATEGORIES),
  condition_name: z.string().trim().min(1).max(160),
  onset_date: z
    .string()
    .trim()
    .max(60)
    .nullish()
    .transform((v) => v ?? null),
  relationship: z
    .string()
    .trim()
    .max(80)
    .nullish()
    .transform((v) => v ?? null),
  clinical_status: z.enum(["active", "resolved", "chronic"]).default("active"),
  notes: z
    .string()
    .trim()
    .max(240)
    .nullish()
    .transform((v) => v ?? null),
});

export type OcrExtractedItem = z.infer<typeof ocrExtractedItemSchema>;

/** One medicine the document mentions, for the patient's medication list. */
export const ocrExtractedMedicationSchema = z.object({
  medicine_name: z.string().trim().min(1).max(200),
  strength: z
    .string()
    .trim()
    .max(60)
    .nullish()
    .transform((v) => v ?? null),
  frequency: z
    .string()
    .trim()
    .max(80)
    .nullish()
    .transform((v) => v ?? null),
  duration: z
    .string()
    .trim()
    .max(80)
    .nullish()
    .transform((v) => v ?? null),
  instructions: z
    .string()
    .trim()
    .max(240)
    .nullish()
    .transform((v) => v ?? null),
});

export type OcrExtractedMedication = z.infer<
  typeof ocrExtractedMedicationSchema
>;

/** A safety-alert string, e.g. an allergy ("Penicillin") or a known condition. */
export const ocrExtractedAlertSchema = z
  .string()
  .trim()
  .min(1)
  .max(120);

/** Whole-document extraction. Bounded so a hallucinated run cannot be huge. */
export const ocrExtractedDocSchema = z.object({
  items: z.array(ocrExtractedItemSchema).min(0).max(50),
  medications: z
    .array(ocrExtractedMedicationSchema)
    .min(0)
    .max(50)
    .default([]),
  allergies: z.array(ocrExtractedAlertSchema).min(0).max(30).default([]),
  known_cases: z.array(ocrExtractedAlertSchema).min(0).max(30).default([]),
  /**
   * The date printed on the document itself — prescription date, report date,
   * admission date. Loose on purpose: the same `parseOnsetDate` used for onset
   * turns "2018", "2018-03" or "2018-03-15" into a real DATE and anything it
   * cannot read becomes null rather than rejecting the whole scan.
   */
  document_date: z
    .string()
    .trim()
    .max(60)
    .nullish()
    .transform((v) => v ?? null),
  summary: z
    .string()
    .trim()
    .max(1200)
    .nullish()
    .transform((v) => v ?? null),
});

export type OcrExtractedDoc = z.infer<typeof ocrExtractedDocSchema>;

/**
 * The JSON Schema handed to Gemini as `responseSchema`. `$schema` is set so the
 * SDK maps it to JSON-schema constrained decoding (`responseJsonSchema`); the
 * six categories mirror `INTAKE_CATEGORIES`, and `required` is exactly the two
 * fields the server needs to make a valid row. Everything else is optional so a
 * conservative model run still passes.
 */
export const OCR_RESPONSE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [...INTAKE_CATEGORIES],
            description: "Which bucket this item belongs to.",
          },
          condition_name: {
            type: "string",
            description:
              "Standardized condition or procedure name, e.g. 'Type 2 diabetes' or 'Appendectomy'.",
          },
          onset_date: {
            type: "string",
            description:
              "Date or year the item started, e.g. '2018' or '2018-03'. Use null when the document gives no date.",
          },
          relationship: {
            type: "string",
            description:
              "Only for family history: the relative, e.g. 'Father'. null otherwise.",
          },
          clinical_status: {
            type: "string",
            enum: ["active", "resolved", "chronic"],
            description: "Whether the condition is ongoing ('active'), finished ('resolved') or lifelong ('chronic').",
          },
          notes: {
            type: "string",
            description:
              "Free-text detail worth keeping (medication name, doses, follow-up note). Omit when there is none.",
          },
        },
        required: ["category", "condition_name"],
      },
    },
    medications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          medicine_name: {
            type: "string",
            description:
              "Standardized medicine name for THIS patient, e.g. 'Metformin'.",
          },
          strength: {
            type: "string",
            description:
              "Dose strength, e.g. '500 mg' or '5 mg/5 ml'. null when the document gives none.",
          },
          frequency: {
            type: "string",
            description:
              "How often, e.g. '1 tab - BD', '3x daily'. null when none.",
          },
          duration: {
            type: "string",
            description:
              "Course length, e.g. '5 days' or 'Continue'. null when none.",
          },
          instructions: {
            type: "string",
            description: "Short usage note, under a sentence. null when none.",
          },
        },
        required: ["medicine_name"],
      },
    },
    allergies: {
      type: "array",
      items: { type: "string" },
      description:
        "The patient's allergies named in the document, standardized (e.g. 'Penicillin'), each a short string. Only true allergies - drug or food; nausea after a medicine is an adverse reaction, not an allergy. Empty array when none are mentioned.",
    },
    known_cases: {
      type: "array",
      items: { type: "string" },
      description:
        "The patient's currently known conditions or ongoing diagnoses from this document (e.g. 'Hypertension', 'Osteoarthritis right knee'). Only conditions that are currently relevant - not resolved past illnesses. Empty array when none.",
    },
    document_date: {
      type: "string",
      description:
        "The date printed ON the document (prescription date, report date, admission date) as 'YYYY-MM-DD' or 'YYYY-MM', or just 'YYYY' when only a year is shown. Use null when the document carries no date. Do not use today's date as a substitute.",
    },
    summary: {
      type: "string",
      description:
        "Required when items is non-empty: a concise 3-to-5-bullet clinical summary of THIS document's content, one bullet per line starting with '- ', plain text, under 70 words, no headings. When items is empty, omit it.",
    },
  },
  required: ["items", "medications", "allergies", "known_cases"],
} as const;

/**
 * Extraction instructions. The model reads the scan under these rules: only
 * patient health history is kept, identifiable names are stripped, and the
 * output stays strictly within the JSON schema above.
 */
export const OCR_SYSTEM_PROMPT = `You are a medical document reader. A clinic has uploaded a patient's document (prescription, lab report, discharge summary, imaging report or referral letter) and needs its medical history extracted into structured entries.

Rules:
- Extract only facts about the patient's own medical history: past illnesses, surgeries, hospitalizations, family medical history, lifestyle factors, and immunizations.
- Name the condition or procedure in plain, standardized English, e.g. "Type 2 diabetes" not "DM", "Appendectomy" not "app. done".
- Assign every item a clinical_status: "resolved" when the document shows it has finished, "chronic" for permanent or ongoing conditions, "active" for anything else currently being treated.
- onset_date is the year or full date the document gives (e.g. "2018" or "2018-03"); null when the document gives no date.
- relationship is only for family history items (the relative, e.g. "Father"); null for all other categories.
- notes may hold a short useful detail like a medication or dose. Keep it under a sentence. Never copy free hand-written patient names, addresses or phone numbers — leave them out entirely.
- Extract the patient's medicines into medications: medicine_name, strength (e.g. "500 mg"), frequency (e.g. "1 tab - BD" or "3x daily"), duration (e.g. "5 days" or "Continue") and a short instruction. Only medicines for THIS patient; leave out any that appear to belong to someone else. Empty medications when none are mentioned.
- Extract the patient's allergies into allergies (e.g. "Penicillin"): only true drug or food allergies, standardized, one string each. Nausea or a rash after taking a medicine is an adverse reaction, NOT an allergy — leave it out. Empty array when none are named.
- Extract the patient's currently known conditions into known_cases (e.g. "Hypertension"): only conditions that are still relevant now, not past resolved illnesses. Empty array when none.
- Always return every array field from the schema — items, medications, allergies, known_cases — even when empty (use []).
- Read the date printed on the document into document_date: the prescription date, report date or admission date, as 'YYYY-MM-DD' (or 'YYYY-MM' / 'YYYY' when that is all it shows). This is the date of the document itself, not the date any condition started, and not today's date. Use null when the document has no date at all.
- When you extract at least one item, also write summary: 3 to 5 very short bullets, one per line starting with "- ", covering what this document says about the patient — conditions, surgeries, medicines, anything a doctor should keep in mind. Under 70 words, plain text, no headings, no "Summary:" label. When items is empty, omit summary.
- Ignore lab values, measurement charts and handwriting you cannot read; do not invent entries.
- If the document contains no extractable history, return {"items": [], "medications": [], "allergies": [], "known_cases": []}.`;

/**
 * `created_by_name` stamped on OCR-ingested rows so the History tab shows where
 * every unverified item came from; not a real user.
 */
export const AI_OCR_CREATED_BY = "AI OCR Scanner";