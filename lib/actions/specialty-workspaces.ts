"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canManageClinical, getCurrentClinic } from "@/lib/clinic-access";
import { findDoctorForUser } from "@/lib/consultation-queries";
import { createClient } from "@/lib/supabase/server";
import { APP_ROUTES } from "@/lib/constants";
import type { ActionResult } from "@/types";

/** Free-text clinical note field: trimmed, bounded, coalesces to null. */
const note = z
  .string()
  .trim()
  .max(6000, "Entry is too long.")
  .optional()
  .or(z.literal(""));

const optionalUuid = z.string().uuid().optional().nullable().or(z.literal(""));

const RISK_LEVELS = ["low", "moderate", "high", "crisis"] as const;
const SESSION_FORMATS = ["BIRP", "DAP"] as const;
const ASSESSMENT_TYPES = [
  "PHQ-9",
  "GAD-7",
  "BAI",
  "BDI-II",
  "PCL-5",
  "OCI-R",
  "AUDIT",
  "ASRS",
  "Other",
] as const;
const SESSION_TYPES = ["initial", "individual", "follow_up", "crisis", "group"] as const;
const DERM_FORM = ["cream", "ointment", "gel", "lotion"] as const;
const CONSENT = ["obtained", "declined", "documented"] as const;
const PHOTO_TYPES = ["baseline", "follow_up", "post_treatment"] as const;
const DISTRIBUTIONS = ["localized", "generalized", "dermatomal"] as const;

const textList = z
  .array(z.string().trim().max(80))
  .max(10)
  .optional()
  .default([]);

const savePsychSafetySchema = z.object({
  risk_level: z.enum(RISK_LEVELS).default("low"),
  mental_health_summary: note,
  current_concerns: note,
  risk_factors: note,
  emergency_contact: note,
});

const savePsychIntakeSchema = z.object({
  previous_therapy_history: note,
  previous_diagnosis: note,
  family_mental_health_history: note,
  psychosocial_background: note,
  stressors: note,
  substance_use_history: note,
});

const savePsychMseSchema = z.object({
  appearance_grooming: note,
  appearance_eye_contact: note,
  appearance_behaviour: note,
  speech_rate: note,
  speech_tone: note,
  speech_volume: note,
  mood_patient_reported: note,
  affect_observed: note,
  thought_process: note,
  thought_content: note,
  risk_thoughts: note,
  cognition_orientation: note,
  cognition_memory: note,
  cognition_insight: note,
  cognition_judgment: note,
});

const savePsychSessionSchema = z.object({
  session_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.")
    .optional()
    .or(z.literal("")),
  format: z.enum(SESSION_FORMATS),
  session_type: z.enum(SESSION_TYPES).default("individual"),
  behavior: note,
  intervention: note,
  response: note,
  observation_data: note,
  assessment: note,
  plan: note,
});

const savePsychAssessmentSchema = z.object({
  assessment_type: z.enum(ASSESSMENT_TYPES),
  score: z.coerce.number().min(0).max(150).optional().nullish(),
  severity: note,
  notes: note,
  conducted_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.")
    .optional()
    .or(z.literal("")),
});

const savePsychCarePlanSchema = z.object({
  therapy_goals: note,
  intervention_plan: note,
  homework_assignments: note,
  follow_up_frequency: note,
  psychiatrist_referral: z.boolean().optional().default(false),
  referral_notes: note,
});

const saveDermProfileSchema = z.object({
  skin_type: note,
  active_conditions: note,
  allergies: note,
  previous_skin_conditions: note,
  biopsy_alert: z.boolean().optional().default(false),
  biopsy_notes: note,
  previous_treatment_history: note,
});

const saveDermExamSchema = z.object({
  chief_complaints: textList,
  morphology: textList,
  distribution: z.enum(DISTRIBUTIONS).optional().nullable().or(z.literal("")),
  diagnosis: note,
  icd_code: z
    .string()
    .trim()
    .max(20, "ICD code is too long.")
    .optional()
    .or(z.literal("")),
  notes: note,
});

const saveDermProcedureSchema = z.object({
  procedure_name: z
    .string()
    .trim()
    .min(1, "Procedure name is required.")
    .max(120),
  procedure_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.")
    .optional()
    .or(z.literal("")),
  notes: note,
  consent_status: z.enum(CONSENT),
});

const saveDermPhotoSchema = z.object({
  document_id: optionalUuid,
  body_region: z.string().trim().min(1, "Body region is required.").max(80),
  photo_type: z.enum(PHOTO_TYPES),
  lesion_notes: note,
  paired_with: optionalUuid,
  taken_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.")
    .optional()
    .or(z.literal("")),
});

const saveDermRxSchema = z.object({
  id: optionalUuid,
  topical_form: z.enum(DERM_FORM).optional().nullable().or(z.literal("")),
  application_instructions: note,
  skincare_routine_am: note,
  skincare_routine_pm: note,
  patient_education: note,
});

const idSchema = z.object({ id: z.string().uuid() });

type Guard =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; clinicId: string }
  | { ok: false; result: ActionResult<string> };

async function guard(): Promise<Guard> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, result: { ok: false, message: "You must have a clinic to perform this action." } };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, result: { ok: false, message: "Your role cannot manage clinical records." } };
  }
  return { ok: true, supabase, clinicId: access.clinic.id };
}

/** Snapshots the signed-in user's display name for the update stamp. */
async function authorName(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  const meta = user.user_metadata;
  return (
    (typeof meta?.name === "string" && meta.name) ||
    (typeof meta?.full_name === "string" && meta.full_name) ||
    user.email ||
    null
  );
}

/** The logged-in user's doctor id, so event rows can point at the clinician. */
async function doctorId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
): Promise<string | null> {
  const doctor = await findDoctorForUser(supabase, clinicId);
  return doctor?.id ?? null;
}

function ok(): ActionResult<string> {
  return { ok: true, data: "Saved" };
}

function err(first: z.ZodIssue | undefined, fallback = "Invalid input."): ActionResult<string> {
  return { ok: false, message: first?.message ?? fallback };
}

function firstIssue(result: { error: z.ZodError }): z.ZodIssue | undefined {
  return result.error.issues[0];
}

/* ------------------------------------------------------------------------- */
/* Psychology                                                                */
/* ------------------------------------------------------------------------- */

export async function savePsychSafetyAction(
  patientId: string,
  raw: unknown,
): Promise<ActionResult<string>> {
  const parsed = savePsychSafetySchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const me = await authorName(g.supabase);
  const { error } = await g.supabase
    .from("psych_safety")
    .upsert(
      {
        clinic_id: g.clinicId,
        patient_id: patientId,
        risk_level: parsed.data.risk_level,
        mental_health_summary: parsed.data.mental_health_summary ?? null,
        current_concerns: parsed.data.current_concerns ?? null,
        risk_factors: parsed.data.risk_factors ?? null,
        emergency_contact: parsed.data.emergency_contact ?? null,
        updated_by: me,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "patient_id" },
    );
  if (error) return { ok: false, message: error.message };
  return ok();
}

export async function savePsychIntakeAction(
  patientId: string,
  raw: unknown,
): Promise<ActionResult<string>> {
  const parsed = savePsychIntakeSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const me = await authorName(g.supabase);
  const { error } = await g.supabase
    .from("psych_intake")
    .upsert(
      {
        clinic_id: g.clinicId,
        patient_id: patientId,
        previous_therapy_history: parsed.data.previous_therapy_history ?? null,
        previous_diagnosis: parsed.data.previous_diagnosis ?? null,
        family_mental_health_history: parsed.data.family_mental_health_history ?? null,
        psychosocial_background: parsed.data.psychosocial_background ?? null,
        stressors: parsed.data.stressors ?? null,
        substance_use_history: parsed.data.substance_use_history ?? null,
        updated_by: me,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "patient_id" },
    );
  if (error) return { ok: false, message: error.message };
  return ok();
}

export async function savePsychMseAction(
  patientId: string,
  raw: unknown,
): Promise<ActionResult<string>> {
  const parsed = savePsychMseSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const me = await authorName(g.supabase);
  const { error } = await g.supabase
    .from("psych_mse")
    .upsert(
      {
        clinic_id: g.clinicId,
        patient_id: patientId,
        appearance_grooming: parsed.data.appearance_grooming ?? null,
        appearance_eye_contact: parsed.data.appearance_eye_contact ?? null,
        appearance_behaviour: parsed.data.appearance_behaviour ?? null,
        speech_rate: parsed.data.speech_rate ?? null,
        speech_tone: parsed.data.speech_tone ?? null,
        speech_volume: parsed.data.speech_volume ?? null,
        mood_patient_reported: parsed.data.mood_patient_reported ?? null,
        affect_observed: parsed.data.affect_observed ?? null,
        thought_process: parsed.data.thought_process ?? null,
        thought_content: parsed.data.thought_content ?? null,
        risk_thoughts: parsed.data.risk_thoughts ?? null,
        cognition_orientation: parsed.data.cognition_orientation ?? null,
        cognition_memory: parsed.data.cognition_memory ?? null,
        cognition_insight: parsed.data.cognition_insight ?? null,
        cognition_judgment: parsed.data.cognition_judgment ?? null,
        updated_by: me,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "patient_id" },
    );
  if (error) return { ok: false, message: error.message };
  return ok();
}

export async function savePsychCarePlanAction(
  patientId: string,
  raw: unknown,
): Promise<ActionResult<string>> {
  const parsed = savePsychCarePlanSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const me = await authorName(g.supabase);
  const { error } = await g.supabase
    .from("psych_care_plans")
    .upsert(
      {
        clinic_id: g.clinicId,
        patient_id: patientId,
        therapy_goals: parsed.data.therapy_goals ?? null,
        intervention_plan: parsed.data.intervention_plan ?? null,
        homework_assignments: parsed.data.homework_assignments ?? null,
        follow_up_frequency: parsed.data.follow_up_frequency ?? null,
        psychiatrist_referral: parsed.data.psychiatrist_referral,
        referral_notes: parsed.data.referral_notes ?? null,
        updated_by: me,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "patient_id" },
    );
  if (error) return { ok: false, message: error.message };
  return ok();
}

export async function savePsychSessionAction(
  patientId: string,
  raw: unknown,
): Promise<ActionResult<string>> {
  const parsed = savePsychSessionSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { data, error } = await g.supabase
    .from("psych_sessions")
    .insert({
      clinic_id: g.clinicId,
      patient_id: patientId,
      doctor_id: await doctorId(g.supabase, g.clinicId),
      ...parsed.data,
      session_date: parsed.data.session_date || new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };
  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: data.id };
}

export async function deletePsychSessionAction(id: string): Promise<ActionResult<string>> {
  const parsed = idSchema.safeParse({ id });
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { error } = await g.supabase.from("psych_sessions").delete().eq("id", id).eq("clinic_id", g.clinicId);
  if (error) return { ok: false, message: error.message };
  return ok();
}

export async function savePsychAssessmentAction(
  patientId: string,
  raw: unknown,
): Promise<ActionResult<string>> {
  const parsed = savePsychAssessmentSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { data, error } = await g.supabase
    .from("psych_assessments")
    .insert({
      clinic_id: g.clinicId,
      patient_id: patientId,
      doctor_id: await doctorId(g.supabase, g.clinicId),
      ...parsed.data,
      score: parsed.data.score ?? null,
      severity: parsed.data.severity || null,
      notes: parsed.data.notes || null,
      conducted_at: parsed.data.conducted_at || new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };
  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: data.id };
}

export async function deletePsychAssessmentAction(id: string): Promise<ActionResult<string>> {
  const parsed = idSchema.safeParse({ id });
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { error } = await g.supabase
    .from("psych_assessments")
    .delete()
    .eq("id", id)
    .eq("clinic_id", g.clinicId);
  if (error) return { ok: false, message: error.message };
  return ok();
}

/* ------------------------------------------------------------------------- */
/* Dermatology                                                               */
/* ------------------------------------------------------------------------- */

export async function saveDermProfileAction(
  patientId: string,
  raw: unknown,
): Promise<ActionResult<string>> {
  const parsed = saveDermProfileSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const me = await authorName(g.supabase);
  const { error } = await g.supabase
    .from("derm_profiles")
    .upsert(
      {
        clinic_id: g.clinicId,
        patient_id: patientId,
        skin_type: parsed.data.skin_type ?? null,
        active_conditions: parsed.data.active_conditions ?? null,
        allergies: parsed.data.allergies ?? null,
        previous_skin_conditions: parsed.data.previous_skin_conditions ?? null,
        biopsy_alert: parsed.data.biopsy_alert,
        biopsy_notes: parsed.data.biopsy_notes ?? null,
        previous_treatment_history: parsed.data.previous_treatment_history ?? null,
        updated_by: me,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "patient_id" },
    );
  if (error) return { ok: false, message: error.message };
  return ok();
}

export async function saveDermExamAction(
  patientId: string,
  raw: unknown,
): Promise<ActionResult<string>> {
  const parsed = saveDermExamSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { data, error } = await g.supabase
    .from("derm_exams")
    .insert({
      clinic_id: g.clinicId,
      patient_id: patientId,
      doctor_id: await doctorId(g.supabase, g.clinicId),
      ...parsed.data,
      distribution: parsed.data.distribution || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };
  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: data.id };
}

export async function deleteDermExamAction(id: string): Promise<ActionResult<string>> {
  const parsed = idSchema.safeParse({ id });
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { error } = await g.supabase.from("derm_exams").delete().eq("id", id).eq("clinic_id", g.clinicId);
  if (error) return { ok: false, message: error.message };
  return ok();
}

export async function saveDermProcedureAction(
  patientId: string,
  raw: unknown,
): Promise<ActionResult<string>> {
  const parsed = saveDermProcedureSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { data, error } = await g.supabase
    .from("derm_procedures")
    .insert({
      clinic_id: g.clinicId,
      patient_id: patientId,
      doctor_id: await doctorId(g.supabase, g.clinicId),
      ...parsed.data,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };
  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: data.id };
}

export async function deleteDermProcedureAction(id: string): Promise<ActionResult<string>> {
  const parsed = idSchema.safeParse({ id });
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { error } = await g.supabase
    .from("derm_procedures")
    .delete()
    .eq("id", id)
    .eq("clinic_id", g.clinicId);
  if (error) return { ok: false, message: error.message };
  return ok();
}

export async function saveDermPhotoAction(
  patientId: string,
  raw: unknown,
): Promise<ActionResult<string>> {
  const parsed = saveDermPhotoSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { data, error } = await g.supabase
    .from("derm_photos")
    .insert({
      clinic_id: g.clinicId,
      patient_id: patientId,
      doctor_id: await doctorId(g.supabase, g.clinicId),
      ...parsed.data,
      document_id: parsed.data.document_id || null,
      paired_with: parsed.data.paired_with || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };
  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: data.id };
}

export async function deleteDermPhotoAction(id: string): Promise<ActionResult<string>> {
  const parsed = idSchema.safeParse({ id });
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { error } = await g.supabase
    .from("derm_photos")
    .delete()
    .eq("id", id)
    .eq("clinic_id", g.clinicId);
  if (error) return { ok: false, message: error.message };
  return ok();
}

export async function saveDermRxAction(
  patientId: string,
  raw: unknown,
): Promise<ActionResult<string>> {
  const parsed = saveDermRxSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { id, ...values } = parsed.data;
  const payload = {
    ...values,
    topical_form: parsed.data.topical_form || null,
  };
  // Editing the latest row (form passes its id back) vs. a fresh consultation.
  if (id) {
    const { error } = await g.supabase
      .from("derm_prescriptions")
      .update(payload)
      .eq("id", id)
      .eq("clinic_id", g.clinicId)
      .eq("patient_id", patientId);
    if (error) return { ok: false, message: error.message };
    return ok();
  }

  const { error } = await g.supabase.from("derm_prescriptions").insert({
    clinic_id: g.clinicId,
    patient_id: patientId,
    doctor_id: await doctorId(g.supabase, g.clinicId),
    ...payload,
  });
  if (error) return { ok: false, message: error.message };
  return ok();
}