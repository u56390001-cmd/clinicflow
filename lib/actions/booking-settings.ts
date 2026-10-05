"use server";

import { revalidatePath } from "next/cache";

import { canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import {
  bookingSettingsSchema,
  bookingSlugCheckSchema,
  toFieldErrors,
} from "@/lib/validation/booking-settings";

/**
 * Server actions for the public booking page settings (migration 0058).
 *
 * Both actions take a plain object rather than `FormData`.
 *
 * That is a deliberate departure from the `(prevState, formData)` shape used
 * by the other settings cards, and it is what makes this card work: a client
 * component cannot keep the toggle and slug field in sync with server state
 * through `useActionState` alone, because `state` only updates after a submit.
 * Passing an object lets the card send exactly what is on screen, and lets the
 * switch save immediately instead of waiting for a Save click.
 *
 * The trade-off is that validation now has to coerce, which
 * `lib/validation/booking-settings.ts` does explicitly.
 */

/** Uniform result so the card can render success and failure the same way. */
export type BookingSettingsResult =
  | { ok: true; message: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export type SlugAvailabilityResult =
  | { available: true; slug: string }
  | { available: false; slug: string; reason: string };

/**
 * Is a custom booking slug free to claim?
 *
 * The clinic is resolved from the request on the server. An earlier version
 * took `currentClinicId` as an argument, which let any signed-in user name
 * another clinic's ID and use the response to probe which slugs a competitor
 * had claimed.
 *
 * Returns `available: true` for the clinic's own slug so saving without
 * changing the field does not report a false conflict.
 */
export async function checkBookingSlugAvailability(
  rawSlug: string,
): Promise<SlugAvailabilityResult> {
  const parsed = bookingSlugCheckSchema.safeParse({ slug: rawSlug });
  if (!parsed.success) {
    return {
      available: false,
      slug: rawSlug,
      reason: parsed.error.issues[0]?.message ?? "Enter a valid slug.",
    };
  }

  const slug = parsed.data.slug;
  if (slug.length === 0) {
    // Empty is valid and means "fall back to the clinic slug", so it is never
    // in conflict.
    return { available: true, slug };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      available: false,
      slug,
      reason: "You must belong to a clinic to check a slug.",
    };
  }

  const { data, error } = await supabase
    .from("clinics")
    .select("id")
    .eq("booking_slug", slug)
    .maybeSingle();

  if (error) {
    // Treated as unavailable rather than available: failing closed avoids
    // telling the user a slug is free when it is not.
    return {
      available: false,
      slug,
      reason: "Could not check that slug. Please try again.",
    };
  }

  if (data && data.id !== access.clinic.id) {
    return {
      available: false,
      slug,
      reason: "That link is already taken. Try another one.",
    };
  }

  return { available: true, slug };
}

/**
 * Persist the booking page settings for the current clinic.
 *
 * Rejects slugs that are already claimed, so the save cannot fail on the
 * unique index with an opaque database error after the card already showed a
 * green check for the slug.
 */
export async function updateBookingSettingsAction(
  input: unknown,
): Promise<BookingSettingsResult> {
  const parsed = bookingSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check your booking settings.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      ok: false,
      message: "You must belong to a clinic to change booking settings.",
    };
  }
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only clinic owners and admins can change these settings.",
    };
  }

  const { bookingSlug, slotDurationMinutes, maxAdvanceDays } = parsed.data;

  // An empty slug writes NULL rather than "" so the link builder has a single
  // "no custom slug" sentinel to test.
  const nextSlug = bookingSlug.length > 0 ? bookingSlug : null;

  if (nextSlug) {
    const { data: clash, error: clashError } = await supabase
      .from("clinics")
      .select("id")
      .eq("booking_slug", nextSlug)
      .maybeSingle();

    if (clashError) {
      return {
        ok: false,
        message: "Could not check that link name. Please try again.",
      };
    }
    if (clash && clash.id !== access.clinic.id) {
      return {
        ok: false,
        message: "That link is already taken. Try another one.",
        fieldErrors: { bookingSlug: "This link name is already in use." },
      };
    }
  }

  const { error } = await supabase
    .from("clinics")
    .update({
      booking_slug: nextSlug,
      is_public_booking_enabled: parsed.data.isPublicBookingEnabled,
      slot_duration_minutes: slotDurationMinutes,
      max_advance_days: maxAdvanceDays,
      auto_approve_bookings: parsed.data.autoApproveBookings,
    })
    .eq("id", access.clinic.id);

  if (error) {
    // 23505 is the unique_violation raised by the partial unique index on
    // booking_slug. It is the one conflict worth naming precisely.
    if (error.code === "23505") {
      return {
        ok: false,
        message: "That link name is already in use.",
        fieldErrors: { bookingSlug: "This link name is already in use." },
      };
    }
    return {
      ok: false,
      message: "We could not save your booking settings. Please try again.",
    };
  }

  // The sidebar reads the clinic row on every render, and the public page
  // reads the slug, so both caches have to drop.
  revalidatePath("/app/booking-page");

  return { ok: true, message: "Booking page settings saved." };
}
