"use server";

import { z } from "zod";

import {
  createAppointmentService,
  listAvailableSlots,
  setAppointmentStatusService,
} from "@/lib/booking-service";
import { createWidgetClient } from "@/lib/supabase/widget";

/**
 * Public patient booking — server actions behind `/book/<slug>`.
 *
 * These run for an anonymous visitor, so nothing here trusts the browser:
 *
 * - the clinic is re-resolved from the slug on every call and never taken from
 *   the payload, so a patient cannot post a booking into another clinic;
 * - the slot is re-verified by `createAppointmentService`, which goes through
 *   the `book_appointment` RPC with an advisory lock, so two patients racing for
 *   the last slot cannot both win;
 * - the appointment is written through the same service the dashboard and the AI
 *   receptionist use, so overlap rules, working hours and blocked times all
 *   behave identically.
 *
 * `createWidgetClient` (service role) is correct here and only here: an
 * anonymous patient cannot satisfy the tenant RLS policy on `clinics`, and every
 * query below is scoped to a clinic resolved from a validated slug.
 */

/** `pending` until a clinic with auto-approve off confirms it by hand. */
export type PublicBookingResult =
  | { ok: true; status: "confirmed" | "pending"; startTime: string }
  | { ok: false; message: string };

/** Slug charset guard, kept in step with `CLINIC_SLUG_REGEX` usage. */
const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "That booking link is not valid.");

const requestSchema = z.object({
  slug: slugSchema,
  serviceId: z.string().uuid("Choose a service to book."),
  /** Clinic-local `YYYY-MM-DDTHH:mm` slot start. */
  start: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
      "Choose a valid time slot.",
    ),
  name: z
    .string()
    .trim()
    .min(2, "Enter your full name.")
    .max(120, "Name must be 120 characters or fewer."),
  phone: z
    .string()
    .trim()
    .min(6, "Enter a phone number the clinic can reach you on.")
    .max(24, "Phone number is too long."),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .max(160, "Email is too long.")
    .or(z.literal(""))
    .transform((value) => (value === "" ? null : value)),
  age: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value === null || value === undefined || value === "") return null;
      const parsed = typeof value === "number" ? value : Number(value);
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    })
    .refine((value) => value === null || (value >= 1 && value <= 120), {
      message: "Enter an age between 1 and 120.",
    }),
  gender: z
    .enum(["male", "female", "other", ""])
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional(),
  notes: z
    .string()
    .trim()
    .max(1000, "Please keep notes under 1000 characters.")
    .or(z.literal(""))
    .transform((value) => (value === "" ? null : value))
    .optional(),
});

/**
 * Resolve the clinic behind a booking slug and confirm it is accepting
 * bookings. Returns null for a bad slug, an unknown clinic, or a paused page —
 * all of which the caller reports the same way.
 */
async function resolveBookableClinic(slug: string) {
  const supabase = createWidgetClient();

  const byBookingSlug = await supabase
    .from("clinics")
    .select("id, name, timezone, is_public_booking_enabled, auto_approve_bookings, max_advance_days")
    .eq("booking_slug", slug)
    .maybeSingle();

  if (byBookingSlug.data) return byBookingSlug.data;

  const bySlug = await supabase
    .from("clinics")
    .select("id, name, timezone, is_public_booking_enabled, auto_approve_bookings, max_advance_days")
    .eq("slug", slug)
    .maybeSingle();

  return bySlug.data ?? null;
}

/**
 * Open slots for one service on one clinic-local date.
 *
 * Wraps `listAvailableSlots` so the client component never touches Supabase,
 * and clamps the date against `max_advance_days` so the picker and the server
 * agree on the last bookable day.
 */
export async function fetchPublicSlots(
  slug: string,
  serviceId: string,
  date: string,
): Promise<{ ok: true; slots: string[] } | { ok: false; message: string }> {
  const parsedSlug = slugSchema.safeParse(slug);
  if (!parsedSlug.success) {
    return { ok: false, message: "That booking link is not valid." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, message: "Choose a valid date." };
  }

  const supabase = createWidgetClient();
  const clinic = await resolveBookableClinic(parsedSlug.data);

  if (!clinic) {
    return { ok: false, message: "We could not find that booking page." };
  }
  if (!clinic.is_public_booking_enabled) {
    return { ok: false, message: "Online booking is currently paused." };
  }

  // Server-side clamp: the date input is client-enforced only, so it cannot be
  // the sole check.
  const today = new Date().toISOString().slice(0, 10);
  if (date < today) {
    return { ok: false, message: "Choose a date from today onwards." };
  }
  if (clinic.max_advance_days) {
    const limit = new Date();
    limit.setDate(limit.getDate() + clinic.max_advance_days);
    const limitDate = limit.toISOString().slice(0, 10);
    if (date > limitDate) {
      return {
        ok: false,
        message: `Bookings open up to ${clinic.max_advance_days} days ahead.`,
      };
    }
  }

  const result = await listAvailableSlots(
    supabase,
    { id: clinic.id, timezone: clinic.timezone },
    serviceId,
    date,
  );

  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, slots: result.slots };
}

/**
 * Create a patient booking.
 *
 * `status` is `pending` for every clinic by default — `createAppointmentService`
 * hard-codes it, because an unverified booking must not be auto-confirmed. A
 * clinic that opted into auto-approve gets a second, explicit status change
 * immediately afterwards.
 */
export async function submitPublicBooking(
  input: unknown,
): Promise<PublicBookingResult> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }

  const supabase = createWidgetClient();
  const clinic = await resolveBookableClinic(parsed.data.slug);

  if (!clinic) {
    return { ok: false, message: "We could not find that booking page." };
  }
  if (!clinic.is_public_booking_enabled) {
    return {
      ok: false,
      message: "Online booking is currently paused. Please call the clinic.",
    };
  }

  const result = await createAppointmentService(
    supabase,
    { id: clinic.id, timezone: clinic.timezone },
    {
      serviceId: parsed.data.serviceId,
      patient: {
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: parsed.data.email,
        age: parsed.data.age,
        gender: parsed.data.gender ?? null,
      },
      start: parsed.data.start,
      notes: parsed.data.notes ?? null,
      // Distinguishable from dashboard and AI bookings in reporting.
      bookingSource: "website",
    },
  );

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  if (clinic.auto_approve_bookings) {
    const confirmed = await setAppointmentStatusService(
      supabase,
      { id: clinic.id, timezone: clinic.timezone },
      result.appointment.id,
      "confirmed",
    );

    if (!confirmed.ok) {
      // The booking exists and is pending. Reporting failure here would tell a
      // patient their appointment was lost when it is actually queued for staff.
      return { ok: true, status: "pending", startTime: parsed.data.start };
    }

    return { ok: true, status: "confirmed", startTime: parsed.data.start };
  }

  return { ok: true, status: "pending", startTime: parsed.data.start };
}
