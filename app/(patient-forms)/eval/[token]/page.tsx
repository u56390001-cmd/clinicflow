import type { Metadata } from "next";
import { headers } from "next/headers";

import { AssessmentWizard } from "@/components/assessment/assessment-wizard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAssessmentDocument } from "@/lib/assessments/document";
import { detectLanguage } from "@/lib/assessments/translations";

export const metadata: Metadata = {
  // `absolute` bypasses the root layout's "%s | MedBook AI" template — this
  // canvas is white-labelled to the clinic that minted the link.
  title: { absolute: "Clinical Questionnaire" },
  robots: "noindex, nofollow",
  manifest: null,
};

// Sensitive, token-scoped content: never statically rendered or cached, and no
// shared cache may hold a copy.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Phase 3 patient mobile assessment wizard. Lives under `(patient-forms)` so it
 * shares the standalone canvas (URL is `/eval/[token]`). The raw token is the
 * visitor's only credential; a dead, wrong-kind, expired or already-used link
 * shows one deliberately generic card.
 *
 * The browser's language preference seeds the 3-way localisation toggle
 * (English / اردو / Roman Urdu) — the patient can switch instantly on the
 * client without losing progress.
 */
export default async function AssessmentEvalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const headerList = await headers();
  const acceptLanguage = headerList.get("accept-language") ?? "";
  const initialLanguage = detectLanguage(acceptLanguage);

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
    <AssessmentWizard
      key={token}
      token={token}
      instrumentKey={document.instrumentKey}
      instrument={document.instrument ?? null}
      template={document.template ?? null}
      initialLanguage={initialLanguage}
      preview={{
        patientFirstName: preview.patientFirstName,
        clinicName: preview.clinicName,
      }}
    />
  );
}
