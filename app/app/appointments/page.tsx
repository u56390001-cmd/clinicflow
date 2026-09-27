import type { Metadata } from "next";

import { ClinicEmptyState } from "@/components/app/clinic-empty-state";
import { AppointmentManager } from "@/components/appointments/appointment-manager";
import {
  canManageClinical,
  canMergePatients,
  getCurrentClinic,
} from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import {
  fetchTodayQueue,
  fetchWaitingQueue,
  fetchAllAppointments,
} from "@/lib/visits-queries";
import { fetchVitalsConfigs } from "@/lib/vitals-config";

export const metadata: Metadata = { title: "Appointment" };

export default async function AppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-secondary">
            Appointment
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage patient appointments and queue.
          </p>
        </div>
        <ClinicEmptyState />
      </div>
    );
  }

  const NEW_INTENT_REGEX = /^(consultation|service)$/;
  const createIntent =
    typeof params.new === "string" && NEW_INTENT_REGEX.test(params.new)
      ? (params.new as "consultation" | "service")
      : null;

  const [todayAppointments, queue, allAppointments, patients, services, doctors] =
    await Promise.all([
      fetchTodayQueue(supabase, access.clinic.id),
      fetchWaitingQueue(supabase, access.clinic.id),
      fetchAllAppointments(supabase, access.clinic.id),
      supabase
        .from("patients")
        .select("*")
        .eq("clinic_id", access.clinic.id),
      supabase
        .from("services")
        .select("*")
        .eq("clinic_id", access.clinic.id)
        .eq("status", "active"),
      supabase
        .from("doctors")
        .select("*")
        .eq("clinic_id", access.clinic.id)
        .order("created_at", { ascending: true }),
    ]);

  // Vitals configs are preloaded so the Add Vitals popup paints the doctor's
  // exact field set on the first frame (no skeleton, no grid re-flow).
  const vitalsConfigs = await fetchVitalsConfigs(
    supabase,
    access.clinic.id,
    (doctors.data ?? []).map((doctor) => doctor.id),
  );

  return (
    <AppointmentManager
      todayAppointments={todayAppointments}
      queue={queue}
      allAppointments={allAppointments}
      patients={patients.data ?? []}
      services={(services.data ?? []).filter((s) => s.status === "active")}
      doctors={doctors.data ?? []}
      timezone={access.clinic.timezone}
      canManage={canManageClinical(access.role)}
      canMerge={canMergePatients(access.role)}
      initialCreateIntent={createIntent}
      vitalsConfigs={vitalsConfigs}
      // Queue Management (migration 0043). Read here rather than in the client
      // component so the first paint already matches the clinic's preference —
      // deciding it after hydration would flash the live queue at a clinic that
      // turned it off.
      showLiveQueue={access.clinic.appointments_view_mode !== "list"}
    />
  );
}
