"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { submitSupportTicketAction } from "@/lib/actions/support";

/**
 * "Request this upgrade" — the one honest button on the upgrade screen.
 *
 * Upgrades are not self-serve: payment is verified manually by a platform
 * admin, so the only thing the clinic can do from here is ask. The request
 * arrives as a support ticket, pre-filled with the module, so nobody has to
 * re-explain what they wanted.
 */
export function RequestUpgradeButton({
  moduleLabel,
  planName,
  planPrice,
  currency,
}: {
  moduleLabel: string;
  planName: string;
  planPrice: number;
  currency: string;
}) {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-status-success">
        <Check className="h-4 w-4" />
        Request sent — our team will get back to you.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await submitSupportTicketAction({
              type: "General Help & Support",
              subject: `Upgrade request: ${moduleLabel}`,
              description: `We would like to add the ${moduleLabel} module to our clinic. The plan that includes it is ${planName} (${currency} ${planPrice.toLocaleString()} per month). Please send us the payment details so we can upgrade.`,
              priority: "Medium",
            });
            if (result.ok) {
              setSent(true);
            } else {
              setError(result.message);
            }
          });
        }}
        disabled={pending}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {pending ? "Sending…" : "Request this upgrade"}
      </Button>
      {error ? <p className="text-xs text-status-destructive">{error}</p> : null}
    </div>
  );
}
