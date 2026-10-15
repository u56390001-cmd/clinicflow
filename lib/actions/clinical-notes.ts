"use server";

import { z } from "zod";

import {
  generateLongitudinalSummary,
  type LongitudinalSummary,
  type PsychAssessmentHistory,
} from "@/lib/ai/longitudinal-summary";
import { logAuditEvent } from "@/lib/auth/role-guard";
import { canManageClinical, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";

/**
 * Phase 4 clinical-notes actions.
 *
 * Everything that touches the AI provider (service-role credentials, the model
 * key) or the append-only `clinical_notes` table lives behind these Server
 * Actions — the `AISummaryCard` client component never sees a provider or a
 * privileged client. The approval workflow is enforced here: a note is only
 * written after a human clicks Approve, and the write is audit-logged.
 */

const MAX_NOTE_CHARS = 8000;

const saveNoteSchema = z.object({
  patientId: z.string().uuid(),
  contentMarkdown: z.string().trim().min(1).max(MAX_NOTE_CHARS),
  source: z
    .enum(["ai_longitudinal_summary", "clinician_manual"])
    .default("ai_longitudinal_summary"),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

type Guard =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; clinicId: string; userId: string; userName: string | null }
  | { ok: false; result: ActionResult<never> };

async function guard(): Promise<Guard> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, result: { ok: false, message: "Authentication required." } };
  }
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, result: { ok: false, message: "You must have a clinic to perform this action." } };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, result: { ok: false, message: "Your role cannot manage clinical records." } };
  }
  const meta = user.user_metadata ?? {};
  const userName =
    (typeof meta.name === "string" && meta.name) ||
    (typeof meta.full_name === "string" && meta.full_name) ||
    user.email ||
    null;
  return { ok: true, supabase, clinicId: access.clinic.id, userId: user.id, userName };
}

export type LongitudinalInsight = LongitudinalSummary;

/**
 * Draft (never persist) an AI longitudinal summary for a patient's psychometric
 * history. The clinician reviews, optionally edits, then approves via
 * `saveClinicalNoteAction`.
 */
export async function generateLongitudinalInsightAction(
  patientId: string,
): Promise<ActionResult<LongitudinalInsight>> {
  const parsed = z.string().uuid().safeParse(patientId);
  if (!parsed.success) {
    return { ok: false, message: "Invalid patient id." };
  }

  const g = await guard();
  if (!g.ok) return g.result;

  const { data: assessments, error } = await g.supabase
    .from("psych_assessments")
    .select("assessment_type, score, severity, conducted_at, notes")
    .eq("clinic_id", g.clinicId)
    .eq("patient_id", patientId)
    .order("conducted_at", { ascending: true });

  if (error) {
    console.error("[clinical-notes] assessment history lookup failed", {
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: "Could not load assessment history." };
  }

  const history: PsychAssessmentHistory[] = (assessments ?? []).map((a) => ({
    assessment_type: a.assessment_type,
    score: a.score,
    severity: a.severity,
    conducted_at: a.conducted_at,
    notes: a.notes,
  }));

  const scored = history.filter((a) => a.score !== null);
  if (scored.length < 2) {
    return {
      ok: false,
      message: "At least two scored assessments are needed to analyse a trend.",
    };
  }

  const { data: patient } = await g.supabase
    .from("patient_directory")
    .select("age, date_of_birth, gender")
    .eq("clinic_id", g.clinicId)
    .eq("id", patientId)
    .maybeSingle();

  try {
    const summary = await generateLongitudinalSummary({
      patientId,
      clinicId: g.clinicId,
      patientContext: {
        age: patient?.age ?? null,
        gender: patient?.gender ?? null,
      },
      assessments: history,
    });
    return { ok: true, data: summary };
  } catch (error) {
    console.error("[clinical-notes] longitudinal summary failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return { ok: false, message: "Could not generate a summary right now. Please try again." };
  }
}

/**
 * Persist a clinician-approved clinical note. This is the only write path to
 * `clinical_notes`, and it records an audit event so approving an AI draft is
 * a traceable act.
 */
export async function saveClinicalNoteAction(
  input: unknown,
): Promise<ActionResult<string>> {
  const parsed = saveNoteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the note and try again.",
    };
  }

  const g = await guard();
  if (!g.ok) return g.result;

  // The patient must belong to the caller's clinic — a note can never be
  // attached across a tenant boundary.
  const { data: patient } = await g.supabase
    .from("patients")
    .select("id")
    .eq("clinic_id", g.clinicId)
    .eq("id", parsed.data.patientId)
    .maybeSingle();
  if (!patient) {
    return { ok: false, message: "Patient not found." };
  }

  const { data: note, error } = await g.supabase
    .from("clinical_notes")
    .insert({
      clinic_id: g.clinicId,
      patient_id: parsed.data.patientId,
      author_user_id: g.userId,
      author_name: g.userName,
      source: parsed.data.source,
      content_markdown: parsed.data.contentMarkdown,
      metadata: parsed.data.metadata,
    })
    .select("id")
    .single();

  if (error || !note) {
    console.error("[clinical-notes] save failed", {
      code: error?.code,
      message: error?.message,
    });
    return { ok: false, message: "Could not save the note. Please try again." };
  }

  await logAuditEvent(
    {
      clinicId: g.clinicId,
      userId: g.userId,
      action: "CLINICAL_NOTE_APPROVED",
      resourceType: "clinical_note",
      resourceId: note.id,
      details: {
        patient_id: parsed.data.patientId,
        source: parsed.data.source,
      },
    },
    { supabase: g.supabase },
  );

  return { ok: true, data: note.id };
}
