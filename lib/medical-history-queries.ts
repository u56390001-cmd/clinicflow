/**
 * Server-side queries for medical history (past history tab).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import type { HistoryItem } from "@/types/history";

export type { HistoryCategory } from "@/types/history";

export type PastHistoryData = {
  entries: HistoryItem[];
};

const EMPTY: PastHistoryData = { entries: [] };

/**
 * PGRST205 means PostgREST's schema cache has no `medical_history` table, i.e.
 * migration 0045 hasn't been applied to the connected database yet. That is a
 * deployment state rather than a failed request, and this fetch runs on every
 * patient record render — so warn once per process instead of logging an error
 * on each page load. Real query failures still go to console.error below.
 */
let warnedTableMissing = false;

/**
 * Fetch all medical history entries for a patient, sorted newest first.
 *
 * Maps the DB row into the shared `HistoryItem` shape (DB column `condition`
 * reads as `title`). Defensive defaults for the 0048 provenance columns keep
 * this resilient if a deployment hasn't applied that migration yet.
 */
export async function fetchMedicalHistory(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  patientId: string,
): Promise<PastHistoryData> {
  const { data, error } = await supabase
    .from("medical_history")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "PGRST205") {
      if (!warnedTableMissing) {
        warnedTableMissing = true;
        console.warn(
          "[medical-history] table missing from the database — apply supabase/migrations/0045_medical_history.sql. Showing empty history until then.",
        );
      }
      return EMPTY;
    }

    console.error("[medical-history] query failed", {
      clinicId,
      patientId,
      code: error.code,
      message: error.message,
    });
    return EMPTY;
  }

  return {
    entries: (data ?? []).map((row) => ({
      id: row.id,
      patient_id: row.patient_id,
      category: row.category,
      title: row.condition,
      onset_date: row.date,
      report_date: row.report_date ?? null,
      clinical_status: row.clinical_status ?? "active",
      source: row.source ?? "doctor_entry",
      verification_status: row.verification_status ?? "verified",
      notes: row.notes,
      relationship: row.relationship,
      created_at: row.created_at,
      created_by_name: row.created_by_name,
    })),
  };
}