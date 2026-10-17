"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/select";
import { APP_ROUTES } from "@/lib/constants";
import {
  clinicLocalDayOfWeek,
  clinicToday,
  minutesToTimeInputValue,
  timeOfDayToMinutes,
  utcIsoToClinicLocalInput,
} from "@/lib/time";
import {
  addDaysToNaive,
  formatHourLabel,
  parseDateSafe,
} from "@/lib/utils/datetime";
import { cn } from "@/lib/utils";
import type { AppointmentView, RuleView } from "@/lib/appointments-view";
import type { BlockedTime, Doctor } from "@/types/database";

const PX_PER_MINUTE = 1.2;
const MIN_BLOCK_PX = 26;
const AXIS_WIDTH = 56;
const GRID_PAD_Y = 14;
const WEEK_MIN_COLUMN_PX = 116;
const MONTH_CELL_ITEMS = 3;
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_MIN = ["M", "T", "W", "T", "F", "S", "S"];

type CalendarView = "day" | "week" | "month";

const VIEW_OPTIONS: { id: CalendarView; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

const STATUS_META: Record<
  AppointmentView["status"],
  {
    label: string;
    dot: string;
    block: string;
    accent: string;
  }
> = {
  pending: {
    label: "Pending",
    dot: "bg-status-warning",
    block:
      "border-status-warning/50 bg-status-warning/5 hover:bg-status-warning/10",
    accent: "border-l-status-warning",
  },
  confirmed: {
    label: "Confirmed",
    dot: "bg-status-success",
    block:
      "border-status-success/50 bg-status-success/5 hover:bg-status-success/10",
    accent: "border-l-status-success",
  },
  completed: {
    label: "Completed",
    dot: "bg-status-info",
    block: "border-status-info/40 bg-status-info/5 hover:bg-status-info/10",
    accent: "border-l-status-info",
  },
  cancelled: {
    label: "Cancelled",
    dot: "bg-status-destructive",
    block:
      "border-status-destructive/40 bg-status-destructive/5 opacity-75 hover:bg-status-destructive/10",
    accent: "border-l-status-destructive",
  },
  no_show: {
    label: "No-show",
    dot: "bg-status-warning",
    block:
      "border-status-warning/40 bg-status-warning/5 opacity-75 hover:bg-status-warning/10",
    accent: "border-l-status-warning",
  },
};

function localDateOf(iso: string, timezone: string): string {
  return utcIsoToClinicLocalInput(iso, timezone).slice(0, 10);
}

function minutesOfDay(iso: string, timezone: string): number {
  return timeOfDayToMinutes(utcIsoToClinicLocalInput(iso, timezone).slice(11));
}

function dayNumber(naive: string): string {
  return naive.slice(8, 10).replace(/^0/, "");
}

function longDateLabel(naive: string): string {
  const date = parseDateSafe(naive);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function monthYearLabel(naive: string): string {
  const date = parseDateSafe(naive);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(date);
}

function weekRangeLabel(monday: string): string {
  const start = parseDateSafe(monday);
  const end = parseDateSafe(addDaysToNaive(monday, 6));
  if (!start || !end) return "";
  const startText = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(start);
  const endText = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(end);
  return `${startText} – ${endText}`;
}

function mondayOf(naive: string): string {
  return addDaysToNaive(naive, -clinicLocalDayOfWeek(naive));
}

function addMonthsToNaive(naive: string, delta: number): string {
  const date = parseDateSafe(naive);
  if (!date) return naive;
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return target.toISOString().slice(0, 10);
}

function initialsOf(name: string | null): string {
  if (!name) return "—";
  const parts = name
    .replace(/^dr\.?\s+/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "—";
}

type Positioned = {
  appointment: AppointmentView;
  start: number;
  end: number;
  lane: number;
  lanes: number;
};

/** Assign side-by-side lanes to overlapping appointments in one day column. */
function positionDay(items: AppointmentView[], timezone: string): Positioned[] {
  const list = items
    .map((appointment) => ({
      appointment,
      start: timeOfDayToMinutes(
        utcIsoToClinicLocalInput(appointment.start_time, timezone).slice(11),
      ),
      end: timeOfDayToMinutes(
        utcIsoToClinicLocalInput(appointment.end_time, timezone).slice(11),
      ),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const count = list.length;
  const groupOf = new Array<number>(count).fill(-1);
  let groupCount = 0;
  for (let i = 0; i < count; i += 1) {
    if (groupOf[i] !== -1) continue;
    const stack = [i];
    groupOf[i] = groupCount;
    while (stack.length > 0) {
      const current = stack.pop() as number;
      for (let j = 0; j < count; j += 1) {
        if (
          groupOf[j] === -1 &&
          j !== current &&
          list[j].start < list[current].end &&
          list[current].start < list[j].end
        ) {
          groupOf[j] = groupCount;
          stack.push(j);
        }
      }
    }
    groupCount += 1;
  }

  const laneEnd: number[] = [];
  const laneOf = new Array<number>(count).fill(0);
  const lanesOfGroup = new Map<number, number>();
  let currentGroup = -1;
  for (let i = 0; i < count; i += 1) {
    if (groupOf[i] !== currentGroup) {
      currentGroup = groupOf[i];
      laneEnd.length = 0;
    }
    let lane = 0;
    while (lane < laneEnd.length && laneEnd[lane] > list[i].start) lane += 1;
    laneEnd[lane] = list[i].end;
    laneOf[i] = lane;
    lanesOfGroup.set(
      currentGroup,
      Math.max(lanesOfGroup.get(currentGroup) ?? 1, lane + 1),
    );
  }

  return list.map((item, index) => ({
    appointment: item.appointment,
    start: item.start,
    end: item.end,
    lane: laneOf[index],
    lanes: lanesOfGroup.get(groupOf[index]) ?? 1,
  }));
}

function computeRange(
  days: string[],
  byDate: Map<string, AppointmentView[]>,
  ruleByDay: Map<number, RuleView>,
  timezone: string,
): { start: number; end: number } {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const day of days) {
    const rule = ruleByDay.get(clinicLocalDayOfWeek(day));
    if (rule) {
      start = Math.min(start, timeOfDayToMinutes(rule.startTime));
      end = Math.max(end, timeOfDayToMinutes(rule.endTime));
    }
    for (const appointment of byDate.get(day) ?? []) {
      start = Math.min(start, minutesOfDay(appointment.start_time, timezone));
      end = Math.max(end, minutesOfDay(appointment.end_time, timezone));
    }
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    start = 9 * 60;
    end = 17 * 60;
  }
  return {
    start: Math.floor(start / 60) * 60,
    end: Math.ceil(end / 60) * 60,
  };
}

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
  const today = useMemo(() => clinicToday(timezone), [timezone]);
  const [view, setView] = useState<CalendarView>("day");
  const [anchor, setAnchor] = useState(today);
  const [doctorFilter, setDoctorFilter] = useState("");

  const safeAnchor = parseDateSafe(anchor) ? anchor : today;

  const ruleByDay = useMemo(() => {
    const map = new Map<number, RuleView>();
    for (const rule of rules) {
      if (rule.enabled) map.set(rule.dayOfWeek, rule);
    }
    return map;
  }, [rules]);

  const byDate = useMemo(() => {
    const map = new Map<string, AppointmentView[]>();
    for (const appointment of appointments) {
      if (doctorFilter !== "" && appointment.doctor_id !== doctorFilter)
        continue;
      const key = localDateOf(appointment.start_time, timezone);
      const list = map.get(key);
      if (list) list.push(appointment);
      else map.set(key, [appointment]);
    }
    return map;
  }, [appointments, doctorFilter, timezone]);

  const blockedByDate = useMemo(() => {
    const map = new Map<
      string,
      { id: string; reason: string | null; start: number; end: number }[]
    >();
    for (const blocked of blockedTimes) {
      if (!(blocked.doctor_id === null || blocked.doctor_id === doctorFilter)) {
        continue;
      }
      const key = localDateOf(blocked.start_time, timezone);
      const list = map.get(key) ?? [];
      list.push({
        id: blocked.id,
        reason: blocked.reason,
        start: minutesOfDay(blocked.start_time, timezone),
        end: minutesOfDay(blocked.end_time, timezone),
      });
      map.set(key, list);
    }
    return map;
  }, [blockedTimes, doctorFilter, timezone]);

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        addDaysToNaive(mondayOf(safeAnchor), index),
      ),
    [safeAnchor],
  );

  const gridDays = view === "week" ? weekDays : [safeAnchor];

  const monthDays = useMemo(() => {
    const gridStart = mondayOf(`${safeAnchor.slice(0, 7)}-01`);
    return Array.from({ length: 42 }, (_, index) =>
      addDaysToNaive(gridStart, index),
    );
  }, [safeAnchor]);

  const range = computeRange(gridDays, byDate, ruleByDay, timezone);

  const scopedCount = useMemo(() => {
    const scope =
      view === "month" ? monthDays : view === "week" ? weekDays : [safeAnchor];
    return scope.reduce(
      (total, day) => total + (byDate.get(day)?.length ?? 0),
      0,
    );
  }, [view, monthDays, weekDays, safeAnchor, byDate]);

  const rangeLabel =
    view === "month"
      ? monthYearLabel(safeAnchor)
      : view === "week"
        ? weekRangeLabel(mondayOf(safeAnchor))
        : longDateLabel(safeAnchor);

  function shift(direction: number) {
    setAnchor((current) => {
      const base = parseDateSafe(current) ? current : today;
      if (view === "month") return addMonthsToNaive(base, direction);
      if (view === "week") return addDaysToNaive(base, direction * 7);
      return addDaysToNaive(base, direction);
    });
  }

  function openNewAppointment() {
    router.push(APP_ROUTES.app.appointments);
  }

  const gridHeight = (range.end - range.start) * PX_PER_MINUTE + GRID_PAD_Y * 2;
  const columnCount = view === "week" ? 7 : 1;
  const hourMarks: number[] = [];
  for (let minute = range.start; minute <= range.end; minute += 60) {
    hourMarks.push(minute);
  }
  const topFor = (minute: number) =>
    GRID_PAD_Y + (minute - range.start) * PX_PER_MINUTE;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-secondary">
          Calendar
        </h1>
        <div className="text-right">
          <p className="text-base font-semibold text-text-primary">
            {rangeLabel}
          </p>
          <p className="text-sm text-text-secondary">
            {scopedCount === 0
              ? "No appointments scheduled"
              : `${scopedCount} appointment${scopedCount === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous"
            onClick={() => shift(-1)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next"
            onClick={() => shift(1)}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(today)}>
            Today
          </Button>
        </div>

        {doctors.length > 1 && (
          <NativeSelect
            aria-label="Filter by doctor"
            value={doctorFilter}
            onChange={(event) => setDoctorFilter(event.target.value)}
            className="h-9 w-auto min-w-[9rem]"
          >
            <option value="">All doctors</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </NativeSelect>
        )}

        <div
          role="group"
          aria-label="Calendar view"
          className="inline-flex items-center rounded-control border border-text-muted/40 bg-app p-0.5"
        >
          {VIEW_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={view === option.id}
              onClick={() => setView(option.id)}
              className={cn(
                "h-8 rounded-[0.4rem] px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                view === option.id
                  ? "bg-surface text-primary shadow-card"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {canManage && (
          <Button size="sm" className="ml-auto" onClick={openNewAppointment}>
            <Plus aria-hidden="true" />
            New appointment
          </Button>
        )}
      </div>

      {view === "month" ? (
        <MonthGrid
          days={monthDays}
          anchorMonth={safeAnchor.slice(0, 7)}
          today={today}
          timezone={timezone}
          byDate={byDate}
          onOpenAppointment={openNewAppointment}
          onOpenDay={(day) => {
            setAnchor(day);
            setView("day");
          }}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div
            className="overflow-auto"
            style={{ maxHeight: "min(80svh, 760px)" }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `${AXIS_WIDTH}px repeat(${columnCount}, minmax(${
                  view === "week" ? WEEK_MIN_COLUMN_PX : 0
                }px, 1fr))`,
                minWidth:
                  view === "week"
                    ? AXIS_WIDTH + 7 * WEEK_MIN_COLUMN_PX
                    : undefined,
              }}
            >
              <div className="sticky left-0 top-0 z-40 border-b border-r border-text-muted/20 bg-app" />
              {gridDays.map((day) => {
                const isToday = day === today;
                return (
                  <div
                    key={day}
                    className={cn(
                      "sticky top-0 z-20 border-b border-l border-text-muted/20 px-2 py-2 text-center",
                      isToday ? "bg-primary-tint" : "bg-app",
                    )}
                  >
                    <p
                      className={cn(
                        "text-[11px] font-semibold uppercase tracking-wide",
                        isToday ? "text-primary" : "text-text-secondary",
                      )}
                    >
                      <span className="hidden sm:inline">
                        {WEEKDAY_SHORT[clinicLocalDayOfWeek(day)]}
                      </span>
                      <span className="sm:hidden">
                        {WEEKDAY_MIN[clinicLocalDayOfWeek(day)]}
                      </span>
                    </p>
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        isToday ? "text-primary" : "text-text-primary",
                      )}
                    >
                      {dayNumber(day)}
                    </p>
                  </div>
                );
              })}

              <div
                className="relative sticky left-0 z-30 border-r border-text-muted/20 bg-surface"
                style={{ height: gridHeight }}
              >
                {hourMarks.map((minute) => (
                  <div
                    key={minute}
                    className="absolute right-2 -translate-y-1/2 text-[11px] text-text-muted"
                    style={{ top: topFor(minute) }}
                  >
                    {formatHourLabel(minute)}
                  </div>
                ))}
              </div>

              {gridDays.map((day) => {
                const rule = ruleByDay.get(clinicLocalDayOfWeek(day));
                const positioned = positionDay(byDate.get(day) ?? [], timezone);
                const blocks = blockedByDate.get(day) ?? [];
                return (
                  <div
                    key={day}
                    className="relative border-l border-text-muted/20 bg-surface"
                    style={{ height: gridHeight }}
                  >
                    {hourMarks.map((minute) => (
                      <div
                        key={minute}
                        className="pointer-events-none absolute inset-x-0 border-t border-text-muted/15"
                        style={{ top: topFor(minute) }}
                      />
                    ))}

                    {blocks.map((block) => (
                      <div
                        key={block.id}
                        className="pointer-events-none absolute inset-x-1 overflow-hidden rounded-control bg-status-destructive/10"
                        style={{
                          top: topFor(block.start),
                          height: Math.max(
                            (block.end - block.start) * PX_PER_MINUTE,
                            18,
                          ),
                        }}
                      >
                        <span className="block truncate px-1 text-[10px] font-medium leading-tight text-status-destructive">
                          {block.reason ?? "Blocked"}
                        </span>
                      </div>
                    ))}

                    {!rule && (
                      <div className="pointer-events-none absolute inset-x-1 top-2 rounded-control border border-dashed border-text-muted/30 bg-app/70 px-1.5 py-1 text-center text-[10px] font-medium text-text-secondary">
                        Closed
                      </div>
                    )}

                    {positioned.map((item) => {
                      const meta = STATUS_META[item.appointment.status];
                      const top = topFor(Math.max(item.start, range.start));
                      const height = Math.max(
                        (Math.min(item.end, range.end) -
                          Math.max(item.start, range.start)) *
                          PX_PER_MINUTE,
                        MIN_BLOCK_PX,
                      );
                      const widthPct = 100 / item.lanes;
                      const timeText = `${minutesToTimeInputValue(
                        item.start,
                      )}–${minutesToTimeInputValue(item.end)}`;
                      return (
                        <button
                          key={item.appointment.id}
                          type="button"
                          onClick={openNewAppointment}
                          title={`${item.appointment.patientName} · ${timeText} · ${
                            item.appointment.serviceName
                          }${item.appointment.doctorName ? ` · ${item.appointment.doctorName}` : ""}`}
                          className={cn(
                            "absolute z-20 flex flex-col overflow-hidden rounded-control border border-l-4 px-1.5 py-0.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                            meta.block,
                            meta.accent,
                          )}
                          style={{
                            top,
                            height,
                            left: `calc(${item.lane * widthPct}% + 3px)`,
                            width: `calc(${widthPct}% - 6px)`,
                          }}
                        >
                          <span className="truncate text-[11px] font-semibold leading-tight text-text-primary">
                            {item.appointment.patientName}
                          </span>
                          <span className="truncate text-[10px] leading-tight text-text-secondary">
                            {timeText}
                            {item.appointment.doctorName
                              ? ` · ${initialsOf(item.appointment.doctorName)}`
                              : ""}
                          </span>
                          {height >= 44 && (
                            <span className="truncate text-[10px] leading-tight text-text-muted">
                              {item.appointment.serviceName}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          Click an appointment to open it
        </span>
        <span className="ml-auto inline-flex flex-wrap items-center gap-3">
          {(Object.keys(STATUS_META) as AppointmentView["status"][]).map(
            (status) => (
              <span key={status} className="inline-flex items-center gap-1.5">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    STATUS_META[status].dot,
                  )}
                  aria-hidden="true"
                />
                {STATUS_META[status].label}
              </span>
            ),
          )}
        </span>
      </div>
    </div>
  );
}

function MonthGrid({
  days,
  anchorMonth,
  today,
  timezone,
  byDate,
  onOpenAppointment,
  onOpenDay,
}: {
  days: string[];
  anchorMonth: string;
  today: string;
  timezone: string;
  byDate: Map<string, AppointmentView[]>;
  onOpenAppointment: () => void;
  onOpenDay: (day: string) => void;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="grid grid-cols-7">
        {WEEKDAY_SHORT.map((label, index) => (
          <div
            key={label}
            className="border-b border-text-muted/20 bg-app px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-text-secondary"
          >
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{WEEKDAY_MIN[index]}</span>
          </div>
        ))}

        {days.map((day) => {
          const outside = day.slice(0, 7) !== anchorMonth;
          const isToday = day === today;
          const list = (byDate.get(day) ?? [])
            .slice()
            .sort(
              (a, b) =>
                minutesOfDay(a.start_time, timezone) -
                minutesOfDay(b.start_time, timezone),
            );
          const shown = list.slice(0, MONTH_CELL_ITEMS);
          const extra = list.length - shown.length;
          return (
            <div
              key={day}
              role="button"
              tabIndex={0}
              onClick={() => onOpenDay(day)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenDay(day);
                }
              }}
              className={cn(
                "flex min-h-[5.5rem] cursor-pointer flex-col gap-1 border-b border-r border-text-muted/20 p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
                outside
                  ? "bg-app/40 hover:bg-app/60"
                  : "bg-surface hover:bg-app/40",
              )}
              aria-label={`Open ${longDateLabel(day)}`}
            >
              <span className="flex items-center justify-between">
                <span
                  className={cn(
                    "grid h-6 w-6 place-items-center rounded-pill text-xs font-semibold",
                    isToday
                      ? "bg-primary text-white"
                      : outside
                        ? "text-text-muted"
                        : "text-text-primary",
                  )}
                >
                  {dayNumber(day)}
                </span>
                {list.length > 0 && (
                  <span className="text-[10px] text-text-muted">
                    {list.length}
                  </span>
                )}
              </span>

              <span className="flex flex-col gap-0.5">
                {shown.map((appointment) => {
                  const meta = STATUS_META[appointment.status];
                  return (
                    <button
                      key={appointment.id}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenAppointment();
                      }}
                      title={`${appointment.patientName} · ${
                        appointment.serviceName
                      } · ${meta.label}`}
                      className={cn(
                        "flex items-center gap-1 truncate rounded border-l-2 px-1 py-0.5 text-left text-[10px] leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                        meta.block,
                        meta.accent,
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          meta.dot,
                        )}
                        aria-hidden="true"
                      />
                      <span className="shrink-0 font-semibold text-text-secondary">
                        {minutesToTimeInputValue(
                          minutesOfDay(appointment.start_time, timezone),
                        )}
                      </span>
                      <span className="truncate text-text-primary">
                        {appointment.patientName}
                      </span>
                    </button>
                  );
                })}
                {extra > 0 && (
                  <span className="px-1 text-[10px] font-medium text-primary">
                    +{extra} more
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
