"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canManageClinical, getCurrentClinic } from "@/lib/clinic-access";
import { APP_ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { createWidgetClient } from "@/lib/supabase/widget";
import type { ActionResult } from "@/types";
import type { AssessmentScheduleRule } from "@/types/database";

/**
 * Phase 6 — recurring assessment reminder schedules.
 *
 * `assessment_schedule_rules` has RLS enabled with no Data-API policies (like
 * `patient_share_links`), so every read/write goes through the service-role
 * client *after* the caller is authorised against the signed-in clinic here.
 */

const uuidSchema = z.string().uuid();

const createSchema = z
  .object({
    patientId: uuidSchema,
    assessmentType: z.string().trim().min(1).max(120).nullable().optional(),
    templateId: uuidSchema.nullable().optional(),
    cadenceDays: z.number().int().min(1).max(365),
  })
  .refine((value) => Boolean(value.assessmentType) || Boolean(value.templateId), {
    message: "Choose an assessment.",
  });

export async function listAssessmentScheduleRulesAction(
  patientId: string,
): Promise<ActionResult<AssessmentScheduleRule[]>> {
  if (!uuidSchema.safeParse(patientId).success) {
    return { ok: false, message: "Missing patient id." };
  }
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to view schedules." };
  }

  const widget = createWidgetClient();
  const { data, error } = await widget
    .from("assessment_schedule_rules")
    .select("*")
    .eq("clinic_id", access.clinic.id)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[listAssessmentScheduleRules] query failed", error.message);
    return { ok: false, message: "We couldn't load the schedules." };
  }
  return { ok: true, data: (data ?? []) as AssessmentScheduleRule[] };
}

export async function createAssessmentScheduleRuleAction(input: {
  patientId: string;
  assessmentType?: string | null;
  templateId?: string | null;
  cadenceDays: number;
}): Promise<ActionResult<AssessmentScheduleRule>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "That schedule is not valid.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to add schedules." };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't manage assessment schedules." };
  }
  const clinicId = access.clinic.id;
  const { patientId, assessmentType, templateId, cadenceDays } = parsed.data;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "You need to be signed in to do that." };
  }

  const widget = createWidgetClient();

  const { data: patient } = await widget
    .from("patients")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("id", patientId)
    .maybeSingle();
  if (!patient) {
    return { ok: false, message: "That patient is not in this clinic." };
  }

  let resolvedType: string | null = null;
  let resolvedTemplateId: string | null = null;
  if (templateId) {
    const { data: template } = await widget
      .from("assessment_templates")
      .select("id, name")
      .eq("clinic_id", clinicId)
      .eq("id", templateId)
      .maybeSingle();
    if (!template) {
      return { ok: false, message: "That assessment is not in this clinic." };
    }
    resolvedType = template.name;
    resolvedTemplateId = template.id;
  } else if (assessmentType) {
    resolvedType = assessmentType;
  }

  const nextRunAt = new Date(
    Date.now() + cadenceDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await widget
    .from("assessment_schedule_rules")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      assessment_type: resolvedType,
      template_id: resolvedTemplateId,
      cadence_days: cadenceDays,
      next_run_at: nextRunAt,
      active: true,
      created_by: user.id,
    })
    .select("*")
    .maybeSingle();
  if (error || !data) {
    console.error("[createAssessmentScheduleRule] insert failed", error?.message);
    return { ok: false, message: "We couldn't save that schedule." };
  }

  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: data as AssessmentScheduleRule };
}

export async function setAssessmentScheduleRuleActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<AssessmentScheduleRule>> {
  if (!uuidSchema.safeParse(id).success) {
    return { ok: false, message: "Missing schedule id." };
  }
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to update schedules." };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't manage assessment schedules." };
  }

  const widget = createWidgetClient();
  const { data, error } = await widget
    .from("assessment_schedule_rules")
    .update({ active })
    .eq("id", id)
    .eq("clinic_id", access.clinic.id)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    return { ok: false, message: "We couldn't update that schedule." };
  }

  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: data as AssessmentScheduleRule };
}

export async function deleteAssessmentScheduleRuleAction(
  id: string,
): Promise<ActionResult<null>> {
  if (!uuidSchema.safeParse(id).success) {
    return { ok: false, message: "Missing schedule id." };
  }
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to remove schedules." };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't manage assessment schedules." };
  }

  const widget = createWidgetClient();
  const { error } = await widget
    .from("assessment_schedule_rules")
    .delete()
    .eq("id", id)
    .eq("clinic_id", access.clinic.id);
  if (error) {
    return { ok: false, message: "We couldn't remove that schedule." };
  }

  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: null };
}
