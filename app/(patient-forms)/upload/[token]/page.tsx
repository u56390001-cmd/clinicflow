import type { Metadata } from "next";

import { DocumentUploadForm } from "@/components/upload/document-upload-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolvePatientLink } from "@/lib/patient-links";

export const metadata: Metadata = { title: "Upload documents" };

/**
 * Public document-upload link. The raw token is the visitor's only credential;
 * a dead, wrong-kind or non-pending link shows one generic card.
 */
export default async function DocumentUploadLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await resolvePatientLink(token, "document_upload");

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
    <DocumentUploadForm
      key={token}
      token={token}
      preview={{
        patientFirstName: preview.patientFirstName,
        clinicName: preview.clinicName,
      }}
    />
  );
}
