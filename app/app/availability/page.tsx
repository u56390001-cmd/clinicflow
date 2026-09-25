import type { Metadata } from "next";

import { AvailabilityManager } from "@/components/availability/availability-manager";
import type { DayRuleInput } from "@/components/availability/working-hours-form";
import { ClinicEmptyState } from "@/components/app/clinic-empty-state";
import { canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import { WEEKDAY_ORDER } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { timeToInputValue } from "@/lib/time";

export const metadata: Metadata = { title: "Availability" };

export default async function AvailabilityPage() {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-secondary">
            Availability
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            When patients can book appointments.
          </p>
        </div>
        <ClinicEmptyState />
      </div>
    );
  }

  const [{ data: doctors }, { data: rules }, { data: blockedTimes }] =
    await Promise.all([
      supabase.from("doctors").select("*").eq("clinic_id", access.clinic.id).order("created_at", { ascending: true }),
      supabase
        .from("availability_rules")
        .select("*")
        .eq("clinic_id", access.clinic.id),
      supabase
        .from("blocked_times")
        .select("*")
        .eq("clinic_id", access.clinic.id)
        .order("start_time", { ascending: true }),
    ]);

  // Rules are grouped per scope so each scope edits its own week. Doctor rows
  // override clinic defaults for that doctor's appointments only.
  function toDayRuleInputs(scopeRules: typeof rules): DayRuleInput[] {
    const rulesByDay = new Map(
      (scopeRules ?? []).map((rule) => [rule.day_of_week, rule]),
    );
    return WEEKDAY_ORDER.map((_, dayOfWeek) => {
      const rule = rulesByDay.get(dayOfWeek);
      return {
        dayOfWeek,
        enabled: rule?.enabled ?? false,
        startTime: rule ? timeToInputValue(rule.start_time) : "09:00",
        endTime: rule ? timeToInputValue(rule.end_time) : "17:00",
      };
    });
  }

  const defaultRules = toDayRuleInputs(
    (rules ?? []).filter((rule) => rule.doctor_id === null),
  );
  const rulesByDoctor: Record<string, DayRuleInput[]> = {};
  for (const doctor of doctors ?? []) {
    rulesByDoctor[doctor.id] = toDayRuleInputs(
      (rules ?? []).filter((rule) => rule.doctor_id === doctor.id),
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-secondary">
          Availability
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {access.clinic.name} · /{access.clinic.slug} · {access.clinic.timezone}
        </p>
      </div>

      <AvailabilityManager
        doctors={doctors ?? []}
        defaultRules={defaultRules}
        rulesByDoctor={rulesByDoctor}
        blockedTimes={blockedTimes ?? []}
        timezone={access.clinic.timezone}
        canWrite={canWriteClinic(access.role)}
      />
    </div>
  );
}
