import type { Metadata } from "next";
import { headers } from "next/headers";

import { AssessmentWizard } from "@/components/assessment/assessment-wizard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAssessmentDocument } from "@/lib/assessments/document";

export const metadata: Metadata = {
  title: "Questionnaire",
  robots: "noindex, nofollow",
};

// Sensitive, token-scoped content: never statically rendered or cached, and no
// shared cache may hold a copy.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const RTL_LANGUAGES = new Set(["ar", "ur", "fa", "he", "ps", "sd"]);

/**
 * Phase 3 patient mobile assessment wizard. Lives under `(patient-forms)` so it
 * shares the standalone canvas (URL is `/eval/[token]`). The raw token is the
 * visitor's only credential; a dead, wrong-kind, expired or already-used link
 * shows one deliberately generic card.
 */
export default async function AssessmentEvalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Choose text direction from the browser's language preference. Tailwind
  // logical properties in the wizard mean one dir flip lays the whole flow out
  // correctly.
  const headerList = await headers();
  const acceptLanguage = headerList.get("accept-language") ?? "";
  const primary = acceptLanguage.split(",")[0]?.trim().slice(0, 2).toLowerCase() ?? "";
  const dir: "ltr" | "rtl" = RTL_LANGUAGES.has(primary) ? "rtl" : "ltr";

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
      dir={dir}
      preview={{
        patientFirstName: preview.patientFirstName,
        clinicName: preview.clinicName,
      }}
    />
  );
}
