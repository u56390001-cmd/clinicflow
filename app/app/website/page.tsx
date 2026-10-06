import { redirect } from "next/navigation";

import { getCurrentClinic, canWriteClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateWebsite } from "@/lib/actions/website";
import WebsiteBuilder from "@/components/website/website-builder";
import type { WidgetAiSettings } from "@/components/website/widget-preview";
import { createDefaultConfig } from "@/types/website";

export const metadata = { title: "Website Builder" };

/**
 * The clinic-wide assistant settings, as the builder's preview needs them.
 *
 * The preview mounts the real chat so a doctor can test a booking flow without
 * publishing, which means it needs the same values the public widget endpoint
 * would hand `widget.js`. Returns nulls rather than throwing when the clinic has
 * never opened the AI Agent settings — an assistant that has not been set up yet
 * is a normal state, not an error.
 */
async function readAiSettings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
): Promise<WidgetAiSettings> {
  const { data } = await supabase
    .from("clinic_ai_settings")
    .select(
      "is_activated, enabled, agent_name, welcome_message, widget_avatar_url, widget_header_subtitle",
    )
    .eq("clinic_id", clinicId)
    .maybeSingle();

  return {
    isActivated: data?.is_activated ?? false,
    enabled: data?.enabled ?? false,
    agentName: data?.agent_name ?? null,
    welcomeMessage: data?.welcome_message ?? null,
    avatarUrl: data?.widget_avatar_url ?? null,
    headerSubtitle: data?.widget_header_subtitle ?? null,
  };
}

export default async function WebsitePage() {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) redirect("/app/clinic/new");
  if (!canWriteClinic(access.role)) redirect("/app/dashboard");

  const aiSettings = await readAiSettings(supabase, access.clinic.id);

  // Get or create the website row
  const result = await getOrCreateWebsite();
  if (!result.ok || !result.data) {
    // Fall back: query directly and build defaults inline
    const { data: row } = await supabase
      .from("websites")
      .select("*")
      .eq("clinic_id", access.clinic.id)
      .maybeSingle();

    const defaults = createDefaultConfig();
    const images: import("@/types/database").WebsiteImage[] = [];

    return (
      <WebsiteBuilder
        clinicId={access.clinic.id}
        clinicName={access.clinic.name}
        clinicDoctorName={access.clinic.doctor_name ?? null}
        clinicPhone={access.clinic.phone ?? null}
        clinicEmail={access.clinic.email ?? null}
        clinicAddress={access.clinic.address ?? null}
        clinicSlug={access.clinic.slug}
        websiteId={row?.id ?? ""}
        initialConfig={defaults}
        initialImages={images}
        initialStatus="draft"
        aiSettings={aiSettings}
        services={[]}
        availabilityRules={[]}
        doctors={[]}
      />
    );
  }

  // Fetch services
  const { data: services } = await supabase
    .from("services")
    .select("id, name, description, duration_minutes, price, status")
    .eq("clinic_id", access.clinic.id)
    .order("created_at", { ascending: true });

  // Fetch availability rules
  const { data: availabilityRules } = await supabase
    .from("availability_rules")
    .select("day_of_week, start_time, end_time, enabled")
    .eq("clinic_id", access.clinic.id)
    .order("day_of_week", { ascending: true });

  // Fetch doctors for the preview
  const { data: doctors } = await supabase
    .from("doctors")
    .select(
      "id, name, specialty, photo_url, years_of_experience, qualification, professional_description, credentials, consultation_fee, follow_up_fee, follow_up_valid_for, follow_up_period",
    )
    .eq("clinic_id", access.clinic.id)
    .eq("is_visible", true)
    .order("name", { ascending: true });

  return (
    <WebsiteBuilder
      clinicId={access.clinic.id}
      clinicName={access.clinic.name}
      clinicDoctorName={access.clinic.doctor_name ?? null}
      clinicPhone={access.clinic.phone ?? null}
      clinicEmail={access.clinic.email ?? null}
      clinicAddress={access.clinic.address ?? null}
      clinicSlug={access.clinic.slug}
      websiteId={result.data.website.id}
      initialConfig={result.data.config}
      initialImages={result.data.images}
      initialStatus={result.data.website.status}
      aiSettings={aiSettings}
      services={services ?? []}
      availabilityRules={availabilityRules ?? []}
      doctors={doctors ?? []}
    />
  );
}