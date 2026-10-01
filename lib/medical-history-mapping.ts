import type {
  Database,
  IntakeHistoryCategory,
  MedicalHistory,
} from "@/types/database";

/**
 * The six categories the pre-intake form and the AI OCR parser emit, in form
 * display order. Note this is *not* the medical_history DB enum: the parser's
 * vocabulary is mapped onto DB categories below so both ingest paths write
 * rows the structured History tab can render as-is.
 */
export const INTAKE_CATEGORIES = [
  "past_illness",
  "surgery",
  "hospitalization",
  "family_history",
  "lifestyle",
  "immunization",
] as const satisfies readonly IntakeHistoryCategory[];

/** Human labels used by the intake form and the OCR extractor prompt. */
export const INTAKE_CATEGORY_LABELS: Record<IntakeHistoryCategory, string> = {
  past_illness: "Past illness",
  surgery: "Surgery",
  hospitalization: "Hospitalization",
  family_history: "Family history",
  lifestyle: "Lifestyle",
  immunization: "Immunization",
};

/** Extractor vocabulary → medical_history.category (0045/0048 CHECK values). */
export const INTAKE_CATEGORY_TO_DB: Record<
  IntakeHistoryCategory,
  MedicalHistory["category"]
> = {
  past_illness: "past_illnesses",
  surgery: "surgical",
  hospitalization: "hospitalization",
  family_history: "family",
  lifestyle: "social",
  immunization: "immunization",
};

/**
 * Turn a loose clinical date ("2018", "2018-03", "2018-03-15") into the
 * DATE-typed column medical_history expects. The DB cannot hold prose like
 * "childhood", so anything unrecognizable collapses to null rather than error.
 */
export function parseOnsetDate(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;

  if (/^\d{4}$/.test(v)) {
    return `${v}-01-01`;
  }
  if (/^\d{4}-\d{1,2}$/.test(v)) {
    return `${v.slice(0, 4)}-${v.slice(5).padStart(2, "0")}-01`;
  }
  const full = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (full) {
    const year = Number(full[1]);
    const month = Number(full[2]);
    const day = Number(full[3]);
    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${full[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return null;
}

type MedicalHistoryInsert = Database["public"]["Tables"]["medical_history"]["Insert"];

/**
 * Build a `pending_approval` medical_history row from an intake/OCR entry.
 * Every field the History tab treats as first-class (source, verification
 * status, clinical status, author) is set here so neither ingest path can
 * forget them.
 */
export function historyInsertFromIntakeEntry(input: {
  clinic_id: string;
  patient_id: string;
  category: IntakeHistoryCategory;
  condition: string;
  onsetDate?: string | null;
  relationship?: string | null;
  notes?: string | null;
  clinicalStatus?: MedicalHistory["clinical_status"];
  source: "patient_intake" | "ai_ocr";
  createdBy: string;
  /** Date of the source document (AI OCR only) — parsed like `onsetDate`. */
  reportDate?: string | null;
}): MedicalHistoryInsert {
  return {
    clinic_id: input.clinic_id,
    patient_id: input.patient_id,
    category: INTAKE_CATEGORY_TO_DB[input.category],
    condition: input.condition,
    date: parseOnsetDate(input.onsetDate),
    // The report's own date, kept apart from the onset date above: a condition
    // documented in 2018 keeps whatever onset date the report gave.
    report_date: parseOnsetDate(input.reportDate),
    notes: input.notes?.trim() ? input.notes.trim() : null,
    relationship: input.relationship?.trim() ? input.relationship.trim() : null,
    clinical_status: input.clinicalStatus ?? "active",
    source: input.source,
    verification_status: "pending_approval",
    created_by_name: input.createdBy,
  };
}