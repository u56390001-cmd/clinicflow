import type { Metadata } from "next";

import { AssessmentForm } from "@/components/assessment/assessment-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAssessmentDocument } from "@/lib/assessments/document";

export const metadata: Metadata = { title: "Questionnaire" };

/**
 * Public psychometric assessment link (legacy scrolling form) — a validated
 * instrument (Phase 1: PHQ-9 / GAD-7 / C-SSRS / PCL-5 / WHODAS 2.0, scored by
 * the deterministic engine), a legacy built-in (BDI-II), or any clinic library
 * template that is scored and patient-completable. The raw token is the
 * visitor's only credential; a dead, wrong-kind or non-pending link shows one
 * generic card.
 *
 * The Phase 3 mobile wizard lives at `/eval/[token]`; both share
 * `loadAssessmentDocument` so the two never diverge.
 */
export default async function AssessmentLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const loaded = await loadAssessmentDocument(token);

  if (!loaded) {
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

  const { preview, document } = loaded;

  return (
    <AssessmentForm
      key={token}
      token={token}
      instrumentKey={document.instrumentKey}
      instrument={document.instrument ?? null}
      template={document.template ?? null}
      preview={{
        patientFirstName: preview.patientFirstName,
        clinicName: preview.clinicName,
      }}
    />
  );
}
