import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandLogo } from "@/components/brand-logo";
import { GetStartedWizard } from "@/components/registrations/get-started-wizard";
import { APP_ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Get started",
  description:
    "Choose your plan, pay by bank transfer or mobile wallet, and we email your MedBook AI account credentials once the payment is verified.",
};

/**
 * Public registration funnel.
 *
 * The visitor picks a plan, a payment method and their details, then uploads
 * the payment receipt. A platform admin verifies the payment and provisions
 * the account — nothing is created before that. `?plan=<code>` preselects a
 * plan (the landing page pricing cards link here with their plan code).
 */
export default async function GetStartedPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Someone who is already signed in manages their plan inside the app.
  if (user) {
    redirect(APP_ROUTES.app.dashboard);
  }

  const [{ data: plans }, { data: paymentMethods }] = await Promise.all([
    supabase
      .from("subscription_plans")
      .select("*")
      .eq("active", true)
      .order("price", { ascending: true }),
    supabase
      .from("payment_methods")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true }),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-app">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" aria-label="MedBook AI — home">
            <BrandLogo variant="header" height={30} priority />
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href={APP_ROUTES.getStartedStatus}
              className="text-sm text-text-secondary hover:text-text-primary"
            >
              Check status
            </Link>
            <Link
              href={APP_ROUTES.auth.login}
              className="text-sm font-medium text-primary hover:underline"
            >
              Log in
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <GetStartedWizard
          plans={plans ?? []}
          paymentMethods={paymentMethods ?? []}
          initialPlanCode={plan}
        />
      </main>

      <footer className="border-t border-hairline bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 text-center text-xs text-text-muted">
          MedBook AI — Healthcare Management Platform. Payments are verified manually
          by our team; credentials are emailed once approved.
        </div>
      </footer>
    </div>
  );
}
