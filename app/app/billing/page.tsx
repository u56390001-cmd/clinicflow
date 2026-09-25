import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { BillingDashboard } from "@/components/billing/billing-dashboard";
import { ClinicEmptyState } from "@/components/app/clinic-empty-state";
import { getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const access = await getCurrentClinic(supabase);

  if (!access) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-secondary">
            Billing
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage your subscription and payments.
          </p>
        </div>
        <ClinicEmptyState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-secondary">
          Billing
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {access.clinic.name} · Subscription &amp; payment management
        </p>
      </div>

      <BillingDashboard />
    </div>
  );
}
