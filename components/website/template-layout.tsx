"use client";

import Link from "next/link";
import Image from "next/image";

import {
  AboutBody,
  BookingBody,
  ContactBody,
  DoctorsBody,
  ExperienceBody,
  FaqBody,
  GalleryBody,
  HeroBody,
  SectionHeading,
  ServicesBody,
  openWidgetFallback,
  sectionSurface,
  siteRootStyle,
  visibleSections,
  type SiteContext,
} from "@/components/website/site-sections";
import type { TemplateProps } from "@/components/website/template-index";
import { buttonClass } from "@/types/website";
import { cn } from "@/lib/utils";

/**
 * The one renderer every template shares.
 *
 * A template is not a different website — it is the same ordered section list
 * with different surface, spacing and heading treatment. Encoding that as data
 * instead of three parallel switch statements is what makes adding a section a
 * one-file change rather than a three-file one, and it is why the builder
 * preview can be the real renderer instead of an approximation of it.
 */

export type TemplateVariant = "modern" | "classic" | "minimal";

type Surface = "plain" | "tinted" | "primary" | "ink";

type VariantSpec = {
  /** Background per section id. Omitted id falls back to `defaultSurface`. */
  surfaces: Partial<Record<string, Surface>>;
  defaultSurface: Surface;
  /** Vertical rhythm. Minimal is deliberately tighter than Modern. */
  blockPadding: string;
  containerWidth: string;
  /** A hairline above each block. Classic reads as an editorial column. */
  divider: "none" | "hairline";
  /** Classic centres its masthead; the other two keep the logo hard left. */
  headerAlign: "left" | "center";
  showHeader: boolean;
};

const SPECS: Record<TemplateVariant, VariantSpec> = {
  modern: {
    surfaces: { services: "tinted", booking: "tinted", contact: "primary", experience: "ink" },
    defaultSurface: "plain",
    blockPadding: "py-20",
    containerWidth: "max-w-6xl",
    divider: "none",
    headerAlign: "left",
    showHeader: true,
  },
  classic: {
    surfaces: { about: "tinted", contact: "primary", faq: "tinted" },
    defaultSurface: "plain",
    blockPadding: "py-16",
    containerWidth: "max-w-5xl",
    divider: "hairline",
    headerAlign: "center",
    showHeader: true,
  },
  minimal: {
    surfaces: {},
    defaultSurface: "plain",
    blockPadding: "py-14",
    containerWidth: "max-w-3xl",
    divider: "none",
    headerAlign: "left",
    showHeader: true,
  },
};

/**
 * Builds a DOM id for an anchor, prefixing it only when the caller supplied a
 * discriminator. Keeping the public site's ids bare means its shareable hash is
 * the plain section name (`#services`) rather than an internal detail.
 */
function anchorId(prefix: string | undefined, name: string): string {
  return prefix ? `${prefix}-${name}` : name;
}

export function WebsiteLayout({
  config,
  images,
  clinic,
  services,
  doctors = [],
  availabilityRules,
  widgetSlug,
  siteSlug,
  variant,
  interactive,
  selectedSectionId,
  onSelectSection,
  showHeader = true,
  idPrefix,
}: TemplateProps & {
  doctors?: SiteContext["doctors"];
  variant: TemplateVariant;
}) {
  const spec = SPECS[variant];
  const { theme, content } = config;
  const sections = visibleSections(content.sections);

  /**
   * Anchor ids have to be unique per rendered instance, not just per section.
   *
   * The builder mounts this renderer twice at once — the docked canvas and the
   * fullscreen overlay on top of it — so a plain `id="services"` exists twice in
   * the document. `getElementById` (and native anchor navigation) then resolves
   * to whichever comes first in the DOM, which is the preview *behind* the
   * overlay: clicking a menu item in fullscreen would scroll the hidden canvas
   * and appear to do nothing. A per-instance prefix keeps the ids unique, which
   * also makes the duplicate-id markup valid again.
   *
   * The prefix is the caller's static `idPrefix` prop, not a `useId()`. `useId`
   * is a function of tree position, so it agrees with the server only while both
   * render the same tree; as soon as the two differ, every `id` on the page
   * mismatches during hydration and React refuses to patch them. A prop is
   * literal and cannot drift. See `TemplateProps["idPrefix"]`.
   */

  const context: SiteContext = {
    clinic: { ...clinic, logoUrl: clinic.logoUrl },
    services,
    doctors,
    availabilityRules,
    images,
    widgetSlug,
    siteSlug,
  };

  const effectiveShowHeader = showHeader && spec.showHeader;

  return (
    <div className="min-h-screen" style={siteRootStyle(theme)}>
      {effectiveShowHeader ? (
        <SiteHeader
          config={config}
          context={context}
          idPrefix={idPrefix}
        />
      ) : null}

      {sections.map((section) => {
        const surface = spec.surfaces[section.id] ?? spec.defaultSurface;

        // Hero owns its own padding — it is a full-bleed statement, not a block.
        if (section.id === "hero") {
          return (
            <Previewable
              key={section.id}
              sectionId={section.id}
              label={section.label}
              interactive={interactive}
              selected={selectedSectionId === section.id}
              onSelect={onSelectSection}
            >
              <section
                data-site-section={section.id}
                id={anchorId(idPrefix, section.id)}
                /* `-1` keeps the section out of the Tab order but lets the header
                   nav move focus here, so Tab continues from the section the
                   visitor jumped to instead of from the header links. */
                tabIndex={-1}
                className="relative flex min-h-[62vh] items-center justify-center overflow-hidden px-6 py-28"
                style={{ backgroundColor: theme.primaryColor }}
              >
                <HeroBackdrop context={context} />
                <HeroBody config={config} context={context} theme={theme} />
              </section>
            </Previewable>
          );
        }

        const body = renderBody(section.id, config, context, theme);
        if (!body) return null;

        return (
          <Previewable
            key={section.id}
            sectionId={section.id}
            label={section.label}
            interactive={interactive}
            selected={selectedSectionId === section.id}
            onSelect={onSelectSection}
          >
            <section
              data-site-section={section.id}
              id={anchorId(idPrefix, section.id)}
              tabIndex={-1}
              /* `scroll-mt` leaves room for the sticky header, otherwise every
                 anchor lands with the section's heading hidden underneath it. */
              className={cn(
                "scroll-mt-20 px-6",
                spec.blockPadding,
                spec.divider === "hairline" && "border-t border-black/10",
              )}
              style={sectionSurface(surface, theme)}
            >
              <div className={`mx-auto ${spec.containerWidth}`}>{body}</div>
            </section>
          </Previewable>
        );
      })}

      <SiteFooter context={context} variant={variant} />
    </div>
  );
}

/**
 * Wraps a section so the builder can select it by click.
 *
 * The label is a real button floating over the block rather than the block
 * itself becoming one: making the whole section a button would swallow every
 * link and phone number inside it, so a doctor's preview could no longer try the
 * booking button they just wrote. Clicking the label selects; clicking anything
 * else behaves exactly as it will for a patient.
 */
function Previewable({
  sectionId,
  label,
  interactive,
  selected,
  onSelect,
  children,
}: {
  sectionId: string;
  label: string;
  interactive?: boolean;
  selected?: boolean;
  onSelect?: (sectionId: string) => void;
  children: React.ReactNode;
}) {
  if (!interactive) return <>{children}</>;

  return (
    <div
      className={cn(
        "relative transition-shadow",
        selected ? "z-10" : "z-0",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect?.(sectionId)}
        aria-pressed={selected}
        className={cn(
          "absolute start-2 top-2 z-20 rounded-control px-2 py-1 text-[11px] font-semibold shadow-card transition-colors",
          selected
            ? "bg-primary text-white"
            : "bg-white/90 text-text-secondary hover:bg-white",
        )}
      >
        {label}
      </button>
      {children}
    </div>
  );
}

function renderBody(
  id: string,
  config: TemplateProps["config"],
  context: SiteContext,
  theme: TemplateProps["config"]["theme"],
) {
  switch (id) {
    case "doctors":
      return <DoctorsBody config={config} context={context} theme={theme} />;
    case "about":
      return <AboutBody config={config} context={context} theme={theme} />;
    case "services":
      return (
        <div>
          <SectionHeading
            title="What we treat"
            description="Every service below is managed in ClinicFlow, so the list here always matches what we actually offer."
            theme={theme}
          />
          <ServicesBody context={context} />
        </div>
      );
    case "booking":
      return <BookingBody config={config} context={context} theme={theme} />;
    case "gallery":
      return (
        <div>
          <SectionHeading title="Inside the clinic" theme={theme} />
          <GalleryBody context={context} />
        </div>
      );
    case "experience":
      return <ExperienceBody config={config} theme={theme} />;
    case "faq":
      return <FaqBody config={config} theme={theme} />;
    case "contact":
      return <ContactBody config={config} context={context} theme={theme} />;
    default:
      // `hero` is handled by the caller; an unknown id renders nothing rather
      // than an empty band.
      return null;
  }
}

/** Hero photograph behind the colour wash, or nothing at all. */
function HeroBackdrop({ context }: { context: SiteContext }) {
  const heroImage = context.images.find((img) => img.kind === "hero");
  if (!heroImage) return null;
  return (
    <Image
      src={heroImage.url}
      alt={heroImage.alt}
      fill
      priority
      sizes="100vw"
      className="object-cover opacity-25"
    />
  );
}

/**
 * Jump to a section rather than letting the browser pick the target.
 *
 * Takes the already-namespaced ids rather than a bare section name: the builder
 * renders two copies of the site at once, so an unqualified lookup would always
 * hit the docked canvas behind the fullscreen overlay and the visitor would see
 * the scroll happen nowhere. Every id passed in here is unique to the instance
 * whose header the click came from.
 */
function jumpToSection(
  event: React.MouseEvent<HTMLAnchorElement>,
  targetId: string,
  headerId: string,
  hashName: string,
) {
  const target = document.getElementById(targetId);
  // No target means the section renders empty for this clinic. Leave the click
  // alone rather than swallowing it.
  if (!target) return;

event.preventDefault();

  // Offset by the header's real height instead of a guessed constant. The bar
  // grows when the logo is tall, the clinic name wraps onto two lines, or the
  // nav wraps on a narrow screen — and a fixed guess is exactly wrong in those
  // cases, landing the heading underneath the bar the visitor just used.
  const header = document.getElementById(headerId);
  const headerHeight =
    header instanceof HTMLElement ? header.getBoundingClientRect().height : 0;
  target.style.scrollMarginTop = `${Math.round(headerHeight + 16)}px`;

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  target.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "start",
  });
  // `preventScroll` because the smooth scroll above already put it on screen;
  // without it the focus would cancel the animation and jump.
  target.focus({ preventScroll: true });
  // The bare section name, not the prefixed DOM id: the hash is the one part of
  // this a visitor can see, share, and come back to.
  window.history.replaceState(null, "", `#${hashName}`);
}

function SiteHeader({
  config,
  context,
  idPrefix,
}: {
  config: TemplateProps["config"];
  context: SiteContext;
  idPrefix?: string;
}) {
  const { theme, content } = config;
  const spec = SPECS[config.template];
  const logo = theme.logoUrl || context.clinic.logoUrl;
  const isCentered = spec.headerAlign === "center";

  // The nav is derived from the sections the clinic actually published, in page
  // order. This is a one-pager, so there are no separate pages to link to —
  // every entry is an anchor into the same document. That makes the header a
  // table of contents rather than a menu, and it has to be built from the same
  // `visibleSections` list the page renders: a hidden section must not leave a
  // link behind that scrolls a visitor to nothing. Hero is dropped because it is
  // already on screen and links to itself do nothing useful.
  const navSections = visibleSections(content.sections).filter(
    (section) => section.id !== "hero",
  );

  return (
    <header
      id={anchorId(idPrefix, "site-header")}
      data-site-header
      className={cn(
        "sticky top-0 z-30 border-b border-black/10 bg-white/95 backdrop-blur",
        isCentered && "text-center",
      )}
      style={{ fontFamily: "var(--site-font)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {logo ? (
            <Image
              src={logo}
              alt={context.clinic.name}
              width={132}
              height={40}
              className="h-10 w-auto object-contain"
            />
          ) : (
            <span className="truncate text-base font-bold tracking-tight text-[var(--site-ink)]">
              {context.clinic.name}
            </span>
          )}
        </div>
        <nav className="flex items-center gap-4 text-sm">
          {/* Scrolls rather than wraps: nine live sections would otherwise push
              the booking button off the edge of a laptop screen. */}
          <div className="hidden items-center gap-5 overflow-x-auto sm:flex">
            {navSections.map((section) => {
              const targetId = anchorId(idPrefix, section.id);
              return (
                <a
                  key={section.id}
                  href={`#${targetId}`}
                  onClick={(event) =>
                    jumpToSection(event, targetId, anchorId(idPrefix, "site-header"), section.id)
                  }
                  className="whitespace-nowrap hover:underline"
                >
                  {section.label}
                </a>
              );
            })}
          </div>
          {/* Opens the floating panel in place. Without the handler this was the
              one booking link on the page that still navigated away to
              /widget/<slug>, which is the blank separate page we are trying to
              stop people landing on. */}
          <a
            href={`/widget/${context.widgetSlug}`}
            onClick={openWidgetFallback}
            className={`${buttonClass(theme)} shrink-0 px-5 py-2.5`}
          >
            Book
          </a>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter({
  context,
  variant,
}: {
  context: SiteContext;
  variant: TemplateVariant;
}) {
  const year = new Date().getFullYear();
  return (
    <footer
      className="border-t border-black/10 px-6 py-8 text-sm"
      style={
        variant === "minimal"
          ? { backgroundColor: "#ffffff", color: "rgba(15,23,42,0.6)" }
          : { backgroundColor: "#0F172A", color: "rgba(255,255,255,0.7)" }
      }
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p>
          {context.clinic.name}
          {context.clinic.doctor_name ? ` · ${context.clinic.doctor_name}` : ""}
        </p>
        <p>
          &copy; {year} ·{" "}
          <Link href="/" className="underline underline-offset-4">
            Powered by ClinicFlow
          </Link>
        </p>
      </div>
    </footer>
  );
}
