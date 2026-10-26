import type { ReactNode } from "react";

/**
 * Standalone patient-facing canvas for the WhatsApp share-link forms
 * (pre-visit questionnaire, psychometric assessment, document upload). No app
 * chrome and NO platform branding — this canvas is white-labelled: each
 * renderer identifies only the clinic that minted the link, so the patient
 * never sees anything but their own clinic. A focused column, comfortable on
 * the phones these links are opened on.
 */
export default function PatientFormsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-app px-4 py-10">
      <div className="w-full max-w-xl">{children}</div>
    </div>
  );
}
