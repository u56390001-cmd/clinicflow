

import { z } from "zod";

import {
  CLINIC_SLUG_REGEX,
  COMMON_TIMEZONES,
  RESERVED_CLINIC_SLUGS,
  slugify,
  WEEKDAY_ORDER,
} from "@/lib/constants";
import { isValidNaiveDate, todayNaiveUtc } from "@/lib/utils/datetime";
import { PATIENT_PAYMENT_METHODS_UI } from "@/types/database";

/**
 * All server-side input validation lives here. Every Server Action must
 * validate its input with these schemas before touching the database.
 */

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email is required.")
  .email("Enter a valid email address.")
  .max(254, "Email must be 254 characters or fewer.");

const password = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be 72 characters or fewer.");

export const signupSchema = z.object({
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required."),
});

export const forgotPasswordSchema = z.object({
  email,
});

export const resetPasswordSchema = z.object({
  password,
});

/**
 * Clinic creation. `slug` is derived from the clinic name by default so the
 * user never has to think about URL encoding; an explicit slug is optional.
 */
export const clinicSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Clinic name is required.")
      .max(120, "Clinic name must be 120 characters or fewer."),
    slug: z
      .string()
      .trim()
      .transform((value) => (value.length === 0 ? value : slugify(value)))
      .refine((value) => value.length === 0 || CLINIC_SLUG_REGEX.test(value), {
        message:
          "Slug may only contain lowercase letters, numbers and hyphens, and must not start or end with a hyphen.",
      })
      .refine((value) => !RESERVED_CLINIC_SLUGS.has(value), {
        message: "This slug is reserved and cannot be used.",
      }),
    doctorName: z
      .string()
      .trim()
      .max(120, "Doctor name must be 120 characters or fewer.")
      .optional()
      .or(z.literal("")),
    timezone: z
      .string()
      .min(1, "Timezone is required.")
      .max(64, "Timezone must be 64 characters or fewer."),
    phone: z
      .string()
      .trim()
      .max(32, "Phone must be 32 characters or fewer.")
      .optional()
      .or(z.literal("")),
    email,
    address: z
      .string()
      .trim()
      .max(240, "Address must be 240 characters or fewer.")
      .optional()
      .or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    // If the user left the slug blank we derive it from the name and must
    // validate the derived value too (reserved words + format).
    const derived = value.slug.length === 0 ? slugify(value.name) : value.slug;
    if (derived.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slug"],
        message: "A url slug could not be derived from the clinic name.",
      });
      return;
    }
    if (!CLINIC_SLUG_REGEX.test(derived)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slug"],
        message:
          "Slug may only contain lowercase letters, numbers and hyphens.",
      });
    }
    if (RESERVED_CLINIC_SLUGS.has(derived)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slug"],
        message: "This slug is reserved and cannot be used.",
      });
    }
  });

/**
 * Clinic profile editing (Clinic Settings). Same validation as creation.
 *
 * Required: name, doctorName, timezone, phone, email. Optional: `address` —
 * a clinic can operate without a posted address, and forcing one would only
 * teach the doctor to type a placeholder. `slug` may be left blank, in which
 * case it is derived from the clinic name, so it still always resolves to a
 * value (the column is NOT NULL) without the doctor having to invent one.
 *
 * These are application-level requirements only. The `clinics` columns for
 * doctor_name/phone/email stay nullable so that rows written before this
 * change cannot block an owner from completing their profile — the
 * requirement bites when the form is next saved.
 */
export const clinicSettingsSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Clinic name is required.")
      .max(120, "Clinic name must be 120 characters or fewer."),
    slug: z
      .string()
      .trim()
      .transform((value) => (value.length === 0 ? value : slugify(value)))
      .refine((value) => value.length === 0 || CLINIC_SLUG_REGEX.test(value), {
        message:
          "Slug may only contain lowercase letters, numbers and hyphens, and must not start or end with a hyphen.",
      })
      .refine((value) => !RESERVED_CLINIC_SLUGS.has(value), {
        message: "This slug is reserved and cannot be used.",
      }),
    doctorName: z
      .string()
      .trim()
      .min(1, "Doctor name is required.")
      .max(120, "Doctor name must be 120 characters or fewer."),
    timezone: z
      .string()
      .min(1, "Timezone is required.")
      .max(64, "Timezone must be 64 characters or fewer."),
    phone: z
      .string()
      .trim()
      .min(3, "Phone is required.")
      .max(32, "Phone must be 32 characters or fewer."),
    email: email,
    address: z
      .string()
      .trim()
      .max(240, "Address must be 240 characters or fewer.")
      .optional()
      .or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    const derived = value.slug.length === 0 ? slugify(value.name) : value.slug;
    if (derived.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slug"],
        message: "A url slug could not be derived from the clinic name.",
      });
      return;
    }
    if (!CLINIC_SLUG_REGEX.test(derived)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slug"],
        message:
          "Slug may only contain lowercase letters, numbers and hyphens.",
      });
    }
    if (RESERVED_CLINIC_SLUGS.has(derived)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slug"],
        message: "This slug is reserved and cannot be used.",
      });
    }
  });

/**
 * Google review link (Phase 16). Optional — blank clears it. Any valid
 * http(s) URL is accepted (clinics may use shortened/redirect links); there is
 * deliberately NO Google-domain restriction.
 */
export const googleReviewUrlSchema = z
  .object({
    url: z
      .string()
      .trim()
      .max(2048, "The link must be 2048 characters or fewer.")
      .optional()
      .or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    if (!value.url) return;
    let parsed: URL;
    try {
      parsed = new URL(value.url);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "Enter a valid link, e.g. https://g.page/r/…",
      });
      return;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "Enter a valid link starting with http:// or https://",
      });
    }
  });

const durationMinutes = z
  .number({ message: "Duration must be a number of minutes." })
  .refine((value) => Number.isFinite(value), {
    message: "Enter a valid number of minutes.",
  })
  .int("Duration must be a whole number of minutes.")
  .min(1, "Duration must be at least 1 minute.")
  .max(1440, "Duration must be 24 hours (1440 minutes) or fewer.");

const price = z
  .number({ message: "Price must be a number." })
  .min(0, "Price cannot be negative.")
  .max(1_000_000, "Price must be 1,000,000 or less.")
  .refine(
    (value) =>
      Number.isFinite(value) && Math.round(value * 100) / 100 === value,
    {
      message: "Price may have at most two decimal places.",
    },
  );

/**
 * Service create/edit. One schema for both: the edit form submits every
 * field, so the same validation applies. `doctorId` is optional — empty/absent
 * means any doctor can perform the service. Phase 21 adds the detailed field
 * set (category, duration/report-time text, follow-up fee + validity,
 * preparation instructions, consultation mode); every new field is optional
 * or defaulted so legacy clients continue to work.
 */
export const serviceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Service name is required.")
    .max(120, "Service name must be 120 characters or fewer."),
  description: z
    .string()
    .trim()
    .max(600, "Description must be 600 characters or fewer.")
    .optional()
    .or(z.literal("")),
  durationMinutes: durationMinutes,
  price: price,
  // The action coalesces FormData null to "" before parsing.
  doctorId: z
    .string()
    .uuid("Select a valid doctor.")
    .optional()
    .or(z.literal("")),
  status: z.enum(["active", "inactive"], {
    message: "Status must be active or inactive.",
  }),
  category: z
    .enum(["consultation", "service", "diagnostic", "lab_test", "procedure"], {
      message: "Pick a valid service category.",
    })
    .optional()
    .or(z.literal("")),
  durationOrReportTime: z
    .string()
    .trim()
    .max(120, "Duration / report time must be 120 characters or fewer.")
    .optional()
    .or(z.literal("")),
  followUpFee: price.nullable(),
  followUpValidFor: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 730), {
      message:
        "Follow-up validity must be a whole number of days, weeks or months.",
    })
    .optional()
    .or(z.literal("")),
  followUpPeriod: z
    .enum(["days", "weeks", "months"], {
      message: "Pick a follow-up period.",
    })
    .optional()
    .or(z.literal("")),
  preparationInstructions: z
    .string()
    .trim()
    .max(1000, "Preparation instructions must be 1000 characters or fewer.")
    .optional()
    .or(z.literal("")),
  consultationMode: z
    .enum(["single_slot", "shared_window"], {
      message: "Pick a consultation mode.",
    })
    .default("single_slot"),
});

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;
const uuid = (message: string) => z.string().uuid(message);
/** A naive clinic-local datetime from `<input type="datetime-local">`. */
const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a valid date and time.");

/**
 * Doctor create/edit (Phase 10 → 20 full profile). `credentialsText` is the
 * raw form textarea (comma/newline-separated degrees); the action splits it
 * into the JSONB string array. `consultationFee` is null when the field is
 * left blank. Phase 20 adds the full profile: experience, qualifications,
 * registration, contact, follow-up fee/validity, description, signature,
 * slot mode (single_slot/shared_window), window capacity and offered delivery
 * modes (`consultationType`).
 */
export const doctorSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Doctor name is required.")
    .max(120, "Doctor name must be 120 characters or fewer."),
  specialty: z
    .string()
    .trim()
    .max(120, "Specialty must be 120 characters or fewer.")
    .optional()
    .or(z.literal("")),
  credentialsText: z
    .string()
    .trim()
    .max(2000, "Credentials must be 2000 characters or fewer.")
    .optional()
    .or(z.literal("")),
  photoUrl: z
    .string()
    .trim()
    .max(2048, "Photo URL must be 2048 characters or fewer.")
    .optional()
    .or(z.literal("")),
  consultationFee: price.nullable(),
  yearsOfExperience: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 100), {
      message: "Experience must be a whole number of years from 0 to 100.",
    })
    .optional()
    .or(z.literal("")),
  qualification: z
    .string()
    .trim()
    .max(500, "Qualification must be 500 characters or fewer.")
    .optional()
    .or(z.literal("")),
  registrationNumber: z
    .string()
    .trim()
    .max(120, "Registration number must be 120 characters or fewer.")
    .optional()
    .or(z.literal("")),
  email: email.optional().or(z.literal("")),
  phone: z
    .string()
    .trim()
    .min(3, "Phone must be at least 3 characters.")
    .max(32, "Phone must be 32 characters or fewer.")
    .optional()
    .or(z.literal("")),
  followUpFee: price.nullable(),
  followUpValidFor: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 730), {
      message:
        "Follow-up validity must be a whole number of days, weeks or months.",
    })
    .optional()
    .or(z.literal("")),
  followUpPeriod: z
    .enum(["days", "weeks", "months"], {
      message: "Pick a follow-up period.",
    })
    .optional()
    .or(z.literal("")),
  professionalDescription: z
    .string()
    .trim()
    .max(2000, "Professional description must be 2000 characters or fewer.")
    .optional()
    .or(z.literal("")),
  signatureUrl: z
    .string()
    .trim()
    .max(2048, "Signature URL must be 2048 characters or fewer.")
    .optional()
    .or(z.literal("")),
  consultationMode: z
    .enum(["single_slot", "shared_window"], {
      message: "Pick a consultation mode.",
    })
    .default("single_slot"),
  maxPatientsPerWindow: z
    .string()
    .trim()
    .transform((v) => (v === "" ? 1 : Number(v)))
    .refine((v) => Number.isInteger(v) && v >= 1 && v <= 50, {
      message: "Patients per window must be a whole number from 1 to 50.",
    })
    .default(1),
  doctorConsultationType: z
    .enum(["offline", "both", "online"], {
      message: "Pick which consultation types this doctor offers.",
    })
    .default("offline"),
});

/**
 * Per-doctor vitals capture config (Phase 20). Submits as JSON in one hidden
 * form field. `standardVitals` is a subset of the standard vitals keys ([] or
 * null = all standard vitals). `customVitals` are clinic-defined fields;
 * `displayOrder` restores the rendered order across both sets.
 */
const customVitalSchema = z
  .object({
    key: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, "Custom vital key is required.")
      .max(40, "Custom vital key must be 40 characters or fewer.")
      .regex(
        /^[a-z0-9_]+$/,
        "Custom vital keys may only contain a-z, 0-9 and underscores.",
      ),
    label: z
      .string()
      .trim()
      .min(1, "Custom vital label is required.")
      .max(60, "Custom vital label must be 60 characters or fewer."),
    unit: z
      .string()
      .trim()
      .max(20, "Unit must be 20 characters or fewer.")
      .optional()
      .or(z.literal("")),
    placeholder: z
      .string()
      .trim()
      .max(120, "Placeholder must be 120 characters or fewer.")
      .optional()
      .or(z.literal("")),
    type: z
      .enum(["numeric", "text"], { message: "Type must be numeric or text." })
      .optional(),
  })
  .transform((value) => ({
    key: value.key,
    label: value.label,
    unit: value.unit || null,
    placeholder: value.placeholder || null,
    type: value.type ?? "numeric",
  }));

/** The parsed shape of the vitals-config JSON payload. */
const doctorVitalsConfigDataSchema = z.object({
  standardVitals: z
    .array(z.string().trim().min(1).max(40))
    .max(20, "At most 20 standard vitals.")
    .optional(),
  customVitals: z
    .array(customVitalSchema)
    .max(30, "At most 30 custom vitals.")
    .optional(),
  displayOrder: z
    .array(z.string().trim().min(1).max(40))
    .max(50, "Too many display-order entries.")
    .optional(),
});

export const doctorVitalsConfigSchema = z.object({
  doctorId: uuid("Missing doctor id."),
  vitalsConfigJson: z
    .string()
    .transform((val) => {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })
    .pipe(z.array(doctorVitalsConfigDataSchema))
    .transform((entries) => entries[0] ?? {}),
});

/** One named slot template row within the Add/Edit Doctor availability section. */
const slotTemplateSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    slotName: z
      .string()
      .trim()
      .min(1, "Slot name is required.")
      .max(120, "Slot name must be 120 characters or fewer."),
    startTime: z
      .string()
      .regex(TIME_OF_DAY, "Start time must be in HH:MM 24-hour format."),
    endTime: z
      .string()
      .regex(TIME_OF_DAY, "End time must be in HH:MM 24-hour format."),
    // Phase 21 per-slot capacity. NULL/absent = single patient (or the parent's
    // global cap for shared-window doctors). The client sends null in
    // single_slot mode; shared-window slots carry their own 1–50 limit.
    patientLimit: z
      .number()
      .int("Patient limit must be a whole number.")
      .min(1, "Patient limit must be at least 1.")
      .max(50, "Patient limit must be 50 or fewer.")
      .nullable()
      .optional(),
  })
  .superRefine((slot, ctx) => {
    if (slot.endTime <= slot.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "Slot end must be after its start.",
      });
    }
  });

export const doctorSlotTemplatesSchema = z.object({
  doctorId: uuid("Missing doctor id."),
  templatesJson: z
    .string()
    .transform((val) => {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })
    .pipe(
      z
        .array(slotTemplateSchema)
        .max(400, "At most 400 slot templates are allowed."),
    ),
});

/**
 * Service slot templates (Phase 21). Mirrors `doctorSlotTemplatesSchema` —
 * same slot shape including per-slot `patientLimit` — targeting a service.
 */
export const serviceSlotTemplatesSchema = z.object({
  serviceId: uuid("Missing service id."),
  templatesJson: z
    .string()
    .transform((val) => {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })
    .pipe(
      z
        .array(slotTemplateSchema)
        .max(400, "At most 400 slot templates are allowed."),
    ),
});

// ---------------------------------------------------------------------------
// Phase 22: Pre-Consultation Questions
// ---------------------------------------------------------------------------

/** One question row as the Details-tab editor submits it (hidden JSON field). */
export type PreConsultationQuestionInput = {
  id: string;
  displayOrder: number;
  text: string;
};

const questionRowSchema = z.object({
  id: z.string().trim().min(1, "Question id is required."),
  displayOrder: z.number().int().min(0).max(2),
  text: z
    .string()
    .trim()
    .min(1, "Question text is required.")
    .max(100, "Questions must be 100 characters or fewer."),
});

/**
 * Parses + validates the hidden `preConsultationQuestionsJson` field shared by
 * the doctor and service forms. Each timing set ("duringBooking" /
 * "afterBooking") carries its own questions; an omitted or disabled set is an
 * empty list. Each list is re-sorted by `displayOrder` and up to 3 questions
 * in total may be configured. A blank / malformed value degrades to an empty
 * set.
 */
export const preConsultationQuestionsJsonSchema = z
  .string()
  .transform((val) => {
    try {
      const parsed = JSON.parse(val) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  })
  .pipe(
    z
      .object({
        duringBooking: z.array(questionRowSchema).optional(),
        afterBooking: z.array(questionRowSchema).optional(),
      })
      .superRefine((draft, ctx) => {
        const total =
          (draft.duringBooking?.length ?? 0) +
          (draft.afterBooking?.length ?? 0);
        if (total > 3) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["duringBooking"],
            message: "At most 3 questions can be configured.",
          });
        }
      })
      .transform((draft) => ({
        duringBooking: [...(draft.duringBooking ?? [])].sort(
          (a, b) => a.displayOrder - b.displayOrder,
        ),
        afterBooking: [...(draft.afterBooking ?? [])].sort(
          (a, b) => a.displayOrder - b.displayOrder,
        ),
      })),
  );

/** The validated shape read out of `preConsultationQuestionsJsonSchema`. */
export type PreConsultationQuestionsParsed = {
  duringBooking: PreConsultationQuestionInput[];
  afterBooking: PreConsultationQuestionInput[];
};

/**
 * Normalize a form field that may be `null`: a field which is not rendered
 * (conditional UI like the appointment form's patient block) is absent from
 * `FormData` and reads back as `null`. Convert it to `""` so optional fields
 * treat it exactly like an untouched input, instead of failing every union
 * branch and surfacing Zod's opaque default union message ("Invalid input").
 * Server actions should still pass `formData.get(key) ?? ""` as the payload;
 * this makes the schemas null-tolerant regardless of caller.
 */
const formValue = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value == null ? "" : value), schema);

/**
 * One of the past-history narrative fields on `patientSchema`. All six share one
 * shape — optional free text with a length cap — so the cap and the "this may be
 * absent" rule live here rather than being repeated six times.
 */
const pastHistoryText = (label: string) =>
  formValue(
    z
      .string()
      .trim()
      .max(2000, `${label} must be 2000 characters or fewer.`)
      .optional()
      .or(z.literal("")),
  );

/**
 * One day's working hours. Times only matter when the day is enabled: disabled
 * days may send anything (the UI leaves their inputs blank), so validation —
 * HH:MM format, required times, and end-after-start — runs only for enabled
 * days, each with a day-specific message.
 */
const dayRule = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    enabled: z.boolean(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
  })
  .superRefine((rule, ctx) => {
    if (!rule.enabled) return;
    const dayName = WEEKDAY_ORDER[rule.dayOfWeek];
    if (!rule.startTime || !rule.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startTime"],
        message: `Opening and closing times are required for ${dayName}.`,
      });
      return;
    }
    if (!TIME_OF_DAY.test(rule.startTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startTime"],
        message: `Opening time for ${dayName} must be in HH:MM 24-hour format.`,
      });
    }
    if (!TIME_OF_DAY.test(rule.endTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: `Closing time for ${dayName} must be in HH:MM 24-hour format.`,
      });
    }
    // Both values are zero-padded `HH:MM`, so lexicographic comparison is
    // equivalent to chronological.
    if (rule.endTime <= rule.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: `Closing time must be after opening time for ${dayName}.`,
      });
    }
  });

/**
 * Weekly working-hours payload. The availability form submits exactly one
 * rule per weekday as JSON.
 */
export const availabilityPayloadSchema = z.object({
  rules: z
    .array(dayRule)
    .length(7, "All 7 days of the week must be submitted."),
});

/**
 * Organization settings payload for the "Timezone & Working Hours" card: one
 * IANA timezone, the weekdays the clinic opens, and a single opening/closing
 * range shared by every selected day.
 *
 * The timezone is checked against `COMMON_TIMEZONES` rather than accepted as
 * free text, because the value is written straight into `clinics.timezone` and
 * later handed to the date library as an IANA zone — an arbitrary string there
 * would throw at appointment-scheduling time, not at save time.
 */
export const timezoneWorkingHoursSchema = z
  .object({
    timezone: z
      .string()
      .trim()
      .min(1, "Timezone is required.")
      .max(64, "Timezone must be 64 characters or fewer.")
      .refine(
        (value) => (COMMON_TIMEZONES as readonly string[]).includes(value),
        { message: "Choose a timezone from the list." },
      ),
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1, "Select at least one working day."),
    startTime: z
      .string()
      .regex(TIME_OF_DAY, "Opening time must be in HH:MM 24-hour format."),
    endTime: z
      .string()
      .regex(TIME_OF_DAY, "Closing time must be in HH:MM 24-hour format."),
  })
  .refine((value) => value.endTime > value.startTime, {
    path: ["endTime"],
    message: "Closing time must be after opening time.",
  });

/**
 * Organization settings → Patient ID tab.
 *
 * `prefix` mirrors the `clinics_patient_code_prefix_check` constraint added in
 * migration 0029 (`^[A-Z]{2,6}$`) exactly, so a value that passes here can
 * never be rejected by the database and surface as a raw constraint violation.
 * Normalising to uppercase first means the field tolerates a lowercase entry
 * rather than making the owner retype it.
 *
 * `format` must match `clinics_patient_code_format_check` from migration 0055.
 */
export const patientCodeSettingsSchema = z.object({
  prefix: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(
      z
        .string()
        .regex(/^[A-Z]{2,6}$/, "Prefix must be 2 to 6 letters, A–Z only."),
    ),
  format: z.enum(["sequence", "year_sequence"], {
    message: "Choose an ID format.",
  }),
});

/**
 * A single form value standing in for a boolean.
 *
 * `z.coerce.boolean()` is deliberately not used: it runs `Boolean(value)`, and
 * `Boolean("false")` is `true`, so a hidden field carrying `"false"` would be
 * read as ON — the switch would appear to save nothing while flipping it on.
 */
const booleanField = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

/**
 * GSTIN: 2 digit state code, 10 char PAN, entity digit, literal `Z`, checksum.
 * Matches the `08ABCDE1234F1Z5` example in the settings markup. Upper-cased and
 * whitespace-stripped first so a pasted value with spaces is accepted.
 */
const gstNumberField = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase().replace(/\s+/g, ""))
  .refine(
    (value) =>
      value === "" ||
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(value),
    {
      message: "Enter a valid GST number, e.g. 08ABCDE1234F1Z5.",
    },
  );

/**
 * Organization settings → Billing (migration 0056).
 *
 * The two prefixes mirror `clinics_bill_number_prefix_check` and
 * `clinics_receipt_prefix_check` exactly. GST fields are only validated when
 * `show_gst_on_receipt` is on, so a clinic that keeps GST off is not forced to
 * supply a number it never displays — while still catching a typo the moment
 * they switch it on.
 */
export const billingSettingsSchema = z
  .object({
    billNumberPrefix: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .pipe(
        z
          .string()
          .regex(/^[A-Z]{2,6}$/, "Prefix must be 2 to 6 letters, A–Z only."),
      ),
    receiptPrefix: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .pipe(
        z
          .string()
          .regex(/^[A-Z]{2,6}$/, "Prefix must be 2 to 6 letters, A–Z only."),
      ),
    autoSendWhatsappReceipt: booleanField,
    receiptFooterMessage: z
      .string()
      .trim()
      .max(200, "Keep the footer under 200 characters."),
    showGstOnReceipt: booleanField,
    gstNumber: gstNumberField,
    gstRate: z.coerce
      // Zod 4 renamed `invalid_type_error` to `error`.
      .number({ error: "Enter a GST rate." })
      .min(0, "GST rate cannot be negative.")
      .max(100, "GST rate cannot exceed 100."),
    billTerms: z.string().max(20000, "Terms are too long."),
  })
  .superRefine((value, ctx) => {
    if (!value.showGstOnReceipt) return;

    if (!value.gstNumber) {
      ctx.addIssue({
        code: "custom",
        path: ["gstNumber"],
        message: "GST number is required when GST is shown on receipts.",
      });
    }
    // The markup ships the rate as 18 with the helper "SGST 9.0% + CGST 9.0%",
    // i.e. the stored value is the TOTAL, split evenly for display.
    if (Number.isNaN(value.gstRate)) {
      ctx.addIssue({
        code: "custom",
        path: ["gstRate"],
        message: "Enter a GST rate.",
      });
    }
  });

/** Maximum words allowed in bill terms, per the billing settings markup. */
export const BILL_TERMS_MAX_WORDS = 1000;

/**
 * Word count used by the "N/1000 words" counter. Matches `split(/\s+/)` so the
 * count on screen agrees with the server-side limit rather than drifting.
 */
export function countWords(value: string): number {
  const trimmed = value.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Organization settings → Prescription (migration 0057).
 *
 * One boolean today, but the tab is the natural home for later print
 * preferences too, so it is validated as an object rather than read as a bare
 * form value.
 */
export const prescriptionSettingsSchema = z.object({
  showPrescriptionHeader: booleanField,
});


/**
 * Field limits for a catalogue medicine.
 *
 * `name` is bounded by the longest thing anyone types into a drug box —
 * "Paracetamol + Ibuprofen + Caffeine" — rather than by the database, which has
 * no limit on a `text` column. An unbounded name would let one pasted paragraph
 * become a row that no longer fits the list row it is rendered in.
 *
 * The DB CHECK is `btrim(name) <> ''`; the `.trim()` here plus `.min(1)` is the
 * same rule in Zod, so a whitespace-only name is caught before the round trip.
 */
export const MEDICINE_NAME_MAX = 120;
export const MEDICINE_STRENGTH_MAX = 60;
export const MEDICINE_CATEGORY_MAX = 60;

/** One medicine as the Manage Medicines form submits it. */
export const medicineSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the medicine name.")
    .max(
      MEDICINE_NAME_MAX,
      `Keep the name under ${MEDICINE_NAME_MAX} characters.`,
    ),
  strength: z.string().trim().max(MEDICINE_STRENGTH_MAX),
  category: z.string().trim().max(MEDICINE_CATEGORY_MAX),
  isActive: booleanField,
});

/**
 * How the Manage Medicines list is filtered. `all` is the only value that can
 * reach the server without a filter, so the query builder can treat a missing
 * value as "active only" rather than "everything".
 */
export const medicineFilterSchema = z.enum(["active", "inactive", "all"]);

/**
 * Patient create/edit. One schema for both: the edit form submits every
 * field. Email/phone are optional but format-validated when present (the DB
 * CHECK constraints mirror these limits). `dateOfBirth` is an optional
 * `YYYY-MM-DD` that must be a real calendar date and not in the future (the DB
 * CHECK `patients_dob_not_future` enforces the same rule).
 */
export const patientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Patient name is required.")
    .max(120, "Patient name must be 120 characters or fewer."),
  email: email.optional().or(z.literal("")),
  phone: z
    .string()
    .trim()
    .min(3, "Phone must be at least 3 characters.")
    .max(32, "Phone must be 32 characters or fewer.")
    .optional()
    .or(z.literal("")),
  notes: z
    .string()
    .trim()
    .max(4000, "Notes must be 4000 characters or fewer.")
    .optional()
    .or(z.literal("")),
  dateOfBirth: formValue(
    z
      .string()
      .trim()
      .refine((value) => value === "" || isValidNaiveDate(value), {
        message: "Date of birth must be a valid date.",
      })
      .refine((value) => value === "" || value <= todayNaiveUtc(), {
        message: "Date of birth can't be in the future.",
      })
      .optional()
      .or(z.literal("")),
  ),
  // ── Expanded booking/health fields (0027–0029, 0039) ─────────────────────
  // All optional so existing quick-create callers (billing modals, appointment
  // inline create) keep working unchanged.
  age: formValue(
    z
      .string()
      .trim()
      .refine((value) => value === "" || /^\d{1,3}$/.test(value.trim()), {
        message: "Age must be a whole number.",
      })
      .refine((value) => value === "" || Number(value) <= 150, {
        message: "Age must be 150 or younger.",
      })
      .optional()
      .or(z.literal("")),
  ),
  gender: formValue(
    z.enum(["male", "female", "other"]).optional().or(z.literal("")),
  ),
  city: formValue(
    z
      .string()
      .trim()
      .max(100, "City must be 100 characters or fewer.")
      .optional()
      .or(z.literal("")),
  ),
  bloodGroup: formValue(
    z
      .enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
      .optional()
      .or(z.literal("")),
  ),
  knownAllergies: formValue(
    z
      .string()
      .trim()
      .max(2000, "Allergies must be 2000 characters or fewer.")
      .optional()
      .or(z.literal("")),
  ),
  medicalConditions: formValue(
    z
      .string()
      .trim()
      .max(2000, "Medical conditions must be 2000 characters or fewer.")
      .optional()
      .or(z.literal("")),
  ),
  height: formValue(
    z
      .string()
      .trim()
      .refine(
        (value) =>
          value === "" ||
          (/^\d{1,3}$/.test(value.trim()) &&
            Number(value) >= 30 &&
            Number(value) <= 300),
        { message: "Height must be 30–300 cm." },
      )
      .optional()
      .or(z.literal("")),
  ),
  weight: formValue(
    z
      .string()
      .trim()
      .refine(
        (value) =>
          value === "" ||
          (/^\d{1,3}(\.\d{1,2})?$/.test(value.trim()) &&
            Number(value) >= 1 &&
            Number(value) <= 500),
        { message: "Weight must be 1–500 kg." },
      )
      .optional()
      .or(z.literal("")),
  ),
  currentMeds: formValue(
    z
      .string()
      .trim()
      .max(2000, "Current medications must be 2000 characters or fewer.")
      .optional()
      .or(z.literal("")),
  ),
  // ── Past-history narrative (0046) ────────────────────────────────────────
  // Six free-text answers captured once at intake and read on every visit.
  // Optional throughout so quick-create callers (billing modals, appointment
  // inline create) that submit none of them keep validating unchanged.
  pastIllnesses: pastHistoryText("Past illnesses"),
  pastSurgeries: pastHistoryText("Past surgeries"),
  hospitalizations: pastHistoryText("Hospitalizations"),
  familyHistory: pastHistoryText("Family history"),
  personalHistory: pastHistoryText("Personal history"),
  immunizationHistory: pastHistoryText("Immunization history"),
});

/**
 * Appointment creation. The user either picks an existing patient
 * (`patientId`) or quick-creates one inline (`patientName`/`patientEmail`/
 * `patientPhone`); one of the two paths is required.
 *
 * Format contract: `start` is a naive clinic-local `YYYY-MM-DDTHH:mm`
 * (`<input type="datetime-local">`, produced by `lib/utils/datetime.ts` /
 * `lib/time.ts`); it is converted to UTC timestamptz by the action. All other
 * fields come straight from FormData, where an unrendered conditional field is
 * `null` — `formValue` normalizes that to `""`.
 *
 * Emergency Mode (Phase 15) is an explicit, scoped exception for rapid
 * walk-in intake: only the patient remains strictly required — `serviceId`
 * may be empty (the action falls back to the clinic's walk-in consultation
 * service) and the doctor choice is not enforced. Normal mode is unchanged.
 */
export const appointmentCreateSchema = z
  .object({
    patientId: formValue(
      uuid("Select a patient.").optional().or(z.literal("")),
    ),
    patientName: formValue(
      z
        .string()
        .trim()
        .min(1, "Patient name is required.")
        .max(120, "Patient name must be 120 characters or fewer.")
        .optional()
        .or(z.literal("")),
    ),
    patientEmail: formValue(email.optional().or(z.literal(""))),
    patientPhone: formValue(
      z
        .string()
        .trim()
        .min(3, "Phone must be at least 3 characters.")
        .max(32, "Phone must be 32 characters or fewer.")
        .optional()
        .or(z.literal("")),
    ),
    patientAge: formValue(
      z.string().trim().max(4).optional().or(z.literal("")),
    ),
    patientGender: formValue(
      z.string().trim().max(10).optional().or(z.literal("")),
    ),
    patientCity: formValue(
      z.string().trim().max(100).optional().or(z.literal("")),
    ),
    knownAllergies: formValue(
      z
        .string()
        .trim()
        .max(2000, "Allergies must be 2000 characters or fewer.")
        .optional()
        .or(z.literal("")),
    ),
    medicalConditions: formValue(
      z
        .string()
        .trim()
        .max(2000, "Medical conditions must be 2000 characters or fewer.")
        .optional()
        .or(z.literal("")),
    ),
    serviceId: formValue(
      uuid("Select a valid service.").optional().or(z.literal("")),
    ),
    doctorId: formValue(
      uuid("Select a valid doctor.").optional().or(z.literal("")),
    ),
    start: localDateTime,
    notes: formValue(
      z
        .string()
        .trim()
        .max(1000, "Notes must be 1000 characters or fewer.")
        .optional()
        .or(z.literal("")),
    ),
    consultationType: formValue(
      z.enum(["in_clinic", "online", "video"]).optional().or(z.literal("")),
    ),
    bookingSource: formValue(z.string().max(32).optional().or(z.literal(""))),
    /** FormData checkbox: present ("true") only when Emergency Mode is on. */
    emergencyMode: formValue(z.string().max(8).optional().or(z.literal(""))),
  })
  .superRefine((value, ctx) => {
    if (!value.patientId && !value.patientName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["patientName"],
        message: "Choose an existing patient or enter a new patient's name.",
      });
    }
    const emergency = value.emergencyMode === "true";
    if (!emergency && !value.serviceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["serviceId"],
        message: "Select a service.",
      });
    }
  });

/**
 * Appointment status changes. `pending` is only ever the creation default,
 * never a target of an explicit change.
 */
export const appointmentStatusChangeSchema = z.object({
  appointmentId: uuid("Missing appointment id."),
  status: z.enum(["confirmed", "cancelled", "completed", "no_show"], {
    message: "Invalid status change.",
  }),
});

/** Reschedule to a new start datetime (duration is re-derived from the service). */
export const rescheduleSchema = z.object({
  appointmentId: uuid("Missing appointment id."),
  start: localDateTime,
});

/**
 * Full appointment edit (Phase 56 "Edit Appointment"). Mirrors the create
 * fields but targets an existing appointment. The linked patient and the
 * appointment's service/doctor/time/notes/consultation-type may all change.
 */
export const appointmentUpdateSchema = appointmentCreateSchema.extend({
  appointmentId: uuid("Missing appointment id."),
});

/**
 * Blocked time payload. `start`/`end` are naive clinic-local datetimes
 * (`YYYY-MM-DDTHH:mm` from a `<input type="datetime-local">`) converted to
 * UTC for storage. End must be after start.
 */
export const blockedTimeSchema = z
  .object({
    start: localDateTime.describe("start"),
    end: localDateTime.describe("end"),
    reason: z
      .string()
      .trim()
      .max(240, "Reason must be 240 characters or fewer.")
      .optional()
      .or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    if (value.end <= value.start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end"],
        message: "Blocked end must be after its start.",
      });
    }
  });

/**
 * One FAQ knowledge entry as persisted in `clinic_ai_settings.faqs`.
 * `id`/`active`/`is_custom` are optional on input (legacy clients may omit
 * them) and always filled in on output: missing ids get a fresh uuid,
 * entries default to active, and unflagged entries count as custom since
 * anything a clinic saves through the form is doctor-authored.
 */
const faqEntry = z
  .object({
    id: z.string().uuid("FAQ id must be a valid identifier.").optional(),
    question: z
      .string()
      .trim()
      .min(1, "FAQ question can't be empty.")
      .max(240, "FAQ question must be 240 characters or fewer."),
    answer: z
      .string()
      .trim()
      .min(1, "FAQ answer can't be empty.")
      .max(2000, "FAQ answer must be 2000 characters or fewer."),
    active: z.boolean().optional(),
    is_custom: z.boolean().optional(),
  })
  .transform((value) => ({
    id: value.id ?? Math.random().toString(36).slice(2,10),
    question: value.question,
    answer: value.answer,
    active: value.active ?? true,
    is_custom: value.is_custom ?? true,
  }))
  .refine((value) => value.question.length > 0 && value.answer.length > 0, {
    message: "Each FAQ needs both a question and an answer.",
  });

/**
 * AI Receptionist settings (Phase 5). These are the knowledge + behavior
 * knobs the model reads from the database each turn — never baked into the
 * system prompt at build time. FAQ entries are persisted in the full
 * knowledge-entry shape {id, question, answer, active, is_custom}; pairs
 * with an empty question or answer are dropped so the DB CHECK constraint
 * stays satisfied.
 */
export const aiSettingsSchema = z.object({
  enabled: z.boolean(),
  agentName: z
    .string()
    .trim()
    .min(1, "Agent name is required.")
    .max(120, "Agent name must be 120 characters or fewer."),
  welcomeMessage: z
    .string()
    .trim()
    .max(240, "Welcome message must be 240 characters or fewer.")
    .optional()
    .or(z.literal("")),
  // Shared cross-channel tone (internal chat, widget, WhatsApp — Phase 12).
  tone: z.enum(["professional", "friendly", "casual", "empathetic"], {
    message: "Pick a tone.",
  }),
  // Phase 12 — WhatsApp channel toggle (independent of enabled/isActivated).
  whatsappEnabled: z.boolean(),
  // Stored preference; menu-based chatbot logic is not implemented yet.
  agentTier: z.enum(["chatbot", "ai_agent"], {
    message: "Pick an agent tier.",
  }),
  greetingStyle: z.enum(["custom_template", "ai_generated"], {
    message: "Pick a greeting style.",
  }),
  clinicDescription: z
    .string()
    .trim()
    .max(1000, "Clinic description must be 1000 characters or fewer.")
    .optional()
    .or(z.literal("")),
  bookingRules: z
    .string()
    .trim()
    .max(2000, "Booking rules must be 2000 characters or fewer.")
    .optional()
    .or(z.literal("")),
  cancellationPolicyText: z
    .string()
    .trim()
    .max(2000, "Cancellation policy must be 2000 characters or fewer.")
    .optional()
    .or(z.literal("")),
  faqs: z
    .array(faqEntry)
    .max(20, "At most 20 FAQs are allowed.")
    .transform((entries) =>
      entries.filter(
        (entry) => entry.question.length > 0 && entry.answer.length > 0,
      ),
    ),
  requiredPatientFields: z
    .array(z.enum(["name", "email", "phone"]))
    .max(3)
    .transform((fields) => (fields.length === 0 ? ["name"] : fields)),
  // Widget appearance fields (Phase 6)
  isActivated: z.boolean(),
  widgetColor: z
    .string()
    .trim()
    .regex(
      /^#[0-9A-Fa-f]{6}$/,
      "Color must be a valid hex color (e.g. #0D9488).",
    ),
  widgetPosition: z.enum(["bottom-right", "bottom-left"], {
    message: "Position must be bottom-right or bottom-left.",
  }),
  widgetAvatarUrl: z
    .string()
    .trim()
    .url("Avatar URL must be a valid URL.")
    .max(500, "Avatar URL must be 500 characters or fewer.")
    .optional()
    .or(z.literal("")),
  widgetHeaderSubtitle: z
    .string()
    .trim()
    .max(120, "Subtitle must be 120 characters or fewer.")
    .optional()
    .or(z.literal("")),
  // Phase 8 — LLM provider selection and BYO-API-key
  llmProvider: z.enum(["google", "openai", "anthropic"], {
    message: "Select an LLM provider.",
  }),
  llmModel: z
    .string()
    .trim()
    .max(100, "Model ID must be 100 characters or fewer.")
    .optional()
    .or(z.literal("")),
  llmApiKey: z
    .string()
    .trim()
    .min(10, "API key is required and must be at least 10 characters.")
    .max(500, "API key must be 500 characters or fewer.")
    .optional()
    .or(z.literal("")),
});

// ---------------------------------------------------------------------------
// Website Builder (Phase 7)
// ---------------------------------------------------------------------------

const websiteSectionSchema = z.object({
  id: z.enum([
    "hero",
    "doctors",
    "about",
    "services",
    "booking",
    "gallery",
    "experience",
    "faq",
    "contact",
  ]),
  label: z.string(),
  visible: z.boolean(),
  order: z.number().int().min(0).max(20),
});

/** One short line of copy. The 120 cap is what stops a pasted paragraph landing
 *  in a stat tile, and it is the same cap the FAQ answers use. */
const shortText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer.`);

/** Schema for saving the full website config from the builder. */
export const websiteSaveSchema = z.object({
  template: z.enum(["classic", "modern", "minimal"], {
    message: "Template must be classic, modern, or minimal.",
  }),
  content: z.object({
    hero: z.object({
      headline: shortText(200, "Headline"),
      description: shortText(1000, "Description"),
      ctaText: shortText(60, "CTA text"),
      ctaUrl: shortText(500, "CTA URL").optional().or(z.literal("")),
      ctaSecondaryLabel: shortText(60, "Secondary CTA text")
        .optional()
        .or(z.literal("")),
    }),
    doctors: z.object({
      title: shortText(120, "Doctors heading"),
      description: shortText(600, "Doctors description"),
      limit: z.number().int().min(1, "Show at least one doctor.").max(24),
      ctaText: shortText(60, "Doctors CTA text"),
    }),
    about: z.object({
      title: shortText(120, "About heading"),
      bio: shortText(5000, "Biography"),
      credentials: shortText(2000, "Credentials"),
      certifications: z
        .array(shortText(120, "Certification").min(1, "Certification cannot be empty."))
        .max(20, "At most 20 certifications are allowed.")
        .optional(),
      facilities: z
        .array(shortText(120, "Facility").min(1, "Facility cannot be empty."))
        .max(12, "At most 12 facilities are allowed.")
        .optional(),
    }),
    booking: z.object({
      title: shortText(120, "Booking heading"),
      description: shortText(600, "Booking description"),
      ctaText: shortText(60, "Booking CTA text"),
      showNextSlot: z.boolean(),
    }),
    experience: z.object({
      title: shortText(120, "Experience heading"),
      yearsLabel: shortText(80, "Experience label"),
      stats: z
        .array(
          z.object({
            value: shortText(20, "Stat value"),
            label: shortText(60, "Stat label"),
          }),
        )
        .max(4, "At most 4 statistics are allowed."),
    }),
    faq: z.object({
      title: shortText(120, "Questions heading"),
      items: z
        .array(
          z.object({
            id: z.string().trim().min(1).max(40),
            question: shortText(200, "Question"),
            answer: shortText(1500, "Answer"),
          }),
        )
        .max(12, "At most 12 questions are allowed."),
    }),
    contact: z.object({
      title: shortText(120, "Contact heading"),
      showPhone: z.boolean(),
      showEmail: z.boolean(),
      showAddress: z.boolean(),
      showHours: z.boolean(),
      bookingCtaText: shortText(60, "Booking CTA text"),
      mapEmbedUrl: shortText(1000, "Map embed URL")
        .refine((url) => url === "" || url.startsWith("https://"), {
          message: "Map embed URL must be a https:// embed URL.",
        })
        .optional()
        .or(z.literal("")),
    }),
    sections: z
      .array(websiteSectionSchema)
      .min(1, "Keep at least one section on the page.")
      .max(9, "A page cannot hold more than 9 sections."),
  }),
  theme: z.object({
    primaryColor: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex color."),
    textColor: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex color."),
    fontFamily: shortText(60, "Font family"),
    headingFont: z.enum(["same", "serif", "wide", "humanist"]),
    buttonStyle: z.enum(["solid", "soft", "outline", "inverse"]),
    cornerStyle: z.enum(["sharp", "soft", "round"]),
    logoUrl: shortText(1000, "Logo URL")
      .refine((url) => url === "" || /^https?:\/\//.test(url), {
        message: "Logo must be an http(s) URL.",
      })
      .optional()
      .or(z.literal("")),
    showHeader: z.boolean(),
    alignment: z.enum(["left", "center"]),
  }),
  widget: z.object({
    enabled: z.boolean(),
    position: z.enum(["bottom-right", "bottom-left"]),
    language: z.enum(["en", "ur", "ar"]),
    colorMode: z.enum(["brand", "custom"]),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex color."),
  }),
  seo: z.object({
    title: shortText(70, "Page title").optional().or(z.literal("")),
    description: shortText(180, "Page description").optional().or(z.literal("")),
    keywords: shortText(200, "Keywords").optional().or(z.literal("")),
    ogImage: shortText(1000, "Sharing image")
      .refine((url) => url === "" || /^https?:\/\//.test(url), {
        message: "Sharing image must be an http(s) URL.",
      })
      .optional()
      .or(z.literal("")),
    noindex: z.boolean(),
  }),
  locale: z.object({
    language: z.enum(["en", "ur", "ar"]),
    direction: z.enum(["ltr", "rtl"]),
  }),
});

/**
 * Custom domain claim. The hostname is normalised to lowercase and trimmed by
 * the caller; this schema only enforces shape and rejects a wildcard or a bare
 * TLD, both of which would resolve nowhere.
 */
export const websiteDomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .max(253, "Domain must be 253 characters or fewer.")
    .regex(
      /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/,
      "Enter a domain like drsmithclinic.com — without https:// or a path.",
    ),
});

/** Schema for changing website publish status. */
export const websitePublishSchema = z.object({
  status: z.enum(["draft", "published", "unpublished"], {
    message: "Status must be draft, published, or unpublished.",
  }),
});

/** Schema for image upload metadata. */
export const websiteImageSchema = z.object({
  kind: z.enum(["hero", "doctor", "gallery"]),
  alt: z
    .string()
    .trim()
    .max(200, "Alt text must be 200 characters or fewer.")
    .optional()
    .or(z.literal("")),
});

/** Schema for reordering images. */
export const websiteImageReorderSchema = z.object({
  imageIds: z.array(z.string().uuid()).min(1),
});

// ---------------------------------------------------------------------------
// Billing (Phase 9)
// ---------------------------------------------------------------------------

export const paymentSubmissionSchema = z.object({
  amount: z
    .number({ message: "Amount must be a number." })
    .positive("Amount must be greater than zero.")
    .max(10_000_000, "Amount is too large."),
  senderName: z
    .string()
    .trim()
    .min(1, "Sender name is required.")
    .max(120, "Sender name must be 120 characters or fewer."),
  senderPhone: z
    .string()
    .trim()
    .min(3, "Phone must be at least 3 characters.")
    .max(32, "Phone must be 32 characters or fewer."),
  transactionReference: z
    .string()
    .trim()
    .min(1, "Transaction reference is required.")
    .max(120, "Reference must be 120 characters or fewer."),
  paymentMethodId: uuid("Select a payment method."),
  notes: z
    .string()
    .trim()
    .max(4000, "Notes must be 4000 characters or fewer.")
    .optional()
    .or(z.literal("")),
});

export const paymentMethodSchema = z.object({
  id: uuid("").optional().or(z.literal("")),
  type: z.enum(["bank_transfer", "jazzcash", "easypaisa", "other"], {
    message: "Select a payment method type.",
  }),
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(120, "Name must be 120 characters or fewer."),
  accountTitle: z
    .string()
    .trim()
    .min(1, "Account title is required.")
    .max(120, "Account title must be 120 characters or fewer."),
  accountNumber: z
    .string()
    .trim()
    .min(1, "Account number is required.")
    .max(64, "Account number must be 64 characters or fewer."),
  iban: z
    .string()
    .trim()
    .max(64, "IBAN must be 64 characters or fewer.")
    .optional()
    .or(z.literal("")),
  instructions: z
    .string()
    .trim()
    .max(2000, "Instructions must be 2000 characters or fewer.")
    .optional()
    .or(z.literal("")),
  active: z.boolean(),
  sortOrder: z
    .number({ message: "Sort order must be a number." })
    .int("Sort order must be a whole number.")
    .min(0, "Sort order cannot be negative.")
    .max(1000, "Sort order is too large."),
});

export const rejectionSchema = z.object({
  submissionId: uuid("Missing submission id."),
  reason: z
    .string()
    .trim()
    .min(1, "Rejection reason is required.")
    .max(4000, "Reason must be 4000 characters or fewer."),
});

export const submissionStatusFilterSchema = z.object({
  status: z
    .enum(["pending", "approved", "rejected"], {
      message: "Invalid status filter.",
    })
    .optional()
    .or(z.literal("")),
});

/* -------------------------------------------------------------------------- */
/*  Team management (Phase 9)                                                 */
/* -------------------------------------------------------------------------- */

export const teamInviteSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .email("Enter a valid email address.")
    .max(254, "Email must be 254 characters or fewer.")
    .transform((value) => value.toLowerCase()),
  role: z.enum(
    ["admin", "clinic_admin", "doctor", "receptionist", "nurse", "accountant", "staff"],
    { message: "Choose a role for the new member." },
  ),
});

export const memberRoleChangeSchema = z.object({
  memberId: uuid("Missing member id."),
  role: z.enum(
    [
      "owner",
      "admin",
      "clinic_admin",
      "doctor",
      "receptionist",
      "nurse",
      "accountant",
      "staff",
    ],
    { message: "Choose a valid role." },
  ),
});

export const memberRemovalSchema = z.object({
  memberId: uuid("Missing member id."),
});

export const inviteRevokeSchema = z.object({
  inviteId: uuid("Missing invite id."),
});

/* -------------------------------------------------------------------------- */
/*  Fast-track onboarding + staff invites (migration 0074)                    */
/* -------------------------------------------------------------------------- */

/** Roles a fresh clinic can hand out during onboarding / from the team page. */
const assignableRole = z.enum(
  ["clinic_admin", "doctor", "receptionist", "nurse", "accountant", "admin", "staff"],
  { message: "Choose a role for the new member." },
);

const inviteEmail = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .email("Enter a valid email address.")
  .max(254, "Email must be 254 characters or fewer.")
  .transform((value) => value.toLowerCase());

const optionalContactEmail = z.union([email, z.literal("")]).optional();

export const staffInviteSchema = z.object({
  email: inviteEmail,
  role: assignableRole,
});

export const onboardingInviteSchema = z.object({
  email: inviteEmail,
  role: assignableRole,
});

/**
 * One payload for the whole wizard: the clinic's shape and details plus the
 * optional first batch of staff invites. Keeping it a single schema means the
 * wizard is validated in one pass and the action can never half-apply a step.
 */
export const onboardingClinicSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Clinic name is required.")
    .max(120, "Clinic name must be 120 characters or fewer."),
  organizationType: z.enum(["clinic", "polyclinic", "hospital"], {
    message: "Choose what you're setting up.",
  }),
  facilitySize: z.enum(["single_location", "multi_branch"], {
    message: "Choose whether you have one location or several.",
  }),
  timezone: z
    .string()
    .min(1, "Timezone is required.")
    .max(64, "Timezone must be 64 characters or fewer."),
  phone: z
    .string()
    .trim()
    .max(32, "Phone must be 32 characters or fewer.")
    .optional()
    .or(z.literal("")),
  email: optionalContactEmail,
  address: z
    .string()
    .trim()
    .max(240, "Address must be 240 characters or fewer.")
    .optional()
    .or(z.literal("")),
  city: z
    .string()
    .trim()
    .max(120, "City must be 120 characters or fewer.")
    .optional()
    .or(z.literal("")),
  invites: z
    .array(onboardingInviteSchema)
    .max(10, "You can invite up to 10 people at a time.")
    .optional(),
});

export type OnboardingClinicInput = z.infer<typeof onboardingClinicSchema>;
export type OnboardingInviteInput = z.infer<typeof onboardingInviteSchema>;

// ---------------------------------------------------------------------------
// Phase 17: Check-In / Queue / Vitals
// ---------------------------------------------------------------------------

/** Check-in action: appointment id + payment status. */
export const checkInSchema = z.object({
  appointmentId: uuid("Missing appointment id."),
  paymentStatus: z.enum(
    ["pending", "collected_pre", "collected_post", "not_required"],
    {
      message: "Select a payment status.",
    },
  ),
});

/** Record vitals for a visit. All fields optional (partial vitals capture). */
export const vitalsSchema = z.object({
  visitId: uuid("Missing visit id."),
  bloodPressure: z
    .string()
    .trim()
    .max(32, "Blood pressure must be 32 characters or fewer.")
    .optional()
    .or(z.literal("")),
  systolicBp: z
    .number({ message: "Systolic BP must be a number." })
    .int("Systolic BP must be a whole number.")
    .min(50, "Systolic BP must be at least 50.")
    .max(300, "Systolic BP must be at most 300.")
    .optional()
    .or(z.literal("")),
  diastolicBp: z
    .number({ message: "Diastolic BP must be a number." })
    .int("Diastolic BP must be a whole number.")
    .min(20, "Diastolic BP must be at least 20.")
    .max(200, "Diastolic BP must be at most 200.")
    .optional()
    .or(z.literal("")),
  temperature: z
    .number({ message: "Temperature must be a number." })
    .min(85, "Temperature must be at least 85°F.")
    .max(115, "Temperature must be at most 115°F.")
    .optional()
    .or(z.literal("")),
  pulse: z
    .number({ message: "Pulse must be a number." })
    .int("Pulse must be a whole number.")
    .min(30, "Pulse must be at least 30.")
    .max(300, "Pulse must be at most 300.")
    .optional()
    .or(z.literal("")),
  weight: z
    .number({ message: "Weight must be a number." })
    .positive("Weight must be positive.")
    .max(500, "Weight must be at most 500.")
    .optional()
    .or(z.literal("")),
  height: z
    .number({ message: "Height must be a number." })
    .positive("Height must be positive.")
    .max(300, "Height must be at most 300.")
    .optional()
    .or(z.literal("")),
  spo2: z
    .number({ message: "SpO2 must be a number." })
    .int("SpO2 must be a whole number.")
    .min(0, "SpO2 must be at least 0.")
    .max(100, "SpO2 must be at most 100.")
    .optional()
    .or(z.literal("")),
  respiratoryRate: z
    .number({ message: "Respiratory rate must be a number." })
    .int("Respiratory rate must be a whole number.")
    .min(4, "Respiratory rate must be at least 4.")
    .max(60, "Respiratory rate must be at most 60.")
    .optional()
    .or(z.literal("")),
  bloodSugar: z
    .number({ message: "Blood sugar must be a number." })
    .positive("Blood sugar must be positive.")
    .max(800, "Blood sugar must be at most 800.")
    .optional()
    .or(z.literal("")),
});

/** Reorder queue: visit id + new position. */
export const reorderQueueSchema = z.object({
  visitId: uuid("Missing visit id."),
  newPosition: z
    .number({ message: "Position must be a number." })
    .int("Position must be a whole number.")
    .min(1, "Position must be at least 1."),
});

// ---------------------------------------------------------------------------
// Phase 18: Consultation / Prescription
// ---------------------------------------------------------------------------

/** Start consultation on a waiting visit. */
export const startConsultationSchema = z.object({
  visitId: uuid("Missing visit id."),
});

/** Complete current consultation and advance to next patient. */
export const completeAndAdvanceSchema = z.object({
  visitId: uuid("Missing visit id."),
});

const medicineEntrySchema = z.object({
  name: z.string().trim().min(1, "Medicine name is required.").max(200),
  route: z.string().trim().max(100).optional().or(z.literal("")),
  form: z.string().trim().max(100).optional().or(z.literal("")),
  frequency: z.string().trim().max(100).optional().or(z.literal("")),
  duration: z.string().trim().max(100).optional().or(z.literal("")),
  unit: z.string().trim().max(100).optional().or(z.literal("")),
  instructions: z.string().trim().max(500).optional().or(z.literal("")),
});

const labOrderEntrySchema = z.object({
  test_name: z.string().trim().min(1, "Test name is required.").max(200),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  /**
   * Panel parameters, capped at 40: the widest panel here is LFT at 8, and a
   * payload far past that is a malformed client, not a doctor selecting tests.
   */
  sub_parameters: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
});

/** Save or update a prescription for a visit. */
export const savePrescriptionSchema = z.object({
  visitId: uuid("Missing visit id."),
  chiefComplaint: z
    .string()
    .trim()
    .max(2000, "Chief complaint must be 2000 characters or fewer.")
    .optional()
    .or(z.literal("")),
  findings: z
    .string()
    .trim()
    .max(5000, "Findings must be 5000 characters or fewer.")
    .optional()
    .or(z.literal("")),
  diagnosis: z
    .string()
    .trim()
    .max(500, "Diagnosis must be 500 characters or fewer.")
    .optional()
    .or(z.literal("")),
  customDiagnosis: z
    .string()
    .trim()
    .max(500, "Custom diagnosis must be 500 characters or fewer.")
    .optional()
    .or(z.literal("")),
  medicines: z
    .string()
    .transform((val) => {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })
    .pipe(z.array(medicineEntrySchema)),
  labOrders: z
    .string()
    .transform((val) => {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })
    .pipe(z.array(labOrderEntrySchema)),
  followUpDate: z.string().trim().max(10).optional().or(z.literal("")),
  followUpNotes: z
    .string()
    .trim()
    .max(2000, "Follow-up notes must be 2000 characters or fewer.")
    .optional()
    .or(z.literal("")),
  doctorNotes: z
    .string()
    .trim()
    .max(5000, "Doctor notes must be 5000 characters or fewer.")
    .optional()
    .or(z.literal("")),
});

/** Save a prescription template (doctor-scoped). */
export const saveTemplateSchema = z.object({
  doctorId: uuid("Missing doctor id."),
  name: z
    .string()
    .trim()
    .min(1, "Template name is required.")
    .max(100, "Template name must be 100 characters or fewer."),
  diagnosis: z.string().trim().max(500).optional().or(z.literal("")),
  customDiagnosis: z.string().trim().max(500).optional().or(z.literal("")),
  medicines: z
    .string()
    .transform((val) => {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })
    .pipe(z.array(medicineEntrySchema)),
  labOrders: z
    .string()
    .transform((val) => {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })
    .pipe(z.array(labOrderEntrySchema)),
  doctorNotes: z.string().trim().max(5000).optional().or(z.literal("")),
});

/** Delete a prescription template. */
export const deleteTemplateSchema = z.object({
  templateId: uuid("Missing template id."),
});

// ---------------------------------------------------------------------------
// Phase 19: Patient Billing / Payment Collection
// ---------------------------------------------------------------------------

const billItemSchema = z.object({
  description: z.string().trim().min(1, "Description is required.").max(255),
  quantity: z.number().int().positive("Quantity must be at least 1."),
  unit_price: z.number().min(0, "Price cannot be negative."),
});

/** Create a patient bill (with or without a visit). */
export const createPatientBillSchema = z.object({
  patientId: uuid("Missing patient id."),
  visitId: uuid("Missing visit id.").optional().or(z.literal("")),
  items: z
    .string()
    .transform((val) => {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })
    .pipe(z.array(billItemSchema).min(1, "Add at least one line item.")),
  currency: z.string().trim().max(10).optional().or(z.literal("")),
  billType: z
    .enum(["consultation", "procedure", "other"])
    .optional()
    .or(z.literal("")),
  doctorId: uuid("Invalid doctor.").optional().or(z.literal("")),
  billDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid bill date.")
    .optional()
    .or(z.literal("")),
  notes: z
    .string()
    .trim()
    .max(500, "Notes must be at most 500 characters.")
    .optional()
    .or(z.literal("")),
});

/**
 * Collect payment for a bill. The accepted methods come from
 * `PATIENT_PAYMENT_METHODS_UI` — Pakistani rails only. `upi` exists in the DB
 * enum for historical rows but is not accepted on new payments.
 */
export const collectPaymentSchema = z.object({
  billId: uuid("Missing bill id."),
  paymentMethod: z.enum(PATIENT_PAYMENT_METHODS_UI, {
    message: "Select a payment method.",
  }),
  amount: z
    .number({ message: "Amount must be a number." })
    .min(0, "Amount cannot be negative.")
    .max(9_999_999, "Amount must be at most 9,999,999."),
  additionalCharges: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(255),
        quantity: z.number().int().min(1).max(99).default(1),
        unit_price: z.number().min(0).max(9_999_999),
      }),
    )
    .default([]),
  discountAmount: z.number().min(0).max(9_999_999).default(0),
  discountPercent: z.number().min(0).max(100).default(0),
});

/**
 * Waive or cancel a bill (Phase 6). Both are irreversible from the UI and both
 * drop the bill out of revenue, so a reason is required rather than optional —
 * the audit row in `app_event_logs` is worth little without one.
 *
 * Capped at 200 characters: this is free text a staff member types and it lands
 * in an operational log, so it should hold a short justification ("waived —
 * clinic staff discount") and not become somewhere clinical notes get pasted.
 */
export const billStatusChangeSchema = z.object({
  billId: uuid("Missing bill id."),
  reason: z
    .string()
    .trim()
    .min(3, "Give a short reason — this is recorded in the audit log.")
    .max(200, "Keep the reason under 200 characters."),
});

// ---------------------------------------------------------------------------
// Growth Agent (Phase 24)
// ---------------------------------------------------------------------------

/** How many keywords one post may carry. Google's own post fields are short;
 *  past this the tags stop being a targeting aid and start being a keyword
 *  stuffing the clinic's own ranking would rather not have. */
const GROWTH_KEYWORD_LIMIT = 8;

/**
 * One keyword tag, normalised. The leading `#` is stripped here rather than
 * trusted from the client, so `#Dental` and `Dental` cannot both enter the
 * array and produce two visually identical tags.
 */
const growthKeyword = z
  .string()
  .trim()
  .min(1, "Enter a keyword.")
  .max(40, "Keep keywords under 40 characters.")
  .transform((value) => value.replace(/^#+/, "").trim())
  .refine((value) => value.length > 0, "Enter a keyword.");

/**
 * Fields the post generator submits. `topic` and `tone` are free strings
 * because they are picker values whose label set lives in the UI, but they are
 * still bounded and stripped of control characters — a topic is interpolated
 * into a model prompt, so an unbounded string is a prompt-injection surface.
 */
export const growthGenerateSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(3, "Choose what the post is about.")
    .max(120, "Keep the topic under 120 characters."),
  keywords: z
    .array(growthKeyword)
    .max(GROWTH_KEYWORD_LIMIT, `Use at most ${GROWTH_KEYWORD_LIMIT} keywords.`)
    .default([]),
  tone: z
    .string()
    .trim()
    .min(2, "Choose a writing tone.")
    .max(40, "Keep the tone under 40 characters."),
  cta: z
    .string()
    .trim()
    .min(2, "Choose a call to action.")
    .max(40, "Keep the call to action under 40 characters."),
});

/** Persisting a post to the queue — used by both generate and manual save. */
export const growthPostSaveSchema = z.object({
  postId: uuid("Missing post id.").optional(),
  content: z
    .string()
    .trim()
    .min(20, "Write at least a sentence before saving.")
    .max(1500, "A Google post must be under 1500 characters."),
  topic: z
    .string()
    .trim()
    .min(3, "Choose what the post is about.")
    .max(120, "Keep the topic under 120 characters."),
  keywords: z
    .array(growthKeyword)
    .max(GROWTH_KEYWORD_LIMIT, `Use at most ${GROWTH_KEYWORD_LIMIT} keywords.`)
    .default([]),
  cta: z
    .string()
    .trim()
    .min(2, "Choose a call to action.")
    .max(40, "Keep the call to action under 40 characters."),
  tone: z
    .string()
    .trim()
    .min(2, "Choose a writing tone.")
    .max(40, "Keep the tone under 40 characters."),
  /** Naive clinic-local `YYYY-MM-DDTHH:mm`, or empty to save as a draft now. */
  scheduledFor: localDateTime.or(z.literal("")).default(""),
});

/**
 * Auto-publishing preferences. `preferredDay` is the 0=Monday index used by
 * `availability_rules.day_of_week`, and `preferredTime` a wall clock in the
 * clinic's own timezone — a `time` column, so no offset is stored.
 *
 * `autoPostEnabled` is validated on its own rather than in a `.superRefine`
 * that rejects the form, because the UI has to be able to save "enabled" while
 * the profile is still disconnected and show the resulting warning inline.
 */
export const growthSettingsSchema = z.object({
  autoPostEnabled: z.boolean(),
  postingFrequency: z.enum(["weekly", "biweekly", "monthly"], {
    message: "Choose weekly, every two weeks, or monthly.",
  }),
  preferredDay: z.coerce
    .number()
    .int()
    .min(0, "Choose a day.")
    .max(6, "Choose a day."),
  preferredTime: z.string().regex(TIME_OF_DAY, "Choose a time."),
  requireApproval: z.boolean(),
});

/** Row-level action on a queued post. */
export const growthPostActionSchema = z.object({
  postId: uuid("Missing post id."),
});

// =============================================================================
// Phase 25 — Integrations (migration 0043)
// =============================================================================

/**
 * A credential value submitted from the config modal.
 *
 * Empty string is meaningful and is NOT collapsed to undefined: it is the
 * "leave blank to keep the saved value" signal for a field that already has a
 * secret. The action treats an empty string as "unchanged" and only writes a
 * credential when a non-empty value arrives, so re-saving a form to change one
 * non-secret setting cannot wipe the stored API key.
 */
const secretValue = z
  .string()
  .trim()
  .max(1024, "Credential is too long.")
  .optional();

/** Non-secret setting. Trimmed and length-capped before it reaches jsonb. */
const settingValue = z
  .string()
  .trim()
  .max(512, "Value is too long.")
  .optional();

export const integrationKeySchema = z
  .string()
  .trim()
  .min(1, "Missing integration key.")
  .max(64, "Integration key is too long.");

/**
 * Save the config modal.
 *
 * `config` and `credentials` are kept as separate bags on purpose. Only entries
 * whose `secret` flag is set in the catalogue are read out of `credentials` and
 * written to the service-role table; everything else comes from `config` and is
 * stored in the member-readable jsonb column. The action derives the split from
 * the catalogue rather than trusting the shape the client sent.
 */
export const saveIntegrationConfigSchema = z.object({
  key: integrationKeySchema,
  config: z.record(z.string(), settingValue).default({}),
  credentials: z.record(z.string(), secretValue).default({}),
});

/** Flip an integration on or off. */
export const setIntegrationStatusSchema = z.object({
  key: integrationKeySchema,
  status: z.enum(["activated", "disabled"], {
    message: "Status must be either activated or disabled.",
  }),
});

/** Queue Management writes the column it controls rather than a row. */
export const setAppointmentsViewModeSchema = z.object({
  mode: z.enum(["queue", "list"], {
    message: "Mode must be either queue or list.",
  }),
});

// ---------------------------------------------------------------------------
// Add-ons marketplace (migration 0060, /app/addons)
// ---------------------------------------------------------------------------
//
// The catalog slug is validated against the seeded slugs rather than as free
// text, so a crafted request can never name an add-on that does not exist.
// Keep this list in step with the seed in 0060_addons_marketplace.sql.
const ADDON_SLUGS = [
  "whatsapp-ai-receptionist",
  "ai-review-assistant",
  "growth-agent",
  "extra-doctor-seat",
  "extra-tv-display",
  "queue-management-system",
] as const;

export const addonSlugSchema = z.enum(ADDON_SLUGS, {
  message: "That add-on does not exist.",
});

/** Subscribe (or re-activate) an add-on. `quantity` is for seat/display units. */
export const subscribeAddonSchema = z.object({
  slug: addonSlugSchema,
  quantity: z.number().int().min(1, "Quantity must be at least 1.").max(50).default(1),
});

/** Change the number of units on a quantity-based add-on. */
export const updateAddonQuantitySchema = z.object({
  addonId: z.string().uuid("Invalid add-on."),
  quantity: z.number().int().min(1, "Quantity must be at least 1.").max(50),
});

/** Request cancellation of a subscription. The row stays for history. */
export const cancelAddonSchema = z.object({
  addonId: z.string().uuid("Invalid add-on."),
});

// ---------------------------------------------------------------------------
// Help & Support (migration 0061, /app/support)
// ---------------------------------------------------------------------------
//
// The request-type and priority dropdowns in the support form iterate these
// lists, and the schema validates against them. Keep the two lists and the
// CHECK constraints in 0061_support_tickets.sql in step with each other.

export const SUPPORT_TICKET_TYPES = [
  "Bug Report",
  "Feature Improvement Request",
  "General Help & Support",
] as const;

export const SUPPORT_TICKET_PRIORITIES = ["Low", "Medium", "High"] as const;

export const supportTicketSchema = z.object({
  type: z.enum(SUPPORT_TICKET_TYPES, {
    message: "Pick a request type.",
  }),
  subject: z
    .string()
    .trim()
    .min(3, "Subject needs at least 3 characters.")
    .max(200, "Subject is too long (max 200 characters)."),
  description: z
    .string()
    .trim()
    .min(10, "Describe the issue in a bit more detail (min 10 characters).")
    .max(4000, "Description is too long (max 4000 characters)."),
  priority: z.enum(SUPPORT_TICKET_PRIORITIES, {
    message: "Pick a priority.",
  }),
});

/**
 * Engagement module (migration 0062). These mirror the CHECK constraints on
 * the four engagement tables; the page and the server actions both run them
 * before any write.
 */
export const ENGAGEMENT_TEMPLATE_TYPES = [
  "appointment_confirmation",
  "appointment_reminder",
  "review_request",
  "prescription_delivery",
  "receipt_delivery",
  "check_in",
  "no_show_recovery",
  "auto_follow_up",
] as const;

export const ENGAGEMENT_AUTOMATION_TYPES = [
  ...ENGAGEMENT_TEMPLATE_TYPES,
  "general",
] as const;

export const engagementTemplateTextSchema = z
  .string()
  .trim()
  .min(1, "Message can't be empty.")
  .max(2000, "Message is too long (max 2000 characters).");

/** Toggle + JSON config for one automation, e.g. a delay or a maps link. */
export const engagementAutomationSchema = z.object({
  automationType: z.enum(ENGAGEMENT_AUTOMATION_TYPES),
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()).default({}),
});

/** Template edit (review card, confirmation modal, reminder editor). */
export const engagementTemplateSchema = z.object({
  type: z.enum(ENGAGEMENT_TEMPLATE_TYPES),
  templateText: engagementTemplateTextSchema,
  enabled: z.boolean().default(true),
});

/** General settings: timezone + Google Maps link shown on reminder messages. */
export const engagementGeneralSettingsSchema = z.object({
  timezone: z.string().trim().min(1, "Pick a timezone."),
  mapsLink: z
    .string()
    .trim()
    .max(2048, "The link must be 2048 characters or fewer.")
    .optional()
    .or(z.literal("")),
});

/**
 * The "Create New Reminder" / "Edit Message" form (Reminders tab popup).
 * `appointment_confirmation` only uses the name/header/body — the delay and
 * doctor-scope fields are skipped for it; `appointment_reminder` uses them all.
 */
export const engagementReminderFormSchema = z.object({
  type: z.enum(["appointment_reminder", "appointment_confirmation"]),
  templateName: z
    .string()
    .trim()
    .min(1, "Give this reminder a name.")
    .max(80, "Template name is too long (max 80 characters)."),
  templateHeader: z
    .string()
    .trim()
    .max(120, "Message header is too long (max 120 characters).")
    .optional()
    .or(z.literal("")),
  headerType: z.enum(["text", "image", "none"]).optional(),
  headerImage: z
    .string()
    .trim()
    .max(2048, "Image URL is too long.")
    .optional()
    .or(z.literal("")),
  templateText: engagementTemplateTextSchema,
  trigger: z.enum(["before", "after"]).optional(),
  delayValue: z
    .number("Enter how long before the appointment to send.")
    .int("Delay must be a whole number.")
    .min(1, "Delay must be at least 1.")
    .max(365, "Delay must be at most 365.")
    .optional(),
  delayUnit: z.enum(["hours", "days"]).optional(),
  doctorScope: z.enum(["all", "specific"]).optional(),
  doctorId: z
    .string()
    .trim()
    .max(64, "Doctor selection is invalid.")
    .optional()
    .or(z.literal("")),
});

/** Logging a Google review from the metrics card. */
export const addClinicReviewSchema = z.object({
  rating: z
    .number()
    .int("Rating must be a whole number.")
    .min(1, "Rating must be at least 1.")
    .max(5, "Rating must be at most 5."),
  reviewerName: z
    .string()
    .trim()
    .max(100, "Reviewer name is too long (max 100 characters).")
    .optional()
    .or(z.literal("")),
  comment: z
    .string()
    .trim()
    .max(2000, "Comment is too long (max 2000 characters).")
    .optional()
    .or(z.literal("")),
});

export type EngagementAutomationInput = z.infer<
  typeof engagementAutomationSchema
>;
export type EngagementTemplateInput = z.infer<typeof engagementTemplateSchema>;
export type EngagementGeneralSettingsInput = z.infer<
  typeof engagementGeneralSettingsSchema
>;
export type AddClinicReviewInput = z.infer<typeof addClinicReviewSchema>;
export type EngagementReminderFormInput = z.infer<
  typeof engagementReminderFormSchema
>;
