import type { Metadata } from "next";
import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";
import { RegistrationStatusLookup } from "@/components/registrations/registration-status-lookup";
import { APP_ROUTES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Request status",
  description: "Check the status of your MedBook AI registration request.",
};

/**
 * Public status lookup for a registration request. The applicant has no
 * account until the payment is approved, so the reference code is the only way
 * for them to follow the progress.
 */
export default async function RegistrationStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col bg-app">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-4">
          <Link href="/" aria-label="MedBook AI — home">
            <BrandLogo variant="header" height={30} priority />
          </Link>
          <Link
            href={APP_ROUTES.auth.login}
            className="text-sm font-medium text-primary hover:underline"
          >
            Log in
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Request status
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Enter the reference code from your registration request to see where it
            stands.
          </p>
        </div>

        <RegistrationStatusLookup initialCode={code} />
      </main>
    </div>
  );
}
