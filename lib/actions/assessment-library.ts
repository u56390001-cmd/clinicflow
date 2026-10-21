"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  ASSESSMENT_TARGET_SPECIALTIES,
  ASSESSMENT_TEMPLATE_STATUSES,
  catalogEntryByKey,
} from "@/lib/assessment-library";
import { canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import { requireFeature } from "@/lib/entitlements";
import { APP_ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";
import type {
  AssessmentInterpretationRule,
  AssessmentQuestion,
  AssessmentScoring,
  AssessmentTargetSpecialty,
  AssessmentTemplate,
  AssessmentTemplateStatus,
} from "@/types/database";

/**
 * Server actions for Settings → Clinical Settings → Assessment Library
 * (migration 0085).
 *
 * Reads are open to every clinic member: the Psychometrics workspace needs the
 * active templates to log assessments against and to send to patients. Writes
 * are owner/admin, matching `canWriteClinic` and the RLS policies in 0085
 * (`is_clinic_admin`), so the API cannot bypass the UI's own guard.
 *
 * The builder/manager surfaces call these directly with structured payloads
 * (not `useActionState` forms) — the builder is a multi-step dialog that would
 * otherwise have to round-trip its whole taxonomy through hidden inputs.
 */

const optionSchema = z.object({
  label: z.string().trim().min(1, "Give every option a label.").max(140),
  value: z.number().int().min(0).max(99),
});

const questionSchema = z.object({
  id: z.string().trim().min(1).max(60),
  text: z.string().trim().min(1, "Question text is required.").max(400),
  type: z.enum(["single", "multiple", "text", "scale"]),
  options: z.array(optionSchema),
  required: z.boolean().default(true),
});

const bandSchema = z.object({
  min: z.number().int().min(0),
  max: z.number().int().min(0),
  label: z.string().trim().min(1, "Every severity band needs a label.").max(100),
});

const interpretationRuleSchema = z.object({
  min: z.number().int().min(0),
  max: z.number().int().min(0),
  text: z.string().trim().min(1, "Every interpretation rule needs guidance text.").max(1000),
});

const templateDocSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1, "Name is required.").max(120),
  description: z.string().trim().max(500),
  category_id: z.string().uuid().nullable(),
  target_specialty: z.enum(ASSESSMENT_TARGET_SPECIALTIES),
  status: z.enum(ASSESSMENT_TEMPLATE_STATUSES),
  questions: z.array(questionSchema).max(100),
  scoring: z.object({
    method: z.enum(["sum", "average", "manual"]),
    min_score: z.number().int().min(0).max(999),
    max_score: z.number().int().min(0).max(999),
    bands: z.array(bandSchema).max(60),
  }),
  interpretation: z.array(interpretationRuleSchema).max(60),
});

const categorySchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1, "Category name is required.").max(120),
  isActive: z.boolean().default(true),
});

/** Write access gate, mirroring `requireWriteAccess` in medicines.ts. */
async function requireAdmin(): Promise<
  | { ok: false; message: string }
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; clinicId: string; userId: string | null }
> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to manage the Assessment Library." };
  }
  // The assessment library is a Practice-plan module: the route guard stops
  // the clinic opening the page, this stops the actions being called directly.
  const entitled = await requireFeature(
    supabase,
    access.clinic.id,
    "assessments",
    "Assessment library",
  );
  if (!entitled.ok) return { ok: false, message: entitled.message };
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can change the Assessment Library." };
  }
  const { data } = await supabase.auth.getUser();
  return {
    ok: true,
    supabase,
    clinicId: access.clinic.id,
    userId: data.user?.id ?? null,
  };
}

const SETTINGS_PATH = APP_ROUTES.app.assessmentLibrary;

/* ------------------------------------------------------------------------- */
/* Templates                                                                 */
/* ------------------------------------------------------------------------- */

/**
 * Active templates for the Psychometrics workspace. Loaded by the client tab
 * (and the registration/consultation surfaces) so the list always reflects
 * the latest settings without a full page build.
 */
export async function getActiveAssessmentTemplatesAction(): Promise<
  ActionResult<{ templates: AssessmentTemplate[] }>
> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to use the Assessment Library." };
  }

  const { data, error } = await supabase
    .from("assessment_templates")
    .select("*")
    .eq("clinic_id", access.clinic.id)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) {
    console.error("[getActiveAssessmentTemplatesAction] failed", {
      clinicId: access.clinic.id,
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: "We couldn't load the assessment library." };
  }

  return { ok: true, data: { templates: data ?? [] } };
}

/** Validate band stack-ups are ascending and non-overlapping. */
function bandsAreOrdered(bands: { min: number; max: number }[]): boolean {
  return bands.every(
    (band, index) =>
      band.min <= band.max &&
      (index === 0 || (bands[index - 1]?.max ?? -1) < band.min),
  );
}

/** The effective ceiling for the score input, from max_score or the top band. */
function effectiveMaxScore(scoring: { max_score: number; bands: { max: number }[] }): number {
  if (scoring.max_score > 0) return scoring.max_score;
  const last = scoring.bands[scoring.bands.length - 1];
  return last?.max ?? 0;
}

/**
 * Create a new template or save edits to an existing one. The id is
 * authoritative (not the name), and the row is matched on clinic as well so a
 * stale id from another clinic saves nothing.
 */
export async function saveAssessmentTemplateAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = templateDocSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the template and try again.",
    };
  }

  const { scoring, questions, interpretation } = parsed.data;
  if (!bandsAreOrdered(scoring.bands)) {
    return {
      ok: false,
      message: "Severity bands must be ascending and must not overlap.",
    };
  }

  const ids = new Set<string>();
  for (const question of questions) {
    if (ids.has(question.id)) {
      return { ok: false, message: "Every question needs a unique id." };
    }
    ids.add(question.id);
    if ((question.type === "single" || question.type === "multiple" || question.type === "scale") && question.options.length === 0) {
      return { ok: false, message: `"${question.text.slice(0, 60)}" needs at least one option.` };
    }
  }

  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const fixed: {
    name: string;
    description: string | null;
    category_id: string | null;
    target_specialty: AssessmentTargetSpecialty;
    status: AssessmentTemplateStatus;
    questions: AssessmentQuestion[];
    scoring: AssessmentScoring;
    interpretation: AssessmentInterpretationRule[];
  } = {
    name: parsed.data.name,
    description: parsed.data.description || null,
    category_id: parsed.data.category_id,
    target_specialty: parsed.data.target_specialty,
    status: parsed.data.status,
    questions,
    scoring,
    interpretation,
  };

  if (parsed.data.id) {
    const { error } = await guard.supabase
      .from("assessment_templates")
      .update(fixed)
      .eq("id", parsed.data.id)
      .eq("clinic_id", guard.clinicId);
    if (error) {
      console.error("[saveAssessmentTemplateAction] update failed", {
        templateId: parsed.data.id,
        code: error.code,
        message: error.message,
      });
      return { ok: false, message: duplicateMessage(error) };
    }
    revalidatePath(SETTINGS_PATH);
    return { ok: true, data: { id: parsed.data.id } };
  }

  const maxScore =
    scoring.max_score > 0 ? scoring.max_score : effectiveMaxScore(scoring);

  const { data, error } = await guard.supabase
    .from("assessment_templates")
    .insert({
      clinic_id: guard.clinicId,
      category_id: fixed.category_id,
      name: fixed.name,
      description: fixed.description,
      target_specialty: fixed.target_specialty,
      status: fixed.status,
      questions: fixed.questions.map((q) => ({
        ...q,
        ...(q.type === "text" ? { options: [] } : {}),
      })),
      scoring: { ...fixed.scoring, min_score: parsed.data.scoring.min_score, max_score: maxScore },
      interpretation: fixed.interpretation,
      created_by: guard.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[saveAssessmentTemplateAction] insert failed", {
      clinicId: guard.clinicId,
      code: error?.code,
      message: error?.message,
    });
    return { ok: false, message: duplicateMessage(error) };
  }

  revalidatePath(SETTINGS_PATH);
  return { ok: true, data: { id: data.id } };
}

/** Copy an existing template: same content, "… (copy)" name, back to draft. */
export async function duplicateAssessmentTemplateAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const { data: source } = await guard.supabase
    .from("assessment_templates")
    .select("*")
    .eq("id", id)
    .eq("clinic_id", guard.clinicId)
    .maybeSingle();
  if (!source) return { ok: false, message: "That template no longer exists." };

  const { data, error } = await guard.supabase
    .from("assessment_templates")
    .insert({
      clinic_id: guard.clinicId,
      category_id: source.category_id,
      name: `${source.name} (copy)`,
      description: source.description,
      target_specialty: source.target_specialty,
      status: "draft",
      questions: source.questions,
      scoring: source.scoring,
      interpretation: source.interpretation,
      created_by: guard.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[duplicateAssessmentTemplateAction] failed", {
      templateId: id,
      code: error?.code,
      message: error?.message,
    });
    return { ok: false, message: "We couldn't duplicate that template." };
  }

  revalidatePath(SETTINGS_PATH);
  return { ok: true, data: { id: data.id } };
}

/**
 * Import a standard instrument from the code-side catalog (lib/assessment-library.ts)
 * into this clinic's library as an editable, active template.
 */
export async function importAssessmentTemplateAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = z
    .object({
      key: z.string().min(1).max(80),
      categoryId: z.string().uuid().nullable(),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, message: "That template isn't in the standard library." };

  const entry = catalogEntryByKey(parsed.data.key);
  if (!entry) return { ok: false, message: "That template isn't in the standard library." };

  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const { data, error } = await guard.supabase
    .from("assessment_templates")
    .insert({
      clinic_id: guard.clinicId,
      category_id: parsed.data.categoryId,
      name: entry.key,
      description: entry.name,
      target_specialty: entry.targetSpecialty,
      status: "active",
      questions: entry.questions,
      scoring: entry.scoring,
      interpretation: entry.interpretation,
      created_by: guard.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[importAssessmentTemplateAction] insert failed", {
      key: entry.key,
      clinicId: guard.clinicId,
      code: error?.code,
      message: error?.message?.slice(0, 200),
    });
    return { ok: false, message: duplicateMessage(error) };
  }

  revalidatePath(SETTINGS_PATH);
  return { ok: true, data: { id: data.id } };
}

/** Move a template between draft and active. Active templates appear in the workspace. */
export async function setAssessmentTemplateStatusAction(
  id: string,
  status: AssessmentTemplateStatus,
): Promise<ActionResult> {
  const parsed = z.enum(ASSESSMENT_TEMPLATE_STATUSES).safeParse(status);
  if (!parsed.success) return { ok: false, message: "That status isn't recognised." };

  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const { error } = await guard.supabase
    .from("assessment_templates")
    .update({ status: parsed.data })
    .eq("id", id)
    .eq("clinic_id", guard.clinicId);
  if (error) {
    console.error("[setAssessmentTemplateStatusAction] failed", {
      templateId: id,
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: "We couldn't update that template." };
  }

  revalidatePath(SETTINGS_PATH);
  return { ok: true, data: undefined };
}

/** Delete a template. Past administrations keep their `assessment_type` text. */
export async function deleteAssessmentTemplateAction(id: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const { error } = await guard.supabase
    .from("assessment_templates")
    .delete()
    .eq("id", id)
    .eq("clinic_id", guard.clinicId);
  if (error) {
    console.error("[deleteAssessmentTemplateAction] failed", {
      templateId: id,
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: "We couldn't delete that template." };
  }

  revalidatePath(SETTINGS_PATH);
  return { ok: true, data: undefined };
}

/* ------------------------------------------------------------------------- */
/* Categories                                                                */
/* ------------------------------------------------------------------------- */

/** Create or rename a category (keep its active flag on rename). */
export async function saveAssessmentCategoryAction(raw: unknown): Promise<ActionResult> {
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the category and try again.",
    };
  }

  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  if (parsed.data.id) {
    const { error } = await guard.supabase
      .from("clinic_assessment_categories")
      .update({ name: parsed.data.name, is_active: parsed.data.isActive })
      .eq("id", parsed.data.id)
      .eq("clinic_id", guard.clinicId);
    if (error) {
      console.error("[saveAssessmentCategoryAction] update failed", {
        categoryId: parsed.data.id,
        code: error.code,
        message: error.message,
      });
      return { ok: false, message: duplicateMessage(error) };
    }
  } else {
    const { error } = await guard.supabase
      .from("clinic_assessment_categories")
      .insert({
        clinic_id: guard.clinicId,
        name: parsed.data.name,
        is_active: parsed.data.isActive,
        sort_order: 0,
        created_by: guard.userId,
      });
    if (error) {
      console.error("[saveAssessmentCategoryAction] insert failed", {
        clinicId: guard.clinicId,
        code: error.code,
        message: error.message,
      });
      return { ok: false, message: duplicateMessage(error) };
    }
  }

  revalidatePath(SETTINGS_PATH);
  return { ok: true, data: undefined };
}

/** Hide or show a category. Hidden categories still hold their templates. */
export async function setAssessmentCategoryActiveAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const { error } = await guard.supabase
    .from("clinic_assessment_categories")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("clinic_id", guard.clinicId);
  if (error) {
    console.error("[setAssessmentCategoryActiveAction] failed", {
      categoryId: id,
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: "We couldn't update that category." };
  }

  revalidatePath(SETTINGS_PATH);
  return { ok: true, data: undefined };
}

/** Delete a category. Its templates fall back to "Uncategorised" (FK set null). */
export async function deleteAssessmentCategoryAction(id: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const { error } = await guard.supabase
    .from("clinic_assessment_categories")
    .delete()
    .eq("id", id)
    .eq("clinic_id", guard.clinicId);
  if (error) {
    console.error("[deleteAssessmentCategoryAction] failed", {
      categoryId: id,
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: "We couldn't delete that category." };
  }

  revalidatePath(SETTINGS_PATH);
  return { ok: true, data: undefined };
}

const duplicateKeyPattern = /\(name\)=\(([^)]*)\)/;

/** Human wording for the unique-index violation on the clinic name keys. */
function duplicateMessage(error: { code?: string; details?: string } | null): string {
  if (error && error.code === "23505") {
    const name = error.details?.match(duplicateKeyPattern)?.[1];
    return `"${name ?? "That name"}" is already used in this clinic.`;
  }
  return "We couldn't save that. Please try again.";
}

// Re-export so the manager can keep raw template payloads typed without
// reaching into this file's internals.
export type AssessmentTemplateDraft = z.infer<typeof templateDocSchema>;