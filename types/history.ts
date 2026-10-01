/**
 * Structured medical history — shared vocabulary for the History tab.
 *
 * The system keeps two complementary layers:
 *  1. Structured `HistoryItem`s (medical_history table) that carry provenance,
 *     verification state and clinical course, and
 *  2. `LegacyHistoryFields` — the six free-text surfaces on patients
 *     (past_illnesses, past_surgeries, hospitalizations, family_history,
 *     personal_history, immunization_history) that clinicians still edit by hand.
 */

export type HistoryCategory =
  | "surgical"
  | "chronic"
  | "past_illnesses"
  | "hospitalization"
  | "family"
  | "social"
  | "immunization";

export type HistorySource =
  | "patient_intake"
  | "ai_ocr"
  | "doctor_entry"
  | "receptionist";

export type VerificationStatus = "verified" | "pending_approval";

export type ClinicalStatus = "active" | "resolved" | "chronic";

export interface HistoryItem {
  id: string;
  patient_id: string;
  category: HistoryCategory;
  /** Human-readable condition/event, e.g. "Diabetes Type 2". */
  title: string;
  /** ISO date (YYYY-MM-DD). */
  onset_date?: string | null;
  /**
   * ISO date (YYYY-MM-DD) of the document this entry was extracted from (AI
   * OCR, migration 0052). Distinct from `onset_date`: this is when the report
   * was written, not when the condition started.
   */
  report_date?: string | null;
  clinical_status: ClinicalStatus;
  source: HistorySource;
  verification_status: VerificationStatus;
  notes?: string | null;
  /** For family-history entries — "Father", "Mother", … */
  relationship?: string | null;
  created_at: string;
  created_by_name?: string | null;
}

export interface LegacyHistoryFields {
  past_illnesses?: string;
  past_surgeries?: string;
  hospitalizations?: string;
  family_history?: string;
  personal_history?: string;
  immunization_history?: string;
}

export interface HistorySummaryStats {
  chronic_count: number;
  chronic_preview: string;
  surgeries_count: number;
  surgeries_preview: string;
  critical_risks_count: number;
  critical_risks_preview: string;
  pending_ai_count: number;
  pending_ai_preview: string;
}

/** Category → how it reads to a clinician (used in grouping + the add form). */
export const HISTORY_CATEGORY_LABELS: Record<HistoryCategory, string> = {
  chronic: "Chronic conditions",
  past_illnesses: "Past illnesses",
  surgical: "Surgeries",
  hospitalization: "Hospitalizations",
  family: "Family history",
  social: "Lifestyle",
  immunization: "Immunizations",
};