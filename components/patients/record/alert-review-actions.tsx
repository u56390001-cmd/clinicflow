"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";

import { Spinner } from "@/components/ui/spinner";
import {
  approveScannedAlertAction,
  dismissScannedAlertAction,
} from "@/lib/actions/patient-alerts";

/**
 * Two compact actions for a scanned (AI OCR) safety alert awaiting doctor
 * review: approve → merged into the patient's Critical Safety Alerts column,
 * dismiss → hidden and never applied.
 *
 * Kept separate from `MedicationReviewActions` because a safety alert merges
 * into the patient's permanent record rather than flipping a status field.
 */
export function AlertReviewActions({ alertId }: { alertId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"approve" | "dismiss" | null>(null);
  const busy = pending !== null;

  async function run(kind: "approve" | "dismiss") {
    if (busy) return;
    setPending(kind);

    const formData = new FormData();
    formData.set("alertId", alertId);
    const result =
      kind === "approve"
        ? await approveScannedAlertAction(null, formData)
        : await dismissScannedAlertAction(null, formData);

    if (!result.ok) {
      toast.error(result.message);
      setPending(null);
      return;
    }

    toast.success(
      kind === "approve"
        ? "Added to the patient's safety alerts."
        : "Safety alert dismissed.",
    );
    router.refresh();
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={() => run("approve")}
        disabled={busy}
        title="Approve — add to safety alerts"
        aria-label="Approve safety alert"
        className="inline-flex size-6 items-center justify-center rounded-md text-status-success transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:bg-emerald-50 disabled:pointer-events-none disabled:opacity-50"
      >
        {pending === "approve" ? (
          <Spinner size="sm" />
        ) : (
          <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
        )}
      </button>
      <button
        type="button"
        onClick={() => run("dismiss")}
        disabled={busy}
        title="Dismiss"
        aria-label="Dismiss safety alert"
        className="inline-flex size-6 items-center justify-center rounded-md text-status-destructive transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:bg-rose-50 disabled:pointer-events-none disabled:opacity-50"
      >
        {pending === "dismiss" ? (
          <Spinner size="sm" />
        ) : (
          <X aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
        )}
      </button>
    </div>
  );
}