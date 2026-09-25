import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  PreConsultationQuestion,
  PreConsultationTiming,
} from "@/types/database";

/**
 * Shared, server-side helpers for Phase 22 pre-consultation questions, used by
 * the booking service (persisting during-booking answers + triggering the
 * after-booking WhatsApp follow-up), the WhatsApp adapter (deterministic
 * answer capture) and the AI tool layer. No `"use server"` — these are plain
 * DB helpers that run inside whatever client the caller passes.
 */

export type PreConsultationAnswerInput = {
  questionId: string;
  answerText: string;
};

/**
 * What the WhatsApp adapter remembers after a booking that triggered the
 * after-booking follow-up, so the patient's replies can be captured
 * deterministically (sequence known at booking time — no LLM in the loop).
 */
export type PendingFollowUpState = {
  appointmentId: string;
  questionIds: string[];
  questionTexts: string[];
  nextIndex: number;
};

/**
 * Build the pending follow-up state for an appointment IF the booking's scope
 * is configured with after-booking questions. Returns null when there is
 * nothing to capture. The caller (WhatsApp adapter) stores the result in the
 * thread's session state right after booking, and consumes one free-text reply
 * per question in order.
 */
export async function buildPendingFollowUpState(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  appointmentId: string,
): Promise<PendingFollowUpState | null> {
  const { data: appointment } = await supabase
    .from("appointments")
    .select("service_id, doctor_id")
    .eq("clinic_id", clinicId)
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appointment) return null;

  const questions = await getActivePreConsultationQuestions(supabase, clinicId, {
    serviceId: appointment.service_id,
    doctorId: appointment.doctor_id,
    timing: "after_booking",
  });
  if (questions.length === 0) return null;

  return {
    appointmentId,
    questionIds: questions.map((question) => question.id),
    questionTexts: questions.map((question) => question.question_text),
    nextIndex: 0,
  };
}

/**
 * Resolve the ACTIVE question set that applies to a booking. A booking always
 * owns a service and may own a doctor. A set is scoped to exactly one of them,
 * so resolution favours the service's set when the service has ANY active
 * questions, falling back to the doctor's set only when the service owns none
 * (never mixing two scopes). `timing` narrows to the asked phase.
 *
 * Rows come back ordered by `display_order`.
 */
export async function getActivePreConsultationQuestions(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  opts: {
    serviceId: string;
    doctorId?: string | null;
    timing?: PreConsultationTiming;
  },
): Promise<PreConsultationQuestion[]> {
  const [serviceQuestions, doctorQuestions] = await Promise.all([
    supabase
      .from("pre_consultation_questions")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("service_id", opts.serviceId)
      .eq("active", true)
      .order("display_order", { ascending: true }),
    opts.doctorId
      ? supabase
          .from("pre_consultation_questions")
          .select("*")
          .eq("clinic_id", clinicId)
          .eq("doctor_id", opts.doctorId)
          .eq("active", true)
          .order("display_order", { ascending: true })
      : Promise.resolve({ data: [] as PreConsultationQuestion[] | null }),
  ]);

  const scope =
    serviceQuestions.data && serviceQuestions.data.length > 0
      ? serviceQuestions.data
      : (doctorQuestions.data ?? []);
  if (!opts.timing) return scope;
  return scope.filter((question) => question.timing === opts.timing);
}

/**
 * Persist collected answers for an appointment through the
 * `record_pre_consultation_answers` RPC (validates ownership, trims, upserts
 * one row per question). Returns an error only when the appointment is missing
 * or the RPC itself fails; a malformed answer row inside the payload is
 * skipped by the RPC, never fatal.
 */
export async function recordPreConsultationAnswers(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  appointmentId: string,
  answers: PreConsultationAnswerInput[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (answers.length === 0) return { ok: true };
  const { error } = await supabase.rpc("record_pre_consultation_answers", {
    p_clinic_id: clinicId,
    p_appointment_id: appointmentId,
    p_answers: answers.map((answer) => ({
      question_id: answer.questionId,
      answer_text: answer.answerText,
    })),
  });
  if (error) {
    console.error("[pre-consultation] record answers failed", {
      clinicId,
      appointmentId,
      count: answers.length,
      code: error.code,
      message: error.message,
    });
    return {
      ok: false,
      message: "We couldn't store the answers. Please try again.",
    };
  }
  return { ok: true };
}