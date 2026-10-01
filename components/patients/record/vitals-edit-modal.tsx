"use client";

import { useEffect } from "react";
import { HeartPulse, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  VitalsForm,
  type ExistingVitals,
} from "@/components/queue/vitals-form";

/**
 * "Edit Vitals" popup for the patient record's Vitals tab.
 *
 * Vitals are visit-bound (one row per visit), so the modal upserts the reading
 * against the patient's latest visit by reusing the queue's `VitalsForm` with
 * the latest reading prefilled. Saving refreshes the record; `onSaved` lets the
 * parent close this modal once the write lands.
 */
export function VitalsEditModal({
  visitId,
  existingVitals,
  onClose,
}: {
  visitId: string;
  existingVitals?: ExistingVitals | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-secondary/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Edit vitals"
    >
      <div className="relative my-8 w-full max-w-lg flex-col rounded-2xl border border-hairline bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between rounded-t-2xl bg-gradient-to-r from-primary to-primary-light px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-white/20">
              <HeartPulse aria-hidden="true" className="size-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Edit Vitals</h2>
              <p className="text-xs text-white/80">
                Updates the latest check-in reading
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="group flex size-8 items-center justify-center rounded-lg bg-white text-primary shadow-sm transition-colors hover:bg-white/90"
            aria-label="Close"
          >
            <X
              aria-hidden="true"
              className="size-4 transition-transform duration-200 group-hover:rotate-90"
            />
          </button>
        </div>

        <div className="p-5">
          <VitalsForm
            visitId={visitId}
            existingVitals={existingVitals}
            config={null}
            onSaved={onClose}
          />
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 rounded-b-2xl border-t border-hairline bg-app/50 px-5 py-3.5">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}