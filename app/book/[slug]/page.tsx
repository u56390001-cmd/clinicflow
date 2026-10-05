import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";

import { BookingPageForm } from "@/components/booking-page/booking-page-form";
import { CLINIC_SLUG_REGEX } from "@/lib/constants";
import { createWidgetClient } from "@/lib/supabase/widget";

/**
 * Public patient booking page — `/book/<slug>`.
 *
 * This is the route the sidebar's copy button, QR code and embed snippet all
 * point at, which is why the path is asserted in `BOOKING_PATH`. The page used
 * to live at `/site/<slug>`, so every generated link 404'd.
 *
 * Unauthenticated by design: a patient with no account has to reach it. Reads go
 * through the service-role client, scoped to a single clinic resolved from the
 * slug, because the anon key cannot see `clinics` under the tenant RLS policy.
 * Only the fields rendered below are selected — no address book, no revenue.
 */

type Props = { params: Promise<{ slug: string }> };

/** Columns the public form needs. Nothing more is exposed. */
const CLINIC_COLUMNS =
  "id, name, slug, booking_slug, timezone, phone, address, doctor_name, logo_url, is_public_booking_enabled, slot_duration_minutes, max_advance_days, auto_approve_bookings";

/**
 * Resolve the slug to a clinic.
 *
 * A clinic's custom booking slug wins; otherwise its own `slug` answers, which
 * is what makes the empty-slug case work. `or()` is a PostgREST filter on the
 * same row, not a fallback chain — hence the two separate queries, since
 * `.or("booking_slug.eq.x,slug.eq.x")` would return the clinic twice.
 */
async function findClinic(slug: string) {
  const supabase = createWidgetClient();

  const byBookingSlug = await supabase
    .from("clinics")
    .select(CLINIC_COLUMNS)
    .eq("booking_slug", slug)
    .maybeSingle();

  if (byBookingSlug.error) {
    console.warn("[book] booking_slug lookup failed", {
      slug,
      code: byBookingSlug.error.code,
      message: byBookingSlug.error.message,
    });
  }
  if (byBookingSlug.data) return byBookingSlug.data;

  const bySlug = await supabase
    .from("clinics")
    .select(CLINIC_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  if (bySlug.error) {
    console.warn("[book] slug lookup failed", {
      slug,
      code: bySlug.error.code,
      message: bySlug.error.message,
    });
  }

  return bySlug.data ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  if (!CLINIC_SLUG_REGEX.test(slug)) {
    return { title: "Book an appointment" };
  }

  try {
    const clinic = await findClinic(slug);
    if (!clinic) return { title: "Book an appointment" };

    return {
      title: `Book an appointment — ${clinic.name}`,
      description: `Request an appointment with ${clinic.name}.`,
      // A patient's booking page has no business in a search index.
      robots: "noindex, nofollow",
    };
  } catch {
    // Never let metadata resolution take the page down.
    return { title: "Book an appointment" };
  }
}

export default async function PublicBookingPage({ params }: Props) {
  const { slug } = await params;

  // Reject anything that could not be a slug before touching the database.
  if (!CLINIC_SLUG_REGEX.test(slug)) {
    notFound();
  }

  let clinic: Awaited<ReturnType<typeof findClinic>> = null;
  try {
    clinic = await findClinic(slug);
  } catch (error) {
    console.error("[book] could not load clinic", { slug, error });
    return <BookingUnavailable heading="Booking is temporarily unavailable" />;
  }

  if (!clinic) {
    // 404 rather than a redirect: redirecting an anonymous patient to
    // /app/booking-page dumped them on the login screen for a link that is
    // simply wrong.
    notFound();
  }

  // A clinic that paused bookings keeps its links alive, so a QR already
  // printed on a poster shows an explanation instead of a 404.
  if (!clinic.is_public_booking_enabled) {
    return (
      <BookingUnavailable
        heading="Online booking is paused"
        body={`${clinic.name} is not taking online bookings at the moment. Please call the clinic to arrange your appointment.`}
        phone={clinic.phone}
      />
    );
  }

  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ??
    headerList.get("host") ??
    "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ??
    // The dev server runs with --experimental-https.
    "https";

  // Bookable services for this clinic. Scoped by `clinic_id` rather than
  // embedded — the earlier `select("*, services (...)")` asked PostgREST for a
  // relationship that does not exist on `clinics` and rejected the whole query.
  const { data: services } = await createWidgetClient()
    .from("services")
    .select("id, name, price, duration_minutes, status")
    .eq("clinic_id", clinic.id)
    .in("status", ["active"])
    .order("name");

  const bookableServices = (services ?? []).map((service) => ({
    id: service.id,
    name: service.name,
    price: service.price ?? 0,
    duration: service.duration_minutes ?? 30,
  }));

  return (
    <div className="bg-surface min-h-screen">
      <BookingPageForm
        clinicId={clinic.id}
        clinicName={clinic.name}
        clinicSlug={clinic.slug}
        clinicPhone={clinic.phone}
        clinicAddress={clinic.address}
        timezone={clinic.timezone}
        services={bookableServices}
        slotDurationMinutes={clinic.slot_duration_minutes}
        maxAdvanceDays={clinic.max_advance_days}
        autoApprove={clinic.auto_approve_bookings}
        baseUrl={`${proto}://${host}`}
      />
    </div>
  );
}

/** Shared "we can't take this booking right now" screen. */
function BookingUnavailable({
  heading,
  body,
  phone,
}: {
  heading: string;
  body?: string;
  phone?: string | null;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-6">
      <div className="max-w-md text-center">
        <h1 className="text-text-primary mb-3 text-2xl font-semibold">
          {heading}
        </h1>
        <p className="text-text-secondary text-sm">
          {body ??
            "This booking page is not available at the moment. Please try again later."}
        </p>
        {phone ? (
          <a
            href={`tel:${phone}`}
            className="text-primary hover:text-primary/80 mt-4 inline-block text-sm font-medium"
          >
            Call {phone}
          </a>
        ) : null}
      </div>
    </div>
  );
}
