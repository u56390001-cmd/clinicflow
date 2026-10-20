import type { Metadata } from "next";

import { ClinicEmptyState } from "@/components/app/clinic-empty-state";
import {
  ZegoSetupWorkspace,
  type ZegoConfigView,
} from "@/components/telehealth/zego-setup-workspace";
import { canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Video Calling",
  description:
    "Connect your own ZEGOcloud project for secure in-app video consultations.",
};

/**
 * Telehealth connection workspace — the per-clinic ZEGOcloud credentials
 * screen (migration 0107). Reads only the member-safe `clinic_zego_config`
 * columns; the Server Secret never appears here because it lives behind a
 * zero-policy secrets table that no client query can reach.
 */
export default async function TelehealthSettingsPage() {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-secondary">
            Video Calling
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Connect your own ZEGOcloud project for secure video consultations.
          </p>
        </div>
        <ClinicEmptyState />
      </div>
    );
  }

  const { data } = await supabase
    .from("clinic_zego_config")
    .select("app_id, connection_status, connected_at, status_message")
    .eq("clinic_id", access.clinic.id)
    .maybeSingle();

  const config: ZegoConfigView | null = data
    ? {
        app_id: data.app_id,
        connection_status: data.connection_status,
        connected_at: data.connected_at,
        status_message: data.status_message,
      }
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-secondary">
          Video Calling
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Connect your own ZEGOcloud project for secure video consultations.
        </p>
      </div>

      <ZegoSetupWorkspace
        config={config}
        canWrite={canWriteClinic(access.role)}
      />
    </div>
  );
}
