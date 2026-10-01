import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  Visit,
  Vitals,
  Patient,
  Doctor,
  Service,
  Prescription,
  PrescriptionTemplate,
  PreConsultationAnswer,
} from "@/types/database";

/**
 * Enriched visit for the doctor waiting list — includes patient, doctor,
 * service, and vitals data.
 */
export type WaitingListEntry = Visit & {
  patientName: string;
  patientPhone: string | null;
  patientEmail: string | null;
  patientDob: string | null;
  doctorName: string | null;
  doctorId: string | null;
  serviceName: string;
  tokenNumber: number;
  vitals: Vitals | null;
};

/**
 * A pre-consultation answer joined with its question text, ready for display
 * on the consultation screen (Phase 22). `display_order` comes from the
 * question so answers render in the exact order the clinic configured.
 */
export type ConsultationPreAnswer = PreConsultationAnswer & {
  question: { question_text: string } | null;
};

/**
 * Full consultation data — visit + patient + doctor + vitals + prescription
 * + the patient's collected pre-consultation answers (Phase 22).
 */
export type ConsultationData = {
  visit: Visit;
  patient: Patient;
  doctor: Doctor | null;
  service: Service | null;
  vitals: Vitals | null;
  prescription: Prescription | null;
  answers: ConsultationPreAnswer[];
};

/**
 * Fetch the doctor's waiting list: all checked-in visits that are
 * waiting or in_consultation, enriched with patient/doctor/service/vitals.
 */
export async function fetchDoctorWaitingList(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  doctorId: string | null,
): Promise<WaitingListEntry[]> {
  let query = supabase
    .from("visits")
    .select(`
      *,
      patients!visits_clinic_patient_fkey(name, phone, email, date_of_birth),
      doctors!visits_clinic_doctor_fkey(name, id),
      appointments!visits_clinic_appointment_fkey(
        services!appointments_clinic_service_fkey(name)
      ),
      vitals(*)
    `)
    .eq("clinic_id", clinicId)
    .in("status", ["waiting", "in_consultation"])
    .order("queue_position", { ascending: true });

  // scope to doctor's own patients if multi-doctor
  if (doctorId) {
    query = query.eq("doctor_id", doctorId);
  }

  const { data: visits, error } = await query;

  if (error) {
    console.error("fetchDoctorWaitingList error:", error.message, error.details);
  }
  if (!visits) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase join queries return complex inferred types
  return (visits as Record<string, any>[]).map((v) => ({
    ...v,
    patientName: v.patients?.name ?? "Unknown",
    patientPhone: v.patients?.phone ?? null,
    patientEmail: v.patients?.email ?? null,
    patientDob: v.patients?.date_of_birth ?? null,
    doctorName: v.doctors?.name ?? null,
    doctorId: v.doctors?.id ?? null,
    serviceName: v.appointments?.services?.name ?? "Walk-in",
    tokenNumber: v.token_number,
    vitals: v.vitals?.[0] ?? null,
  })) as WaitingListEntry[];
}

/**
 * Fetch full consultation data for a specific visit.
 */
export async function fetchConsultationData(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  visitId: string,
): Promise<ConsultationData | null> {
  // The visit bundle and the existing prescription key off the same inputs
  // (clinic + visit id), so they go out together; one round trip instead of
  // two on the page's critical path. When the visit is missing the extra
  // prescription read is simply unused — same null return as before.
  const [{ data: visit, error: visitError }, { data: prescription }] =
    await Promise.all([
      supabase
        .from("visits")
        .select(`
          *,
          patients!visits_clinic_patient_fkey(*),
          doctors!visits_clinic_doctor_fkey(*),
          appointments!visits_clinic_appointment_fkey(
            services!appointments_clinic_service_fkey(*)
          ),
          vitals(*)
        `)
        .eq("clinic_id", clinicId)
        .eq("id", visitId)
        .single(),
      supabase
        .from("prescriptions")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("visit_id", visitId)
        .single(),
    ]);

  if (visitError || !visit) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase join queries return complex inferred types
  const v = visit as Record<string, any>;

  // Phase 22 — pre-consultation answers collected during/after booking,
  // joined with their question text and ordered like the clinic configured.
  const appointmentId = v.appointment_id as string | null;
  const answers = await fetchPreConsultationAnswers(supabase, clinicId, appointmentId);

  return {
    visit: v as Visit,
    patient: v.patients as Patient,
    doctor: v.doctors as Doctor | null,
    service: v.appointments?.services as Service | null,
    vitals: v.vitals?.[0] as Vitals | null,
    prescription: prescription as Prescription | null,
    answers,
  };
}

/**
 * Pre-consultation answers for a visit's booking, joined with their question
 * text and ordered the way the clinic sequenced the questions.
 *
 * Lives here as its own read so the patient record's prescription workspace can
 * show the same answers the consultation screen does without duplicating the
 * join — and a walk-in visit (no appointment) simply yields none.
 */
export async function fetchPreConsultationAnswers(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  appointmentId: string | null,
): Promise<ConsultationPreAnswer[]> {
  if (!appointmentId) return [];

  const { data: answerRows } = await supabase
    .from("pre_consultation_answers")
    .select(
      "*, pre_consultation_questions!pre_consultation_answers_clinic_question_fkey(question_text)",
    )
    .eq("clinic_id", clinicId)
    .eq("appointment_id", appointmentId)
    .order("display_order", {
      foreignTable: "pre_consultation_questions",
      ascending: true,
    });

  return (answerRows ?? []) as unknown as ConsultationPreAnswer[];
}

/**
 * Fetch prescription templates for a doctor.
 */
export async function fetchPrescriptionTemplates(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  doctorId: string,
): Promise<PrescriptionTemplate[]> {
  const { data, error } = await supabase
    .from("prescription_templates")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("doctor_id", doctorId)
    .order("name", { ascending: true });

  if (error || !data) return [];
  return data as PrescriptionTemplate[];
}

/**
 * Find the logged-in user's doctor record for a clinic.
 * Returns null if no doctor record is linked to this user.
 */
export async function findDoctorForUser(
  supabase: SupabaseClient<Database>,
  clinicId: string,
): Promise<Doctor | null> {
  // `getClaims()` validates the session JWT locally (signature + expiry) and
  // yields the same `sub` the doctors lookup needs — `getUser()` adds a full
  // round trip to the Auth server on the page's critical path for nothing
  // more. Works from both the server client (page) and browser client (the
  // Write Prescription overlay).
  const { data: claimsRes } = await supabase.auth.getClaims();
  const userId = claimsRes?.claims?.sub;
  if (!userId) return null;

  const { data: doctor } = await supabase
    .from("doctors")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("user_id", userId)
    .single();

  return doctor as Doctor | null;
}
