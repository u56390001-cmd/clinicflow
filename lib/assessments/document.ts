import { canSendOnline } from "@/lib/assessment-library";
import { resolvePatientLink, type PatientLinkPreview } from "@/lib/patient-links";
import { isPsychometricKey, type PsychometricKey } from "@/lib/psychometrics";
import {
  getInstrument,
  isValidatedInstrumentCode,
  toPatientInstrumentModel,
} from "@/lib/scoring";
import type { PatientInstrumentModel } from "@/lib/scoring/types";
import { createWidgetClient } from "@/lib/supabase/widget";
import type { AssessmentTemplate } from "@/types/database";

/**
 * Resolve an assessment share-link token to the document the patient must
 * complete. Shared by the two public routes — legacy `/assessment/[token]` and
 * the Phase 3 mobile wizard `/eval/[token]` — so both render the same three
 * sources and neither can drift:
 *   * a Phase 1 validated instrument (PHQ-9 / GAD-7 / C-SSRS / PCL-5 / WHODAS);
 *   * the legacy built-in bank (BDI-II); or
 *   * a clinic library template (migration 0085) that is scored + online.
 *
 * Server-only. Returns null for a dead / wrong-kind / non-pending token, or a
 * template that is no longer active/patient-completable.
 */

export type AssessmentDocument = {
  template?: AssessmentTemplate | null;
  instrumentKey?: PsychometricKey;
  instrument?: PatientInstrumentModel;
};

export type LoadedAssessment = {
  preview: PatientLinkPreview;
  document: AssessmentDocument;
};

export async function loadAssessmentDocument(
  token: string,
): Promise<LoadedAssessment | null> {
  const preview = await resolvePatientLink(token, "assessment");
  if (!preview || !preview.assessmentType) return null;

  if (preview.templateId) {
    const widget = createWidgetClient();
    const { data } = await widget
      .from("assessment_templates")
      .select("*")
      .eq("id", preview.templateId)
      .maybeSingle();
    if (
      !data ||
      data.clinic_id !== preview.clinicId ||
      data.status !== "active" ||
      !canSendOnline({ questions: data.questions, scoring: data.scoring })
    ) {
      return null;
    }
    return { preview, document: { template: data } };
  }

  if (isValidatedInstrumentCode(preview.assessmentType)) {
    const def = getInstrument(preview.assessmentType);
    if (!def) return null;
    return { preview, document: { instrument: toPatientInstrumentModel(def) } };
  }

  if (!isPsychometricKey(preview.assessmentType)) return null;
  return { preview, document: { instrumentKey: preview.assessmentType } };
}
