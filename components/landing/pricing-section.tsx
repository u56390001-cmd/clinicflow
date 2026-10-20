import type { SubscriptionPlan } from "@/types/database";

import { APP_ROUTES } from "@/lib/constants";
import {
  FALLBACK_PLAN_PRICES,
  PLAN_META,
  PRICING_NOTE,
} from "./data";

type PricingSectionProps = {
  /** Active plans read from `subscription_plans` (public read), or empty. */
  plans: SubscriptionPlan[];
  signedIn: boolean;
};

function formatPrice(value: number): string {
  return value.toLocaleString("en-PK", {
    maximumFractionDigits: 0,
  });
}

/**
 * Pricing section from the approved landing page v2. Plan names, order and
 * copy come from the approved mockup; prices are looked up from the live
 * `subscription_plans` table (public RLS read, same source the billing
 * checkout uses) with the seed values as fallback. CTAs point at the real
 * signup flow or, for signed-in visitors, the actual billing checkout.
 */
export function PricingSection({ plans, signedIn }: PricingSectionProps) {
  const priceByCode = new Map(
    plans.map((plan) => [plan.code, plan.price]),
  );
  const currency = plans[0]?.currency?.toUpperCase() ?? "PKR";
  const interval = plans[0]?.billing_interval ?? "month";

  return (
    <section className="section pricing" id="pricing">
      <div className="container">
        <div className="center">
          <span className="eyebrow">Simple, transparent pricing</span>
          <h2 className="section-title">Choose a plan for your clinic.</h2>
          <p className="section-sub">
            Pick a plan, pay by transfer or mobile wallet, and we email your
            account credentials once the payment is verified.
          </p>
        </div>

        <div className="pricing-grid">
          {PLAN_META.map((meta) => {
            const price = priceByCode.has(meta.code)
              ? priceByCode.get(meta.code)!
              : FALLBACK_PLAN_PRICES[meta.code];
            // New clinics go through the registration funnel (plan -> payment ->
            // details -> admin approval), carrying the chosen plan with them.
            const ctaUrl = signedIn
              ? APP_ROUTES.app.billingCheckout
              : `${APP_ROUTES.getStarted}?plan=${meta.code}`;

            return (
              <article className={`plan${meta.popular ? " popular" : ""}`} key={meta.code}>
                {meta.popular && <span className="popular-tag">Recommended</span>}
                <h3>{meta.name}</h3>
                <p className="plan-desc">{meta.description}</p>
                <div className="price">
                  <small>{currency} </small>
                  {formatPrice(price)} <span>/ {interval}</span>
                </div>
                <ul>
                  {meta.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
                <a
                  className={`btn ${meta.popular ? "btn-primary" : "btn-outline"}`}
                  href={ctaUrl}
                >
                  {meta.ctaLabel}
                </a>
              </article>
            );
          })}
        </div>

        <p className="pricing-note">{PRICING_NOTE}</p>
      </div>
    </section>
  );
}