import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  Subscription,
  SubscriptionPlan,
} from "@/types/database";

/**
 * Clinic entitlements — the single place that answers "what may this clinic
 * do right now?".
 *
 * A plan used to be decoration: `lib/plan-features.ts` was consulted in
 * exactly one place (the integrations actions), the app layout had no gate and
 * the sidebar filtered by role, so a Starter clinic had every module open.
 * This module is the contract that fixes it:
 *
 *   entitlements(clinic) = subscription.state × plan.features   (modules)
 *                        + plan.limits                         (seats)
 *                        + active clinic_addons                (modules + seats)
 *
 * Three rules keep it honest:
 *
 *   1. Entitlements are **derived**, never stored. A clinic does not have a
 *      "has_ai" column — it has a subscription, and what that subscription
 *      buys is computed here. Change the plan, the gates change with it.
 *   2. **One resolver, many callers.** The route guard, the server actions,
 *      the sidebar and the dashboard cards all read the same function, so
 *      they cannot drift apart. A module hidden in the nav but open on a
 *      direct URL is the bug this file exists to prevent.
 *   3. A clinic with **no active subscription** gets none of the gated
 *      modules. "Not paid" is not "paid for everything" — and the UI always
 *      offers the upgrade route, so this is a call to action, not a dead end.
 *
 * The file is imported by the Edge middleware, so it must stay free of
 * Node-only APIs.
 */

/** A module the product sells, named by a key in `subscription_plans.features`. */
export type PlanFeatureKey = string;

/** An add-on slug from the `addons` catalogue. */
export type AddonSlug = string;

/**
 * What a route needs in order to open.
 *
 * `feature` is a plan key, `addon` is an add-on slug. A route with neither is
 * always open (the clinical core).
 */
export type RouteEntitlement = {
  /** Plan feature key required to open the route. */
  feature?: PlanFeatureKey;
  /** Add-on slug required to open the route. */
  addon?: AddonSlug;
  /** Human label used on the upgrade screen. */
  label: string;
  /** One-line description of what the module does, shown when locked. */
  blurb: string;
  /** Where the "get it" button points. */
  upgradeTo: "plan" | "addon";
};

/**
 * The module catalogue: route → entitlement.
 *
 * This is the only list. The route guard, the sidebar and the dashboard read
 * it, so a module can never be locked in one place and open in another.
 * Keys are matched by prefix, so `/app/ai-settings` covers
 * `/app/ai-settings/anything` too.
 */
export const ROUTE_ENTITLEMENTS: Record<string, RouteEntitlement> = {
  "/app/ai-settings": {
    feature: "ai_receptionist",
    label: "AI Receptionist",
    blurb:
      "An assistant that answers your patients' questions and books appointments for you, on your own API key.",
    upgradeTo: "plan",
  },
  "/app/ai-test": {
    feature: "ai_receptionist",
    label: "AI Receptionist",
    blurb:
      "An assistant that answers your patients' questions and books appointments for you, on your own API key.",
    upgradeTo: "plan",
  },
  "/app/website": {
    feature: "website",
    label: "Website builder",
    blurb:
      "A branded website with your services, your doctors and an online booking form.",
    upgradeTo: "plan",
  },
  "/app/booking-page": {
    feature: "online_booking",
    label: "Public booking page",
    blurb:
      "A shareable booking link patients can use to book a slot on any device.",
    upgradeTo: "plan",
  },
  "/app/whatsapp": {
    feature: "whatsapp",
    label: "WhatsApp Business",
    blurb:
      "Connect your clinic's WhatsApp Business number and let the assistant answer and book over WhatsApp.",
    upgradeTo: "plan",
  },
  "/app/engagement": {
    feature: "whatsapp",
    label: "Patient Engagement",
    blurb:
      "Automated WhatsApp reminders, review requests and no-show recovery.",
    upgradeTo: "plan",
  },
  "/app/growth-agent": {
    addon: "growth-agent",
    label: "Growth Agent",
    blurb:
      "Write, schedule and publish Google Business Profile posts to pull new patients in.",
    upgradeTo: "addon",
  },
  "/app/telehealth": {
    feature: "telehealth",
    label: "Video consultations",
    blurb: "Run a video consultation with your patient from the patient record.",
    upgradeTo: "plan",
  },
  "/app/settings/video-calling": {
    feature: "telehealth",
    label: "Video consultations",
    blurb: "Run a video consultation with your patient from the patient record.",
    upgradeTo: "plan",
  },
  "/app/settings/tv-display": {
    feature: "queue",
    label: "Smart TV queue display",
    blurb:
      "A waiting-room display with live token numbers, so nobody asks 'where are we in the queue?'.",
    upgradeTo: "plan",
  },
  "/app/settings/assessment-library": {
    feature: "assessments",
    label: "Assessment library",
    blurb:
      "Your own scored assessment templates and the AI-assisted clinical notes that go with them.",
    upgradeTo: "plan",
  },
};

/**
 * Routes that stay reachable while a clinic is still finishing its first-run
 * setup. The setup wizard is where the user has to go; everything else would
 * only be a dead end.
 */
export const SETUP_ALLOWLIST_PREFIXES = [
  "/app/clinic/setup",
  "/app/billing",
  "/app/support",
  "/app/admin",
  "/app/settings",
];

export type Entitlements = {
  /** The clinic's plan row, or null when it has no subscription at all. */
  plan: SubscriptionPlan | null;
  /** The subscription row, or null. */
  subscription: Subscription | null;
  /** True only for a subscription that is active and not past its end date. */
  hasActiveSubscription: boolean;
  /** Plan feature keys the clinic currently has. */
  features: string[];
  /** Add-on slugs the clinic currently has (active purchases). */
  addons: string[];
  /** Extra units bought through quantity add-ons (extra doctor seats, ...). */
  addonQuantity: Record<string, number>;
  /** Numeric entitlements from the plan. `null` means unlimited. */
  limits: {
    doctorSeats: number | null;
    teamSeats: number | null;
  };
};

/** Empty entitlements — a clinic with no subscription row. */
export const NO_ENTITLEMENTS: Entitlements = {
  plan: null,
  subscription: null,
  hasActiveSubscription: false,
  features: [],
  addons: [],
  addonQuantity: {},
  limits: { doctorSeats: 0, teamSeats: 0 },
};

/**
 * A subscription only grants modules while it is `active` and unexpired.
 * `pending_payment` does not qualify: a clinic that has sent its receipt but
 * has not been verified yet has not bought anything.
 */
function isGranting(subscription: Subscription | null): boolean {
  if (!subscription) return false;
  if (subscription.status !== "active") return false;
  if (!subscription.current_period_end) return true;
  return new Date(subscription.current_period_end).getTime() > Date.now();
}

/** Read a numeric limit, tolerating a missing or malformed `limits` object. */
function readLimit(limits: unknown, key: string): number | null {
  if (!limits || typeof limits !== "object") return 0;
  const value = (limits as Record<string, unknown>)[key];
  if (value === null) return null; // explicit "unlimited"
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Load the entitlements of a clinic.
 *
 * Three reads, one joined query each: the subscription (with its plan), the
 * clinic's active add-ons, and nothing else. Memoised with React `cache()`
 * so the header, the sidebar and the page share one lookup per request.
 */
export const getEntitlements = cache(
  async (
    supabase: SupabaseClient<Database>,
    clinicId: string,
  ): Promise<Entitlements> => {
    const [{ data: subscription }, { data: addonRows }] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("*, plan:subscription_plans(*)")
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("clinic_addons")
        .select("status, quantity, addon:addons(slug)")
        .eq("clinic_id", clinicId)
        .eq("status", "active"),
    ]);

    const sub = (subscription as Subscription | null) ?? null;
    const plan =
      subscription &&
      typeof subscription === "object" &&
      "plan" in subscription
        ? ((subscription as Record<string, unknown>)
            .plan as SubscriptionPlan | null)
        : null;

    const granting = isGranting(sub);
    const features = granting
      ? (plan?.features ?? [])
          .filter((feature) => feature?.included === true)
          .map((feature) => feature.key)
      : [];

    const addons: string[] = [];
    const addonQuantity: Record<string, number> = {};
    for (const row of addonRows ?? []) {
      const slug = (row as { addon?: { slug?: string } | null }).addon?.slug;
      if (!slug) continue;
      addons.push(slug);
      addonQuantity[slug] = (addonQuantity[slug] ?? 0) + (row.quantity ?? 1);
    }

    return {
      plan: plan ?? null,
      subscription: sub,
      hasActiveSubscription: granting,
      features,
      addons,
      addonQuantity,
      limits: {
        doctorSeats: readLimit(plan?.limits, "doctor_seats"),
        teamSeats: readLimit(plan?.limits, "team_seats"),
      },
    };
  },
);

/** The entitlement a path needs, if any. Prefix match, longest key first. */
export function entitlementForPath(pathname: string): RouteEntitlement | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  let best: { key: string; value: RouteEntitlement } | null = null;
  for (const [key, value] of Object.entries(ROUTE_ENTITLEMENTS)) {
    if (path === key || path.startsWith(`${key}/`)) {
      if (!best || key.length > best.key.length) best = { key, value };
    }
  }
  return best?.value ?? null;
}

/**
 * The entitlement behind a feature key or an add-on slug.
 *
 * The upgrade screen arrives with `?upgrade=<key>` — the same key the route
 * guard put in the URL — so the screen can explain itself without guessing
 * which module the user was trying to open.
 */
export function entitlementForKey(key: string): RouteEntitlement | null {
  for (const value of Object.values(ROUTE_ENTITLEMENTS)) {
    if (value.feature === key || value.addon === key) return value;
  }
  return null;
}

/** True when the clinic may open a route. */
export function isRouteAllowed(
  entitlements: Entitlements,
  pathname: string,
): boolean {
  const requirement = entitlementForPath(pathname);
  if (!requirement) return true;
  if (requirement.feature) {
    if (!entitlements.features.includes(requirement.feature)) return false;
  }
  if (requirement.addon) {
    if (!entitlements.addons.includes(requirement.addon)) return false;
  }
  return true;
}

/**
 * Why a route is locked — the module label plus the plan(s) that include it.
 * Used by the upgrade screen and the sidebar badge.
 */
export function lockReason(
  entitlements: Entitlements,
  requirement: RouteEntitlement,
): { label: string; blurb: string; upgradeTo: "plan" | "addon" } {
  return {
    label: requirement.label,
    blurb: requirement.blurb,
    upgradeTo: requirement.upgradeTo,
  };
}

/**
 * Add-ons that are part of a plan.
 *
 * WhatsApp and the TV queue used to be sold as add-ons; they are now part of
 * the Clinic plan (in this market WhatsApp *is* the product). The catalogue
 * rows stay so existing purchases keep pointing at them, and this map is how
 * the marketplace knows to say "included in your plan" instead of quoting a
 * price for something the clinic already has.
 */
export const ADDON_PLAN_FEATURES: Record<string, PlanFeatureKey> = {
  "whatsapp-ai-receptionist": "whatsapp",
  "queue-management-system": "queue",
};

/** True when the clinic's plan already includes this add-on. */
export function addonIncludedInPlan(
  entitlements: Entitlements,
  slug: string,
): boolean {
  const feature = ADDON_PLAN_FEATURES[slug];
  if (!feature) return false;
  return entitlements.features.includes(feature);
}

/**
 * The doctor seats a clinic may use: the plan's allowance plus every extra
 * doctor seat it bought. `null` means unlimited.
 */
export function doctorSeatAllowance(entitlements: Entitlements): number | null {
  const base = entitlements.limits.doctorSeats;
  if (base === null) return null;
  return base + (entitlements.addonQuantity["extra-doctor-seat"] ?? 0);
}

/** The team logins a clinic may use: the plan's allowance plus purchases. */
export function teamSeatAllowance(entitlements: Entitlements): number | null {
  const base = entitlements.limits.teamSeats;
  if (base === null) return null;
  return base + (entitlements.addonQuantity["extra-team-seat"] ?? 0);
}

/**
 * How many doctors the clinic currently has.
 *
 * Only the count matters for the limit, so this is deliberately a `head` query
 * rather than a full row read.
 */
export async function countDoctors(
  supabase: SupabaseClient<Database>,
  clinicId: string,
): Promise<number> {
  const { count } = await supabase
    .from("doctors")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId);
  return count ?? 0;
}

/**
 * How many team logins the clinic uses: the accepted members plus the
 * invitations that are still open. A pending invite holds a seat, otherwise a
 * clinic could hand out unlimited invitations past its limit.
 */
export async function countTeamSeats(
  supabase: SupabaseClient<Database>,
  clinicId: string,
): Promise<number> {
  const [{ count: memberCount }, { count: inviteCount }] = await Promise.all([
    supabase
      .from("clinic_members")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId),
    supabase
      .from("clinic_invites")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("status", "pending"),
  ]);
  return (memberCount ?? 0) + (inviteCount ?? 0);
}

/**
 * The refusal a clinic gets when it runs out of seats.
 *
 * The message names the remedy rather than just saying "no": a clinic owner
 * can either upgrade the plan or buy an extra seat, and both are one click
 * away on the billing page.
 */
export function seatLimitMessage(params: {
  kind: "doctor" | "team";
  allowance: number | null;
  used: number;
  planName: string;
}): string {
  if (params.allowance === null) return "";
  const label = params.kind === "doctor" ? "doctor seat" : "team login";
  const plural = params.kind === "doctor" ? "doctor seats" : "team logins";
  return `Your ${params.planName} plan includes ${params.allowance} ${label}${
    params.allowance === 1 ? "" : "s"
  } and you are using ${params.used}. Upgrade your plan or add an extra ${
    params.kind === "doctor" ? "doctor seat" : "team login"
  } from Billing to add more ${plural}.`;
}

/**
 * The server-side gate for a module.
 *
 * The route guard stops a clinic from *opening* a module it has not bought;
 * this stops it from *writing* to one by calling the action directly. A
 * hidden button is not access control — the two have to agree, and they read
 * the same resolver.
 */
export async function requireFeature(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  featureKey: PlanFeatureKey,
  label: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const entitlements = await getEntitlements(supabase, clinicId);
  if (entitlements.features.includes(featureKey)) return { ok: true };
  return {
    ok: false,
    message: `${label} is not included in your ${
      entitlements.plan?.name ?? "current"
    } plan. Request the upgrade from Billing to switch it on.`,
  };
}

/** The server-side gate for an add-on module (Growth Agent and friends). */
export async function requireAddon(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  slug: AddonSlug,
  label: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const entitlements = await getEntitlements(supabase, clinicId);
  if (entitlements.addons.includes(slug)) return { ok: true };
  if (addonIncludedInPlan(entitlements, slug)) return { ok: true };
  return {
    ok: false,
    message: `${label} is an add-on and is not active on your clinic yet. Add it from the Add-ons marketplace to switch it on.`,
  };
}
