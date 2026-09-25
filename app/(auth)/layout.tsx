import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-app px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Wordmark />
        </div>
        {children}
      </div>
    </div>
  );
}
