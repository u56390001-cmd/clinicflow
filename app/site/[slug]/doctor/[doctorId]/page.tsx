import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { CLINIC_SLUG_REGEX, getSiteUrl } from "@/lib/constants";
import { createWidgetClient } from "@/lib/supabase/widget";
import { siteRootStyle } from "@/components/website/site-sections";
import { SiteCta } from "@/components/website/site-ui";
import { configFromWebsite, resolveWidgetColor } from "@/types/website";

type Props = { params: Promise<{ slug: string; doctorId: string }> };

/** Strip tags/newlines so a long bio cannot blow out the meta description. */
function summarize(text: string | null | undefined, max = 160): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Collapse a free-text field onto one line without truncating it. */
function oneLine(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
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

  /* `oneLine`, not `summarize`: that helper exists to cap a *meta description*
     at 160 characters, and running a qualification through it meant a long
     degree string was silently cut off mid-word on the page. Here the only
     thing wanted is the line breaks a free-text field picked up. */
  const credentials = oneLine(doctor.qualification);
  const facts = [
    doctor.specialty ? { label: "Specialty", value: doctor.specialty } : null,
    credentials ? { label: "Qualification", value: credentials } : null,
    doctor.years_of_experience
      ? { label: "Experience", value: `${doctor.years_of_experience} years` }
      : null,
    clinic.address ? { label: "Clinic", value: clinic.address } : null,
  ].filter((row): row is { label: string; value: string } => row !== null);

  return (
    /* `site-root` so this page answers to its own width and inherits the derived
       ink tokens — without it the bio sat on the app's palette and a clinic
       with a blue brand got the app's teal booking button. */
    <div className="site-root min-h-screen" style={siteRootStyle(theme)} dir={config.locale.direction}>
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

      <article className="mx-auto max-w-5xl px-6 py-14 sm:py-20">
        <Link
          href={`/site/${website.slug}`}
          className="site-meta inline-flex min-h-11 items-center transition-colors hover:text-[var(--site-ink)]"
        >
          <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
          {clinic.name}
        </Link>

        {/* Portrait and identity on one row, bio beneath. The portrait is a
            rounded rectangle at the site's radius rather than a circle: a
            headshot in a ring is the oldest possible signal for "hospital
            website", and it also crops a 4:5 portrait down to a 1:1 disc and
            loses the shoulders. */}
        <header className="site-profile-head">
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[var(--site-radius)] bg-[var(--site-tint-strong)]">
            {doctor.photo_url ? (
              <Image
                src={doctor.photo_url}
                alt={doctor.name}
                fill
                priority
                sizes="(min-width: 768px) 22rem, 60vw"
                className="object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center font-semibold"
                style={{
                  fontSize: "clamp(3.5rem, 9cqi, 6rem)",
                  color: theme.primaryColor,
                }}
              >
                {doctor.name.trim().charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          <div className="min-w-0">
            <h1
              className="site-display text-[var(--site-ink)]"
              style={{ fontFamily: "var(--site-heading-font)" }}
            >
              {doctor.name}
            </h1>

            {doctor.specialty ? (
              <p
                className="mt-3 text-[1.0625rem] font-medium"
                style={{ color: theme.primaryColor }}
              >
                {doctor.specialty}
              </p>
            ) : null}

            {/* Experience and qualification are the two things a patient is
                actually choosing between doctors on, so they sit under the name
                rather than being buried in a details list further down. */}
            {doctor.years_of_experience || credentials ? (
              <p className="site-meta mt-3">
                {[
                  doctor.years_of_experience
                    ? `${doctor.years_of_experience} years of experience`
                    : null,
                  credentials,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}

            {/* Booking is the point of the page, so it is the one full-width
                action on a phone and the first thing in the row on a desktop.
                `SiteCta` rather than the app's `Button`, so it wears the
                clinic's brand colour instead of the app's teal. */}
            <div className="site-cta-row mt-7">
              <SiteCta widgetSlug={clinic.slug} theme={theme} className="site-cta">
                Book an appointment
              </SiteCta>
              {clinic.phone ? (
                <a
                  href={`tel:${clinic.phone}`}
                  className="site-cta inline-flex min-h-11 items-center justify-center rounded-[var(--site-radius)] border border-black/15 px-6 py-3 text-sm font-medium text-[var(--site-ink)] transition-colors hover:bg-black/[0.03]"
                >
                  Call the clinic
                </a>
              ) : null}
            </div>
          </div>
        </header>

        {doctor.professional_description ? (
          <section className="mt-14 sm:mt-16">
            <h2 className="site-h2 text-[var(--site-ink)]">About {doctor.name.split(" ")[0]}</h2>
            <p className="site-body mt-5 whitespace-pre-line">
              {doctor.professional_description}
            </p>
          </section>
        ) : null}

        {facts.length > 0 ? (
          <section className="mt-14 sm:mt-16">
            <h2 className="site-h2 text-[var(--site-ink)]">Details</h2>
            {/* Hairline-separated rows rather than a two-column grid of boxed
                facts. A grid of six identical cells is the generic pattern here,
                and it puts a border around data that a rule between rows orders
                better. */}
            <dl className="site-facts mt-6 max-w-2xl">
              {facts.map((row) => (
                <div key={row.label} className="site-rule-bottom py-4">
                  <dt className="site-meta">{row.label}</dt>
                  <dd className="mt-1.5 text-[0.9375rem] text-[var(--site-ink)]">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </article>
    </div>
  );
}