import { Lock } from "lucide-react";

import { RequestUpgradeButton } from "@/components/billing/request-upgrade-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentClinic } from "@/lib/clinic-access";
import { entitlementForKey, getEntitlements } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";

/**
 * The upgrade screen.
 *
 * A locked module sends the user here (`/app/billing?upgrade=<key>`). The
 * point of this panel is that a locked module is never a dead end: it says
 * what the module does, which plan carries it, what that plan costs, and
 * gives the clinic one button to ask for it. Upgrades are not self-serve —
 * payment is verified manually — so the honest CTA is a request, not a
 * checkout.
 */
export async function UpgradePanel({ requestKey }: { requestKey: string }) {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return null;

  const requirement = entitlementForKey(requestKey);
  const [{ data: plans }, { data: addons }, entitlements] = await Promise.all([
    supabase
      .from("subscription_plans")
      .select("code, name, price, currency, billing_interval, features")
      .eq("active", true)
      .order("price", { ascending: true }),
    supabase.from("addons").select("slug, name, price_pkr, billing_period"),
    getEntitlements(supabase, access.clinic.id),
  ]);

  // The plan that carries this module.
  const owningPlan = (plans ?? []).find((plan) =>
    (plan.features ?? []).some(
      (feature) =>
        feature.key === requestKey && feature.included === true,
    ),
  );

  const addon = (addons ?? []).find((row) => row.slug === requestKey);

  const label = requirement?.label ?? addon?.name ?? "This module";
  const blurb =
    requirement?.blurb ??
    "An add-on for your clinic, billed separately from your plan.";

  return (
    <Card className="border-primary-tint-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-4 w-4 text-primary" aria-hidden="true" />
          </span>
          <CardTitle className="text-base">{label} is not in your plan</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed text-text-secondary">{blurb}</p>

        {owningPlan ? (
          <div className="rounded-card border border-hairline bg-app p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-text-primary">
                Included with the {owningPlan.name} plan
              </span>
              <span className="text-sm font-medium text-text-primary">
                {owningPlan.currency} {owningPlan.price.toLocaleString()} /{" "}
                {owningPlan.billing_interval}
              </span>
            </div>
            {entitlements.plan && entitlements.plan.code !== owningPlan.code ? (
              <p className="mt-2 text-xs text-text-muted">
                You are on {entitlements.plan.name}. We will switch your plan and
                take care of the difference.
              </p>
            ) : null}
          </div>
        ) : null}

        {addon ? (
          <div className="rounded-card border border-hairline bg-app p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-text-primary">
                Available as an add-on
              </span>
              <span className="text-sm font-medium text-text-primary">
                PKR {addon.price_pkr.toLocaleString()} /{" "}
                {addon.billing_period === "once" ? "one-time" : addon.billing_period}
              </span>
            </div>
          </div>
        ) : null}

        {owningPlan ? (
          <RequestUpgradeButton
            moduleLabel={label}
            planName={owningPlan.name}
            planPrice={owningPlan.price}
            currency={owningPlan.currency}
          />
        ) : addon ? (
          <RequestUpgradeButton
            moduleLabel={label}
            planName="add-on"
            planPrice={addon.price_pkr}
            currency="PKR"
          />
        ) : (
          <Badge variant="outline">Contact us to enable this module</Badge>
        )}
      </CardContent>
    </Card>
  );
}
