import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand";

/**
 * Patient-facing form links are a single, focused page — never an installed
 * app. `manifest: null` drops the root layout's web-app manifest from every
 * form route (assessment, pre-visit, upload, eval) so Chrome never offers
 * "Install app" to a patient who is only here to fill in one form.
 */
export const metadata: Metadata = { manifest: null };

/**
 * Standalone patient-facing canvas for the WhatsApp share-link forms
 * (pre-visit questionnaire, psychometric assessment, document upload). No app
 * chrome: just the wordmark and a focused column, comfortable on the phones
 * these links are opened on.
 */
export default function PatientFormsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-app px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-8 flex justify-center">
          <Wordmark height={30} />
        </div>
        {children}
      </div>
    </div>
  );
}
