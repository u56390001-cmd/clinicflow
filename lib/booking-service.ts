import type { SupabaseClient } from "@supabase/supabase-js";

import {
  checkSlotAvailability,
  getDoctorDayWindows,
  getServiceDayWindows,
  type DoctorDayWindow,
} from "@/lib/booking";
import { logAppEvent } from "@/lib/observability";
import {
  clinicLocalDayOfWeek,
  clinicLocalToUtcIso,
  timeOfDayToMinutes,
  utcIsoToClinicLocalInput,
} from "@/lib/time";
import { notifyPatient } from "@/lib/notifications";
import {
  getActivePreConsultationQuestions,
  recordPreConsultationAnswers,
  type PreConsultationAnswerInput,
} from "@/lib/pre-consultation";
import type {
  Appointment,
  AppointmentStatus,
  ConsultationType,
  Database,
} from "@/types/database";

/**
 * Shared, validated appointment/patient logic used by BOTH the dashboard
 * Server Actions (`lib/actions/appointments.ts`) and the AI tool layer
 * (`lib/ai/tools.ts`). Single source of truth — the AI never reimplements or
 * bypasses these paths, and it never writes to the database directly.
 *
 * Every function takes an already-resolved `clinic` ({ id, timezone }) and an
 * authenticated Supabase client. Authorization (who may call these for which
 * clinic) is the caller's job: the Server Actions check the session role, the
 * AI orchestrator pins the clinic to the signed-in tester's clinic.
 */

export type BookingClinic = { id: string; timezone: string };

/** Map a database error to a friendly message (RPC codes raised by 0005/0033). */
function friendlyDbMessage(error: { message: string } | null, fallback: string): string {
  if (!error) return fallback;
  const message = String(error.message ?? "");
  if (message.includes("SHARED_WINDOW_FULL")) {
    return "This time window is full. Pick another time.";
  }
  if (message.includes("SLOT_OVERLAP")) {
    return "This slot overlaps an existing appointment. Pick another time.";
  }
  if (message.includes("APPOINTMENT_NOT_FOUND")) {
    return "That appointment no longer exists.";
  }
  return fallback;
}

export type DoctorBookingGuard = {
  mode: "single_slot" | "shared_window";
  capacity: number;
};

export const DEFAULT_BOOKING_GUARD: DoctorBookingGuard = { mode: "single_slot", capacity: 1 };

/**
 * Resolve the doctor's booking guard (Phase 20). `single_slot` doctors keep
 * today's exact one-patient-per-slot semantics; `shared_window` doctors may
 * host up to `max_patients_per_window` patients anchored to the same start
 * time. A missing / unassigned doctor defaults to single_slot with capacity 1.
 */
export async function getDoctorBookingGuard(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  doctorId?: string | null,
): Promise<DoctorBookingGuard> {
  if (!doctorId) return DEFAULT_BOOKING_GUARD;
  const { data: doctor } = await supabase
    .from("doctors")
    .select("consultation_mode, max_patients_per_window")
    .eq("clinic_id", clinicId)
    .eq("id", doctorId)
    .maybeSingle();
  if (!doctor) return DEFAULT_BOOKING_GUARD;
  const capacity =
    doctor.max_patients_per_window && doctor.max_patients_per_window > 0
      ? doctor.max_patients_per_window
      : 1;
  return { mode: doctor.consultation_mode ?? "single_slot", capacity };
}

export type PatientInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  age?: number | null;
  gender?: "male" | "female" | "other" | null;
  city?: string | null;
  known_allergies?: string | null;
  medical_conditions?: string | null;
};

export type FindOrCreatePatientResult =
  | { ok: true; patientId: string; created: boolean }
  | { ok: false; message: string };

/**
 * Resolve a patient for a booking. When an email (or phone, if no email) matches
 * an existing patient in this clinic, reuse that record — never create
 * duplicates blindly. Otherwise create a new patient using the same insert path
 * as the dashboard. `name` is required (the AI tool enforces each clinic's
 * configured required fields before calling).
 */
export async function findOrCreatePatient(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  patient: PatientInput,
): Promise<FindOrCreatePatientResult> {
  const name = patient.name.trim();
  if (!name) {
    return { ok: false, message: "A patient name is required." };
  }

  const email = patient.email?.trim() || null;
  const phone = patient.phone?.trim() || null;
  const city = patient.city?.trim() || null;
  const gender = patient.gender || null;
  const age = patient.age ?? null;
  const knownAllergies = patient.known_allergies?.trim() || null;
  const medicalConditions = patient.medical_conditions?.trim() || null;

  if (email) {
    const { data: match } = await supabase
      .from("patients")
      .select("id")
      .eq("clinic_id", clinicId)
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (match) return { ok: true, patientId: match.id, created: false };
  } else if (phone) {
    const { data: match } = await supabase
      .from("patients")
      .select("id")
      .eq("clinic_id", clinicId)
      .ilike("phone", phone)
      .limit(1)
      .maybeSingle();
    if (match) {
      // Update existing patient with any new fields provided
      await supabase
        .from("patients")
        .update({
          ...(city && { city }),
          ...(gender && { gender }),
          ...(age != null && { age }),
          ...(knownAllergies && { known_allergies: knownAllergies }),
          ...(medicalConditions && { medical_conditions: medicalConditions }),
        })
        .eq("id", match.id);
      return { ok: true, patientId: match.id, created: false };
    }
  }

  const { data: created, error } = await supabase
    .from("patients")
    .insert({
      clinic_id: clinicId,
      name,
      email,
      phone,
      notes: null,
      city,
      gender,
      age,
      known_allergies: knownAllergies,
      medical_conditions: medicalConditions,
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[booking-service] findOrCreatePatient insert failed", {
      clinicId,
      code: error?.code,
      message: error?.message,
    });
    await logAppEvent(supabase, {
      clinicId,
      category: "booking",
      event: "patient_create_failed",
      metadata: { code: error?.code ?? null },
    });
    return { ok: false, message: "We couldn't create the new patient. Please try again." };
  }

  return { ok: true, patientId: created.id, created: true };
}

export type CreateAppointmentInput = {
  /** An existing patient's id (dashboard path). Mutually exclusive with `patient`. */
  patientId?: string;
  /** Patient details used to find-or-create (AI path). Mutually exclusive with `patientId`. */
  patient?: PatientInput;
  serviceId: string;
  /**
   * Optional doctor for this booking. When omitted, a service that is tied to
   * one specific doctor implies that doctor; otherwise the appointment is
   * unassigned (`doctor_id IS NULL`, conservative overlap semantics).
   */
  doctorId?: string | null;
  /** Naive clinic-local `YYYY-MM-DDTHH:mm` start time. */
  start: string;
  notes?: string | null;
  bookingSource: string;
  /** How the visit is delivered (Phase 15). Defaults to `in_clinic`. */
  consultationType?: ConsultationType;
  /**
   * Phase 22 — during-booking answers collected by whoever drove the
   * conversation (AI receptionist or the WhatsApp adapter). Persisted to
   * `pre_consultation_answers` right after the appointment is created; a
   * storage failure never un-books the appointment.
   */
  preConsultationAnswers?: PreConsultationAnswerInput[];
};

export type CreateAppointmentResult =
  | { ok: true; appointment: Appointment }
  | { ok: false; message: string };

/**
 * Create an appointment through the exact Phase 3 sequence: validate the
 * service is active, resolve the patient (existing id or find-or-create),
 * re-check the slot at write time, then commit through the atomic
 * `book_appointment` RPC (advisory lock + overlap re-verification). The AI
 * tool never confirms a booking before this returns ok.
 */
export async function createAppointmentService(
  supabase: SupabaseClient<Database>,
  clinic: BookingClinic,
  input: CreateAppointmentInput,
): Promise<CreateAppointmentResult> {
  if (input.patientId && input.patient) {
    return {
      ok: false,
      message: "Pass either an existing patient id or new patient details, not both.",
    };
  }

  // 1. Service must exist, be active, and belong to the clinic. Its optional
  // doctor tie participates in doctor resolution below.
  const { data: service } = await supabase
    .from("services")
    .select("id, duration_minutes, doctor_id, consultation_mode")
    .eq("clinic_id", clinic.id)
    .eq("id", input.serviceId)
    .eq("status", "active")
    .maybeSingle();
  if (!service) {
    return { ok: false, message: "That service is no longer bookable." };
  }

  // 1b. Resolve the effective doctor: an explicitly selected doctor wins; a
  // service tied to one specific doctor implies that doctor. A mismatch is
  // refused — a specialist-only service cannot be booked under another
  // doctor's name.
  let doctorId: string | null = null;
  if (input.doctorId) {
    const { data: doctor } = await supabase
      .from("doctors")
      .select("id, name, is_visible")
      .eq("clinic_id", clinic.id)
      .eq("id", input.doctorId)
      .maybeSingle();
    if (!doctor) {
      return { ok: false, message: "That doctor is not part of this clinic." };
    }
    if (service.doctor_id && service.doctor_id !== doctor.id) {
      return {
        ok: false,
        message:
          "This service is only offered by a specific doctor. Pick that doctor or another service.",
      };
    }
    // Invisible doctors keep historical bookings but are not bookable anew.
    if (!doctor.is_visible) {
      return { ok: false, message: "That doctor is not accepting new bookings." };
    }
    doctorId = doctor.id;
  } else if (service.doctor_id) {
    doctorId = service.doctor_id;
  }

  // 2. Patient: an existing record, or find-or-create by email/phone.
  let patientId = input.patientId;
  if (!patientId) {
    const resolved = await findOrCreatePatient(supabase, clinic.id, input.patient ?? { name: "" });
    if (!resolved.ok) return resolved;
    patientId = resolved.patientId;
  }

  // 3. Slot re-check at write time (time may have passed since getAvailability).
  const startIso = clinicLocalToUtcIso(input.start, clinic.timezone);
  const endIso = new Date(
    new Date(startIso).getTime() + service.duration_minutes * 60_000,
  ).toISOString();

  const guard = await getDoctorBookingGuard(supabase, clinic.id, doctorId);
  const check = await checkSlotAvailability(
    supabase,
    clinic.id,
    clinic.timezone,
    startIso,
    endIso,
    undefined,
    doctorId,
    guard.mode,
    guard.capacity,
    service.id,
    doctorId ? null : service.consultation_mode,
  );
  if (!check.ok) {
    await logAppEvent(supabase, {
      clinicId: clinic.id,
      category: "booking",
      event: "slot_conflict",
      severity: "warning",
      metadata: { startIso, bookingSource: input.bookingSource },
    });
    return { ok: false, message: check.message };
  }

  // 4. Commit transactionally (RPC re-verifies overlap under an advisory lock).
  const { data: appointment, error } = await supabase.rpc("book_appointment", {
    p_clinic_id: clinic.id,
    p_patient_id: patientId,
    p_service_id: service.id,
    p_start_time: startIso,
    p_end_time: endIso,
    p_booking_source: input.bookingSource,
    p_notes: input.notes || null,
    p_status: "pending" as AppointmentStatus,
    p_doctor_id: doctorId,
    p_consultation_type: (input.consultationType ?? "in_clinic") as ConsultationType,
  });

  if (error || !appointment) {
    console.error("[booking-service] book_appointment failed", {
      clinicId: clinic.id,
      patientId,
      serviceId: service.id,
      startIso,
      bookingSource: input.bookingSource,
      code: error?.code,
      message: error?.message,
    });
    const isOverlap = Boolean(error && String(error.message).includes("SLOT_OVERLAP"));
    await logAppEvent(supabase, {
      clinicId: clinic.id,
      category: "booking",
      event: isOverlap ? "slot_conflict_write" : "booking_failed",
      severity: isOverlap ? "warning" : "error",
      metadata: {
        booking_source: input.bookingSource,
        code: error?.code ?? null,
      },
    });
    return {
      ok: false,
      message: friendlyDbMessage(error, "We couldn't book this appointment. Please try again."),
    };
  }

  // 5. Persist during-booking answers (never un-books on failure) and, if the
  // scope owns ANY after-booking questions, fire the WhatsApp follow-up.
  if (input.preConsultationAnswers && input.preConsultationAnswers.length > 0) {
    const stored = await recordPreConsultationAnswers(
      supabase,
      clinic.id,
      appointment.id,
      input.preConsultationAnswers,
    );
    if (!stored.ok) {
      console.warn("[booking-service] during-booking answers not stored", {
        clinicId: clinic.id,
        appointmentId: appointment.id,
      });
    }
  }
  dispatchAfterBookingQuestions(supabase, clinic, input, appointment);

  return { ok: true, appointment };
}

/**
 * Phase 22 — after-booking WhatsApp follow-up. When the booking's scope (service
 * preferred, doctor fallback) is configured with `after_booking` questions, a
 * plain-text WhatsApp message listing them is queued to the patient. Fully
 * best-effort and fire-and-forget: a missing patient number, no WhatsApp
 * connection or a Meta window rejection never affects the booking result.
 */
async function dispatchAfterBookingQuestions(
  supabase: SupabaseClient<Database>,
  clinic: BookingClinic,
  input: CreateAppointmentInput,
  appointment: Appointment,
): Promise<void> {
  try {
    const questions = await getActivePreConsultationQuestions(supabase, clinic.id, {
      serviceId: appointment.service_id,
      doctorId: appointment.doctor_id,
      timing: "after_booking",
    });
    if (questions.length === 0) return;

    const [{ data: patient }, { data: clinicRow }] = await Promise.all([
      supabase
        .from("patients")
        .select("name")
        .eq("clinic_id", clinic.id)
        .eq("id", appointment.patient_id)
        .maybeSingle(),
      supabase
        .from("clinics")
        .select("name")
        .eq("id", clinic.id)
        .maybeSingle(),
    ]);
    const patientName = patient?.name?.trim();
    if (!patientName) return;

    await notifyPatient({
      clinicId: clinic.id,
      patientId: appointment.patient_id,
      channel: "whatsapp",
      type: "pre_consultation_followup",
      payload: {
        patientName,
        clinicName: clinicRow?.name?.trim() || "",
        questions: questions.map((question) => ({
          id: question.id,
          text: question.question_text,
        })),
      },
    });
  } catch (error) {
    // The booking already succeeded; the follow-up is best-effort only.
    console.warn("[booking-service] after-booking follow-up skipped", error);
  }
}

export type RescheduleAppointmentResult =
  | { ok: true; appointment: Appointment }
  | { ok: false; message: string };

/**
 * Move an appointment to a new clinic-local start time. The new slot is
 * re-validated (excluding the appointment's own overlap), then committed via
 * the atomic `reschedule_appointment` RPC. Only pending/confirmed
 * appointments may be rescheduled.
 */
export async function rescheduleAppointmentService(
  supabase: SupabaseClient<Database>,
  clinic: BookingClinic,
  appointmentId: string,
  start: string,
): Promise<RescheduleAppointmentResult> {
  const { data: appointment } = await supabase
    .from("appointments")
    .select("id, service_id, status, doctor_id")
    .eq("id", appointmentId)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!appointment) {
    return { ok: false, message: "That appointment no longer exists." };
  }
  if (!["pending", "confirmed"].includes(appointment.status)) {
    return { ok: false, message: "Only pending or confirmed appointments can be rescheduled." };
  }

  const { data: service } = await supabase
    .from("services")
    .select("duration_minutes, consultation_mode")
    .eq("clinic_id", clinic.id)
    .eq("id", appointment.service_id)
    .maybeSingle();
  if (!service) {
    return { ok: false, message: "This appointment's service no longer exists." };
  }

  const newStartIso = clinicLocalToUtcIso(start, clinic.timezone);
  const newEndIso = new Date(
    new Date(newStartIso).getTime() + service.duration_minutes * 60_000,
  ).toISOString();

  const guard = await getDoctorBookingGuard(supabase, clinic.id, appointment.doctor_id);
  const check = await checkSlotAvailability(
    supabase,
    clinic.id,
    clinic.timezone,
    newStartIso,
    newEndIso,
    appointment.id,
    appointment.doctor_id,
    guard.mode,
    guard.capacity,
    appointment.service_id,
    appointment.doctor_id ? null : service.consultation_mode,
  );
  if (!check.ok) return { ok: false, message: check.message };

  const { data: updated, error } = await supabase.rpc("reschedule_appointment", {
    p_appointment_id: appointment.id,
    p_clinic_id: clinic.id,
    p_new_start_time: newStartIso,
    p_new_end_time: newEndIso,
  });

  if (error || !updated) {
    console.error("[booking-service] reschedule_appointment failed", {
      appointmentId: appointment.id,
      clinicId: clinic.id,
      newStartIso,
      code: error?.code,
      message: error?.message,
    });
    return {
      ok: false,
      message: friendlyDbMessage(error, "We couldn't reschedule this appointment. Please try again."),
    };
  }

  return { ok: true, appointment: updated };
}

export type SetAppointmentStatusResult =
  | { ok: true; appointment: Appointment }
  | { ok: false; message: string };

/**
 * Explicit status change (confirm / cancel / complete / no-show), scoped to
 * the clinic. Cancelling frees the slot (availability checks skip cancelled
 * rows). `pending` is only ever the creation default, never an explicit target.
 */
export async function setAppointmentStatusService(
  supabase: SupabaseClient<Database>,
  clinic: BookingClinic,
  appointmentId: string,
  status: Exclude<AppointmentStatus, "pending">,
): Promise<SetAppointmentStatusResult> {
  const { data: appointment, error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", appointmentId)
    .eq("clinic_id", clinic.id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[booking-service] appointment status update failed", {
      appointmentId,
      clinicId: clinic.id,
      status,
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: "We couldn't update this appointment. Please try again." };
  }
  if (!appointment) {
    return { ok: false, message: "That appointment no longer exists." };
  }

  return { ok: true, appointment };
}

export type UpdateAppointmentInput = {
  patientId: string;
  serviceId: string;
  doctorId?: string | null;
  start: string;
  notes?: string | null;
  consultationType?: ConsultationType;
  patient?: PatientInput;
};

export type UpdateAppointmentResult =
  | { ok: true; appointment: Appointment }
  | { ok: false; message: string };

/**
 * Edit an existing pending/confirmed appointment (Phase 56). Re-validates the
 * service and doctor, updates the linked patient's demographics if provided,
 * re-checks the slot (excluding this appointment's own overlap), then updates
 * the appointment row. Only pending/confirmed appointments may be edited.
 */
export async function updateAppointmentService(
  supabase: SupabaseClient<Database>,
  clinic: BookingClinic,
  appointmentId: string,
  input: UpdateAppointmentInput,
): Promise<UpdateAppointmentResult> {
  const { data: existing } = await supabase
    .from("appointments")
    .select("id, status, service_id, doctor_id, patient_id")
    .eq("id", appointmentId)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!existing) {
    return { ok: false, message: "That appointment no longer exists." };
  }
  if (!["pending", "confirmed"].includes(existing.status)) {
    return { ok: false, message: "Only pending or confirmed appointments can be edited." };
  }

  // Service must exist, be active, and belong to the clinic.
  const { data: service } = await supabase
    .from("services")
    .select("id, duration_minutes, doctor_id, consultation_mode")
    .eq("clinic_id", clinic.id)
    .eq("id", input.serviceId)
    .eq("status", "active")
    .maybeSingle();
  if (!service) {
    return { ok: false, message: "That service is no longer bookable." };
  }

  // Resolve the effective doctor (explicit selection wins; a tied service implies its doctor).
  let doctorId: string | null = null;
  if (input.doctorId) {
    const { data: doctor } = await supabase
      .from("doctors")
      .select("id, is_visible")
      .eq("clinic_id", clinic.id)
      .eq("id", input.doctorId)
      .maybeSingle();
    if (!doctor) {
      return { ok: false, message: "That doctor is not part of this clinic." };
    }
    if (service.doctor_id && service.doctor_id !== doctor.id) {
      return {
        ok: false,
        message:
          "This service is only offered by a specific doctor. Pick that doctor or another service.",
      };
    }
    if (!doctor.is_visible) {
      return { ok: false, message: "That doctor is not accepting new bookings." };
    }
    doctorId = doctor.id;
  } else if (service.doctor_id) {
    doctorId = service.doctor_id;
  }

  // Update linked patient demographics when provided (never change patient id).
  if (input.patient) {
    await supabase
      .from("patients")
      .update({
        ...(input.patient.city ? { city: input.patient.city } : {}),
        ...(input.patient.gender ? { gender: input.patient.gender } : {}),
        ...(input.patient.age != null ? { age: input.patient.age } : {}),
        ...(input.patient.known_allergies
          ? { known_allergies: input.patient.known_allergies }
          : {}),
        ...(input.patient.medical_conditions
          ? { medical_conditions: input.patient.medical_conditions }
          : {}),
      })
      .eq("id", existing.patient_id)
      .eq("clinic_id", clinic.id);
  }

  const startIso = clinicLocalToUtcIso(input.start, clinic.timezone);
  const endIso = new Date(
    new Date(startIso).getTime() + service.duration_minutes * 60_000,
  ).toISOString();

  const guard = await getDoctorBookingGuard(supabase, clinic.id, doctorId);
  const check = await checkSlotAvailability(
    supabase,
    clinic.id,
    clinic.timezone,
    startIso,
    endIso,
    appointmentId,
    doctorId,
    guard.mode,
    guard.capacity,
    service.id,
    doctorId ? null : service.consultation_mode,
  );
  if (!check.ok) return { ok: false, message: check.message };

  const { data: appointment, error } = await supabase
    .from("appointments")
    .update({
      service_id: service.id,
      doctor_id: doctorId,
      start_time: startIso,
      end_time: endIso,
      notes: input.notes || null,
      consultation_type: (input.consultationType ?? "in_clinic") as ConsultationType,
    })
    .eq("id", appointmentId)
    .eq("clinic_id", clinic.id)
    .select("*")
    .maybeSingle();

  if (error || !appointment) {
    console.error("[booking-service] appointment update failed", {
      appointmentId,
      clinicId: clinic.id,
      code: error?.code,
      message: error?.message,
    });
    return {
      ok: false,
      message: friendlyDbMessage(error, "We couldn't update this appointment. Please try again."),
    };
  }

  return { ok: true, appointment };
}

/** Step between enumerated candidate slots, in minutes. */
const SLOT_STEP_MINUTES = 15;

/** Maximum slots returned for one date (keeps tool responses small). */
const SLOT_LIMIT = 40;

export type ListAvailableSlotsResult =
  | { ok: true; serviceId: string; durationMinutes: number; slots: string[] }
  | { ok: false; message: string };

/**
 * Enumerate the real open slots for a clinic-local date and service by running
 * the SAME `checkSlotAvailability` used everywhere else (working hours,
 * blocked times, existing-appointment overlap) over candidate start times.
 * Candidate starts step by 15 minutes within the day's windows; slots already
 * in the clinic's past are skipped. Returns naive clinic-local
 * `YYYY-MM-DDTHH:mm` start times — never invented, always verified.
 *
 * `preferredTime` (HH:MM) optionally narrows the search to start at that time
 * instead of the window's opening. `doctorId` scopes the working-hours
 * resolution, the overlap check, and (Phase 20) the shared-window capacity. A
 * doctor with `doctor_slot_templates` for that weekday books inside those
 * named windows (which take precedence over the range-based
 * `availability_rules`); otherwise the doctor's own rules apply, falling back
 * to clinic-wide defaults.
 */
export async function listAvailableSlots(
  supabase: SupabaseClient<Database>,
  clinic: BookingClinic,
  serviceId: string,
  date: string,
  preferredTime?: string,
  doctorId?: string | null,
): Promise<ListAvailableSlotsResult> {
  const { data: service } = await supabase
    .from("services")
    .select("id, duration_minutes, consultation_mode")
    .eq("clinic_id", clinic.id)
    .eq("id", serviceId)
    .eq("status", "active")
    .maybeSingle();
  if (!service) {
    return { ok: false, message: "That service is no longer bookable." };
  }

  const dayOfWeek = clinicLocalDayOfWeek(`${date}T00:00`);
  const duration = service.duration_minutes;

  // Resolve the booking windows for the day: slot templates win when the
  // doctor (or service, for doctor-less bookings) owns any for this weekday,
  // otherwise the range-based rules.
  let guard: DoctorBookingGuard = DEFAULT_BOOKING_GUARD;
  let windows: DoctorDayWindow[] | null = null;

  if (doctorId) {
    guard = await getDoctorBookingGuard(supabase, clinic.id, doctorId);
    windows = await getDoctorDayWindows(supabase, clinic.id, doctorId, dayOfWeek);
  } else {
    windows = await getServiceDayWindows(supabase, clinic.id, service.id, dayOfWeek);
  }
  if (!windows) {
    let rulesQuery = supabase
      .from("availability_rules")
      .select("start_time, end_time")
      .eq("clinic_id", clinic.id)
      .eq("day_of_week", dayOfWeek)
      .eq("enabled", true);
    if (doctorId) {
      rulesQuery = rulesQuery
        .or(`doctor_id.is.null,doctor_id.eq.${doctorId}`)
        .order("doctor_id", { ascending: true, nullsFirst: false });
    } else {
      rulesQuery = rulesQuery.is("doctor_id", null);
    }
    const { data: rules } = await rulesQuery.limit(1);
    const rule = rules?.[0];
    if (!rule) {
      return {
        ok: true,
        serviceId: service.id,
        durationMinutes: duration,
        slots: [],
      };
    }
    windows = [
      {
        startMinutes: timeOfDayToMinutes(rule.start_time),
        endMinutes: timeOfDayToMinutes(rule.end_time),
      },
    ];
  }
  if (windows.length === 0) {
    return {
      ok: true,
      serviceId: service.id,
      durationMinutes: duration,
      slots: [],
    };
  }

  const preferred = preferredTime ? timeOfDayToMinutes(preferredTime) : null;
  const nowLocal = utcIsoToClinicLocalInput(new Date().toISOString(), clinic.timezone);
  const nowNaive = nowLocal.slice(0, 16);

  // Step 15 minutes across every window, skip duplicates where windows overlap.
  const candidates: string[] = [];
  const seen = new Set<number>();
  for (const window of windows) {
    if (candidates.length >= SLOT_LIMIT) break;
    const anchor =
      preferred !== null
        ? Math.max(window.startMinutes, Math.min(preferred, window.endMinutes - duration))
        : window.startMinutes;
    for (
      let minutes = anchor;
      minutes + duration <= window.endMinutes && candidates.length < SLOT_LIMIT;
      minutes += SLOT_STEP_MINUTES
    ) {
      if (seen.has(minutes)) continue;
      seen.add(minutes);
      const pad = (n: number) => String(n).padStart(2, "0");
      const naive = `${date}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
      // Skip anything already in the clinic's past.
      if (naive < nowNaive) continue;
      candidates.push(naive);
    }
  }
  candidates.sort();

  const results = await Promise.all(
    candidates.map(async (naive) => {
      const startIso = clinicLocalToUtcIso(naive, clinic.timezone);
      const endIso = new Date(
        new Date(startIso).getTime() + duration * 60_000,
      ).toISOString();
      const check = await checkSlotAvailability(
        supabase,
        clinic.id,
        clinic.timezone,
        startIso,
        endIso,
        undefined,
        doctorId,
        guard.mode,
        guard.capacity,
        service.id,
        doctorId ? null : service.consultation_mode,
      );
      return { naive, ok: check.ok };
    }),
  );

  const slots = results.filter((r) => r.ok).map((r) => r.naive);
  return {
    ok: true,
    serviceId: service.id,
    durationMinutes: duration,
    slots,
  };
}

/**
 * Resolve the clinic's Emergency-Mode fallback service (Phase 15). Rapid
 * walk-in intake may not have a service chosen yet; the appointment still
 * needs a real `service_id` (NOT NULL) and a duration for the calendar, so it
 * is booked against one shared active "Walk-in consultation" service per
 * clinic. Creation happens inside the `ensure_walk_in_service` RPC because
 * `services` inserts are owner/admin-only under RLS while emergency bookings
 * are clinical-floor work every member may do — the RPC checks membership
 * itself and can ONLY ever create that one fixed placeholder shape.
 * Booking still goes through `createAppointmentService` like every other path.
 */
export async function ensureWalkInService(
  supabase: SupabaseClient<Database>,
  clinicId: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("ensure_walk_in_service", {
    p_clinic_id: clinicId,
  });
  if (error || !data) {
    console.error("[booking-service] ensure_walk_in_service failed", {
      clinicId,
      code: error?.code,
      message: error?.message,
    });
    return null;
  }
  return data;
}

export const WALK_IN_SERVICE_NAME = "Walk-in consultation";
