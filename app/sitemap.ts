import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/constants";
import { createWidgetClient } from "@/lib/supabase/widget";

/**
 * Sitemap of every published clinic website plus its visible doctor bios.
 *
 * Only `status = 'published'` rows are listed, which keeps drafts and
 * unpublished sites out of search results. Sites whose SEO settings say
 * `noindex` are omitted too — listing a page we ask crawlers to ignore is a
 * contradiction that shows up as "Indexed, though blocked by noindex" in Search
 * Console.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();

  // The app's own marketing/auth pages. Kept minimal on purpose: this sitemap
  // exists for patient-facing clinic sites.
  const entries: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "weekly", priority: 1 },
  ];

  try {
    const supabase = createWidgetClient();

    const { data: sites } = await supabase
      .from("websites")
      .select("slug, seo_json, published_at, updated_at")
      .eq("status", "published")
      .limit(5000);

    if (!sites) return entries;

    const indexable = sites.filter((site) => {
      const seo = (site.seo_json ?? {}) as { noindex?: unknown };
      return seo.noindex !== true;
    });

    const slugs = indexable.map((site) => site.slug).filter(Boolean);

    // Doctors are fetched once for every indexed site rather than per site,
    // which keeps this to two round trips no matter how many clinics exist.
    const { data: doctors } = slugs.length
      ? await supabase
          .from("websites")
          .select("slug, clinic_id, doctors:doctors!inner(id)")
          .in("slug", slugs)
          .eq("status", "published")
      : { data: [] };

    for (const site of indexable) {
      const updated = site.updated_at ?? site.published_at ?? undefined;

      entries.push({
        url: `${base}/site/${site.slug}`,
        ...(updated ? { lastModified: new Date(updated) } : {}),
        changeFrequency: "monthly",
        priority: 0.8,
      });
    }

    for (const entry of doctors ?? []) {
      const siteSlug = entry.slug as string;
      const nested = entry.doctors as unknown as { id: string }[] | null;
      if (!siteSlug || !nested) continue;

      for (const doctor of nested) {
        entries.push({
          url: `${base}/site/${siteSlug}/doctor/${doctor.id}`,
          changeFrequency: "monthly",
          priority: 0.6,
        });
      }
    }
  } catch {
    // A sitemap must never take the site down. If Supabase is unreachable we
    // still return the entries we can build without a database.
  }

  return entries;
}