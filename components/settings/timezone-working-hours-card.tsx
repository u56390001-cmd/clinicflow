"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Globe,
} from "lucide-react";

import { SubmitButton } from "@/components/auth/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { saveTimezoneWorkingHoursAction } from "@/lib/actions/availability";
import { COMMON_TIMEZONES, formatTimezoneOption } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/types";

/** 0 = Monday, matching `availability_rules.day_of_week` (migration 0004). */
const WEEKDAY_SHORT = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;

/**
 * Split a 24-hour `HH:MM` string into the three pieces the reference control
 * renders separately: two digit boxes and an AM/PM toggle.
 *
 * A malformed stored value falls back to the card's 09:00 default rather than
 * rendering "NaN" in an input — the old value is still on the server and the
 * user can correct it on save.
 */
function split12(value: string): {
  hh: string;
  mm: string;
  meridiem: "AM" | "PM";
} {
  const [rawH, rawM] = value.split(":");
  const h = Number(rawH);
  const m = Number(rawM);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return { hh: "09", mm: "00", meridiem: "AM" };
  }
  return {
    hh: String(h % 12 === 0 ? 12 : h % 12).padStart(2, "0"),
    mm: String(m).padStart(2, "0"),
    meridiem: h < 12 ? "AM" : "PM",
  };
}

/**
 * Rebuild `HH:MM` from the three inputs. Returns null for a partial or
 * out-of-range entry so the caller can hold the last good value instead of
 * committing `09:9` to the database.
 */
function join24(hh: string, mm: string, meridiem: "AM" | "PM"): string | null {
  const h = Number(hh);
  const m = Number(mm);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 1 || h > 12 || m < 0 || m > 59) return null;
  const hour24 =
    meridiem === "AM" ? (h === 12 ? 0 : h) : h === 12 ? 12 : h + 12;
  return `${String(hour24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Keep a digit box to two numeric characters as it is typed. */
function digits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 2);
}

/**
 * One half of the "09:00 AM to 06:00 PM" pair: a clock icon, two digit boxes,
 * and an AM/PM control. The AM/PM control is a `<select>` on desktop and a
 * two-button segmented toggle on mobile, matching the supplied reference — the
 * toggle is what a phone user can actually hit without opening a picker.
 */
function TimeField({
  label,
  value,
  onChange,
  disabled,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  invalid?: boolean;
}) {
  const { hh, mm, meridiem } = split12(value);

  function commit(nextHh: string, nextMm: string, nextMeridiem: "AM" | "PM") {
    const joined = join24(nextHh, nextMm, nextMeridiem);
    if (joined) onChange(joined);
  }

  return (
    <div className="flex w-fit items-center gap-2 md:w-auto">
      <div className="relative flex flex-shrink-0 md:flex-initial">
        <Clock
          className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <div
          className={cn(
            "flex items-center gap-1 rounded-control border border-text-muted/40 bg-surface py-2.5 pl-10 pr-3",
            "focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30",
            invalid && "border-status-destructive",
            disabled && "opacity-50",
          )}
        >
          <input
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={hh}
            disabled={disabled}
            onChange={(e) => commit(digits(e.target.value), mm, meridiem)}
            placeholder="09"
            aria-label={`${label} hour`}
            className="w-7 bg-transparent text-center text-sm text-text-primary outline-none"
          />
          <span aria-hidden="true" className="text-sm text-text-secondary">
            :
          </span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={mm}
            disabled={disabled}
            onChange={(e) => commit(hh, digits(e.target.value), meridiem)}
            placeholder="00"
            aria-label={`${label} minute`}
            className="w-7 bg-transparent text-center text-sm text-text-primary outline-none"
          />
        </div>
      </div>

      <div className="relative flex-shrink-0">
        <select
          value={meridiem}
          disabled={disabled}
          aria-label={`${label} AM or PM`}
          onChange={(e) =>
            commit(hh, mm, e.target.value === "PM" ? "PM" : "AM")
          }
          className="hidden rounded-control border border-text-muted/40 bg-surface py-2.5 pl-3 pr-8 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 md:block"
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2 top-1/2 hidden size-4 -translate-y-1/2 text-text-muted md:block"
          aria-hidden="true"
        />
        <div className="flex overflow-hidden rounded-control border border-text-muted/40 md:hidden">
          {(["AM", "PM"] as const).map((option) => (
            <button
              key={option}
              type="button"
              disabled={disabled}
              aria-pressed={meridiem === option}
              onClick={() => commit(hh, mm, option)}
              className={cn(
                "px-2.5 py-2.5 text-sm font-medium transition-colors",
                meridiem === option
                  ? "bg-primary text-white"
                  : "bg-surface text-text-secondary",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * "Timezone & Working Hours" card for Organization settings.
 *
 * Layout, icon treatment, and the day-toggle row come from the supplied
 * reference markup, remapped onto this project's tokens: the reference's
 * `rgb(238,240,251)` chip is `bg-primary/10`, its `rgb(78,93,181)` glyph is
 * `text-primary`, and every grey is a text-muted token rather than a raw hex.
 *
 * One range covers every selected day. `availability_rules` stores one row per
 * weekday, so a shared range is written across the enabled rows — the shape
 * the reference design implies. When a clinic already had *different* hours per
 * day the card says so before overwriting, because pressing save here flattens
 * them to a single range.
 */
export function TimezoneWorkingHoursCard({
  timezone,
  initialDays,
  initialStartTime,
  initialEndTime,
  hadVariedHours,
  canWrite,
}: {
  timezone: string;
  initialDays: number[];
  initialStartTime: string;
  initialEndTime: string;
  hadVariedHours: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    saveTimezoneWorkingHoursAction,
    null,
  );
  const [zone, setZone] = useState(
    COMMON_TIMEZONES.includes(timezone) ? timezone : "UTC",
  );
  const [days, setDays] = useState<number[]>(initialDays);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);

  const submitted = state !== null;
  const errors =
    submitted && state && !state.ok ? (state.fieldErrors ?? {}) : {};

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  function toggleDay(day: number) {
    setDays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center gap-3 space-y-0 border-b border-text-muted/30">
        <span className="flex size-9 flex-shrink-0 items-center justify-center rounded-control bg-primary/10">
          <Clock className="size-[18px] text-primary" aria-hidden="true" />
        </span>
        <div>
          <CardTitle>Timezone &amp; working hours</CardTitle>
          <CardDescription className="mt-0.5">
            When the clinic operates.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {submitted && !state.ok && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        {submitted && state.ok && (
          <Alert variant="success">
            <CheckCircle2 aria-hidden="true" />
            <AlertDescription>
              Timezone and working hours saved.
            </AlertDescription>
          </Alert>
        )}

        {hadVariedHours && (
          <Alert>
            <AlertCircle aria-hidden="true" />
            <AlertDescription>
              Your days currently have different opening hours. Saving this card
              applies the single range below to every selected day.
            </AlertDescription>
          </Alert>
        )}

        <form action={formAction} className="space-y-5">
          <input
            type="hidden"
            name="settings"
            value={JSON.stringify({
              timezone: zone,
              days,
              startTime,
              endTime,
            })}
          />

          <div>
            <Label htmlFor="timezone-working-hours" className="mb-2 block">
              Timezone
              <span
                aria-hidden="true"
                className="ml-0.5 text-status-destructive"
              >
                *
              </span>
            </Label>
            <div className="relative">
              <Globe
                className="pointer-events-none absolute left-3 top-1/2 z-10 size-[18px] -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <NativeSelect
                id="timezone-working-hours"
                value={zone}
                disabled={!canWrite}
                onChange={(e) => setZone(e.target.value)}
                aria-invalid={!!errors.timezone}
                aria-describedby="timezone-working-hours-hint"
                className="py-2.5 pl-10 pr-10"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {formatTimezoneOption(tz)}
                  </option>
                ))}
              </NativeSelect>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
            </div>
            <p
              id="timezone-working-hours-hint"
              className="mt-1.5 text-xs text-text-muted"
            >
              All appointments and reminders will use this timezone.
            </p>
          </div>

          <div>
            <Label className="mb-3 block">Select working days</Label>
            <div
              role="group"
              aria-label="Select working days"
              className="grid grid-cols-4 gap-2 md:flex md:flex-wrap"
            >
              {WEEKDAY_SHORT.map((label, day) => {
                const active = days.includes(day);
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={!canWrite}
                    aria-pressed={active}
                    onClick={() => toggleDay(day)}
                    className={cn(
                      "flex-shrink-0 rounded-control px-3.5 py-2.5 text-sm font-semibold transition-colors sm:px-5",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      active
                        ? "bg-primary text-white"
                        : "border border-text-muted/40 bg-surface text-text-secondary hover:bg-skeleton",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {errors.days && (
              <p
                role="alert"
                className="mt-2 flex items-start gap-1 text-xs font-medium text-status-destructive"
              >
                <AlertCircle
                  aria-hidden="true"
                  className="mt-px size-3.5 shrink-0"
                />
                <span>{errors.days}</span>
              </p>
            )}
          </div>

          <div>
            <Label className="mb-2 block">
              Working hours
              <span
                aria-hidden="true"
                className="ml-0.5 text-status-destructive"
              >
                *
              </span>
            </Label>
            <div className="flex flex-col items-center gap-2 md:flex-row md:flex-wrap">
              <TimeField
                label="Opening"
                value={startTime}
                onChange={setStartTime}
                disabled={!canWrite}
                invalid={!!errors.startTime}
              />
              <span className="px-1 font-medium text-text-muted">to</span>
              <TimeField
                label="Closing"
                value={endTime}
                onChange={setEndTime}
                disabled={!canWrite}
                invalid={!!errors.endTime}
              />
            </div>
            {errors.endTime && (
              <p
                role="alert"
                className="mt-2 flex items-start gap-1 text-xs font-medium text-status-destructive"
              >
                <AlertCircle
                  aria-hidden="true"
                  className="mt-px size-3.5 shrink-0"
                />
                <span>{errors.endTime}</span>
              </p>
            )}
            <p className="mt-1.5 text-xs text-text-muted">
              The same opening hours apply to every selected day.
            </p>
          </div>

          {canWrite && (
            <SubmitButton loadingText="Saving…">
              Save timezone &amp; hours
            </SubmitButton>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
