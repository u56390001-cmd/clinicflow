"use client";

import { useEffect } from "react";
import { ArrowRight, Lock } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { APP_ROUTES } from "@/lib/constants";

/**
 * Shown when a clinic taps Upgrade on a plan-gated card.
 *
 * The design document's version closed the modal and fired a toast reading
 * "Redirecting to Plan Upgrade…" while going nowhere. This one links to the real
 * billing page, and — the part that matters — the copy names the plans the
 * feature is actually on.
 *
 * Those names come from `subscription_plans.features` via `availableOn`, not
 * from a hardcoded "Pro & Enterprise" string. The plans in this repo are
 * Starter / Professional / Enterprise, so the mockup's copy was wrong twice
 * over: the plan names did not exist, and no code checked any of it. The gate
 * itself is enforced in `lib/actions/integrations.ts`; this dialog is only the
 * explanation.
 */
export function IntegrationUpgradeModal({
  integrationName,
  availableOn,
  currentPlanName,
  onClose,
}: {
  integrationName: string;
  availableOn: string[];
  currentPlanName: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const planSentence =
    availableOn.length > 0
      ? `Included with ${availableOn.join(" and ")}.`
      : "This integration is not currently part of any plan.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-card border border-text-muted/30 bg-surface p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-card border border-primary-border bg-primary-light">
          <Lock className="size-5 text-primary" aria-hidden="true" />
        </div>

        <h2
          id="upgrade-modal-title"
          className="text-base font-bold text-text-primary"
        >
          Upgrade your plan
        </h2>

        <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
          <strong className="font-semibold">{integrationName}</strong> is not part
          of your current plan. {planSentence}
        </p>

        {currentPlanName && (
          <p className="mt-2 text-xs text-text-muted">
            You are on {currentPlanName}.
          </p>
        )}

        <div className="mt-6 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button asChild className="flex-1">
            <Link href={APP_ROUTES.app.billing}>
              View plans
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
