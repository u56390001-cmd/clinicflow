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
  execute: (ctx: ToolContext, args: unknown) => Promise<Record<string, unknown>>;
};

const clinicIdSchema = z.string().uuid().optional();

const localDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use YYYY-MM-DDTHH:mm clinic-local time.");
const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD clinic-local date.");
const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM.");

const timezoneSchema = z
  .string()
  .trim()
  .min(1, "Timezone is required.")
  .max(64, "Timezone must be 64 characters or fewer.");

const patientSchema = z.object({
  name: z.string().trim().min(1, "Patient name is required.").max(120),
  email: z.string().trim().email("Enter a valid email.").max(254).optional().or(z.literal("")),
  phone: z.string().trim().min(3, "Phone must be at least 3 characters.").max(32).optional().or(z.literal("")),
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

const objectSchema = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({
  type: "object",
  properties,
  required,
});

const getClinicInfoSchema = z.object({ clinicId: clinicIdSchema });
const getClinicInfo: Tool = {
  name: "getClinicInfo",
  description:
    "Return the clinic's name, doctor, address, phone, email, working hours, its configured FAQs, booking rules and cancellation policy, plus every bookable doctor's profile (specialty, qualification, experience, consultation fee, short bio). Use this to answer questions about clinic policies, hours, contact details, FAQs, doctor fees and doctor profiles.",
  parameters: objectSchema(
    {
      clinicId: { type: "string", description: "The clinic id (optional)." },
    },
  ),
  async execute(ctx, rawArgs) {
    const parsed = getClinicInfoSchema.safeParse(rawArgs);
    if (!parsed.success) return { ok: false, error: "Invalid arguments: " + firstIssue(parsed.error) };

    const clinicAccess = resolveClinicId(ctx, parsed.data.clinicId);
    if (!clinicAccess.ok) return { ok: false, error: clinicAccess.error };

    const [{ data: rules }, { data: doctors }, { data: clinicRow }] =
      await Promise.all([
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
            "id, name, specialty, qualification, years_of_experience, consultation_fee, professional_description",
          )
          .eq("clinic_id", clinicAccess.clinicId)
          .eq("is_visible", true)
          .order("created_at", { ascending: true }),
        ctx.supabase
          .from("clinics")
          .select("name, doctor_name, phone, email, address")
          .eq("id", clinicAccess.clinicId)
          .maybeSingle(),
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
        name: clinicRow?.name ?? null,
        doctorName: clinicRow?.doctor_name ?? null,
        phone: clinicRow?.phone ?? null,
        email: clinicRow?.email ?? null,
        address: clinicRow?.address ?? null,
      },
      // Bookable doctors. Empty for single-practitioner clinics.
      doctors: (doctors ?? []).map((doctor) => ({
        id: doctor.id,
        name: doctor.name,
        specialty: doctor.specialty,
        qualification: doctor.qualification,
        yearsOfExperience: doctor.years_of_experience,
        consultationFee: doctor.consultation_fee,
        about: doctor.professional_description,
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
    "Return the clinic's active (bookable) services with name, description, duration, price and the doctor tied to the service when one is. Use this to answer questions about services and pricing.",
  parameters: objectSchema(
    { clinicId: { type: "string", description: "The clinic id (optional)." } },
  ),
  async execute(ctx, rawArgs) {
    const parsed = getServicesSchema.safeParse(rawArgs);
    if (!parsed.success) return { ok: false, error: "Invalid arguments: " + firstIssue(parsed.error) };

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
      serviceId: { type: "string", description: "The service id from getServices." },
      date: { type: "string", description: "Clinic-local date YYYY-MM-DD." },
      preferredTime: { type: "string", description: "Optional preferred start time HH:MM (clinic-local)." },
      doctorId: { type: "string", description: "Optional doctor id from getClinicInfo when the patient chose one." },
      timezone: { type: "string", description: "The clinic's IANA timezone (optional)." },
    },
    ["serviceId", "date"],
  ),
  async execute(ctx, rawArgs) {
    const parsed = getAvailabilitySchema.safeParse(rawArgs);
    if (!parsed.success) return { ok: false, error: "Invalid arguments: " + firstIssue(parsed.error) };

    const clinicAccess = resolveClinicId(ctx, parsed.data.clinicId);
    if (!clinicAccess.ok) return { ok: false, error: clinicAccess.error };

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
      serviceId: { type: "string", description: "The service id from getServices." },
      doctorId: { type: "string", description: "Optional doctor id from getClinicInfo when the patient chose one." },
    },
    ["serviceId"],
  ),
  async execute(ctx, rawArgs) {
    const parsed = getPreConsultationQuestionsSchema.safeParse(rawArgs);
    if (!parsed.success) return { ok: false, error: "Invalid arguments: " + firstIssue(parsed.error) };

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
        answerText: z.string().trim().min(1, "An answer text is required.").max(2000),
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
      serviceId: { type: "string", description: "The service id from getServices." },
      doctorId: { type: "string", description: "Optional doctor id from getClinicInfo when the patient chose one." },
      startTime: { type: "string", description: "Exact clinic-local start YYYY-MM-DDTHH:mm from getAvailability." },
      timezone: { type: "string", description: "The clinic's IANA timezone (optional)." },
      preConsultAnswers: {
        type: "array",
        description: "The patient's answers to the clinic's pre-consultation questions, one object per question asked.",
        items: {
          type: "object",
          properties: {
            questionId: { type: "string", description: "The question id from getPreConsultationQuestions." },
            answerText: { type: "string", description: "The patient's answer text, verbatim." },
          },
          required: ["questionId", "answerText"],
        },
      },
    },
    ["patient", "serviceId", "startTime"],
  ),
  async execute(ctx, rawArgs) {
    const parsed = createAppointmentSchema.safeParse(rawArgs);
    if (!parsed.success) return { ok: false, error: "Invalid arguments: " + firstIssue(parsed.error) };

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
        start: utcIsoToClinicLocalInput(appointment.start_time, ctx.clinic.timezone),
        end: utcIsoToClinicLocalInput(appointment.end_time, ctx.clinic.timezone),
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
      appointmentId: { type: "string", description: "The appointment id returned by createAppointment." },
      startTime: { type: "string", description: "New clinic-local start YYYY-MM-DDTHH:mm (from getAvailability)." },
      timezone: { type: "string", description: "The clinic's IANA timezone (optional)." },
    },
    ["appointmentId", "startTime"],
  ),
  async execute(ctx, rawArgs) {
    const parsed = rescheduleAppointmentSchema.safeParse(rawArgs);
    if (!parsed.success) return { ok: false, error: "Invalid arguments: " + firstIssue(parsed.error) };

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
        start: utcIsoToClinicLocalInput(result.appointment.start_time, ctx.clinic.timezone),
        end: utcIsoToClinicLocalInput(result.appointment.end_time, ctx.clinic.timezone),
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
      appointmentId: { type: "string", description: "The appointment id returned by createAppointment." },
      timezone: { type: "string", description: "The clinic's IANA timezone (optional)." },
    },
    ["appointmentId"],
  ),
  async execute(ctx, rawArgs) {
    const parsed = cancelAppointmentSchema.safeParse(rawArgs);
    if (!parsed.success) return { ok: false, error: "Invalid arguments: " + firstIssue(parsed.error) };

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
      appointment: { id: result.appointment.id, status: result.appointment.status },
    };
  },
};

export const AI_TOOLS: Tool[] = [
  getClinicInfo,
  getServices,
  getAvailability,
  getPreConsultationQuestions,
  createAppointment,
  rescheduleAppointment,
  cancelAppointment,
];

export const AI_TOOL_NAMES = new Set(AI_TOOLS.map((tool) => tool.name));

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid arguments.";
}
