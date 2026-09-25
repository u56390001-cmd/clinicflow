"use server";

import { z } from "zod";

import { getCurrentClinic, canWriteClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import { replacePreConsultationQuestions } from "@/lib/actions/pre-consultation";
import {
  serviceSchema,
  serviceSlotTemplatesSchema,
} from "@/lib/validation/schemas";
import { parsePreConsultationQuestionsJson } from "@/lib/actions/pre-consultation";
import type { ActionResult } from "@/types";
import type { ServiceCategory } from "@/types/database";

const serviceIdSchema = z.object({ serviceId: z.uuid() });
const serviceStatusSchema = z.object({
  serviceId: z.uuid(),
  status: z.enum(["active", "inactive"]),
});

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function toNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function formJsonArray(formData: FormData, key: string): string {
  const raw = formString(formData, key);
  if (!raw.trim()) return "[]";
  try {
    JSON.parse(raw);
    return raw;
  } catch {
    return "[]";
  }
}

/**
 * Validate an optional doctor tie before writing. Returns null when absent,
 * the doctor id when it belongs to the caller's clinic, or an error result.
 * RLS scopes the select; the composite FK is the database-level backstop.
 */
async function resolveDoctorId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
  doctorId: string | undefined,
): Promise<{ ok: true; doctorId: string | null } | { ok: false; error: ActionResult }> {
  if (!doctorId) return { ok: true, doctorId: null };
  const { data: doctor } = await supabase
    .from("doctors")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("id", doctorId)
    .maybeSingle();
  if (!doctor) {
    return {
      ok: false,
      error: { ok: false, message: "That doctor doesn't belong to your clinic." },
    };
  }
  return { ok: true, doctorId };
}

/** The column payload shared by create and update. */
function serviceRowPayload(parsed: z.infer<typeof serviceSchema>) {
  const followUpFeeRaw = parsed.followUpFee == null ? null : parsed.followUpFee;
  const followUpValid =
    parsed.followUpValidFor == null || parsed.followUpValidFor === ""
      ? null
      : parsed.followUpValidFor;
  return {
    name: parsed.name,
    description: toNull(parsed.description ?? ""),
    duration_minutes: parsed.durationMinutes,
    price: parsed.price,
    status: parsed.status,
    category: (parsed.category || "consultation") as ServiceCategory,
    duration_or_report_time: toNull(parsed.durationOrReportTime ?? ""),
    follow_up_fee: followUpFeeRaw,
    follow_up_valid_for: followUpValid,
    follow_up_period: parsed.followUpPeriod || null,
    preparation_instructions: toNull(parsed.preparationInstructions ?? ""),
    consultation_mode: parsed.consultationMode,
  };
}

/**
 * Replace a service's slot templates wholesale (the form submits the full
 * list). An empty list clears every template for the service.
 */
async function replaceServiceSlotTemplates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
  serviceId: string,
  rawJson: string,
): Promise<ActionResult> {
  const parsed = serviceSlotTemplatesSchema.safeParse({ serviceId, templatesJson: rawJson });
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the slot templates and try again.",
    };
  }

  const { error: deleteError } = await supabase
    .from("service_slot_templates")
    .delete()
    .eq("clinic_id", clinicId)
    .eq("service_id", serviceId);
  if (deleteError) {
    console.error("[replaceServiceSlotTemplates] delete failed", {
      clinicId,
      serviceId,
      code: deleteError.code,
      message: deleteError.message,
    });
    return { ok: false, message: "We couldn't update this service's slots. Please try again." };
  }

  const templates = Array.from(
    new Map(
      parsed.data.templatesJson.map((t) => [`${t.dayOfWeek}-${t.startTime}`, t]),
    ).values(),
  );
  if (templates.length === 0) return { ok: true, data: undefined };

  const rows = templates.map((t) => ({
    clinic_id: clinicId,
    service_id: serviceId,
    day_of_week: t.dayOfWeek,
    slot_name: t.slotName,
    start_time: `${t.startTime}:00`,
    end_time: `${t.endTime}:00`,
    patient_limit: t.patientLimit ?? null,
  }));
  const { error: insertError } = await supabase
    .from("service_slot_templates")
    .insert(rows);
  if (insertError) {
    console.error("[replaceServiceSlotTemplates] insert failed", {
      clinicId,
      serviceId,
      code: insertError.code,
      message: insertError.message,
    });
    return { ok: false, message: "We couldn't save this service's slots. Please try again." };
  }
  return { ok: true, data: undefined };
}

/**
 * Create a service for the signed-in user's current clinic. Authorization:
 * owner/admin only (RLS `services_insert_admin` enforces the same rule).
 * Phase 21: the detailed field set (category, follow-up, preparation,
 * consultation mode) is persisted alongside, and any submitted slot templates
 * are stored in `service_slot_templates`.
 */
export async function createServiceAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseServiceForm(formData);
  if (!parsed.ok) return parsed.error;

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to add services." };
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can manage services." };
  }

  const doctor = await resolveDoctorId(supabase, access.clinic.id, parsed.data.doctorId || undefined);
  if (!doctor.ok) return doctor.error;

  // Validate the pre-consultation questions payload BEFORE creating the service
  // so an invalid set never leaves a half-created (ghost) service behind.
  try {
    parsePreConsultationQuestionsJson(
      formString(formData, "preConsultationQuestionsJson"),
    );
  } catch {
    return {
      ok: false,
      message:
        "The pre-consultation questions are invalid. Check them and try again.",
    };
  }

  const { data: service, error } = await supabase
    .from("services")
    .insert({
      clinic_id: access.clinic.id,
      ...serviceRowPayload(parsed.data),
      doctor_id: doctor.doctorId,
    })
    .select("id")
    .single();

  if (error || !service) {
    console.error("[createServiceAction] services insert failed", {
      clinicId: access.clinic.id,
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
    return { ok: false, message: "We couldn't add this service. Please try again." };
  }

  const questionsSaved = await replacePreConsultationQuestions(
    supabase,
    access.clinic.id,
    { serviceId: service.id },
    formString(formData, "preConsultationQuestionsJson"),
  );
  if (!questionsSaved.ok) {
    // Best-effort rollback: don't leave a half-created service behind when a
    // dependent write fails.
    await supabase
      .from("services")
      .delete()
      .eq("id", service.id)
      .eq("clinic_id", access.clinic.id);
    return questionsSaved;
  }

  const templatesSaved = await replaceServiceSlotTemplates(
    supabase,
    access.clinic.id,
    service.id,
    formJsonArray(formData, "templatesJson"),
  );
  if (!templatesSaved.ok) {
    await supabase
      .from("services")
      .delete()
      .eq("id", service.id)
      .eq("clinic_id", access.clinic.id);
    return templatesSaved;
  }

  return { ok: true, data: undefined };
}

/**
 * Update a service. `serviceId` is client-supplied but harmless: the update
 * is scoped to the caller's clinic (`.eq("clinic_id", ...)`) AND gated by the
 * `services_update_admin` RLS policy, so a foreign service id can never be
 * touched. Slot templates are replaced wholesale alongside the profile.
 */
export async function updateServiceAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const idParsed = serviceIdSchema.safeParse({ serviceId: formData.get("serviceId") });
  if (!idParsed.success) {
    return { ok: false, message: "Missing service id." };
  }

  const parsed = parseServiceForm(formData);
  if (!parsed.ok) return parsed.error;

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to edit services." };
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can manage services." };
  }

  const doctor = await resolveDoctorId(supabase, access.clinic.id, parsed.data.doctorId || undefined);
  if (!doctor.ok) return doctor.error;

  // Validate the pre-consultation questions payload before touching any rows.
  try {
    parsePreConsultationQuestionsJson(
      formString(formData, "preConsultationQuestionsJson"),
    );
  } catch {
    return {
      ok: false,
      message:
        "The pre-consultation questions are invalid. Check them and try again.",
    };
  }

  const { error } = await supabase
    .from("services")
    .update({
      ...serviceRowPayload(parsed.data),
      doctor_id: doctor.doctorId,
    })
    .eq("id", idParsed.data.serviceId)
    .eq("clinic_id", access.clinic.id);

  if (error) {
    console.error("[updateServiceAction] services update failed", {
      serviceId: idParsed.data.serviceId,
      clinicId: access.clinic.id,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, message: "We couldn't save this service. Please try again." };
  }

  const questionsSaved = await replacePreConsultationQuestions(
    supabase,
    access.clinic.id,
    { serviceId: idParsed.data.serviceId },
    formString(formData, "preConsultationQuestionsJson"),
  );
  if (!questionsSaved.ok) return questionsSaved;

  return await replaceServiceSlotTemplates(
    supabase,
    access.clinic.id,
    idParsed.data.serviceId,
    formJsonArray(formData, "templatesJson"),
  );
}

/**
 * Soft-delete / reactivate a service via `status`. Inactive services are
 * never offered to patients by later phases (AI agent, widget).
 */
export async function setServiceStatusAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = serviceStatusSchema.safeParse({
    serviceId: formData.get("serviceId"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Invalid service or status." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to manage services." };
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can manage services." };
  }

  const { error } = await supabase
    .from("services")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.serviceId)
    .eq("clinic_id", access.clinic.id);

  if (error) {
    console.error("[setServiceStatusAction] services status update failed", {
      serviceId: parsed.data.serviceId,
      clinicId: access.clinic.id,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, message: "We couldn't update this service. Please try again." };
  }

  return { ok: true, data: undefined };
}

/**
 * Remove a service from the catalogue. The service's slot templates are
 * removed by the ON DELETE CASCADE composite FK; a service still referenced
 * by appointments is rejected by the `appointments` FK (NO ACTION), so
 * real-world tidy-ups should deactivate instead.
 */
export async function deleteServiceAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = serviceIdSchema.safeParse({ serviceId: formData.get("serviceId") });
  if (!parsed.success) {
    return { ok: false, message: "Missing service id." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to manage services." };
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can manage services." };
  }

  const { error } = await supabase
    .from("services")
    .delete()
    .eq("id", parsed.data.serviceId)
    .eq("clinic_id", access.clinic.id);

  if (error) {
    console.error("[deleteServiceAction] services delete failed", {
      serviceId: parsed.data.serviceId,
      clinicId: access.clinic.id,
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: "We couldn't remove this service. Please try again." };
  }

  return { ok: true, data: undefined };
}

function parseServiceForm(
  formData: FormData,
):
  | { ok: true; data: z.infer<typeof serviceSchema> }
  | { ok: false; error: ActionResult } {
  const followUpFeeRaw = formString(formData, "followUpFee");
  const followUpFee =
    followUpFeeRaw.trim() === "" ? null : Number(followUpFeeRaw);

  const parsed = serviceSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    durationMinutes: Number(formData.get("durationMinutes")),
    price: Number(formData.get("price")),
    doctorId: formData.get("doctorId") ?? "",
    status: formData.get("status"),
    category: formData.get("category") ?? "",
    durationOrReportTime: formData.get("durationOrReportTime") ?? "",
    followUpFee,
    followUpValidFor: formData.get("followUpValidFor") ?? "",
    followUpPeriod: formData.get("followUpPeriod") ?? "",
    preparationInstructions: formData.get("preparationInstructions") ?? "",
    consultationMode: formData.get("consultationMode") ?? "single_slot",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Check the service details and try again.",
      },
    };
  }
  return { ok: true, data: parsed.data };
}
