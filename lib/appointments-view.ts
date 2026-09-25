import { WEEKDAY_ORDER } from "@/lib/constants";
import {
  clinicLocalDayOfWeek,
  timeToInputValue,
  utcIsoToClinicLocalInput,
} from "@/lib/time";
import { addDaysToNaive } from "@/lib/utils/datetime";
import type { Appointment, Doctor, Patient, Service } from "@/types/database";

/**
 * An appointment enriched with the patient and service rows it references.
 * Built server-side from separate queries (composite-FK embeds are awkward in
 * PostgREST) and shared by the appointments and calendar pages.
 */
export type AppointmentView = Appointment & {
  patientName: string;
  patientEmail: string | null;
  patientPhone: string | null;
  serviceName: string;
  serviceDurationMinutes: number;
  servicePrice: number;
  doctorName: string | null;
};

/** Minimal availability-rule shape the pages pass to calendar/forms. */
export type RuleView = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  enabled: boolean;
};

export function buildAppointmentViews(
  appointments: Appointment[],
  patients: Patient[],
  services: Service[],
  doctors: Doctor[] = [],
): AppointmentView[] {
  const patientsById = new Map(patients.map((p) => [p.id, p]));
  const servicesById = new Map(services.map((s) => [s.id, s]));
  const doctorsById = new Map(doctors.map((d) => [d.id, d]));

  return appointments.map((appointment) => {
    const patient = patientsById.get(appointment.patient_id);
    const service = servicesById.get(appointment.service_id);
    return {
      ...appointment,
      patientName: patient?.name ?? "Unknown patient",
      patientEmail: patient?.email ?? null,
      patientPhone: patient?.phone ?? null,
      serviceName: service?.name ?? "Unknown service",
      serviceDurationMinutes: service?.duration_minutes ?? 0,
      servicePrice: service?.price ?? 0,
      doctorName:
        (appointment.doctor_id
          ? doctorsById.get(appointment.doctor_id)?.name
          : null) ?? null,
    };
  });
}

/**
 * A sensible default booking start (`YYYY-MM-DDTHH:mm` clinic-local): the
 * earliest enabled working-hours slot from today onward that is not already in
 * the past. Used to prefill the create-appointment form (calendar "book" clicks
 * override it).
 */
export function buildDefaultStart(
  rules: RuleView[],
  timezone: string,
  nowIso: string = new Date().toISOString(),
): string {
  const enabled = rules
    .filter((rule) => rule.enabled)
    .sort(
      (a, b) =>
        a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime),
    );
  if (enabled.length === 0) return "";

  const nowLocal = utcIsoToClinicLocalInput(nowIso, timezone);
  const nowDay = clinicLocalDayOfWeek(nowLocal);

  for (let offset = 0; offset < 7; offset += 1) {
    const day = (nowDay + offset) % 7;
    const rule = enabled.find((candidate) => candidate.dayOfWeek === day);
    if (!rule) continue;
    const candidate = `${addDaysToNaive(nowLocal.slice(0, 10), offset)}T${timeToInputValue(rule.startTime)}`;
    // Fixed-width ISO-ish values compare lexicographically.
    if (candidate >= nowLocal) return candidate;
  }
  return "";
}

/**
 * Human summary of working hours, e.g. "Mon–Fri: 09:00–17:00 · Sat: 09:00–14:00".
 */
export function buildWorkingHoursSummary(rules: RuleView[]): string {
  const enabled = rules.filter((rule) => rule.enabled);
  if (enabled.length === 0) return "No working hours set yet.";

  const byTime = new Map<string, number[]>();
  for (const rule of enabled) {
    const key = `${timeToInputValue(rule.startTime)}–${timeToInputValue(rule.endTime)}`;
    const days = byTime.get(key) ?? [];
    days.push(rule.dayOfWeek);
    byTime.set(key, days);
  }

  const parts: string[] = [];
  for (const [times, days] of byTime) {
    days.sort((a, b) => a - b);
    const ranges: string[] = [];
    let start = days[0];
    let prev = days[0];
    for (let i = 1; i < days.length; i += 1) {
      if (days[i] === prev + 1) {
        prev = days[i];
        continue;
      }
      ranges.push(
        start === prev
          ? WEEKDAY_ORDER[start]
          : `${WEEKDAY_ORDER[start]}–${WEEKDAY_ORDER[prev]}`,
      );
      start = prev = days[i];
    }
    ranges.push(
      start === prev
        ? WEEKDAY_ORDER[start]
        : `${WEEKDAY_ORDER[start]}–${WEEKDAY_ORDER[prev]}`,
    );
    parts.push(`${ranges.join(", ")}: ${times}`);
  }
  return parts.join(" · ");
}
