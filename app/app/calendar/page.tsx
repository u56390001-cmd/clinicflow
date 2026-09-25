import type { Metadata } from "next";

import { ClinicCalendar } from "@/components/calendar/clinic-calendar";
import { ClinicEmptyState } from "@/components/app/clinic-empty-state";
import {
  buildAppointmentViews,
  type RuleView,
} from "@/lib/appointments-view";
import { canManageClinical, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-secondary">
            Calendar
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Your day at a glance.
          </p>
        </div>
        <ClinicEmptyState />
      </div>
    );
  }

  const [
    { data: appointments },
    { data: patients },
    { data: services },
    { data: doctors },
    { data: rules },
    { data: blockedTimes },
  ] = await Promise.all([
    supabase
      .from("appointments")
      .select("*")
      .eq("clinic_id", access.clinic.id)
      .order("start_time", { ascending: true }),
    supabase
      .from("patients")
      .select("*")
      .eq("clinic_id", access.clinic.id),
    supabase
      .from("services")
      .select("*")
      .eq("clinic_id", access.clinic.id),
    supabase
      .from("doctors")
      .select("*")
      .eq("clinic_id", access.clinic.id)
      .order("created_at", { ascending: true }),
    // Clinic-wide defaults only — doctor rules are per-doctor overrides.
    supabase
      .from("availability_rules")
      .select("*")
      .eq("clinic_id", access.clinic.id)
      .is("doctor_id", null),
    supabase
      .from("blocked_times")
      .select("*")
      .eq("clinic_id", access.clinic.id),
  ]);

  const ruleViews: RuleView[] = (rules ?? []).map((rule) => ({
    dayOfWeek: rule.day_of_week,
    startTime: rule.start_time,
    endTime: rule.end_time,
    enabled: rule.enabled,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-secondary">
          Calendar
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {access.clinic.name} · /{access.clinic.slug} ·{" "}
          {access.clinic.timezone}
        </p>
      </div>

      <ClinicCalendar
        timezone={access.clinic.timezone}
        rules={ruleViews}
        blockedTimes={blockedTimes ?? []}
        doctors={(doctors ?? []).filter((doctor) => doctor.is_visible)}
        appointments={buildAppointmentViews(
          appointments ?? [],
          patients ?? [],
          services ?? [],
          doctors ?? [],
        )}
        canManage={canManageClinical(access.role)}
      />
    </div>
  );
}
