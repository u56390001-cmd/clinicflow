"use client";

import { useState } from "react";

import { BlockedTimesPanel } from "@/components/availability/blocked-times-panel";
import {
  WorkingHoursForm,
  type DayRuleInput,
} from "@/components/availability/working-hours-form";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import type { BlockedTime, Doctor } from "@/types/database";

export type AvailabilityScope = "" | (string & {});

/**
 * Weekly hours and blocked times. When the clinic has doctors, working hours
 * are edited per scope: clinic-wide defaults, or one doctor's own hours
 * (which override the defaults for that doctor's appointments).
 */
export function AvailabilityManager({
  doctors,
  defaultRules,
  rulesByDoctor,
  blockedTimes,
  timezone,
  canWrite,
}: {
  doctors: Doctor[];
  defaultRules: DayRuleInput[];
  rulesByDoctor: Record<string, DayRuleInput[]>;
  blockedTimes: BlockedTime[];
  timezone: string;
  canWrite: boolean;
}) {
  const [scope, setScope] = useState<AvailabilityScope>("");

  return (
    <div className="space-y-6">
      {doctors.length > 0 && canWrite && (
        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor="availability-scope">Edit hours for</Label>
          <NativeSelect
            id="availability-scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as AvailabilityScope)}
            className="w-auto"
          >
            <option value="">Whole clinic</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <WorkingHoursForm
        key={scope || "clinic"}
        initialRules={
          scope ? rulesByDoctor[scope] ?? defaultRules : defaultRules
        }
        doctorId={scope || null}
        doctorName={doctors.find((d) => d.id === scope)?.name ?? null}
        canWrite={canWrite}
      />
      <BlockedTimesPanel
        blockedTimes={blockedTimes}
        timezone={timezone}
        doctors={doctors}
        canWrite={canWrite}
      />
    </div>
  );
}
