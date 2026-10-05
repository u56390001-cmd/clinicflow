import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { WebsiteTemplate } from "@/components/website/template-index";
import { createWidgetClient } from "@/lib/supabase/widget";
import { CLINIC_SLUG_REGEX, getSiteUrl } from "@/lib/constants";
import { siteRootStyle } from "@/components/website/site-sections";
import { normalizeWebsiteConfig, configFromWebsite, resolveWidgetColor } from "@/types/website";

type Props = { params: Promise<{ slug: string }> };

/** OpenGraph `locale` tags. Must be `lang_TERRITORY`, unlike our stored code. */
const OG_LOCALES: Record<string, string | undefined> = {
  en: "en_US",
  ur: "ur_PK",
  ar: "ar_SA",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!CLINIC_SLUG_REGEX.test(slug)) return { title: "Website" };

  const supabase = createWidgetClient();
  const { data: website } = await supabase
    .from("websites")
    .select("slug, status, clinic_id, seo_json, locale_json, published_at, updated_at")
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

  // Editor-authored SEO wins over the derived default. Normalizing rather than
  // casting means a site saved before the SEO tab existed still gets sane
  // metadata instead of `undefined` leaking into the <title>.
  const { seo, locale } = normalizeWebsiteConfig({
    seo: website.seo_json,
    locale: website.locale_json,
  });

  const fallbackDescription =
    clinic.doctor_name && clinic.address
      ? `Book appointments online with ${clinic.name}, led by ${clinic.doctor_name}. Located at ${clinic.address}.`
      : `Book appointments online with ${clinic.name}${clinic.doctor_name ? `, led by ${clinic.doctor_name}` : ""}.`;

  const title = seo.title?.trim() || clinic.name;
  const description = seo.description?.trim() || fallbackDescription;
  const url = `${getSiteUrl()}/site/${website.slug}`;
  const image = seo.ogImage?.trim() || undefined;

  // OpenGraph wants a `lang_TERRITORY` tag, not our config's bare language
  // code. Unlisted codes simply omit the field rather than emitting junk.
  const ogLocale = OG_LOCALES[locale.language];

  return {
    title,
    description,
    // `noindex` is the editor's explicit "keep this out of search engines".
    // A draft can never reach here, so published is otherwise indexable.
    robots: seo.noindex ? "noindex, nofollow" : "index, follow",
    alternates: {
      canonical: url,
      ...(locale.language !== "en" ? { languages: { [locale.language]: url } } : {}),
    },
    openGraph: {
      title,
      description,
      url,
      siteName: clinic.name,
      type: "website",
      ...(ogLocale ? { locale: ogLocale } : {}),
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
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

  // Fetch doctors. The doctor section renders from this. Note the real column
  // names on `doctors`: the visibility flag is `is_visible` (not `is_active`)
  // and experience lives in `years_of_experience` — there is no `slug`, so a
  // doctor's public URL is built from the site's own `doctor_page_slug`.
  const { data: doctors } = await supabase
    .from("doctors")
    .select(
      "id, name, specialty, photo_url, years_of_experience, qualification, professional_description, credentials",
    )
    .eq("clinic_id", website.clinic_id)
    .eq("is_visible", true)
    .order("name", { ascending: true });

  // Parse config.
  //
  // The columns are `jsonb not null default '{}'`, so a freshly created row
  // really does contain `{}` — and `{}` is truthy, so an `as WebsiteConfig`
  // cast with a `|| {}` fallback would sail straight through and leave the
  // renderer dereferencing `config.content.hero.title` on `undefined`.
  // `configFromWebsite` normalizes the stored partial over the defaults and
   // repairs any slot an older client version never wrote.
   const config = configFromWebsite(website);

   return (
     <div style={siteRootStyle(config.theme)} className="min-h-screen">
       <script
         type="application/ld+json"
         dangerouslySetInnerHTML={{
           __html: JSON.stringify({
             "@context": "https://schema.org",
             "@type": "MedicalClinic",
             name: clinic.name,
             url: `${getSiteUrl()}/site/${website.slug}`,
             ...(clinic.doctor_name
               ? { employee: { "@type": "Person", name: clinic.doctor_name } }
               : {}),
             ...(clinic.address ? { address: clinic.address } : {}),
             ...(clinic.phone ? { telephone: clinic.phone } : {}),
             ...(clinic.email ? { email: clinic.email } : {}),
           }),
         }}
       />
       {/* Whether the floating assistant appears on this site is a website-level
           decision, made with the "Show the assistant" switch in the builder, so
           the script is injected from here rather than left always-on.

           The clinic-wide `clinic_ai_settings.enabled` remains the master switch:
           when the clinic's assistant is off, `/api/widget/<slug>/settings`
           refuses and nothing renders either way. This switch sits on top of that
           and only decides whether the bubble is offered on the public site.

           The inline flag exists so a booking CTA can tell "the assistant is
           switched off for this site" from "the script has not finished
           downloading" — without it, every click waits out the retry window
           before falling back to the chat page. */}
       <script
         dangerouslySetInnerHTML={{
           __html: `window.__medbookAssistantOn=${config.widget.enabled ? "true" : "false"};`,
         }}
       />
       {config.widget.enabled ? (
         <script
           src="/widget.js"
           data-clinic={clinic.slug}
           data-position={config.widget.position}
           data-language={config.widget.language}
           data-color={resolveWidgetColor(config.theme, config.widget)}
           defer
         />
       ) : null}
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
        doctors={doctors ?? []}
        widgetSlug={clinic.slug}
        siteSlug={website.slug}
        locale={config.locale}
        showHeader={config.theme.showHeader}
      />
    </div>
  );
}
