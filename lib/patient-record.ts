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
import type { WorkspaceKind } from "@/lib/specialty-workspaces";
import type { HistoryItem } from "@/types/history";
import type {
  ClinicMachine,
  Database,
  DermDiagnosis,
  DermExam,
  DermLesion,
  DermPhoto,
  DermPrescription,
  DermProcedure,
  DermProcedurePreset,
  DermProfile,
  PatientAlert,
  PatientBill,
  PatientBillItem,
  PatientLabResult,
  PatientMedication,
  PatientPayment,
  Prescription,
  PsychAssessment,
  PsychCarePlan,
  PsychIntake,
  PsychIntakeSuggestion,
  PsychMse,
  PsychSafety,
  PsychSession,
  Receipt,
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
  /**
   * Psychology workspace bundle (migration 0077). Loaded only when the active
   * workspace is `psychology`; otherwise left empty so a general record pays no
   * cost for tables it will not render.
   */
  psych: PatientPsychBundle;
  /** Dermatology workspace bundle. Loaded only for the `dermatology` workspace. */
  derm: PatientDermBundle;
};

/** Psychology workspace rows (newest first for the event tables). */
export type PatientPsychBundle = {
  safety: PsychSafety | null;
  intake: PsychIntake | null;
  mse: PsychMse | null;
  sessions: PsychSession[];
  assessments: PsychAssessment[];
  carePlan: PsychCarePlan | null;
  /** Pending AI suggestions awaiting the psychologist's review (0081). */
  suggestions: PsychIntakeSuggestion[];
};

/** A patient bill with its line items, payments and receipts (Tab 6 billing). */
export type DermBillRow = PatientBill & {
  patient_bill_items: PatientBillItem[];
  patient_payments: PatientPayment[];
  receipts: Receipt[];
};

/**
 * Real pricing context for Tab 6's itemised invoice (spec §10.3). Every
 * number here is read from the clinic's own configuration — the active
 * `services` catalogue and `doctors.consultation_fee` — never hard-coded.
 * Fetched with the derm bundle so the summary tab can aggregate charges
 * without a client round trip.
 */
export type DermBillingBundle = {
  /** The patient's recent bills, newest first (capped at 5). */
  bills: DermBillRow[];
  /** The clinic's active service catalogue — the only source of procedure prices. */
  services: { id: string; name: string; price: number }[];
  /** Clinic doctors and their configured consultation fees. */
  doctors: { id: string; name: string; consultation_fee: number | null }[];
};

/** Dermatology workspace rows. */
export type PatientDermBundle = {
  profile: DermProfile | null;
  exams: DermExam[];
  procedures: DermProcedure[];
  photos: DermPhoto[];
  prescriptions: DermPrescription[];
  lesions: DermLesion[];
  diagnoses: DermDiagnosis[];
  /**
 * The clinic's machine registry (migration 0102) — clinic-scoped, not
 * patient-scoped, loaded with the bundle so Tab 5 can render machine
 * parameter profiles without a client round trip. Includes inactive rows;
 * the procedure card only offers the active ones.
 */
machines: ClinicMachine[];
/** Clinic-level treatment recipes (migration 0122) — 1-tap parameter presets
 * keyed by procedure kind; only active recipes are offered on the card. */
presets: DermProcedurePreset[];
/** Billing context for Tab 6 — bills, catalogue and doctor fees. */
billing: DermBillingBundle;
};

const EMPTY_PSYCH: PatientPsychBundle = {
  safety: null,
  intake: null,
  mse: null,
  sessions: [],
  assessments: [],
  carePlan: null,
  suggestions: [],
};

const EMPTY_DERM: PatientDermBundle = {
  profile: null,
  exams: [],
  procedures: [],
  photos: [],
  prescriptions: [],
  lesions: [],
  diagnoses: [],
  machines: [],
  presets: [],
  billing: { bills: [], services: [], doctors: [] },
};

const EMPTY: PatientRecordData = {
  visits: [],
  vitals: [],
  prescriptions: [],
  medicalHistory: [],
  medications: [],
  alerts: [],
  labResults: [],
  psych: EMPTY_PSYCH,
  derm: EMPTY_DERM,
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
  workspaceKind: WorkspaceKind = "general",
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

  // Specialty bundle (0077). Fetched only for the record's active workspace so
  // a general consultation pays nothing for tables it never renders. The event
  // tables come back newest first; the snapshots are the patient's latest row.
  let psych = EMPTY_PSYCH;
  let derm = EMPTY_DERM;

  if (workspaceKind === "psychology") {
    const [
      safety,
      intake,
      mse,
      sessionsRes,
      assessmentsRes,
      carePlan,
      suggestionsRes,
    ] = await Promise.all([
      supabase
        .from("psych_safety")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .maybeSingle(),
      supabase
        .from("psych_intake")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .maybeSingle(),
      supabase
        .from("psych_mse")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .maybeSingle(),
      supabase
        .from("psych_sessions")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .order("session_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("psych_assessments")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .order("conducted_at", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("psych_care_plans")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .maybeSingle(),
      supabase
        .from("psych_intake_suggestions")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

    psych = {
      safety: (safety.data as PsychSafety | null) ?? null,
      intake: (intake.data as PsychIntake | null) ?? null,
      mse: (mse.data as PsychMse | null) ?? null,
      sessions: (sessionsRes.data as PsychSession[]) ?? [],
      assessments: (assessmentsRes.data as PsychAssessment[]) ?? [],
      carePlan: (carePlan.data as PsychCarePlan | null) ?? null,
      suggestions: (suggestionsRes.data as PsychIntakeSuggestion[]) ?? [],
    };
  } else if (workspaceKind === "dermatology") {
    const [
      profile,
      examsRes,
      proceduresRes,
      photosRes,
      rxRes,
      lesionsRes,
      diagnosesRes,
      machinesRes,
      presetsRes,
      billsRes,
      servicesRes,
      doctorsRes,
    ] = await Promise.all([
      supabase
        .from("derm_profiles")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .maybeSingle(),
      supabase
        .from("derm_exams")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .order("exam_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("derm_procedures")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .order("procedure_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("derm_photos")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .order("taken_at", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("derm_prescriptions")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("derm_lesions")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .order("pin_number", { ascending: true })
        .order("created_at", { ascending: false }),
      supabase
        .from("derm_diagnoses")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("clinic_machines")
        .select("*")
        .eq("clinic_id", clinicId)
        .order("name", { ascending: true }),
      supabase
        .from("derm_procedure_presets")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("is_active", true)
        .order("kind")
        .order("name", { ascending: true }),
      // Tab 6 billing: the patient's recent bills with their line items and
      // receipts (child embeds only — unambiguous; see lib/patient-billing-queries).
      supabase
        .from("patient_bills")
        .select(
          "*, patient_bill_items ( * ), patient_payments ( * ), receipts ( * )",
        )
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(5),
      // Tab 6 pricing catalogue: active services are the only source of
      // procedure prices; doctor fees are the only source of consultation prices.
      supabase
        .from("services")
        .select("id, name, price")
        .eq("clinic_id", clinicId)
        .eq("status", "active")
        .order("name", { ascending: true }),
      supabase
        .from("doctors")
        .select("id, name, consultation_fee")
        .eq("clinic_id", clinicId)
        .order("name", { ascending: true }),
    ]);

    derm = {
      profile: (profile.data as DermProfile | null) ?? null,
      exams: (examsRes.data as DermExam[]) ?? [],
      procedures: (proceduresRes.data as DermProcedure[]) ?? [],
      photos: (photosRes.data as DermPhoto[]) ?? [],
      prescriptions: (rxRes.data as DermPrescription[]) ?? [],
      lesions: (lesionsRes.data as DermLesion[]) ?? [],
      diagnoses: (diagnosesRes.data as DermDiagnosis[]) ?? [],
      machines: (machinesRes.data as ClinicMachine[]) ?? [],
      presets: (presetsRes.data as DermProcedurePreset[]) ?? [],
      billing: {
        bills: (billsRes.data as DermBillRow[]) ?? [],
        services: (servicesRes.data ?? []) as DermBillingBundle["services"],
        doctors: (doctorsRes.data ?? []) as DermBillingBundle["doctors"],
      },
    };
  }

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
    psych,
    derm,
  };
}
