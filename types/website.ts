import type { WebsiteTemplate } from "@/types/database";

/**
 * Shared website configuration object consumed by all templates.
 * The template is purely a presentational layer — switching templates
 * never destroys or modifies this data.
 */

export type WebsiteSectionId = "hero" | "about" | "services" | "gallery" | "contact";

export type WebsiteSectionConfig = {
  id: WebsiteSectionId;
  label: string;
  visible: boolean;
  order: number;
};

export type WebsiteHeroContent = {
  headline: string;
  description: string;
  ctaText: string;
  ctaUrl: string;
  /** Optional secondary CTA label — renders as a tel: link to the clinic phone. */
  ctaSecondaryLabel?: string;
};

export type WebsiteAboutContent = {
  bio: string;
  credentials: string;
  /** Dynamic certification chips (e.g. "Board Certified", "ADA Member"). */
  certifications?: string[];
};

export type WebsiteContactContent = {
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
  about: WebsiteAboutContent;
  contact: WebsiteContactContent;
  sections: WebsiteSectionConfig[];
};

export type WebsiteTheme = {
  primaryColor: string;
  fontFamily: string;
};

export type WebsiteConfig = {
  template: WebsiteTemplate;
  content: WebsiteContent;
  theme: WebsiteTheme;
};

/** Default section configuration — all visible, in canonical order. */
export const DEFAULT_SECTIONS: WebsiteSectionConfig[] = [
  { id: "hero", label: "Hero", visible: true, order: 0 },
  { id: "about", label: "About", visible: true, order: 1 },
  { id: "services", label: "Services", visible: true, order: 2 },
  { id: "gallery", label: "Gallery", visible: true, order: 3 },
  { id: "contact", label: "Contact", visible: true, order: 4 },
];

/** Default website content — blank fields for the doctor to fill in. */
export const DEFAULT_CONTENT: WebsiteContent = {
  hero: {
    headline: "",
    description: "",
    ctaText: "Book an Appointment",
    ctaUrl: "",
    ctaSecondaryLabel: "",
  },
  about: {
    bio: "",
    credentials: "",
    certifications: [],
  },
  contact: {
    showPhone: true,
    showEmail: true,
    showAddress: true,
    showHours: true,
    bookingCtaText: "Book Now",
    mapEmbedUrl: "",
  },
  sections: DEFAULT_SECTIONS,
};

/** Default theme values. */
export const DEFAULT_THEME: WebsiteTheme = {
  primaryColor: "#0D9488",
  fontFamily: "Inter",
};

/** Create a fresh WebsiteConfig with defaults. */
export function createDefaultConfig(
  template: WebsiteTemplate = "modern",
): WebsiteConfig {
  return {
    template,
    content: structuredClone(DEFAULT_CONTENT),
    theme: structuredClone(DEFAULT_THEME),
  };
}

/** Day-of-week labels for opening hours display. */
export const DAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
