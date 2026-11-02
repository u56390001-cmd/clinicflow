"use client";

/** Follow-up section — quick chips + real date picker; stores an ISO date. */

import { CalendarCheck } from "lucide-react";

import { chipToDate, isIsoDate, FOLLOW_UP_CHIPS } from "./follow-up";

export function FollowUpCard({
  value,
  onChange,
  canManage,
}: {
  /** ISO date YYYY-MM-DD, or a legacy text label this view mirrors. */
  value: string | null;
  onChange: (next: string | null) => void;
  canManage: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
        <CalendarCheck className="h-3.5 w-3.5" />
        Follow-up
      </p>
      <div className="flex flex-wrap gap-1.5">
        {FOLLOW_UP_CHIPS.map((chip) => {
          const iso = chipToDate(chip, "");
          const active = !!iso && value === iso;
          // Chips only set dates; the custom date input handles the rest.
          return iso ? (
            <button
              key={chip.label}
              type="button"
              aria-pressed={active}
              disabled={!canManage}
              onClick={() => onChange(active ? null : iso!)}
              className={
                "rounded-lg border px-2.5 py-1.5 text-xs transition-colors " +
                (active
                  ? "border-primary bg-primary text-white"
                  : "border-hairline bg-surface text-text-muted hover:text-text-primary")
              }
            >
              {chip.label}
            </button>
          ) : null;
        })}
        <label className="flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-2 py-1 text-xs text-text-muted">
          Custom date
          <input
            type="date"
            disabled={!canManage}
            value={value && isIsoDate(value) ? value : ""}
            onChange={(event) => onChange(event.target.value || null)}
            className="rounded border border-input-border px-1 text-xs text-text-primary"
            aria-label="Custom follow-up date"
          />
        </label>
      </div>
      {value && !isIsoDate(value) ? (
        <p className="text-xs italic text-text-muted/70">
          Legacy follow-up label: &ldquo;{value}&rdquo; — pick a date to convert.
        </p>
      ) : null}
    </div>
  );
}
