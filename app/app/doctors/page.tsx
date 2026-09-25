import type { Metadata } from "next";

import { ClinicEmptyState } from "@/components/app/clinic-empty-state";
import { DoctorsTab } from "@/components/doctors/doctors-tab";
import { canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Doctors" };

/**
 * Phase 21: the Doctors tab hosts both doctors and services behind a
 * segmented toggle. Working-day pills derive from real slot templates +
 * availability rules (same `enabled` semantics the booking check uses);
 * patient counts are distinct patients who have actually met each doctor.
 */
export default async function DoctorsPage() {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-secondary">
            Doctors
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            The people patients book with at your clinic, and the services they take.
          </p>
        </div>
        <ClinicEmptyState />
      </div>
    );
  }

  const clinicId = access.clinic.id;
  const [{ data: doctors }, { data: slotTemplates }, { data: vitalsConfigs }, {
    data: services,
  }, { data: serviceSlotTemplates }, { data: availabilityRules }, {
    data: appointments,
  }, { data: preConsultQuestions }] = await Promise.all([
    supabase
      .from("doctors")
      .select("*")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: true }),
    supabase
      .from("doctor_slot_templates")
      .select("*")
      .eq("clinic_id", clinicId),
    supabase
      .from("doctor_vitals_config")
      .select("*")
      .eq("clinic_id", clinicId),
    supabase
      .from("services")
      .select("*")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: true }),
    supabase
      .from("service_slot_templates")
      .select("*")
      .eq("clinic_id", clinicId),
    supabase
      .from("availability_rules")
      .select("doctor_id, day_of_week, enabled")
      .eq("clinic_id", clinicId),
    supabase
      .from("appointments")
      .select("doctor_id, patient_id, service_id, status, start_time")
      .eq("clinic_id", clinicId),
    supabase
      .from("pre_consultation_questions")
      .select("*")
      .eq("clinic_id", clinicId),
  ]);

  // Working days per doctor: any weekday with a slot template, or an enabled
  // availability rule for that day (the doctor's own row or the clinic-wide
  // default) — mirroring the booking check's own `enabled` semantics.
  const doctorWorkingDays: Record<string, boolean[]> = {};
  for (const doctor of doctors ?? []) {
    doctorWorkingDays[doctor.id] = Array.from({ length: 7 }, () => false);
  }
  for (const template of slotTemplates ?? []) {
    const days = doctorWorkingDays[template.doctor_id];
    if (days) days[template.day_of_week] = true;
  }
  const defaultRuleDays = new Set<number>();
  for (const rule of availabilityRules ?? []) {
    if (!rule.enabled) continue;
    if (rule.doctor_id === null) {
      defaultRuleDays.add(rule.day_of_week);
    } else if (doctorWorkingDays[rule.doctor_id]) {
      doctorWorkingDays[rule.doctor_id][rule.day_of_week] = true;
    }
  }
  for (const doctor of doctors ?? []) {
    const days = doctorWorkingDays[doctor.id];
    for (const day of defaultRuleDays) days[day] = true;
  }

  // Distinct patients each doctor has actually met.
  const patientCounts: Record<string, number> = {};
  const patientSets: Record<string, Set<string>> = {};
  for (const appointment of appointments ?? []) {
    if (!appointment.doctor_id || !appointment.patient_id) continue;
    if (!patientSets[appointment.doctor_id]) {
      patientSets[appointment.doctor_id] = new Set<string>();
    }
    patientSets[appointment.doctor_id].add(appointment.patient_id);
  }
  for (const [doctorId, patients] of Object.entries(patientSets)) {
    patientCounts[doctorId] = patients.size;
  }

  // Total consultations performed per doctor (every appointment, incl.
  // repeat patients).
  const doctorConsultationCounts: Record<string, number> = {};
  for (const appointment of appointments ?? []) {
    if (!appointment.doctor_id) continue;
    doctorConsultationCounts[appointment.doctor_id] =
      (doctorConsultationCounts[appointment.doctor_id] ?? 0) + 1;
  }

  // Appointments booked per service (real count from `appointments`).
  const serviceBookings: Record<string, number> = {};
  for (const appointment of appointments ?? []) {
    if (!appointment.service_id) continue;
    serviceBookings[appointment.service_id] =
      (serviceBookings[appointment.service_id] ?? 0) + 1;
  }

  // Completed appointments + this month's revenue per service (drives the
  // "Total Bookings / Completed / This Month's Revenue" detail stats).
  const serviceCompletedCounts: Record<string, number> = {};
  const serviceMonthlyRevenue: Record<string, number> = {};
  const now = new Date();
  for (const appointment of appointments ?? []) {
    if (!appointment.service_id) continue;
    if (appointment.status !== "completed") continue;
    serviceCompletedCounts[appointment.service_id] =
      (serviceCompletedCounts[appointment.service_id] ?? 0) + 1;
    const startedAt = new Date(appointment.start_time);
    if (
      startedAt.getMonth() === now.getMonth() &&
      startedAt.getFullYear() === now.getFullYear()
    ) {
      const price = services?.find(
        (service) => service.id === appointment.service_id,
      )?.price;
      if (typeof price === "number") {
        serviceMonthlyRevenue[appointment.service_id] =
          (serviceMonthlyRevenue[appointment.service_id] ?? 0) + price;
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-secondary">
          Doctors
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage doctor profiles, availability, and performance.
        </p>
      </div>

      <DoctorsTab
        initialDoctors={doctors ?? []}
        initialSlotTemplates={slotTemplates ?? []}
        initialVitalsConfigs={vitalsConfigs ?? []}
        initialServices={services ?? []}
        initialServiceSlotTemplates={serviceSlotTemplates ?? []}
        initialPreConsultQuestions={preConsultQuestions ?? []}
        doctorWorkingDays={doctorWorkingDays}
        patientCounts={patientCounts}
        doctorConsultationCounts={doctorConsultationCounts}
        serviceBookings={serviceBookings}
        serviceCompletedCounts={serviceCompletedCounts}
        serviceMonthlyRevenue={serviceMonthlyRevenue}
        clinicName={access.clinic.name}
        clinicAddress={access.clinic.address}
        clinicId={clinicId}
        canWrite={canWriteClinic(access.role)}
      />
    </div>
  );
}