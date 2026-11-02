"use client";

/**
 * Duration field — compact trigger + Popover with fixed presets
 * (7/14/30/45/90 days, Continue, Until next visit) and a custom
 * number + unit (day/week/month) builder.
 */

import { useState } from "react";
import { CalendarRange, Check, ChevronDown, Hourglass } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Duration } from "../schema/rx-item";

export const DURATION_PRESETS: Duration[] = [
  { kind: "fixed", value: 7, unit: "day" },
  { kind: "fixed", value: 14, unit: "day" },
  { kind: "fixed", value: 30, unit: "day" },
  { kind: "fixed", value: 45, unit: "day" },
  { kind: "fixed", value: 90, unit: "day" },
  { kind: "continue" },
  { kind: "untilNextVisit" },
];

export function durationLabel(dur: Duration): string {
  switch (dur.kind) {
    case "fixed": {
      const plural = dur.value === 1 ? "" : "s";
      return `${dur.value} ${dur.unit[0]!.toUpperCase()}${dur.unit.slice(1)}${plural}`;
    }
    case "continue":
      return "Continue";
    case "untilNextVisit":
      return "Until next visit";
    case "custom":
      return dur.text;
  }
}

export function DurationPicker({
  value,
  onChange,
  disabled,
}: {
  value: Duration;
  onChange: (duration: Duration) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState(
    value.kind === "fixed" ? String(value.value) : "10",
  );
  const [customUnit, setCustomUnit] =
    useState<"day" | "week" | "month">("day");

  const applyCustom = () => {
    const n = Math.max(1, Math.min(365, Math.floor(Number(customValue) || 0)));
    onChange({ kind: "fixed", value: n, unit: customUnit });
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
          <CalendarRange className="h-4 w-4 shrink-0 text-status-info/40" />
          <span className="truncate text-sm">{durationLabel(value)}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3 bg-surface">
        <div className="space-y-1">
          <p className="text-xs font-medium text-text-muted">Presets</p>
          <div className="grid grid-cols-2 gap-1.5">
            {DURATION_PRESETS.map(
              (preset) =>
                preset.kind === "fixed" ? (
                  <button
                    key={`fixed-${preset.value}`}
                    type="button"
                    onClick={() => {
                      onChange(preset);
                      setOpen(false);
                    }}
                    className={
                      "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-app" +
                      (preset.kind === value.kind &&
                      "value" in value &&
                      preset.value === value.value
                        ? " bg-app text-text-primary"
                        : " text-text-muted")
                    }
                  >
                    {durationLabel(preset)}
                  </button>
                ) : (
                  <button
                    key={preset.kind}
                    type="button"
                    onClick={() => {
                      onChange(preset);
                      setOpen(false);
                    }}
                    className={
                      "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-app col-span-2" +
                      (preset.kind === value.kind ? " bg-app text-text-primary" : " text-text-muted")
                    }
                  >
                    <Hourglass className="h-3 w-3 shrink-0" />
                    {durationLabel(preset)}
                  </button>
                ),
            )}
          </div>
        </div>
        <div className="space-y-2 border-t border-hairline pt-2">
          <p className="text-xs font-medium text-text-muted">Custom</p>
          <div className="flex items-center gap-2">
            <Input
              value={customValue}
              onChange={(event) =>
                setCustomValue(event.target.value.replace(/[^\d]/g, ""))
              }
              inputMode="numeric"
              aria-label="Number of days, weeks or months"
              className="h-8 w-20 border-input"
            />
            <select
              value={customUnit}
              onChange={(event) =>
                setCustomUnit(event.target.value as "day" | "week" | "month")
              }
              aria-label="Duration unit"
              className="h-8 rounded-lg border border-input bg-surface px-1.5 text-xs text-text-primary"
            >
              <option value="day">days</option>
              <option value="week">weeks</option>
              <option value="month">months</option>
            </select>
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
              <Check className="h-3 w-3" />
              Set
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
