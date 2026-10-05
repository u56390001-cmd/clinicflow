import type { Metadata } from "next";
import { headers } from "next/headers";

import { ClinicEmptyState } from "@/components/app/clinic-empty-state";
import { getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import { TvDisplaySettingsCard } from "@/components/settings/tv-display-settings-card";

export const metadata: Metadata = {
  title: "TV Display Settings",
  description: "Configure and manage Smart TV live waiting room queue display",
};

export default async function TvDisplaySettingsPage() {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return <ClinicEmptyState />;
  }

  let baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
  if (!baseUrl) {
    try {
      const headersList = await headers();
      const host =
        headersList.get("x-forwarded-host") ||
        headersList.get("host") ||
        "localhost:3000";
      const proto =
        headersList.get("x-forwarded-proto") ||
        (host.includes("localhost") ? "https" : "https");
      baseUrl = `${proto}://${host}`;
    } catch {
      baseUrl = "https://localhost:3000";
    }
  }

  const displayUrl = access.clinic?.slug
    ? `${baseUrl}/display/queue/${access.clinic.slug}`
    : null;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <TvDisplaySettingsCard
        clinicSlug={access.clinic?.slug}
        initialDisplayUrl={displayUrl}
      />
    </div>
  );
}