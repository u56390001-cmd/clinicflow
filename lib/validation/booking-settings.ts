import { z } from "zod";

/**
 * Validation for the public booking page settings (migration 0058).
 *
 * Kept in its own module rather than appended to `lib/validation/schemas.ts`
 * so the booking surface can be read without scrolling past every other
 * domain's schemas.
 *
 * Every field arrives as a *string* from `FormData` and from `<input>` /
 * `<select>` elements. These schemas therefore coerce before validating.
 * This is the whole reason saving used to fail silently: the schema expected
 * `z.number()` and `z.boolean()`, so a submitted `"30"` and `"true"` were
 * rejected before the action ever reached the database.
 */

/** Slug charset: lowercase alphanumerics separated by single hyphens. */
export const BOOKING_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * A checkbox that is unchecked submits nothing at all, while a React switch
 * still posts an explicit `"false"`. `z.coerce.boolean()` is wrong here
 * because `Boolean("false") === true`, which would silently turn an
 * unchecked box on. Accepting exactly `"true"` and normalising every other
 * value to `false` keeps an absent field and an explicit `false` identical.
 */
const booleanField = z
  .union([z.boolean(), z.string(), z.null(), z.undefined()])
  .transform((value) => value === true || value === "true");

/**
 * A number that may be left empty. `""`, `null` and `undefined` become `null`
 * rather than `0` so "no limit" stays distinguishable from "limit is zero".
 */
const optionalNumberField = (message: string) =>
  z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value === null || value === undefined || value === "") return null;
      if (typeof value === "number") return value;
      const parsed = Number(value);
      return Number.isNaN(parsed) ? Number.NaN : parsed;
    })
    .refine((value) => value === null || Number.isFinite(value), { message });

/**
 * The slug the patient will see in `/book/<slug>`.
 *
 * Empty is allowed and means "use the clinic's own slug instead": the save
 * writes `NULL` and the link builder falls back to `clinic.slug`. That is why
 * the field is not `.min(1)` — requiring a value would force every clinic to
 * invent a second name for the same page.
 */
export const bookingSlugSchema = z
  .string()
  .trim()
  .max(48, "Slug must be 48 characters or fewer.")
  .transform((value) => value.toLowerCase())
  .refine(
    (value) => value === "" || (value.length >= 3 && BOOKING_SLUG_PATTERN.test(value)),
    "Use 3 or more lowercase letters, numbers or hyphens (no spaces).",
  );

/** Slot length offered in the UI. Mirrors the select options in the card. */
export const SLOT_DURATION_MINUTES = [15, 30, 45, 60] as const;

/**
 * Full settings payload from the booking page card.
 *
 * `bookingSlug` is intentionally *not* required to be unique here — uniqueness
 * is a database concern (the partial unique index) and is also surfaced live
 * while typing by the availability check. Validating it twice would make a
 * save fail on a race the user cannot see.
 */
export const bookingSettingsSchema = z.object({
  bookingSlug: bookingSlugSchema,
  isPublicBookingEnabled: booleanField,
  slotDurationMinutes: z.coerce
    .number({ message: "Choose a slot length." })
    .int("Slot length must be a whole number of minutes.")
    .refine((value) => (SLOT_DURATION_MINUTES as readonly number[]).includes(value), {
      message: "Slot length must be 15, 30, 45 or 60 minutes.",
    }),
  /**
   * Null means "no limit". 1–90 days is the range a clinic realistically
   * wants; the public form clamps its date picker to this window.
   */
  maxAdvanceDays: optionalNumberField("Enter a valid number of days.")
    .refine((value) => value === null || (Number.isInteger(value) && value >= 1 && value <= 90), {
      message: "Advance booking must be between 1 and 90 days.",
    })
    .transform((value) => value as number | null),
  autoApproveBookings: booleanField,
});

export type BookingSettingsInput = z.input<typeof bookingSettingsSchema>;
export type BookingSettingsValues = z.output<typeof bookingSettingsSchema>;

/**
 * Live availability check while the user types a slug.
 *
 * Kept separate from the save schema: this runs on a debounce and must not
 * fail the whole form when it errors, so it only validates the slug shape.
 */
export const bookingSlugCheckSchema = z.object({
  slug: bookingSlugSchema,
});

/** Flatten Zod issues into `{ field: message }` for form display. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}
