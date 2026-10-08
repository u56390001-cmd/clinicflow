import { AiMetricsSection } from "@/components/app/ai-metrics-section";
import { AiSettingsForm } from "@/components/ai/ai-settings-form";
import { ClinicEmptyState } from "@/components/app/clinic-empty-state";
import { canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";

export async function AiSettingsSection() {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-secondary">
            AI Agent
          </h1>
        </div>
        <ClinicEmptyState />
      </div>
    );
  }

  const { data: settings } = await supabase
    .from("clinic_ai_settings")
    .select("*")
    .eq("clinic_id", access.clinic.id)
    .maybeSingle();

  // Explicit columns — `access_token` is service-role-only (migration 0019)
  // and must never be requested from an authenticated client.
  const { data: whatsappConfig } = await supabase
    .from("clinic_whatsapp_config")
    .select(
      "connection_status, display_phone_number, whatsapp_business_account_id, phone_number_id, status_message",
    )
    .eq("clinic_id", access.clinic.id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-secondary">
          AI Agent
        </h1>
      </div>

      <AiMetricsSection clinicId={access.clinic.id} />

      <AiSettingsForm
        settings={settings ?? null}
        whatsappConfig={whatsappConfig ?? null}
        canWrite={canWriteClinic(access.role)}
        clinicSlug={access.clinic.slug}
      />
    </div>
  );
}
