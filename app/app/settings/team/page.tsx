import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ClinicEmptyState } from "@/components/app/clinic-empty-state";
import { TeamManager } from "@/components/settings/team-manager";
import { getCurrentClinic, canWriteClinic } from "@/lib/clinic-access";
import { APP_ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-secondary">Team</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Invite teammates and manage their access.
          </p>
        </div>
        <ClinicEmptyState />
      </div>
    );
  }

  // Staff members can't manage the team (Phase 9 permission audit).
  if (!canWriteClinic(access.role)) {
    redirect(APP_ROUTES.app.dashboard);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-secondary">Team</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {access.clinic.name} · Invite teammates and manage their access.
        </p>
      </div>

      <TeamManager viewerRole={access.role} />
    </div>
  );
}
