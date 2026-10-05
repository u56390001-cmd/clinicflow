import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { BookingPageCard } from "@/components/booking-page/booking-page-card";
import { getCurrentClinic } from "@/lib/clinic-access";
import { getBaseUrl } from "@/lib/booking-url";
import { createClient } from "@/lib/supabase/server";

/**
 * Public booking page settings (Phase 23).
 *
 * Server component on purpose. The card needs the clinic row, and reading it
 * here means the browser never sees a clinic it does not belong to, and the
 * first paint already shows the saved values instead of flashing defaults.
 */

/**
 * Defaults used when migration 0058 has not been applied yet, or when a column
 * is missing. Matches the SQL defaults so an un-migrated database behaves like
 * a migrated one instead of showing an empty panel.
 */
const BOOKING_DEFAULTS = {
  bookingSlug: null,
  isPublicBookingEnabled: true,
  slotDurationMinutes: 30,
  maxAdvanceDays: null,
  autoApproveBookings: true,
} as const;

type BookingSettings = {
  bookingSlug: string | null;
  isPublicBookingEnabled: boolean;
  slotDurationMinutes: number;
  maxAdvanceDays: number | null;
  autoApproveBookings: boolean;
};

/**
 * Read the booking columns for one clinic.
 *
 * Deliberately a separate tolerant query instead of widening the select in
 * `getCurrentClinic`. That helper's comment explains why: a column absent from
 * the database makes PostgREST reject the whole nested select, which would take
 * down the header, the dashboard and every other page at once. An un-migrated
 * database should cost this page its settings and nothing else.
 */
async function readBookingSettings(clinicId: string): Promise<BookingSettings> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clinics")
    .select(
      "booking_slug, is_public_booking_enabled, slot_duration_minutes, max_advance_days, auto_approve_bookings",
    )
    .eq("id", clinicId)
    .maybeSingle();

  if (error) {
    // 42703 (undefined column) / PGRST204 (not in schema cache) until 0058 runs.
    console.warn(
      "[booking-page] could not read booking settings; using defaults",
      { code: error.code, message: error.message },
    );
    return { ...BOOKING_DEFAULTS };
  }

  const row = data as Record<string, unknown> | null;

  // Coerced rather than trusted: the columns are nullable in the database even
  // where the SQL declares a default, and a hand-edited row should not put
  // `undefined` into a `<select value>`.
  const duration = Number(row?.slot_duration_minutes);
  const advanceDays = row?.max_advance_days;

  return {
    bookingSlug:
      typeof row?.booking_slug === "string" && row.booking_slug.length > 0
        ? row.booking_slug
        : BOOKING_DEFAULTS.bookingSlug,
    isPublicBookingEnabled:
      typeof row?.is_public_booking_enabled === "boolean"
        ? row.is_public_booking_enabled
        : BOOKING_DEFAULTS.isPublicBookingEnabled,
    slotDurationMinutes:
      Number.isFinite(duration) && duration > 0
        ? duration
        : BOOKING_DEFAULTS.slotDurationMinutes,
    maxAdvanceDays:
      typeof advanceDays === "number" && Number.isFinite(advanceDays)
        ? advanceDays
        : BOOKING_DEFAULTS.maxAdvanceDays,
    autoApproveBookings:
      typeof row?.auto_approve_bookings === "boolean"
        ? row.auto_approve_bookings
        : BOOKING_DEFAULTS.autoApproveBookings,
  };
}

/**
 * Origin the copied link should point at.
 *
 * The request host wins over the configured env var. `NEXT_PUBLIC_*` values are
 * inlined at build time, so in development the env still says one thing while
 * the browser is on another — a copied link pointing at the wrong host is
 * exactly the failure this page had. `x-forwarded-proto` is honoured so the
 * link is correct behind a TLS-terminating proxy.
 */
async function resolveBaseUrl(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) return getBaseUrl();

  const proto =
    headerList.get("x-forwarded-proto") ??
    // The dev script runs `--experimental-https`, and browsers send no scheme,
    // so the secure default is what makes the copied link actually open.
    "https";

  return `${proto}://${host}`;
}

export default async function BookingPagePage() {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) redirect("/app");

  const settings = await readBookingSettings(access.clinic.id);
  const baseUrl = await resolveBaseUrl();

  return (
    <div className="mx-auto w-full max-w-4xl">
      <BookingPageCard
        clinicName={access.clinic.name}
        clinicSlug={access.clinic.slug}
        baseUrl={baseUrl}
        initialBookingSlug={settings.bookingSlug}
        initialIsPublicBookingEnabled={settings.isPublicBookingEnabled}
        initialSlotDurationMinutes={settings.slotDurationMinutes}
        initialMaxAdvanceDays={settings.maxAdvanceDays}
        initialAutoApproveBookings={settings.autoApproveBookings}
      />
    </div>
  );
}
