import type { Metadata } from "next";

import { AssessmentForm } from "@/components/assessment/assessment-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canSendOnline } from "@/lib/assessment-library";
import { resolvePatientLink } from "@/lib/patient-links";
import { isPsychometricKey, type PsychometricKey } from "@/lib/psychometrics";
import {
  getInstrument,
  isValidatedInstrumentCode,
  toPatientInstrumentModel,
} from "@/lib/scoring";
import type { PatientInstrumentModel } from "@/lib/scoring/types";
import { createWidgetClient } from "@/lib/supabase/widget";
import type { AssessmentTemplate } from "@/types/database";

export const metadata: Metadata = { title: "Questionnaire" };

/**
 * Public psychometric assessment link — a validated instrument (Phase 1:
 * PHQ-9 / GAD-7 / C-SSRS / PCL-5 / WHODAS 2.0, scored by the deterministic
 * engine), a legacy built-in (BDI-II), or any clinic library template that is
 * scored and patient-completable. The raw token is the visitor's only
 * credential; a dead, wrong-kind or non-pending link shows one generic card.
 */
async function resolveAssessment(token: string): Promise<
  | {
      template?: AssessmentTemplate | null;
      instrumentKey?: PsychometricKey;
      instrument?: PatientInstrumentModel;
    }
  | null
> {
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
      !canSendOnline({
        questions: data.questions,
        scoring: data.scoring,
      })
    ) {
      return null;
    }
    return { template: data };
  }

  if (isValidatedInstrumentCode(preview.assessmentType)) {
    const def = getInstrument(preview.assessmentType);
    if (!def) return null;
    return { instrument: toPatientInstrumentModel(def) };
  }

  if (!isPsychometricKey(preview.assessmentType)) return null;
  return { instrumentKey: preview.assessmentType };
}

export default async function AssessmentLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await resolvePatientLink(token, "assessment");
  const resolved = await resolveAssessment(token);

  if (!preview || !resolved) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">This link is not active</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm leading-relaxed text-text-secondary">
            It may have expired or already been used. Please ask the clinic for a
            fresh link.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <AssessmentForm
      key={token}
      token={token}
      instrumentKey={resolved.instrumentKey}
      instrument={resolved.instrument ?? null}
      template={resolved.template ?? null}
      preview={{
        patientFirstName: preview.patientFirstName,
        clinicName: preview.clinicName,
      }}
    />
  );
}