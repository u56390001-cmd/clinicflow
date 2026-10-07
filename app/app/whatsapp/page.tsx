import type { Metadata } from "next";

import { ClinicEmptyState } from "@/components/app/clinic-empty-state";
import {
  WhatsappSetupWorkspace,
  type WhatsappConfigView,
} from "@/components/whatsapp/whatsapp-setup-workspace";
import { canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "WhatsApp Setup",
  description: "Connect your WhatsApp Business account and activate AI messaging",
};

export default async function WhatsappSetupPage() {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-secondary">
            WhatsApp Setup
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Connect your clinic number and activate AI-powered messaging.
          </p>
        </div>
        <ClinicEmptyState />
      </div>
    );
  }

  const { data } = await supabase
    .from("clinic_whatsapp_config")
    .select(
      "connection_status, display_phone_number, whatsapp_business_account_id, status_message",
    )
    .eq("clinic_id", access.clinic.id)
    .maybeSingle();

  const config: WhatsappConfigView | null = data
    ? {
        connection_status: data.connection_status,
        display_phone_number: data.display_phone_number,
        whatsapp_business_account_id: data.whatsapp_business_account_id,
        status_message: data.status_message,
      }
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-secondary">
          WhatsApp Setup
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Connect your clinic number and activate AI-powered messaging.
        </p>
      </div>

      <WhatsappSetupWorkspace
        config={config}
        canWrite={canWriteClinic(access.role)}
      />
    </div>
  );
}