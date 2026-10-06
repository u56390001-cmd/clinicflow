import {
  Baby,
  Bandage,
  Bone,
  Brain,
  Dumbbell,
  Eye,
  Flower2,
  HeartPulse,
  Leaf,
  Microscope,
  Pill,
  Scan,
  Sparkles,
  Stethoscope,
  Syringe,
  TestTube,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Primitives shared by every section of a clinic website.
 *
 * These live apart from `site-sections.tsx` so that the shell (header, footer,
 * hero) can reach them without importing the section bodies, and vice versa.
 * Types are re-exported from `site-sections.tsx` so every existing import path
 * in the app keeps working.
 *
 * Everything here is derived from data the clinic already has. Nothing is
 * invented for the design's benefit: an "available today" line has to be true,
 * or the page is lying to someone deciding whether to travel across town.
 */

// ---------------------------------------------------------------------------
// Record shapes (the site's view of ClinicFlow data)
// ---------------------------------------------------------------------------

export type SiteImage = {
  id: string;
  kind: "hero" | "doctor" | "gallery";
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
  /* Fees are optional because not every clinic sets them; the card omits the
     fee row rather than showing a zero when the column is null. */
  consultation_fee?: number | null;
  follow_up_fee?: number | null;
  follow_up_valid_for?: number | null;
  follow_up_period?: "days" | "weeks" | "months" | null;
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
  /**
   * Static discriminator for any DOM id a section has to mint — the same
   * `idPrefix` the templates take, exposed on the context so a section body can
   * build unique ids without another prop threaded through `renderBody`.
   *
   * It matters for the doctor card's slot chips: the builder mounts this
   * renderer twice at once, and a bare `id="dr-1-slot-0"` would bind each label
   * to whichever copy came first in the DOM — usually the preview hidden behind
   * the fullscreen overlay, so clicking a chip there would appear to do nothing.
   * Omitted on the public site, where one copy exists.
   */
  idPrefix?: string;
};

// ---------------------------------------------------------------------------
// Booking links
// ---------------------------------------------------------------------------

/**
 * `openWidgetFallback` and `SiteCta` now live in `site-cta.tsx`.
 *
 * They are the only interactive things in this file - `SiteCta` renders an
 * `onClick` - and a module with a handler in it cannot stay on the server side
 * of the RSC boundary: the doctor bio page renders `SiteCta` directly, and
 * React refused to serialise the handler across. Both are re-exported here so
 * every import path this file already offered keeps working.
 */
export { openWidgetFallback, SiteCta } from "@/components/website/site-cta";

/**
 * WhatsApp link from the clinic phone.
 *
 * The plan asks for a WhatsApp route in the booking section "if available".
 * There is no WhatsApp field in the clinic record and inventing a config slot
 * for it would mean a migration plus inspector work for a channel most clinics
 * here do not use, so the link is derived from the phone number they already
 * published and simply omitted when they have not published one. Digits only —
 * `wa.me` rejects spaces, brackets and a leading `+`.
 */
export function whatsappHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? `https://wa.me/${digits}` : null;
}

// ---------------------------------------------------------------------------
// Value formatting
// ---------------------------------------------------------------------------

/** `45 min`, or `1 hr 15 min` once it stops being a single round number. */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/**
 * Consultation fee.
 *
 * Grouped thousands and a zero-fee case spelled out, because "Rs 0" on a
 * clinic website reads as a mistake rather than as "free".
 */
export function formatFee(price: number): string {
  if (!Number.isFinite(price)) return "";
  if (price <= 0) return "Free";
  return `Rs ${Math.round(price).toLocaleString("en-PK")}`;
}

/**
 * Pick an icon for a service from its name.
 *
 * The clinic does not categorise its services — there is no icon field, and
 * adding one means a migration and a picker for something that is 90% guessable
 * from the name. Anything unrecognised falls back to a stethoscope rather than
 * a wrong-but-specific glyph, which is the safer way to be unsure.
 */
const SERVICE_ICONS: Array<[RegExp, LucideIcon]> = [
  [/dent|teeth|tooth|oral|orthodon|root\s*canal|braces|cleaning|scale|scaling|extraction|fill/i, Sparkles],
  [/skin|derm|acne|cosmetic|aesthetic|laser|botox|filler|hair|beauty/i, Flower2],
  [/physio|physiotherapy|rehab|post\s*op|sport|injur|pain|back|joint|bone|fractur/i, Dumbbell],
  [/child|paediat|pediatr|baby|infant|vaccin|immunis/i, Baby],
  [/eye|ophthal|vision|cataract|glaucoma|retina/i, Eye],
  [/ent|ear|nose|throat|hearing|sinus|tonsil/i, Wind],
  [/neuro|brain|stroke|epilep|headache|migraine/i, Brain],
  [/cardio|heart|ecg|ekg|blood\s*pressure|hypertens|cholesterol/i, HeartPulse],
  [/orthop|bone|joint|spine|back\s*pain|knee|shoulder/i, Bone],
  [/vaccin|inj|injection|immunis|shot/i, Syringe],
  [/blood|test|laborator|diagnostic|screening|patholog/i, TestTube],
  [/x-?ray|scan|imag|ultrasound|mri|ecg|ekg/i, Scan],
  [/surg|operat|procedure|laperosc|endoscop/i, Bandage],
  [/medic|drug|pharmac|prescri|tablet|capsule/i, Pill],
  [/micro|biolog|lab|dna/i, Microscope],
  [/physician|general|consult|checkup|check-up|family|gp/i, Stethoscope],
  [/homeopath|ayurved|unani|natural|holistic|herb/i, Leaf],
  [/laser|electric|therapy|physio\s*modalit/i, Zap],
];

export function serviceIconFor(name: string): LucideIcon {
  for (const [pattern, icon] of SERVICE_ICONS) {
    if (pattern.test(name)) return icon;
  }
  return Stethoscope;
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

const DAY_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type NextOpening = {
  /** "Today" / "Tomorrow" / "Monday" — as a patient would say it. */
  dayLabel: string;
  /** `9:00 AM – 7:00 PM`, formatted for reading rather than for a database. */
  window: string;
  isToday: boolean;
  /** True only while the clinic is inside its own published hours. */
  isOpenNow: boolean;
};

/**
 * The clinic's next opening window, and whether it is open right now.
 *
 * This is the fact the hero leads with, so it is read from the same
 * `availability_rules` rows the booking flow uses rather than invented — a
 * patient who drives across town on the strength of "Open today until 7 PM" and
 * finds a locked door does not come back.
 *
 * The clock is the render host's, not the clinic's. That is a real limitation
 * (a clinic in another timezone will see its own hours, not the visitor's) and
 * it is why callers render the result inside `suppressHydrationWarning`: the
 * server and the browser can legitimately disagree about what time it is, and a
 * hydration mismatch on the page's loudest claim would be worse than the value
 * settling a frame later.
 */
export function nextOpening(
  rules: SiteAvailabilityRule[],
  now: Date = new Date(),
): NextOpening | null {
  const today = (now.getDay() + 6) % 7;
  const todayRule = rules.find((rule) => rule.day_of_week === today);

  const describe = (rule: SiteAvailabilityRule, dayLabel: string): NextOpening => ({
    dayLabel,
    window: `${formatClock(rule.start_time)} – ${formatClock(rule.end_time)}`,
    isToday: rule.day_of_week === today,
    isOpenNow:
      rule.day_of_week === today && withinHours(rule, now),
  });

  if (todayRule?.enabled) {
    // Already past closing: point at the next day rather than claim they are
    // open, which is the whole reason this line exists.
    if (!withinHours(todayRule, now)) {
      const next = upcomingWindow(rules, today, 1);
      if (next) return next;
    }
    return describe(todayRule, "Today");
  }

  return upcomingWindow(rules, today, 1);
}

/** The first enabled window after `fromDay`, searched over a full week. */
function upcomingWindow(
  rules: SiteAvailabilityRule[],
  fromDay: number,
  offset: number,
): NextOpening | null {
  for (let step = offset; step <= 7; step += 1) {
    const day = (fromDay + step) % 7;
    const rule = rules.find((entry) => entry.day_of_week === day);
    if (rule?.enabled) {
      return {
        dayLabel: step === 1 ? "Tomorrow" : DAY_LONG[day],
        window: `${formatClock(rule.start_time)} – ${formatClock(rule.end_time)}`,
        isToday: false,
        isOpenNow: false,
      };
    }
  }
  return null;
}

/** `HH:MM:SS` from the database to `9:00 AM`. */
function formatClock(value: string): string {
  const [hourPart, minutePart] = value.split(":");
  const hour = Number(hourPart);
  if (!Number.isFinite(hour)) return value.slice(0, 5);
  const suffix = hour >= 12 ? "pm" : "am";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  const minutes = minutePart?.slice(0, 2) ?? "00";
  return minutes === "00"
    ? `${display} ${suffix}`
    : `${display}:${minutes} ${suffix}`;
}

function withinHours(rule: SiteAvailabilityRule, now: Date): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = toMinutes(rule.start_time);
  const end = toMinutes(rule.end_time);
  if (start === null || end === null) return false;
  // A window that crosses midnight (`22:00`–`02:00`) is open on both sides.
  return start <= end ? minutes >= start && minutes <= end : minutes >= start || minutes <= end;
}

function toMinutes(value: string): number | null {
  const [hourPart, minutePart] = value.split(":");
  const hour = Number(hourPart);
  const minute = Number(minutePart ?? "0");
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

/** True when the clinic has published any hours at all. */
export function hasOpeningHours(rules: SiteAvailabilityRule[]): boolean {
  return rules.some((rule) => rule.enabled);
}

export type UpcomingWindow = {
  /** "Today" / "Tomorrow" / "Monday" — as a patient would say it. */
  dayLabel: string;
  /** The day's opening time, `9:00 AM`. */
  time: string;
};

/**
 * The next published openings, as day-plus-time chips.
 *
 * These exist for the doctor card's horizontal chip row, and they are built
 * from `availability_rules` on purpose: that table records when a clinic opens,
 * not which appointments are still free. Chip times are therefore *opening*
 * times — "Today · 9:00 AM" — rather than invented 09:00 / 09:30 / 10:00 slot
 * picks, which would promise the visitor a seat the schema cannot back.
 *
 * Today's window is included only while it is still worth showing: a day whose
 * closing time has passed is skipped, so the first chip is always somewhere a
 * patient can actually go.
 */
export function upcomingWindows(
  rules: SiteAvailabilityRule[],
  count = 4,
  now: Date = new Date(),
): UpcomingWindow[] {
  const today = (now.getDay() + 6) % 7;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const windows: UpcomingWindow[] = [];

  for (let step = 0; step <= 7 && windows.length < count; step += 1) {
    const day = (today + step) % 7;
    const dayLabel = step === 0 ? "Today" : step === 1 ? "Tomorrow" : DAY_LONG[day];

    for (const rule of rules) {
      if (rule.day_of_week !== day || !rule.enabled) continue;
      if (windows.length >= count) break;

      if (step === 0) {
        const start = toMinutes(rule.start_time);
        const end = toMinutes(rule.end_time);
        // A same-day window whose closing time has passed is no longer worth
        // offering. A window that crosses midnight (`22:00`–`02:00`) has
        // `end < start` and is still running on the near side of it, so it
        // survives this check.
        if (start !== null && end !== null && end >= start && nowMinutes > end) {
          continue;
        }
      }

      windows.push({ dayLabel, time: formatClock(rule.start_time) });
    }
  }

  return windows;
}