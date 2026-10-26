"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { interpretationForScore } from "@/lib/assessment-library";
import {
  ClinicAiKeyMissingError,
  resolveProviderForClinic,
} from "@/lib/ai/provider";
import type { AIProvider } from "@/lib/ai/types";
import { logAuditEvent } from "@/lib/auth/role-guard";
import { canManageClinical, getCurrentClinic } from "@/lib/clinic-access";
import { findDoctorForUser } from "@/lib/consultation-queries";
import { createClient } from "@/lib/supabase/server";
import { APP_ROUTES } from "@/lib/constants";
import {
  mseFindingsDigest,
  readMseFindings,
  riskThoughtsFromFindings,
} from "@/lib/psych-mse";
import {
  aiApprovalEntry,
  aiBulkEntry,
  clinicianSaveEntry,
  readIntakeProvenance,
  withIntakeProvenance,
} from "@/lib/psych-intake";
import {
  NOTE_FORMAT_META,
  SESSION_SECTIONS,
  SESSION_SECTION_KEYS,
  type SessionNoteFormat,
  type SessionSectionKey,
} from "@/lib/psych-session";
import {
  PSYCHOMETRIC_INSTRUMENTS,
  isPsychometricKey,
} from "@/lib/psychometrics";
import {
  ASSESSMENT_RATERS,
  DEFAULT_RATER_TYPE,
  administrationModeForRater,
  completedByForRater,
} from "@/lib/assessments/raters";
import type {
  AssessmentInterpretationRule,
  AssessmentQuestion,
  AssessmentRaterType,
  IntakeFieldKey,
} from "@/types/database";
import type { ActionResult } from "@/types";

/** Free-text clinical note field: trimmed, bounded, coalesces to null. */
const note = z
  .string()
  .trim()
  .max(6000, "Entry is too long.")
  .optional()
  .or(z.literal(""));

/** Longer free-text field (recorded session transcripts). */
const longNote = z
  .string()
  .trim()
  .max(20000, "Transcript is too long.")
  .optional()
  .or(z.literal(""));

/** Recording length in seconds. */
const duration = z.coerce
  .number()
  .int()
  .min(0)
  .max(86400)
  .optional()
  .nullable();

const optionalUuid = z.string().uuid().optional().nullable().or(z.literal(""));

const RISK_LEVELS = ["low", "moderate", "high", "crisis"] as const;
const SESSION_FORMATS = ["BIRP", "SOAP", "DAP"] as const;
const SESSION_TYPES = [
  "initial",
  "individual",
  "follow_up",
  "crisis",
  "group",
] as const;
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
  presenting_concern: note,
  presenting_concern_duration: note,
  presenting_concern_severity: z
    .enum(["Mild", "Moderate", "Severe", "Very severe"])
    .optional()
    .nullable(),
  presenting_concern_words: note,
  sleep_quality: note,
  appetite_energy: note,
  personal_crisis_history: note,
  previous_therapy_history: note,
  previous_diagnosis: note,
  family_mental_health_history: note,
  trauma_history: note,
  psychosocial_background: note,
  stressors: note,
  substance_use_history: note,
  additional_clinical_notes: note,
});

const savePsychSessionSchema = z.object({
  /** Re-save an existing note (set by the editor once a draft row exists). */
  id: z.string().uuid().optional().nullable().or(z.literal("")),
  session_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.")
    .optional()
    .or(z.literal("")),
  format: z.enum(SESSION_FORMATS),
  session_type: z.enum(SESSION_TYPES).default("individual"),
  status: z.enum(["draft", "approved"]).default("draft"),
  behavior: note,
  intervention: note,
  response: note,
  subjective: note,
  objective: note,
  observation_data: note,
  assessment: note,
  plan: note,
  session_summary: note,
  transcript: longNote,
  duration_seconds: duration,
  /** Therapist identity attached in the background (never keyed in the form). */
  doctor_id: optionalUuid,
  doctor_name: z
    .string()
    .trim()
    .max(120, "Name is too long.")
    .optional()
    .nullable()
    .or(z.literal("")),
});

const approveSessionSchema = z.object({ id: z.string().uuid() });

const assistSessionSchema = z.object({
  kind: z.enum(["draft", "improve", "summarize"]),
  format: z.enum(SESSION_FORMATS),
  section: z.enum(SESSION_SECTION_KEYS),
  fieldLabel: z.string().trim().min(1).max(80),
  text: z.string().trim().max(6000).default(""),
  transcript: z.string().trim().max(20000).default(""),
});

const generateSessionNoteSchema = z.object({
  format: z.enum(SESSION_FORMATS),
  /** Recorded or pasted session transcript the AI distills into the note. */
  transcript: z
    .string()
    .trim()
    .min(1, "Record or paste a session transcript first.")
    .max(20000, "Transcript is too long."),
});

const savePsychAssessmentSchema = z.object({
  assessment_type: z
    .string()
    .trim()
    .min(1, "Pick or name the assessment.")
    .max(120, "Assessment name is too long."),
  /** Clinic library template (migration 0085), when the assessment is one. */
  template_id: z.string().uuid().nullable().optional(),
  score: z.coerce.number().min(0).max(150).optional().nullish(),
  severity: note,
  notes: note,
  /** Phase 7 — who answered the measure (defaults to a self-report). */
  rater_type: z
    .enum(
      ASSESSMENT_RATERS.map((rater) => rater.value) as [
        AssessmentRaterType,
        ...AssessmentRaterType[],
      ],
    )
    .optional(),
  rater_name: note,
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
  // No `.default(false)`: an omitted checkbox must mean "leave as-is", not
  // "clear", so a single-field autosave never wipes the biopsy alert.
  biopsy_alert: z.boolean().optional(),
  biopsy_notes: note,
  previous_treatment_history: note,
  fitzpatrick_type: z
    .enum(["Type I", "Type II", "Type III", "Type IV", "Type V", "Type VI"])
    .optional()
    .nullable()
    .or(z.literal("")),
  drug_allergies: note,
  topical_allergies: note,
  current_orals: note,
  current_topicals: note,
  relevant_systemic_history: note,
  family_history: note,
});

const dermSeverityScoreSchema = z.object({
  kind: z.enum(["GAGS", "PASI", "ABCDE"]),
  total: z.number(),
  band: z.string().nullable().optional(),
  inputs: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
  recordedAt: z.string(),
});

const saveDermExamSchema = z.object({
  /** Re-save today's encounter row (set by the form once the row exists). */
  id: optionalUuid,
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
  duration: note,
  severity: z
    .enum(["Mild", "Moderate", "Severe"])
    .optional()
    .nullable()
    .or(z.literal("")),
  triggers: textList,
  associated_symptoms: textList,
  hpi: note,
  severity_scores: z.array(dermSeverityScoreSchema).optional(),
  assessment: note,
  patient_explanation: note,
  follow_up_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  follow_up_notes: note,
});

const DIAGNOSIS_STATUS = [
  "primary",
  "differential",
  "suspected",
  "provisional",
] as const;

const saveDermDiagnosisSchema = z.object({
  id: optionalUuid,
  exam_id: optionalUuid,
  label: z.string().trim().min(1, "Enter the diagnosis.").max(160),
  icd_code: z
    .string()
    .trim()
    .max(20, "ICD code is too long.")
    .optional()
    .or(z.literal("")),
  status: z.enum(DIAGNOSIS_STATUS).default("primary"),
  notes: note,
});

const PROCEDURE_KINDS = [
  "laser",
  "injectable",
  "peel",
  "cryotherapy",
  "electrocautery",
  "minor_surgery",
  "biopsy",
  "other",
] as const;

const SPECIMEN_STATUSES = [
  "collected",
  "sent_to_lab",
  "in_lab",
  "reported",
  "cancelled",
] as const;

const saveDermProcedureSchema = z.object({
  id: optionalUuid,
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
  procedure_kind: z.enum(PROCEDURE_KINDS).optional().nullable(),
  lesion_id: optionalUuid,
  body_site: note,
  params: z.record(z.string(), z.string().trim().max(240)).optional(),
  aftercare: note,
  complications: note,
  specimen_type: note,
  specimen_lab: note,
  specimen_status: z.enum(SPECIMEN_STATUSES).optional().nullable(),
  specimen_dispatched_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
});

const updateDermSpecimenStatusSchema = z.object({
  id: z.string().uuid(),
  specimen_status: z.enum(SPECIMEN_STATUSES),
});

const saveDermPhotoSchema = z.object({
  document_id: optionalUuid,
  body_region: z.string().trim().min(1, "Body region is required.").max(80),
  photo_type: z.enum(PHOTO_TYPES),
  lesion_notes: note,
  paired_with: optionalUuid,
  lesion_id: optionalUuid,
  taken_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.")
    .optional()
    .or(z.literal("")),
});

const saveDermScoresSchema = z.object({
  id: optionalUuid,
  severity_scores: z.array(dermSeverityScoreSchema),
});

const saveDermLesionSchema = z.object({
  id: optionalUuid,
  exam_id: optionalUuid,
  body_region: z.string().trim().min(1, "Body region is required.").max(80),
  body_view: z.enum(["front", "back"]).optional(),
  body_x: z.coerce.number().min(0).max(1).nullable().optional(),
  body_y: z.coerce.number().min(0).max(1).nullable().optional(),
  laterality: z
    .enum(["left", "right", "bilateral", "central"])
    .nullable()
    .optional()
    .or(z.literal("")),
  morphology: textList,
  color: textList,
  texture: textList,
  size_value: z.coerce.number().min(0).max(10000).nullable().optional(),
  size_unit: z.string().trim().max(10).nullable().optional().or(z.literal("")),
  observations: note,
});

const dermMedicineEntrySchema = z.object({
  name: z.string().trim().max(160).default(""),
  route: z.string().trim().max(80).default(""),
  form: z.string().trim().max(80).default(""),
  frequency: z.string().trim().max(120).default(""),
  duration: z.string().trim().max(120).default(""),
  unit: z.string().trim().max(80).default(""),
  instructions: z.string().trim().max(240).default(""),
});

const dermLabOrderSchema = z.object({
  test_name: z.string().trim().max(160).default(""),
  notes: z.string().trim().max(240).default(""),
  sub_parameters: z.array(z.string().trim().max(80)).optional(),
});

const saveDermRxSchema = z.object({
  id: optionalUuid,
  topical_form: z.enum(DERM_FORM).optional().nullable().or(z.literal("")),
  application_instructions: note,
  skincare_routine_am: note,
  skincare_routine_pm: note,
  patient_education: note,
  medicines: z.array(dermMedicineEntrySchema).optional(),
  lab_orders: z.array(dermLabOrderSchema).optional(),
});

const idSchema = z.object({ id: z.string().uuid() });

type Guard =
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      clinicId: string;
    }
  | { ok: false; result: ActionResult<string> };

async function guard(): Promise<Guard> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      ok: false,
      result: {
        ok: false,
        message: "You must have a clinic to perform this action.",
      },
    };
  }
  if (!canManageClinical(access.role)) {
    return {
      ok: false,
      result: {
        ok: false,
        message: "Your role cannot manage clinical records.",
      },
    };
  }
  return { ok: true, supabase, clinicId: access.clinic.id };
}

/**
 * Clean display name for the signed-in clinician, resolved by priority:
 *   1. `profiles.full_name` (dedicated clinician profile, if present)
 *   2. `doctors.name` (roster name linked via user_id)
 *   3. `user.user_metadata.full_name` / `user.user_metadata.name`
 *   4. A friendly formatting of the username when only an email exists
 *      (e.g. "medbookai@admin.com" -> "Dr. MedBook Ai").
 *
 * Raw email addresses never surface into clinical records or printed notes.
 */
async function authorName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const meta = user.user_metadata ?? {};
  const metaName =
    (typeof meta?.full_name === "string" && meta.full_name) ||
    (typeof meta?.name === "string" && meta.name);

  // 1. Dedicated clinician profile (profiles table, may not exist in every
  //    deployment — a failed or absent lookup falls through silently).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- profiles is not in the generated schema types
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("full_name")
    .eq("user_id", user.id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (typeof profile?.full_name === "string" && profile.full_name.trim()) {
    return profile.full_name.trim();
  }

  // 2. Roster name on the linked doctor record.
  const { data: doctor } = await supabase
    .from("doctors")
    .select("name")
    .eq("clinic_id", clinicId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (typeof doctor?.name === "string" && doctor.name.trim()) {
    return doctor.name.trim();
  }

  // 3. Auth metadata name.
  if (metaName) return metaName.trim();

  // 4. Friendly username-only formatting — never expose the raw email domain.
  const email = user.email ?? "";
  const prefix = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, " ");
  const formatted = prefix
    .split(" ")
    .filter(Boolean)
    .map((word, i) => (i === 0 ? "Dr. " : "") + word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
  return formatted || "Clinician";
}

/** The logged-in user's doctor id, so event rows can point at the clinician. */
async function doctorId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
): Promise<string | null> {
  const doctor = await findDoctorForUser(supabase, clinicId);
  return doctor?.id ?? null;
}

/**
 * Confirms a caller-supplied visit id really is this patient's encounter in
 * this clinic before it is stamped onto a clinical row (migration 0104).
 *
 * The derm save actions receive the workspace's active visit id from the
 * client, and a client-supplied id is never trusted as-is: anything that does
 * not resolve to `(clinic_id, patient_id)` — a stale id, another patient's
 * visit, a visit since removed — degrades to `null` rather than mis-stamping
 * a record onto an encounter it does not belong to. Rows created outside an
 * active visit stay `visit_id null`, which is the honest value.
 */
async function resolveEncounterVisitId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
  patientId: string,
  visitId: string | null | undefined,
): Promise<string | null> {
  if (!visitId) return null;
  const { data } = await supabase
    .from("visits")
    .select("id")
    .eq("id", visitId)
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .maybeSingle();
  return data?.id ?? null;
}

function ok(): ActionResult<string> {
  return { ok: true, data: "Saved" };
}

function err(
  first: z.ZodIssue | undefined,
  fallback = "Invalid input.",
): ActionResult<string> {
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

  const me = await authorName(g.supabase, g.clinicId);
  const { error } = await g.supabase.from("psych_safety").upsert(
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

/**
 * Persists a single Intake & History field (0083). The snapshot always keeps
 * its provenance: each saved field is flagged as clinician-entered or, when a
 * clinician revises text that came from the patient form or the AI review
 * queue, "updated" on its original source.
 */
export async function savePsychIntakeAction(
  patientId: string,
  raw: unknown,
): Promise<ActionResult<string>> {
  const parsed = savePsychIntakeSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const fields = Object.keys(parsed.data) as IntakeFieldKey[];
  const touched = fields.filter(
    (field) => (parsed.data as Record<string, unknown>)[field] !== undefined,
  );
  if (touched.length === 0) return ok();

  const { data: existing, error: loadError } = await g.supabase
    .from("psych_intake")
    .select(
      "field_provenance, presenting_concern, presenting_concern_duration, presenting_concern_severity, presenting_concern_words, sleep_quality, appetite_energy, personal_crisis_history, previous_therapy_history, previous_diagnosis, family_mental_health_history, trauma_history, psychosocial_background, stressors, substance_use_history, additional_clinical_notes",
    )
    .eq("clinic_id", g.clinicId)
    .eq("patient_id", patientId)
    .maybeSingle();
  if (loadError) return { ok: false, message: loadError.message };

  const priorValues = (existing ?? {}) as Partial<
    Record<IntakeFieldKey, string | null>
  >;
  const provenance = readIntakeProvenance(existing?.field_provenance);

  const me = await authorName(g.supabase, g.clinicId);
  const payload: Record<string, unknown> = {
    clinic_id: g.clinicId,
    patient_id: patientId,
    updated_by: me,
    updated_at: new Date().toISOString(),
  };
  let nextProvenance = provenance;
  for (const field of touched) {
    const value = (parsed.data as Record<string, unknown>)[field];
    payload[field] = value ?? null;
    const hadPriorValue = Boolean((priorValues[field] ?? "").trim());
    nextProvenance = withIntakeProvenance(
      nextProvenance,
      field,
      clinicianSaveEntry(provenance[field], hadPriorValue),
    );
  }
  payload.field_provenance = nextProvenance;

  const { error } = await g.supabase
    .from("psych_intake")
    .upsert(payload as never, { onConflict: "patient_id" });
  if (error) return { ok: false, message: error.message };
  return ok();
}

export type IntakeAssistKind = "draft" | "improve" | "summarize";

const intakeAssistSchema = z.object({
  kind: z.enum(["draft", "improve", "summarize"]),
  fieldLabel: z.string().trim().min(1).max(80),
  text: z.string().max(8000).optional().default(""),
});

/**
 * The provider for a clinic-scoped AI call.
 *
 * Every clinic runs on its own key (`lib/ai/provider.ts`), so a clinic that
 * has not added one gets a message that tells its owner what to do — "the AI
 * assistant is not configured on this server yet" points at the wrong place
 * and reads like the clinic is broken.
 */
async function resolveClinicProvider(
  clinicId: string,
): Promise<
  { ok: true; provider: AIProvider } | { ok: false; result: ActionResult<never> }
> {
  try {
    return { ok: true, provider: await resolveProviderForClinic(clinicId) };
  } catch (error) {
    return {
      ok: false,
      result: {
        ok: false,
        message:
          error instanceof ClinicAiKeyMissingError
            ? "This clinic has not added an AI API key yet. Add your own Gemini key in AI Agent settings to switch the assistant on."
            : "The AI assistant is not configured on this server yet.",
      },
    };
  }
}

const INTAKE_ASSIST_INSTRUCTION: Record<IntakeAssistKind, string> = {
  draft:
    "You are a clinical documentation assistant for a psychology intake. Using the psychologist's rough notes below, write a concise, professional history narrative in neutral clinical prose. Third person, past tense, 3 to 6 sentences. Never invent facts, never state a diagnosis and never suggest treatment. Output the narrative only, plain text, no headings, no preamble.",
  improve:
    "You are a clinical documentation editor for a psychology intake. Rewrite the note below in clear, neutral, professional clinical prose. Preserve every fact and the original meaning exactly; do not add, remove or infer clinical detail. Output the rewritten note only, plain text, no preamble.",
  summarize:
    "You summarise a single psychology intake note for a clinician. Compress the note below into 1 to 3 concise sentences of neutral clinical prose, keeping only the key facts. Never invent detail. Output the summary only, plain text, no preamble.",
};

/**
 * Voice-free text assistance for the Intake & History tab's narrative fields
 * (draft / improve / summarize). Rides on the same Gemini provider as every
 * other AI surface — it is not a second agent, just another prompt on the one
 * provider the clinic already runs.
 */
export async function assistPsychIntakeAction(
  raw: unknown,
): Promise<ActionResult<string>> {
  const parsed = intakeAssistSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));

  const { kind, fieldLabel } = parsed.data;
  const text = parsed.data.text.trim();
  if (kind !== "draft" && text.length === 0) {
    return {
      ok: false,
      message:
        "Write or dictate something first, then let AI improve or summarise it.",
    };
  }

  const g = await guard();
  if (!g.ok) return g.result;

  const provider = await resolveClinicProvider(g.clinicId);
  if (!provider.ok) return provider.result;

  try {
    const output = await provider.provider.complete({
      systemInstruction: INTAKE_ASSIST_INSTRUCTION[kind],
      prompt: `Field: ${fieldLabel}\n\nNote:\n${text || "(empty — the psychologist has not written anything yet)"}`,
      temperature: kind === "draft" ? 0.4 : 0.2,
      maxOutputTokens: 700,
    });
    const cleaned = output.trim();
    if (!cleaned) {
      return {
        ok: false,
        message: "The assistant returned nothing. Try again.",
      };
    }
    return { ok: true, data: cleaned };
  } catch (error) {
    console.error("[assistPsychIntakeAction] failed:", error);
    return {
      ok: false,
      message: "The assistant could not respond. Try again.",
    };
  }
}

/* ------------------------------------------------------------------------- */
/* Psychology — Intake & History suggestions (review queue, migration 0081)  */
/* ------------------------------------------------------------------------- */

const PSYCH_INTAKE_FIELDS = [
  "previous_therapy_history",
  "previous_diagnosis",
  "family_mental_health_history",
  "psychosocial_background",
  "stressors",
  "substance_use_history",
] as const;

/** Fields stored as comma-separated lists; approval merges rather than appends. */
const PSYCH_INTAKE_LIST_FIELDS: ReadonlyArray<string> = [
  "previous_therapy_history",
  "previous_diagnosis",
  "stressors",
];

const AI_INTAKE_ASSIST_CREATED_BY = "AI (history review)";

const generateSuggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        field: z.enum(PSYCH_INTAKE_FIELDS),
        value: z.string().trim().min(1).max(600),
        source: z.enum(["session", "assessment", "ai"]).default("ai"),
        sourceLabel: z.string().trim().max(120).optional().default(""),
      }),
    )
    .max(12)
    .default([]),
});

const reviewSuggestionSchema = z.object({ id: z.string().uuid() });
const editSuggestionSchema = z.object({
  id: z.string().uuid(),
  value: z.string().trim().min(1, "A suggestion cannot be empty.").max(600),
});

const PSYCH_INTAKE_SUGGESTION_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: {
            type: "string",
            enum: [...PSYCH_INTAKE_FIELDS],
            description: "Which Intake & History field the fact belongs to.",
          },
          value: {
            type: "string",
            description:
              "Short, specific fact lifted from the notes. For list-like fields one item only, e.g. 'CBT'.",
          },
          source: {
            type: "string",
            enum: ["session", "assessment", "ai"],
            description:
              "'session' or 'assessment' where the fact appears; 'ai' only when inferred across notes.",
          },
          sourceLabel: {
            type: "string",
            description:
              "Short source tag copied from the digest, e.g. 'Session 2026-03-15' or 'PHQ-9 2026-03-10'.",
          },
        },
        required: ["field", "value"],
      },
    },
  },
  required: ["suggestions"],
} as const;

const PSYCH_INTAKE_SUGGESTION_PROMPT = `You review a psychology patient's existing clinical notes and propose additions to their Intake & Psychological History. The psychologist will approve each suggestion before it enters the record, so precision matters more than volume.

Fields — map each fact to exactly one:
- previous_therapy_history: psychological therapies/treatments the patient has received (e.g. CBT, counselling).
- previous_diagnosis: prior psychiatric or psychological diagnoses.
- family_mental_health_history: mental-health conditions in the patient's relatives.
- psychosocial_background: developmental, family, educational, occupational, relationship, social-support and significant life-event background.
- stressors: current psychosocial stressors.
- substance_use_history: alcohol, tobacco or drug use.

Rules:
- Suggest only facts clearly stated in the notes and NOT already present in the current history. Never invent, never upgrade a suspicion into a diagnosis.
- value is a short, specific phrase or sentence taken from the notes. For list-like fields (therapies, diagnoses, family history, stressors) use a single concise item per suggestion.
- source is "session" or "assessment" for where the fact literally appears; "ai" only when inferred across notes.
- sourceLabel copies the short tag shown in the digest (e.g. "Session 2026-03-15", "PHQ-9 2026-03-10").
- At most 8 suggestions, strongest first. Return { "suggestions": [] } when nothing new is supported.`;

function splitCommaList(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

/**
 * Folds an approved suggestion into the existing snapshot. List fields merge
 * (de-duplicated, order-preserving) so repeated approvals never duplicate; the
 * substance hybrid and narrative fields append a new line instead, skipping a
 * value the note already contains.
 */
function mergeIntakeValue(
  field: string,
  existing: string | null | undefined,
  incoming: string,
): string {
  const inc = incoming.trim();
  const cur = (existing ?? "").trim();
  if (!inc) return cur;
  if (!cur) return inc;

  if (field === "substance_use_history") {
    if (cur.toLowerCase().includes(inc.toLowerCase())) return cur;
    return `${cur}\n${inc}`;
  }
  if (PSYCH_INTAKE_LIST_FIELDS.includes(field)) {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const token of [...splitCommaList(cur), ...splitCommaList(inc)]) {
      const key = token.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(token);
      }
    }
    return merged.join(", ");
  }
  if (cur.toLowerCase().includes(inc.toLowerCase())) return cur;
  return `${cur}\n\n${inc}`;
}

function digestLine(
  label: string,
  value: string | null | undefined,
): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? `${label}: ${trimmed}` : null;
}

/**
 * Reads the patient's recent session and assessment notes and asks the one
 * clinic-wide Gemini provider to propose Intake & History additions. Nothing is
 * written to `psych_intake` here — every proposal lands in the review queue
 * (0081) for the psychologist to approve, edit or reject.
 */
export async function generatePsychIntakeSuggestionsAction(
  patientId: string,
): Promise<ActionResult<string>> {
  const idCheck = idSchema.safeParse({ id: patientId });
  if (!idCheck.success) return err(firstIssue(idCheck));
  const g = await guard();
  if (!g.ok) return g.result;

  const provider = await resolveClinicProvider(g.clinicId);
  if (!provider.ok) return provider.result;

  const [intakeRes, sessionsRes, assessmentsRes] = await Promise.all([
    g.supabase
      .from("psych_intake")
      .select("*")
      .eq("clinic_id", g.clinicId)
      .eq("patient_id", patientId)
      .maybeSingle(),
    g.supabase
      .from("psych_sessions")
      .select(
        "session_date, session_type, behavior, intervention, response, observation_data, assessment, plan",
      )
      .eq("clinic_id", g.clinicId)
      .eq("patient_id", patientId)
      .order("session_date", { ascending: false })
      .limit(6),
    g.supabase
      .from("psych_assessments")
      .select("assessment_type, score, severity, notes, conducted_at")
      .eq("clinic_id", g.clinicId)
      .eq("patient_id", patientId)
      .order("conducted_at", { ascending: false })
      .limit(6),
  ]);

  const intake = intakeRes.data as {
    previous_therapy_history: string | null;
    previous_diagnosis: string | null;
    family_mental_health_history: string | null;
    psychosocial_background: string | null;
    stressors: string | null;
    substance_use_history: string | null;
  } | null;

  const sessionBlocks = (sessionsRes.data ?? [])
    .map((row, index) => {
      const date = (row.session_date ?? "").slice(0, 10);
      const lines = [
        digestLine("Type", row.session_type),
        digestLine("Behavior", row.behavior),
        digestLine("Intervention", row.intervention),
        digestLine("Response", row.response),
        digestLine("Observation", row.observation_data),
        digestLine("Assessment", row.assessment),
        digestLine("Plan", row.plan),
      ].filter((line): line is string => Boolean(line));
      if (lines.length === 0) return null;
      return `[S${index + 1}] tag="Session ${date || "undated"}"\n${lines.join("\n")}`;
    })
    .filter((block): block is string => Boolean(block));

  const assessmentBlocks = (assessmentsRes.data ?? [])
    .map((row, index) => {
      const date = (row.conducted_at ?? "").slice(0, 10);
      const header = `${row.assessment_type ?? "Assessment"}${
        row.score != null ? ` score ${row.score}` : ""
      }${row.severity ? ` (${row.severity})` : ""}`;
      const lines = [digestLine("Notes", row.notes)].filter(
        (line): line is string => Boolean(line),
      );
      return `[A${index + 1}] tag="${header}${date ? ` ${date}` : ""}"\n${lines.join("\n") || "No free-text notes."}`;
    })
    .filter((block): block is string => Boolean(block));

  const currentHistory = intake
    ? [
        digestLine("Previous therapy", intake.previous_therapy_history),
        digestLine("Previous diagnosis", intake.previous_diagnosis),
        digestLine("Family history", intake.family_mental_health_history),
        digestLine("Psychosocial", intake.psychosocial_background),
        digestLine("Stressors", intake.stressors),
        digestLine("Substance use", intake.substance_use_history),
      ].filter((line): line is string => Boolean(line))
    : [];

  if (sessionBlocks.length === 0 && assessmentBlocks.length === 0) {
    return {
      ok: false,
      message:
        "There are no session or assessment notes yet for the assistant to review.",
    };
  }

  const digest = [
    "CURRENT HISTORY (do not repeat these):",
    currentHistory.length > 0 ? currentHistory.join("\n") : "(empty)",
    "",
    "SESSION NOTES:",
    sessionBlocks.length > 0 ? sessionBlocks.join("\n\n") : "(none)",
    "",
    "ASSESSMENTS:",
    assessmentBlocks.length > 0 ? assessmentBlocks.join("\n\n") : "(none)",
  ].join("\n");

  let parsedOutput: z.infer<typeof generateSuggestionsSchema>;
  try {
    const raw = await provider.provider.completeJson({
      systemInstruction: PSYCH_INTAKE_SUGGESTION_PROMPT,
      prompt: digest,
      schema: PSYCH_INTAKE_SUGGESTION_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 1600,
    });
    const validated = generateSuggestionsSchema.safeParse(raw);
    if (!validated.success) {
      return {
        ok: false,
        message: "The assistant's suggestions were unreadable. Try again.",
      };
    }
    parsedOutput = validated.data;
  } catch (error) {
    console.error("[generatePsychIntakeSuggestionsAction] failed:", error);
    return {
      ok: false,
      message: "The assistant could not respond. Try again.",
    };
  }

  if (parsedOutput.suggestions.length === 0) {
    return { ok: true, data: "No new history details were found." };
  }

  // Skip anything already queued (pending) or already in the snapshot.
  const pendingRes = await g.supabase
    .from("psych_intake_suggestions")
    .select("field, value")
    .eq("clinic_id", g.clinicId)
    .eq("patient_id", patientId)
    .eq("status", "pending");
  const existingKeys = new Set<string>();
  for (const row of pendingRes.data ?? []) {
    existingKeys.add(`${row.field}::${row.value.trim().toLowerCase()}`);
  }
  if (intake) {
    for (const field of PSYCH_INTAKE_FIELDS) {
      const snapshot = intake[field];
      if (!snapshot) continue;
      for (const token of splitCommaList(snapshot)) {
        existingKeys.add(`${field}::${token.toLowerCase()}`);
      }
    }
  }

  const seen = new Set<string>();
  const rows = parsedOutput.suggestions
    .filter((suggestion) => {
      const key = `${suggestion.field}::${suggestion.value.trim().toLowerCase()}`;
      if (existingKeys.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((suggestion) => ({
      clinic_id: g.clinicId,
      patient_id: patientId,
      field: suggestion.field,
      value: suggestion.value,
      source: suggestion.source,
      source_label: suggestion.sourceLabel || null,
      source_date: null,
      status: "pending" as const,
      created_by_name: AI_INTAKE_ASSIST_CREATED_BY,
    }));

  if (rows.length === 0) {
    return { ok: true, data: "No new history details were found." };
  }

  const { error } = await g.supabase
    .from("psych_intake_suggestions")
    .insert(rows);
  if (error) return { ok: false, message: error.message };

  revalidatePath(APP_ROUTES.app.patients);
  return {
    ok: true,
    data: `${rows.length} suggestion${rows.length === 1 ? "" : "s"} ready for review.`,
  };
}

/** Merges an approved suggestion into `psych_intake` and marks it approved. */
export async function approvePsychIntakeSuggestionAction(
  raw: unknown,
): Promise<ActionResult<string>> {
  const parsed = reviewSuggestionSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { data: suggestion, error: loadError } = await g.supabase
    .from("psych_intake_suggestions")
    .select("*")
    .eq("clinic_id", g.clinicId)
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (loadError) return { ok: false, message: loadError.message };
  if (!suggestion)
    return { ok: false, message: "That suggestion is no longer available." };
  if (suggestion.status !== "pending") {
    return { ok: false, message: "That suggestion was already reviewed." };
  }

  const field = suggestion.field;
  const { data: currentIntake, error: intakeError } = await g.supabase
    .from("psych_intake")
    .select("*")
    .eq("clinic_id", g.clinicId)
    .eq("patient_id", suggestion.patient_id)
    .maybeSingle();
  if (intakeError) return { ok: false, message: intakeError.message };

  const me = await authorName(g.supabase, g.clinicId);
  const base = (currentIntake as Record<string, string | null> | null) ?? {};
  const mergedValue = mergeIntakeValue(
    field,
    base[field] ?? null,
    suggestion.value,
  );
  const valueFor = (column: string) =>
    column === field ? mergedValue : (base[column] ?? null);

  const provenance = readIntakeProvenance(currentIntake?.field_provenance);
  const hadContent = Boolean((base[field] ?? "").trim());
  const { error: saveError } = await g.supabase.from("psych_intake").upsert(
    {
      clinic_id: g.clinicId,
      patient_id: suggestion.patient_id,
      previous_therapy_history: valueFor("previous_therapy_history"),
      previous_diagnosis: valueFor("previous_diagnosis"),
      family_mental_health_history: valueFor("family_mental_health_history"),
      psychosocial_background: valueFor("psychosocial_background"),
      stressors: valueFor("stressors"),
      substance_use_history: valueFor("substance_use_history"),
      field_provenance: withIntakeProvenance(
        provenance,
        field as IntakeFieldKey,
        aiApprovalEntry(
          provenance[field as IntakeFieldKey],
          hadContent,
          suggestion.source_label,
        ),
      ),
      updated_by: me,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "patient_id" },
  );
  if (saveError) return { ok: false, message: saveError.message };

  const { error: reviewError } = await g.supabase
    .from("psych_intake_suggestions")
    .update({
      status: "approved",
      reviewed_by: me,
      reviewed_at: new Date().toISOString(),
    })
    .eq("clinic_id", g.clinicId)
    .eq("id", suggestion.id);
  if (reviewError) return { ok: false, message: reviewError.message };

  revalidatePath(APP_ROUTES.app.patients);
  return ok();
}

/**
 * Accepts every pending suggestion for a patient in one review pass: pending
 * items are grouped per field, folded into the snapshot in created order (so
 * list fields de-duplicate), the whole `psych_intake` row is saved once, and
 * every pending suggestion is marked approved in a single update.
 */
export async function approveAllPsychIntakeSuggestionsAction(
  patientId: string,
): Promise<ActionResult<string>> {
  const idCheck = idSchema.safeParse({ id: patientId });
  if (!idCheck.success) return err(firstIssue(idCheck));
  const g = await guard();
  if (!g.ok) return g.result;

  const { data: pending, error: loadError } = await g.supabase
    .from("psych_intake_suggestions")
    .select("*")
    .eq("clinic_id", g.clinicId)
    .eq("patient_id", patientId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (loadError) return { ok: false, message: loadError.message };
  if (pending.length === 0) return ok();

  const { data: currentIntake, error: intakeError } = await g.supabase
    .from("psych_intake")
    .select("*")
    .eq("clinic_id", g.clinicId)
    .eq("patient_id", patientId)
    .maybeSingle();
  if (intakeError) return { ok: false, message: intakeError.message };

  const base = (currentIntake as Record<string, string | null> | null) ?? {};
  const provenance = readIntakeProvenance(currentIntake?.field_provenance);

  const merged: Record<string, string> = {};
  const firstLabels: Record<string, string | null> = {};
  for (const suggestion of pending) {
    merged[suggestion.field] = mergeIntakeValue(
      suggestion.field,
      merged[suggestion.field] ?? base[suggestion.field] ?? null,
      suggestion.value,
    );
    firstLabels[suggestion.field] =
      firstLabels[suggestion.field] ?? suggestion.source_label ?? null;
  }

  let nextProvenance = provenance;
  for (const field of Object.keys(merged) as IntakeFieldKey[]) {
    const hadContent = Boolean(
      ((base as Record<string, string | null>)[field] ?? "").trim(),
    );
    nextProvenance = withIntakeProvenance(
      nextProvenance,
      field,
      aiBulkEntry(provenance[field], hadContent, firstLabels[field] ?? null),
    );
  }

  const me = await authorName(g.supabase, g.clinicId);
  const { error: saveError } = await g.supabase.from("psych_intake").upsert(
    {
      clinic_id: g.clinicId,
      patient_id: patientId,
      previous_therapy_history:
        merged.previous_therapy_history ??
        base.previous_therapy_history ??
        null,
      previous_diagnosis:
        merged.previous_diagnosis ?? base.previous_diagnosis ?? null,
      family_mental_health_history:
        merged.family_mental_health_history ??
        base.family_mental_health_history ??
        null,
      psychosocial_background:
        merged.psychosocial_background ?? base.psychosocial_background ?? null,
      stressors: merged.stressors ?? base.stressors ?? null,
      substance_use_history:
        merged.substance_use_history ?? base.substance_use_history ?? null,
      field_provenance: nextProvenance,
      updated_by: me,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "patient_id" },
  );
  if (saveError) return { ok: false, message: saveError.message };

  const { error: reviewError } = await g.supabase
    .from("psych_intake_suggestions")
    .update({
      status: "approved",
      reviewed_by: me,
      reviewed_at: new Date().toISOString(),
    })
    .eq("clinic_id", g.clinicId)
    .eq("patient_id", patientId)
    .eq("status", "pending");
  if (reviewError) return { ok: false, message: reviewError.message };

  revalidatePath(APP_ROUTES.app.patients);
  return ok();
}

/** Marks a suggestion rejected without touching the record. */
export async function rejectPsychIntakeSuggestionAction(
  raw: unknown,
): Promise<ActionResult<string>> {
  const parsed = reviewSuggestionSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const me = await authorName(g.supabase, g.clinicId);
  const { error } = await g.supabase
    .from("psych_intake_suggestions")
    .update({
      status: "rejected",
      reviewed_by: me,
      reviewed_at: new Date().toISOString(),
    })
    .eq("clinic_id", g.clinicId)
    .eq("id", parsed.data.id)
    .eq("status", "pending");
  if (error) return { ok: false, message: error.message };

  revalidatePath(APP_ROUTES.app.patients);
  return ok();
}

/** Edits a pending suggestion's value before it is approved or rejected. */
export async function updatePsychIntakeSuggestionAction(
  raw: unknown,
): Promise<ActionResult<string>> {
  const parsed = editSuggestionSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { error } = await g.supabase
    .from("psych_intake_suggestions")
    .update({ value: parsed.data.value })
    .eq("clinic_id", g.clinicId)
    .eq("id", parsed.data.id)
    .eq("status", "pending");
  if (error) return { ok: false, message: error.message };

  revalidatePath(APP_ROUTES.app.patients);
  return ok();
}

const saveMseFindingsSchema = z.object({ findings: z.unknown() });
const saveMseSummarySchema = z.object({ summary: note });

/**
 * Persists the whole structured MSE — the psychologist's selected findings and
 * observation notes (0082). The legacy `risk_thoughts` column is derived from
 * the risk section so the read-only Overview & Safety tab keeps working, and
 * `assessed_at` records when this examination was taken.
 */
export async function savePsychMseFindingsAction(
  patientId: string,
  raw: unknown,
): Promise<ActionResult<string>> {
  const idCheck = idSchema.safeParse({ id: patientId });
  if (!idCheck.success) return err(firstIssue(idCheck));
  const parsed = saveMseFindingsSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const findings = readMseFindings(parsed.data.findings);
  const me = await authorName(g.supabase, g.clinicId);
  const { error } = await g.supabase.from("psych_mse").upsert(
    {
      clinic_id: g.clinicId,
      patient_id: patientId,
      findings,
      risk_thoughts: riskThoughtsFromFindings(findings),
      assessed_at: new Date().toISOString(),
      updated_by: me,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "patient_id" },
  );
  if (error) return { ok: false, message: error.message };
  return ok();
}

/** Saves the assistant's MSE summary only once the psychologist approves it. */
export async function savePsychMseSummaryAction(
  patientId: string,
  raw: unknown,
): Promise<ActionResult<string>> {
  const idCheck = idSchema.safeParse({ id: patientId });
  if (!idCheck.success) return err(firstIssue(idCheck));
  const parsed = saveMseSummarySchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const me = await authorName(g.supabase, g.clinicId);
  const { error } = await g.supabase.from("psych_mse").upsert(
    {
      clinic_id: g.clinicId,
      patient_id: patientId,
      ai_summary: parsed.data.summary?.trim() || null,
      updated_by: me,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "patient_id" },
  );
  if (error) return { ok: false, message: error.message };
  return ok();
}

export type MseAssistKind = "summary" | "draft" | "improve" | "summarize";

const mseAssistSchema = z.object({
  kind: z.enum(["summary", "draft", "improve", "summarize"]),
  findings: z.unknown().optional(),
  fieldLabel: z.string().trim().max(80).optional().default("Clinical notes"),
  text: z.string().max(8000).optional().default(""),
});

const MSE_ASSIST_INSTRUCTION: Record<MseAssistKind, string> = {
  summary:
    "You are writing the summary line of a mental status examination for a clinic record. Using ONLY the structured findings provided, write a concise, neutral clinical summary in 2 to 4 sentences. Third person, past tense. State the observed domains (appearance, behaviour, speech, mood, affect, thought, perception, cognition, insight, judgement), the risk level and any safety concern. Never invent findings that are not listed, never state a diagnosis and never suggest treatment. Output the summary only, plain text, no headings, no preamble.",
  draft:
    "You are a clinical documentation assistant for a mental status examination. Using the psychologist's rough notes below, write a concise, professional observation note in neutral clinical prose. Third person, past tense, 1 to 3 sentences. Never invent findings, never state a diagnosis and never suggest treatment. Output the note only, plain text, no preamble.",
  improve:
    "You are a clinical documentation editor for a mental status examination. Rewrite the observation note below in clear, neutral, professional clinical prose. Preserve every fact and the original meaning exactly; do not add, remove or infer clinical detail. Output the rewritten note only, plain text, no preamble.",
  summarize:
    "You summarise a single mental status examination note for a clinician. Compress the note below into 1 to 3 concise sentences of neutral clinical prose, keeping only the key facts. Never invent detail. Output the summary only, plain text, no preamble.",
};

/**
 * AI assistance for the MSE tab (summary from findings, or draft / improve /
 * summarize an observation note). Rides on the same clinic-wide Gemini provider
 * as every other AI surface — it is not a second agent.
 */
export async function assistPsychMseAction(
  raw: unknown,
): Promise<ActionResult<string>> {
  const parsed = mseAssistSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));

  const { kind, fieldLabel } = parsed.data;
  const text = parsed.data.text.trim();
  const findingsDigest =
    kind === "summary"
      ? mseFindingsDigest(readMseFindings(parsed.data.findings))
      : "";

  if (kind === "summary" && findingsDigest.length === 0) {
    return {
      ok: false,
      message: "Record some findings first, then generate the summary.",
    };
  }
  if (kind !== "summary" && text.length === 0) {
    return {
      ok: false,
      message:
        "Write or dictate something first, then let AI improve or summarise it.",
    };
  }

  const g = await guard();
  if (!g.ok) return g.result;

  const provider = await resolveClinicProvider(g.clinicId);
  if (!provider.ok) return provider.result;

  try {
    const prompt =
      kind === "summary"
        ? `Structured mental status examination findings:\n${findingsDigest}`
        : `Field: ${fieldLabel}\n\nNote:\n${text}`;
    const output = await provider.provider.complete({
      systemInstruction: MSE_ASSIST_INSTRUCTION[kind],
      prompt,
      temperature: kind === "summary" ? 0.25 : 0.2,
      maxOutputTokens: kind === "summary" ? 800 : 700,
    });
    const cleaned = output.trim();
    if (!cleaned) {
      return {
        ok: false,
        message: "The assistant returned nothing. Try again.",
      };
    }
    return { ok: true, data: cleaned };
  } catch (error) {
    console.error("[assistPsychMseAction] failed:", error);
    return {
      ok: false,
      message: "The assistant could not respond. Try again.",
    };
  }
}

export async function savePsychCarePlanAction(
  patientId: string,
  raw: unknown,
): Promise<ActionResult<string>> {
  const parsed = savePsychCarePlanSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const me = await authorName(g.supabase, g.clinicId);
  const { error } = await g.supabase.from("psych_care_plans").upsert(
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

  const data = parsed.data;
  const me = await authorName(g.supabase, g.clinicId);
  const doctor = data.doctor_id || (await doctorId(g.supabase, g.clinicId));
  const sessionDate =
    data.session_date || new Date().toISOString().slice(0, 10);

  const values = {
    session_date: sessionDate,
    format: data.format,
    session_type: data.session_type,
    status: data.status,
    behavior: data.behavior || null,
    intervention: data.intervention || null,
    response: data.response || null,
    subjective: data.subjective || null,
    objective: data.objective || null,
    observation_data: data.observation_data || null,
    assessment: data.assessment || null,
    plan: data.plan || null,
    session_summary: data.session_summary || null,
    transcript: data.transcript || null,
    duration_seconds: data.duration_seconds ?? null,
    doctor_id: doctor,
    // Clean display name only — a raw email from any client payload is ignored.
    doctor_name: me,
  };

  // Re-saving an existing note updates the same row (sections, transcript and
  // metadata write over what the previous draft held).
  if (data.id) {
    const { error } = await g.supabase
      .from("psych_sessions")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("clinic_id", g.clinicId);
    if (error) return { ok: false, message: error.message };
    revalidatePath(APP_ROUTES.app.patients);
    return { ok: true, data: data.id };
  }

  const { data: inserted, error } = await g.supabase
    .from("psych_sessions")
    .insert({ clinic_id: g.clinicId, patient_id: patientId, ...values })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };
  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: inserted.id };
}

export async function approvePsychSessionAction(
  id: string,
): Promise<ActionResult<string>> {
  const parsed = approveSessionSchema.safeParse({ id });
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const me = await authorName(g.supabase, g.clinicId);
  const { error } = await g.supabase
    .from("psych_sessions")
    .update({
      status: "approved",
      approved_by: me,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("clinic_id", g.clinicId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: id };
}

/* ------------------------------------------------------------------------- */
/* Psychology — Session-note AI writing (assist + full-note generation)       */
/* ------------------------------------------------------------------------- */

const SESSION_SECTION_GUIDANCE: Record<SessionSectionKey, string> = {
  behavior:
    "Behavior: what the client did, said and presented with in the session — affect, speech, engagement, anything notable.",
  intervention:
    "Intervention: the techniques, questions and responses the psychologist used in the session.",
  response:
    "Response: the client's reaction to the intervention — what changed or stayed the same.",
  subjective:
    "Subjective: what the client themselves reported — symptoms, mood, complaints, their own words where they matter.",
  objective:
    "Objective: observable, measurable facts — the client's presentation, engagement, progress on goals, screening results.",
  observation_data:
    "Data: concrete observations and reported facts gathered this session — the SOAP/DAP counterpart of objective.",
  assessment:
    "Assessment: clinical interpretation — formulation, hypotheses, progress against goals, risk considerations.",
  plan: "Plan: next steps, homework, referrals, follow-up schedule and what the client agreed to.",
};

const ASSIST_KIND_RULE: Record<"draft" | "improve" | "summarize", string> = {
  draft:
    "Write this section fresh from the session transcript. Include every clinically relevant detail and drop conversational noise.",
  improve:
    "Rewrite the clinician's current text into a tighter, cleaner clinical paragraph. Preserve every clinical fact; do not invent or remove detail.",
  summarize:
    "Condense the clinician's current text into the sharpest clinical summary for this section. Keep every fact that affects care.",
};

function assistSessionSystemPrompt(
  format: SessionNoteFormat,
  section: SessionSectionKey,
  fieldLabel: string,
  kind: "draft" | "improve" | "summarize",
): string {
  return `You write clinical psychology progress notes. Write in the first person, from the psychologist's perspective, as a practitioner's session note — specific, respectful, plain clinical language, no jargon, no markdown, no headers, no bullets.

Note format: ${format} — ${NOTE_FORMAT_META[format]}.
You are writing the "${fieldLabel}" section of a ${format} note.

Section guidance: ${SESSION_SECTION_GUIDANCE[section]}

Working mode: ${ASSIST_KIND_RULE[kind]}

Rules:
- Two to six sentences unless the source is too thin, then be concise but complete.
- Never invent facts, quotes, homework or interventions that are not in the source.
- Return only the finished section text.`;
}

export async function assistPsychSessionAction(
  raw: unknown,
): Promise<ActionResult<string>> {
  const parsed = assistSessionSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));

  const { kind, format, section, fieldLabel, text, transcript } = parsed.data;
  if (SESSION_SECTIONS[format].every((def) => def.key !== section)) {
    return {
      ok: false,
      message: `"${format}" notes do not have a "${fieldLabel}" section.`,
    };
  }

  const g = await guard();
  if (!g.ok) return g.result;
  const provider = await resolveClinicProvider(g.clinicId);
  if (!provider.ok) return provider.result;

  const source =
    kind === "draft"
      ? `SESSION TRANSCRIPT:\n${transcript || "(empty — nothing recorded yet)"}`
      : `CURRENT TEXT:\n${text || "(empty — write something first, then improve or summarise it)"}`;

  try {
    const output = await provider.provider.complete({
      systemInstruction: assistSessionSystemPrompt(
        format,
        section,
        fieldLabel,
        kind,
      ),
      prompt: source,
      temperature: kind === "draft" ? 0.3 : 0.2,
      maxOutputTokens: 800,
    });
    const cleaned = output.trim();
    if (!cleaned)
      return {
        ok: false,
        message: "The assistant returned nothing. Try again.",
      };
    if (cleaned.length > 6000) {
      return {
        ok: false,
        message: "The assistant's draft was too long. Try again.",
      };
    }
    return { ok: true, data: cleaned };
  } catch (error) {
    console.error("[assistPsychSessionAction] failed:", error);
    return {
      ok: false,
      message: "The assistant could not respond. Try again.",
    };
  }
}

/** JSON schema the whole-note generator must answer with, limited to the format's sections. */
function sessionNoteJsonSchema(format: SessionNoteFormat) {
  const sectionProps = Object.fromEntries(
    SESSION_SECTIONS[format].map(({ key, label }) => [
      key,
      {
        type: "string",
        description: `The "${label}" section of the ${format} note.`,
      },
    ]),
  );
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      sections: {
        type: "object",
        description: `One entry per ${format} section.`,
        properties: sectionProps,
        additionalProperties: false,
        required: SESSION_SECTIONS[format].map(({ key }) => key),
      },
    },
    required: ["sections"],
  } as const;
}

/** Zod validator for the generator's output, keyed to the requested format. */
function sessionNoteOutputSchema(format: SessionNoteFormat) {
  const sectionShape = {} as Record<SessionSectionKey, z.ZodType>;
  for (const { key } of SESSION_SECTIONS[format]) {
    sectionShape[key] = z.string().trim().max(6000).default("");
  }
  return z.object({ sections: z.object(sectionShape) });
}

const SESSION_NOTE_GENERATION_PROMPT = `You convert a raw session recording transcript into a professional clinical psychology progress note.

The transcript is messy spoken language: false starts, repetitions, interjections. Keep every clinically relevant fact and drop the rest. Write in the first person from the psychologist's perspective, present tense, plain clinical language, no markdown, no headers, no bullets.

Fill exactly the sections of the requested note format and nothing else. Never invent facts, homework, interventions or quotes that are not in the transcript.`;

/**
 * Generates a full session note from a transcript. The transcript is distilled
 * client-side against the selected format so the format selector has real
 * meaning; the clinician stays in control and approves the result.
 */
export async function generatePsychSessionNoteAction(
  patientId: string,
  raw: unknown,
): Promise<
  ActionResult<{ format: SessionNoteFormat; sections: Record<string, string> }>
> {
  const parsed = generateSessionNoteSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: firstIssue(parsed)?.message ?? "Invalid note request.",
    };
  }
  const { format, transcript } = parsed.data;

  const g = await guard();
  if (!g.ok) {
    if (!g.result.ok) {
      return {
        ok: false,
        message: g.result.message,
        fieldErrors: g.result.fieldErrors,
      };
    }
    return {
      ok: false,
      message: "You must have a clinic to perform this action.",
    };
  }
  const provider = await resolveClinicProvider(g.clinicId);
  if (!provider.ok) return provider.result;

  // Continuity context: the latest intake concern and the most recent session
  // help the writer, but must never be repeated into the new note.
  const [lastIntakeRes, lastSessionRes] = await Promise.all([
    g.supabase
      .from("psych_intake")
      .select("presenting_concern")
      .eq("clinic_id", g.clinicId)
      .eq("patient_id", patientId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    g.supabase
      .from("psych_sessions")
      .select("session_date, session_type, format, plan")
      .eq("clinic_id", g.clinicId)
      .eq("patient_id", patientId)
      .eq("status", "approved")
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const concern = lastIntakeRes.data?.presenting_concern?.trim();
  const lastSession = lastSessionRes.data;
  const context = [
    concern ? `- Presenting concern on file: ${concern}` : null,
    lastSession
      ? `- Previous ${lastSession.session_type} session (${lastSession.session_date}, ${lastSession.format}): plan — ${(lastSession.plan ?? "").trim() || "not recorded"}`
      : null,
    "(Previous context is background only — do not copy it into the new note.)",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = [
    "PATIENT CONTEXT (background only, do not repeat into the note):",
    context,
    "",
    `REQUESTED FORMAT: ${format} — ${NOTE_FORMAT_META[format]}`,
    "",
    "SESSION TRANSCRIPT:",
    transcript,
  ].join("\n");

  const sections: Record<string, string> = {};
  try {
    const rawJson = await provider.provider.completeJson({
      systemInstruction: SESSION_NOTE_GENERATION_PROMPT,
      prompt,
      schema: sessionNoteJsonSchema(format),
      temperature: 0.2,
      maxOutputTokens: 2200,
    });
    const validated = sessionNoteOutputSchema(format).safeParse(rawJson);
    if (!validated.success) {
      return {
        ok: false,
        message: "The assistant's note was unreadable. Try again.",
      };
    }
    const rawSections = validated.data.sections as Record<string, string>;
    for (const { key } of SESSION_SECTIONS[format]) {
      sections[key] = (rawSections[key] ?? "").trim();
    }
  } catch (error) {
    console.error("[generatePsychSessionNoteAction] failed:", error);
    return {
      ok: false,
      message: "The assistant could not respond. Try again.",
    };
  }
  if (Object.values(sections).every((value) => !value)) {
    return {
      ok: false,
      message:
        "The assistant found nothing in that transcript. Try a longer recording.",
    };
  }
  return { ok: true, data: { format, sections } };
}

/** Read-only display name of the signed-in clinician, for the note header. */
export async function getCurrentClinicianNameAction(): Promise<
  ActionResult<string>
> {
  const g = await guard();
  if (!g.ok) return g.result;
  const name = await authorName(g.supabase, g.clinicId);
  return { ok: true, data: name ?? "" };
}

/** Clinician identity resolved for session notes: display name + linked doctor_id. */
export async function getCurrentClinicianInfoAction(): Promise<
  ActionResult<{ name: string; doctorId: string | null }>
> {
  const g = await guard();
  if (!g.ok) {
    return {
      ok: false,
      message:
        g.result.ok
          ? "You must have a clinic to perform this action."
          : g.result.message,
    };
  }
  const name = await authorName(g.supabase, g.clinicId);
  const doctor = await doctorId(g.supabase, g.clinicId);
  return { ok: true, data: { name: name ?? "Clinician", doctorId: doctor } };
}

export async function deletePsychSessionAction(
  id: string,
): Promise<ActionResult<string>> {
  const parsed = idSchema.safeParse({ id });
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { error } = await g.supabase
    .from("psych_sessions")
    .delete()
    .eq("id", id)
    .eq("clinic_id", g.clinicId);
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

  const raterType = parsed.data.rater_type ?? DEFAULT_RATER_TYPE;
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
      conducted_at:
        parsed.data.conducted_at || new Date().toISOString().slice(0, 10),
      rater_type: raterType,
      rater_name: parsed.data.rater_name || null,
      administration_mode: administrationModeForRater(raterType),
      completed_by: completedByForRater(raterType),
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };
  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: data.id };
}

export async function deletePsychAssessmentAction(
  id: string,
): Promise<ActionResult<string>> {
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

/** Provider-selectable triage transitions (Phase 1 §2.2). CLEAR is system-only. */
const ASSESSMENT_REVIEW_STATUSES = [
  "UNDER_REVIEW",
  "ACTIONED_SAFETY_PLAN",
  "ESCALATED_EMERGENCY",
  "RESOLVED",
] as const;

const updateAssessmentReviewStatusSchema = z.object({
  assessment_id: z.string().uuid(),
  status: z.enum(ASSESSMENT_REVIEW_STATUSES),
  rationale: note,
});

/**
 * Phase 1 §2.2 — record a credentialed provider's triage action on a flagged
 * assessment. Writes the new state to `psych_assessments`, appends an
 * immutable `assessment_safety_events` transition, and an `audit_logs` entry.
 */
export async function updateAssessmentReviewStatusAction(
  raw: unknown,
): Promise<ActionResult<string>> {
  const parsed = updateAssessmentReviewStatusSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: firstIssue(parsed)?.message ?? "Invalid input.",
    };
  }
  const g = await guard();
  if (!g.ok) return g.result;

  const {
    data: { user },
  } = await g.supabase.auth.getUser();
  const userId = user?.id ?? null;

  const { data: assessment } = await g.supabase
    .from("psych_assessments")
    .select("id, patient_id, review_status, risk_level")
    .eq("id", parsed.data.assessment_id)
    .eq("clinic_id", g.clinicId)
    .maybeSingle();
  if (!assessment)
    return { ok: false, message: "That assessment is no longer on file." };

  const now = new Date().toISOString();
  const { error } = await g.supabase
    .from("psych_assessments")
    .update({
      review_status: parsed.data.status,
      reviewed_by: userId,
      reviewed_at: now,
    })
    .eq("id", parsed.data.assessment_id)
    .eq("clinic_id", g.clinicId);
  if (error) return { ok: false, message: error.message };

  const me = await authorName(g.supabase, g.clinicId);
  const { error: eventError } = await g.supabase
    .from("assessment_safety_events")
    .insert({
      clinic_id: g.clinicId,
      patient_id: assessment.patient_id,
      assessment_id: assessment.id,
      from_status: assessment.review_status,
      to_status: parsed.data.status,
      risk_level: assessment.risk_level,
      actor_type: "provider",
      actor_user_id: userId,
      actor_name: me,
      rationale: parsed.data.rationale || null,
      details: {},
      created_at: now,
    });
  if (eventError) {
    console.error("[updateAssessmentReviewStatusAction] event insert failed", {
      assessmentId: assessment.id,
      message: eventError.message,
    });
  }

  if (userId) {
    await logAuditEvent(
      {
        clinicId: g.clinicId,
        userId,
        action: "ASSESSMENT_REVIEW_STATUS_CHANGED",
        resourceType: "psych_assessment",
        resourceId: assessment.id,
        details: {
          from: assessment.review_status,
          to: parsed.data.status,
          riskLevel: assessment.risk_level,
        },
      },
      { supabase: g.supabase },
    );
  }

  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: `Marked ${parsed.data.status}.` };
}

const ASSESSMENT_INTERPRETATION_PROMPT = `You draft a short AI-guided interpretation of a scored psychometric assessment for the treating clinician.

Write 3-5 plain sentences, no markdown, no headers, no bullets:
1. Restate the score and its severity band.
2. If a clinician-authored interpretation rule is supplied for this score, base your reading on it and never contradict it.
3. Name the one or two items with the highest answers and tie each to a concrete point to discuss in the session.
4. Stay non-diagnostic, professional and factual, in the first person ("I would…").

Never invent scores, items or answers that are not in the input.`;

/**
 * AI-guided interpretation for a logged assessment (migration 0085).
 *
 * The clinic authors per-score interpretation rules on the template; this action
 * turns them — plus the item-level answers and severity — into a short clinician
 * narrative with the same assistant used for session notes. When the assistant
 * is unavailable but the template has a matching rule, that authored rule is
 * returned directly so the clinician still gets guidance.
 */
export async function generateAssessmentInterpretationAction(
  assessmentId: string,
): Promise<ActionResult<{ interpretation: string; source: "ai" | "rule" }>> {
  const parsed = idSchema.safeParse({ id: assessmentId });
  if (!parsed.success) {
    return {
      ok: false,
      message: firstIssue(parsed)?.message ?? "Invalid assessment id.",
    };
  }
  const g = await guard();
  if (!g.ok) {
    if (!g.result.ok) {
      return {
        ok: false,
        message: g.result.message,
        fieldErrors: g.result.fieldErrors,
      };
    }
    return {
      ok: false,
      message: "You must have a clinic to perform this action.",
    };
  }

  const { data: assessment } = await g.supabase
    .from("psych_assessments")
    .select("*")
    .eq("id", assessmentId)
    .eq("clinic_id", g.clinicId)
    .maybeSingle();
  if (!assessment)
    return { ok: false, message: "That assessment is no longer on file." };
  if (assessment.score === null) {
    return { ok: false, message: "This assessment has no score to interpret." };
  }

  // Gather what the assistant needs: the matching authored rule (templates
  // only), the instrument label, and each answered item.
  let ruleText: string | null = null;
  let instrumentLabel = assessment.assessment_type;
  const answered: string[] = [];

  if (assessment.template_id) {
    const { data: template } = await g.supabase
      .from("assessment_templates")
      .select("name, questions, interpretation")
      .eq("id", assessment.template_id)
      .eq("clinic_id", g.clinicId)
      .maybeSingle();
    if (template) {
      instrumentLabel = template.name || assessment.assessment_type;
      const rules = template.interpretation as AssessmentInterpretationRule[];
      ruleText = interpretationForScore(rules, assessment.score);
      for (const question of template.questions as AssessmentQuestion[]) {
        if (question.type === "text") continue;
        answered.push(
          `- ${question.text}: ${assessment.answers?.[question.id] ?? "not answered"}`,
        );
      }
    }
  } else if (isPsychometricKey(assessment.assessment_type)) {
    const instrument = PSYCHOMETRIC_INSTRUMENTS[assessment.assessment_type];
    instrumentLabel = instrument.name;
    for (const item of instrument.items) {
      answered.push(
        `- ${item.text}: ${assessment.answers?.[item.id] ?? "not answered"}`,
      );
    }
  }

  const fallbackRule = ruleText?.trim() || null;
  const provider = await resolveClinicProvider(g.clinicId);
  if (!provider.ok) {
    return fallbackRule
      ? { ok: true, data: { interpretation: fallbackRule, source: "rule" } }
      : provider.result;
  }

  const prompt = [
    `Assessment: ${instrumentLabel}`,
    `Score: ${assessment.score}`,
    assessment.severity ? `Severity: ${assessment.severity}` : null,
    fallbackRule
      ? `Clinician-authored interpretation rule for this score: ${fallbackRule}`
      : null,
    "",
    "Item-level answers (question: patient value):",
    answered.length > 0
      ? answered.join("\n")
      : "(no item-level answers recorded)",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  try {
    const interpretation = (
      await provider.provider.complete({
        systemInstruction: ASSESSMENT_INTERPRETATION_PROMPT,
        prompt,
        temperature: 0.3,
        maxOutputTokens: 400,
      })
    ).trim();
    if (interpretation) {
      return { ok: true, data: { interpretation, source: "ai" } };
    }
  } catch (error) {
    console.error("[generateAssessmentInterpretationAction] failed", {
      assessmentId,
      message: error instanceof Error ? error.message : "unknown",
    });
  }

  if (fallbackRule) {
    return { ok: true, data: { interpretation: fallbackRule, source: "rule" } };
  }
  return {
    ok: false,
    message: "The assistant could not phrase an interpretation. Try again.",
  };
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

  const me = await authorName(g.supabase, g.clinicId);
  // Only persist the fields the caller actually sent, so a single-field
  // autosave patches the snapshot instead of nulling every other column.
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;
    values[key] = value === "" ? null : value;
  }
  const { error } = await g.supabase.from("derm_profiles").upsert(
    {
      clinic_id: g.clinicId,
      patient_id: patientId,
      ...values,
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
  visitId?: string | null,
): Promise<ActionResult<string>> {
  const parsed = saveDermExamSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { id, ...rest } = parsed.data;
  const payload = {
    chief_complaints: rest.chief_complaints,
    morphology: rest.morphology,
    distribution: rest.distribution || null,
    diagnosis: rest.diagnosis || null,
    icd_code: rest.icd_code || null,
    notes: rest.notes || null,
    duration: rest.duration || null,
    severity: rest.severity || null,
    triggers: rest.triggers,
    associated_symptoms: rest.associated_symptoms,
    hpi: rest.hpi || null,
    // Only overwrite the stored scoring sheet when the caller sends one, so a
    // Tab 1 history save never wipes a Tab 2 score.
    ...(rest.severity_scores !== undefined
      ? { severity_scores: rest.severity_scores }
      : {}),
    // Tab 3 fields are only touched when the caller (the examination form)
    // actually sends them, so a Tab 1 complaint save preserves the assessment.
    ...(rest.assessment !== undefined
      ? { assessment: rest.assessment || null }
      : {}),
    ...(rest.patient_explanation !== undefined
      ? { patient_explanation: rest.patient_explanation || null }
      : {}),
    ...(rest.follow_up_date !== undefined
      ? { follow_up_date: rest.follow_up_date || null }
      : {}),
    ...(rest.follow_up_notes !== undefined
      ? { follow_up_notes: rest.follow_up_notes || null }
      : {}),
  };

  // Editing today's encounter row (form passes its id back) vs. a fresh visit.
  if (id) {
    const { error } = await g.supabase
      .from("derm_exams")
      .update(payload)
      .eq("id", id)
      .eq("clinic_id", g.clinicId)
      .eq("patient_id", patientId);
    if (error) return { ok: false, message: error.message };
    revalidatePath(APP_ROUTES.app.patients);
    return { ok: true, data: id };
  }

  const { data, error } = await g.supabase
    .from("derm_exams")
    .insert({
      clinic_id: g.clinicId,
      patient_id: patientId,
      doctor_id: await doctorId(g.supabase, g.clinicId),
      visit_id: await resolveEncounterVisitId(
        g.supabase,
        g.clinicId,
        patientId,
        visitId,
      ),
      ...payload,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };
  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: data.id };
}

export async function deleteDermExamAction(
  id: string,
): Promise<ActionResult<string>> {
  const parsed = idSchema.safeParse({ id });
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { error } = await g.supabase
    .from("derm_exams")
    .delete()
    .eq("id", id)
    .eq("clinic_id", g.clinicId);
  if (error) return { ok: false, message: error.message };
  return ok();
}

export async function saveDermProcedureAction(
  patientId: string,
  raw: unknown,
  visitId?: string | null,
): Promise<ActionResult<string>> {
  const parsed = saveDermProcedureSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { id, ...rest } = parsed.data;
  const isBiopsy = rest.procedure_kind === "biopsy";
  // A specimen ID is minted by the backend for a biopsy that has none yet — the
  // clinic's own numbering, not a fabricated lab barcode.
  const specimenId =
    isBiopsy && !id
      ? `SP-${(
          rest.procedure_date || new Date().toISOString().slice(0, 10)
        ).replace(/-/g, "")}-${randomUUID().slice(0, 6).toUpperCase()}`
      : undefined;

  const payload = {
    procedure_name: rest.procedure_name,
    procedure_date: rest.procedure_date || undefined,
    notes: rest.notes || null,
    consent_status: rest.consent_status,
    procedure_kind: rest.procedure_kind || null,
    lesion_id: rest.lesion_id || null,
    body_site: rest.body_site || null,
    params: rest.params ?? {},
    aftercare: rest.aftercare || null,
    complications: rest.complications || null,
    specimen_type: rest.specimen_type || null,
    specimen_lab: rest.specimen_lab || null,
    specimen_status: rest.specimen_status ?? (isBiopsy ? "collected" : null),
    specimen_dispatched_at: rest.specimen_dispatched_at || null,
    ...(specimenId ? { specimen_id: specimenId } : {}),
  };

  if (id) {
    const { error } = await g.supabase
      .from("derm_procedures")
      .update(payload)
      .eq("id", id)
      .eq("clinic_id", g.clinicId)
      .eq("patient_id", patientId);
    if (error) return { ok: false, message: error.message };
    revalidatePath(APP_ROUTES.app.patients);
    return { ok: true, data: id };
  }

  const { data, error } = await g.supabase
    .from("derm_procedures")
    .insert({
      clinic_id: g.clinicId,
      patient_id: patientId,
      doctor_id: await doctorId(g.supabase, g.clinicId),
      visit_id: await resolveEncounterVisitId(
        g.supabase,
        g.clinicId,
        patientId,
        visitId,
      ),
      ...payload,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };
  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: data.id };
}

export async function updateDermSpecimenStatusAction(
  raw: unknown,
): Promise<ActionResult<string>> {
  const parsed = updateDermSpecimenStatusSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { error } = await g.supabase
    .from("derm_procedures")
    .update({ specimen_status: parsed.data.specimen_status })
    .eq("id", parsed.data.id)
    .eq("clinic_id", g.clinicId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(APP_ROUTES.app.patients);
  return ok();
}

export async function deleteDermProcedureAction(
  id: string,
): Promise<ActionResult<string>> {
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
  visitId?: string | null,
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
      visit_id: await resolveEncounterVisitId(
        g.supabase,
        g.clinicId,
        patientId,
        visitId,
      ),
      ...parsed.data,
      document_id: parsed.data.document_id || null,
      paired_with: parsed.data.paired_with || null,
      lesion_id: parsed.data.lesion_id || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };
  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: data.id };
}

export async function deleteDermPhotoAction(
  id: string,
): Promise<ActionResult<string>> {
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

/**
 * Links (or unlinks) an existing derm photo to a lesion pin from the
 * examination tab's middle column. `lesion_id: null` clears the link.
 */
const linkDermPhotoSchema = z.object({
  id: z.string().uuid(),
  lesion_id: optionalUuid,
});

export async function linkDermPhotoToLesionAction(
  raw: unknown,
): Promise<ActionResult<string>> {
  const parsed = linkDermPhotoSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { data, error } = await g.supabase
    .from("derm_photos")
    .update({ lesion_id: parsed.data.lesion_id || null })
    .eq("id", parsed.data.id)
    .eq("clinic_id", g.clinicId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "Photo not found." };
  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: data.id };
}

export async function saveDermRxAction(
  patientId: string,
  raw: unknown,
  visitId?: string | null,
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
    visit_id: await resolveEncounterVisitId(
      g.supabase,
      g.clinicId,
      patientId,
      visitId,
    ),
    ...payload,
  });
  if (error) return { ok: false, message: error.message };
  return ok();
}

export async function saveDermLesionAction(
  patientId: string,
  raw: unknown,
  visitId?: string | null,
): Promise<ActionResult<string>> {
  const parsed = saveDermLesionSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { id, ...rest } = parsed.data;
  const payload = {
    exam_id: rest.exam_id || null,
    body_region: rest.body_region,
    body_view: rest.body_view ?? "front",
    body_x: rest.body_x ?? null,
    body_y: rest.body_y ?? null,
    laterality: rest.laterality || null,
    morphology: rest.morphology,
    color: rest.color,
    texture: rest.texture,
    size_value: rest.size_value ?? null,
    size_unit: rest.size_unit || null,
    observations: rest.observations || null,
  };

  // Editing an existing pin (the map passes its id back) vs. a new pin.
  if (id) {
    const { error } = await g.supabase
      .from("derm_lesions")
      .update(payload)
      .eq("id", id)
      .eq("clinic_id", g.clinicId)
      .eq("patient_id", patientId);
    if (error) return { ok: false, message: error.message };
    revalidatePath(APP_ROUTES.app.patients);
    return { ok: true, data: id };
  }

  // New pins are numbered per patient so "Pin #1 — Left forearm" stays stable.
  const { data: last } = await g.supabase
    .from("derm_lesions")
    .select("pin_number")
    .eq("clinic_id", g.clinicId)
    .eq("patient_id", patientId)
    .order("pin_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const pin_number = ((last?.pin_number as number | null) ?? 0) + 1;

  const { data, error } = await g.supabase
    .from("derm_lesions")
    .insert({
      clinic_id: g.clinicId,
      patient_id: patientId,
      doctor_id: await doctorId(g.supabase, g.clinicId),
      visit_id: await resolveEncounterVisitId(
        g.supabase,
        g.clinicId,
        patientId,
        visitId,
      ),
      pin_number,
      ...payload,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };
  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: data.id };
}

export async function deleteDermLesionAction(
  id: string,
): Promise<ActionResult<string>> {
  const parsed = idSchema.safeParse({ id });
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { error } = await g.supabase
    .from("derm_lesions")
    .delete()
    .eq("id", id)
    .eq("clinic_id", g.clinicId);
  if (error) return { ok: false, message: error.message };
  return ok();
}

export async function saveDermScoresAction(
  patientId: string,
  raw: unknown,
  visitId?: string | null,
): Promise<ActionResult<string>> {
  const parsed = saveDermScoresSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { id, severity_scores } = parsed.data;
  // Touches only the scoring sheet on today's encounter row.
  if (id) {
    const { error } = await g.supabase
      .from("derm_exams")
      .update({ severity_scores })
      .eq("id", id)
      .eq("clinic_id", g.clinicId)
      .eq("patient_id", patientId);
    if (error) return { ok: false, message: error.message };
    revalidatePath(APP_ROUTES.app.patients);
    return { ok: true, data: id };
  }

  const { data, error } = await g.supabase
    .from("derm_exams")
    .insert({
      clinic_id: g.clinicId,
      patient_id: patientId,
      doctor_id: await doctorId(g.supabase, g.clinicId),
      visit_id: await resolveEncounterVisitId(
        g.supabase,
        g.clinicId,
        patientId,
        visitId,
      ),
      severity_scores: parsed.data.severity_scores,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };
  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: data.id };
}

export async function saveDermDiagnosisAction(
  patientId: string,
  raw: unknown,
  visitId?: string | null,
): Promise<ActionResult<string>> {
  const parsed = saveDermDiagnosisSchema.safeParse(raw);
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { id, ...rest } = parsed.data;
  const payload = {
    exam_id: rest.exam_id || null,
    label: rest.label,
    icd_code: rest.icd_code || null,
    status: rest.status,
    notes: rest.notes || null,
  };

  if (id) {
    const { error } = await g.supabase
      .from("derm_diagnoses")
      .update(payload)
      .eq("id", id)
      .eq("clinic_id", g.clinicId)
      .eq("patient_id", patientId);
    if (error) return { ok: false, message: error.message };
    revalidatePath(APP_ROUTES.app.patients);
    return { ok: true, data: id };
  }

  const { data, error } = await g.supabase
    .from("derm_diagnoses")
    .insert({
      clinic_id: g.clinicId,
      patient_id: patientId,
      doctor_id: await doctorId(g.supabase, g.clinicId),
      visit_id: await resolveEncounterVisitId(
        g.supabase,
        g.clinicId,
        patientId,
        visitId,
      ),
      ...payload,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };
  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: data.id };
}

export async function deleteDermDiagnosisAction(
  id: string,
): Promise<ActionResult<string>> {
  const parsed = idSchema.safeParse({ id });
  if (!parsed.success) return err(firstIssue(parsed));
  const g = await guard();
  if (!g.ok) return g.result;

  const { error } = await g.supabase
    .from("derm_diagnoses")
    .delete()
    .eq("id", id)
    .eq("clinic_id", g.clinicId);
  if (error) return { ok: false, message: error.message };
  return ok();
}
