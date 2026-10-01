"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Trash2 } from "lucide-react";

import { Spinner } from "@/components/ui/spinner";
import {
  approveScannedMedicationAction,
  discardScannedMedicationAction,
} from "@/lib/actions/patient-medications";

/**
 * Two compact actions for a scanned (AI OCR) medication awaiting doctor review:
 * approve → `active`, discard → row removed.
 *
 * Shared by the Overview Active Medications card and the Medications tab so the
 * pending-review decision works identically everywhere. Calls the server action
 * directly and `router.refresh()`es — no form, no navigation.
 */
export function MedicationReviewActions({
  medicationId,
}: {
  medicationId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"approve" | "discard" | null>(null);
  const busy = pending !== null;

  async function run(kind: "approve" | "discard") {
    if (busy) return;
    setPending(kind);

    const formData = new FormData();
    formData.set("medicationId", medicationId);
    const result =
      kind === "approve"
        ? await approveScannedMedicationAction(null, formData)
        : await discardScannedMedicationAction(null, formData);

    if (!result.ok) {
      toast.error(result.message);
      setPending(null);
      return;
    }

    toast.success(
      kind === "approve"
        ? "Medication approved and added to the active list."
        : "Medication removed.",
    );
    router.refresh();
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={() => run("approve")}
        disabled={busy}
        title="Approve — add to active list"
        aria-label="Approve medication"
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
        onClick={() => run("discard")}
        disabled={busy}
        title="Discard"
        aria-label="Discard medication"
        className="inline-flex size-6 items-center justify-center rounded-md text-status-destructive transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:bg-rose-50 disabled:pointer-events-none disabled:opacity-50"
      >
        {pending === "discard" ? (
          <Spinner size="sm" />
        ) : (
          <Trash2 aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
        )}
      </button>
    </div>
  );
}