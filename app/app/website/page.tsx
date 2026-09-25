import { redirect } from "next/navigation";

import { getCurrentClinic, canWriteClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import WebsiteEditorPage from "@/components/website/website-editor";
import { createDefaultConfig } from "@/types/website";
import type { WebsiteConfig } from "@/types/website";

export const metadata = { title: "Website Builder" };

export default async function WebsitePage() {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    redirect("/app/clinic/new");
  }
  if (!canWriteClinic(access.role)) {
    redirect("/app/dashboard");
  }

  // Fetch or create website
  const { data: website } = await supabase
    .from("websites")
    .select("*")
    .eq("clinic_id", access.clinic.id)
    .maybeSingle();

  let websiteData: {
    id: string;
    template: string;
    content_json: Record<string, unknown>;
    theme_json: Record<string, unknown>;
    status: string;
  };
  let websiteId: string;

  if (website) {
    websiteData = website;
    websiteId = website.id;
  } else {
    const defaults = createDefaultConfig();
    const { data: created, error } = await supabase
      .from("websites")
      .insert({
        clinic_id: access.clinic.id,
        slug: access.clinic.slug,
        template: "modern",
        content_json: defaults.content as unknown as Record<string, unknown>,
        theme_json: defaults.theme as unknown as Record<string, unknown>,
      })
      .select()
      .single();

    if (error || !created) {
      redirect("/app/dashboard");
    }
    websiteData = created;
    websiteId = created.id;
  }

  // Fetch images
  const { data: images } = await supabase
    .from("website_images")
    .select("*")
    .eq("website_id", websiteId)
    .order("position", { ascending: true });

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

  const config: WebsiteConfig = {
    template: (websiteData.template as WebsiteConfig["template"]) || "modern",
    content: (websiteData.content_json as WebsiteConfig["content"]) || createDefaultConfig().content,
    theme: (websiteData.theme_json as WebsiteConfig["theme"]) || createDefaultConfig().theme,
  };

  return (
    <WebsiteEditorPage
      clinicId={access.clinic.id}
      initialConfig={config}
      initialImages={images ?? []}
      clinicName={access.clinic.name}
      clinicDoctorName={access.clinic.doctor_name}
      clinicPhone={access.clinic.phone}
      clinicEmail={access.clinic.email}
      clinicAddress={access.clinic.address}
      clinicSlug={access.clinic.slug}
      services={services ?? []}
      availabilityRules={availabilityRules ?? []}
      initialStatus={(websiteData.status as "draft" | "published" | "unpublished") || "draft"}
    />
  );
}
