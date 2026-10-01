import { z } from 'zod';

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
