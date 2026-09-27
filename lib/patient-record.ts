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

import type {
  Database,
  MedicineEntry,
  Prescription,
  Visit,
  Vitals,
} from "@/types/database";

/** A visit with the doctor, vitals and prescription that belong to it. */
export type PatientVisitRow = Visit & {
  doctorName: string | null;
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
};

const EMPTY: PatientRecordData = { visits: [], vitals: [], prescriptions: [] };

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
 * Calculate BMI from height in cm and weight in kg.
 * Returns null if height is invalid (less than 1 meter).
 */
export function calculateBMI(heightCm: number | null, weightKg: number | null): {
  bmi: number | null;
  category: string | null;
} {
  if (!heightCm || !weightKg || heightCm < 100) {
    return { bmi: null, category: null };
  }
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  let category = null;
  if (bmi < 18.5) {
    category = "Underweight";
  } else if (bmi < 25) {
    category = "Normal";
  } else if (bmi < 30) {
    category = "Overweight";
  } else {
    category = "Obese";
  }
  return { bmi: parseFloat(bmi.toFixed(1)), category };
}

/**
 * Get the last prescription details for a patient.
 */
export async function getLastPrescription(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  patientId: string,
): Promise<{
  chief_complaint: string | null;
  diagnosis: string | null;
  medicines: MedicineEntry[] | null;
  doctor_name: string | null;
  visit_date: string | null;
} | null> {
  const { data, error } = await supabase
    .from("prescriptions")
    .select(`
      chief_complaint,
      diagnosis,
      medicines,
      doctor_id,
      created_at,
      visits (checked_in_at)
    `)
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  const doctor = data.doctor_id
    ? await supabase
        .from("doctors")
        .select("name")
        .eq("id", data.doctor_id)
        .single()
    : { data: null };

  return {
    chief_complaint: data.chief_complaint || null,
    diagnosis: data.diagnosis || null,
    medicines: data.medicines || null,
    doctor_name: doctor.data?.name || null,
    visit_date: data.visits?.checked_in_at || null,
  };
}

/**
 * Get billing information for the current visit.
 */
export async function getCurrentBillingInfo(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  patientId: string,
): Promise<{
  total_amount: number;
  pending_amount: number;
  paid: boolean;
  visit_count: number;
} | null> {
  const { data: visits, error: visitsError } = await supabase
    .from("visits")
    .select("id, status, token_number, checked_in_at")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("checked_in_at", { ascending: false })
    .limit(1)
    .single();

  if (visitsError || !visits) {
    return null;
  }

  const { data: bills } = await supabase
    .from("patient_bills")
    .select("total_amount, status, bill_type")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (!bills || bills.length === 0) {
    return {
      total_amount: 0,
      pending_amount: 0,
      paid: true,
      visit_count: patientId ? 1 : 0,
    };
  }

  const latestBill = bills[0];
  const pending_amount = latestBill.status === "pending"
    ? latestBill.total_amount
    : 0;
  const paid = pending_amount === 0;

  return {
    total_amount: latestBill.total_amount,
    pending_amount,
    paid,
    visit_count: patientId ? 1 : 0,
  };
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
    { data: bills },
    { data: documents },
  ] = await Promise.all([
    supabase
      .from("visits")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .order("checked_in_at", { ascending: false }),
    supabase.from("doctors").select("id, name").eq("clinic_id", clinicId),
    // Prescriptions hang off the patient directly, so they are worth fetching
    // even when there are no visit rows (an imported history, for example).
    supabase
      .from("prescriptions")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false }),
    // Parallel query for current billing status
    supabase
      .from("patient_bills")
      .select("total_amount, status, bill_type")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(1),
    // Parallel query for patient documents
    supabase
      .from("patient_documents")
      .select("id, document_name, status, uploaded_at")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId),
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
        ? doctorNames.get(visit.doctor_id) ?? null
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
        doctorName: row.doctor_id ? doctorNames.get(row.doctor_id) ?? null : null,
        visitDate: visit?.checked_in_at ?? null,
        tokenNumber: visit?.token_number ?? null,
      };
    }),
  };
}
