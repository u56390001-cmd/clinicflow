import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ClinicEmptyState } from "@/components/app/clinic-empty-state";
import { ClinicSettingsForm } from "@/components/settings/clinic-settings-form";
import { GoogleReviewQrCard } from "@/components/settings/google-review-qr-card";
import { Button } from "@/components/ui/button";
import { getCurrentClinic, canWriteClinic } from "@/lib/clinic-access";
import { APP_ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Clinic settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-secondary">
            Clinic settings
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage your clinic&apos;s profile.
          </p>
        </div>
        <ClinicEmptyState />
      </div>
    );
  }

  // Staff members can't access clinic settings (Phase 9 permission audit).
  if (!canWriteClinic(access.role)) {
    redirect(APP_ROUTES.app.dashboard);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-secondary">
          Clinic settings
        </h1>
        <Button asChild variant="outline" size="sm">
          <Link href={APP_ROUTES.app.team}>Manage team</Link>
        </Button>
      </div>
      <p className="-mt-4 text-sm text-text-secondary">
        {access.clinic.name} · /{access.clinic.slug}
      </p>

      <ClinicSettingsForm clinic={access.clinic} canWrite={canWriteClinic(access.role)} />

      <GoogleReviewQrCard
        savedUrl={access.clinic.google_review_url}
        clinicSlug={access.clinic.slug}
        canWrite={canWriteClinic(access.role)}
      />
    </div>
  );
}
