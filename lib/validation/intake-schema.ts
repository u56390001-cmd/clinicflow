import { z } from "zod";

import { INTAKE_CATEGORIES } from "@/lib/medical-history-mapping";

/** One row of the pre-intake form, submitted by the patient themself. */
export const patientIntakeItemSchema = z.object({
  category: z.enum(INTAKE_CATEGORIES),
  condition_name: z.string().trim().min(1, "Add a condition or procedure name.").max(160),
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
});

export type PatientIntakeItem = z.infer<typeof patientIntakeItemSchema>;

/** Whole pre-intake payload. Bounded the same way the OCR schema is. */
export const patientIntakeSubmissionSchema = z.object({
  items: z
    .array(patientIntakeItemSchema)
    .min(1, "Add at least one health history item.")
    .max(50, "Fifty items is the most we can accept at once."),
});

export type PatientIntakeSubmission = z.infer<typeof patientIntakeSubmissionSchema>;

/** Stamped on rows that arrive through the shareable intake link. */
export const PATIENT_INTAKE_CREATED_BY = "Patient Pre-Intake";