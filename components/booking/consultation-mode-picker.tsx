"use client";

import { cn } from "@/lib/utils";

export type ConsultationMode = "single_slot" | "shared_window";

/**
 * Shared radio-card picker for a doctor's or service's consultation mode.
 * Phase 20 built this inline for doctors; Phase 21 reuses it for services.
 * Renders `<input type="radio" name={name}>` so the checked value lands in the
 * form payload under the same name both server actions already read.
 */
export function ConsultationModePicker({
  value,
  onChange,
  name = "consultationMode",
}: {
  value: ConsultationMode;
  onChange: (mode: ConsultationMode) => void;
  name?: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label
        className={cn(
          "flex cursor-pointer gap-3 rounded-control border p-4 transition-colors",
          "has-[:checked]:border-primary has-[:checked]:bg-primary/5",
          "border-text-muted/40 hover:border-primary/40",
        )}
      >
        <input
          type="radio"
          name={name}
          value="single_slot"
          checked={value === "single_slot"}
          onChange={() => onChange("single_slot")}
          className="mt-0.5 h-4 w-4 accent-[--color-primary]"
        />
        <span>
          <span className="block text-sm font-medium text-text-primary">
            One patient at a time
          </span>
          <span className="mt-1 block text-xs text-text-muted">
            Each time shows a single booking, exactly like today.
          </span>
        </span>
      </label>
      <label
        className={cn(
          "flex cursor-pointer gap-3 rounded-control border p-4 transition-colors",
          "has-[:checked]:border-primary has-[:checked]:bg-primary/5",
          "border-text-muted/40 hover:border-primary/40",
        )}
      >
        <input
          type="radio"
          name={name}
          value="shared_window"
          checked={value === "shared_window"}
          onChange={() => onChange("shared_window")}
          className="mt-0.5 h-4 w-4 accent-[--color-primary]"
        />
        <span>
          <span className="block text-sm font-medium text-text-primary">
            Multiple patients at once
          </span>
          <span className="mt-1 block text-xs text-text-muted">
            Several patients book into the same window and are seen in order.
          </span>
        </span>
      </label>
    </div>
  );
}