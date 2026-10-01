"use client";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { StatusTag } from "@/lib/vitals-status";

/**
 * One measurement, on its own card.
 *
 * Icon badge, label, value, unit — the same four-part stat card both the
 * Overview and Vitals tabs are built from. Every badge is the same teal on
 * purpose: the colour that matters on a patient record is the one on the status
 * tag beneath the value, and five differently-coloured badges would compete
 * with it for the one glance a doctor actually makes.
 *
 * A reading that was never taken keeps its card and shows a dash. Dropping the
 * card instead would make a sparse record look like a complete one.
 */
export function VitalCard({ reading }: { reading: VitalReading }) {
  const Icon = reading.icon;
  const recorded = reading.value !== null;

  return (
    <div
      className={cn(
        "rounded-card border p-3.5",
        recorded
          ? "border-text-muted/20 bg-surface"
          : "border-dashed border-text-muted/25 bg-app/40",
      )}
    >
      <span className="flex size-8 items-center justify-center rounded-full bg-primary-tint text-primary">
        <Icon aria-hidden="true" className="size-4" strokeWidth={2} />
      </span>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        {reading.label}
      </p>
      {/* The unit stays on an empty card too: "— mg/dL" says which measurement
          is missing, where a bare dash only says that something is. */}
      <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
        <span
          className={cn(
            "text-[26px] font-bold tabular-nums leading-none",
            recorded ? "text-ink" : "text-text-muted/50",
          )}
        >
          {recorded ? reading.value : <>&mdash;</>}
        </span>
        <span className="text-[11px] font-medium text-text-muted">
          {reading.unit}
        </span>
      </p>
      {recorded ? (
        reading.tag && (
          <p className="mt-2">
            <StatusPill tag={reading.tag} />
          </p>
        )
      ) : (
        <p className="mt-2 text-[11px] text-text-muted">Not recorded</p>
      )}
    </div>
  );
}

/**
 * Reference ranges, in the same vocabulary the Vitals tab already uses
 * (`lib/vitals-status.ts`), so a reading never reads Normal in one place and
 * High in the other.
 */
export type VitalReading = {
  key: string;
  label: string;
  icon: LucideIcon;
  value: string | null;
  unit: string;
  tag: StatusTag;
};

function StatusPill({ tag }: { tag: StatusTag }) {
  if (!tag) return null;
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
        tag.pill,
      )}
    >
      {tag.label}
    </span>
  );
}