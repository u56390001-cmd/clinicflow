/**
 * Timezone-aware helpers for clinic time data.
 *
 * Storage contract:
 * - `availability_rules.start_time` / `end_time` are `time` values — wall
 *   clock in the clinic's timezone (recurring weekly hours).
 * - `blocked_times.start_time` / `end_time` are `timestamptz` (UTC).
 *
 * These helpers convert between UTC ISO strings and a clinic timezone's
 * wall-clock values so the UI can render `<input type="datetime-local">`
 * values that match the clinic's own clock.
 */

import { addDaysToNaive, parseDateSafe } from "@/lib/utils/datetime";

const offsetFormatterCache = new Map<string, Intl.DateTimeFormat>();

function offsetFormatterFor(tz: string): Intl.DateTimeFormat {
  const cached = offsetFormatterCache.get(tz);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  offsetFormatterCache.set(tz, formatter);
  return formatter;
}

const UTC_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  hour: "numeric",
  minute: "2-digit",
});

const UTC_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

const UTC_DATE_YEAR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

/**
 * Returns the fixed offset (in minutes, local = UTC + offset) for the given
 * instant in the given IANA timezone. `Intl` resolves DST, so this must be
 * evaluated against the actual date being converted, not a constant.
 */
function offsetMinutesForDate(tz: string, date: Date): number {
  const formatter = offsetFormatterFor(tz);
  const parts = formatter.formatToParts(date);
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = part.value;
  }
  const asUtcMs = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return (asUtcMs - date.getTime()) / 60_000;
}

/**
 * Resolve the UTC offset (in minutes, local = UTC + offset) that applies to a
 * naive wall-clock reading in `tz`.
 *
 * The offset is read at the wall clock read as an instant, then verified at
 * the instant that offset produces. When they disagree the wall clock sits on
 * the far side of a DST transition, so the candidate is recomputed with the
 * offset that applies there. A wall clock that falls inside the skipped "hole"
 * of a spring-forward transition does not exist at all; the pre-transition
 * offset is kept so the result still maps back to a real local time.
 *
 * This mirrors `date-fns-tz`'s `fixOffset`, which is the reference this
 * project already depends on.
 */
function resolveLocalOffsetMinutes(tz: string, wallClockMs: number): number {
  const offset = offsetMinutesForDate(tz, new Date(wallClockMs));
  const candidate = wallClockMs - offset * 60_000;

  const offsetAtCandidate = offsetMinutesForDate(tz, new Date(candidate));
  if (offsetAtCandidate === offset) return offset;

  const adjusted = wallClockMs - offsetAtCandidate * 60_000;
  const offsetAtAdjusted = offsetMinutesForDate(tz, new Date(adjusted));
  if (offsetAtAdjusted === offsetAtCandidate) return offsetAtCandidate;

  // Inside a DST hole — the wall clock does not exist. Keep the earlier
  // (pre-transition) offset so the result still lands on a real local time.
  return Math.max(offsetAtCandidate, offsetAtAdjusted);
}

/**
 * Convert a naive clinic-local datetime (`YYYY-MM-DDTHH:mm` from a
 * `datetime-local` input) to a UTC ISO string for `timestamptz` storage.
 *
 * The offset is applied EXACTLY once. A second unconditional subtraction
 * double-counted it, which shifted every stored appointment by one full
 * timezone offset (5 hours for Asia/Karachi): the patient was promised
 * 14:00 and the row landed at 09:00, and the slot-availability check ran
 * against the shifted clock — so a slot the patient had actually booked
 * came back as "outside the doctor's booked slots".
 */
export function clinicLocalToUtcIso(naive: string, tz: string): string {
  const match = naive.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error("Expected a YYYY-MM-DDTHH:mm value.");
  const [, y, mo, d, h, mi] = match;

  // Provisional instant assuming the wall clock is UTC.
  const wallClockMs = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
  );

  const offset = resolveLocalOffsetMinutes(tz, wallClockMs);
  return new Date(wallClockMs - offset * 60_000).toISOString();
}

/**
 * Convert a UTC ISO string to a naive clinic-local `YYYY-MM-DDTHH:mm` value
 * suitable for `datetime-local` inputs.
 */
export function utcIsoToClinicLocalInput(iso: string, tz: string): string {
  const date = new Date(iso);
  const localMs = date.getTime() + offsetMinutesForDate(tz, date) * 60_000;
  const local = new Date(localMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

/**
 * Today's date in the clinic's timezone, as a naive `YYYY-MM-DD`.
 *
 * Use this instead of `new Date().getDate()` for anything user-facing: the
 * latter reads the *host's* clock, so on a UTC server a Karachi clinic gets the
 * wrong "today" for the first five hours of every local day.
 */
export function clinicToday(tz: string): string {
  return utcIsoToClinicLocalInput(new Date().toISOString(), tz).slice(0, 10);
}

/**
 * The first day of the clinic-local month containing `localDate`, as a naive
 * `YYYY-MM-DD`. Returns the input unchanged if it is not a valid date.
 */
export function clinicMonthStart(localDate: string): string {
  return parseDateSafe(localDate) ? `${localDate.slice(0, 7)}-01` : localDate;
}

/**
 * UTC ISO bounds of one clinic-local calendar day as a half-open range, ready
 * to drop into `.gte(startIso)` / `.lt(endIso)` filters on `timestamptz`
 * columns. Half-open (not `lte`) so an appointment at exactly midnight belongs
 * to one day only.
 */
export function clinicDayRangeUtc(
  localDate: string,
  tz: string,
): { startIso: string; endIso: string } {
  return {
    startIso: clinicLocalToUtcIso(`${localDate}T00:00`, tz),
    endIso: clinicLocalToUtcIso(`${addDaysToNaive(localDate, 1)}T00:00`, tz),
  };
}

/**
 * Strip seconds from a Postgres `time` value (`09:00:00`) for `<time>` inputs
 * that expect `HH:MM`.
 */
export function timeToInputValue(time: string): string {
  const parts = time.split(":");
  if (parts.length < 2) return time;
  return `${parts[0]}:${parts[1]}`;
}

/**
 * Render a `timestamptz` range in the clinic's timezone, e.g.
 * "Aug 20, 2026, 9:00 AM – 5:00 PM" (same day) or
 * "Aug 20, 2026, 9:00 AM – Aug 21, 2026, 5:00 PM" (multi-day).
 */
export function formatClinicLocalRange(
  startIso: string,
  endIso: string,
  tz: string,
): string {
  const start = utcIsoToClinicLocalInput(startIso, tz);
  const end = utcIsoToClinicLocalInput(endIso, tz);

  const fmtTime = UTC_TIME_FORMATTER;
  const fmtDate = UTC_DATE_YEAR_FORMATTER;

  // `YYYY-MM-DDTHH:mm` -> Date with the wall clock interpreted as UTC, so the
  // UTC timezone formatter renders exactly the clinic's local clock.
  const toDate = (value: string) => parseDateSafe(value);

  const startDate = toDate(start);
  const endDate = toDate(end);
  if (!startDate || !endDate) return "";
  const sameDay =
    start.slice(0, 10) === end.slice(0, 10);

  return sameDay
    ? `${fmtDate.format(startDate)}, ${fmtTime.format(startDate)} – ${fmtTime.format(endDate)}`
    : `${fmtDate.format(startDate)}, ${fmtTime.format(startDate)} – ${fmtDate.format(endDate)}, ${fmtTime.format(endDate)}`;
}

/**
 * Day of the week (0 = Monday ... 6 = Sunday) for a naive clinic-local
 * `YYYY-MM-DDTHH:mm` value. Used by availability checks to pick the right
 * weekly working-hours rule.
 */
export function clinicLocalDayOfWeek(naive: string): number {
  const date = parseDateSafe(naive);
  if (!date) return 0;
  return (date.getUTCDay() + 6) % 7;
}

/**
 * Minutes since midnight for a time-of-day value (`HH:MM`, `HH:MM:SS`, or a
 * bare `HH:MM`). Used to compare appointment times against working-hours
 * rules, which are stored as `time` values.
 */
export function timeOfDayToMinutes(value: string): number {
  const [h, m = "0"] = value.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * Minutes since midnight -> `HH:MM` for `<time>` inputs and time labels.
 * Clamps 24:00 to 23:59.
 */
export function minutesToTimeInputValue(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(totalMinutes)));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
}

/**
 * Compact slot label in the clinic's timezone, e.g.
 * "Aug 20 · 9:00 AM – 9:30 AM" (same day) or a two-date variant for spans.
 */
export function formatClinicLocalSlot(
  startIso: string,
  endIso: string,
  tz: string,
): string {
  const start = utcIsoToClinicLocalInput(startIso, tz);
  const end = utcIsoToClinicLocalInput(endIso, tz);

  const fmtDate = UTC_DATE_FORMATTER;
  const fmtTime = UTC_TIME_FORMATTER;

  const toDate = (value: string) => parseDateSafe(value);
  const startDate = toDate(start);
  const endDate = toDate(end);
  if (!startDate || !endDate) return "";

  if (start.slice(0, 10) === end.slice(0, 10)) {
    return `${fmtDate.format(startDate)} · ${fmtTime.format(startDate)} – ${fmtTime.format(endDate)}`;
  }
  return `${fmtDate.format(startDate)}, ${fmtTime.format(startDate)} – ${fmtDate.format(endDate)}, ${fmtTime.format(endDate)}`;
}
