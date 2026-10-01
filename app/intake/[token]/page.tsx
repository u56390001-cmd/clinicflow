import type { Metadata } from "next";

import { PatientIntakeForm } from "@/components/intake/patient-intake-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolvePatientIntake } from "@/lib/patient-intake";

export const metadata: Metadata = { title: "Health history form" };

/**
 * The public pre-intake link (module 1 of the ingestion scope). The raw 64-hex
 * token in the URL is the visitor's only credential — the page resolves it to
 * the exact clinic + patient and shows either the form or a deliberately
 * generic "unavailable" card. No detail about *why* a link is dead is shown to
 * an unauthenticated visitor.
 */
export default async function IntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const preview = await resolvePatientIntake(token);

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
    <PatientIntakeForm
      key={token}
      preview={{
        patientFirstName: preview.patientFirstName,
        clinicName: preview.clinicName,
      }}
      token={token}
    />
  );
}