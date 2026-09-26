/** Application-wide constants shared between client and server. */

import type {
  GrowthPostStatus,
  PatientBillStatus,
  PatientBillType,
  PatientPaymentMethod,
} from "@/types/database";

/** Route groups used by middleware and redirect logic. */
export const APP_ROUTES = {
  auth: {
    login: "/login",
    signup: "/signup",
    verify: "/verify",
    forgotPassword: "/forgot-password",
    resetPassword: "/reset-password",
  },
  app: {
    dashboard: "/app/dashboard",
    clinicNew: "/app/clinic/new",
    appointments: "/app/appointments",
    consultation: "/app/consultation",
    calendar: "/app/calendar",
    inbox: "/app/inbox",
    patients: "/app/patients",
    services: "/app/services",
    doctors: "/app/doctors",
    availability: "/app/availability",
    aiSettings: "/app/ai-settings",
    aiTest: "/app/ai-test",
    settings: "/app/settings",
    team: "/app/settings/team",
    website: "/app/website",
    growthAgent: "/app/growth-agent",
    patientBilling: "/app/patient-billing",
    billing: "/app/billing",
    billingCheckout: "/app/billing/checkout",
    adminBilling: "/app/admin/billing",
    adminPaymentMethods: "/app/admin/billing/payment-methods",
  },
  callback: "/auth/callback",
} as const;

/**
 * App-shell navigation, shown as the left sidebar of every /app/* page.
 * The former separate "AI" (/app/ai-test) entry is grouped with the AI
 * settings route into a single "AI Settings" item whose page exposes both
 * former pages as tabs.
 */
export const APP_NAV_SECTIONS = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: APP_ROUTES.app.dashboard }],
  },
  {
    label: "Clinical",
    items: [
      { label: "Appointment", href: APP_ROUTES.app.appointments },
      { label: "Patient Billing", href: APP_ROUTES.app.patientBilling },
      { label: "Calendar", href: APP_ROUTES.app.calendar },
      { label: "Inbox", href: APP_ROUTES.app.inbox },
      { label: "Patients", href: APP_ROUTES.app.patients },
    ],
  },
  {
    label: "Configuration",
    items: [
      { label: "Doctors", href: APP_ROUTES.app.doctors },
      { label: "AI Agent", href: APP_ROUTES.app.aiSettings },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "Website", href: APP_ROUTES.app.website },
      { label: "Growth Agent", href: APP_ROUTES.app.growthAgent },
      { label: "Billing", href: APP_ROUTES.app.billing },
      { label: "Settings", href: APP_ROUTES.app.settings },
    ],
  },
] as const;

/** Flat list of every sidebar nav item, derived from the sections above. */
export const APP_NAV_ITEMS: ReadonlyArray<{
  label: string;
  href: string;
}> = APP_NAV_SECTIONS.flatMap((section) => [...section.items]);

/** Weekday order (0 = Monday ... 6 = Sunday) matching `day_of_week`. */
export const WEEKDAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/**
 * Role names that may manage clinic data (services, availability, settings).
 * `staff` members are read-only.
 */
export const CLINIC_WRITE_ROLES = ["owner", "admin"] as const;

/**
 * Roles that work the clinical floor (patients, appointments). In Phase 3 all
 * members — including `staff` — manage these, mirroring the RLS policy that
 * any member can read/write patients and appointments.
 */
export const CLINICAL_ROLES = ["owner", "admin", "staff"] as const;

/**
 * Appointment status display metadata: stable DB enum value -> label and badge
 * styling. A cancelled appointment occupies its slot's time but is ignored by
 * availability checks; `no_show` frees the time.
 */
export const APPOINTMENT_STATUS_META: Record<
  "pending" | "confirmed" | "completed" | "cancelled" | "no_show",
  { label: string; badge: string }
> = {
  pending: { label: "Pending", badge: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  confirmed: { label: "Confirmed", badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  completed: { label: "Completed", badge: "bg-slate-100 text-slate-700 ring-slate-500/20" },
  cancelled: { label: "Cancelled", badge: "bg-red-50 text-red-700 ring-red-600/20" },
  no_show: { label: "No-show", badge: "bg-orange-50 text-orange-700 ring-orange-600/20" },
} as const;

/**
 * Subscription status display metadata. Maps DB status to label and badge class.
 */
export const SUBSCRIPTION_STATUS_META: Record<
  string,
  { label: string; badge: string }
> = {
  pending_payment: { label: "Pending Payment", badge: "bg-slate-100 text-slate-700 ring-slate-500/20" },
  payment_submitted: { label: "Under Review", badge: "bg-blue-50 text-blue-700 ring-blue-600/20" },
  under_review: { label: "Under Review", badge: "bg-blue-50 text-blue-700 ring-blue-600/20" },
  approved: { label: "Approved", badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  active: { label: "Active", badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  expiring: { label: "Expiring Soon", badge: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  expired: { label: "Expired", badge: "bg-red-50 text-red-700 ring-red-600/20" },
  rejected: { label: "Rejected", badge: "bg-red-50 text-red-700 ring-red-600/20" },
} as const;

/**
 * Payment submission status display metadata.
 */
export const PAYMENT_STATUS_META: Record<
  string,
  { label: string; badge: string }
> = {
  pending: { label: "Pending", badge: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  approved: { label: "Approved", badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  rejected: { label: "Rejected", badge: "bg-red-50 text-red-700 ring-red-600/20" },
  expired: { label: "Expired", badge: "bg-slate-100 text-slate-700 ring-slate-500/20" },
} as const;

/** Visit status display metadata (Phase 17). */
export const VISIT_STATUS_META: Record<
  string,
  { label: string; badge: string }
> = {
  scheduled: { label: "Scheduled", badge: "bg-blue-50 text-blue-700 ring-blue-600/20" },
  checked_in: { label: "Checked In", badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  waiting: { label: "Waiting", badge: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  in_consultation: { label: "In Consultation", badge: "bg-purple-50 text-purple-700 ring-purple-600/20" },
  completed: { label: "Completed", badge: "bg-slate-100 text-slate-700 ring-slate-500/20" },
} as const;

/**
 * Colour treatment for a visit status: amber is "still waiting", teal is "in
 * the room", green is "done". One vocabulary, shared by the queue list, the
 * collapsed token rail and the fixed record header, so a status never means
 * two different colours depending on where you are looking at it.
 */
const VISIT_STATUS_TONE = {
  scheduled: {
    pill: "border-status-info/40 bg-status-info/10 text-status-info",
    dot: "bg-status-info",
    ring: "ring-status-info",
  },
  waiting: {
    pill: "border-status-warning/40 bg-status-warning/10 text-status-warning",
    dot: "bg-status-warning",
    ring: "ring-status-warning",
  },
  checked_in: {
    pill: "border-status-warning/40 bg-status-warning/10 text-status-warning",
    dot: "bg-status-warning",
    ring: "ring-status-warning",
  },
  in_consultation: {
    pill: "border-primary/40 bg-primary/10 text-primary",
    dot: "bg-primary",
    ring: "ring-primary",
  },
  completed: {
    pill: "border-status-success/40 bg-status-success/10 text-status-success",
    dot: "bg-status-success",
    ring: "ring-status-success",
  },
} as const;

const VISIT_STATUS_TONE_FALLBACK = {
  pill: "border-text-muted/30 bg-app text-text-secondary",
  dot: "bg-text-muted",
  ring: "ring-text-muted/25",
} as const;

export function visitStatusTone(status: string | undefined) {
  return (
    VISIT_STATUS_TONE[status as keyof typeof VISIT_STATUS_TONE] ??
    VISIT_STATUS_TONE_FALLBACK
  );
}

/** Payment status display metadata for visit check-in (Phase 17). */
export const VISIT_PAYMENT_STATUS_META: Record<
  string,
  { label: string; badge: string }
> = {
  pending: { label: "Payment Pending", badge: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  collected_pre: { label: "Paid (Pre)", badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  collected_post: { label: "Paid (Post)", badge: "bg-blue-50 text-blue-700 ring-blue-600/20" },
  not_required: { label: "No Payment", badge: "bg-slate-100 text-slate-700 ring-slate-500/20" },
} as const;

/**
 * Patient bill status display metadata (Phase 19). Keyed by the DB enum so a
 * new status is a compile error here rather than a blank badge at runtime.
 * `waived`/`cancelled` were added in migration 0029.
 */
export const PATIENT_BILL_STATUS_META: Record<
  PatientBillStatus,
  { label: string; badge: string }
> = {
  pending: { label: "Pending", badge: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  paid: { label: "Paid", badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  partially_paid: { label: "Partial", badge: "bg-blue-50 text-blue-700 ring-blue-600/20" },
  waived: { label: "Waived", badge: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  cancelled: { label: "Cancelled", badge: "bg-slate-100 text-slate-600 ring-slate-500/20" },
} as const;

/**
 * Patient bill type display metadata (Phase 19). Drives the Bill Type capsules
 * in the create modal and the SERVICE fallback label in the transactions table
 * (a bill can exist with items — the label only shows when there are none).
 */
export const PATIENT_BILL_TYPE_META: Record<
  PatientBillType,
  { label: string; badge?: string }
> = {
  consultation: { label: "Consultation" },
  procedure: { label: "Procedure" },
  other: { label: "Other" },
} as const;

/**
 * Patient payment method display metadata (Phase 19). Covers every value in the
 * DB enum, including `upi`, so historical rows always render a label.
 *
 * This is a LABEL map, not a picker source — iterating it would offer `upi`,
 * which is out of market (decision D8). Build pickers from
 * `PATIENT_PAYMENT_METHODS_UI` and look up the meta by key.
 */
export const PATIENT_PAYMENT_METHOD_META: Record<
  PatientPaymentMethod,
  { label: string; icon?: string }
> = {
  cash: { label: "Cash", icon: "Banknote" },
  card: { label: "Card", icon: "CreditCard" },
  jazzcash: { label: "JazzCash", icon: "Smartphone" },
  easypaisa: { label: "EasyPaisa", icon: "Smartphone" },
  bank_transfer: { label: "Bank Transfer", icon: "Landmark" },
  upi: { label: "UPI", icon: "Smartphone" },
  waive: { label: "Waive (Free)", icon: "Ban" },
} as const;

/**
 * Growth Agent (Phase 24) — Google Business Profile post status metadata.
 *
 * Keyed by the DB enum so an unrecognised status is a compile error here rather
 * than a blank badge at runtime. `failed` is the only status with a second
 * colour in the queue (it is the one a human has to act on), which is why the
 * map carries a `dot` as well as a `badge`.
 */
export const GROWTH_POST_STATUS_META: Record<
  GrowthPostStatus,
  { label: string; badge: string; dot: string }
> = {
  draft: {
    label: "Draft",
    badge: "bg-slate-100 text-slate-700 ring-slate-500/20",
    dot: "bg-slate-400",
  },
  scheduled: {
    label: "Scheduled",
    badge: "bg-sky-50 text-sky-700 ring-sky-600/20",
    dot: "bg-status-info",
  },
  published: {
    label: "Published",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    dot: "bg-status-success",
  },
  failed: {
    label: "Failed",
    badge: "bg-red-50 text-red-700 ring-red-600/20",
    dot: "bg-status-destructive",
  },
} as const;

/**
 * Range selector for the Growth Agent metrics. Each range carries its own
 * window length in days and its comparison label, so the delta under every
 * number is derived from real rows rather than asserted in the component.
 *
 * `window` must stay <= `compareWindow` so the comparison period is always
 * fully covered by the rows the query fetches.
 */
export const GROWTH_METRIC_RANGES = [
  { id: "7d", label: "Last 7 days", window: 7, compareWindow: 7 },
  { id: "30d", label: "Last 30 days", window: 30, compareWindow: 30 },
  { id: "90d", label: "Last 90 days", window: 90, compareWindow: 90 },
  { id: "ytd", label: "Year to date", window: 0, compareWindow: 0 },
] as const;

export type GrowthMetricRangeId =
  (typeof GROWTH_METRIC_RANGES)[number]["id"];

/** Posting-frequency labels. Values must match `growth_settings_schema`. */
export const GROWTH_FREQUENCY_LABELS = [
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every two weeks" },
  { value: "monthly", label: "Every month" },
] as const;

/** Timezone options offered in the clinic forms. */
export const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/**
 * Clinic slug format — must match the CHECK constraint in
 * `0001_clinics_clinic_members.sql`. Kept here so Zod can reject invalid
 * slugs before they ever reach the database.
 */
export const CLINIC_SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,60}[a-z0-9])?$/;

/** Reserved slugs rejected at the app layer (see 0001 design note). */
export const RESERVED_CLINIC_SLUGS = new Set([
  "admin",
  "administrator",
  "api",
  "auth",
  "app",
  "www",
  "support",
  "help",
  "billing",
  "account",
  "settings",
  "dashboard",
  "login",
  "signup",
  "verify",
  "forgot-password",
  "reset-password",
  "clinic",
  "clinics",
  "invite",
  "invites",
]);

/** Normalize a raw clinic name/slug input into a url-safe slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

/**
 * App-level specialty catalogue shown in the Add/Edit Doctor form (Phase 20).
 * Hand-picked vs. generic titles map to a headline (e.g. a cover title on the
 * booking surface) via `DOCTOR_SPECIALTY_TITLES`; anything else is free text.
 */
export const DOCTOR_SPECIALTIES = [
  "Cardiology",
  "Dermatology",
  "Dentistry",
  "ENT",
  "Endocrinology",
  "Family Medicine",
  "Gastroenterology",
  "General Practice",
  "General Surgery",
  "Gynecology & Obstetrics",
  "Hematology",
  "Internal Medicine",
  "Nephrology",
  "Neurology",
  "Nutrition & Dietetics",
  "Oncology",
  "Ophthalmology",
  "Orthopedics",
  "Pediatrics",
  "Physical Therapy & Rehabilitation",
  "Psychiatry",
  "Pulmonology",
  "Radiology",
  "Rheumatology",
  "Sports Medicine",
  "Urology",
  "Veterinary",
  "Public Health",
  "Homeopathy",
  "Ayurveda",
] as const;

/**
 * Headline titles for well-known specialties. When a doctor's specialty isn't
 * in this map the title falls back to the specialty text itself.
 */
export const DOCTOR_SPECIALTY_TITLES: Record<string, string> = {
  Cardiology: "Cardiologist",
  Dermatology: "Dermatologist",
  Dentistry: "Dentist",
  ENT: "ENT Specialist",
  Endocrinology: "Endocrinologist",
  "Family Medicine": "Family Physician",
  Gastroenterology: "Gastroenterologist",
  "General Practice": "General Practitioner",
  "General Surgery": "General Surgeon",
  "Gynecology & Obstetrics": "Gynecologist",
  Hematology: "Hematologist",
  "Internal Medicine": "Internal Medicine Specialist",
  Nephrology: "Nephrologist",
  Neurology: "Neurologist",
  "Nutrition & Dietetics": "Dietitian",
  Oncology: "Oncologist",
  Ophthalmology: "Ophthalmologist",
  Orthopedics: "Orthopedic Surgeon",
  Pediatrics: "Pediatrician",
  "Physical Therapy & Rehabilitation": "Physiotherapist",
  Psychiatry: "Psychiatrist",
  Pulmonology: "Pulmonologist",
  Radiology: "Radiologist",
  Rheumatology: "Rheumatologist",
  "Sports Medicine": "Sports Medicine Specialist",
  Urology: "Urologist",
  Veterinary: "Veterinarian",
  "Public Health": "Public Health Specialist",
  Homeopathy: "Homeopath",
  Ayurveda: "Ayurvedic Practitioner",
};

/**
 * The absolute site URL, used as the Supabase `redirectTo` base so auth
 * emails (verification, recovery) point back at the app. Falls back to
 * localhost for local development.
 */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}
