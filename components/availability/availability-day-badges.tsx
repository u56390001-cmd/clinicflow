"use client";

import { WEEKDAY_ORDER } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * M T W T F S S day badges. Days that can actually be booked render as a
 * bright green circle (same green as the active/online dot), inactive days
 * stay neutral gray. Shared by the detail modals.
 */
export function AvailabilityDayBadges({
  workingDays,
}: {
  workingDays: boolean[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {WEEKDAY_ORDER.map((day, index) => (
        <span
          key={day}
          title={day}
          className={cn(
            "flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-semibold",
            workingDays[index]
              ? "bg-status-success text-white"
              : "bg-app text-text-muted",
          )}
        >
          {day.slice(0, 1)}
        </span>
      ))}
    </div>
  );
}