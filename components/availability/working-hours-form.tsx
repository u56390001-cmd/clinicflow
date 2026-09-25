"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";

import { SubmitButton } from "@/components/auth/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveAvailabilityRulesAction } from "@/lib/actions/availability";
import { WEEKDAY_ORDER } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/types";

export type DayRuleInput = {
  dayOfWeek: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
};

const DEFAULT_RULES: DayRuleInput[] = Array.from({ length: 7 }, (_, i) => ({
  dayOfWeek: i,
  enabled: false,
  startTime: "09:00",
  endTime: "17:00",
}));

export function WorkingHoursForm({
  initialRules,
  doctorId,
  doctorName,
  canWrite,
}: {
  initialRules: DayRuleInput[];
  /** Null edits the clinic-wide defaults; a doctor id edits that doctor's hours. */
  doctorId?: string | null;
  doctorName?: string | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    saveAvailabilityRulesAction,
    null,
  );
  const [rules, setRules] = useState<DayRuleInput[]>(
    initialRules.length === 7 ? initialRules : DEFAULT_RULES,
  );

  const submitted = state !== null;

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  function updateRule(
    dayOfWeek: number,
    patch: Partial<DayRuleInput>,
  ): void {
    setRules((current) =>
      current.map((rule) =>
        rule.dayOfWeek === dayOfWeek ? { ...rule, ...patch } : rule,
      ),
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {doctorName ? `Working hours — ${doctorName}` : "Working hours"}
        </CardTitle>
        <CardDescription>
          {doctorName
            ? `${doctorName}'s own weekly hours. Days left closed fall back to the clinic's default hours.`
            : "Weekly opening hours shown to patients. Times are in the clinic's timezone."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {submitted && !state.ok && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="doctorId" value={doctorId ?? ""} />
          <input
            type="hidden"
            name="rules"
            value={JSON.stringify({
              rules: rules.map(({ dayOfWeek, enabled, startTime, endTime }) => ({
                dayOfWeek,
                enabled,
                startTime,
                endTime,
              })),
            })}
          />

          <ul className="space-y-2">
            {rules.map((rule) => (
              <li
                key={rule.dayOfWeek}
                className={cn(
                  "grid grid-cols-[1fr_auto] items-center gap-3 rounded-control border border-text-muted/30 px-3 py-2 transition-opacity sm:grid-cols-[1fr_auto_auto_auto]",
                  !rule.enabled && "opacity-60",
                )}
              >
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) =>
                      updateRule(rule.dayOfWeek, {
                        enabled: e.target.checked,
                      })
                    }
                    disabled={!canWrite}
                    className="h-4 w-4 rounded border-text-muted text-primary focus:ring-primary/30"
                  />
                  <span className="text-sm font-medium text-text-primary">
                    {WEEKDAY_ORDER[rule.dayOfWeek]}
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    aria-label={`${WEEKDAY_ORDER[rule.dayOfWeek]} opening time`}
                    value={rule.startTime}
                    onChange={(e) =>
                      updateRule(rule.dayOfWeek, {
                        startTime: e.target.value,
                      })
                    }
                    disabled={!canWrite || !rule.enabled}
                    className="w-[7.5rem]"
                  />
                  <span className="text-sm text-text-secondary">–</span>
                  <Input
                    type="time"
                    aria-label={`${WEEKDAY_ORDER[rule.dayOfWeek]} closing time`}
                    value={rule.endTime}
                    onChange={(e) =>
                      updateRule(rule.dayOfWeek, {
                        endTime: e.target.value,
                      })
                    }
                    disabled={!canWrite || !rule.enabled}
                    className="w-[7.5rem]"
                  />
                </div>

                <span
                  className={cn(
                    "text-sm",
                    rule.enabled ? "text-text-secondary" : "text-text-muted",
                  )}
                >
                  {rule.enabled ? "Open" : "Closed"}
                </span>
              </li>
            ))}
          </ul>

          {canWrite && (
            <SubmitButton loadingText="Saving…">Save working hours</SubmitButton>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
