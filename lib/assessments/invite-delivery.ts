import { canSendOnline } from "@/lib/assessment-library";
import {
  mintAssessmentInvite,
  recordAssessmentDelivery,
} from "@/lib/assessments/tokens";
import { PSYCHOMETRIC_INSTRUMENTS, isPsychometricKey } from "@/lib/psychometrics";
import { isValidatedInstrumentCode } from "@/lib/scoring";
import { createWidgetClient } from "@/lib/supabase/widget";
import {
  WhatsappNotConnectedError,
  getClinicWhatsappCredentials,
  sendWhatsappText,
} from "@/lib/whatsapp/client";
import {
  ensureConversation,
  logWhatsappMessage,
  touchConversation,
} from "@/lib/whatsapp/conversation";

/**
 * Phase 6 — service-side delivery of a scheduled assessment invite.
 *
 * The interactive path (`mintAndSendLink`, `lib/actions/patient-links.ts`) is
 * session-bound: it authorises the signed-in staff member. The cron has no
 * session, so this module re-implements the same mint → WhatsApp → record
 * sequence against the service-role client, after the caller (a cron guard or a
 * server action) has already established clinic scope.
 *
 * Server-only: uses the service-role client and reads env via the WhatsApp
 * client. Never import from a Client Component.
 */

export type ScheduledInviteInput = {
  clinicId: string;
  patientId: string;
  /** Audit attribution — the staff member who owns the schedule rule. */
  createdBy: string;
  /** Built-in instrument key or library template name (when no templateId). */
  assessmentType: string | null;
  templateId: string | null;
};

export type ScheduledInviteResult =
  | {
      ok: true;
      linkId: string;
      path: string;
      whatsappSent: boolean;
    }
  | {
      ok: false;
      reason:
        | "unsupported_assessment"
        | "patient_not_found"
        | "no_number"
        | "send_failed";
      message: string;
    };

function messageFor(
  firstName: string,
  label: string,
  clinicName: string,
  url: string,
): string {
  const who = firstName ? `Hello ${firstName},` : "Hello,";
  return `${who}\n\nIt's time for your ${label} questionnaire for ${clinicName}. It takes a few minutes on your phone:\n${url}\n\nYour answers are shared privately with your clinician.`;
}

export async function sendScheduledAssessmentInvite(
  input: ScheduledInviteInput,
): Promise<ScheduledInviteResult> {
  const widget = createWidgetClient();
  const { clinicId, patientId, assessmentType, templateId } = input;

  // Resolve what the patient form will render (mirrors mintAndSendLink).
  let resolvedType: string | null = null;
  let resolvedTemplateId: string | null = null;
  let label: string;
  if (templateId) {
    const { data: template } = await widget
      .from("assessment_templates")
      .select("id, name, status, questions, scoring")
      .eq("id", templateId)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (
      !template ||
      template.status !== "active" ||
      !canSendOnline({ questions: template.questions, scoring: template.scoring })
    ) {
      return {
        ok: false,
        reason: "unsupported_assessment",
        message: "That assessment is no longer active and sendable.",
      };
    }
    resolvedType = template.name;
    resolvedTemplateId = template.id;
    label = template.name;
  } else if (
    assessmentType &&
    (isPsychometricKey(assessmentType) || isValidatedInstrumentCode(assessmentType))
  ) {
    resolvedType = assessmentType;
    label = isPsychometricKey(assessmentType)
      ? PSYCHOMETRIC_INSTRUMENTS[assessmentType].shortName
      : assessmentType;
  } else {
    return {
      ok: false,
      reason: "unsupported_assessment",
      message: "That assessment is not supported.",
    };
  }

  const { data: patient } = await widget
    .from("patients")
    .select("name, whatsapp_number")
    .eq("clinic_id", clinicId)
    .eq("id", patientId)
    .maybeSingle();
  if (!patient) {
    return { ok: false, reason: "patient_not_found", message: "Patient not found." };
  }
  const waNumber = (patient.whatsapp_number ?? "").replace(/[^\d]/g, "");
  if (!waNumber) {
    return {
      ok: false,
      reason: "no_number",
      message: "Patient has no WhatsApp number.",
    };
  }

  const { data: clinic } = await widget
    .from("clinics")
    .select("name")
    .eq("id", clinicId)
    .maybeSingle();
  const clinicName = clinic?.name ?? "your clinic";

  const invite = await mintAssessmentInvite({
    clinicId,
    patientId,
    createdBy: input.createdBy,
    assessmentType: resolvedType,
    templateId: resolvedTemplateId,
    deliveryChannel: "whatsapp",
    metadata: { source: "assessment_schedule_cron" },
  });

  const firstName = (patient.name ?? "").split(" ")[0];
  const body = messageFor(firstName, label, clinicName, invite.url);

  let whatsappSent = false;
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
      console.error("[sendScheduledAssessmentInvite] WhatsApp send failed", {
        clinicId,
        patientId,
        error: result.error,
      });
    }
  } catch (error) {
    if (error instanceof WhatsappNotConnectedError) {
      console.error("[sendScheduledAssessmentInvite] WhatsApp not connected", {
        clinicId,
      });
    } else {
      console.error("[sendScheduledAssessmentInvite] WhatsApp error", {
        clinicId,
        patientId,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  await recordAssessmentDelivery(invite.id, {
    channel: "whatsapp",
    status: whatsappSent ? "sent" : "failed",
  });

  if (!whatsappSent) {
    return {
      ok: false,
      reason: "send_failed",
      message: "WhatsApp delivery failed.",
    };
  }

  return { ok: true, linkId: invite.id, path: invite.path, whatsappSent };
}
