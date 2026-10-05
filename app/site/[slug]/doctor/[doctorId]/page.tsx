import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { CLINIC_SLUG_REGEX, getSiteUrl } from "@/lib/constants";
import { createWidgetClient } from "@/lib/supabase/widget";
import { openWidgetFallback, siteRootStyle } from "@/components/website/site-sections";
import { configFromWebsite, resolveWidgetColor } from "@/types/website";
import { Button } from "@/components/ui/button";

type Props = { params: Promise<{ slug: string; doctorId: string }> };

/** Strip tags/newlines so a long bio cannot blow out the meta description. */
function summarize(text: string | null | undefined, max = 160): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

type Loaded = {
  // `theme_json` and `widget_json` are needed here, not just `seo_json`: the
  // bio page renders the same floating assistant as the homepage, so it has to
  // know where to put it, what colour it is and whether it is switched on.
  website: {
    slug: string;
    clinic_id: string;
    seo_json: unknown;
    theme_json: unknown;
    widget_json: unknown;
  };
  clinic: {
    name: string;
    doctor_name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    slug: string;
  };
  doctor: {
    id: string;
    name: string;
    specialty: string | null;
    photo_url: string | null;
    years_of_experience: number | null;
    qualification: string | null;
    professional_description: string | null;
  };
};

/**
 * Load the published website, its clinic, and one visible doctor belonging to
 * it. Every lookup is scoped by `clinic_id` so a doctor id from another clinic
 * cannot be read through someone else's site.
 */
async function load(params: Props["params"]): Promise<Loaded | null> {
  const { slug, doctorId } = await params;
  if (!CLINIC_SLUG_REGEX.test(slug)) return null;

  const supabase = createWidgetClient();

  const { data: website } = await supabase
    .from("websites")
    .select("slug, clinic_id, seo_json, theme_json, widget_json")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!website) return null;

  const [{ data: clinic }, { data: doctor }] = await Promise.all([
    supabase
      .from("clinics")
      .select("name, doctor_name, phone, email, address, slug")
      .eq("id", website.clinic_id)
      .maybeSingle(),
    supabase
      .from("doctors")
      .select(
        "id, name, specialty, photo_url, years_of_experience, qualification, professional_description",
      )
      .eq("id", doctorId)
      .eq("clinic_id", website.clinic_id)
      .eq("is_visible", true)
      .maybeSingle(),
  ]);

  if (!clinic || !doctor) return null;
  return { website, clinic, doctor };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const loaded = await load(params);
  if (!loaded) return { title: "Doctor" };

  const { clinic, doctor } = loaded;
  const { seo } = configFromWebsite({ seo_json: loaded.website.seo_json });

  const title = `${doctor.name}${doctor.specialty ? ` — ${doctor.specialty}` : ""}`;
  const description =
    summarize(doctor.professional_description) ||
    `${doctor.name}${doctor.specialty ? `, ${doctor.specialty}` : ""} at ${clinic.name}. Book an appointment online.`;

  // The site's own noindex switch governs its doctor pages too.
  if (seo.noindex) {
    return { title, description, robots: "noindex, nofollow" };
  }

  const url = `${getSiteUrl()}/site/${loaded.website.slug}/doctor/${doctor.id}`;

  return {
    title,
    description,
    robots: "index, follow",
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: clinic.name,
      type: "profile",
      ...(doctor.photo_url ? { images: [{ url: doctor.photo_url }] } : {}),
    },
  };
}

/** Public bio page for a single doctor, reached from the site's doctors section. */
export default async function DoctorPage({ params }: Props) {
  const loaded = await load(params);
  if (!loaded) notFound();

  const { website, clinic, doctor } = loaded;
  const config = configFromWebsite(website);
  const theme = config.theme;

  const credentials = summarize(doctor.qualification);
  const facts = [
    doctor.specialty ? { label: "Specialty", value: doctor.specialty } : null,
    credentials ? { label: "Qualification", value: credentials } : null,
    doctor.years_of_experience
      ? { label: "Experience", value: `${doctor.years_of_experience} years` }
      : null,
    clinic.address ? { label: "Clinic", value: clinic.address } : null,
    clinic.phone ? { label: "Phone", value: clinic.phone } : null,
  ].filter((row): row is { label: string; value: string } => row !== null);

  return (
    <div style={siteRootStyle(theme)} dir={config.locale.direction}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Physician",
            name: doctor.name,
            ...(doctor.specialty ? { medicalSpecialty: doctor.specialty } : {}),
            ...(doctor.photo_url ? { image: doctor.photo_url } : {}),
            ...(doctor.professional_description
              ? { description: doctor.professional_description }
              : {}),
            worksFor: { "@type": "MedicalClinic", name: clinic.name },
            ...(clinic.phone ? { telephone: clinic.phone } : {}),
          }),
        }}
      />
      {/* A doctor's bio page is part of the same published site, so the
          assistant follows exactly the same switches as the homepage. Injecting
          it unconditionally would put a bubble on doctor pages even for a
          clinic that switched it off, and would silently ignore the position,
          language and colour chosen in the builder. */}
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

      <article className="mx-auto max-w-3xl px-6 py-16">
        <Link
          href={`/site/${website.slug}`}
          className="text-sm font-medium underline underline-offset-4"
          style={{ color: theme.primaryColor }}
        >
          &larr; Back to {clinic.name}
        </Link>

        <header className="mt-8 flex flex-col items-start gap-6 sm:flex-row">
          <div className="relative h-40 w-40 flex-shrink-0 overflow-hidden rounded-full bg-black/5">
            {doctor.photo_url ? (
              <Image
                src={doctor.photo_url}
                alt={doctor.name}
                fill
                priority
                sizes="160px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-5xl font-semibold text-[var(--site-primary)]">
                {doctor.name.trim().charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div>
            <h1 className="text-3xl font-semibold text-[var(--site-ink)]">{doctor.name}</h1>
            {doctor.specialty ? (
              <p className="mt-2 text-lg font-medium" style={{ color: theme.primaryColor }}>
                {doctor.specialty}
              </p>
            ) : null}
            <div className="mt-5">
              <Button asChild>
                <a href={`/widget/${clinic.slug}`} onClick={openWidgetFallback}>
                  Book an appointment
                </a>
              </Button>
            </div>
          </div>
        </header>

        {doctor.professional_description ? (
          <section className="mt-12">
            <h2 className="text-xl font-semibold text-[var(--site-ink)]">About</h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed text-black/70">
              {doctor.professional_description}
            </p>
          </section>
        ) : null}

        {facts.length > 0 ? (
          <section className="mt-12">
            <h2 className="text-xl font-semibold text-[var(--site-ink)]">Details</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {facts.map((row) => (
                <div key={row.label}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-black/50">
                    {row.label}
                  </dt>
                  <dd className="mt-1 text-[var(--site-ink)]">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </article>
    </div>
  );
}