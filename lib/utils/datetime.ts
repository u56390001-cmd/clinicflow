/**
 * Shared, crash-safe date/time helpers for clinic-local ("naive") datetimes.
 *
 * Naive values are `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm` strings that describe the
 * clinic's own wall clock (already converted from UTC via `lib/time.ts`). To do
 * arithmetic and formatting on them without any dependence on the viewer's
 * device timezone, we anchor them at UTC: `new Date(Date.UTC(...))`, then read
 * back with `timeZone: "UTC"`. UTC has no DST, so adding minutes/days to such a
 * Date yields correct wall-clock results.
 *
 * All functions accept malformed/empty input and return a safe fallback
 * (`null` / `""` / the input unchanged) instead of throwing `Invalid Date`.
 */

import { addDays, addMinutes } from "date-fns";
import { format as formatInTimeZone } from "date-fns-tz";

const NAIVE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NAIVE_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function naiveComponents(value: string): number[] | null {
  let match = value.match(NAIVE_DATETIME);
  let fields: number[] | null = null;
  if (match) {
    fields = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5])];
  } else {
    match = value.match(NAIVE_DATE);
    if (match) {
      fields = [Number(match[1]), Number(match[2]), Number(match[3]), 0, 0];
    }
  }
  if (!fields) return null;

  const [year, month, day, hour, minute] = fields;
  if (
    !Number.isInteger(year) || year < 1000 || year > 9999 ||
    !Number.isInteger(month) || month < 1 || month > 12 ||
    !Number.isInteger(day) || day < 1 || day > 31 ||
    !Number.isInteger(hour) || hour < 0 || hour > 23 ||
    !Number.isInteger(minute) || minute < 0 || minute > 59
  ) {
    return null;
  }
  return fields;
}

/**
 * Parse a `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm` (naive, treated as wall clock) or a
 * full ISO 8601 string into a `Date`. Returns `null` for empty or invalid input
 * instead of producing an `Invalid Date`.
 */
export function parseDateSafe(input: string | null | undefined): Date | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value) return null;

  const fields = naiveComponents(value);
  if (fields) {
    const [year, month, day, hour, minute] = fields;
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
    // `Date.UTC` normalizes overflow (e.g. Feb 30 -> Mar 2); reject it so the
    // parsed value always reflects exactly what the caller provided.
    if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date;
  }

  const iso = new Date(value);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

/** True when `value` is a well-formed `YYYY-MM-DD` string. */
export function isValidNaiveDate(value: string | null | undefined): boolean {
  if (typeof value !== "string" || !NAIVE_DATE.test(value.trim())) return false;
  return parseDateSafe(value) !== null;
}

/** Read the wall-clock components of a UTC-anchored Date back as a string. */
function formatUtc(date: Date, pattern: string): string {
  return formatInTimeZone(date, pattern, { timeZone: "UTC" });
}

/**
 * "Wednesday, Aug 20, 2026" for a naive `YYYY-MM-DD`. Returns `""` if the
 * input is missing/invalid so callers never render or throw on bad data.
 */
export function formatViewDate(dateStr: string | null | undefined): string {
  const date = parseDateSafe(dateStr);
  if (!date) return "";
  return formatUtc(date, "EEEE, MMM d, yyyy");
}

/**
 * Wall-clock end time for a naive `YYYY-MM-DDTHH:mm` start plus a service
 * duration, returned as a naive `YYYY-MM-DDTHH:mm` string. Returns `null` when
 * the start or duration is missing/invalid.
 */
export function computeAppointmentEnd(
  start: string | null | undefined,
  durationMinutes: number | null | undefined,
): string | null {
  const date = parseDateSafe(start);
  if (!date || !Number.isFinite(durationMinutes) || (durationMinutes ?? 0) < 1) {
    return null;
  }
  return formatUtc(addMinutes(date, Math.round(durationMinutes as number)), "yyyy-MM-dd'T'HH:mm");
}

/** "9:30 AM" for a naive `YYYY-MM-DDTHH:mm`. Returns `""` if invalid. */
export function formatNaiveTime(
  value: string | null | undefined,
): string {
  const date = parseDateSafe(value);
  if (!date) return "";
  return formatUtc(date, "h:mm a");
}

/**
 * "Aug 15, 1990" for a naive `YYYY-MM-DD` (e.g. a patient's date of birth).
 * Returns `""` if the input is missing/invalid.
 */
export function formatNaiveDate(value: string | null | undefined): string {
  const date = parseDateSafe(value);
  if (!date) return "";
  return formatUtc(date, "MMM d, yyyy");
}

/**
 * Today's date as a naive `YYYY-MM-DD`, anchored at UTC. Used to reject future
 * dates of birth; matches the DB CHECK which compares against `current_date`
 * (Supabase servers run in UTC), so YYYY-MM-DD lexicographic comparison works.
 */
export function todayNaiveUtc(): string {
  return formatUtc(new Date(), "yyyy-MM-dd");
}

/**
 * The naive `YYYY-MM-DD` occurring `days` days after `naiveDate`. Returns the
 * input unchanged when it is not a valid `YYYY-MM-DD`.
 */
export function addDaysToNaive(
  naiveDate: string | null | undefined,
  days: number,
): string {
  const date = parseDateSafe(naiveDate);
  if (!date || !Number.isFinite(days)) return naiveDate ?? "";
  return formatUtc(addDays(date, Math.round(days)), "yyyy-MM-dd");
}

/**
 * Whole years between a naive `YYYY-MM-DD` date of birth and today (UTC).
 * Returns `null` for missing/invalid input or a future date.
 *
 * Prefer this over the stored `patients.age` column: a hand-entered age is
 * correct on the day it is typed and wrong within a year. Fall back to the
 * column only when no date of birth is on file.
 */
export function ageFromDob(dob: string | null | undefined): number | null {
  const born = parseDateSafe(dob);
  if (!born) return null;

  const today = new Date();
  let years = today.getUTCFullYear() - born.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - born.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < born.getUTCDate())) {
    years -= 1;
  }
  return years >= 0 && years < 150 ? years : null;
}

/** "9 AM" / "2 PM" label for minutes-since-midnight. */export function formatHourLabel(minutes: number): string {
  const total = Number.isFinite(minutes) ? Math.round(minutes) : 0;
  const clamped = Math.max(0, Math.min(24 * 60 - 1, total));
  const date = new Date(Date.UTC(2000, 0, 1, Math.floor(clamped / 60), clamped % 60));
  return formatUtc(date, "h a");
}
