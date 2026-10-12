import { z } from 'zod';

import type { WorkspaceKind } from '@/lib/specialty-workspaces';

/**
 * The same CopilotDrawer panel can run in any doctor workspace; `mode` tells it
 * (and every server route behind it) whose extraction shape and AI context to
 * use. Values line up with `WorkspaceKind` from the workspace engine so a
 * workspace can pass its `kind` straight through.
 */
export type CopilotMode = WorkspaceKind;

/** Normalise an unknown request field to a copilot mode — anything else is general. */
export function copilotModeFrom(value: unknown): CopilotMode {
  if (value === 'psychology' || value === 'dermatology') return value;
  return 'general';
}

export const MedicineItemSchema = z.object({
  name: z.string().describe("Brand or generic medicine name"),
  route: z.string().default("Oral").describe("Route e.g., Oral, Topical, IV"),
  form: z.enum(["Tablet", "Syrup", "Injection", "Inhaler", "Capsule", "Ointment", "Other"]).default("Tablet"),
  frequency: z.string().describe("e.g., 1-0-1 or Once daily"),
  duration: z.string().describe("e.g., 5"),
  unit: z.enum(["Days", "Weeks", "Months"]).default("Days"),
  instructions: z.string().describe("e.g., Take after meals")
});

export const LabOrderItemSchema = z.object({
  test_name: z.string().describe("Name of lab test e.g., CBC, Chest X-Ray, HbA1c"),
  notes: z.string().optional().describe("Special lab instructions")
});

export const CopilotExtractionSchema = z.object({
  chief_complaint: z.string().describe("Patient's primary stated symptoms and duration"),
  findings: z.string().describe("Objective physical examination findings observed by doctor"),
  diagnosis: z.string().describe("Primary working clinical diagnosis"),
  icd10_candidates: z.array(z.string()).describe("List of candidate ICD-10 codes"),
  medicines: z.array(MedicineItemSchema).describe("List of prescribed medications"),
  lab_orders: z.array(LabOrderItemSchema).describe("List of ordered lab/radiology tests"),
  follow_up_after: z.string().optional().describe("Follow up duration number e.g. '2'"),
  follow_up_unit: z.enum(["Days", "Weeks", "Months"]).optional().default("Weeks"),
  follow_up_notes: z.string().optional().describe("Follow-up advice or BP re-check notes"),
  doctor_notes: z.string().optional().describe("Lifestyle advice or special instructions"),
  denied_symptoms: z.array(z.string()).describe("Negative symptoms explicitly denied by patient"),
  safety_warnings: z.array(z.string()).describe("Potential drug-allergy or drug-interaction warnings")
});

export type CopilotExtraction = z.infer<typeof CopilotExtractionSchema>;
export type MedicineItem = z.infer<typeof MedicineItemSchema>;
export type LabOrderItem = z.infer<typeof LabOrderItemSchema>;

/**
 * Psychology extraction — the copilot's BIRP/DAP session-note shape.
 *
 * Field names are the session note's save keys (`savePsychSessionAction`): a
 * BIRP note fills `behavior`/`intervention`/`response`/`plan`, a DAP note fills
 * `observation_data`/`assessment`/`plan`, and the unused half stays empty.
 * `risk_level` ranges over the same values the psych safety snapshot uses.
 */
export const PsychNoteExtractionSchema = z.object({
  session_summary: z
    .string()
    .default("")
    .describe("2-4 sentence summary of the therapy session"),
  format: z
    .enum(["BIRP", "DAP"])
    .default("BIRP")
    .describe("Note format inferred from the session structure"),
  behavior: z
    .string()
    .default("")
    .describe("BIRP: observable client behavior and statements in session"),
  intervention: z
    .string()
    .default("")
    .describe("BIRP: techniques and interventions the therapist applied"),
  response: z
    .string()
    .default("")
    .describe("BIRP: how the client responded to the intervention"),
  observation_data: z
    .string()
    .default("")
    .describe("DAP: facts observed and reported in this session"),
  assessment: z
    .string()
    .default("")
    .describe("DAP: clinical assessment, formulation and interpretation"),
  plan: z
    .string()
    .default("")
    .describe("Next steps, homework and follow-up agreed in session"),
  mood_affect: z
    .string()
    .default("")
    .describe("Mood and affect presented or observed this session"),
  risk_level: z
    .enum(["low", "moderate", "high", "crisis"])
    .default("low")
    .describe("Current assessed risk of harm to self or others"),
  risk_notes: z
    .string()
    .default("")
    .describe("Risk indicators, or why the level is assessed as it is"),
  follow_up: z
    .string()
    .default("")
    .describe("When the next session is scheduled or recommended"),
});

export type PsychNoteExtraction = z.infer<typeof PsychNoteExtractionSchema>;

/**
 * Dermatology extraction — the copilot's skin-examination note shape.
 *
 * Field names map to `saveDermExamAction`/`saveDermRxAction` keys. The
 * controlled vocabularies (complaint/morphology of the exam chips, topical form
 * of the Rx) are cheap for the model to hit, so the schema asks for them
 * directly; anything else lands in `exam_summary`.
 */
export const DermNoteExtractionSchema = z.object({
  exam_summary: z
    .string()
    .default("")
    .describe("2-4 sentence summary of the skin examination findings"),
  chief_complaints: z
    .array(z.string())
    .default([])
    .describe("Presenting complaints using the vocabulary: Rash, Itching, Pain, Lesion"),
  morphology: z
    .array(z.string())
    .default([])
    .describe("Lesion morphology using: Macule, Papule, Plaque, Nodule, Vesicle"),
  distribution: z
    .string()
    .default("")
    .describe("Distribution: localized, generalized or dermatomal"),
  diagnosis: z.string().default("").describe("Working dermatological diagnosis"),
  icd10_candidates: z
    .array(z.string())
    .default([])
    .describe("Candidate ICD-10 codes for the diagnosis"),
  treatment_summary: z
    .string()
    .default("")
    .describe("Topical or systemic treatment prescribed or advised"),
  topical_form: z
    .enum(["cream", "ointment", "gel", "lotion", ""])
    .default("")
    .describe("Topical dosage form to prescribe the active as"),
  application_instructions: z
    .string()
    .default("")
    .describe("How and how often to apply the topical"),
  skincare_am: z
    .string()
    .default("")
    .describe("Morning skincare routine advice"),
  skincare_pm: z.string().default("").describe("Evening skincare routine advice"),
  patient_instructions: z
    .string()
    .default("")
    .describe("Lifestyle, avoidance and follow-up instructions"),
});

export type DermNoteExtraction = z.infer<typeof DermNoteExtractionSchema>;

/** Every extraction shape the copilot drawer can hold, keyed by mode. */
export type WorkspaceExtraction =
  | CopilotExtraction
  | PsychNoteExtraction
  | DermNoteExtraction;

/** Header the drawer labels itself with per mode (overridden by `contextLabel`). */
export const COPILOT_MODE_LABELS: Record<CopilotMode, string> = {
  general: "Ambient Copilot",
  psychology: "Psychology Copilot",
  dermatology: "Dermatology Copilot",
};

/**
 * The state the command bar starts from when nothing has been recorded yet.
 *
 * The command endpoint edits an existing draft, but the bar used to be disabled
 * until a draft existed — so the only way to get one was to record audio, which
 * made the command bar unreachable exactly when recording had failed. Feeding
 * the command this blank draft instead lets the doctor type a prescription
 * directly ("fever 3 days, paracetamol 500 TDS 5 days") with no capture at all,
 * and it satisfies the endpoint's `currentFormState` requirement.
 *
 * Field names are the schema's, not the draft's: the endpoint speaks
 * `snake_case`, and the mapping to the draft happens in `onPopulateForm`.
 */
export const EMPTY_EXTRACTION: CopilotExtraction = {
  chief_complaint: "",
  findings: "",
  diagnosis: "",
  icd10_candidates: [],
  medicines: [],
  lab_orders: [],
  follow_up_unit: "Weeks",
  denied_symptoms: [],
  safety_warnings: [],
};

/** Blank psychology note, same role as `EMPTY_EXTRACTION` for the command bar. */
export const EMPTY_PSYCH_NOTE: PsychNoteExtraction = {
  session_summary: "",
  format: "BIRP",
  behavior: "",
  intervention: "",
  response: "",
  observation_data: "",
  assessment: "",
  plan: "",
  mood_affect: "",
  risk_level: "low",
  risk_notes: "",
  follow_up: "",
};

/** Blank dermatology note, same role as `EMPTY_EXTRACTION` for the command bar. */
export const EMPTY_DERM_NOTE: DermNoteExtraction = {
  exam_summary: "",
  chief_complaints: [],
  morphology: [],
  distribution: "",
  diagnosis: "",
  icd10_candidates: [],
  treatment_summary: "",
  topical_form: "",
  application_instructions: "",
  skincare_am: "",
  skincare_pm: "",
  patient_instructions: "",
};

/** The draft the command bar starts from when nothing has been recorded, per mode. */
export function emptyExtractionFor(mode: CopilotMode): WorkspaceExtraction {
  switch (mode) {
    case "psychology":
      return EMPTY_PSYCH_NOTE;
    case "dermatology":
      return EMPTY_DERM_NOTE;
    default:
      return EMPTY_EXTRACTION;
  }
}

/** The Zod schema the server validates an extraction against, per mode. */
export function extractionSchemaFor(mode: CopilotMode): z.ZodType {
  switch (mode) {
    case "psychology":
      return PsychNoteExtractionSchema;
    case "dermatology":
      return DermNoteExtractionSchema;
    default:
      return CopilotExtractionSchema;
  }
}
