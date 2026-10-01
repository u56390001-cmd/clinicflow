import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand";

/**
 * Standalone patient-facing canvas for the pre-intake form pages. No app
 * chrome: just the wordmark and a focused column, comfortable on the phones
 * these links are opened on.
 */
export default function IntakeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-app px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-8 flex justify-center">
          <Wordmark />
        </div>
        {children}
      </div>
    </div>
  );
}