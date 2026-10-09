import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Briefcase, CalendarClock, Clock, Hospital } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  formatDuration,
  formatFee,
  hasOpeningHours,
  nextOpening,
  serviceIconFor,
  upcomingWindows,
  whatsappHref,
  SiteCta,
  type SiteContext,
  type SiteDoctor,
} from "@/components/website/site-ui";
import { SITE_FONT_STACKS, themeCssVars } from "@/types/website";
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
 *
 * Visual rules the whole file follows, so a new section cannot reintroduce the
 * look the redesign removed:
 *
 * -   **One accent colour.** The brand colour marks the primary action and the
 *     active state, nothing else. Specialty names, section figures, list
 *     bullets and contact links all used to compete for it, which left no
 *     element reading as primary and flattened the hierarchy on every section.
 * -   **Ink scale for everything else.** `--site-body`, `--site-muted` and
 *     `--site-faint` are steps of the clinic's own ink, so text stays readable
 *     whatever colour they pick and never fights the accent.
 * -   **Hairlines, not boxes.** A list is separated by a 1px rule, not by a
 *     white card around every row. The previous version was identical white
 *     cards with one radius and one soft shadow, which is what read as a
 *     generated template rather than a clinic.
 * -   **Semibold, never bold.** Display type stops at weight 600.
 */

// The shell imports these from here; they now live with the shared primitives.
export type {
  SiteAvailabilityRule,
  SiteContext,
  SiteDoctor,
  SiteImage,
  SiteService,
} from "@/components/website/site-ui";
export { openWidgetFallback } from "@/components/website/site-ui";

// ---------------------------------------------------------------------------
// Section heading
// ---------------------------------------------------------------------------

/**
 * Section heading.
 *
 * `id` is optional and only used as an anchor target — sections are reordered
 * freely, so a stable id is only worth exposing where a link to it exists.
 * Centring follows `theme.alignment` because that control says "centred" and
 * every heading has to honour it, not just the hero.
 *
 * No eyebrow label above the title. A tracked-out uppercase kicker above every
 * heading is the mark of a generated page, and it also gives the reader a
 * second thing to parse before they reach the heading at all.
 */
export function SectionHeading({
  title,
  description,
  theme,
  id,
  className = "",
}: {
  title: string;
  description?: string;
  theme: WebsiteTheme;
  id?: string;
  className?: string;
}) {
  if (!title && !description) return null;
  const centered = theme.alignment === "center";

  return (
    <div
      className={cn(
        "mb-9 sm:mb-12",
        centered && "mx-auto max-w-3xl text-center",
        className,
      )}
      id={id}
    >
      {title ? (
        <h2
          className="site-h2 text-[var(--site-ink)]"
          style={{ fontFamily: "var(--site-heading-font)" }}
        >
          {title}
        </h2>
      ) : null}
      {description ? (
        <p className={cn("site-lede mt-4", centered && "mx-auto")}>
          {description}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

/**
 * The hero's copy stack.
 *
 * The right-hand column — the clinic's hero photograph with the two floating
 * detail cards — lives in `template-layout.tsx`, which owns the hero
 * `<section>`. All that is here is the headline and the two calls to action,
 * because the column next to it is doing the persuading.
 */
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
  const centered = theme.alignment === "center";

  const headline =
    hero.headline ||
    `${context.clinic.doctor_name ?? context.clinic.name} — care you can book today`;

  // A specialty line is the second thing a visitor reads. It comes from the
  // doctors ClinicFlow already holds rather than from a new config field, which
  // would be a value the clinic has to type twice.
  const specialty = specialtyLine(context.doctors);

  /* `flex flex-col justify-center` because the hero grid now stretches both
     columns to the section's full height (so the figure can reach the bottom
     edge) — this column re-centres its own copy inside that taller box. */
  return (
    <div
      className={cn(
        "flex flex-col justify-center",
        centered && "mx-auto max-w-3xl text-center",
      )}
    >
      {specialty ? (
        <p
          className={cn(
            "mb-4 flex items-center gap-2 text-sm font-medium",
            theme.primaryColor,
            centered && "justify-center",
          )}
        >
          <span
            aria-hidden="true"
            className="size-1.5 rounded-pill"
            style={{ backgroundColor: theme.primaryColor }}
          />
          {specialty}
        </p>
      ) : null}

      <h1
        className="site-display text-[var(--site-ink)]"
        style={{ fontFamily: "var(--site-heading-font)" }}
      >
        {headline}
      </h1>

      {hero.description ? (
        <p className={cn("site-lede mt-5", centered && "mx-auto")}>
          {hero.description}
        </p>
      ) : null}

      {hero.ctaText || (hero.ctaSecondaryLabel && context.clinic.phone) ? (
        <div
          className={cn(
            "site-cta-row mt-8",
            centered && "site-cta-row-centered",
          )}
        >
          {hero.ctaText ? (
            <SiteCta
              widgetSlug={context.widgetSlug}
              theme={theme}
              className="site-cta"
            >
              {hero.ctaText}
            </SiteCta>
          ) : null}
          {hero.ctaSecondaryLabel && context.clinic.phone ? (
            <a
              href={`tel:${context.clinic.phone}`}
              className={cn(
                "site-cta inline-flex min-h-11 items-center justify-center rounded-[var(--site-radius)] border border-black/15 px-6 py-3 text-sm font-medium text-[var(--site-ink)] transition-colors hover:bg-black/[0.03]",
              )}
            >
              {hero.ctaSecondaryLabel}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Up to two specialties, as a comma list. Falls back to the clinic type. */
function specialtyLine(doctors: SiteDoctor[]): string {
  const specialties = Array.from(
    new Set(
      doctors
        .map((doctor) => doctor.specialty?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (specialties.length === 0) return "";
  if (specialties.length === 1) return specialties[0];
  return `${specialties[0]} · ${specialties[1]}`;
}

// ---------------------------------------------------------------------------
// Doctors
// ---------------------------------------------------------------------------

/** The dotted rule between a doctor card's blocks. */
function CardRule() {
  return (
    <div className="px-5">
      <div className="border-t border-dashed border-[var(--site-hairline)]" />
    </div>
  );
}

/**
 * The team, as profile cards.
 *
 * One card per doctor: the portrait floats over the top edge, identity sits
 * under it, the clinic's own fee row lives in a tinted panel, and the day's
 * published openings run as chips above the two actions. Dotted rules divide
 * the blocks — at 320px a card that separates with hairlines still reads as one
 * object, where a boxed sub-panel per fact reads as four.
 *
 * Every figure on the card is a record ClinicFlow already holds: fee,
 * follow-up window, hours, qualification. The one thing deliberately absent is
 * a star rating, because none is stored — "0.0 (5 reviews)" would be invented
 * data on a page about medical care.
 *
 * Colours come from the site's tokens rather than fixed greys, so a clinic that
 * chose another ink and accent gets a card in *its* palette, not this file's.
 */
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
        <p className="site-body">
          Doctors are added from the Doctors page in ClinicFlow and appear here
          automatically.
        </p>
      </div>
    );
  }

  const opening = nextOpening(context.availabilityRules);
  const windows = upcomingWindows(context.availabilityRules, 4);
  const prefix = context.idPrefix ? `${context.idPrefix}-` : "";
  const bioHref = (id: string) =>
    `/site/${context.siteSlug ?? context.widgetSlug}/doctor/${id}`;

  return (
    <div>
      <SectionHeading
        title={doctors.title}
        description={doctors.description}
        theme={theme}
      />

      <div className="site-doctors">
        {visible.map((doctor) => {
          const subtitle = [
            doctor.specialty,
            doctor.qualification ?? doctor.credentials?.[0] ?? null,
          ]
            .filter(Boolean)
            .join(" • ");
          const credentialed = Boolean(
            doctor.qualification || doctor.credentials?.length,
          );
          const visitFee =
            doctor.consultation_fee != null
              ? formatFee(doctor.consultation_fee)
              : null;
          const followUp =
            doctor.follow_up_fee != null && doctor.follow_up_fee > 0
              ? doctor.follow_up_valid_for && doctor.follow_up_period
                ? `Follow-up (${doctor.follow_up_valid_for} ${doctor.follow_up_period})`
                : "Follow-up"
              : null;
          const isOpen = Boolean(opening?.isOpenNow);

          return (
            <article
              key={doctor.id}
              /* MedBook card tokens: a 12px radius with the inner content
                 clipped to it, plus the rest shadow and hairline border. The
                 radius is fixed rather than `var(--site-radius)` deliberately —
                 `cornerStyle: "round"` sets that token to 9999px, which turns a
                 card full of text into a capsule. Controls inside use 8px. */
              className="relative flex flex-col overflow-hidden rounded-[12px] border border-[var(--site-hairline)] bg-white pt-24 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_18px_40px_-18px_rgba(15,23,42,0.18)] motion-reduce:transition-none"
            >
              {/* Portrait sits *inside* the card's bounds. It used to hang over
                  the top edge, which `overflow-hidden` would shave into a flat
                  arc — the clipping artifact this card must not have. The live
                  open/closed dot rides on it: the clinic's hours decide it, so
                  it is as true here as it is in the hero. */}
              <div className="absolute left-1/2 top-4 w-20 -translate-x-1/2">
                <div className="relative h-20 w-20">
                  {doctor.photo_url ? (
                    <Image
                      src={doctor.photo_url}
                      alt={doctor.name}
                      fill
                      sizes="80px"
                      className="rounded-full border-4 border-white object-cover shadow-md"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex size-20 items-center justify-center rounded-full border-4 border-white text-2xl font-semibold text-white shadow-md"
                      style={{ backgroundColor: theme.primaryColor }}
                    >
                      {doctor.name.trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute bottom-0 right-0 size-4 rounded-full border-2 border-white",
                      isOpen ? "bg-emerald-500" : "bg-slate-300",
                    )}
                  />
                </div>
              </div>

              <div className="px-5 pb-3 pt-2 text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <h3 className="site-h3 text-[var(--site-ink)]">
                    <Link
                      href={bioHref(doctor.id)}
                      className="underline-offset-4 hover:underline"
                    >
                      {doctor.name}
                    </Link>
                  </h3>
                  {credentialed ? (
                    <BadgeCheck
                      aria-label="Verified qualification"
                      className="size-4 shrink-0"
                      style={{ color: theme.primaryColor }}
                    />
                  ) : null}
                </div>

                {subtitle ? (
                  <p className="mt-0.5 text-[13px] font-medium text-[var(--site-muted)]">
                    {subtitle}
                  </p>
                ) : null}
              </div>

              {/* The two facts a patient weighs first. Both are real records —
                  experience from the doctor row, hours from availability — and
                  the row is omitted entirely rather than padded with a count
                  the schema does not hold. */}
              {doctor.years_of_experience || opening ? (
                <>
                  <CardRule />
                  <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 px-5 py-2.5 text-xs text-[var(--site-muted)]">
                    {doctor.years_of_experience ? (
                      <span className="flex items-center gap-1 font-semibold">
                        <Briefcase className="size-3.5" aria-hidden="true" />
                        <span className="text-[var(--site-ink)]">
                          {doctor.years_of_experience} yrs exp.
                        </span>
                      </span>
                    ) : null}
                    {opening ? (
                      <span className="flex items-center gap-1 font-semibold">
                        <CalendarClock className="size-3.5" aria-hidden="true" />
                        <span className="text-[var(--site-ink)]">
                          {opening.dayLabel} · {opening.window}
                        </span>
                      </span>
                    ) : null}
                  </div>
                </>
              ) : null}

              {/* Clinic and pricing. The fee row only appears once a fee has
                  been entered — `Rs 0` on a clinic page reads as a bug rather
                  than as "free". */}
              <div className="px-5 py-3">
                <div className="rounded-[8px] border border-[var(--site-hairline)] bg-[var(--site-tint)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Hospital
                        className="size-4 shrink-0 text-[var(--site-muted)]"
                        aria-hidden="true"
                      />
                      <span className="truncate text-[13px] font-semibold text-[var(--site-ink)]">
                        {context.clinic.name}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        isOpen
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-[var(--site-tint-strong)] text-[var(--site-muted)]",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-1.5 rounded-full",
                          isOpen
                            ? "animate-pulse bg-emerald-500"
                            : "bg-[var(--site-faint)]",
                        )}
                      />
                      {isOpen ? "Active" : "Closed"}
                    </span>
                  </div>

                  {context.clinic.address ? (
                    <p className="site-meta mt-1 truncate pl-6">
                      {context.clinic.address}
                    </p>
                  ) : null}

                  {visitFee || followUp ? (
                    <>
                      <hr className="my-2.5 border-[var(--site-hairline)]" />
                      <div className="flex items-end justify-between gap-3">
                        {visitFee ? (
                          <div>
                            <p className="text-[15px] font-bold text-[var(--site-ink)]">
                              {visitFee}
                            </p>
                            <p className="text-[11px] text-[var(--site-muted)]">
                              Per visit
                            </p>
                          </div>
                        ) : null}
                        {followUp ? (
                          <div className="ms-auto text-right">
                            <p className="text-[13px] font-semibold text-[var(--site-primary)]">
                              {formatFee(doctor.follow_up_fee ?? 0)}
                            </p>
                            <p className="text-[11px] text-[var(--site-primary)]">
                              {followUp}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              {/* Opening times as selectable chips. They are *openings*, not
                  invented 09:00/09:30 slot picks — the schema has no free/busy
                  data, and a card that offered a seat it cannot verify costs a
                  patient the trip. */}
              {windows.length > 0 ? (
                <>
                  <CardRule />
                  <div className="px-5 pb-1 pt-3">
                    <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--site-ink)]">
                      <CalendarClock
                        className="size-4 text-[var(--site-primary)]"
                        aria-hidden="true"
                      />
                      Next available
                    </p>
                    <div className="site-chip-row flex gap-2 overflow-x-auto pb-2">
                      {windows.map((window, index) => {
                        const id = `${prefix}${doctor.id}-slot-${index}`;
                        return (
                          <span key={id} className="flex shrink-0 items-center">
                            <input
                              type="radio"
                              name={`${prefix}doctor-slot-${doctor.id}`}
                              id={id}
                              defaultChecked={index === 0}
                              className="peer sr-only"
                            />
                            <label
                              htmlFor={id}
                              className="block cursor-pointer rounded-[8px] border border-[var(--site-hairline)] bg-white px-3.5 py-1.5 text-xs font-medium text-[var(--site-muted)] transition hover:border-[var(--site-primary)] hover:text-[var(--site-primary)] peer-checked:border-[var(--site-primary)] peer-checked:bg-[var(--site-tint-strong)] peer-checked:font-bold peer-checked:text-[var(--site-primary)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--site-primary)] motion-reduce:transition-none"
                            >
                              {window.dayLabel} · {window.time}
                            </label>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : null}

              {/* Actions sit where the reader's eye lands. Two on every card:
                  the profile link keeps its original destination, and the
                  booking button carries the hero's WhatsApp route. They read as
                  the hero's pair - same min-height, text size and weight - but
                  sit a little tighter (px-4 instead of px-6) and size to their
                  content rather than stretching across the card. The gap is the
                  margin between them; pb-6/pt-4 give the row breathing room
                  inside the card. */}
              <div className="mt-auto flex flex-wrap items-center gap-3 px-5 pb-6 pt-4">
                <Link
                  href={bioHref(doctor.id)}
                  className="inline-flex min-h-11 items-center justify-center rounded-[8px] border border-[var(--site-hairline)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--site-ink)] transition hover:bg-black/[0.03] hover:text-[var(--site-ink)] motion-reduce:transition-none"
                >
                  View profile
                </Link>
                <SiteCta
                  widgetSlug={context.widgetSlug}
                  theme={theme}
                  /* `!` so the card's 8px token wins over buttonClass's theme
                     radius - `cornerStyle: "round"` would otherwise hand this
                     button rounded-2xl next to an 8px sibling. `!px-4 !py-2.5`
                     for the same reason: buttonClass ships px-6/py-3 for the
                     hero's single full-width CTA, which is too roomy here. */
                  className="!rounded-[8px] !px-4 !py-2.5"
                >
                  Book on WhatsApp
                </SiteCta>
              </div>
            </article>
          );
        })}
      </div>
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
  const certifications = (about.certifications ?? []).filter(Boolean);

  return (
    <div className="site-about-grid">
      <div className="site-sticky-column">
        <SectionHeading title={about.title} theme={theme} />
        {doctorImage ? (
          <div className="relative mt-2 aspect-[4/3] w-full overflow-hidden rounded-[var(--site-radius)]">
            <Image
              src={doctorImage.url}
              alt={doctorImage.alt || `${context.clinic.name} team`}
              fill
              sizes="(min-width: 1024px) 42vw, 92vw"
              className="object-cover"
            />
          </div>
        ) : null}
      </div>

      <div className="min-w-0">
        {about.bio ? (
          <p className="whitespace-pre-line text-[0.9375rem] leading-[1.7] text-[var(--site-body)]">
            {about.bio}
          </p>
        ) : null}

        {certifications.length > 0 ? (
          <ul className="mt-7 flex flex-wrap gap-2">
            {certifications.map((cert) => (
              <li
                key={cert}
                className="rounded-pill px-3 py-1 text-xs font-medium"
                style={{
                  color: theme.primaryColor,
                  backgroundColor: `${theme.primaryColor}14`,
                  border: `1px solid ${theme.primaryColor}40`,
                }}
              >
                {cert}
              </li>
            ))}
          </ul>
        ) : null}

        {about.credentials ? (
          <div className="site-rule-top mt-8 pt-6">
            <h3 className="text-sm font-semibold text-[var(--site-ink)]">
              Credentials
            </h3>
            <p className="site-body mt-2 whitespace-pre-line">
              {about.credentials}
            </p>
          </div>
        ) : null}

        {facilities.length > 0 ? (
          <div className="site-rule-top mt-8 pt-6">
            <h3 className="text-sm font-semibold text-[var(--site-ink)]">
              Facilities
            </h3>
            {/* Two columns of tick-free text separated by hairlines. The old
                version gave every facility a coloured dot, which put sixteen
                competing marks on the page for no informational gain. */}
            <ul className="site-facts mt-4">
              {facilities.map((facility) => (
                <li
                  key={facility}
                  className="site-rule-bottom py-2.5 text-sm text-[var(--site-body)]"
                >
                  {facility}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

/**
 * What the clinic treats, as profile cards.
 *
 * A service card is the doctor card's anatomy with the portrait swapped for
 * the icon `serviceIconFor` picks from the name: the badge floats over the top
 * edge, identity sits under it, the fee lives in the clinic's tinted panel,
 * the day's openings run as chips, and the two actions sit where the eye
 * lands. The two grids have to read as one family — a flat services grid
 * beside profile cards looked like two different sites stitched together.
 *
 * Every figure on the card is a ClinicFlow record: the price, the duration and
 * the published hours. The badge carries the clinic's open/closed dot for the
 * same reason the doctor portraits do — it is the one live fact on a page a
 * patient is deciding to travel across town for.
 */
export function ServicesBody({
  context,
  theme,
}: {
  context: SiteContext;
  theme?: WebsiteTheme;
}) {
  const active = context.services.filter((service) => service.status === "active");

  if (active.length === 0) {
    return (
      <p className="site-body">
        Services added in ClinicFlow appear here automatically.
      </p>
    );
  }

  const accent = (theme ?? FALLBACK_THEME).primaryColor;
  const opening = nextOpening(context.availabilityRules);
  const windows = upcomingWindows(context.availabilityRules, 4);
  const prefix = context.idPrefix ? `${context.idPrefix}-` : "";
  const isOpen = Boolean(opening?.isOpenNow);

  return (
    <div className="site-services">
      {active.map((service) => {
        const Icon = serviceIconFor(service.name);
        const duration = formatDuration(service.duration_minutes);
        const fee = formatFee(service.price);

        return (
          <article
            key={service.id}
            /* MedBook card tokens, identical to the doctor profile cards: a
               fixed 12px radius with the inner content clipped to it (not
               `var(--site-radius)`, which `cornerStyle: "round"` turns into a
               capsule), plus the rest shadow and hairline border. */
            className="relative flex flex-col overflow-hidden rounded-[12px] border border-[var(--site-hairline)] bg-white pt-24 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_18px_40px_-18px_rgba(15,23,42,0.18)] motion-reduce:transition-none"
          >
            {/* The badge stands in for the portrait: the service's own icon on
                a brand-coloured ground, at the exact geometry and white ring a
                doctor headshot gets, with the live open/closed dot riding on
                it. */}
            <div className="absolute left-1/2 top-4 w-20 -translate-x-1/2">
              <div
                className="relative flex size-20 items-center justify-center rounded-full border-4 border-white shadow-md"
                style={{ backgroundColor: accent }}
              >
                <Icon
                  className="size-8 text-white"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute bottom-0 right-0 size-4 rounded-full border-2 border-white",
                    isOpen ? "bg-emerald-500" : "bg-slate-300",
                  )}
                />
              </div>
            </div>

            <div className="px-5 pb-3 pt-2 text-center">
              <h3 className="site-h3 text-[var(--site-ink)]">{service.name}</h3>
              {service.description ? (
                <p className="site-body mx-auto mt-2">{service.description}</p>
              ) : null}
            </div>

            {/* The two facts a patient weighs first — how long the visit takes
                and when the clinic is open. Both come from records; the row is
                omitted entirely rather than padded. */}
            {duration || opening ? (
              <>
                <CardRule />
                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 px-5 py-2.5 text-xs text-[var(--site-muted)]">
                  {duration ? (
                    <span className="flex items-center gap-1 font-semibold">
                      <Clock className="size-3.5" aria-hidden="true" />
                      <span className="text-[var(--site-ink)]">{duration}</span>
                    </span>
                  ) : null}
                  {opening ? (
                    <span className="flex items-center gap-1 font-semibold">
                      <CalendarClock className="size-3.5" aria-hidden="true" />
                      <span className="text-[var(--site-ink)]">
                        {opening.dayLabel} · {opening.window}
                      </span>
                    </span>
                  ) : null}
                </div>
              </>
            ) : null}

            {/* Clinic and price, in the same tinted panel the doctor cards
                use. The price block only appears once a fee has been entered —
                `Rs 0` on a clinic page reads as a bug rather than as "free",
                so a zero-fee service spells itself out instead. */}
            <div className="px-5 py-3">
              <div className="rounded-[8px] border border-[var(--site-hairline)] bg-[var(--site-tint)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <Hospital
                      className="size-4 shrink-0 text-[var(--site-muted)]"
                      aria-hidden="true"
                    />
                    <span className="truncate text-[13px] font-semibold text-[var(--site-ink)]">
                      {context.clinic.name}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      isOpen
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-[var(--site-tint-strong)] text-[var(--site-muted)]",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-1.5 rounded-full",
                        isOpen
                          ? "animate-pulse bg-emerald-500"
                          : "bg-[var(--site-faint)]",
                      )}
                    />
                    {isOpen ? "Active" : "Closed"}
                  </span>
                </div>

                {context.clinic.address ? (
                  <p className="site-meta mt-1 truncate pl-6">
                    {context.clinic.address}
                  </p>
                ) : null}

                {fee ? (
                  <>
                    <hr className="my-2.5 border-[var(--site-hairline)]" />
                    <p className="text-[15px] font-bold text-[var(--site-ink)]">
                      {fee}
                    </p>
                    {service.price > 0 ? (
                      <p className="text-[11px] text-[var(--site-muted)]">
                        Price
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>

            {/* Opening times as selectable chips. They are *openings*, not
                invented 09:00/09:30 slot picks — the schema has no free/busy
                data, and a card that offered a seat it cannot verify costs a
                patient the trip. */}
            {windows.length > 0 ? (
              <>
                <CardRule />
                <div className="px-5 pb-1 pt-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--site-ink)]">
                    <CalendarClock
                      className="size-4 text-[var(--site-primary)]"
                      aria-hidden="true"
                    />
                    Next available
                  </p>
                  <div className="site-chip-row flex gap-2 overflow-x-auto pb-2">
                    {windows.map((window, index) => {
                      const id = `${prefix}${service.id}-slot-${index}`;
                      return (
                        <span key={id} className="flex shrink-0 items-center">
                          <input
                            type="radio"
                            name={`${prefix}service-slot-${service.id}`}
                            id={id}
                            defaultChecked={index === 0}
                            className="peer sr-only"
                          />
                          <label
                            htmlFor={id}
                            className="block cursor-pointer rounded-[8px] border border-[var(--site-hairline)] bg-white px-3.5 py-1.5 text-xs font-medium text-[var(--site-muted)] transition hover:border-[var(--site-primary)] hover:text-[var(--site-primary)] peer-checked:border-[var(--site-primary)] peer-checked:bg-[var(--site-tint-strong)] peer-checked:font-bold peer-checked:text-[var(--site-primary)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--site-primary)] motion-reduce:transition-none"
                          >
                            {window.dayLabel} · {window.time}
                          </label>
                        </span>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : null}

            {/* Actions sit where the reader's eye lands, at the card's foot on
                both card types: a call as the second route when the clinic has
                published a number a link can be built from, and the booking
                assistant as the primary. Same min-height, 8px radius and
                text size as the doctor card's pair. */}
            <div className="mt-auto flex flex-wrap items-center gap-3 px-5 pb-6 pt-4">
              {context.clinic.phone ? (
                <a
                  href={`tel:${context.clinic.phone}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-[8px] border border-[var(--site-hairline)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--site-ink)] transition hover:bg-black/[0.03] motion-reduce:transition-none"
                >
                  Call clinic
                </a>
              ) : null}
              <SiteCta
                widgetSlug={context.widgetSlug}
                theme={theme ?? FALLBACK_THEME}
                /* `!` so the card's 8px token wins over buttonClass's theme
                   radius, and `!px-4 !py-2.5` because buttonClass ships the
                   hero's roomier padding — the same overrides the doctor card
                   uses for its own pair. */
                className="!rounded-[8px] !px-4 !py-2.5"
              >
                Book this
              </SiteCta>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/** Used only when a caller renders services without a theme in hand. */
const FALLBACK_THEME: WebsiteTheme = {
  primaryColor: "#0D9488",
  textColor: "#0F172A",
  fontFamily: SITE_FONT_STACKS[0].stack,
  headingFont: "same",
  buttonStyle: "solid",
  cornerStyle: "soft",
  logoUrl: "",
  showHeader: true,
  alignment: "left",
};

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

/**
 * The conversion block.
 *
 * Leads with the same opening-time fact as the hero rather than repeating the
 * marketing copy, because a visitor deciding between two clinics wants to know
 * whether either is open. The phone number stays as the second route for anyone
 * who would rather not talk to an assistant, and WhatsApp appears only when the
 * clinic has published a number a link can be built from.
 */
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
  const opening = nextOpening(context.availabilityRules);
  const whatsapp = context.clinic.phone
    ? whatsappHref(context.clinic.phone)
    : null;

  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2
        className="site-h2 text-[var(--site-ink)]"
        style={{ fontFamily: "var(--site-heading-font)" }}
      >
        {booking.title}
      </h2>
      {booking.description ? (
        <p className="site-lede mx-auto mt-4">{booking.description}</p>
      ) : null}

      {booking.showNextSlot && opening ? (
        <p className="site-meta mt-5 tabular-nums">
          {/* Rendered from the render host's clock, so the server and the
              browser can legitimately disagree about the time. Suppressing the
              warning lets the client settle it without React bailing out of the
              whole subtree. See `nextOpening`. */}
          <span suppressHydrationWarning>
            {opening.dayLabel} · {opening.window}
          </span>
        </p>
      ) : null}

      <div className="site-cta-row site-cta-row-centered mt-8">
        <SiteCta
          widgetSlug={context.widgetSlug}
          theme={theme}
          className="site-cta"
        >
          {booking.ctaText}
        </SiteCta>
        {context.clinic.phone ? (
          <a
            href={`tel:${context.clinic.phone}`}
            className="site-cta inline-flex min-h-11 items-center justify-center rounded-[var(--site-radius)] border border-black/15 px-6 py-3 text-sm font-medium text-[var(--site-ink)] transition-colors hover:bg-black/[0.03]"
          >
            Call {context.clinic.phone}
          </a>
        ) : null}
      </div>

      {whatsapp ? (
        <p className="site-meta mt-5">
          Prefer WhatsApp?{" "}
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-4"
            style={{ color: theme.primaryColor }}
          >
            Message the clinic
          </a>
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

/**
 * Inside the clinic.
 *
 * The first photograph takes a double-width, double-height tile. A grid of equal
 * squares is the stock arrangement and reads as filler; giving the leading image
 * twice the space makes the section look composed, and it costs two lines.
 * Sizes are declared in `app/globals.css` against the site container, so the
 * same asymmetry holds at 390px and at 1200px.
 */
export function GalleryBody({ context }: { context: SiteContext }) {
  const gallery = context.images
    .filter((img) => img.kind === "gallery")
    .sort((a, b) => a.position - b.position);

  if (gallery.length === 0) return null;

  return (
    <div className="site-gallery">
      {gallery.map((img, index) => (
        <div
          key={img.id}
          className={cn(
            "group relative overflow-hidden rounded-[var(--site-radius)]",
            index === 0 ? "aspect-square" : "aspect-[4/3]",
          )}
        >
          <Image
            src={img.url}
            alt={img.alt}
            fill
            sizes="(min-width: 1088px) 24vw, (min-width: 640px) 22vw, 46vw"
            /* Zoom, not a filter or a brightness lift. These are photographs of a
               real clinic, and a colour overlay on hover is the one treatment
               that makes a clinic's own premises look like a stock image. */
            className="object-cover transition-transform duration-500 ease-out motion-reduce:transition-none group-hover:scale-[1.04]"
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
      {/* Divided rather than boxed: three figures with a rule between them read
          as a claim the clinic is making, where three cards read as three
          widgets. */}
      <dl className="site-stats">
        {stats.map((stat) => (
          <div key={stat.label} className="site-rule-top pt-4">
            <dt className="sr-only">{stat.label}</dt>
            <dd>
              <span
                className="block text-[clamp(2rem,1.6rem+1.8cqi,2.75rem)] font-semibold leading-none tracking-[-0.03em] tabular-nums"
                style={{ color: theme.primaryColor }}
              >
                {stat.value}
              </span>
              <span className="site-meta mt-2 block">{stat.label}</span>
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
      <div className="mx-auto max-w-3xl">
        {items.map((item) => (
          <details key={item.id} className="group site-rule-bottom py-5">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-left">
              <span className="site-h3 text-[var(--site-ink)]">{item.question}</span>
              {/* A plus that becomes a minus on open, rather than a chevron that
                  has to rotate: it reads as "this expands" before it is
                  touched. */}
              <span
                aria-hidden="true"
                className="relative mt-1.5 size-3.5 shrink-0 text-[var(--site-faint)] transition-colors group-open:rotate-180"
              >
                <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-current" />
                <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-current transition-transform duration-200 group-open:scale-y-0" />
              </span>
            </summary>
            <p className="site-body mt-3">{item.answer}</p>
          </details>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

/**
 * Getting in touch.
 *
 * Four labelled facts in a divided grid plus a map. The map is the part that
 * used to look unfinished: it only rendered when a clinic had pasted an embed
 * URL, so the right-hand column collapsed to blank space on most sites. When
 * there is no map, the address gets a block of its own rather than the column
 * being left empty — an empty column reads as a bug, not as restraint.
 */
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

  const facts = [
    contact.showPhone && context.clinic.phone
      ? {
          label: "Phone",
          value: context.clinic.phone,
          href: `tel:${context.clinic.phone}`,
        }
      : null,
    contact.showEmail && context.clinic.email
      ? {
          label: "Email",
          value: context.clinic.email,
          href: `mailto:${context.clinic.email}`,
        }
      : null,
    contact.showAddress && context.clinic.address
      ? {
          label: "Address",
          value: context.clinic.address,
          href: null,
        }
      : null,
  ].filter((row): row is { label: string; value: string; href: string | null } =>
    row !== null,
  );

  const mapUrl = contact.mapEmbedUrl?.startsWith("https://")
    ? contact.mapEmbedUrl
    : null;
  const hours = context.availabilityRules;
  const showHours = contact.showHours && hours.length > 0;

  return (
    <div>
      <SectionHeading title={contact.title} theme={theme} />

      <div className="site-contact-grid">
        <div>
          {facts.length > 0 ? (
            <dl className="site-facts">
              {facts.map((row) => (
                <div key={row.label} className="site-rule-bottom py-4">
                  <dt className="site-meta">{row.label}</dt>
                  <dd className="mt-1.5 text-[0.9375rem] text-[var(--site-ink)]">
                    {row.href ? (
                      <a
                        href={row.href}
                        className="underline underline-offset-4 decoration-[var(--site-hairline)] underline-offset-[6px] transition-colors hover:decoration-current"
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
            <p className="site-body">
              Add a phone number or address in ClinicFlow settings and it will
              appear here.
            </p>
          )}

          {showHours ? (
            <div className="site-rule-top mt-8 pt-6">
              <h3 className="text-sm font-semibold text-[var(--site-ink)]">
                Opening hours
              </h3>
              <dl className="mt-3">
                {hours.map((rule) => (
                  <div
                    key={rule.day_of_week}
                    className="site-rule-bottom flex justify-between gap-4 py-2 text-sm tabular-nums"
                  >
                    <dt className="text-[var(--site-muted)]">
                      {DAY_SHORT[rule.day_of_week]}
                    </dt>
                    <dd className={rule.enabled ? "text-[var(--site-body)]" : "text-[var(--site-faint)]"}>
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
            <SiteCta
              widgetSlug={context.widgetSlug}
              theme={theme}
              className="mt-8"
            >
              {contact.bookingCtaText}
            </SiteCta>
          ) : null}
        </div>

        {mapUrl ? (
          <div className="min-h-[280px] overflow-hidden rounded-[var(--site-radius)] border border-[var(--site-hairline)]">
            <iframe
              src={mapUrl}
              title={`${context.clinic.name} location map`}
              width="100%"
              height="100%"
              style={{ border: 0, minHeight: "280px" }}
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        ) : contact.showAddress && context.clinic.address ? (
          /* No map configured: give the address the space the map would have
             taken, so the section still balances and never shows a gap. */
          <div className="flex flex-col justify-center rounded-[var(--site-radius)] p-8 sm:p-10" style={{ backgroundColor: "var(--site-tint)" }}>
            <p className="site-meta">Where to find us</p>
            <p className="mt-3 text-lg leading-relaxed text-[var(--site-ink)]">
              {context.clinic.address}
            </p>
            {context.clinic.phone ? (
              <a
                href={`tel:${context.clinic.phone}`}
                className="mt-5 text-sm font-medium underline underline-offset-4"
                style={{ color: theme.primaryColor }}
              >
                {context.clinic.phone}
              </a>
            ) : null}
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

/**
 * Background treatment for one section.
 *
 * `tinted` and `tint` are the same idea a shade apart: `tint` is the CSS token
 * derived from the clinic's accent, so it follows their brand colour, while
 * `tinted` is the legacy alpha-blend form kept so a stored template's surfaces
 * still render.
 */
export type WebsiteSurface = "plain" | "tint" | "tinted" | "primary" | "ink";

/**
 * Background for one section, chosen by the template variant.
 *
 * The two dark variants also have to flip `--site-ink`, not just `color`.
 * Everything inside a section reads its colour from the derived tokens
 * (`--site-body`, `--site-muted`, `--site-hairline`, …), and those are computed
 * from whatever `--site-ink` says *on the element that declares them*. Setting
 * `color: #ffffff` here changed only the inherited text colour, leaving the
 * tokens — and so the headings, body copy and hairlines — pointing at the dark
 * ink. On `template-modern`'s `experience: "ink"` section that rendered a dark
 * heading on a near-black panel: text that was present in the DOM and invisible
 * on screen. Flipping the input token is what makes the whole scale invert, and
 * it is the same reason the footer overrides `--site-ink`.
 *
 * The default (`plain`) is the page ground, not white: `--site-page` is one
 * soft step down from white so the white cards, chips and glass header read as
 * surfaces sitting *on* the page rather than dissolving into it. It lives as a
 * token so the hero, which paints no background of its own, and every plain
 * section agree on the same colour without two places to keep in step.
 */
export function sectionSurface(
  variant: WebsiteSurface,
  theme: WebsiteTheme,
): React.CSSProperties {
  switch (variant) {
    case "tint":
      return { backgroundColor: "var(--site-tint)" };
    case "tinted":
      return { backgroundColor: `${theme.primaryColor}0A` };
    case "primary":
      return {
        backgroundColor: theme.primaryColor,
        color: "#ffffff",
        ["--site-ink" as string]: "#ffffff",
      };
    case "ink":
      return {
        backgroundColor: "#0F172A",
        color: "#ffffff",
        ["--site-ink" as string]: "#ffffff",
      };
    default:
      return { backgroundColor: "var(--site-page, #f1f3f6)" };
  }
}

/** True when a surface paints dark enough to need the light ink scale. */
export function isDarkSurface(variant: WebsiteSurface): boolean {
  return variant === "primary" || variant === "ink";
}

/** Visible sections in page order. */
export function visibleSections(
  sections: WebsiteSectionConfig[],
): WebsiteSectionConfig[] {
  return sections
    .filter((section) => section.visible)
    .sort((a, b) => a.order - b.order);
}

/** Re-exported so the shell can answer "does this clinic publish hours?". */
export { hasOpeningHours, nextOpening };

const DAY_SHORT = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];