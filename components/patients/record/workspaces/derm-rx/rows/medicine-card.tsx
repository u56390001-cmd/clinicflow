"use client";

/**
 * Accordion medicine card — numbered, bordered card; ONE row open at a time
 * (parent owns activeId). Closed line: #, bold drug, route tag, summary
 * ("Night · Face · 6 weeks"), edit & delete. Drag reorder with keyboard
 * alternative buttons. No pill grids, no wrapping chips.
 */

import { memo, useEffect, useState } from "react";
import {
  ChevronDown,
  Copy,
  GripVertical,
  Heart,
  Trash2,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import { autoInstructionText } from "./auto-instruction";
import { frequencyLabel } from "../fields/frequency-picker";
import { durationLabel } from "../fields/duration-picker";
import { TaperBuilder } from "../fields/taper-builder";
import { IntralesionalFields } from "./intralesional-fields";
import { OralFields } from "./oral-fields";
import { Field, ROW_GRID } from "./field-grid";
import { TopicalFields } from "./topical-fields";
import type { RxItem, RxRoute } from "../schema/rx-item";
import type {
  RxItemIntralesional,
  RxItemOral,
  RxItemTopical,
} from "./rx-item-view";

const ROUTE_LABEL: Record<RxRoute, string> = {
  topical: "Topical",
  oral: "Oral",
  intralesional: "Intralesional",
};

const ROUTES: RxRoute[] = ["topical", "oral", "intralesional"];

/** Compact "Night · Face · 6 weeks" summary for the collapsed row. */
export function summarizeItem(item: RxItem): string {
  const parts: string[] = [];

  if (item.frequency.kind === "daily") {
    const slots: string[] = [];
    if (item.frequency.morning > 0) slots.push("Morning");
    if (item.frequency.noon > 0) slots.push("Afternoon");
    if (item.frequency.night > 0) slots.push("Night");
    parts.push(slots.join("+") || "Daily");
  } else {
    parts.push(frequencyLabel(item.frequency));
  }

  const site = "sites" in item ? (item.sites?.[0] ?? null) : null;
  if (site) parts.push(site.replace(/^Pin\s*#\d+\s*[-–—]\s*/, ""));

  const dur = durationLabel(item.duration);
  if (item.duration.kind !== "custom") {
    parts.push(
      dur
        .replace("Days", "days")
        .replace("Weeks", "weeks")
        .replace("Months", "months"),
    );
  } else {
    parts.push(dur);
  }
  return parts.join(" · ");
}

export type MedicineCardProps = {
  item: RxItem;
  index: number;
  active: boolean;
  isLast: boolean;
  lesionSites: string[];
  strengthPresets: string[];
  isFavorite: boolean;
  onActivate: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<RxItem>) => void;
  onChangeRoute: (id: string, route: RxRoute) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onToggleFavorite: () => void;
  onReorder: (from: number, to: number) => void;
};

export const MedicineCard = memo(function MedicineCard({
  item,
  index,
  active,
  isLast,
  lesionSites,
  strengthPresets,
  isFavorite,
  onActivate,
  onUpdate,
  onChangeRoute,
  onRemove,
  onDuplicate,
  onToggleFavorite,
  onReorder,
}: MedicineCardProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [brandDraft, setBrandDraft] = useState<string | null>(null);

  // Escape collapses the expanded card; focus is kept out of the way silently.
  useEffect(() => {
    if (!active) setBrandDraft(null);
  }, [active]);

  const instruction = item.instruction;
  const autoText =
    instruction.mode === "auto" ? autoInstructionText(item) : instruction.text;
  const shownText = instruction.mode === "auto" ? autoText : instruction.text;

  return (
    <article
      className={
        "relative overflow-hidden rounded-xl border bg-surface transition-colors " +
        (active
          ? "border-primary/50 shadow-[inset_0_0_0_0,0_1px_2px_rgba(0,0,0,0.04)]"
          : "border-card-line hover:border-hairline")
      }
      draggable={!active}
      onDragStart={(event) => {
        try {
          event.dataTransfer.setData(
            "text/plain",
            String(index),
          );
        } catch {
          // DataTransfer may be unavailable during certain automation flows.
        }
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const from = Number(event.dataTransfer.getData("text/plain"));
        if (!Number.isInteger(from)) return;
        if (from !== index) onReorder(from, index);
      }}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1.5 rounded-l-xl bg-primary"
        />
      ) : null}

      <header
        className={
          "flex items-center gap-2.5 px-3.5 py-2.5 " +
          (active ? "pl-5" : "")
        }
      >
        <span
          className={
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-semibold " +
            (active
              ? "bg-primary text-white"
              : "bg-chip text-text-muted")
          }
        >
          {index + 1}
        </span>

        {active ? (
          <Input
            value={brandDraft ?? item.brand}
            aria-label={`Medicine name ${index + 1}`}
            onChange={(event) => setBrandDraft(event.target.value)}
            onBlur={() => {
              if (brandDraft !== null && brandDraft.trim() !== "") {
                onUpdate(item.id, { brand: brandDraft.trim() });
              }
              setBrandDraft(null);
            }}
            autoFocus
            className="h-8 w-64 border-input-border font-semibold focus-visible:ring-2 focus-visible:ring-primary/50"
          />
        ) : (
          <button
            type="button"
            onClick={() => onActivate(item.id)}
            className="max-w-52 truncate text-left text-sm font-semibold text-text-primary"
          >
            {item.brand}
          </button>
        )}

        <span
          className={
            "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
            (item.route === "topical"
              ? " bg-primary-tint text-primary"
              : item.route === "oral"
                ? " bg-[#eef3fb] text-[#2b5aa7]"
                : " bg-[#f2edfb] text-[#5c3a9d]")
          }
        >
          {ROUTE_LABEL[item.route]}
        </span>

        {!active ? (
          <span className="min-w-0 flex-1 truncate text-xs text-text-muted">
            {summarizeItem(item)}
          </span>
        ) : (
          <span className="flex-1" />
        )}

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={
              isFavorite ? "Favourites se hatayen" : "Favourites mein save karen"
            }
            className="rounded-lg p-1.5 text-text-muted/70 hover:text-primary"
            onClick={onToggleFavorite}
          >
            <Heart
              className={
                "h-4 w-4 " +
                (isFavorite ? "fill-current text-primary" : "")
              }
            />
          </button>
          <button
            type="button"
            aria-label="Duplicate karen"
            className="rounded-lg p-1.5 text-text-muted/70 hover:text-text-primary"
            onClick={() => onDuplicate(item.id)}
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Remove (undo sajta hai)"
            className="rounded-lg p-1.5 text-text-muted/70 hover:text-status-destructive"
            onClick={() => onRemove(item.id)}
          >
            <Trash2 className="h-4 w-4" />
          </button>
          {!active ? (
            <>
              <button
                type="button"
                aria-label="Edit karen"
                className="rounded-lg p-1.5 text-text-muted/70 hover:text-text-primary"
                onClick={() => onActivate(item.id)}
              >
                <ChevronDown className="h-4 w-4 -rotate-90" />
              </button>
              <GripVertical
                aria-hidden
                className="h-4 w-4 text-text-muted/40"
              />
            </>
          ) : (
            <button
              type="button"
              aria-label="Collapse karen"
              className="rounded-lg p-1.5 text-text-muted/70 hover:text-text-primary"
              onClick={() => onActivate(null)}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {active ? (
        <div className="space-y-3 border-t border-card-line px-3.5 pb-3.5 pt-3 pl-5 pr-3.5">
          <div
            role="radiogroup"
            aria-label="Route"
            className="inline-flex gap-1 rounded-xl border border-hairline bg-app p-1"
          >
            {ROUTES.map((route) => (
              <button
                key={route}
                type="button"
                role="radio"
                aria-checked={item.route === route}
                onClick={() => onChangeRoute(item.id, route)}
                className={
                  "rounded-lg px-3 py-1 text-xs font-medium transition-colors " +
                  (item.route === route
                    ? " bg-primary text-white"
                    : " text-text-muted hover:text-text-primary")
                }
              >
                {ROUTE_LABEL[route]}
              </button>
            ))}
          </div>

          {item.route === "topical" ? (
            <TopicalFields
              item={item as RxItemTopical}
              lesionSites={lesionSites}
              strengthPresets={strengthPresets}
              onChange={(patch) => onUpdate(item.id, patch as Partial<RxItem>)}
            />
          ) : item.route === "oral" ? (
            <OralFields
              item={item as RxItemOral}
              strengthPresets={strengthPresets}
              onChange={(patch) => onUpdate(item.id, patch as Partial<RxItem>)}
            />
          ) : (
            <IntralesionalFields
              item={item as RxItemIntralesional}
              lesionSites={lesionSites}
              onChange={(patch) => onUpdate(item.id, patch as Partial<RxItem>)}
            />
          )}

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-text-muted">
                Instructions
              </span>
              <span
                className={
                  "rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
                  (instruction.mode === "auto"
                    ? " bg-primary-tint text-primary"
                    : " bg-chip text-text-muted")
                }
              >
                {instruction.mode === "auto" ? "Auto" : "Custom"}
              </span>
              {instruction.mode === "custom" ? (
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                  onClick={() =>
                    onUpdate(item.id, {
                      instruction: { mode: "auto", text: "" },
                    })
                  }
                >
                  <Undo2 className="h-3 w-3" />
                  Reset to Auto
                </button>
              ) : null}
            </div>
            <textarea
              value={shownText}
              rows={2}
              onChange={(event) =>
                onUpdate(item.id, {
                  instruction: {
                    mode: "custom",
                    text: event.target.value,
                  },
                })
              }
              className="w-full resize-y rounded-lg border border-input-border bg-surface px-2.5 py-2 text-sm text-text-primary placeholder:text-text-muted/60 focus-visible:outline-2 focus-visible:outline-primary/50"
            />
          </div>

          <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((current) => !current)}
            className="text-xs font-medium text-primary hover:underline"
          >
            {moreOpen ? "Hide more options" : "More options"}
          </button>

          {moreOpen ? (
            <div
              className={
                ROW_GRID + " space-y-3 border-t border-card-line pt-3"
              }
            >
              <Field label="Taper plan">
                <TaperBuilder
                  steps={item.taper ?? []}
                  onChange={(taper) =>
                    onUpdate(item.id, { taper: taper.length > 0 ? taper : undefined })
                  }
                />
              </Field>
              {item.route !== "intralesional" ? (
                <Field label="Quantity" hint="e.g. 1 tube, 30 tablets">
                  <input
                    type="text"
                    value={item.quantity ?? ""}
                    onChange={(event) =>
                      onUpdate(item.id, {
                        quantity: event.target.value || undefined,
                      })
                    }
                    className="h-9 w-full rounded-lg border border-input-border bg-surface px-2.5 text-sm"
                  />
                </Field>
              ) : null}
              <Field label="Substitution allowed?">
                <div className="flex h-9 items-center gap-2 text-xs text-text-muted">
                  <Switch
                    checked={item.substitutionAllowed}
                    onCheckedChange={(checked) =>
                      onUpdate(item.id, { substitutionAllowed: checked })
                    }
                    aria-label="Pharmacist substitution allowed"
                  />
                  {item.substitutionAllowed ? "Allowed" : "Brand only"}
                </div>
              </Field>
              <Field label="Move row" hint="keyboard alternative to drag">
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={index === 0}
                    onClick={() => onReorder(index, index - 1)}
                  >
                    Up
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onReorder(index, index + 1)}
                    disabled={isLast}
                  >
                    Down
                  </Button>
                </div>
              </Field>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
});
