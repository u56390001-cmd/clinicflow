import type { WebsiteTemplate } from "@/types/database";

/**
 * Shared website configuration object consumed by all templates and by the
 * builder. The template is purely a presentational layer — switching templates
 * never destroys or modifies this data.
 *
 * Shape follows the section-library model: every section is one entry in
 * `content.sections` carrying its own copy, and each section type has exactly one
 * content slot. Adding a section type means adding an id, a slot and a default —
 * never a second parallel config object.
 */

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export type WebsiteSectionId =
  | "hero"
  | "doctors"
  | "about"
  | "services"
  | "booking"
  | "gallery"
  | "experience"
  | "faq"
  | "contact";

export type WebsiteSectionConfig = {
  id: WebsiteSectionId;
  label: string;
  visible: boolean;
  order: number;
};

/** Static description of a section type, used by the block library and the rail. */
export type WebsiteSectionKind = {
  id: WebsiteSectionId;
  label: string;
  /** One line, plain language — this is a doctor's interface, not a CMS. */
  blurb: string;
  /** Sections that pull their content from ClinicFlow rather than free text. */
  dataDriven?: boolean;
};

export const SECTION_LIBRARY: readonly WebsiteSectionKind[] = [
  { id: "hero", label: "Hero", blurb: "First thing visitors see, with your booking call to action." },
  { id: "doctors", label: "Doctors", blurb: "Your team from the Doctors page. Updates itself.", dataDriven: true },
  { id: "about", label: "About clinic", blurb: "Your story, credentials and facilities." },
  { id: "services", label: "Services", blurb: "Treatments from your Services page. Updates itself.", dataDriven: true },
  { id: "booking", label: "Booking", blurb: "Opening hours, next available slot and the booking panel." },
  { id: "gallery", label: "Gallery", blurb: "Photos of your clinic, waiting area and equipment." },
  { id: "experience", label: "Experience", blurb: "Years in practice, patients seen and qualifications." },
  { id: "faq", label: "Questions", blurb: "The questions patients ask before their first visit." },
  { id: "contact", label: "Contact", blurb: "Phone, address, map and opening hours." },
];

// ---------------------------------------------------------------------------
// Per-section content
// ---------------------------------------------------------------------------

export type WebsiteHeroContent = {
  headline: string;
  description: string;
  ctaText: string;
  ctaUrl: string;
  /** Optional secondary CTA label — renders as a tel: link to the clinic phone. */
  ctaSecondaryLabel?: string;
};

export type WebsiteDoctorsContent = {
  title: string;
  description: string;
  /** Show every visible doctor, or only the first N. */
  limit: number;
  ctaText: string;
};

export type WebsiteAboutContent = {
  title: string;
  bio: string;
  credentials: string;
  /** Dynamic certification chips (e.g. "Board Certified", "ADA Member"). */
  certifications?: string[];
  /** Bullet list rendered as the facility chips (equipment, parking, etc). */
  facilities: string[];
};

export type WebsiteBookingContent = {
  title: string;
  description: string;
  ctaText: string;
  /** Show the live "next available slot" line above the button. */
  showNextSlot: boolean;
};

export type WebsiteExperienceContent = {
  title: string;
  /** Headline figure, e.g. "15+". Paired with `stats[].label`. */
  yearsLabel: string;
  stats: Array<{ value: string; label: string }>;
};

export type WebsiteFaqItem = {
  id: string;
  question: string;
  answer: string;
};

export type WebsiteFaqContent = {
  title: string;
  items: WebsiteFaqItem[];
};

export type WebsiteContactContent = {
  title: string;
  showPhone: boolean;
  showEmail: boolean;
  showAddress: boolean;
  showHours: boolean;
  bookingCtaText: string;
  /** Google Maps embed URL (https://www.google.com/maps/embed?pb=...). */
  mapEmbedUrl?: string;
};

export type WebsiteContent = {
  hero: WebsiteHeroContent;
  doctors: WebsiteDoctorsContent;
  about: WebsiteAboutContent;
  booking: WebsiteBookingContent;
  experience: WebsiteExperienceContent;
  faq: WebsiteFaqContent;
  contact: WebsiteContactContent;
  sections: WebsiteSectionConfig[];
};

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------

export type WebsiteButtonStyle = "solid" | "soft" | "outline" | "inverse";
export type WebsiteHeadingFont = "same" | "serif" | "wide" | "humanist";
export type WebsiteAlignment = "left" | "center";

export type WebsiteTheme = {
  primaryColor: string;
  /** Text colour, kept separate so a dark brand does not produce unreadable copy. */
  textColor: string;
  fontFamily: string;
  /** Headings only. "same" reuses `fontFamily`. */
  headingFont: WebsiteHeadingFont;
  buttonStyle: WebsiteButtonStyle;
  /** Rounded, soft or sharp. Read by every button and card on the site. */
  cornerStyle: "sharp" | "soft" | "round";
  /** Logo object URL. Falls back to the clinic logo from Settings. */
  logoUrl: string;
  /** Hide the template's own header bar and let the hero own the top of the page. */
  showHeader: boolean;
  /** Headline alignment across the whole page. */
  alignment: WebsiteAlignment;
};

// ---------------------------------------------------------------------------
// AI booking widget placement
// ---------------------------------------------------------------------------

export type WebsiteWidgetPosition = "bottom-right" | "bottom-left";

/**
 * Where the bubble's accent colour comes from.
 *
 * `brand` follows `theme.primaryColor` so the assistant matches the site it is
 * embedded in. `custom` uses the colour set here instead. The clinic-wide
 * `clinic_ai_settings.widget_color` is what both of these override on a
 * published site — that setting still governs the standalone `/widget/<slug>`
 * page and third-party embeds.
 */
export type WebsiteWidgetColorMode = "brand" | "custom";

export type WebsiteWidgetContent = {
  enabled: boolean;
  position: WebsiteWidgetPosition;
  /** Language the floating assistant opens in. */
  language: "en" | "ur" | "ar";
  colorMode: WebsiteWidgetColorMode;
  /** Accent colour, used only when `colorMode` is `custom`. */
  color: string;
};

// ---------------------------------------------------------------------------
// SEO
// ---------------------------------------------------------------------------

export type WebsiteSeo = {
  /** Blank falls back to "<Clinic name> | <Doctor>" derived from clinic data. */
  title: string;
  description: string;
  keywords: string;
  /** Absolute URL of the social sharing image. */
  ogImage: string;
  /** Keep the site out of search results. Drafts and previews set this. */
  noindex: boolean;
};

// ---------------------------------------------------------------------------
// Locale
// ---------------------------------------------------------------------------

export type WebsiteLanguage = "en" | "ur" | "ar";

export type WebsiteLocaleContent = {
  language: WebsiteLanguage;
  /** Written LTR/RTL from `language`; overridable so a doctor can preview either. */
  direction: "ltr" | "rtl";
};

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export type WebsiteConfig = {
  template: WebsiteTemplate;
  content: WebsiteContent;
  theme: WebsiteTheme;
  widget: WebsiteWidgetContent;
  seo: WebsiteSeo;
  locale: WebsiteLocaleContent;
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Canonical section order. `order` is derived from array position on save. */
export function defaultSections(): WebsiteSectionConfig[] {
  return SECTION_LIBRARY.map((kind, index) => ({
    id: kind.id,
    label: kind.label,
    visible: !["experience", "faq"].includes(kind.id),
    order: index,
  }));
}

/**
 * Body faces a clinic can pick, offered as stack-only choices.
 *
 * No webfont is loaded for any of these: the public page ships no extra font
 * requests no matter how many doctors build a site, and every stack below
 * resolves on the machine it renders on. The default is the app's own face
 * (`--font-jakarta`, set in `app/layout.tsx`) so a clinic's site looks like the
 * product they already use — the first option is what a new site gets.
 */
export const SITE_FONT_STACKS = [
  {
    label: "ClinicFlow Sans",
    stack: 'var(--font-jakarta), ui-sans-serif, system-ui, sans-serif',
  },
  {
    label: "System",
    stack:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  {
    label: "Serif",
    stack: 'Georgia, Cambria, "Times New Roman", Times, serif',
  },
  {
    label: "Humanist",
    stack: '"Gill Sans", "Trebuchet MS", "Segoe UI", sans-serif',
  },
] as const;

export const DEFAULT_CONTENT: WebsiteContent = {
  hero: {
    headline: "",
    description: "",
    ctaText: "Book an Appointment",
    ctaUrl: "",
    ctaSecondaryLabel: "",
  },
  doctors: {
    title: "Our doctors",
    description: "",
    limit: 6,
    ctaText: "Book with our team",
  },
  about: {
    title: "About our clinic",
    bio: "",
    credentials: "",
    certifications: [],
    facilities: [],
  },
  booking: {
    title: "Book a visit",
    description:
      "Choose a time that suits you. Our assistant confirms the appointment and sends a reminder before you arrive.",
    ctaText: "Book an Appointment",
    showNextSlot: true,
  },
  experience: {
    title: "Experience you can measure",
    yearsLabel: "Years in practice",
    stats: [
      { value: "15+", label: "Years in practice" },
      { value: "20k+", label: "Patients treated" },
      { value: "12", label: "Clinical specialties" },
    ],
  },
  faq: {
    title: "Before your first visit",
    items: [],
  },
  contact: {
    title: "Contact us",
    showPhone: true,
    showEmail: true,
    showAddress: true,
    showHours: true,
    bookingCtaText: "Book Now",
    mapEmbedUrl: "",
  },
  sections: defaultSections(),
};

export const DEFAULT_THEME: WebsiteTheme = {
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

export const DEFAULT_WIDGET: WebsiteWidgetContent = {
  enabled: true,
  position: "bottom-right",
  language: "en",
  colorMode: "brand",
  color: DEFAULT_THEME.primaryColor,
};

export const DEFAULT_SEO: WebsiteSeo = {
  title: "",
  description: "",
  keywords: "",
  ogImage: "",
  noindex: false,
};

export const DEFAULT_LOCALE: WebsiteLocaleContent = {
  language: "en",
  direction: "ltr",
};

/** Create a fresh WebsiteConfig with defaults. */
export function createDefaultConfig(
  template: WebsiteTemplate = "modern",
): WebsiteConfig {
  return {
    template,
    content: structuredClone(DEFAULT_CONTENT),
    theme: structuredClone(DEFAULT_THEME),
    widget: structuredClone(DEFAULT_WIDGET),
    seo: structuredClone(DEFAULT_SEO),
    locale: structuredClone(DEFAULT_LOCALE),
  };
}

/**
 * Merge a stored config over the defaults.
 *
 * Every website row predates at least one of these slots, so a plain cast would
 * leave `config.content.faq` undefined on an existing clinic and crash the
 * first render. Merging one level deep per slot is enough: the slots themselves
 * are flat, and `sections` is replaced wholesale rather than merged (a stored
 * list missing a newer section id is rebuilt from `defaultSections()`).
 */
export function normalizeWebsiteConfig(input: {
  template?: string | null;
  content?: unknown;
  theme?: unknown;
  widget?: unknown;
  seo?: unknown;
  locale?: unknown;
}): WebsiteConfig {
  const base = createDefaultConfig(
    (input.template as WebsiteTemplate | undefined) ?? "modern",
  );

  const content = (input.content ?? {}) as Partial<WebsiteContent>;
  const theme = (input.theme ?? {}) as Partial<WebsiteTheme>;
  const widget = (input.widget ?? {}) as Partial<WebsiteWidgetContent>;
  const seo = (input.seo ?? {}) as Partial<WebsiteSeo>;
  const locale = (input.locale ?? {}) as Partial<WebsiteLocaleContent>;

  return {
    template: base.template,
    content: {
      ...base.content,
      ...content,
      hero: { ...base.content.hero, ...content.hero },
      doctors: { ...base.content.doctors, ...content.doctors },
      about: { ...base.content.about, ...content.about },
      booking: { ...base.content.booking, ...content.booking },
      experience: { ...base.content.experience, ...content.experience },
      faq: { ...base.content.faq, ...content.faq },
      contact: { ...base.content.contact, ...content.contact },
      sections: Array.isArray(content.sections) && content.sections.length > 0
        ? mergeSections(content.sections)
        : base.content.sections,
    },
    theme: { ...base.theme, ...theme },
    widget: { ...base.widget, ...widget },
    seo: { ...base.seo, ...seo },
    locale: { ...base.locale, ...locale },
  };
}

/**
 * Re-key a stored section list onto the current library.
 *
 * Unknown ids are dropped (a section type that no longer exists must not render
 * as an empty gap) and ids missing from storage are appended with their
 * defaults. Order is read from `order` when the stored list is sorted, and falls
 * back to array position — so a clinic that dragged Doctors above Hero gets
 * exactly that page back, while a list saved before drag & drop existed (or one
 * with no usable `order` at all) still renders in the canonical sequence.
 */
function mergeSections(stored: WebsiteSectionConfig[]): WebsiteSectionConfig[] {
  const usable = stored
    .filter(
      (section): section is WebsiteSectionConfig =>
        typeof section?.id === "string" &&
        typeof section?.order === "number" &&
        Number.isFinite(section.order) &&
        SECTION_LIBRARY.some((kind) => kind.id === section.id),
    )
    .sort((a, b) => a.order - b.order);

  const defaults = defaultSections();
  const known = new Map(usable.map((section) => [section.id, section]));
  const merged = usable.map((section) => ({
    ...defaults.find((entry) => entry.id === section.id)!,
    ...section,
  }));

  // Anything the clinic never had sits after what they did have, in library
  // order — an addition to the library should extend the page, not shuffle it.
  for (const fallback of defaults) {
    if (!known.has(fallback.id)) merged.push(fallback);
  }

  return merged.map((section, index) => ({ ...section, order: index }));
}

/**
 * Read a stored `websites` row into a complete config.
 *
 * Lives here rather than in the server action module because that file carries
 * `"use server"`, which permits only async exports — a plain function exported
 * from it fails the build.
 */
export function configFromWebsite(row: {
  template?: string | null;
  content_json?: unknown;
  theme_json?: unknown;
  widget_json?: unknown;
  seo_json?: unknown;
  locale_json?: unknown;
}): WebsiteConfig {
  return normalizeWebsiteConfig({
    template: row.template,
    content: row.content_json,
    theme: row.theme_json,
    widget: row.widget_json,
    seo: row.seo_json,
    locale: row.locale_json,
  });
}

// ---------------------------------------------------------------------------
// Presentation helpers (shared by the builder and the public renderer)
// ---------------------------------------------------------------------------

export const DAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** Writing direction for a language. Urdu and Arabic are right-to-left. */
export function directionForLanguage(
  language: WebsiteLanguage,
): "ltr" | "rtl" {
  return language === "en" ? "ltr" : "rtl";
}

const CORNER_RADIUS: Record<WebsiteTheme["cornerStyle"], string> = {
  sharp: "0px",
  soft: "10px",
  round: "9999px",
};

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/**
 * The accent colour the floating assistant should paint itself with on this
 * site.
 *
 * Resolved server-side and handed to `widget.js` as `data-color`, because the
 * settings endpoint only knows the clinic-wide default and has no idea what
 * brand colour a particular website uses. A `custom` value that somehow failed
 * validation falls back to the brand colour rather than shipping an unusable
 * value into the embed.
 */
export function resolveWidgetColor(
  theme: WebsiteTheme,
  widget: WebsiteWidgetContent,
): string {
  if (widget.colorMode === "custom" && HEX_COLOR.test(widget.color)) {
    return widget.color;
  }
  return HEX_COLOR.test(theme.primaryColor)
    ? theme.primaryColor
    : DEFAULT_THEME.primaryColor;
}

/**
 * Turn theme choices into the handful of CSS custom properties the templates
 * read. Kept as inline custom properties rather than Tailwind classes because
 * the values are chosen per clinic at runtime and cannot exist in the build.
 */
export function themeCssVars(theme: WebsiteTheme): Record<string, string> {
  return {
    "--site-primary": theme.primaryColor,
    "--site-ink": theme.textColor,
    "--site-radius": CORNER_RADIUS[theme.cornerStyle],
    "--site-font": theme.fontFamily,
    "--site-heading-font": headingFontStack(theme),
  };
}

/**
 * Heading face for a theme.
 *
 * Two families at most, per the type guidance — a site reads as designed when
 * the pairing is deliberate, and five Google fonts is how a site reads as
 * assembled. Display choices are stack-only, so a clinic needs no font request
 * to try one.
 */
function headingFontStack(theme: WebsiteTheme): string {
  switch (theme.headingFont) {
    case "serif":
      return 'Georgia, "Times New Roman", serif';
    case "wide":
      return '"Trebuchet MS", "Segoe UI", sans-serif';
    case "humanist":
      return '"Gill Sans", "Segoe UI", sans-serif';
    default:
      return theme.fontFamily;
  }
}

/**
 * Class for the primary CTA.
 *
 * Shape comes from `theme.cornerStyle` alone so the two controls stay
 * orthogonal — a clinic that wants sharp buttons does not also have to accept
 * square cards. `buttonStyle` only chooses the treatment.
 */
export function buttonClass(theme: WebsiteTheme): string {
  const base =
    "inline-flex items-center justify-center gap-2 px-7 py-3 text-sm font-semibold transition";
  const radius =
    theme.cornerStyle === "sharp"
      ? "rounded-none"
      : theme.cornerStyle === "round"
        ? "rounded-2xl"
        : "rounded-[var(--site-radius)]";

  switch (theme.buttonStyle) {
    case "soft":
      return `${base} ${radius} border border-white/40 bg-white/15 text-white hover:bg-white/25`;
    case "outline":
      return `${base} ${radius} border-2 border-[var(--site-primary)] bg-transparent text-[var(--site-primary)] hover:bg-[var(--site-primary)]/10`;
    case "inverse":
      return `${base} ${radius} bg-white text-[var(--site-primary)] hover:bg-white/90`;
    default:
      return `${base} ${radius} bg-[var(--site-primary)] text-white hover:opacity-90`;
  }
}
