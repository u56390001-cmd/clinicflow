"use client";

/**
 * Taper builder — an ordered list of steps, each a (frequency, duration)
 * pair applied during the taper-down period. Add/remove/reorder with
 * keyboard-accessible buttons.
 */

import { ArrowDown, ArrowUp, Trash2, TrendingDown } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { Frequency, Duration, TaperStep as TaperStepType } from "../schema/rx-item";
import { DurationPicker } from "./duration-picker";
import { FrequencyPicker } from "./frequency-picker";

export function TaperBuilder({
  steps,
  onChange,
  disabled,
}: {
  steps: TaperStepType[];
  onChange: (steps: TaperStepType[]) => void;
  disabled?: boolean;
}) {
  const update = (index: number, patch: Partial<TaperStepType>) => {
    onChange(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  };

  const move = (index: number, delta: -1 | 1) => {
    const to = index + delta;
    if (to < 0 || to >= steps.length) return;
    const next = [...steps];
    const [moved] = next.splice(index, 1);
    next.splice(to, 0, moved!);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-text-muted">
        Step-wise plan taper (topical steroids pe zaroori)
      </p>
      {steps.map((step, index) => (
        <div
          key={index}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-app px-2.5 py-2"
        >
          <span className="text-xs text-text-muted">#{index + 1}</span>
          <FrequencyPicker
            value={step.frequency}
            onChange={(frequency: Frequency) => update(index, { frequency })}
            disabled={disabled}
          />
          <DurationPicker
            value={step.duration}
            onChange={(duration: Duration) => update(index, { duration })}
            disabled={disabled}
          />
          <div className="ml-auto flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="p-1.5"
              aria-label={`Step ${index + 1} ko upar move karen`}
              disabled={disabled}
              onClick={() => move(index, -1)}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="p-1.5"
              aria-label={`Step ${index + 1} ko neeche move karen`}
              disabled={disabled}
              onClick={() => move(index, 1)}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="p-1.5 text-status-destructive"
              aria-label={`Step ${index + 1} hatayen`}
              disabled={disabled}
              onClick={() =>
                onChange(
                  steps.length === 1
                    ? []
                    : steps.filter((_, i) => i !== index),
                )
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() =>
          onChange([
            ...steps,
            {
              frequency: { kind: "daily", morning: 1, noon: 0, night: 0 },
              duration: { kind: "fixed", value: 1, unit: "week" },
            },
          ])
        }
      >
        <TrendingDown className="h-3.5 w-3.5" />
        Add step
      </Button>
    </div>
  );
}
