"use client";

import { useState } from "react";
import { Clock, Plus, Trash2, Users, X, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WEEKDAY_ORDER } from "@/lib/constants";
import { cn } from "@/lib/utils";

export type SlotEditorInput = {
  dayOfWeek: number;
  slotName: string;
  start: string;
  end: string;
  patientLimit?: number | null;
};

/** Auto-generated vs. hand-added. Regenerating replaces the auto rows only. */
type SlotSource = "generated" | "custom";

type SlotDraft = SlotEditorInput & { id: string; source: SlotSource };

type TimeRangeDraft = { id: string; start: string; end: string };

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Slot A, Slot B … Slot Z, Slot AA, Slot AB … for long lists. */
function slotNameForIndex(index: number): string {
  let n = index;
  let name = "";
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `Slot ${name}`;
}

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Shared recurring-slot editor (Phase 20 for doctors, Phase 21 for services).
 * Day pills switch the active weekday; each row is a named slot with start/end
 * time and — for shared-window parents — its own per-slot Patient Limit.
 * Emits the full list as a hidden `templatesJson` field consumed by both
 * doctor/service server actions via `serviceSlotTemplatesSchema` /
 * `doctorSlotTemplatesSchema`.
 */
export function SlotEditor({
  defaultSlots = [],
  showPatients = false,
}: {
  defaultSlots?: SlotEditorInput[];
  /** Show the per-slot Patient Limit field (shared-window parents only). */
  showPatients?: boolean;
}) {
  const [drafts, setDrafts] = useState<SlotDraft[]>(() =>
    defaultSlots.map((slot) => ({
      id: uid(),
      dayOfWeek: slot.dayOfWeek,
      slotName: slot.slotName,
      start: slot.start.slice(0, 5),
      end: slot.end.slice(0, 5),
      patientLimit: slot.patientLimit ?? null,
      source: "custom",
    })),
  );
  const [activeDay, setActiveDay] = useState(0);

  // Quick-generate state: one or more time ranges + slot duration. Generating
  // fills the ACTIVE day (day pills switch which weekday gets the slots),
  // replacing any previously auto-generated rows for that day while keeping
  // custom slots untouched.
  const [ranges, setRanges] = useState<TimeRangeDraft[]>([
    { id: uid(), start: "09:00", end: "17:00" },
  ]);
  const [duration, setDuration] = useState("30");

  const dayDrafts = drafts.filter((draft) => draft.dayOfWeek === activeDay);

  function updateDraft(id: string, patch: Partial<SlotDraft>) {
    setDrafts((prev) =>
      prev.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)),
    );
  }

  function removeDraft(id: string) {
    setDrafts((prev) => prev.filter((draft) => draft.id !== id));
  }

  function addTimeRange() {
    setRanges((prev) => [
      ...prev,
      { id: uid(), start: "09:00", end: "17:00" },
    ]);
  }

  function updateRange(id: string, patch: Partial<TimeRangeDraft>) {
    setRanges((prev) =>
      prev.map((range) => (range.id === id ? { ...range, ...patch } : range)),
    );
  }

  function removeRange(id: string) {
    setRanges((prev) => prev.filter((range) => range.id !== id));
  }

  /**
   * Compute sequential slots for each time range at the given duration and
   * write them into the active day. An incomplete trailing slice is dropped —
   * slots are uniform-duration blocks, so a ragged tail (e.g. 25 min when the
   * step is 30) is excluded rather than kept as an awkward shorter slot.
   * Regenerating replaces only the active day's auto rows; custom slots persist.
   */
  function generateSlots() {
    const step = Number(duration);
    if (!Number.isFinite(step) || step <= 0 || step > 720) return;

    const next: SlotDraft[] = [];
    let labelIndex = 0;
    for (const range of ranges) {
      const startMin = toMinutes(range.start);
      const endMin = toMinutes(range.end);
      if (startMin >= endMin) continue;
      let cursor = startMin;
      while (cursor + step <= endMin) {
        next.push({
          id: uid(),
          dayOfWeek: activeDay,
          slotName: slotNameForIndex(labelIndex),
          start: minutesToTime(cursor),
          end: minutesToTime(cursor + step),
          patientLimit: null,
          source: "generated",
        });
        labelIndex += 1;
        cursor += step;
      }
    }

    if (next.length === 0) return;

    const nextStarts = new Set(next.map((slot) => slot.start));
    setDrafts((prev) => {
      const kept = prev.filter(
        (draft) =>
          !(
            draft.dayOfWeek === activeDay &&
            (draft.source === "generated" || nextStarts.has(draft.start))
          ),
      );
      if (kept.length + next.length > MAX_TEMPLATES) return prev;
      return [...kept, ...next];
    });
  }

  const templatesJson = JSON.stringify(
    Array.from(
      new Map(
        drafts.map(({ dayOfWeek, slotName, start, end, patientLimit }) => [
          `${dayOfWeek}-${start}`,
          {
            dayOfWeek,
            slotName: slotName || `Day ${WEEKDAY_ORDER[dayOfWeek]}`,
            startTime: start,
            endTime: end,
            patientLimit: patientLimit ?? null,
          },
        ]),
      ).values(),
    ),
  );

  const totalCount = drafts.length;
  const MAX_TEMPLATES = 400;

  function addDraft(dayOfWeek = activeDay) {
    setDrafts((prev) => {
      if (prev.length >= MAX_TEMPLATES) return prev;
      return [
        ...prev,
        {
          id: uid(),
          dayOfWeek,
          slotName: "",
          start: "09:00",
          end: "10:00",
          patientLimit: null,
          source: "custom",
        },
      ];
    });
  }

  return (
    <div className="space-y-4">
      <input type="hidden" name="templatesJson" value={templatesJson} />

      {/* Quick generation: time ranges + slot duration → populated slot list */}
      <div className="space-y-3 rounded-control border border-dashed border-primary/40 bg-primary/5 p-4">
        <div className="flex flex-wrap items-end gap-2">
          {ranges.map((range, index) => (
            <div
              key={range.id}
              className="flex flex-wrap items-end gap-2 rounded-control border border-neutral-borderLight bg-surface p-2"
            >
              <div className="space-y-1">
                <p className="text-xs font-medium text-text-muted">
                  {index === 0 ? "Start time" : "From"}
                </p>
                <input
                  type="time"
                  aria-label={`Start time ${index + 1}`}
                  value={range.start}
                  onChange={(event) =>
                    updateRange(range.id, { start: event.target.value })
                  }
                  className="h-10 rounded-control border border-text-muted/40 bg-surface px-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-text-muted">
                  {index === 0 ? "End time" : "To"}
                </p>
                <input
                  type="time"
                  aria-label={`End time ${index + 1}`}
                  value={range.end}
                  onChange={(event) =>
                    updateRange(range.id, { end: event.target.value })
                  }
                  className="h-10 rounded-control border border-text-muted/40 bg-surface px-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              {ranges.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={() => removeRange(range.id)}
                  aria-label="Remove this time range"
                  className="mb-0.5"
                >
                  <X aria-hidden="true" />
                </Button>
              )}
            </div>
          ))}
          <div className="space-y-1">
            <p className="text-xs font-medium text-text-muted">Slot duration</p>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={5}
                max={720}
                step={5}
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                aria-label="Slot duration in minutes"
                className="w-24"
              />
              <span className="text-sm text-text-muted">min</span>
            </div>
          </div>
          <Button type="button" variant="outline" onClick={addTimeRange}>
            <Plus aria-hidden="true" />
            Add another range
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={generateSlots}>
            <Zap aria-hidden="true" />
            Generate Slots for {WEEKDAY_ORDER[activeDay]}
          </Button>
          <p className="text-xs text-text-muted">
            Fills {WEEKDAY_ORDER[activeDay]} with evenly timed slots (e.g.
            09:00–01:00 PM at 30 min → 8 slots). An incomplete final slice is
            dropped.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_ORDER.map((day, index) => {
            const hasSlots = drafts.some((draft) => draft.dayOfWeek === index);
            return (
              <button
                key={day}
                type="button"
                onClick={() => setActiveDay(index)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                  activeDay === index
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-text-muted/40 text-text-secondary hover:border-primary/40",
                )}
              >
                {hasSlots && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                {day}
              </button>
            );
          })}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-pill px-2.5 py-1 text-xs font-semibold tabular-nums",
            totalCount >= MAX_TEMPLATES
              ? "bg-status-warning/15 text-status-warning"
              : "bg-text-muted/10 text-text-secondary",
          )}
        >
          {totalCount} / {MAX_TEMPLATES} slots this week
        </span>
      </div>

      <div className="space-y-2 rounded-control border border-neutral-borderLight bg-app/50 p-4">
        {dayDrafts.length === 0 ? (
          <p className="text-sm text-text-muted">
            No slots yet for {WEEKDAY_ORDER[activeDay]} — generate them above,
            or add a custom one.
          </p>
        ) : (
          dayDrafts.map((draft) => (
            <div key={draft.id} className="flex flex-wrap items-center gap-2">
              <Input
                value={draft.slotName}
                onChange={(event) =>
                  updateDraft(draft.id, { slotName: event.target.value })
                }
                placeholder="Slot name (e.g. Morning)"
                className="w-36"
              />
              <div className="flex items-center gap-1.5 text-text-muted">
                <Clock className="h-4 w-4" aria-hidden="true" />
                <input
                  type="time"
                  value={draft.start}
                  onChange={(event) =>
                    updateDraft(draft.id, { start: event.target.value })
                  }
                  className="h-10 rounded-control border border-text-muted/40 bg-surface px-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span>to</span>
                <input
                  type="time"
                  value={draft.end}
                  onChange={(event) =>
                    updateDraft(draft.id, { end: event.target.value })
                  }
                  className="h-10 rounded-control border border-text-muted/40 bg-surface px-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              {showPatients && (
                <div className="flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-text-muted" aria-hidden="true" />
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    step={1}
                    value={draft.patientLimit ?? ""}
                    onChange={(event) =>
                      updateDraft(draft.id, {
                        patientLimit:
                          event.target.value === "" ? null : Number(event.target.value),
                      })
                    }
                    placeholder="Patients"
                    aria-label={`Patient limit for ${draft.slotName || "slot"}`}
                    className="w-24"
                  />
                </div>
              )}
              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={() => removeDraft(draft.id)}
                aria-label={`Remove ${draft.slotName || "slot"}`}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          ))
        )}
        <Button variant="outline" size="sm" type="button" onClick={() => addDraft()}>
          <Plus aria-hidden="true" />
          Add custom slot for {WEEKDAY_ORDER[activeDay]}
        </Button>
      </div>
    </div>
  );
}