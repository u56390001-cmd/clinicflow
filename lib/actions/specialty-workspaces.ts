"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getGeminiProvider } from "@/lib/ai/gemini-provider";
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

export type IntakeAssistKind = "draft" | "improve" | "summarize";

const intakeAssistSchema = z.object({
  kind: z.enum(["draft", "improve", "summarize"]),
  fieldLabel: z.string().trim().min(1).max(80),
  text: z.string().max(8000).optional().default(""),
});

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
      message: "Write or dictate something first, then let AI improve or summarise it.",
    };
  }

  const g = await guard();
  if (!g.ok) return g.result;

  if (!process.env.GEMINI_API_KEY) {
    return {
      ok: false,
      message: "The AI assistant is not configured on this server yet.",
    };
  }

  try {
    const output = await getGeminiProvider().complete({
      systemInstruction: INTAKE_ASSIST_INSTRUCTION[kind],
      prompt: `Field: ${fieldLabel}\n\nNote:\n${text || "(empty — the psychologist has not written anything yet)"}`,
      temperature: kind === "draft" ? 0.4 : 0.2,
      maxOutputTokens: 700,
    });
    const cleaned = output.trim();
    if (!cleaned) {
      return { ok: false, message: "The assistant returned nothing. Try again." };
    }
    return { ok: true, data: cleaned };
  } catch (error) {
    console.error("[assistPsychIntakeAction] failed:", error);
    return { ok: false, message: "The assistant could not respond. Try again." };
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
  "family_mental_health_history",
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

function digestLine(label: string, value: string | null | undefined): string | null {
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

  if (!process.env.GEMINI_API_KEY) {
    return { ok: false, message: "The AI assistant is not configured on this server yet." };
  }

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
    const raw = await getGeminiProvider().completeJson({
      systemInstruction: PSYCH_INTAKE_SUGGESTION_PROMPT,
      prompt: digest,
      schema: PSYCH_INTAKE_SUGGESTION_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 1600,
    });
    const validated = generateSuggestionsSchema.safeParse(raw);
    if (!validated.success) {
      return { ok: false, message: "The assistant's suggestions were unreadable. Try again." };
    }
    parsedOutput = validated.data;
  } catch (error) {
    console.error("[generatePsychIntakeSuggestionsAction] failed:", error);
    return { ok: false, message: "The assistant could not respond. Try again." };
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

  const { error } = await g.supabase.from("psych_intake_suggestions").insert(rows);
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
  if (!suggestion) return { ok: false, message: "That suggestion is no longer available." };
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

  const me = await authorName(g.supabase);
  const base = (currentIntake as Record<string, string | null> | null) ?? {};
  const mergedValue = mergeIntakeValue(field, base[field] ?? null, suggestion.value);
  const valueFor = (column: string) =>
    column === field ? mergedValue : (base[column] ?? null);

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
      updated_by: me,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "patient_id" },
  );
  if (saveError) return { ok: false, message: saveError.message };

  const { error: reviewError } = await g.supabase
    .from("psych_intake_suggestions")
    .update({ status: "approved", reviewed_by: me, reviewed_at: new Date().toISOString() })
    .eq("clinic_id", g.clinicId)
    .eq("id", suggestion.id);
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

  const me = await authorName(g.supabase);
  const { error } = await g.supabase
    .from("psych_intake_suggestions")
    .update({ status: "rejected", reviewed_by: me, reviewed_at: new Date().toISOString() })
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