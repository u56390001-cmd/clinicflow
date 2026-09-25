import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { WebsiteTemplate } from "@/components/website/template-index";
import { createWidgetClient } from "@/lib/supabase/widget";
import { CLINIC_SLUG_REGEX } from "@/lib/constants";
import { createDefaultConfig } from "@/types/website";
import type { WebsiteConfig } from "@/types/website";

type Props = { params: Promise<{ slug: string }> };

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!CLINIC_SLUG_REGEX.test(slug)) return { title: "Website" };

  const supabase = createWidgetClient();
  const { data: website } = await supabase
    .from("websites")
    .select("slug, status, clinic_id")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (!website) return { title: "Website" };

  const { data: clinic } = await supabase
    .from("clinics")
    .select("name, doctor_name, address")
    .eq("id", website.clinic_id)
    .maybeSingle();

  if (!clinic) return { title: "Website" };

  const description =
    clinic.doctor_name && clinic.address
      ? `Book appointments online with ${clinic.name}, led by ${clinic.doctor_name}. Located at ${clinic.address}.`
      : `Book appointments online with ${clinic.name}${clinic.doctor_name ? `, led by ${clinic.doctor_name}` : ""}.`;

  const url = `${siteUrl()}/site/${website.slug}`;

  return {
    title: clinic.name,
    description,
    robots: "index, follow",
    alternates: { canonical: url },
    openGraph: {
      title: clinic.name,
      description,
      url,
      siteName: clinic.name,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: clinic.name,
      description,
    },
  };
}

/**
 * Public website page — renders a published clinic website.
 * Uses the service-role client (same pattern as the widget) to bypass RLS,
 * with strict slug validation and status='published' filter.
 * Only published websites are accessible; drafts return a graceful state.
 */
export default async function SitePage({ params }: Props) {
  const { slug } = await params;

  if (!CLINIC_SLUG_REGEX.test(slug)) {
    notFound();
  }

  const supabase = createWidgetClient();

  // Fetch published website
  const { data: website } = await supabase
    .from("websites")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (!website) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-slate-700">Website Not Available</h1>
          <p className="mt-2 text-slate-500">This website is not currently published.</p>
          <p className="mt-1 text-sm text-slate-400">Please check back later or contact the clinic directly.</p>
        </div>
      </div>
    );
  }

  // Fetch clinic info
  const { data: clinic } = await supabase
    .from("clinics")
    .select("name, doctor_name, phone, email, address, timezone, slug")
    .eq("id", website.clinic_id)
    .maybeSingle();

  if (!clinic) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-slate-700">Website Not Available</h1>
          <p className="mt-2 text-slate-500">This clinic&apos;s website is temporarily unavailable.</p>
        </div>
      </div>
    );
  }

  // Fetch images
  const { data: images } = await supabase
    .from("website_images")
    .select("*")
    .eq("website_id", website.id)
    .order("position", { ascending: true });

  // Fetch active services
  const { data: services } = await supabase
    .from("services")
    .select("*")
    .eq("clinic_id", website.clinic_id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  // Fetch availability rules
  const { data: availabilityRules } = await supabase
    .from("availability_rules")
    .select("*")
    .eq("clinic_id", website.clinic_id)
    .order("day_of_week", { ascending: true });

  // Parse config
  const config: WebsiteConfig = {
    template: (website.template as WebsiteConfig["template"]) || "modern",
    content: (website.content_json as WebsiteConfig["content"]) || createDefaultConfig().content,
    theme: (website.theme_json as WebsiteConfig["theme"]) || createDefaultConfig().theme,
  };

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "MedicalClinic",
            name: clinic.name,
            url: `${siteUrl()}/site/${website.slug}`,
            ...(clinic.doctor_name
              ? { employee: { "@type": "Person", name: clinic.doctor_name } }
              : {}),
            ...(clinic.address ? { address: clinic.address } : {}),
            ...(clinic.phone ? { telephone: clinic.phone } : {}),
            ...(clinic.email ? { email: clinic.email } : {}),
          }),
        }}
      />
      {/* Floating AI booking widget — CTAs on this page open it via window.MedBookWidget */}
      <script src="/widget.js" data-clinic={clinic.slug} defer />
      <WebsiteTemplate
        config={config}
        images={images ?? []}
        clinic={{
          name: clinic.name,
          doctor_name: clinic.doctor_name,
          phone: clinic.phone,
          email: clinic.email,
          address: clinic.address,
        }}
        services={services ?? []}
        availabilityRules={availabilityRules ?? []}
        widgetSlug={clinic.slug}
      />
    </div>
  );
}
