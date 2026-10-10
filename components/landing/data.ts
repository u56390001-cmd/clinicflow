import {
  Calendar,
  CreditCard,
  FileText,
  MessageCircle,
  Monitor,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Marketing copy for the public landing page (`/`). Content mirrors the
 * approved landing page v2 mockup. Product screenshots live in
 * `public/marketing/*.webp` and are referenced by path so they are trivial to
 * swap for fresh captures.
 */

export const LANDING_NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#product", label: "Product Screens" },
  { href: "#website", label: "Website Builder" },
  { href: "#how", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
] as const;

export const HERO_CHECKS = [
  "Built for independent doctors",
  "No installation required",
  "Your clinic, your data",
] as const;

export const TRUST_ITEMS = [
  "AI receptionist",
  "Online booking",
  "Secure clinic data",
] as const;

export type Feature = {
  icon: LucideIcon;
  title: string;
  blurb: string;
};

export const FEATURES: Feature[] = [
  {
    icon: Calendar,
    title: "Appointment Management",
    blurb: "Organize bookings, doctor schedules, availability and reminders in one calendar.",
  },
  {
    icon: Users,
    title: "Patient Records",
    blurb: "Keep patient histories, documents, visits and clinical notes easy to access.",
  },
  {
    icon: MessageCircle,
    title: "AI Receptionist",
    blurb: "Answer common questions and help patients book through connected channels.",
  },
  {
    icon: Monitor,
    title: "Smart TV Queue",
    blurb: "Manage check-in and tokens with a clear waiting-room display.",
  },
  {
    icon: FileText,
    title: "Consultation & Prescriptions",
    blurb: "Record consultations, organize clinical details and create prescriptions.",
  },
  {
    icon: CreditCard,
    title: "Billing & Payments",
    blurb: "Track clinic invoices and patient payments from a central workspace.",
  },
];

export type ShowcaseItem = {
  src: string;
  alt: string;
  title: string;
  blurb: string;
};

/**
 * Real product screenshots (approved landing page v2). The images themselves
 * are the source of truth — replace files in `public/marketing/` and re-capture
 * without touching any code.
 */
export const SHOWCASE: ShowcaseItem[] = [
  {
    src: "/marketing/appointments.webp",
    alt: "Appointments management screen",
    title: "Appointments",
    blurb: "Daily appointment status, patient scheduling and consultation management.",
  },
  {
    src: "/marketing/calendar.webp",
    alt: "Doctor appointment calendar screen",
    title: "Doctor Calendar",
    blurb: "Doctor schedules and time slots organized in one calendar.",
  },
  {
    src: "/marketing/patients.webp",
    alt: "Patient record and clinical workspace",
    title: "Patient Workspace",
    blurb: "Patient information, health alerts, visit history and vital signs.",
  },
  {
    src: "/marketing/booking.webp",
    alt: "Public online appointment booking form",
    title: "Online Booking",
    blurb: "Service selection, available appointment slots and patient intake.",
  },
  {
    src: "/marketing/whatsapp.webp",
    alt: "WhatsApp Business integration setup",
    title: "WhatsApp Integration",
    blurb: "Connect your clinic's WhatsApp Business account and configure messaging.",
  },
  {
    src: "/marketing/queue.webp",
    alt: "Real waiting room TV queue display",
    title: "Smart TV Queue",
    blurb: "A live display for waiting-room patient flow and consultations.",
  },
];

export const AI_BULLETS = [
  "Answers routine fee, timing and service questions",
  "Helps patients find available appointment slots",
  "Uses your clinic's configured information",
  "Escalates conversations to your team",
] as const;

export const AI_NOTE =
  "Requires your clinic's connected WhatsApp and AI provider accounts. Provider usage charges are separate.";

/**
 * Image for the AI Receptionist band. Currently shows the real WhatsApp
 * Business setup screen (accurate: this is where the AI receptionist is
 * configured). To swap in a real conversation capture later, replace the file
 * at `/marketing/whatsapp.webp` (or point `src` at a new asset) — no other
 * code change is needed.
 */
export const AI_BAND_IMAGE = {
  src: "/marketing/whatsapp.webp",
  alt: "Actual MedBook AI WhatsApp Business integration setup screen, where the AI receptionist is configured",
  caption:
    "Actual WhatsApp Business setup screen — the AI receptionist is configured here from the WhatsApp module.",
};

export const WEBSITE_BULLETS = [
  "No-code website builder and editable sections",
  "Doctor and service information from your clinic",
  "Custom domain and online booking",
  "Embeddable chat widget and booking experience",
] as const;

export const QUEUE_BULLETS = [
  "Token-based patient flow",
  "Smart TV waiting-room display",
  "Connected reception and consultation workflows",
] as const;

export type Step = {
  title: string;
  blurb: string;
};

export const STEPS: Step[] = [
  { title: "Create your clinic", blurb: "Sign up and enter your clinic details." },
  {
    title: "Add doctors & services",
    blurb: "Configure schedules, staff and your service list.",
  },
  {
    title: "Start managing appointments",
    blurb: "Use your dashboard and share your booking link.",
  },
];

export type Faq = { q: string; a: string };

export const FAQS: Faq[] = [
  {
    q: "Can patients book appointments online?",
    a: "Yes. Clinics can share a public booking page connected to doctor schedules and availability.",
  },
  {
    q: "Can I connect my own domain to my clinic website?",
    a: "The website builder supports custom-domain functionality. Availability may depend on your subscription plan.",
  },
  {
    q: "How does the WhatsApp AI receptionist work?",
    a: "Your clinic connects its own supported WhatsApp and AI provider credentials. The assistant can answer configured questions and support appointment workflows. Provider charges are separate from your MedBook AI subscription.",
  },
  {
    q: "How do I pay for a subscription?",
    a: "The existing billing checkout supports manual payment proof submission for bank transfer, JazzCash and Easypaisa. Your payment must be verified before activation.",
  },
  {
    q: "Can staff have different access permissions?",
    a: "Yes. Clinic team roles and permissions control access to relevant features and patient information.",
  },
  {
    q: "Is my clinic's patient data separated from other clinics?",
    a: "MedBook AI uses clinic-scoped access controls and database row-level security to separate tenant records. This does not replace your clinic's own privacy and data-handling responsibilities.",
  },
];

/**
 * Pricing display copy (approved mockup). Prices themselves are not hard-coded:
 * PricingSection looks up the live `subscription_plans` row by `code` and only
 * falls back to these figures if the public read fails.
 */
export type PlanMeta = {
  code: string;
  name: string;
  description: string;
  bullets: string[];
  popular: boolean;
  ctaLabel: string;
};

export const PLAN_META: PlanMeta[] = [
  {
    code: "starter",
    name: "Starter",
    description: "For independent doctors and small clinics.",
    bullets: [
      "Appointment management",
      "Patient CRM (up to 100)",
      "Clinic management dashboard",
      "Digital patient records",
    ],
    popular: false,
    ctaLabel: "Choose Starter",
  },
  {
    code: "professional",
    name: "Professional",
    description: "For growing clinics that want more connected tools.",
    bullets: [
      "Appointment management",
      "Patient CRM (up to 500)",
      "Website builder & custom domain*",
      "AI receptionist integration*",
      "Smart TV queue*",
    ],
    popular: true,
    ctaLabel: "Choose Professional →",
  },
  {
    code: "enterprise",
    name: "Enterprise",
    description: "For larger practices with expanded requirements.",
    bullets: [
      "Patient CRM (unlimited)",
      "Expanded clinic management",
      "Website and integrations*",
      "Additional capabilities subject to plan setup",
    ],
    popular: false,
    ctaLabel: "Choose Enterprise",
  },
];

export const FALLBACK_PLAN_PRICES: Record<string, number> = {
  starter: 2999,
  professional: 7999,
  enterprise: 19999,
};

export const PRICING_NOTE =
  "*Professional and Enterprise features marked with * are add-on modules available on those plans. Prices reflect your active billing plans — choose a plan to continue to signup and the billing checkout.";