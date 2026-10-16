import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand";

/** Patient fills one form here — never an installed app, so no web manifest. */
export const metadata: Metadata = { manifest: null };

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
          <Wordmark height={30} />
        </div>
        {children}
      </div>
    </div>
  );
}