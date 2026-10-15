"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getBaseUrl } from "@/lib/booking-url";
import { canManageClinical, getCurrentClinic } from "@/lib/clinic-access";
import { APP_ROUTES } from "@/lib/constants";
import {
  patientFillEntry,
  readIntakeProvenance,
  withIntakeProvenance,
} from "@/lib/psych-intake";
import type { IntakeFieldKey } from "@/types/database";
import {
  PATIENT_LINK_TTL_DAYS,
  buildPatientLinkPath,
  randomHexToken,
  resolvePatientLink,
  sha256Hex,
} from "@/lib/patient-links";
import {
  PSYCHOMETRIC_INSTRUMENTS,
  isPsychometricKey,
  scoreInstrument,
  severityFor,
} from "@/lib/psychometrics";
import {
  canSendOnline,
  scoreTemplateAnswers,
  severityFromBands,
} from "@/lib/assessment-library";
import {
  getInstrument,
  isValidatedInstrumentCode,
  scoreValidatedInstrument,
  toInstrumentMeta,
  validateInstrumentAnswers,
} from "@/lib/scoring";
import { applyAssessmentSafety } from "@/lib/scoring/safety";
import {
  administrationModeForRater,
  completedByForRater,
} from "@/lib/assessments/raters";
import { createClient } from "@/lib/supabase/server";
import { createWidgetClient } from "@/lib/supabase/widget";
import {
  ensureConversation,
  logWhatsappMessage,
  touchConversation,
} from "@/lib/whatsapp/conversation";
import {
  WhatsappNotConnectedError,
  getClinicWhatsappCredentials,
  sendWhatsappText,
} from "@/lib/whatsapp/client";
import {
  PATIENT_DOCUMENT_MAX_BYTES,
  PATIENT_DOCUMENTS_BUCKET,
} from "@/types/database";
import type {
  AssessmentRaterType,
  PatientShareLinkDeliveryChannel,
  PatientShareLinkDeliveryStatus,
  PatientShareLinkKind,
} from "@/types/database";
import {
  sanitiseDocumentFileName,
  sniffPatientDocumentMime,
} from "@/lib/document-upload";
import { PRE_VISIT_CREATED_BY } from "@/lib/patient-links-shared";
import type { ActionResult } from "@/types";

const uuidSchema = z.string().uuid();

/* ------------------------------------------------------------------------- */
/* Mint + send a link over the existing WhatsApp channel                      */
/* ------------------------------------------------------------------------- */

type SendLinkResult = ActionResult<{ path: string; whatsappSent: boolean }>;
/** Phase 3 invite result: adds the delivery channel/status (migration 0089). */
type SendInviteResult = ActionResult<{
  path: string;
  whatsappSent: boolean;
  deliveryChannel: PatientShareLinkDeliveryChannel;
  deliveryStatus: PatientShareLinkDeliveryStatus;
}>;

function linkMessage(
  kind: PatientShareLinkKind,
  firstName: string,
  clinicName: string,
  url: string,
  assessmentType: string | null,
): string {
  const who = firstName ? `Hello ${firstName},` : "Hello,";
  if (kind === "assessment") {
    const label =
      assessmentType && isPsychometricKey(assessmentType)
        ? PSYCHOMETRIC_INSTRUMENTS[assessmentType].shortName
        : assessmentType || "questionnaire";
    return `${who}\n\nPlease complete your ${label} questionnaire for ${clinicName} on your phone. It takes a few minutes:\n${url}\n\nYour answers are shared privately with your clinician.`;
  }
  if (kind === "document_upload") {
    return `${who}\n\nYou can securely upload any previous reports, prescriptions or assessment documents for ${clinicName} here:\n${url}\n\nThese are shared privately with your clinician.`;
  }
  return `${who}\n\nPlease answer a few questions before your visit to ${clinicName} — it helps your clinician prepare:\n${url}\n\nYour answers are shared privately with your clinician.`;
}

/**
 * Mint a share link for a patient and send it over the clinic's existing
 * WhatsApp connection. The raw token appears in the database only as its
 * SHA-256 hash; the usable URL is built from the configured site origin the same
 * way every other patient-facing link is.
 *
 * For kind "assessment", `assessmentType` is a built-in instrument key (PHQ-9,
 * GAD-7, BDI-II, PCL-5) when `templateId` is null, or a library template name
 * (migration 0085) when it points at one of the clinic's active templates.
 */
async function mintAndSendLink(
  kind: PatientShareLinkKind,
  patientId: string,
  assessmentType: string | null,
  appointmentId: string | null,
  templateId: string | null = null,
  deliveryChannel: PatientShareLinkDeliveryChannel = "whatsapp",
  raterType: AssessmentRaterType = "SELF",
): Promise<SendLinkResult> {
  if (!uuidSchema.safeParse(patientId).success) {
    return { ok: false, message: "Missing patient id." };
  }
  if (appointmentId !== null && !uuidSchema.safeParse(appointmentId).success) {
    return { ok: false, message: "That appointment is not valid." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to send patient links." };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't send patient links." };
  }
  const clinicId = access.clinic.id;

  // Resolve what the patient form will render: a library template or a built-in.
  let resolvedType: string | null = null;
  let resolvedTemplateId: string | null = null;
  if (kind === "assessment") {
    if (templateId) {
      if (!uuidSchema.safeParse(templateId).success) {
        return { ok: false, message: "That assessment is not supported." };
      }
      const { data: template } = await supabase
        .from("assessment_templates")
        .select("*")
        .eq("id", templateId)
        .eq("clinic_id", clinicId)
        .maybeSingle();
      if (
        !template ||
        template.status !== "active" ||
        !canSendOnline({
          questions: template.questions,
          scoring: template.scoring,
        })
      ) {
        return {
          ok: false,
          message:
            "That assessment can't be patient-completed yet. Activate it and add scored questions in the Assessment Library.",
        };
      }
      resolvedType = template.name;
      resolvedTemplateId = template.id;
    } else if (
      !isPsychometricKey(assessmentType) &&
      !isValidatedInstrumentCode(assessmentType)
    ) {
      return { ok: false, message: "That assessment is not supported." };
    } else {
      resolvedType = assessmentType;
    }
  }

  const { data: patient } = await supabase
    .from("patients")
    .select("id, name, whatsapp_number")
    .eq("clinic_id", clinicId)
    .eq("id", patientId)
    .maybeSingle();
  if (!patient) {
    return { ok: false, message: "That patient is not in this clinic." };
  }
  const waNumber = (patient.whatsapp_number ?? "").replace(/[^\d]/g, "");
  if ((deliveryChannel === "whatsapp" || deliveryChannel === "sms") && !waNumber) {
    return {
      ok: false,
      message: "This patient has no WhatsApp number. Add one and try again.",
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "You need to be signed in to do that." };
  }

  const rawToken = randomHexToken();
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(
    Date.now() + PATIENT_LINK_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const widget = createWidgetClient();
  const { data: inserted, error: insertError } = await widget
    .from("patient_share_links")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      appointment_id: appointmentId,
      kind,
      assessment_type: kind === "assessment" ? resolvedType : null,
      template_id: kind === "assessment" ? resolvedTemplateId : null,
      token_hash: tokenHash,
      created_by: user.id,
      clinician_id: user.id,
      delivery_channel: deliveryChannel,
      delivery_status: "pending",
      rater_type: kind === "assessment" ? raterType : "SELF",
      expires_at: expiresAt,
    })
    .select("id")
    .maybeSingle();
  if (insertError || !inserted) {
    console.error("[mintAndSendLink] insert failed", {
      clinicId,
      patientId,
      kind,
      message: insertError?.message ?? "no row returned",
    });
    return { ok: false, message: "We couldn't create the link. Please try again." };
  }

  const path = buildPatientLinkPath(kind, rawToken);
  const url = `${getBaseUrl()}${path}`;
  const firstName = (patient.name ?? "").split(" ")[0];
  const body = linkMessage(kind, firstName, access.clinic.name, url, resolvedType);

  let whatsappSent = false;
  if (deliveryChannel === "whatsapp") {
    try {
      const credentials = await getClinicWhatsappCredentials(clinicId);
      const result = await sendWhatsappText(credentials, waNumber, body);
      if (result.ok) {
        whatsappSent = true;
        const conversation = await ensureConversation(widget, {
          clinicId,
          patientWhatsappNumber: waNumber,
        });
        if (conversation) {
          await logWhatsappMessage(widget, {
            conversationId: conversation.id,
            clinicId,
            senderType: "staff",
            senderName: "Clinic",
            content: body,
            metaMessageId: result.messageId,
          });
          await touchConversation(widget, {
            conversationId: conversation.id,
            preview: body,
            senderType: "staff",
          });
        }
      } else {
        console.error("[mintAndSendLink] WhatsApp send failed", {
          clinicId,
          patientId,
          kind,
          error: result.error,
        });
      }
    } catch (error) {
      if (error instanceof WhatsappNotConnectedError) {
        console.error("[mintAndSendLink] WhatsApp not connected", { clinicId });
      } else {
        console.error("[mintAndSendLink] WhatsApp error", {
          clinicId,
          patientId,
          kind,
          message: error instanceof Error ? error.message : "unknown",
        });
      }
    }
  }

  // Provider acknowledgement for this channel (0089). Channels other than
  // WhatsApp (SMS is not yet wired, in-clinic/link are manual) stay 'pending'
  // until a delivery receipt arrives.
  const deliveryStatus: PatientShareLinkDeliveryStatus =
    deliveryChannel !== "whatsapp" ? "pending" : whatsappSent ? "sent" : "failed";
  const { error: deliveryError } = await widget
    .from("patient_share_links")
    .update({ delivery_status: deliveryStatus })
    .eq("id", inserted.id);
  if (deliveryError) {
    console.error("[mintAndSendLink] delivery status update failed", {
      clinicId,
      patientId,
      kind,
      message: deliveryError.message,
    });
  }

  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: { path, whatsappSent } };
}

export async function sendPsychPreVisitLinkAction(
  patientId: string,
  appointmentId?: string | null,
): Promise<SendLinkResult> {
  return mintAndSendLink("pre_visit", patientId, null, appointmentId ?? null);
}

export async function sendPsychAssessmentLinkAction(
  patientId: string,
  assessmentType: string,
  templateId?: string | null,
  appointmentId?: string | null,
  deliveryChannel: PatientShareLinkDeliveryChannel = "whatsapp",
  raterType: AssessmentRaterType = "SELF",
): Promise<SendInviteResult> {
  const result = await mintAndSendLink(
    "assessment",
    patientId,
    assessmentType,
    appointmentId ?? null,
    templateId ?? null,
    deliveryChannel,
    raterType,
  );
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      path: result.data.path,
      whatsappSent: result.data.whatsappSent,
      deliveryChannel,
      deliveryStatus: deliveryChannel === "whatsapp" ? (result.data.whatsappSent ? "sent" : "failed") : "pending",
    },
  };
}

/**
 * Phase 3 entry point — issue a patient assessment invite over a chosen
 * delivery channel. Thin, channel-aware wrapper over `mintAndSendLink` so API
 * routes and the cockpit share one implementation. WhatsApp is fully wired;
 * SMS is not yet connected (`delivery_status` stays `pending` and the caller
 * shares the returned link manually); `in_clinic` / `link` never hit a provider.
 */
export async function sendAssessmentInviteAction(input: {
  patientId: string;
  assessmentType?: string | null;
  templateId?: string | null;
  appointmentId?: string | null;
  deliveryChannel?: PatientShareLinkDeliveryChannel;
  raterType?: AssessmentRaterType;
}): Promise<SendInviteResult> {
  const deliveryChannel = input.deliveryChannel ?? "whatsapp";
  if (!input.assessmentType && !input.templateId) {
    return { ok: false, message: "Choose an assessment to send." };
  }
  const result = await mintAndSendLink(
    "assessment",
    input.patientId,
    input.assessmentType ?? null,
    input.appointmentId ?? null,
    input.templateId ?? null,
    deliveryChannel,
    input.raterType ?? "SELF",
  );
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      path: result.data.path,
      whatsappSent: result.data.whatsappSent,
      deliveryChannel,
      deliveryStatus: deliveryChannel === "whatsapp" ? (result.data.whatsappSent ? "sent" : "failed") : "pending",
    },
  };
}

export async function sendPsychDocumentUploadLinkAction(
  patientId: string,
  appointmentId?: string | null,
): Promise<SendLinkResult> {
  return mintAndSendLink("document_upload", patientId, null, appointmentId ?? null);
}

/* ------------------------------------------------------------------------- */
/* Public submissions (no session — the token is the credential)              */
/* ------------------------------------------------------------------------- */

const preVisitSubmissionSchema = z.object({
  stressors: z.string().trim().min(1, "Please tell us what has been worrying you.").max(4000),
  previous_therapy_history: z
    .string()
    .trim()
    .min(1, "Please answer the therapy question.")
    .max(200),
  previous_diagnosis: z.string().trim().max(4000).optional().default(""),
  family_mental_health_history: z.string().trim().max(4000).optional().default(""),
  psychosocial_background: z.string().trim().max(4000).optional().default(""),
  substance_use_history: z.string().trim().max(4000).optional().default(""),
  self_harm: z
    .string()
    .trim()
    .refine((v) => v === "No" || v === "Yes", "Please answer the safety question."),
});

function nonEmpty(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** Prefer what a clinician already wrote; only fill a value that is still empty. */
function fillIfEmpty(current: string | null | undefined, incoming: string): string | null {
  if (nonEmpty(current).length > 0) return current ?? null;
  return nonEmpty(incoming).length > 0 ? incoming.trim() : null;
}

/**
 * The patient-facing pre-visit form submission. Answers flow into the
 * `psych_intake` snapshot (only into still-empty columns) and, when the patient
 * reports thoughts of self-harm, the safety risk level is raised to at least
 * "high" — never lowered.
 */
export async function submitPreVisitLinkAction(
  _prevState: ActionResult<{ count: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ count: number }>> {
  const rawToken = formData.get("token");
  const rawAnswers = formData.get("answers");
  if (typeof rawToken !== "string" || typeof rawAnswers !== "string") {
    return { ok: false, message: "This form is incomplete. Please try again." };
  }

  let parsedAnswers: unknown;
  try {
    parsedAnswers = JSON.parse(rawAnswers);
  } catch {
    return { ok: false, message: "This form is incomplete. Please try again." };
  }

  const submission = preVisitSubmissionSchema.safeParse(parsedAnswers);
  if (!submission.success) {
    return {
      ok: false,
      message: submission.error.issues[0]?.message ?? "Check your answers and try again.",
    };
  }

  const preview = await resolvePatientLink(rawToken, "pre_visit");
  if (!preview) {
    return { ok: false, message: "This link is no longer valid. Ask the clinic for a fresh one." };
  }

  const data = submission.data;
  const widget = createWidgetClient();
  const now = new Date().toISOString();

  const { data: existing } = await widget
    .from("psych_intake")
    .select(
      "field_provenance, previous_therapy_history, previous_diagnosis, family_mental_health_history, psychosocial_background, stressors, substance_use_history",
    )
    .eq("clinic_id", preview.clinicId)
    .eq("patient_id", preview.patientId)
    .maybeSingle();

  const intakeColumns: Record<IntakeFieldKey, string | null> = {
    presenting_concern: null,
    presenting_concern_duration: null,
    presenting_concern_severity: null,
    presenting_concern_words: null,
    previous_therapy_history: fillIfEmpty(existing?.previous_therapy_history, data.previous_therapy_history),
    previous_diagnosis: fillIfEmpty(existing?.previous_diagnosis, data.previous_diagnosis),
    family_mental_health_history: fillIfEmpty(existing?.family_mental_health_history, data.family_mental_health_history),
    psychosocial_background: fillIfEmpty(existing?.psychosocial_background, data.psychosocial_background),
    stressors: fillIfEmpty(existing?.stressors, data.stressors),
    substance_use_history: fillIfEmpty(existing?.substance_use_history, data.substance_use_history),
    additional_clinical_notes: null,
  };

  let provenance = readIntakeProvenance(existing?.field_provenance);
  for (const field of Object.keys(intakeColumns) as IntakeFieldKey[]) {
    const value = intakeColumns[field];
    if (value ? value.trim().length > 0 : false) {
      provenance = withIntakeProvenance(provenance, field, patientFillEntry());
    }
  }

  const { error: intakeError } = await widget.from("psych_intake").upsert(
    {
      clinic_id: preview.clinicId,
      patient_id: preview.patientId,
      presenting_concern: intakeColumns.presenting_concern,
      presenting_concern_duration: intakeColumns.presenting_concern_duration,
      presenting_concern_severity: intakeColumns.presenting_concern_severity,
      presenting_concern_words: intakeColumns.presenting_concern_words,
      previous_therapy_history: intakeColumns.previous_therapy_history,
      previous_diagnosis: intakeColumns.previous_diagnosis,
      family_mental_health_history: intakeColumns.family_mental_health_history,
      psychosocial_background: intakeColumns.psychosocial_background,
      stressors: intakeColumns.stressors,
      substance_use_history: intakeColumns.substance_use_history,
      additional_clinical_notes: intakeColumns.additional_clinical_notes,
      field_provenance: provenance,
      updated_by: PRE_VISIT_CREATED_BY,
      updated_at: now,
    },
    { onConflict: "patient_id" },
  );
  if (intakeError) {
    console.error("[submitPreVisitLinkAction] intake upsert failed", {
      patientId: preview.patientId,
      clinicId: preview.clinicId,
      message: intakeError.message,
    });
    return { ok: false, message: "We couldn't save your answers. Please try again." };
  }

  if (data.self_harm === "Yes") {
    const { data: safety } = await widget
      .from("psych_safety")
      .select("risk_level, risk_factors")
      .eq("clinic_id", preview.clinicId)
      .eq("patient_id", preview.patientId)
      .maybeSingle();
    const rank: Record<string, number> = { low: 0, moderate: 1, high: 2, crisis: 3 };
    const current = safety?.risk_level ?? "low";
    const nextLevel = (rank[current] ?? 0) >= rank.high ? current : "high";
    const factor = "Self-reported thoughts of self-harm (pre-visit form)";
    const factors = [safety?.risk_factors, factor].filter((v) => nonEmpty(v).length > 0).join(", ");
    const { error: safetyError } = await widget.from("psych_safety").upsert(
      {
        clinic_id: preview.clinicId,
        patient_id: preview.patientId,
        risk_level: nextLevel,
        risk_factors: factors,
        updated_by: PRE_VISIT_CREATED_BY,
        updated_at: now,
      },
      { onConflict: "patient_id" },
    );
    if (safetyError) {
      console.error("[submitPreVisitLinkAction] safety upsert failed", {
        patientId: preview.patientId,
        message: safetyError.message,
      });
    }
  }

  const { error: linkError } = await widget
    .from("patient_share_links")
    .update({ status: "used", submitted_at: now, submission: data })
    .eq("id", preview.tokenId);
  if (linkError) {
    console.error("[submitPreVisitLinkAction] link finalize failed", {
      tokenId: preview.tokenId,
      message: linkError.message,
    });
  }

  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: { count: 1 } };
}

const assessmentSubmissionSchema = z.object({
  answers: z.record(z.string(), z.coerce.number().int().min(0).max(999)),
});

/**
 * The patient-facing psychometric assessment submission. Score + severity come
 * from the built-in instrument bank when the link points at a built-in, or from
 * the clinic's library template (migration 0085) when it has one — the same
 * `psych_assessments` row, marked `patient_online`.
 */
export async function submitAssessmentLinkAction(
  _prevState: ActionResult<{ score: number; severity: string | null; instrument: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ score: number; severity: string | null; instrument: string }>> {
  const rawToken = formData.get("token");
  const rawAnswers = formData.get("answers");
  if (typeof rawToken !== "string" || typeof rawAnswers !== "string") {
    return { ok: false, message: "This form is incomplete. Please try again." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawAnswers);
  } catch {
    return { ok: false, message: "This form is incomplete. Please try again." };
  }

  const submission = assessmentSubmissionSchema.safeParse({ answers: parsed });
  if (!submission.success) {
    return { ok: false, message: "Check your answers and try again." };
  }

  const preview = await resolvePatientLink(rawToken, "assessment");
  if (!preview) {
    return { ok: false, message: "This link is no longer valid. Ask the clinic for a fresh one." };
  }

  const answers = submission.data.answers;
  const widget = createWidgetClient();
  const now = new Date().toISOString();

  // Library-template path: answers validate against the template's questions..
  if (preview.templateId) {
    const { data: template } = await widget
      .from("assessment_templates")
      .select("*")
      .eq("id", preview.templateId)
      .maybeSingle();
    if (
      !template ||
      template.clinic_id !== preview.clinicId ||
      template.status !== "active" ||
      template.questions.length === 0
    ) {
      return {
        ok: false,
        message: "This assessment link is invalid. Ask the clinic for a fresh link.",
      };
    }
    for (const question of template.questions) {
      if (question.type === "text") continue;
      if (question.required && answers[question.id] === undefined) {
        return { ok: false, message: "Please answer every question before submitting." };
      }
    }
    const score = scoreTemplateAnswers(template, answers);
    if (score === null) {
      return { ok: false, message: "Check your answers and try again." };
    }
    const severity = severityFromBands(template.scoring.bands, score);

    const { error: insertError } = await widget.from("psych_assessments").insert({
      clinic_id: preview.clinicId,
      patient_id: preview.patientId,
      doctor_id: null,
      assessment_type: template.name,
      template_id: template.id,
      score,
      severity,
      conducted_at: now.slice(0, 10),
      completed_by: completedByForRater(preview.raterType),
      rater_type: preview.raterType,
      administration_mode: administrationModeForRater(preview.raterType),
      answers,
      source_link_id: preview.tokenId,
    });
    if (insertError) {
      console.error("[submitAssessmentLinkAction] template insert failed", {
        patientId: preview.patientId,
        templateId: preview.templateId,
        message: insertError.message,
      });
      return { ok: false, message: "We couldn't save your answers. Please try again." };
    }

    const { error: linkError } = await widget
      .from("patient_share_links")
      .update({ status: "used", submitted_at: now, submission: { answers } })
      .eq("id", preview.tokenId);
    if (linkError) {
      console.error("[submitAssessmentLinkAction] template link finalize failed", {
        tokenId: preview.tokenId,
        message: linkError.message,
      });
    }

    revalidatePath(APP_ROUTES.app.patients);
    return { ok: true, data: { score, severity, instrument: template.name } };
  }

  // Validated-instrument path (migration 0087): the deterministic scoring
  // engine produces the score, severity, subscales, diagnostic criteria and
  // the clinical safety flag. PHQ-9 / GAD-7 / PCL-5 / C-SSRS / WHODAS-2.0.
  const validated = getInstrument(preview.assessmentType);
  if (validated) {
    const validation = validateInstrumentAnswers(validated.code, answers, true);
    if (!validation.success) {
      return { ok: false, message: validation.error };
    }
    const result = scoreValidatedInstrument(validated.code, validation.data);

    const { data: inserted, error: insertError } = await widget
      .from("psych_assessments")
      .insert({
        clinic_id: preview.clinicId,
        patient_id: preview.patientId,
        doctor_id: null,
        assessment_type: validated.code,
        score: result.rawScore,
        severity: result.severityBand,
        conducted_at: now.slice(0, 10),
        completed_by: completedByForRater(preview.raterType),
        answers: validation.data,
        source_link_id: preview.tokenId,
        scaled_score: result.scaledScore,
        subscale_scores: result.subscaleScores,
        diagnostic_criteria_results: result.diagnosticCriteria,
        is_valid: result.isValid,
        invalidation_reason: result.invalidationReason,
        administration_mode: administrationModeForRater(preview.raterType),
        rater_type: preview.raterType,
        template_version: result.instrumentVersion,
        template_snapshot: toInstrumentMeta(validated),
        instrument_code: result.instrumentCode,
        safety_flag_raised: result.safetyFlagRaised,
        risk_level: result.riskLevel,
        review_status: result.safetyFlagRaised ? "PENDING_REVIEW" : "CLEAR",
      })
      .select("id")
      .maybeSingle();
    if (insertError || !inserted) {
      console.error("[submitAssessmentLinkAction] validated insert failed", {
        patientId: preview.patientId,
        instrument: validated.code,
        message: insertError?.message ?? "no row returned",
      });
      return { ok: false, message: "We couldn't save your answers. Please try again." };
    }

    const { data: patientRow } = await widget
      .from("patients")
      .select("name")
      .eq("clinic_id", preview.clinicId)
      .eq("id", preview.patientId)
      .maybeSingle();

    await applyAssessmentSafety({
      widget,
      clinicId: preview.clinicId,
      patientId: preview.patientId,
      assessmentId: inserted.id,
      patientName: patientRow?.name ?? preview.patientFirstName,
      clinicName: preview.clinicName,
      instrumentName: validated.shortName,
      severity: result.severityBand,
      result,
      actorUserId: preview.createdBy,
    });

    const { error: linkError } = await widget
      .from("patient_share_links")
      .update({ status: "used", submitted_at: now, submission: { answers: validation.data } })
      .eq("id", preview.tokenId);
    if (linkError) {
      console.error("[submitAssessmentLinkAction] validated link finalize failed", {
        tokenId: preview.tokenId,
        message: linkError.message,
      });
    }

    revalidatePath(APP_ROUTES.app.patients);
    return {
      ok: true,
      data: {
        score: result.rawScore ?? 0,
        severity: result.severityBand,
        instrument: validated.shortName,
      },
    };
  }

  if (!isPsychometricKey(preview.assessmentType)) {
    return { ok: false, message: "This assessment link is invalid." };
  }
  const instrument = PSYCHOMETRIC_INSTRUMENTS[preview.assessmentType];

  const allowed = new Set(instrument.options.map((option) => option.value));
  for (const item of instrument.items) {
    if (!(item.id in answers)) {
      return { ok: false, message: "Please answer every question before submitting." };
    }
    if (!allowed.has(answers[item.id])) {
      return { ok: false, message: "One of your answers was not valid. Please try again." };
    }
  }

  const score = scoreInstrument(instrument, answers);
  const severity = severityFor(instrument, score);

  const { error: insertError } = await widget.from("psych_assessments").insert({
    clinic_id: preview.clinicId,
    patient_id: preview.patientId,
    doctor_id: null,
    assessment_type: instrument.key,
    score,
    severity,
    conducted_at: now.slice(0, 10),
    completed_by: completedByForRater(preview.raterType),
    rater_type: preview.raterType,
    administration_mode: administrationModeForRater(preview.raterType),
    answers,
    source_link_id: preview.tokenId,
  });
  if (insertError) {
    console.error("[submitAssessmentLinkAction] insert failed", {
      patientId: preview.patientId,
      clinicId: preview.clinicId,
      message: insertError.message,
    });
    return { ok: false, message: "We couldn't save your answers. Please try again." };
  }

  const { error: linkError } = await widget
    .from("patient_share_links")
    .update({ status: "used", submitted_at: now, submission: { answers } })
    .eq("id", preview.tokenId);
  if (linkError) {
    console.error("[submitAssessmentLinkAction] link finalize failed", {
      tokenId: preview.tokenId,
      message: linkError.message,
    });
  }

  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: { score, severity, instrument: instrument.shortName } };
}

/**
 * The patient-facing document upload. Files land in the same private
 * `patient-documents` bucket as every other patient file, tagged
 * `source = 'patient_online'`. The link stays usable until it expires so a
 * patient can upload more than one report.
 */
export async function submitDocumentUploadLinkAction(
  _prevState: ActionResult<{ fileName: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ fileName: string }>> {
  const rawToken = formData.get("token");
  const file = formData.get("file");
  if (typeof rawToken !== "string") {
    return { ok: false, message: "This link is invalid." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a file to upload." };
  }
  if (file.size > PATIENT_DOCUMENT_MAX_BYTES) {
    return {
      ok: false,
      message: `That file is ${(file.size / 1_048_576).toFixed(1)} MB. The limit is 10 MB.`,
    };
  }

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const sniffed = sniffPatientDocumentMime(header);
  if (!sniffed) {
    return {
      ok: false,
      message: "Only PDF, PNG, JPEG and WebP files can be uploaded.",
    };
  }

  const preview = await resolvePatientLink(rawToken, "document_upload");
  if (!preview) {
    return { ok: false, message: "This link is no longer valid. Ask the clinic for a fresh one." };
  }

  const fileName = sanitiseDocumentFileName(file.name, sniffed.extension);
  const objectKey = `${preview.clinicId}/${preview.patientId}/${crypto.randomUUID()}-${fileName}`;
  const widget = createWidgetClient();

  const { error: uploadError } = await widget.storage
    .from(PATIENT_DOCUMENTS_BUCKET)
    .upload(objectKey, file, { contentType: sniffed.mimeType, upsert: false });
  if (uploadError) {
    console.error("[submitDocumentUploadLinkAction] storage upload failed", {
      patientId: preview.patientId,
      message: uploadError.message,
    });
    return { ok: false, message: "We couldn't upload this file. Please try again." };
  }

  const { error: insertError } = await widget.from("patient_documents").insert({
    clinic_id: preview.clinicId,
    patient_id: preview.patientId,
    document_name: fileName.slice(0, 255),
    file_path: objectKey,
    mime_type: sniffed.mimeType,
    size_bytes: file.size,
    uploaded_by_user_id: null,
    source: "patient_online",
  });
  if (insertError) {
    await widget.storage.from(PATIENT_DOCUMENTS_BUCKET).remove([objectKey]);
    console.error("[submitDocumentUploadLinkAction] metadata insert failed", {
      patientId: preview.patientId,
      message: insertError.message,
    });
    return { ok: false, message: "We couldn't save this document. Please try again." };
  }

  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: { fileName } };
}
