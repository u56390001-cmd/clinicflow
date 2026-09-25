"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/select";
import { APP_ROUTES, WEEKDAY_ORDER } from "@/lib/constants";
import {
  clinicLocalDayOfWeek,
  minutesToTimeInputValue,
  timeOfDayToMinutes,
  utcIsoToClinicLocalInput,
} from "@/lib/time";
import {
  addDaysToNaive,
  formatHourLabel,
  formatViewDate,
  isValidNaiveDate,
} from "@/lib/utils/datetime";
import type { AppointmentView, RuleView } from "@/lib/appointments-view";
import type { BlockedTime, Doctor } from "@/types/database";

const MINUTES_PER_DAY = 24 * 60;
const PX_PER_MINUTE = 1.2;

const STATUS_STYLES: Record<
  AppointmentView["status"],
  { container: string; time: string }
> = {
  pending: {
    container: "border-amber-400 bg-amber-50 hover:bg-amber-100",
    time: "text-amber-900",
  },
  confirmed: {
    container: "border-emerald-500 bg-emerald-50 hover:bg-emerald-100",
    time: "text-emerald-900",
  },
  completed: {
    container: "border-slate-400 bg-slate-100 hover:bg-slate-200",
    time: "text-slate-700",
  },
  cancelled: {
    container: "border-red-400 bg-red-50 opacity-70 hover:bg-red-100",
    time: "text-red-900",
  },
  no_show: {
    container: "border-orange-400 bg-orange-50 hover:bg-orange-100",
    time: "text-orange-900",
  },
};

export function ClinicCalendar({
  timezone,
  rules,
  blockedTimes,
  doctors,
  appointments,
  canManage,
}: {
  timezone: string;
  rules: RuleView[];
  blockedTimes: BlockedTime[];
  /** Bookable doctors; a filter dropdown renders only when there are 2+. */
  doctors: Pick<Doctor, "id" | "name">[];
  appointments: AppointmentView[];
  canManage: boolean;
}) {
  const router = useRouter();
  const todayNaive = utcIsoToClinicLocalInput(
    new Date().toISOString(),
    timezone,
  ).slice(0, 10);
  const [viewDate, setViewDate] = useState(todayNaive);
  const [doctorFilter, setDoctorFilter] = useState("");
  const safeViewDate = isValidNaiveDate(viewDate) ? viewDate : todayNaive;

  const dayOfWeek = clinicLocalDayOfWeek(`${safeViewDate}T12:00`);
  const rule = rules.find(
    (candidate) => candidate.enabled && candidate.dayOfWeek === dayOfWeek,
  );

  const dayAppointments = useMemo(
    () =>
      appointments.filter(
        (appointment) =>
          utcIsoToClinicLocalInput(appointment.start_time, timezone).slice(0, 10) ===
            safeViewDate &&
          (doctorFilter === "" || appointment.doctor_id === doctorFilter),
      ),
    [appointments, safeViewDate, timezone, doctorFilter],
  );

  const ruleStart = rule ? timeOfDayToMinutes(rule.startTime) : null;
  const ruleEnd = rule ? timeOfDayToMinutes(rule.endTime) : null;
  const dayBounds = dayAppointments.reduce(
    (bounds, appointment) => {
      bounds.start = Math.min(
        bounds.start,
        toMinutesOfDay(appointment.start_time, timezone),
      );
      bounds.end = Math.max(
        bounds.end,
        toMinutesOfDay(appointment.end_time, timezone),
      );
      return bounds;
    },
    { start: MINUTES_PER_DAY, end: 0 },
  );

  const viewStart = ruleStart ?? (dayAppointments.length > 0 ? dayBounds.start : 9 * 60);
  const viewEnd = ruleEnd ?? (dayAppointments.length > 0 ? dayBounds.end : 17 * 60);
  const gridHeight = (viewEnd - viewStart) * PX_PER_MINUTE;

  const blockedSegments = useMemo(
    () =>
      blockedTimes
        .map((blocked) => {
          const start = toMinutesOfDay(blocked.start_time, timezone);
          const end = toMinutesOfDay(blocked.end_time, timezone);
          const startMin = Math.max(start, viewStart);
          const endMin = Math.min(end, viewEnd);
          return { ...blocked, startMin, endMin };
        })
        .filter((segment) => segment.endMin > segment.startMin),
    [blockedTimes, viewStart, viewEnd, timezone],
  );

  const tickMinutes: number[] = [];
  for (let minute = Math.floor(viewStart / 60) * 60; minute <= viewEnd; minute += 30) {
    tickMinutes.push(minute);
  }
  const hourLabels: number[] = [];
  for (let minute = Math.floor(viewStart / 60) * 60; minute <= viewEnd; minute += 60) {
    hourLabels.push(minute);
  }

  function handleGridClick(event: React.PointerEvent<HTMLDivElement>) {
    if (!canManage || !rule) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX - rect.left < 56) return;
    router.push(APP_ROUTES.app.appointments);
  }

  function shiftDate(days: number) {
    setViewDate(addDaysToNaive(safeViewDate, days));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-label="Previous day"
            onClick={() => shiftDate(-1)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="Next day"
            onClick={() => shiftDate(1)}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setViewDate(todayNaive)}>
            Today
          </Button>
          {doctors.length > 1 && (
            <NativeSelect
              aria-label="Filter by doctor"
              value={doctorFilter}
              onChange={(event) => setDoctorFilter(event.target.value)}
              className="w-auto"
            >
              <option value="">All doctors</option>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold text-secondary">
            {formatViewDate(safeViewDate)}
          </p>
          <p className="text-sm text-text-secondary">
            {rule
              ? `${WEEKDAY_ORDER[dayOfWeek]} · ${rule.startTime.slice(0, 5)}–${rule.endTime.slice(0, 5)}`
              : `${WEEKDAY_ORDER[dayOfWeek]} · Closed`}
          </p>
        </div>
      </div>

      <Card className="p-4">
        <div
          className="relative w-full touch-none"
          style={{ height: gridHeight }}
          onPointerDown={handleGridClick}
        >
          {hourLabels.map((minute) => (
            <div
              key={minute}
              className="absolute left-0 z-10 w-12 -translate-y-1/2 pr-2 text-right text-xs text-text-muted"
              style={{ top: (minute - viewStart) * PX_PER_MINUTE }}
            >
              {formatHourLabel(minute)}
            </div>
          ))}

          <div className="absolute bottom-0 left-14 right-0 top-0 border-l border-text-muted/20">
            {tickMinutes.map((minute) => {
              const isHour = minute % 60 === 0;
              return (
                <div
                  key={minute}
                  className="pointer-events-none absolute inset-x-0"
                  style={{ top: (minute - viewStart) * PX_PER_MINUTE }}
                >
                  <div
                    className={
                      isHour
                        ? "border-t border-text-muted/30"
                        : "border-t border-dashed border-text-muted/20"
                    }
                  />
                </div>
              );
            })}

            {blockedSegments.map((segment) => (
              <div
                key={segment.id}
                title={segment.reason ?? "Blocked"}
                className="pointer-events-none absolute inset-x-1 flex items-center overflow-hidden rounded-md bg-status-destructive/15 px-2"
                style={{
                  top: (segment.startMin - viewStart) * PX_PER_MINUTE,
                  height: Math.max(
                    (segment.endMin - segment.startMin) * PX_PER_MINUTE,
                    20,
                  ),
                }}
              >
                <span className="truncate text-xs font-medium text-status-destructive">
                  {segment.reason ?? "Blocked"}
                </span>
              </div>
            ))}

            {!rule && (
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-md border border-text-muted/30 bg-app/80 py-3 text-center">
                <p className="text-sm font-medium text-text-primary">
                  No working hours on {WEEKDAY_ORDER[dayOfWeek]}
                </p>
                <p className="text-xs text-text-secondary">
                  Set your availability to book on this day.
                </p>
              </div>
            )}

            {dayAppointments.map((appointment) => {
              const start = toMinutesOfDay(appointment.start_time, timezone);
              const end = toMinutesOfDay(appointment.end_time, timezone);
              const top = Math.max(start, viewStart) - viewStart;
              const height = Math.max(
                Math.min(end, viewEnd) - Math.max(start, viewStart),
                1,
              );
              const style = STATUS_STYLES[appointment.status];
              return (
                <button
                  key={appointment.id}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    router.push(APP_ROUTES.app.appointments);
                  }}
                  className={`absolute inset-x-1 z-20 overflow-hidden rounded-md border-l-4 px-2 py-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${style.container}`}
                  style={{
                    top: top * PX_PER_MINUTE,
                    height: Math.max(height * PX_PER_MINUTE, 22),
                  }}
                >
                  <p className={`truncate text-xs font-semibold ${style.time}`}>
                    {minutesToTimeInputValue(start)}–{minutesToTimeInputValue(end)}
                  </p>
                  <p className="truncate text-xs text-text-primary">
                    {appointment.patientName}
                  </p>
                  {height * PX_PER_MINUTE > 40 && (
                    <p className="truncate text-xs text-text-secondary">
                      {appointment.serviceName}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-text-muted/20 pt-3 text-xs text-text-secondary">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Click an empty slot to book · click an appointment for details
          </span>
          <span className="ml-auto inline-flex flex-wrap items-center gap-3">
            <StatusLegend label="Pending" className="bg-amber-400" />
            <StatusLegend label="Confirmed" className="bg-emerald-500" />
            <StatusLegend label="Completed" className="bg-slate-400" />
            <StatusLegend label="Cancelled" className="bg-red-400" />
            <StatusLegend label="No-show" className="bg-orange-400" />
          </span>
        </div>
      </Card>
    </div>
  );
}

function StatusLegend({ label, className }: { label: string; className: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${className}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function toMinutesOfDay(iso: string, timezone: string): number {
  const local = utcIsoToClinicLocalInput(iso, timezone);
  return timeOfDayToMinutes(local.slice(11));
}
