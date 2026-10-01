/**
 * Server-side data loader for the patient record (the detail pane of the
 * patients workspace).
 *
 * One pass fetches everything the tabbed record needs, so switching tabs is
 * instant and does not re-query. The volumes are naturally bounded — a single
 * patient's visits, vitals and prescriptions — so this is cheaper than a
 * round trip per tab.
 *
 * Every query is filtered on `clinic_id` as well as `patient_id`. RLS already
 * scopes these tables, but an explicit clinic filter means a mis-passed
 * patient id can never widen the result set.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchMedicalHistory } from "@/lib/medical-history-queries";
import type { HistoryItem } from "@/types/history";
import type {
  Database,
  PatientAlert,
  PatientLabResult,
  PatientMedication,
  Prescription,
  Visit,
  Vitals,
} from "@/types/database";

/** A visit with the doctor, vitals and prescription that belong to it. */
export type PatientVisitRow = Visit & {
  doctorName: string | null;
  /** Shown as "Dr. Name — Specialty" wherever the assigned doctor is named. */
  doctorSpecialty: string | null;
  vitals: Vitals | null;
  prescription: Prescription | null;
};

/** A prescription with the visit it came from, for the Prescriptions tab. */
export type PatientPrescriptionRow = Prescription & {
  doctorName: string | null;
  visitDate: string | null;
  tokenNumber: number | null;
};

/** A vitals reading with the date of the visit it was taken at. */
export type PatientVitalsRow = Vitals & {
  visitDate: string | null;
};

export type PatientRecordData = {
  /** Newest first. */
  visits: PatientVisitRow[];
  /** Newest first; only visits that actually have a reading. */
  vitals: PatientVitalsRow[];
  /** Newest first. */
  prescriptions: PatientPrescriptionRow[];
  /** Structured past-history entries, newest first. */
  medicalHistory: HistoryItem[];
  /** Medicines on the patient's medication list, newest first (0050). */
  medications: PatientMedication[];
  /** Safety alerts staged from scanned documents, newest first (0051). */
  alerts: PatientAlert[];
  /**
   * Lab values extracted from scanned documents, newest first (0053).
   *
   * Empty rather than absent on a failed read: the workspace rail treats a
   * missing table the same as a patient with no scans, and a thrown error here
   * would take the whole record down over a list at the bottom of the rail.
   */
  labResults: PatientLabResult[];
};

const EMPTY: PatientRecordData = {
  visits: [],
  vitals: [],
  prescriptions: [],
  medicalHistory: [],
  medications: [],
  alerts: [],
  labResults: [],
};

/**
 * Render a blood-pressure reading. Prefers the structured systolic/diastolic
 * pair and falls back to the legacy free-text `blood_pressure` column, which is
 * all that pre-0028 rows have. Returns `null` when neither is populated.
 *
 * Lives here rather than in a component so the visit-history accordion (client)
 * and the vitals table (server) share one implementation.
 */
export function formatBloodPressure(vitals: {
  systolic_bp: number | null;
  diastolic_bp: number | null;
  blood_pressure: string | null;
}): string | null {
  if (vitals.systolic_bp !== null && vitals.diastolic_bp !== null) {
    return `${vitals.systolic_bp}/${vitals.diastolic_bp}`;
  }
  return vitals.blood_pressure?.trim() || null;
}

/**
 * Calculate BMI from a height in cm and a weight in kg, plus the WHO category
 * band it falls in. Returns nulls when either input is missing or the height is
 * implausible, so callers can render "—" instead of dividing by ~0.
 *
 * Lives here rather than in a component because both the banner and the
 * Visit History tab badge the same number, and a second implementation is how
 * the two drift apart.
 */
export function calculateBMI(
  heightCm: number | null,
  weightKg: number | null,
): { bmi: number | null; category: string | null } {
  if (!heightCm || !weightKg || heightCm < 100) {
    return { bmi: null, category: null };
  }
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  const category =
    bmi < 18.5
      ? "Underweight"
      : bmi < 25
        ? "Normal"
        : bmi < 30
          ? "Overweight"
          : "Obese";
  return { bmi: parseFloat(bmi.toFixed(1)), category };
}

export async function fetchPatientRecord(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  patientId: string,
): Promise<PatientRecordData> {
  const [
    { data: visits, error: visitsError },
    { data: doctors },
    { data: prescriptionRows },
    { data: medicationRows },
    { data: alertRows },
    { data: labResults },
    history,
  ] = await Promise.all([
    supabase
      .from("visits")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .order("checked_in_at", { ascending: false }),
    supabase
      .from("doctors")
      .select("id, name, specialty")
      .eq("clinic_id", clinicId),
    // Prescriptions hang off the patient directly, so they are worth fetching
    // even when there are no visit rows (an imported history, for example).
    supabase
      .from("prescriptions")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false }),
    // Medicine list (0050) — scanned AI OCR rows land here awaiting approval.
    supabase
      .from("patient_medications")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false }),
    // Safety alerts (0051) — scanned allergies / known cases awaiting review.
    supabase
      .from("patient_alerts")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false }),
    // Lab results (0053) — extracted values from scanned reports, ordered newest.
    supabase
      .from("patient_lab_results")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false }),
    // Structured past-history entries (0045, widened in 0048). Pairs with the
    // free-text past_history columns on the patient row.
    fetchMedicalHistory(supabase, clinicId, patientId),
  ]);

  if (visitsError) {
    console.error("[patient record] visits query failed", {
      clinicId,
      code: visitsError.code,
      message: visitsError.message,
    });
    return EMPTY;
  }

  const doctorNames = new Map(
    (doctors ?? []).map((doctor) => [doctor.id, doctor.name]),
  );
  const doctorSpecialties = new Map(
    (doctors ?? []).map((doctor) => [doctor.id, doctor.specialty ?? null]),
  );
  const visitRows = visits ?? [];
  const visitIds = visitRows.map((visit) => visit.id);

  // Vitals are keyed on `visit_id`, so this one genuinely depends on the visits
  // read above and cannot join the first wave.
  const { data: vitalsRows } = visitIds.length
    ? await supabase
        .from("vitals")
        .select("*")
        .eq("clinic_id", clinicId)
        .in("visit_id", visitIds)
    : { data: [] as Vitals[] };

  const vitalsByVisit = new Map(
    (vitalsRows ?? []).map((row) => [row.visit_id, row as Vitals]),
  );
  const prescriptionByVisit = new Map(
    (prescriptionRows ?? []).map((row) => [row.visit_id, row as Prescription]),
  );
  const visitById = new Map(visitRows.map((visit) => [visit.id, visit]));

  return {
    visits: visitRows.map((visit) => ({
      ...visit,
      doctorName: visit.doctor_id
        ? (doctorNames.get(visit.doctor_id) ?? null)
        : null,
      doctorSpecialty: visit.doctor_id
        ? (doctorSpecialties.get(visit.doctor_id) ?? null)
        : null,
      vitals: vitalsByVisit.get(visit.id) ?? null,
      prescription: prescriptionByVisit.get(visit.id) ?? null,
    })),
    vitals: (vitalsRows ?? [])
      .map((row) => ({
        ...(row as Vitals),
        visitDate: visitById.get(row.visit_id)?.checked_in_at ?? null,
      }))
      .sort((a, b) => (a.recorded_at < b.recorded_at ? 1 : -1)),
    prescriptions: (prescriptionRows ?? []).map((row) => {
      const visit = visitById.get(row.visit_id);
      return {
        ...(row as Prescription),
        doctorName: row.doctor_id
          ? (doctorNames.get(row.doctor_id) ?? null)
          : null,
        visitDate: visit?.checked_in_at ?? null,
        tokenNumber: visit?.token_number ?? null,
      };
    }),
    medications: medicationRows ?? [],
    alerts: alertRows ?? [],
    labResults: labResults ?? [],
    medicalHistory: history?.entries ?? [],
  };
}
