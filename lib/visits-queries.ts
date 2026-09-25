/**
 * Server-side data fetching for the unified Appointment page.
 * Returns today's appointments enriched with visit data and patient info,
 * plus all appointments for table-view sub-tabs.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Appointment, Visit, Vitals } from "@/types/database";

export type QueueAppointment = Appointment & {
  patientName: string;
  patientPhone: string | null;
  patientAge: number | null;
  patientCity: string | null;
  patientCode: string | null;
  serviceName: string;
  /** The clinic's listed price for the booked service (known at booking time). */
  servicePrice: number;
  doctorName: string | null;
  visit: Visit | null;
  vitals: Vitals | null;
};

/**
 * Fetch today's appointments with visit data for the Queue page.
 * Joins appointments with patients, services, doctors, visits, and vitals.
 */
export async function fetchTodayQueue(
  supabase: SupabaseClient,
  clinicId: string,
): Promise<QueueAppointment[]> {
  const now = new Date();
  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).toISOString();
  const endOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  ).toISOString();

  const [
    { data: appointments },
    { data: patients },
    { data: services },
    { data: doctors },
    { data: visits },
    { data: vitalsList },
  ] = await Promise.all([
    supabase
      .from("appointments")
      .select("*")
      .eq("clinic_id", clinicId)
      .gte("start_time", startOfDay)
      .lt("start_time", endOfDay)
      .order("start_time", { ascending: true }),
    supabase
      .from("patients")
      .select("*")
      .eq("clinic_id", clinicId),
    supabase
      .from("services")
      .select("*")
      .eq("clinic_id", clinicId),
    supabase
      .from("doctors")
      .select("*")
      .eq("clinic_id", clinicId),
    supabase
      .from("visits")
      .select("*")
      .eq("clinic_id", clinicId)
      .gte("checked_in_at", startOfDay)
      .lt("checked_in_at", endOfDay),
    supabase
      .from("vitals")
      .select("*")
      .eq("clinic_id", clinicId),
  ]);

  const patientsById = new Map(patients?.map((p) => [p.id, p]) ?? []);
  const servicesById = new Map(services?.map((s) => [s.id, s]) ?? []);
  const doctorsById = new Map(doctors?.map((d) => [d.id, d]) ?? []);
  const visitsByAppt = new Map(visits?.map((v) => [v.appointment_id, v]) ?? []);
  const vitalsByVisit = new Map(vitalsList?.map((v) => [v.visit_id, v]) ?? []);

  return (appointments ?? []).map((appt) => {
    const patient = patientsById.get(appt.patient_id);
    const service = servicesById.get(appt.service_id);
    const visit = visitsByAppt.get(appt.id) ?? null;
    const vitals = visit ? (vitalsByVisit.get(visit.id) ?? null) : null;

    return {
      ...appt,
      patientName: patient?.name ?? "Unknown patient",
      patientPhone: patient?.phone ?? null,
      patientAge: patient?.age ?? null,
      patientCity: patient?.city ?? null,
      patientCode: patient?.patient_code ?? null,
      serviceName: service?.name ?? "Unknown service",
      servicePrice: service?.price ?? 0,
      doctorName: appt.doctor_id
        ? (doctorsById.get(appt.doctor_id)?.name ?? null)
        : null,
      visit,
      vitals,
    };
  });
}

/**
 * Fetch the current waiting queue: all visits in 'waiting' or 'in_consultation'
 * status for today, ordered by queue_position.
 */
export async function fetchWaitingQueue(
  supabase: SupabaseClient,
  clinicId: string,
): Promise<
  (Visit & {
    patientName: string;
    patientPhone: string | null;
    doctorName: string | null;
    tokenNumber: number;
    vitals: Vitals | null;
  })[]
> {
  const now = new Date();
  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).toISOString();
  const endOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  ).toISOString();

  const [
    { data: queueVisits },
    { data: patients },
    { data: doctors },
    { data: vitalsList },
  ] = await Promise.all([
    supabase
      .from("visits")
      .select("*")
      .eq("clinic_id", clinicId)
      .in("status", ["waiting", "in_consultation"])
      .gte("checked_in_at", startOfDay)
      .lt("checked_in_at", endOfDay)
      .order("queue_position", { ascending: true }),
    supabase
      .from("patients")
      .select("*")
      .eq("clinic_id", clinicId),
    supabase
      .from("doctors")
      .select("*")
      .eq("clinic_id", clinicId),
    supabase
      .from("vitals")
      .select("*")
      .eq("clinic_id", clinicId),
  ]);

  const patientsById = new Map(patients?.map((p) => [p.id, p]) ?? []);
  const doctorsById = new Map(doctors?.map((d) => [d.id, d]) ?? []);
  const vitalsByVisit = new Map(vitalsList?.map((v) => [v.visit_id, v]) ?? []);

  return (queueVisits ?? []).map((visit) => {
    const patient = patientsById.get(visit.patient_id);
    return {
      ...visit,
      patientName: patient?.name ?? "Unknown patient",
      patientPhone: patient?.phone ?? null,
      doctorName: visit.doctor_id
        ? (doctorsById.get(visit.doctor_id)?.name ?? null)
        : null,
      tokenNumber: visit.token_number,
      vitals: vitalsByVisit.get(visit.id) ?? null,
    };
  });
}

/** Enriched appointment for the table-view sub-tabs. */
export type AppointmentRow = Appointment & {
  patientName: string;
  patientPhone: string | null;
  serviceName: string;
  /** The clinic's listed price for the booked service (known at booking time). */
  servicePrice: number;
  doctorName: string | null;
  visit: Visit | null;
};

/**
 * Fetch all appointments for a clinic (no date filter) with patient, service,
 * doctor, and visit data. Used by the table-view sub-tabs (Upcoming, Completed,
 * All, Cancelled) on the unified Appointment page.
 */
export async function fetchAllAppointments(
  supabase: SupabaseClient,
  clinicId: string,
): Promise<AppointmentRow[]> {
  const [
    { data: appointments },
    { data: patients },
    { data: services },
    { data: doctors },
    { data: visits },
  ] = await Promise.all([
    supabase
      .from("appointments")
      .select("*")
      .eq("clinic_id", clinicId)
      .order("start_time", { ascending: false }),
    supabase
      .from("patients")
      .select("*")
      .eq("clinic_id", clinicId),
    supabase
      .from("services")
      .select("*")
      .eq("clinic_id", clinicId),
    supabase
      .from("doctors")
      .select("*")
      .eq("clinic_id", clinicId),
    supabase
      .from("visits")
      .select("*")
      .eq("clinic_id", clinicId),
  ]);

  const patientsById = new Map(patients?.map((p) => [p.id, p]) ?? []);
  const servicesById = new Map(services?.map((s) => [s.id, s]) ?? []);
  const doctorsById = new Map(doctors?.map((d) => [d.id, d]) ?? []);
  const visitsByAppt = new Map(visits?.map((v) => [v.appointment_id, v]) ?? []);

  return (appointments ?? []).map((appt) => {
    const patient = patientsById.get(appt.patient_id);
    const service = servicesById.get(appt.service_id);
    const visit = visitsByAppt.get(appt.id) ?? null;

    return {
      ...appt,
      patientName: patient?.name ?? "Unknown patient",
      patientPhone: patient?.phone ?? null,
      serviceName: service?.name ?? "Unknown service",
      servicePrice: service?.price ?? 0,
      doctorName: appt.doctor_id
        ? (doctorsById.get(appt.doctor_id)?.name ?? null)
        : null,
      visit,
    };
  });
}
