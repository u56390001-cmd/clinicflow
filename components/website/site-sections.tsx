import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { buttonClass, themeCssVars, SITE_FONT_STACKS } from "@/types/website";
import type {
  WebsiteConfig,
  WebsiteSectionConfig,
  WebsiteTheme,
} from "@/types/website";

/**
 * Section bodies shared by every template and by the builder preview.
 *
 * Each export renders the *inside* of a section only. The template owns the
 * `<section>` wrapper, its background and its horizontal padding, which is what
 * lets "modern" and "minimal" present the same doctor roster very differently
 * without either of them owning a copy of the roster markup.
 *
 * Every section reads its copy from the config and its records from the props,
 * so the builder preview and the published page run the same code — there is no
 * "preview-only" branch to drift.
 */

export type SiteImage = {
  id: string;
  kind: string;
  url: string;
  alt: string;
  position: number;
};

export type SiteService = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  status: string;
};

export type SiteDoctor = {
  id: string;
  name: string;
  specialty: string | null;
  photo_url: string | null;
  years_of_experience: number | null;
  qualification: string | null;
  professional_description: string | null;
  credentials?: string[] | null;
};

export type SiteAvailabilityRule = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  enabled: boolean;
};

export type SiteContext = {
  clinic: {
    name: string;
    doctor_name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    logoUrl?: string | null;
  };
  services: SiteService[];
  doctors: SiteDoctor[];
  availabilityRules: SiteAvailabilityRule[];
  images: SiteImage[];
  widgetSlug: string;
  /**
   * Public slug of the website itself, used for internal links like doctor
   * bios. Optional because the builder preview renders before a site exists;
   * there we fall back to the clinic slug.
   */
  siteSlug?: string | null;
};

/**
 * Open the floating assistant in place, on this page.
 *
 * `href="/widget/<slug>"` stays on the anchor deliberately: it is the no-JS
 * fallback, and the honest link for anything that crawls or middle-clicks. But
 * the widget script is deferred, so a visitor can click a booking CTA before it
 * has run — and this handler used to return silently in that window, which let
 * the browser follow the href and dump them on a separate near-empty page in the
 * middle of the booking funnel. The floating panel exists precisely to avoid
 * that, so the default navigation is now always suppressed and the widget is
 * given a short window to turn up. Only if it genuinely never loads do we send
 * them to the standalone page, which at least shows the same chat.
 */
export function openWidgetFallback(event: React.MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();

  const href = event.currentTarget.getAttribute("href") ?? "";
  const openWidget = () =>
    (window as { MedBookWidget?: { open?: () => void } }).MedBookWidget?.open;

  // The site states up front, in an inline script, whether the assistant is
  // switched on for this page. Without that signal there is no way to tell
  // "switched off" apart from "still downloading", and every booking click would
  // sit through the full retry window below before anything happened — which
  // reads to a patient as a dead button.
  if ((window as { __medbookAssistantOn?: boolean }).__medbookAssistantOn === false) {
    window.location.href = href;
    return;
  }

  const open = openWidget();
  if (open) {
    open();
    return;
  }

  // Not loaded yet. Poll briefly rather than navigating; a few hundred
  // milliseconds of patience is invisible to the visitor and saves the page.
  const deadline = Date.now() + 4000;
  const poll = () => {
    const ready = openWidget();
    if (ready) {
      ready();
      return;
    }
    if (Date.now() < deadline) {
      window.setTimeout(poll, 100);
      return;
    }
    window.location.href = href;
  };
  window.setTimeout(poll, 100);
}

/**
 * Section heading.
 *
 * `id` is optional and only used as an anchor target — sections are reordered
 * freely, so a stable id is only worth exposing where a link to it exists.
 * Centring follows `theme.alignment` because that control says "centred" and
 * every heading has to honour it, not just the hero.
 */
export function SectionHeading({
  title,
  description,
  theme,
  id,
}: {
  title: string;
  description?: string;
  theme: WebsiteTheme;
  id?: string;
}) {
  if (!title && !description) return null;
  const centered = theme.alignment === "center";
  return (
    <div
      className={cn("mb-8", centered && "mx-auto max-w-3xl text-center")}
      id={id}
    >
      {title ? (
        <h2
          className="text-3xl font-bold tracking-tight text-[var(--site-ink)]"
          style={{ fontFamily: "var(--site-heading-font)" }}
        >
          {title}
        </h2>
      ) : null}
      {description ? (
        <p
          className={cn(
            "mt-3 text-base leading-relaxed opacity-80",
            centered ? "mx-auto" : "max-w-2xl",
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

export function HeroBody({
  config,
  context,
  theme,
}: {
  config: WebsiteConfig;
  context: SiteContext;
  theme: WebsiteTheme;
}) {
  const { hero } = config.content;
  const heroImage = context.images.find((img) => img.kind === "hero");
  const centered = theme.alignment === "center";

  return (
    <div
      className={cn(
        "relative z-10",
        centered ? "mx-auto max-w-4xl text-center text-white" : "text-white",
      )}
    >
      <h1
        className={cn(
          "text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl",
          centered && "sm:text-5xl lg:text-7xl",
        )}
        style={{ fontFamily: "var(--site-heading-font)" }}
      >
        {hero.headline ||
          `${context.clinic.doctor_name ?? context.clinic.name} — care you can book today`}
      </h1>
      {hero.description ? (
        <p
          className={cn(
            "mt-6 max-w-2xl text-lg leading-relaxed opacity-90",
            centered && "mx-auto",
          )}
        >
          {hero.description}
        </p>
      ) : null}
      {hero.ctaText || (hero.ctaSecondaryLabel && context.clinic.phone) ? (
        <div className={cn("mt-8 flex flex-wrap items-center justify-center gap-3")}>
          {hero.ctaText ? (
            <a
              href={hero.ctaUrl || `/widget/${context.widgetSlug}`}
              onClick={openWidgetFallback}
              className={buttonClass({ ...theme, buttonStyle: "inverse" })}
            >
              {hero.ctaText}
            </a>
          ) : null}
          {hero.ctaSecondaryLabel && context.clinic.phone ? (
            <a
              href={`tel:${context.clinic.phone}`}
              className="inline-flex items-center justify-center rounded-pill border border-white/60 px-7 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              {hero.ctaSecondaryLabel}
            </a>
          ) : null}
        </div>
      ) : null}
      {heroImage ? (
        <p className="sr-only">{heroImage.alt}</p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Doctors
// ---------------------------------------------------------------------------

export function DoctorsBody({
  config,
  context,
  theme,
}: {
  config: WebsiteConfig;
  context: SiteContext;
  theme: WebsiteTheme;
}) {
  const { doctors } = config.content;
  const visible = context.doctors.slice(0, Math.max(1, doctors.limit));

  if (visible.length === 0) {
    return (
      <div>
        <SectionHeading title={doctors.title} theme={theme} />
        <p className="text-sm opacity-70">
          Doctors are added from the Doctors page in ClinicFlow and appear here
          automatically.
        </p>
      </div>
    );
  }

  return (
    <div>
      <SectionHeading
        title={doctors.title}
        description={doctors.description}
        theme={theme}
      />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((doctor) => (
          <article
            key={doctor.id}
            className="overflow-hidden rounded-[var(--site-radius)] border border-black/5 bg-white shadow-sm"
          >
            <div className="relative h-52 w-full bg-black/5">
              {doctor.photo_url ? (
                <Image
                  src={doctor.photo_url}
                  alt={doctor.name}
                  fill
                  sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-4xl font-semibold text-[var(--site-primary)]">
                  {doctor.name.trim().charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="p-5">
              <h3 className="text-lg font-semibold text-[var(--site-ink)]">
                <Link
                  href={`/site/${context.siteSlug ?? context.widgetSlug}/doctor/${doctor.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {doctor.name}
                </Link>
              </h3>
              {doctor.specialty ? (
                <p
                  className="mt-1 text-sm font-medium"
                  style={{ color: theme.primaryColor }}
                >
                  {doctor.specialty}
                </p>
              ) : null}
              {doctor.professional_description ? (
                <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-black/60">
                  {doctor.professional_description}
                </p>
              ) : null}
              <dl className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-black/50">
                {doctor.years_of_experience ? (
                  <div className="flex gap-1">
                    <dt className="sr-only">Experience</dt>
                    <dd>{doctor.years_of_experience} yrs experience</dd>
                  </div>
                ) : null}
                {doctor.qualification ? (
                  <div className="flex gap-1">
                    <dt className="sr-only">Qualification</dt>
                    <dd>{doctor.qualification}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </article>
        ))}
      </div>
      {doctors.ctaText ? (
        <a
          href={`/widget/${context.widgetSlug}`}
          onClick={openWidgetFallback}
          className={`${buttonClass(theme)} mt-8`}
        >
          {doctors.ctaText}
        </a>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------

export function AboutBody({
  config,
  context,
  theme,
}: {
  config: WebsiteConfig;
  context: SiteContext;
  theme: WebsiteTheme;
}) {
  const { about } = config.content;
  const doctorImage = context.images.find((img) => img.kind === "doctor");
  const facilities = about.facilities ?? [];

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div>
        <SectionHeading title={about.title} theme={theme} />
        {doctorImage ? (
          <div className="relative mt-2 h-72 w-full overflow-hidden rounded-[var(--site-radius)] lg:h-80">
            <Image
              src={doctorImage.url}
              alt={doctorImage.alt || `${context.clinic.name} team`}
              fill
              sizes="(min-width: 1024px) 40vw, 90vw"
              className="object-cover"
            />
          </div>
        ) : null}
      </div>
      <div className="min-w-0">
        {about.bio ? (
          <p className="whitespace-pre-line text-base leading-relaxed text-black/70">
            {about.bio}
          </p>
        ) : null}

        {(about.certifications?.length ?? 0) > 0 ? (
          <ul className="mt-6 flex flex-wrap gap-2">
            {about.certifications!.map((cert) => (
              <li
                key={cert}
                className="rounded-pill px-3 py-1 text-xs font-medium"
                style={{
                  color: theme.primaryColor,
                  backgroundColor: `${theme.primaryColor}14`,
                  border: `1px solid ${theme.primaryColor}55`,
                }}
              >
                {cert}
              </li>
            ))}
          </ul>
        ) : null}

        {facilities.length > 0 ? (
          <div className="mt-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-black/50">
              Facilities
            </h3>
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2">
              {facilities.map((facility) => (
                <li
                  key={facility}
                  className="flex items-start gap-2 text-sm text-black/70"
                >
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-1.5 shrink-0 rounded-pill"
                    style={{ backgroundColor: theme.primaryColor }}
                  />
                  {facility}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {about.credentials ? (
          <div className="mt-8 rounded-[var(--site-radius)] bg-black/[0.03] p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-black/50">
              Credentials
            </h3>
            <p className="mt-2 whitespace-pre-line text-black/75">
              {about.credentials}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export function ServicesBody({ context }: { context: SiteContext }) {
  const active = context.services.filter((service) => service.status === "active");

  if (active.length === 0) {
    return (
      <p className="text-sm opacity-70">
        Services added in ClinicFlow appear here automatically.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {active.map((service) => (
        <article
          key={service.id}
          className="rounded-[var(--site-radius)] border border-black/5 bg-white p-5 shadow-sm"
        >
          <h3 className="font-semibold text-[var(--site-ink)]">{service.name}</h3>
          {service.description ? (
            <p className="mt-1 text-sm leading-relaxed text-black/60">
              {service.description}
            </p>
          ) : null}
          <div className="mt-3 flex items-center gap-3 text-sm text-black/55">
            <span>{service.duration_minutes} min</span>
            <span aria-hidden="true" className="text-black/20">
              |
            </span>
            <span>Rs {service.price.toFixed(0)}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export function BookingBody({
  config,
  context,
  theme,
}: {
  config: WebsiteConfig;
  context: SiteContext;
  theme: WebsiteTheme;
}) {
  const { booking } = config.content;
  const openToday = nextOpenWindow(context.availabilityRules);

  return (
    <div className="rounded-[var(--site-radius)] border border-black/5 bg-white p-8 shadow-sm">
      <SectionHeading
        title={booking.title}
        description={booking.description}
        theme={theme}
      />
      <div className="flex flex-wrap items-center gap-4">
        <a
          href={`/widget/${context.widgetSlug}`}
          onClick={openWidgetFallback}
          className={buttonClass(theme)}
        >
          {booking.ctaText}
        </a>
        {booking.showNextSlot && openToday ? (
          <p className="text-sm text-black/60">{openToday}</p>
        ) : null}
      </div>
      {context.clinic.phone ? (
        <p className="mt-6 text-sm text-black/55">
          Prefer to call?{" "}
          <a
            href={`tel:${context.clinic.phone}`}
            className="font-medium underline underline-offset-4"
            style={{ color: theme.primaryColor }}
          >
            {context.clinic.phone}
          </a>
        </p>
      ) : null}
    </div>
  );
}

/**
 * The next opening window, phrased the way a receptionist would.
 *
 * Today if it is still ahead of closing, otherwise the next enabled day. Kept
 * short on purpose: the assistant does the real slot work, so this line's only
 * job is to answer "are you even open today?" before the click.
 */
function nextOpenWindow(rules: SiteAvailabilityRule[]): string | null {
  const now = new Date();
  const today = (now.getDay() + 6) % 7;

  const todayRule = rules.find((rule) => rule.day_of_week === today);
  if (todayRule?.enabled) {
    const closes = todayRule.end_time.slice(0, 5);
    return `Open today until ${closes}`;
  }

  for (let offset = 1; offset <= 7; offset += 1) {
    const day = (today + offset) % 7;
    const rule = rules.find((entry) => entry.day_of_week === day);
    if (rule?.enabled) {
      const label =
        offset === 1 ? "tomorrow" : DAY_SHORT[(today + offset) % 7];
      return `Open ${label} from ${rule.start_time.slice(0, 5)}`;
    }
  }
  return null;
}

const DAY_SHORT = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

export function GalleryBody({ context }: { context: SiteContext }) {
  const gallery = context.images
    .filter((img) => img.kind === "gallery")
    .sort((a, b) => a.position - b.position);

  if (gallery.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      {gallery.map((img) => (
        <div
          key={img.id}
          className="group relative aspect-square overflow-hidden rounded-[var(--site-radius)]"
        >
          <Image
            src={img.url}
            alt={img.alt}
            fill
            sizes="(min-width: 768px) 30vw, 45vw"
            className="object-cover transition group-hover:scale-105"
          />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------

export function ExperienceBody({
  config,
  theme,
}: {
  config: WebsiteConfig;
  theme: WebsiteTheme;
}) {
  const { experience } = config.content;
  const stats = experience.stats.filter((stat) => stat.value && stat.label);
  if (stats.length === 0) return null;

  return (
    <div>
      <SectionHeading title={experience.title} theme={theme} />
      <dl className="grid gap-8 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="sr-only">{stat.label}</dt>
            <dd>
              <span
                className="block text-4xl font-bold tracking-tight"
                style={{ color: theme.primaryColor }}
              >
                {stat.value}
              </span>
              <span className="mt-2 block text-sm text-black/60">
                {stat.label}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

export function FaqBody({
  config,
  theme,
}: {
  config: WebsiteConfig;
  theme: WebsiteTheme;
}) {
  const { faq } = config.content;
  const items = faq.items.filter((item) => item.question && item.answer);
  if (items.length === 0) return null;

  return (
    <div>
      <SectionHeading title={faq.title} theme={theme} />
      <div className="divide-y divide-black/10 border-y border-black/10">
        {items.map((item) => (
          <details key={item.id} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-medium text-[var(--site-ink)]">
              {item.question}
              <span
                aria-hidden="true"
                className="shrink-0 text-black/40 transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-black/65">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

export function ContactBody({
  config,
  context,
  theme,
}: {
  config: WebsiteConfig;
  context: SiteContext;
  theme: WebsiteTheme;
}) {
  const { contact } = config.content;

  const rows = [
    contact.showPhone && context.clinic.phone
      ? { label: "Phone", value: context.clinic.phone, href: `tel:${context.clinic.phone}` }
      : null,
    contact.showEmail && context.clinic.email
      ? {
          label: "Email",
          value: context.clinic.email,
          href: `mailto:${context.clinic.email}`,
        }
      : null,
    contact.showAddress && context.clinic.address
      ? { label: "Address", value: context.clinic.address, href: null }
      : null,
  ].filter((row): row is { label: string; value: string; href: string | null } =>
    row !== null,
  );

  return (
    <div>
      <SectionHeading title={contact.title} theme={theme} />
      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          {rows.length > 0 ? (
            <dl className="space-y-5">
              {rows.map((row) => (
                <div key={row.label}>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-black/50">
                    {row.label}
                  </dt>
                  <dd className="mt-1 text-base text-black/80">
                    {row.href ? (
                      <a
                        href={row.href}
                        className="underline underline-offset-4"
                        style={{ color: theme.primaryColor }}
                      >
                        {row.value}
                      </a>
                    ) : (
                      row.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-black/60">
              Add a phone number or address in ClinicFlow settings and it will
              appear here.
            </p>
          )}

          {contact.showHours ? (
            <div className="mt-8">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-black/50">
                Opening hours
              </h3>
              <dl className="mt-3 space-y-1.5">
                {context.availabilityRules.map((rule) => (
                  <div
                    key={rule.day_of_week}
                    className="flex justify-between gap-4 text-sm"
                  >
                    <dt className="text-black/60">
                      {DAY_SHORT[rule.day_of_week]}
                    </dt>
                    <dd className="text-black/80">
                      {rule.enabled
                        ? `${rule.start_time.slice(0, 5)} – ${rule.end_time.slice(0, 5)}`
                        : "Closed"}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {contact.bookingCtaText ? (
            <a
              href={`/widget/${context.widgetSlug}`}
              onClick={openWidgetFallback}
              className={`${buttonClass(theme)} mt-8`}
            >
              {contact.bookingCtaText}
            </a>
          ) : null}
        </div>

        {contact.mapEmbedUrl?.startsWith("https://") ? (
          <div className="min-h-[280px] overflow-hidden rounded-[var(--site-radius)]">
            <iframe
              src={contact.mapEmbedUrl}
              title={`${context.clinic.name} location map`}
              width="100%"
              height="100%"
              style={{ border: 0, minHeight: "280px" }}
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root style
// ---------------------------------------------------------------------------

/** Inline style carrying the clinic's branding onto the site root. */
export function siteRootStyle(theme: WebsiteTheme): React.CSSProperties {
  const stack = SITE_FONT_STACKS.find((stack) => stack.stack === theme.fontFamily)
    ?.stack ?? SITE_FONT_STACKS[0].stack;
  return {
    ...themeCssVars(theme),
    fontFamily: stack,
    color: "var(--site-ink)",
  } as React.CSSProperties;
}

/** Background for one section, chosen by the template variant. */
export function sectionSurface(
  variant: "plain" | "tinted" | "primary" | "ink",
  theme: WebsiteTheme,
): React.CSSProperties {
  switch (variant) {
    case "tinted":
      return { backgroundColor: `${theme.primaryColor}0A` };
    case "primary":
      return { backgroundColor: theme.primaryColor, color: "#ffffff" };
    case "ink":
      return { backgroundColor: "#0F172A", color: "#ffffff" };
    default:
      return { backgroundColor: "#ffffff" };
  }
}

/** Visible sections in page order. */
export function visibleSections(
  sections: WebsiteSectionConfig[],
): WebsiteSectionConfig[] {
  return sections
    .filter((section) => section.visible)
    .sort((a, b) => a.order - b.order);
}
