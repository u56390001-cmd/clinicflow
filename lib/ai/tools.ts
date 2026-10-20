import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createAppointmentService,
  listAvailableSlots,
  rescheduleAppointmentService,
  setAppointmentStatusService,
} from "@/lib/booking-service";
import {
  buildWorkingHoursSummary,
  type RuleView,
} from "@/lib/appointments-view";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import { activeFaqEntries } from "@/lib/ai/faq";
import { getActivePreConsultationQuestions } from "@/lib/pre-consultation";
import type { AIToolDefinition } from "@/lib/ai/types";
import type { ClinicAiSettings, Database } from "@/types/database";
import { executeDualModeBooking } from "@/lib/ai/receptionist-agent";

/**
 * The six AI tools. Each tool has:
 *  - `parameters`: JSON Schema sent to Gemini (data minimization — only what
 *    the call needs).
 *  - `schema`: Zod schema used to re-validate the model's args server-side.
 *  - `execute`: calls the shared validated services — NEVER raw inserts.
 *
 * The clinic is pinned by the orchestrator from the signed-in tester's session.
 * A `clinicId` the model passes is only accepted when it matches that clinic;
 * anything else is refused. Time values are clinic-local naive
 * `YYYY-MM-DDTHH:mm`.
 */

export type ToolContext = {
  supabase: SupabaseClient<Database>;
  clinic: { id: string; timezone: string };
  settings: ClinicAiSettings | null;
  /**
   * Where the conversation runs — recorded on appointments created by the AI
   * ('ai_agent' for the in-app tester, 'widget' for the public widget) so the
   * dashboard can report AI vs website booking rates.
   */
  bookingSource?: string;
};

type Tool = AIToolDefinition & {
  execute: (
    ctx: ToolContext,
    args: unknown,
  ) => Promise<Record<string, unknown>>;
};

const clinicIdSchema = z.string().uuid().optional();

const localDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    "Use YYYY-MM-DDTHH:mm clinic-local time.",
  );
const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD clinic-local date.");
const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM.");

const timezoneSchema = z
  .string()
  .trim()
  .min(1, "Timezone is required.")
  .max(64, "Timezone must be 64 characters or fewer.");

const patientSchema = z.object({
  name: z.string().trim().min(1, "Patient name is required.").max(120),
  email: z
    .string()
    .trim()
    .email("Enter a valid email.")
    .max(254)
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .trim()
    .min(3, "Phone must be at least 3 characters.")
    .max(32)
    .optional()
    .or(z.literal("")),
});

/** Refuse a clinicId the model passed unless it matches the session clinic. */
function resolveClinicId(
  ctx: ToolContext,
  requested: string | undefined,
): { ok: true; clinicId: string } | { ok: false; error: string } {
  if (requested === undefined || requested === ctx.clinic.id) {
    return { ok: true, clinicId: ctx.clinic.id };
  }
  return { ok: false, error: "You are not authorized to access that clinic." };
}

type JsonSchema = Record<string, unknown>;

const objectSchema = (
  properties: Record<string, JsonSchema>,
  required: string[] = [],
): JsonSchema => ({
  type: "object",
  properties,
  required,
});

const getClinicInfoSchema = z.object({ clinicId: clinicIdSchema });
const getClinicInfo: Tool = {
  name: "getClinicInfo",
  description:
    "Return the clinic's name, doctor, address, phone, email, working hours, its configured FAQs, booking rules and cancellation policy, every bookable doctor's profile (specialty, qualification, experience, consultation fee, short bio), and the compact service list (id, name, description, duration, price). Use this to answer questions about clinic policies, hours, contact details, FAQs, doctor fees and doctor profiles — and to recommend the right service for a concern, check whether the clinic offers something, answer service/price questions, and take the serviceId needed for booking, WITHOUT displaying the full service menu.",
  parameters: objectSchema({
    clinicId: { type: "string", description: "The clinic id (optional)." },
  }),
  async execute(ctx, rawArgs) {
    const parsed = getClinicInfoSchema.safeParse(rawArgs);
    if (!parsed.success)
      return {
        ok: false,
        error: "Invalid arguments: " + firstIssue(parsed.error),
      };

    const clinicAccess = resolveClinicId(ctx, parsed.data.clinicId);
    if (!clinicAccess.ok) return { ok: false, error: clinicAccess.error };

    const [
      { data: rules },
      { data: doctors },
      { data: clinicRow },
      { data: services },
    ] = await Promise.all([
      ctx.supabase
        .from("availability_rules")
        .select("day_of_week, start_time, end_time, enabled")
        // Clinic-wide defaults only — per-doctor overrides are not general
        // opening hours.
        .eq("clinic_id", clinicAccess.clinicId)
        .is("doctor_id", null)
        .order("day_of_week", { ascending: true }),
      ctx.supabase
        .from("doctors")
        .select(
          "id, name, specialty, qualification, years_of_experience, consultation_fee, professional_description, consultation_type",
        )
        .eq("clinic_id", clinicAccess.clinicId)
        .eq("is_visible", true)
        .order("created_at", { ascending: true }),
      ctx.supabase
        .from("clinics")
        .select("name, doctor_name, phone, email, address")
        .eq("id", clinicAccess.clinicId)
        .maybeSingle(),
      ctx.supabase
        .from("services")
        .select("id, name, description, duration_minutes, price, doctor_id")
        .eq("clinic_id", clinicAccess.clinicId)
        .eq("status", "active")
        .order("name", { ascending: true }),
    ]);

    const ruleViews: RuleView[] = (rules ?? []).map((rule) => ({
      dayOfWeek: rule.day_of_week,
      startTime: rule.start_time,
      endTime: rule.end_time,
      enabled: rule.enabled,
    }));

    const s = ctx.settings;
    return {
      clinic: {
        id: clinicAccess.clinicId,
        name: clinicRow?.name ?? null,
        doctorName: clinicRow?.doctor_name ?? null,
        phone: clinicRow?.phone ?? null,
        email: clinicRow?.email ?? null,
        address: clinicRow?.address ?? null,
      },
      // Bookable doctors with dual-mode consultation capabilities.
      doctors: (doctors ?? []).map((doctor) => {
        const rawType = (doctor.consultation_type ?? "offline") as
          "offline" | "both" | "online";
        return {
          id: doctor.id,
          name: doctor.name,
          specialty: doctor.specialty,
          qualification: doctor.qualification,
          yearsOfExperience: doctor.years_of_experience,
          consultationFee: doctor.consultation_fee,
          about: doctor.professional_description,
          consultationType: rawType,
          offersOnlineVideo: rawType === "both" || rawType === "online",
          offersInClinic: rawType === "both" || rawType === "offline",
        };
      }),
      // Compact service list — lets the model recommend a service, quote
      // prices and take a serviceId without calling getServices (whose
      // result is rendered to the patient as the full menu).
      services: (services ?? []).map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        durationMinutes: service.duration_minutes,
        price: service.price,
        // Present only when the service is tied to one specific doctor — the
        // model must never pair such a service with a different doctor.
        doctorId: service.doctor_id ?? undefined,
      })),
      workingHours: buildWorkingHoursSummary(ruleViews),
      agentName: s?.agent_name ?? null,
      welcomeMessage: s?.welcome_message ?? null,
      tone: s?.tone ?? null,
      clinicDescription: s?.clinic_description ?? null,
      bookingRules: s?.booking_rules ?? null,
      cancellationPolicyText: s?.cancellation_policy_text ?? null,
      // Inactive FAQs are kept for the clinic but excluded from AI knowledge.
      faqs: activeFaqEntries(s?.faqs),
    };
  },
};

const getServicesSchema = z.object({ clinicId: clinicIdSchema });
const getServices: Tool = {
  name: "getServices",
  description:
    "Return the clinic's active (bookable) services with name, description, duration, price and the doctor tied to the service when one is. IMPORTANT: this result is rendered to the patient as the FULL service menu in one message — only call it when the patient explicitly asks to browse all services. For recommendations, price checks or serviceIds, use getClinicInfo instead.",
  parameters: objectSchema({
    clinicId: { type: "string", description: "The clinic id (optional)." },
  }),
  async execute(ctx, rawArgs) {
    const parsed = getServicesSchema.safeParse(rawArgs);
    if (!parsed.success)
      return {
        ok: false,
        error: "Invalid arguments: " + firstIssue(parsed.error),
      };

    const clinicAccess = resolveClinicId(ctx, parsed.data.clinicId);
    if (!clinicAccess.ok) return { ok: false, error: clinicAccess.error };

    const { data: services } = await ctx.supabase
      .from("services")
      .select("id, name, description, duration_minutes, price, doctor_id")
      .eq("clinic_id", clinicAccess.clinicId)
      .eq("status", "active")
      .order("name", { ascending: true });

    return {
      services: (services ?? []).map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        durationMinutes: service.duration_minutes,
        price: service.price,
        doctorId: service.doctor_id ?? undefined,
      })),
    };
  },
};

const getAvailabilitySchema = z.object({
  clinicId: clinicIdSchema,
  serviceId: z.string().uuid("A valid service id is required."),
  date: localDateSchema,
  preferredTime: timeOfDaySchema.optional(),
  doctorId: z.string().uuid("A valid doctor id is required.").optional(),
  timezone: timezoneSchema.optional(),
});
const getAvailability: Tool = {
  name: "getAvailability",
  description:
    "Check the REAL available slots for a service on a clinic-local date. Pass the date as YYYY-MM-DD and optionally a preferred start time HH:MM. Pass doctorId when the patient chose a specific doctor (from getClinicInfo). Returns verified open slots as clinic-local YYYY-MM-DDTHH:mm values. Always call this before suggesting a time — never guess availability.",
  parameters: objectSchema(
    {
      clinicId: { type: "string", description: "The clinic id (optional)." },
      serviceId: {
        type: "string",
        description:
          "The service id from getClinicInfo (services) or getServices.",
      },
      date: { type: "string", description: "Clinic-local date YYYY-MM-DD." },
      preferredTime: {
        type: "string",
        description: "Optional preferred start time HH:MM (clinic-local).",
      },
      doctorId: {
        type: "string",
        description:
          "Optional doctor id from getClinicInfo when the patient chose one.",
      },
      timezone: {
        type: "string",
        description: "The clinic's IANA timezone (optional).",
      },
    },
    ["serviceId", "date"],
  ),
  async execute(ctx, rawArgs) {
    const parsed = getAvailabilitySchema.safeParse(rawArgs);
    if (!parsed.success)
      return {
        ok: false,
        error: "Invalid arguments: " + firstIssue(parsed.error),
      };

    const clinicAccess = resolveClinicId(ctx, parsed.data.clinicId);
    if (!clinicAccess.ok) return { ok: false, error: clinicAccess.error };

    // Early refusal when the chosen doctor doesn't match a doctor-tied
    // service. Without this we'd list bookable-looking slots that
    // createAppointmentService later refuses ("This service is only offered
    // by a specific doctor"), which reads to the patient as "booking is
    // broken".
    if (parsed.data.doctorId) {
      const { data: serviceRow } = await ctx.supabase
        .from("services")
        .select("id, doctor_id, doctor:doctors(name)")
        .eq("clinic_id", clinicAccess.clinicId)
        .eq("id", parsed.data.serviceId)
        .maybeSingle();
      const tiedDoctorId = serviceRow?.doctor_id as string | null | undefined;
      if (tiedDoctorId && tiedDoctorId !== parsed.data.doctorId) {
        const tiedName = (serviceRow?.doctor as { name?: string } | null)?.name;
        return {
          ok: false,
          error: `That service is only offered by ${tiedName ?? "a specific doctor"}. Call getAvailability for that doctor with this service, or check another service for the chosen doctor.`,
        };
      }
    }

    const result = await listAvailableSlots(
      ctx.supabase,
      { id: clinicAccess.clinicId, timezone: ctx.clinic.timezone },
      parsed.data.serviceId,
      parsed.data.date,
      parsed.data.preferredTime,
      parsed.data.doctorId ?? null,
    );
    if (!result.ok) return { ok: false, error: result.message };

    return {
      ok: true,
      date: parsed.data.date,
      timezone: ctx.clinic.timezone,
      serviceId: result.serviceId,
      durationMinutes: result.durationMinutes,
      slots: result.slots,
      note:
        result.slots.length === 0
          ? "No open slots were found for this date. Offer to check another date."
          : "Slots are shown in the clinic's local time. Use the exact YYYY-MM-DDTHH:mm value when booking.",
    };
  },
};

const getPreConsultationQuestionsSchema = z.object({
  clinicId: clinicIdSchema,
  serviceId: z.string().uuid("A valid service id is required."),
  doctorId: z.string().uuid("A valid doctor id is required.").optional(),
});
const getPreConsultationQuestions: Tool = {
  name: "getPreConsultationQuestions",
  description:
    "Return the clinic's during-booking pre-consultation questions for a chosen service and doctor (up to 3, in the configured order), if the clinic configured any. Call this for the service (and doctor if chosen) BEFORE createAppointment, ask the patient each question in order and pass their replies back via createAppointment's preConsultAnswers. Returns an empty list when the clinic has no questions configured.",
  parameters: objectSchema(
    {
      clinicId: { type: "string", description: "The clinic id (optional)." },
      serviceId: {
        type: "string",
        description:
          "The service id from getClinicInfo (services) or getServices.",
      },
      doctorId: {
        type: "string",
        description:
          "Optional doctor id from getClinicInfo when the patient chose one.",
      },
    },
    ["serviceId"],
  ),
  async execute(ctx, rawArgs) {
    const parsed = getPreConsultationQuestionsSchema.safeParse(rawArgs);
    if (!parsed.success)
      return {
        ok: false,
        error: "Invalid arguments: " + firstIssue(parsed.error),
      };

    const clinicAccess = resolveClinicId(ctx, parsed.data.clinicId);
    if (!clinicAccess.ok) return { ok: false, error: clinicAccess.error };

    const questions = await getActivePreConsultationQuestions(
      ctx.supabase,
      clinicAccess.clinicId,
      {
        serviceId: parsed.data.serviceId,
        doctorId: parsed.data.doctorId ?? null,
        timing: "during_booking",
      },
    );

    return {
      ok: true,
      questions: questions.map((question) => ({
        id: question.id,
        text: question.question_text,
      })),
    };
  },
};

const createAppointmentSchema = z.object({
  clinicId: clinicIdSchema,
  patient: patientSchema,
  serviceId: z.string().uuid("A valid service id is required."),
  doctorId: z.string().uuid("A valid doctor id is required.").optional(),
  startTime: localDateTimeSchema,
  timezone: timezoneSchema.optional(),
  /**
   * Phase 22 — the patient's answers to the clinic's during-booking
   * pre-consultation questions, keyed by the question id returned by
   * getPreConsultationQuestions. Persisted to pre_consultation_answers.
   */
  preConsultAnswers: z
    .array(
      z.object({
        questionId: z.string().uuid("A valid question id is required."),
        answerText: z
          .string()
          .trim()
          .min(1, "An answer text is required.")
          .max(2000),
      }),
    )
    .max(3, "At most 3 answers.")
    .optional(),
});
const createAppointment: Tool = {
  name: "createAppointment",
  description:
    "Create a real appointment. Requires a serviceId (from getServices), the patient's details, and an exact clinic-local start time YYYY-MM-DDTHH:mm that came from getAvailability. Pass doctorId when the patient chose a specific doctor. Pass preConsultAnswers (matching getPreConsultationQuestions ids) with the patient's answers when those questions were asked. The slot is re-verified at write time — another booking may have taken it. Only confirm to the patient if this returns ok: true.",
  parameters: objectSchema(
    {
      clinicId: { type: "string", description: "The clinic id (optional)." },
      patient: {
        type: "object",
        properties: {
          name: { type: "string", description: "Patient's full name." },
          email: { type: "string", description: "Patient's email (optional)." },
          phone: { type: "string", description: "Patient's phone (optional)." },
        },
        required: ["name"],
      },
      serviceId: {
        type: "string",
        description:
          "The service id from getClinicInfo (services) or getServices.",
      },
      doctorId: {
        type: "string",
        description:
          "Optional doctor id from getClinicInfo when the patient chose one.",
      },
      startTime: {
        type: "string",
        description:
          "Exact clinic-local start YYYY-MM-DDTHH:mm from getAvailability.",
      },
      timezone: {
        type: "string",
        description: "The clinic's IANA timezone (optional).",
      },
      preConsultAnswers: {
        type: "array",
        description:
          "The patient's answers to the clinic's pre-consultation questions, one object per question asked.",
        items: {
          type: "object",
          properties: {
            questionId: {
              type: "string",
              description: "The question id from getPreConsultationQuestions.",
            },
            answerText: {
              type: "string",
              description: "The patient's answer text, verbatim.",
            },
          },
          required: ["questionId", "answerText"],
        },
      },
    },
    ["patient", "serviceId", "startTime"],
  ),
  async execute(ctx, rawArgs) {
    const parsed = createAppointmentSchema.safeParse(rawArgs);
    if (!parsed.success)
      return {
        ok: false,
        error: "Invalid arguments: " + firstIssue(parsed.error),
      };

    const clinicAccess = resolveClinicId(ctx, parsed.data.clinicId);
    if (!clinicAccess.ok) return { ok: false, error: clinicAccess.error };

    // Enforce the clinic's configured required patient fields.
    const required = ctx.settings?.required_patient_fields ?? ["name"];
    const patient = parsed.data.patient;
    if (required.includes("name") && !patient.name.trim()) {
      return { ok: false, error: "A patient name is required to book." };
    }
    if (required.includes("email") && !patient.email?.trim()) {
      return { ok: false, error: "A patient email is required to book." };
    }
    if (required.includes("phone") && !patient.phone?.trim()) {
      return { ok: false, error: "A patient phone is required to book." };
    }

    const result = await createAppointmentService(
      ctx.supabase,
      { id: clinicAccess.clinicId, timezone: ctx.clinic.timezone },
      {
        patient: {
          name: patient.name,
          email: patient.email || null,
          phone: patient.phone || null,
        },
        serviceId: parsed.data.serviceId,
        doctorId: parsed.data.doctorId ?? undefined,
        start: parsed.data.startTime,
        bookingSource: ctx.bookingSource ?? "ai_agent",
        preConsultationAnswers: parsed.data.preConsultAnswers ?? undefined,
      },
    );

    if (!result.ok) {
      return { ok: false, error: result.message };
    }

    const appointment = result.appointment;
    return {
      ok: true,
      appointment: {
        id: appointment.id,
        patientId: appointment.patient_id,
        serviceId: appointment.service_id,
        doctorId: appointment.doctor_id ?? undefined,
        start: utcIsoToClinicLocalInput(
          appointment.start_time,
          ctx.clinic.timezone,
        ),
        end: utcIsoToClinicLocalInput(
          appointment.end_time,
          ctx.clinic.timezone,
        ),
        status: appointment.status,
      },
    };
  },
};

const rescheduleAppointmentSchema = z.object({
  clinicId: clinicIdSchema,
  appointmentId: z.string().uuid("A valid appointment id is required."),
  startTime: localDateTimeSchema,
  timezone: timezoneSchema.optional(),
});
const rescheduleAppointment: Tool = {
  name: "rescheduleAppointment",
  description:
    "Move an existing appointment (created in this conversation) to a new clinic-local start time YYYY-MM-DDTHH:mm. The new slot is re-verified at write time. Only confirm to the patient if this returns ok: true.",
  parameters: objectSchema(
    {
      clinicId: { type: "string", description: "The clinic id (optional)." },
      appointmentId: {
        type: "string",
        description: "The appointment id returned by createAppointment.",
      },
      startTime: {
        type: "string",
        description:
          "New clinic-local start YYYY-MM-DDTHH:mm (from getAvailability).",
      },
      timezone: {
        type: "string",
        description: "The clinic's IANA timezone (optional).",
      },
    },
    ["appointmentId", "startTime"],
  ),
  async execute(ctx, rawArgs) {
    const parsed = rescheduleAppointmentSchema.safeParse(rawArgs);
    if (!parsed.success)
      return {
        ok: false,
        error: "Invalid arguments: " + firstIssue(parsed.error),
      };

    const clinicAccess = resolveClinicId(ctx, parsed.data.clinicId);
    if (!clinicAccess.ok) return { ok: false, error: clinicAccess.error };

    const result = await rescheduleAppointmentService(
      ctx.supabase,
      { id: clinicAccess.clinicId, timezone: ctx.clinic.timezone },
      parsed.data.appointmentId,
      parsed.data.startTime,
    );
    if (!result.ok) return { ok: false, error: result.message };

    return {
      ok: true,
      appointment: {
        id: result.appointment.id,
        start: utcIsoToClinicLocalInput(
          result.appointment.start_time,
          ctx.clinic.timezone,
        ),
        end: utcIsoToClinicLocalInput(
          result.appointment.end_time,
          ctx.clinic.timezone,
        ),
        status: result.appointment.status,
      },
    };
  },
};

const cancelAppointmentSchema = z.object({
  clinicId: clinicIdSchema,
  appointmentId: z.string().uuid("A valid appointment id is required."),
  timezone: timezoneSchema.optional(),
});
const cancelAppointment: Tool = {
  name: "cancelAppointment",
  description:
    "Cancel an existing appointment (created in this conversation). Only confirm to the patient if this returns ok: true.",
  parameters: objectSchema(
    {
      clinicId: { type: "string", description: "The clinic id (optional)." },
      appointmentId: {
        type: "string",
        description: "The appointment id returned by createAppointment.",
      },
      timezone: {
        type: "string",
        description: "The clinic's IANA timezone (optional).",
      },
    },
    ["appointmentId"],
  ),
  async execute(ctx, rawArgs) {
    const parsed = cancelAppointmentSchema.safeParse(rawArgs);
    if (!parsed.success)
      return {
        ok: false,
        error: "Invalid arguments: " + firstIssue(parsed.error),
      };

    const clinicAccess = resolveClinicId(ctx, parsed.data.clinicId);
    if (!clinicAccess.ok) return { ok: false, error: clinicAccess.error };

    const result = await setAppointmentStatusService(
      ctx.supabase,
      { id: clinicAccess.clinicId, timezone: ctx.clinic.timezone },
      parsed.data.appointmentId,
      "cancelled",
    );
    if (!result.ok) return { ok: false, error: result.message };

    return {
      ok: true,
      appointment: {
        id: result.appointment.id,
        status: result.appointment.status,
      },
    };
  },
};

const bookAppointmentSchema = z.object({
  // The clinic is pinned server-side from the session (ctx.clinic.id). Older
  // model prompts/tool defs may still send clinic_id — accept it for
  // compatibility but never trust it (see execute below).
  clinic_id: clinicIdSchema,
  clinicId: clinicIdSchema,
  doctor_id: z
    .string()
    .uuid("doctor_id must be a UUID from getClinicInfo.")
    .optional()
    .nullable(),
  doctorId: z
    .string()
    .uuid("doctor_id must be a UUID from getClinicInfo.")
    .optional()
    .nullable(),
  patient_name: z.string().trim().min(1, "Patient name is required.").max(120),
  patient_phone: z.string().trim().min(3, "Patient phone is required.").max(32),
  slot_time: localDateTimeSchema,
  appointment_type: z.enum(
    ["CLINIC_VISIT", "ONLINE_VIDEO"],
    "appointment_type must be exactly 'CLINIC_VISIT' or 'ONLINE_VIDEO'.",
  ),
  chief_complaint: z
    .string()
    .trim()
    .min(1, "Chief complaint is required.")
    .max(1000),
  service_id: z
    .string()
    .uuid("service_id must be a UUID from getClinicInfo.")
    .optional()
    .nullable(),
  serviceId: z
    .string()
    .uuid("service_id must be a UUID from getClinicInfo.")
    .optional()
    .nullable(),
  /**
   * The patient's answers to the during-booking pre-consultation questions,
   * keyed by the question id returned by getPreConsultationQuestions. The
   * system prompt instructs the model to pass these to `book_appointment`;
   * without this field Zod would strip them and the answers would be lost.
   */
  preConsultAnswers: z
    .array(
      z.object({
        questionId: z.string().uuid("A valid question id is required."),
        answerText: z
          .string()
          .trim()
          .min(1, "An answer text is required.")
          .max(2000),
      }),
    )
    .max(3, "At most 3 answers.")
    .optional()
    .nullable(),
});

const bookAppointment: Tool = {
  name: "book_appointment",
  description:
    "Book an appointment in either dual mode: 'CLINIC_VISIT' (in-person clinic visit) or 'ONLINE_VIDEO' (online video consultation). Validates doctor capability, creates the appointment with status 'confirmed', and leaves meeting_link as NULL (the doctor will share the video link prior to the appointment). Pass preConsultAnswers (matching getPreConsultationQuestions ids) with the patient's answers when those questions were asked.",
  parameters: objectSchema(
    {
      doctor_id: { type: "string", description: "Optional doctor ID (UUID)." },
      patient_name: { type: "string", description: "Patient's full name." },
      patient_phone: {
        type: "string",
        description: "Patient's phone number with country code.",
      },
      slot_time: {
        type: "string",
        description:
          "Exact clinic-local start YYYY-MM-DDTHH:mm from getAvailability.",
      },
      appointment_type: {
        type: "string",
        enum: ["CLINIC_VISIT", "ONLINE_VIDEO"],
        description: "Consultation mode: 'CLINIC_VISIT' or 'ONLINE_VIDEO'.",
      },
      chief_complaint: {
        type: "string",
        description: "Patient's primary symptom, concern or reason for visit.",
      },
      service_id: {
        type: "string",
        description: "Optional service ID (UUID).",
      },
      preConsultAnswers: {
        type: "array",
        description:
          "The patient's answers to the clinic's pre-consultation questions, one object per question asked.",
        items: {
          type: "object",
          properties: {
            questionId: {
              type: "string",
              description: "The question id from getPreConsultationQuestions.",
            },
            answerText: {
              type: "string",
              description: "The patient's answer text, verbatim.",
            },
          },
          required: ["questionId", "answerText"],
        },
      },
    },
    [
      "patient_name",
      "patient_phone",
      "slot_time",
      "appointment_type",
      "chief_complaint",
    ],
  ),
  async execute(ctx, rawArgs) {
    const parsed = bookAppointmentSchema.safeParse(rawArgs);
    if (!parsed.success)
      return {
        ok: false,
        error: "Invalid arguments: " + firstIssue(parsed.error),
      };

    // The clinic is ALWAYS the session clinic. A model-supplied clinic_id is
    // ignored rather than rejected: the model never receives the clinic UUID
    // (getClinicInfo is clinic-pinned and need not expose it), so a stray or
    // hallucinated value must not turn a valid booking into an "unauthorized"
    // dead-end. Tenant isolation still holds — the model cannot target another
    // clinic because the value is discarded, not honoured.
    const requestedClinicId = parsed.data.clinic_id ?? parsed.data.clinicId;
    if (requestedClinicId && requestedClinicId !== ctx.clinic.id) {
      console.warn(
        "[ai/tools] book_appointment ignored a non-session clinic_id",
      );
    }

    const result = await executeDualModeBooking(
      ctx.supabase,
      { id: ctx.clinic.id, timezone: ctx.clinic.timezone },
      {
        clinic_id: ctx.clinic.id,
        doctor_id: parsed.data.doctor_id ?? parsed.data.doctorId ?? null,
        patient_name: parsed.data.patient_name,
        patient_phone: parsed.data.patient_phone,
        slot_time: parsed.data.slot_time,
        appointment_type: parsed.data.appointment_type,
        chief_complaint: parsed.data.chief_complaint,
        service_id: parsed.data.service_id ?? parsed.data.serviceId ?? null,
        preConsultAnswers: parsed.data.preConsultAnswers ?? null,
      },
      ctx.bookingSource ?? "ai_agent",
    );

    if (!result.ok) {
      const hint = result.capabilityIssue
        ? " Tell the patient this mode isn't available for that doctor and offer the other mode or another doctor."
        : " Apologise briefly and offer a nearby slot from getAvailability or ask the patient to pick another time.";
      return { ok: false, error: result.error + hint };
    }

    const appt = result.appointment!;
    return {
      ok: true,
      appointment: {
        id: appt.id,
        patientId: appt.patientId,
        doctorId: appt.doctorId ?? undefined,
        serviceId: appt.serviceId,
        appointmentType: appt.appointmentType,
        start: appt.startTime,
        end: appt.endTime,
        status: appt.status,
        meetingLink: null,
      },
      confirmationMessage: appt.confirmationMessage,
    };
  },
};

export const AI_TOOLS: Tool[] = [
  getClinicInfo,
  getServices,
  getAvailability,
  getPreConsultationQuestions,
  createAppointment,
  bookAppointment,
  rescheduleAppointment,
  cancelAppointment,
];

export const AI_TOOL_NAMES = new Set(AI_TOOLS.map((tool) => tool.name));

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid arguments.";
}
