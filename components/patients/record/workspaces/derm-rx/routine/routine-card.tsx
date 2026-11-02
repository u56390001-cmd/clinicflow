"use client";

/**
 * AM/PM routine card — two columns (Subah | Raat) filled from the STRUCTURED
 * daily slots, plus an "Other schedule" list (weekly/alternate/SOS items).
 * Skincare steps are editable, addable, reorderable; serialized into the
 * existing `skincare_routine_am/pm` TEXT columns one step per line, so old
 * rows stay readable.
 */

import { useState } from "react";
import { ArrowDown, ArrowUp, Moon, Plus, Sun, Trash2, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { RxItem } from "../schema/rx-item";
import { splitBySchedule } from "./routine";

export function itemRoutineLine(item: RxItem): string {
  const parts: string[] = [item.brand];
  const site =
    "sites" in item && item.sites?.length ? item.sites[0]! : null;
  if (site) parts.push(site.replace(/^Pin\s*#\d+\s*[-–—]\s*/, ""));
  const strength = "strength" in item && item.strength
    ? `${item.strength.value} ${item.strength.unit}`
    : null;
  if (strength) parts.push(strength);
  return parts.join(" — ");
}

export function RoutineCard({
  items,
  stepsAm,
  stepsPm,
  canManage,
  onChangeStepsAm,
  onChangeStepsPm,
}: {
  items: RxItem[];
  stepsAm: string[];
  stepsPm: string[];
  canManage: boolean;
  onChangeStepsAm: (steps: string[]) => void;
  onChangeStepsPm: (steps: string[]) => void;
}) {
  const split = splitBySchedule(items);
  const [newAm, setNewAm] = useState("");
  const [newPm, setNewPm] = useState("");

  const stepsColumn = (
    side: "am" | "pm",
    steps: string[],
    onChange: (next: string[]) => void,
    value: string,
    setValue: (next: string) => void,
  ) => (
    <div className="space-y-1.5">
      <ul className="space-y-1">
        {steps.map((step, index) => (
          <li
            key={`${side}-${index}-${step}`}
            className="flex items-center gap-1 rounded-lg bg-app px-2 py-1.5 text-xs text-text-primary"
          >
            <span className="min-w-0 flex-1 break-words">{step}</span>
            {canManage ? (
              <>
                <button
                  type="button"
                  aria-label="Upar move karen"
                  className="rounded p-0.5 text-text-muted/60 hover:text-text-primary"
                  disabled={index === 0}
                  onClick={() => {
                    const next = [...steps];
                    const [moved] = next.splice(index, 1);
                    next.splice(index - 1, 0, moved!);
                    onChange(next);
                  }}
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  aria-label="Neeche move karen"
                  className="rounded p-0.5 text-text-muted/60 hover:text-text-primary"
                  disabled={index === steps.length - 1}
                  onClick={() => {
                    const next = [...steps];
                    const [moved] = next.splice(index, 1);
                    next.splice(index + 1, 0, moved!);
                    onChange(next);
                  }}
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  aria-label="Step hatayen"
                  className="rounded p-0.5 text-text-muted/60 hover:text-status-destructive"
                  onClick={() => onChange(steps.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="flex gap-1.5">
        <Input
          value={value}
          disabled={!canManage}
          onChange={(event) => setValue(event.target.value)}
          placeholder={side === "am" ? "e.g. Sunscreen SPF 50" : "e.g. Moisturiser"}
          className="h-8 border-input-border text-xs"
          onKeyDown={(event) => {
            if (event.key === "Enter" && value.trim()) {
              event.preventDefault();
              onChange([...steps, value.trim()]);
              setValue("");
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2"
          disabled={!canManage || !value.trim()}
          onClick={() => {
            if (!value.trim()) return;
            onChange([...steps, value.trim()]);
            setValue("");
          }}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-card-line bg-surface">
      <div className="flex items-center justify-between border-b border-card-line px-3.5 py-2">
        <p className="text-sm font-semibold text-text-primary">
          Subah / Raat routine
        </p>
        <span className="text-xs text-text-muted">
          structured frequency se banti hai
        </span>
      </div>
      <div className="grid gap-4 p-3.5 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-status-info">
            <Sun className="h-3.5 w-3.5" /> Subah
          </p>
          {split.am.length === 0 ? (
            <p className="mb-1 text-xs italic text-text-muted/70">
              Koi morning medicine nahi
            </p>
          ) : (
            <ul className="mb-2 space-y-1">
              {split.am.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-card-line px-2 py-1.5 text-xs text-text-primary"
                >
                  {itemRoutineLine(item)}
                </li>
              ))}
            </ul>
          )}
          {stepsColumn("am", stepsAm, onChangeStepsAm, newAm, setNewAm)}
        </div>
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[#5c3a9d]">
            <Moon className="h-3.5 w-3.5" /> Raat
          </p>
          {split.pm.length === 0 ? (
            <p className="mb-1 text-xs italic text-text-muted/70">
              Koi night medicine nahi
            </p>
          ) : (
            <ul className="mb-2 space-y-1">
              {split.pm.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-card-line px-2 py-1.5 text-xs text-text-primary"
                >
                  {itemRoutineLine(item)}
                </li>
              ))}
            </ul>
          )}
          {stepsColumn("pm", stepsPm, onChangeStepsPm, newPm, setNewPm)}
        </div>
      </div>
      {split.other.length > 0 ? (
        <div className="border-t border-card-line px-3.5 py-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-text-muted">
            <Zap className="h-3.5 w-3.5" /> Other schedule
          </p>
          <ul className="space-y-1">
            {split.other.map(({ item, reason }) => (
              <li
                key={`other-${item.id}`}
                className="flex items-baseline gap-2 rounded-lg border border-card-line px-2 py-1.5 text-xs"
              >
                <span className="min-w-0 flex-1 truncate text-text-primary">
                  {itemRoutineLine(item)}
                </span>
                <span className="shrink-0 rounded-md bg-chip px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
                  {reason}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {items.length === 0 ? (
        <p className="px-3.5 pb-3 text-xs italic text-text-muted/70">
          Medicines add karo, routine khud ban jayegi
        </p>
      ) : null}
    </div>
  );
}
