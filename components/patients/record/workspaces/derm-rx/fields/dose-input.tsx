"use client";

/**
 * Dose/strength field — catalogue strengths as preset buttons plus a free
 * number + unit input, so values like 2.5 mg / 20 mg / 40 mg are always
 * possible. Optional value: none means "no explicit dose recorded".
 */

import { useState } from "react";
import { Check, ChevronDown, Pill } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { RxStrength } from "../schema/rx-item";

const UNIT_OPTIONS = ["mg", "%", "mcg", "ml", "IU"] as const;

const UNIT_KEY: Record<string, RxStrength["unit"]> = {
  mg: "mg",
  "%": "%",
  mcg: "mcg",
  ml: "ml",
  iu: "IU",
};

export function strengthLabel(strength?: RxStrength): string {
  if (!strength) return "Strength";
  return `${strength.value} ${strength.unit}`;
}

export function DoseInput({
  value,
  onChange,
  presets = [],
  disabled,
}: {
  value?: RxStrength;
  onChange: (strength: RxStrength | undefined) => void;
  /** e.g. catalogue strengths: ["5 mg", "10 mg", "20 mg", "40 mg"]. */
  presets?: string[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState(
    value ? String(value.value) : "",
  );
  const [customUnit, setCustomUnit] = useState<(typeof UNIT_OPTIONS)[number]>(
    value ? value.unit : "mg",
  );

  const applyCustom = () => {
    const n = Number(customValue);
    if (Number.isNaN(n) || n < 0) {
      onChange(undefined);
      return;
    }
    onChange({ value: n, unit: customUnit });
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
          <Pill className="h-4 w-4 shrink-0 text-status-info/40" />
          <span className="truncate text-sm">{strengthLabel(value)}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3 bg-surface">
        {presets.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-text-muted">Presets</p>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((preset) => {
                const match = preset.match(
                  /^(\d+(?:\.\d+)?)\s*(mg|mcg|%|ml|IU)$/i,
                );
                const parsed: RxStrength | null = match
                  ? {
                      value: Number(match[1]),
                      unit: UNIT_KEY[match[2]!.toLowerCase()],
                    }
                  : null;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      if (parsed) onChange(parsed);
                      setOpen(false);
                    }}
                    className="rounded-lg px-2 py-1 text-xs text-text-muted hover:bg-app"
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="space-y-2 border-t border-hairline pt-2">
          <p className="text-xs font-medium text-text-muted">Custom</p>
          <div className="flex items-center gap-2">
            <Input
              value={customValue}
              onChange={(event) =>
                setCustomValue(event.target.value.replace(/[^\d.]/g, ""))
              }
              inputMode="decimal"
              aria-label="Strength value"
              placeholder="2.5"
              className="h-8 w-24 border-input-border"
            />
            <select
              value={customUnit}
              onChange={(event) =>
                setCustomUnit(event.target.value as (typeof UNIT_OPTIONS)[number])
              }
              aria-label="Strength unit"
              className="h-8 rounded-lg border border-input-border bg-surface px-1.5 text-xs text-text-primary"
            >
              {UNIT_OPTIONS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
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
          {value ? (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
            >
              Clear strength
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
