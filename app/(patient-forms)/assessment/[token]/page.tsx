import type { Metadata } from "next";

import { AssessmentForm } from "@/components/assessment/assessment-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolvePatientLink } from "@/lib/patient-links";
import { isPsychometricKey } from "@/lib/psychometrics";

export const metadata: Metadata = { title: "Questionnaire" };

/**
 * Public psychometric assessment link (PHQ-9 / GAD-7 / BDI-II / PCL-5). The raw
 * token is the visitor's only credential; a dead, wrong-kind or non-pending link
 * shows one generic card.
 */
export default async function AssessmentLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await resolvePatientLink(token, "assessment");

  if (!preview || !isPsychometricKey(preview.assessmentType)) {
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
      instrumentKey={preview.assessmentType}
      preview={{
        patientFirstName: preview.patientFirstName,
        clinicName: preview.clinicName,
      }}
    />
  );
}
