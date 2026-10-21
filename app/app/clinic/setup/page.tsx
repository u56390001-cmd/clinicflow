import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check, Lock } from "lucide-react";

import { OnboardingWizard } from "@/components/clinic/onboarding-wizard";
import { APP_ROUTES } from "@/lib/constants";
import { getCurrentClinic } from "@/lib/clinic-access";
import { getEntitlements } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Set up your clinic" };

/**
 * First-run setup for a clinic that was provisioned through the registration
 * funnel.
 *
 * The account, the clinic and the subscription already exist — what is missing
 * is the setup: what kind of facility it is, how many locations, the contact
 * details that go on receipts, and the team. The wizard runs in `complete`
 * mode here, so it updates that clinic instead of creating a second one.
 *
 * The middleware sends every clinic with a NULL `onboarding_completed_at`
 * here; once the setup is saved the marker is set and the app moves on.
 */
export default async function ClinicSetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`${APP_ROUTES.auth.login}?next=${encodeURIComponent(APP_ROUTES.app.clinicSetup)}`);
  }

  const access = await getCurrentClinic(supabase);

  // No clinic at all: the "create" path is the only sensible thing here.
  if (!access) {
    redirect(APP_ROUTES.app.clinicNew);
  }

  // Already set up — nothing to do.
  if (access.clinic.onboardingCompleted) {
    redirect(APP_ROUTES.app.dashboard);
  }

  // What this clinic's plan actually gives it, so the owner can see the
  // modules they are setting up for.
  const entitlements = await getEntitlements(supabase, access.clinic.id);
  const included = (entitlements.plan?.features ?? [])
    .filter((feature) => feature.included)
    .map((feature) => feature.label);
  const excluded = (entitlements.plan?.features ?? [])
    .filter((feature) => !feature.included)
    .map((feature) => feature.label);

  return (
    <div className="space-y-8">
      <OnboardingWizard
        mode="complete"
        clinic={{
          name: access.clinic.name,
          timezone: access.clinic.timezone,
          phone: access.clinic.phone,
          email: access.clinic.email,
          address: access.clinic.address,
        }}
      />

      {entitlements.plan && (
        <section className="mx-auto w-full max-w-4xl rounded-card border border-hairline bg-surface p-6 shadow-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-text-primary">
              What your {entitlements.plan.name} plan includes
            </h2>
            <span className="text-sm font-medium text-text-secondary">
              {entitlements.plan.currency} {entitlements.plan.price.toLocaleString()} /{" "}
              {entitlements.plan.billing_interval}
            </span>
          </div>

          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Available to you
              </p>
              <ul className="mt-2 space-y-1.5">
                {included.map((label) => (
                  <li key={label} className="flex items-start gap-2 text-sm text-text-secondary">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-status-success" />
                    {label}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Upgrade to unlock
              </p>
              <ul className="mt-2 space-y-1.5">
                {excluded.map((label) => (
                  <li key={label} className="flex items-start gap-2 text-sm text-text-muted">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
