/**
 * Patient ID (UHID) formatting helpers.
 *
 * Deliberately free of server concerns — no `createClient`, no dynamic import
 * of `@/lib/supabase/server` — because `PatientIdFormatCard` is a client
 * component and needs `samplePatientCode`. The matching reasoning behind
 * `lib/clinic-logo.ts`: a module a client component imports must stay
 * bundle-safe, or the dynamic server import drags `next/headers` into the
 * client graph. The one server read this feature needs,
 * `readPatientCodeFormat`, therefore lives beside its only consumer in
 * `app/app/settings/patient-id/page.tsx`.
 */
import type { PatientCodeFormat } from "@/types/database";

/** Fallback used wherever the prefix column is missing or empty. Mirrors the
 *  `not null default 'CLI'` on `clinics.patient_code_prefix` (migration 0029)
 *  and the `coalesce` in the 0055 trigger. */
export const DEFAULT_PATIENT_CODE_PREFIX = "CLI";

/**
 * The one shape before migration 0055, kept as the default so a clinic that has
 * never opened this screen keeps the numbering its staff already know.
 */
export const DEFAULT_PATIENT_CODE_FORMAT: PatientCodeFormat = "year_sequence";

/**
 * Narrow an untrusted value to a known format, falling back to the default.
 *
 * Used on the read path so a bad row (or a database that has not run 0055 yet)
 * renders a working screen instead of leaving the radiogroup with nothing
 * selected and the card saving `undefined` back into the column.
 */
export function coercePatientCodeFormat(value: unknown): PatientCodeFormat {
  return value === "sequence" || value === "year_sequence"
    ? value
    : DEFAULT_PATIENT_CODE_FORMAT;
}

/**
 * The current calendar year in the *clinic's* timezone.
 *
 * Mirrors the trigger, which computes the year with `at time zone v_tz` rather
 * than in UTC. That distinction is not cosmetic: between 00:00 and 05:00 local
 * in Karachi (UTC+5) it is already the next day in UTC, so a UTC-based year
 * would label a 1 January patient with the previous year and start their
 * sequence on the wrong key.
 */
export function clinicYear(timezone: string, now = new Date()): number {
  try {
    return Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
      }).format(now),
    );
  } catch {
    // An unknown IANA zone (bad clinic row) must not take the page down.
    return now.getUTCFullYear();
  }
}

/**
 * Best-effort formatted ID, used only to keep the card's preview populated when
 * the 0055 preview RPC is not available yet. `sequence` defaults to 1, so this
 * produces the shape (`CLI-00001` / `CLI-2026-00001`) rather than the real next
 * number — the server's value wins whenever it exists.
 */
export function samplePatientCode(
  prefix: string,
  format: PatientCodeFormat,
  year: number,
  sequence = 1,
): string {
  const clean = prefix.trim().toUpperCase() || DEFAULT_PATIENT_CODE_PREFIX;
  const padded = sequence.toString().padStart(5, "0");
  return format === "sequence"
    ? `${clean}-${padded}`
    : `${clean}-${year}-${padded}`;
}
