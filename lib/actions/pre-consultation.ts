import {
  preConsultationQuestionsJsonSchema,
  type PreConsultationQuestionsParsed,
} from "@/lib/validation/schemas";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";

/** The scope the question set is attached to: a doctor XOR a service. */
export type PreConsultationScope = { doctorId: string } | { serviceId: string };

/**
 * Parse the hidden `preConsultationQuestionsJson` form field. A blank or
 * malformed value degrades to a disabled empty set so the whole-sale replace
 * below simply clears the scope's questions.
 */
export function parsePreConsultationQuestionsJson(
  rawJson: string,
): PreConsultationQuestionsParsed {
  return preConsultationQuestionsJsonSchema.parse(rawJson);
}

/**
 * Replace a scope's pre-consultation question set wholesale (the form submits
 * the full state). A set whose toggle is off contributes no rows; an enabled
 * set is re-inserted with its own `timing` and the submitted display order.
 * Only owner/admin may write (RLS enforces the same).
 */
export async function replacePreConsultationQuestions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
  scope: PreConsultationScope,
  rawJson: string,
): Promise<ActionResult> {
  let draft: PreConsultationQuestionsParsed;
  try {
    draft = parsePreConsultationQuestionsJson(rawJson);
  } catch {
    return {
      ok: false,
      message:
        "The pre-consultation questions are invalid. Check them and try again.",
    };
  }

  const scopeMatch =
    "doctorId" in scope
      ? { clinic_id: clinicId, doctor_id: scope.doctorId }
      : { clinic_id: clinicId, service_id: scope.serviceId };

  const { error: deleteError } = await supabase
    .from("pre_consultation_questions")
    .delete()
    .match(scopeMatch);
  if (deleteError) {
    console.error("[replacePreConsultationQuestions] delete failed", {
      clinicId,
      scope,
      code: deleteError.code,
      message: deleteError.message,
    });
    return {
      ok: false,
      message:
        "We couldn't update the pre-consultation questions. Please try again.",
    };
  }

  const scopedRow = (timing: "during_booking" | "after_booking") => ({
    clinic_id: clinicId,
    ...("doctorId" in scope
      ? { doctor_id: scope.doctorId, service_id: null }
      : { service_id: scope.serviceId, doctor_id: null }),
    timing,
    active: true,
  });

  const rows = [
    ...draft.duringBooking.map((question) => ({
      ...scopedRow("during_booking"),
      question_text: question.text,
      display_order: question.displayOrder,
    })),
    ...draft.afterBooking.map((question) => ({
      ...scopedRow("after_booking"),
      question_text: question.text,
      display_order: question.displayOrder,
    })),
  ];

  if (rows.length === 0) {
    return { ok: true, data: undefined };
  }

  const { error: insertError } = await supabase
    .from("pre_consultation_questions")
    .insert(rows);
  if (insertError) {
    console.error("[replacePreConsultationQuestions] insert failed", {
      clinicId,
      scope,
      code: insertError.code,
      message: insertError.message,
    });
    return {
      ok: false,
      message:
        "We couldn't save the pre-consultation questions. Please try again.",
    };
  }

  return { ok: true, data: undefined };
}