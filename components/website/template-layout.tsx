"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Hospital, Menu, ShieldCheck, X } from "lucide-react";

import {
  AboutBody,
  BookingBody,
  ContactBody,
  DoctorsBody,
  ExperienceBody,
  FaqBody,
  GalleryBody,
  HeroBody,
  isDarkSurface,
  SectionHeading,
  ServicesBody,
  openWidgetFallback,
  sectionSurface,
  siteRootStyle,
  visibleSections,
  type SiteContext,
  type WebsiteSurface as Surface,
} from "@/components/website/site-sections";
import { SiteCta } from "@/components/website/site-ui";
import type { TemplateProps } from "@/components/website/template-index";
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

/* `Surface` is declared and documented in `site-sections.tsx` next to
   `sectionSurface`, the function that has to switch on every one of its values.
   It is imported above rather than redeclared here, because a second copy of the
   union is a second thing to keep in step — and the last state of this file had
   exactly that: `sectionSurface` typed its parameter against a `Surface` that
   did not exist in this module at all. */

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

/**
 * The three presets, as data.
 *
 * A template is the same section list under different rhythm and surface — not
 * a different website — so everything a preset can change lives in this table
 * and nowhere else. Adding a preset is a row plus a thin wrapper component.
 *
 * The rhythm is deliberately not uniform. Every block used to sit in the same
 * `py-20` band regardless of what it held, which made a long page read as a
 * stack of equally weighted slabs: `contact` and `booking` get more air because
 * they are the two conversions on the page and should arrive with room around
 * them, while `gallery` gets less because a grid of photographs already supplies
 * its own structure.
 */
const SPECS: Record<TemplateVariant, VariantSpec> = {
  modern: {
    surfaces: {
      services: "tinted",
      booking: "tinted",
      experience: "ink",
      // Contact stays on white. It was a solid brand block, and with the fact
      // grid now set against hairlines there was nothing left to justify
      // inverting the whole section — it read as an empty coloured band.
      contact: "plain",
      about: "plain",
      gallery: "tint",
    },
    defaultSurface: "plain",
    blockPadding: "py-20 sm:py-24",
    containerWidth: "max-w-6xl",
    divider: "none",
    headerAlign: "left",
    showHeader: true,
  },
  classic: {
    surfaces: { about: "tinted", faq: "tinted", contact: "tint" },
    defaultSurface: "plain",
    blockPadding: "py-16 sm:py-20",
    containerWidth: "max-w-5xl",
    divider: "hairline",
    headerAlign: "center",
    showHeader: true,
  },
  minimal: {
    surfaces: {},
    defaultSurface: "plain",
    blockPadding: "py-14 sm:py-16",
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
    idPrefix,
  };

  const effectiveShowHeader = showHeader && spec.showHeader;

  return (
    /* `site-root` makes the whole page a query container, which is what lets the
       layout respond to its own width rather than to the visitor's monitor —
       and what makes the builder's 390px preview show the phone layout instead
       of a desktop one squeezed into a narrow frame. See app/globals.css. */
    <div className="site-root min-h-screen" style={siteRootStyle(theme)}>
      {effectiveShowHeader ? (
        <SiteHeader
          config={config}
          context={context}
          idPrefix={idPrefix}
        />
      ) : null}

      {sections.map((section) => {
        const surface = spec.surfaces[section.id] ?? spec.defaultSurface;

        // Hero owns its own composition — a split of copy and the clinic's
        // photograph with floating detail cards — so it is laid out here rather
        // than through the generic centred block below.
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
                /* The hero's own air, cut back: at pt-14/pb-20 (sm: 20/28) the
                   headline sat a long way from the header and an even longer
                   one from the next section, and the fold showed more margin
                   than clinic. */
                className="relative overflow-hidden px-6 pb-14 pt-10 sm:pb-20 sm:pt-14"
              >
                {/* A soft brand wash rather than the old photograph at 25%
                    opacity. The photograph is still on the page — it is a real
                    image in the right column now, at full strength, instead of
                    a texture behind the words. */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: `linear-gradient(to bottom, ${theme.primaryColor}14, transparent 72%)`,
                  }}
                />
                <div className="site-hero relative mx-auto w-full max-w-6xl lg:min-h-[min(85vh,50rem)]">
                  <HeroBody config={config} context={context} theme={theme} />
                  <HeroAside config={config} context={context} theme={theme} />
                </div>
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
                /* The surface below flips `--site-ink` to white, but a custom
                   property is only recomputed on an element that *declares* the
                   derived tokens — and this section's tokens would otherwise be
                   inherited from `.site-root`, still pointing at the dark ink.
                   Without this class a dark section renders its heading and body
                   copy in near-black on near-black. */
                isDarkSurface(surface) && "site-on-dark",
              )}
              style={sectionSurface(surface, theme)}
            >
              <div className={`mx-auto ${spec.containerWidth}`}>{body}</div>
            </section>
          </Previewable>
        );
      })}

      <SiteFooter
        config={config}
        context={context}
        variant={variant}
        idPrefix={idPrefix}
      />
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
          <ServicesBody context={context} theme={theme} />
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

/**
 * The hero's right-hand column: the clinic's own hero photograph, with two
 * glassmorphic detail cards floating over its corners.
 *
 * This is the one place on the page that earns a floating element, and it is
 * floating over a photograph rather than over text. The old hero ran the hero
 * image as a full-bleed background at 25% opacity with a centred block of copy
 * on top, which is the arrangement every stock clinic template uses and the
 * reason it read as a template. Putting the photograph back at full strength in
 * its own column gives the page a subject, and the two cards overlapping its
 * corners give the composition a focal point.
 *
 * The texts on the cards are not pulled from any database row: a pill
 * ("No. 1 Top Best Hospital") and a stat ("870+ Doctors") are claims the clinic
 * gets to make about itself, so they are plain content fields the owner edits
 * in the builder. The photograph underneath is still the clinic's own (the
 * "Hero banner" image), and when one exists a row of real doctor portraits
 * sneaks into the stat card to keep the count feeling grounded.
 *
 * The image has no box: no background, no border, no rounding. It is meant to
 * be a figure cut out on transparent background (PNG/WebP), so it reads as part
 * of the section rather than a framed photograph. The column fills the section's
 * height and the picture is cropped to it (object-cover) with the crop anchored
 * to the bottom, so the figure stands on the section's bottom edge — the
 * negative margin cancels the section's own bottom padding — and reaches up to
 * the top of the column instead of floating in the middle. A portrait (4:5)
 * figure fills the space best, uploaded at about 1200x1500px; a wider photograph
 * fills the height and loses its sides to the crop.
 *
 * When no photograph has been uploaded the column falls back to an arch in the
 * clinic's tint: same footprint, same bottom anchor, same cards — an intentional
 * shape rather than an empty image box.
 */
function HeroAside({
  config,
  context,
  theme,
}: {
  config: TemplateProps["config"];
  context: SiteContext;
  theme: TemplateProps["config"]["theme"];
}) {
  const heroImage = context.images.find((img) => img.kind === "hero");
  const { imageBadgeText, imageStatText } = config.content.hero;
  const doctorPhotos = context.doctors
    .map((doctor) => doctor.photo_url)
    .filter((url): url is string => Boolean(url))
    .slice(0, 3);

  return (
    /* The negative bottom margin cancels the section's own bottom padding
       (pb-14 / sm:pb-20), so the bottom edge of this column is the bottom edge
       of the section — the figure stands on the line rather than hovering. */
    <div className="relative -mb-14 flex min-h-[16rem] items-end justify-center sm:-mb-20 sm:min-h-[24rem] lg:min-h-[34.375rem] lg:justify-end">
      {/* The wrapper is 2.5rem wider than its column and, with the outer row
          justifying to the end, the surplus runs left into the 3.5rem gutter
          between the copy and the figure — the photo is wider than its column
          while its right edge stays on the container grid. Width is set here
          rather than on the image because a percentage on the image would have
          to resolve against this box, which is itself sized by its content.

          Height comes from the section (inherited at lg), so the picture is
          cropped to it instead of letterboxed: there is never a strip of empty
          box above the photo for the cards to drift into. */}
      <div className="relative flex w-[calc(100%_+_2.5rem)] shrink-0 items-end justify-end lg:h-full">
        {heroImage ? (
          <Image
            src={heroImage.url}
            alt={heroImage.alt}
            width={1200}
            height={1500}
            priority
            sizes="(min-width: 896px) 44vw, 100vw"
            className="aspect-[4/5] h-auto w-full select-none object-cover object-bottom drop-shadow-[0_14px_24px_rgba(15,23,42,0.14)] lg:h-full"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex aspect-[4/5] w-full items-center justify-center rounded-t-full border border-b-0 border-[var(--site-hairline)] bg-[var(--site-tint-strong)]"
          >
            <Hospital
              className="size-14"
              strokeWidth={1.25}
              style={{ color: theme.primaryColor }}
            />
          </span>
        )}

        {imageBadgeText ? (
          <div className="absolute left-3 top-6 z-20 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-full border border-white/40 bg-white/85 px-4 py-2 shadow-xl backdrop-blur-md md:left-8 md:top-[18%]">
            <ShieldCheck
              className="size-4 shrink-0"
              aria-hidden="true"
              style={{ color: theme.primaryColor }}
            />
            <span className="truncate text-xs font-semibold leading-snug text-[var(--site-ink)]">
              {imageBadgeText}
            </span>
          </div>
        ) : null}

        {imageStatText ? (
          <div className="absolute bottom-6 right-3 z-20 flex max-w-[calc(100%-1.5rem)] items-center gap-3 rounded-[12px] border border-white/40 bg-white/85 p-4 shadow-xl backdrop-blur-md md:bottom-[18%] md:right-8">
            {doctorPhotos.length > 0 ? (
              <span className="flex shrink-0">
                {doctorPhotos.map((url, index) => (
                  <span
                    key={`${url}-${index}`}
                    className="relative -ml-1.5 first:ml-0 size-7 overflow-hidden rounded-full border-2 border-white"
                  >
                    <Image src={url} alt="" fill sizes="2rem" className="object-cover" />
                  </span>
                ))}
              </span>
            ) : null}
            <span className="text-sm font-semibold leading-tight text-[var(--site-ink)]">
              {imageStatText}
            </span>
          </div>
        ) : null}
      </div>
    </div>
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

/**
 * "Home" in the header.
 *
 * Scrolls back to the hero — the top of the page — using the same header-height
 * offset and motion preference as `jumpToSection`. When a clinic has switched
 * its hero off, there is no hero element to find, so it falls back to the very
 * top of the document. The URL hash is cleared afterwards: a link someone
 * shares from an anchored page should not point at `#services` when the actual
 * view is the top of the site.
 */
function jumpHome(
  event: React.MouseEvent<HTMLAnchorElement>,
  headerId: string,
  prefix: string | undefined,
) {
  event.preventDefault();

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const behavior = prefersReducedMotion ? "auto" : "smooth";

  const header = document.getElementById(headerId);
  const headerHeight =
    header instanceof HTMLElement ? header.getBoundingClientRect().height : 0;

  const hero = document.getElementById(anchorId(prefix, "hero"));
  if (hero instanceof HTMLElement) {
    hero.style.scrollMarginTop = `${Math.round(headerHeight + 16)}px`;
    hero.scrollIntoView({ behavior, block: "start" });
    hero.focus({ preventScroll: true });
  } else {
    window.scrollTo({ top: 0, behavior });
  }

  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
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
  const [menuOpen, setMenuOpen] = useState(false);

  /**
   * Past a few pixels the bar changes shape: full-width and flush at the top of
   * the page, a floating glass capsule once the page is moving under it. The
   * threshold is a few pixels rather than `scrollY > 0` so a trackpad settling
   * at the top does not flicker between the two shapes.
   *
   * The threshold is read from whichever element actually scrolls. On the
   * published site that is the window; in the builder the preview lives inside
   * its own scrolling pane, where `window.scrollY` stays pinned at 0 and a
   * window-only listener would never see the preview move.
   */
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let node = headerRef.current?.parentElement ?? null;
    let pane: HTMLElement | null = null;
    while (node && node !== document.body) {
      const overflowY = window.getComputedStyle(node).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") {
        pane = node;
        break;
      }
      node = node.parentElement;
    }

    const onScroll = () => {
      setScrolled(window.scrollY > 16 || (pane?.scrollTop ?? 0) > 16);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    pane?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      pane?.removeEventListener("scroll", onScroll);
    };
  }, []);

  // The nav is derived from the sections the clinic actually published, in page
  // order. This is a one-pager, so there are no separate pages to link to —
  // every entry is an anchor into the same document. That makes the header a
  // table of contents rather than a menu, and it has to be built from the same
  // `visibleSections` list the page renders: a hidden section must not leave a
  // link behind that scrolls a visitor to nothing. Hero is dropped here because
  // its job is taken by the Home entry at the head of the list, which scrolls
  // back to the top of the page — the only section the visitor can be looking
  // for once they have scrolled past the fold.
  const navSections = visibleSections(content.sections).filter(
    (section) => section.id !== "hero",
  );

  // Escape closes the menu. A panel that covers the page's own header needs a
  // way out that does not require finding the toggle again.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  // Desktop links, shared by the inline row and the phone panel so the two
  // cannot list different sections. Home comes first: it is the one item that
  // is meaningful from anywhere on the page.
  const navLinks = [
    <a
      key="nav-home"
      href={`#${anchorId(idPrefix, "hero")}`}
      onClick={(event) => {
        setMenuOpen(false);
        jumpHome(event, anchorId(idPrefix, "site-header"), idPrefix);
      }}
      aria-label="Back to the top of the page"
      className="whitespace-nowrap py-2.5 text-[0.9375rem] text-[var(--site-body)] transition-colors hover:text-[var(--site-ink)]"
    >
      Home
    </a>,
    ...navSections.map((section) => {
      const targetId = anchorId(idPrefix, section.id);
      return (
        <a
          key={section.id}
          href={`#${targetId}`}
          onClick={(event) => {
            setMenuOpen(false);
            jumpToSection(
              event,
              targetId,
              anchorId(idPrefix, "site-header"),
              section.id,
            );
          }}
          className="whitespace-nowrap py-2.5 text-[0.9375rem] text-[var(--site-body)] transition-colors hover:text-[var(--site-ink)]"
        >
          {section.label}
        </a>
      );
    }),
  ];

  return (
    <header
      id={anchorId(idPrefix, "site-header")}
      data-site-header
      ref={headerRef}
      /* `sticky` also establishes the containing block for the phone menu
         below, which is what keeps that panel glued to the bar as the page
         scrolls. A `fixed` overlay would have been the obvious choice and would
         have been wrong: `position: fixed` resolves to the viewport, so in the
         builder it would cover the whole editor rather than the preview frame.

         The two shapes share one height, so the swap at the threshold never
         nudges the page underneath: the flush bar is `py-3` inside plus a 1px
         border, and the capsule is `pt-3` outside with the inner row dropped to
         `py-1.5` — both add up to 25px plus the row, and `transition-all`
         animates the two paddings against each other so the total stays
         constant for the duration of the change. The border only ever changes
         colour, black/5 to transparent, so it never disappears from the box. */
      className={cn(
        "sticky top-0 z-30 border-b transition-all duration-200",
        scrolled
          ? "border-transparent bg-transparent px-3 pt-3 backdrop-blur-0 sm:px-4"
          : "border-black/5 bg-white/85 backdrop-blur-md",
        isCentered && "text-center",
      )}
      style={{ fontFamily: "var(--site-font)" }}
    >
      <div
        className={cn(
          "mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-3 transition-all duration-200",
          /* The capsule: fully rounded ends, a light glass body and a shadow
             that separates it from the content now scrolling beneath. The blur
             goes up a step because it is no longer sitting on white — it has to
             hold legibility over photographs and dark sections. */
          scrolled &&
            "rounded-full border border-black/5 bg-white/70 py-1.5 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur-xl",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          {logo ? (
            <Image
              src={logo}
              alt={context.clinic.name}
              width={132}
              height={40}
              className="h-9 w-auto object-contain"
            />
          ) : (
            <span className="truncate text-[0.9375rem] font-semibold tracking-[-0.01em] text-[var(--site-ink)]">
              {context.clinic.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-3">
          {/* Scrolling rather than wrapping: nine live sections would otherwise
              push the booking button off the edge of a laptop screen. */}
          <nav className="site-nav-desktop items-center gap-6 overflow-x-auto">
            {navLinks}
          </nav>

          {/* Opens the floating panel in place. Without the handler this was the
              one booking link on the page that still navigated away to
              /widget/<slug>, which is the blank separate page we are trying to
              stop people landing on.

              Labelled "Book" rather than "Book appointment" because this sits in
              a bar already holding the clinic name and up to eight nav links;
              the full phrase does not fit beside them at 1024px without either
              truncating the name or dropping the nav to two items. The booking
              section and the hero both spell it out in full, so the long form is
              still on the page. */}
          <SiteCta
            widgetSlug={context.widgetSlug}
            theme={theme}
            className="min-h-11 shrink-0 px-5 py-2.5 text-sm font-semibold"
          >
            Book
          </SiteCta>

          {/* Below 640px of site width the nav row is replaced by this. The
              previous header had no phone navigation at all — the links were
              simply hidden and a logo plus one button were left, so a visitor on
              a 375px screen could not reach a single section. */}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls={anchorId(idPrefix, "site-menu")}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="site-nav-toggle -mr-1 inline-flex size-11 items-center justify-center rounded-[var(--site-radius)] text-[var(--site-ink)] transition-colors hover:bg-black/[0.04]"
          >
            {menuOpen ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div
          id={anchorId(idPrefix, "site-menu")}
          className="absolute inset-x-0 top-full border-b border-black/5 bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]"
        >
          <nav className="mx-auto flex max-w-6xl flex-col px-6 pb-4 pt-1">
            {navLinks}
            <div className="site-rule-top mt-2 flex flex-col gap-3 pt-4">
              {context.clinic.phone ? (
                <a
                  href={`tel:${context.clinic.phone}`}
                  className="flex min-h-11 items-center text-[0.9375rem] text-[var(--site-body)]"
                >
                  {context.clinic.phone}
                </a>
              ) : null}
              <a
                href={`/widget/${context.widgetSlug}`}
                onClick={openWidgetFallback}
                className="flex min-h-11 items-center font-medium"
                style={{ color: theme.primaryColor }}
              >
                Book an appointment
              </a>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

/**
 * The footer.
 *
 * Was two lines: the clinic name and a copyright. It is now three columns —
 * the brand, the page's table of contents and the contact details — which is
 * the only arrangement a visitor who scrolled past everything can still get
 * somewhere from, and the one surface that survives on the long landing pages
 * where the header has already scrolled away.
 *
 * The contact column is rendered even when the clinic has published no phone,
 * email or address: a conditional third column left two of the three slots in
 * the grid filled at wide widths, so the footer read as one column missing
 * rather than as three. When there is nothing to list, the column falls back to
 * the one link every site has — the booking assistant.
 *
 * `--site-ink` is flipped to white on this block so the whole derived ink scale
 * inverts with it. Without that override every hairline and every muted line on
 * the dark panel would resolve to near-black on near-black — and it is why the
 * rules below read `var(--site-hairline)` rather than a fixed grey: they are
 * re-derived from the flipped ink here, so the same class works on the dark
 * footer of the modern template and the white one of the minimal.
 *
 * No social links: the clinic record has no social handles and inventing URLs
 * would put dead icons in the footer of every site.
 */
function SiteFooter({
  config,
  context,
  variant,
  idPrefix,
}: {
  config: TemplateProps["config"];
  context: SiteContext;
  variant: TemplateVariant;
  idPrefix?: string;
}) {
  const year = new Date().getFullYear();
  const dark = variant !== "minimal";
  const logo = config.theme.logoUrl || context.clinic.logoUrl;
  const tagline = footerTagline(config.content.about.bio);

  const navSections = visibleSections(config.content.sections).filter(
    (section) => section.id !== "hero",
  );

  const contactLinks = [
    context.clinic.phone
      ? { label: "Phone", value: context.clinic.phone, href: `tel:${context.clinic.phone}` }
      : null,
    context.clinic.email
      ? { label: "Email", value: context.clinic.email, href: `mailto:${context.clinic.email}` }
      : null,
    context.clinic.address
      ? { label: "Address", value: context.clinic.address, href: null }
      : null,
  ].filter((row): row is { label: string; value: string; href: string | null } => row !== null);

  return (
    <footer
      className="site-footer mt-0 px-6 py-14 sm:py-16"
      style={
        dark
          ? { backgroundColor: "#0F172A", ["--site-ink" as string]: "#ffffff" }
          : { backgroundColor: "#ffffff", ["--site-ink" as string]: undefined }
      }
    >
      <div className="site-footer-grid mx-auto max-w-6xl">
        <div>
          {logo ? (
            <Image
              src={logo}
              alt={context.clinic.name}
              width={132}
              height={40}
              className="h-9 w-auto object-contain"
            />
          ) : (
            <p className="text-[0.9375rem] font-semibold tracking-[-0.01em]">
              {context.clinic.name}
            </p>
          )}
          {context.clinic.doctor_name ? (
            <p className="site-meta mt-2">{context.clinic.doctor_name}</p>
          ) : null}
          {tagline ? (
            <p className="site-body mt-3 text-[0.8125rem]">{tagline}</p>
          ) : null}
        </div>

        <nav aria-label="Sections">
          <h2 className="text-sm font-semibold">On this page</h2>
          <ul className="mt-3 flex flex-col">
            {navSections.map((section) => {
              const targetId = anchorId(idPrefix, section.id);
              return (
                <li
                  key={section.id}
                  className="border-b border-[var(--site-hairline)]"
                >
                  <a
                    href={`#${targetId}`}
                    onClick={(event) =>
                      jumpToSection(
                        event,
                        targetId,
                        anchorId(idPrefix, "site-header"),
                        section.id,
                      )
                    }
                    className="site-meta block py-2.5 transition-colors hover:text-[var(--site-ink)]"
                  >
                    {section.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-semibold">Contact</h2>
          {contactLinks.length > 0 ? (
            <ul className="mt-3 flex flex-col">
              {contactLinks.map((row) => (
                <li
                  key={row.label}
                  className="border-b border-[var(--site-hairline)]"
                >
                  {row.href ? (
                    <a
                      href={row.href}
                      className="site-meta block break-words py-2.5 transition-colors hover:text-[var(--site-ink)]"
                    >
                      <span className="sr-only">{row.label}: </span>
                      {row.value}
                    </a>
                  ) : (
                    <p className="site-meta break-words py-2.5">
                      <span className="sr-only">{row.label}: </span>
                      {row.value}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            /* Nothing published to contact: the booking assistant is the one
               route every site has, so the column still earns its width. */
            <a
              href={`/widget/${context.widgetSlug}`}
              onClick={openWidgetFallback}
              className="site-meta mt-3 inline-flex min-h-11 items-center transition-colors hover:text-[var(--site-ink)]"
            >
              Book an appointment
            </a>
          )}
        </div>
      </div>

      <div className="mx-auto mt-12 flex max-w-6xl flex-col gap-2 border-t border-[var(--site-hairline)] pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="site-meta">
          &copy; {year} {context.clinic.name}
        </p>
        <p className="site-meta">
          <Link
            href="/"
            className="underline underline-offset-4 transition-colors hover:text-[var(--site-ink)]"
          >
            Powered by ClinicFlow
          </Link>
        </p>
      </div>
    </footer>
  );
}

/**
 * The clinic's About bio, cut down to the one line the brand column has room
 * for. The first sentence is the clinic's own introduction rather than a claim
 * invented for the layout; when the bio is one long sentence it is trimmed at a
 * word boundary instead of mid-word.
 */
function footerTagline(bio: string | null | undefined): string {
  const value = bio?.trim();
  if (!value) return "";

  const match = value.match(/^[^.!?]*[.!?]?/);
  let line = (match?.[0] ?? value).trim();
  if (!line) return "";

  const MAX = 150;
  if (line.length > MAX) {
    line = `${line.slice(0, MAX).replace(/\s+\S*$/, "").trim()}…`;
  }
  return line;
}
