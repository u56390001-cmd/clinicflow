import type { Metadata } from "next";

import { PreVisitForm } from "@/components/pre-visit/pre-visit-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolvePatientLink } from "@/lib/patient-links";

export const metadata: Metadata = { title: "Before your visit" };

/**
 * Public pre-visit questionnaire link. The raw token is the visitor's only
 * credential; a dead, wrong-kind or non-pending link shows one generic card.
 */
export default async function PreVisitLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await resolvePatientLink(token, "pre_visit");

  if (!preview) {
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
    <PreVisitForm
      key={token}
      token={token}
      preview={{
        patientFirstName: preview.patientFirstName,
        clinicName: preview.clinicName,
      }}
    />
  );
}
