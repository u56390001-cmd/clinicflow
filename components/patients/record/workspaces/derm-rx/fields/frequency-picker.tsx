"use client";

/**
 * Frequency field — a compact trigger button opening a Popover of preset
 * schedules AND custom controls (times/day, weekdays, every-N-days, SOS).
 * RULE: presets are suggestions, customs are always reachable.
 */

import { useState } from "react";
import { CalendarClock, Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import type { Frequency } from "../schema/rx-item";

export const FREQUENCY_PRESETS: Frequency[] = [
  { kind: "daily", morning: 1, noon: 0, night: 0 },
  { kind: "daily", morning: 0, noon: 0, night: 1 },
  { kind: "daily", morning: 1, noon: 0, night: 1 },
  { kind: "daily", morning: 1, noon: 1, night: 1 },
  { kind: "everyNDays", n: 2 },
  { kind: "timesPerWeek", n: 1 },
  { kind: "timesPerWeek", n: 2 },
  { kind: "weekdays", days: [1, 4] },
  { kind: "sos" },
];

/** English display label (render/i18n.ts supersedes in Phase 5). */
export function frequencyLabel(freq: Frequency): string {
  switch (freq.kind) {
    case "daily": {
      const slots = [freq.morning, freq.noon, freq.night].join("-");
      const words: string[] = [];
      if (freq.morning > 0) words.push("Morning ×" + freq.morning);
      if (freq.noon > 0) words.push("Afternoon ×" + freq.noon);
      if (freq.night > 0) words.push("Night ×" + freq.night);
      return words.length > 0 ? `${slots} (${words.join(", ")})` : slots;
    }
    case "everyNDays":
      return `Every ${freq.n} days`;
    case "weekdays":
      return freq.days.length === 0
        ? "Pick weekdays"
        : freq.days
            .map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d] ?? "")
            .filter(Boolean)
            .join("/");
    case "timesPerWeek":
      return `${freq.n}×/week`;
    case "sos":
      return freq.maxPerDay ? `SOS (max ${freq.maxPerDay}/day)` : "SOS";
    case "custom":
      return freq.text;
  }
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function FrequencyPicker({
  value,
  onChange,
  disabled,
}: {
  value: Frequency;
  onChange: (frequency: Frequency) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [customTimes, setCustomTimes] = useState("1");
  const [customDays, setCustomDays] = useState<Array<0 | 1 | 2 | 3 | 4 | 5 | 6>>(
    value.kind === "weekdays" ? [...value.days] : [],
  );

  const applyCustom = () => {
    const n = Math.max(1, Math.min(3, Number(customTimes) || 1));
    // Times/day fills the day slots in order: morning, noon, night.
    if (n <= 3) {
      const slots: Array<0 | 1 | 2> = [0, 1, 2];
      const picked = slots.slice(0, n);
      onChange({
        kind: "daily",
        morning: picked.includes(0) ? 1 : 0,
        noon: picked.includes(1) ? 1 : 0,
        night: picked.includes(2) ? 1 : 0,
      });
      return;
    }
    onChange({ kind: "sos", maxPerDay: n });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="border-hairline bg-surface text-text-muted hover:text-text-primary"
          aria-haspopup="listbox"
        >
          <CalendarClock className="h-4 w-4 shrink-0 text-status-info/40" />
          <span className="truncate text-sm">
            {frequencyLabel(value)}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 bg-surface">
        <div className="space-y-1">
          <p className="text-xs font-medium text-text-muted">Presets</p>
          <div className="grid grid-cols-2 gap-1.5">
            {FREQUENCY_PRESETS.map((preset) => (
              <button
                key={frequencyLabel(preset)}
                type="button"
                onClick={() => {
                  onChange(preset);
                  setOpen(false);
                }}
                className={
                  "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-app" +
                  (JSON.stringify(preset) === JSON.stringify(value)
                    ? " bg-app text-text-primary"
                    : " text-text-muted")
                }
              >
                {JSON.stringify(preset) === JSON.stringify(value) ? (
                  <Check className="h-3 w-3 shrink-0 text-primary" />
                ) : null}
                {frequencyLabel(preset)}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2 border-t border-hairline pt-2">
          <p className="text-xs font-medium text-text-muted">Custom</p>
          <div className="flex items-center gap-2">
            <Input
              value={customTimes}
              onChange={(event) => setCustomTimes(event.target.value)}
              inputMode="numeric"
              aria-label="Times per day (1 to 3, more becomes SOS slots)"
              placeholder="Times/day"
              className="h-8 w-28 border-input"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 px-2 text-xs"
              onClick={() => {
                applyCustom();
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_NAMES.map((name, day) => (
              <button
                key={name}
                type="button"
                aria-pressed={customDays.includes(day as 0 | 1 | 2 | 3 | 4 | 5 | 6)}
                onClick={() => {
                  setCustomDays((current) => {
                    const dayNum = day as 0 | 1 | 2 | 3 | 4 | 5 | 6;
                    const next = current.includes(dayNum)
                      ? computedWithout(current, dayNum)
                      : [...current, dayNum];
                    if (next.length > 0) onChange({ kind: "weekdays", days: next });
                    return next;
                  });
                }}
                className={
                  "rounded-lg border px-2 py-1 text-xs " +
                  (customDays.includes(day as 0 | 1 | 2 | 3 | 4 | 5 | 6)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-hairline text-text-muted hover:bg-app")
                }
              >
                {name}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => {
              onChange({ kind: "everyNDays", n: 2 });
              setOpen(false);
            }}
          >
            Alternate day preset
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function computedWithout(
  days: Array<0 | 1 | 2 | 3 | 4 | 5 | 6>,
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6,
): Array<0 | 1 | 2 | 3 | 4 | 5 | 6> {
  return days.filter((d) => d !== day);
}
