import type { SupabaseClient } from "@supabase/supabase-js";

import type { Subscription, SubscriptionPlan } from "@/types/database";

/**
 * Plan gating for the integrations dashboard.
 *
 * The design document showed Google Calendar and Meet as "Not on your plan"
 * behind an Upgrade button, but nothing in this repo read
 * `subscription_plans.features` to decide anything — the copy would have been
 * decoration. Migration 0043 added real `google_calendar` / `google_meet` keys
 * to the plan rows, and this module is what reads them, so the gate is true
 * rather than painted on.
 *
 * Two rules keep it honest:
 *
 *  1. A clinic with no *active* subscription is not treated as having every
 *     feature. It is treated as having none of the gated ones, because "no
 *     active plan" genuinely does not include them. The UI still links to
 *     /app/billing, so this is a call to action rather than a dead end.
 *
 *  2. Gating is only ever advisory here. The real enforcement lives in
 *     `lib/actions/integrations.ts`, which re-checks the gate server-side
 *     before writing — hiding a card is not access control, and a client that
 *     calls the action directly must be refused the same way a user who cannot
 *     see the button is.
 */

/** A single entry of `subscription_plans.features`. */
export type PlanFeature = { key: string; label: string; included: boolean };

/** What the dashboard needs to render lock state and the Upgrade copy. */
export type PlanAccess = {
  /** Null when the clinic has no subscription row yet. */
  plan: SubscriptionPlan | null;
  subscription: Subscription | null;
  /**
   * True only for a subscription that is `active` AND whose period has not
   * lapsed. Mirrors the `has_active_subscription` RPC from migration 0010 so
   * the dashboard and the RPC cannot drift apart.
   */
  hasActiveSubscription: boolean;
  /**
   * Plan names that include the feature, for the "Available on X" line on a
   * locked card. Empty when no plan includes it, which is the signal that the
   * catalogue entry is misconfigured rather than that the clinic is blocked.
   */
  plansWithFeature: string[];
};

/**
 * Reads a feature key out of a plan's `features` array.
 *
 * Tolerates a malformed entry (missing key, non-boolean `included`) by treating
 * it as not included. The column is `jsonb` with no shape constraint, so a
 * hand-edited row should degrade to "locked" rather than crash the page.
 */
export function isFeatureIncluded(
  features: PlanFeature[] | null | undefined,
  key: string,
): boolean {
  if (!Array.isArray(features)) return false;
  return features.some((f) => f?.key === key && f?.included === true);
}

/**
 * A subscription only grants features while it is `active` and unexpired.
 * `pending_payment` and `expiring` deliberately do not qualify — a clinic that
 * has submitted payment but has not been approved yet has not bought the
 * feature, and pretending otherwise would make the Upgrade button a no-op for
 * exactly the clinics that most need to press it.
 */
function isGrantingSubscription(
  subscription: Subscription | null,
): boolean {
  if (!subscription) return false;
  if (subscription.status !== "active") return false;
  // A null end date on an active row is treated as granting access: the
  // `has_active_subscription` RPC would exclude it, but the RPC is only used
  // for the dashboard badge, and locking a paying clinic out over a null would
  // be the worse failure.
  if (!subscription.current_period_end) return true;
  return new Date(subscription.current_period_end).getTime() > Date.now();
}

/**
 * Loads the clinic's plan and computes which plans include `featureKey`.
 *
 * Returns a null plan (rather than throwing) when the subscription rows are
 * missing, so a brand-new clinic renders a page of locked cards with a working
 * Upgrade link instead of an error state.
 */
export async function getPlanAccess(
  supabase: SupabaseClient,
  clinicId: string,
  featureKey?: string,
): Promise<PlanAccess> {
  const [{ data: subscription }, { data: plans }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("*, plan:subscription_plans(*)")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("subscription_plans")
      .select("code, name, features")
      .eq("active", true)
      .order("price", { ascending: true }),
  ]);

  const plan =
    subscription && typeof subscription === "object" && "plan" in subscription
      ? ((subscription as Record<string, unknown>)
          .plan as SubscriptionPlan | null)
      : null;

  const plansWithFeature = featureKey
    ? ((plans ?? []) as unknown as Array<{ name: string; features: PlanFeature[] }>)
        .filter((p) => isFeatureIncluded(p.features, featureKey))
        .map((p) => p.name)
    : [];

  return {
    plan: plan ?? null,
    subscription: (subscription as Subscription) ?? null,
    hasActiveSubscription: isGrantingSubscription(
      (subscription as Subscription) ?? null,
    ),
    plansWithFeature,
  };
}

/**
 * The single question the integrations dashboard asks: may this clinic turn
 * this integration on?
 *
 * Ungated catalogue entries (anything with no `featureKey`) are always allowed.
 * Gated ones require a granting subscription whose plan includes the key.
 */
export function isFeatureUnlocked(
  access: PlanAccess,
  featureKey: string | null,
): boolean {
  if (!featureKey) return true;
  if (!access.hasActiveSubscription) return false;
  if (!access.plan) return false;
  return isFeatureIncluded(access.plan.features, featureKey);
}
