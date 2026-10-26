"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  PSYCH_GOAL_STATUSES,
  type PsychGoalStatus,
  type PsychSmartGoal,
} from "@/types/database";

/** Color-coded lifecycle pills; reused by the print surface. */
export const PSYCH_GOAL_STATUS_META: Record<
  PsychGoalStatus,
  { label: string; badge: string; dot: string }
> = {
  active: {
    label: "Active",
    badge: "bg-blue-500/10 text-blue-600",
    dot: "bg-blue-500",
  },
  in_progress: {
    label: "In Progress",
    badge: "bg-amber-500/10 text-amber-600",
    dot: "bg-amber-500",
  },
  achieved: {
    label: "Achieved",
    badge: "bg-emerald-500/10 text-emerald-600",
    dot: "bg-emerald-500",
  },
  discontinued: {
    label: "Discontinued",
    badge: "bg-rose-500/10 text-rose-600",
    dot: "bg-rose-400",
  },
};

const STATUS_DOT_COLOR: Record<PsychGoalStatus, string> = {
  active: "text-blue-600",
  in_progress: "text-amber-600",
  achieved: "text-emerald-600",
  discontinued: "text-rose-500",
};

function newGoal(): PsychSmartGoal {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `goal-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    title: "",
    target_date: null,
    status: "active",
    baseline_metric: "",
    target_metric: "",
  };
}

/**
 * Care Plan Goal Builder (0118) — the structured replacement for the free-text
 * "Therapy goals" textarea.
 *
 * One card per SMART goal. Editing any field schedules a debounced save of the
 * WHOLE goals array (the column is a single JSONB value, so partial updates are
 * not possible). The save state shows one shared line under the list — a
 * per-card spinner would just add noise during bulk editing.
 *
 * The same data feeds the Overview `CarePlanSnapshotCard`, the Care Plan print
 * surface and Push-to-Session-Note, so editing here refreshes everywhere.
 */
export function CarePlanGoalBuilder({
  goals,
  canManage,
  onSave,
}: {
  goals: PsychSmartGoal[];
  canManage: boolean;
  onSave: (goals: PsychSmartGoal[]) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<PsychSmartGoal[]>(goals);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  // Only this component writes `goals`, so an incoming prop change always
  // reflects a completed save (this tab's own refresh) or a fresh load.
  useEffect(() => {
    if (dirtyRef.current) return;
    setDraft(goals);
  }, [goals]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  function scheduleSave(next: PsychSmartGoal[]) {
    dirtyRef.current = true;
    setDraft(next);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setStatus("saving");
    timerRef.current = window.setTimeout(() => {
      void onSave(next).then((ok) => {
        if (ok) {
          dirtyRef.current = false;
          setStatus("saved");
        } else {
          setStatus("error");
        }
      });
    }, 800);
  }

  function update(index: number, patch: Partial<PsychSmartGoal>) {
    if (!canManage) return;
    scheduleSave(draft.map((goal, i) => (i === index ? { ...goal, ...patch } : goal)));
  }

  function remove(index: number) {
    if (!canManage) return;
    scheduleSave(draft.filter((_, i) => i !== index));
  }

  function add() {
    if (!canManage) return;
    scheduleSave([...draft, newGoal()]);
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-bold text-ink">SMART goals</p>
        {status !== "idle" && (
          <span
            className={cn(
              "flex items-center gap-1 text-[10px] font-semibold",
              status === "saving" && "text-text-muted",
              status === "saved" && "text-emerald-600",
              status === "error" && "text-status-destructive",
            )}
          >
            {status === "saving" && <Spinner size="sm" />}
            {status === "saving" && "Saving…"}
            {status === "saved" && "Saved ✓"}
            {status === "error" && "Not saved — retry an edit"}
          </span>
        )}
      </div>

      {draft.length === 0 ? (
        <p className="rounded-card border border-dashed border-text-muted/30 bg-app/40 px-4 py-4 text-center text-xs text-text-muted">
          No structured goals yet. A clinical-focus row without goals is unusual for a
          psych case.
        </p>
      ) : (
        <ul className="space-y-2">
          {draft.map((goal, index) => (
            <li
              key={goal.id ?? index}
              className="rounded-card border border-text-muted/20 bg-surface p-3"
            >
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <div className="md:col-span-2">
                  <Input
                    value={goal.title}
                    disabled={!canManage}
                    placeholder="Goal (e.g. “Return to classes with 3 nights/week attended”)"
                    className="text-sm"
                    onChange={(event) => update(index, { title: event.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2 md:justify-end">
                  <input
                    type="date"
                    value={goal.target_date ?? ""}
                    disabled={!canManage}
                    aria-label="Target date"
                    className="h-9 rounded-control border border-text-muted/40 bg-surface px-2 text-xs text-text-primary disabled:opacity-50"
                    onChange={(event) =>
                      update(index, { target_date: event.target.value || null })
                    }
                  />
                  {canManage && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0 text-status-destructive hover:text-status-destructive"
                      aria-label={`Remove goal ${goal.title || index + 1}`}
                      onClick={() => remove(index)}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Goal status">
                  {PSYCH_GOAL_STATUSES.map((value) => {
                    const meta = PSYCH_GOAL_STATUS_META[value];
                    const active = goal.status === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={!canManage}
                        aria-pressed={active}
                        onClick={() => update(index, { status: value })}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-50",
                          active
                            ? meta.badge
                            : "border-text-muted/25 text-text-muted hover:text-text-secondary",
                          active && "border-transparent",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn("size-1.5 rounded-full", meta.dot)}
                        />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>

                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Input
                    value={goal.baseline_metric}
                    disabled={!canManage}
                    placeholder="Baseline (e.g. PHQ-9: 18)"
                    aria-label="Baseline metric"
                    className="h-8 w-44 text-xs"
                    onChange={(event) =>
                      update(index, { baseline_metric: event.target.value })
                    }
                  />
                  <span aria-hidden="true" className={cn("text-xs", STATUS_DOT_COLOR[goal.status])}>
                    →
                  </span>
                  <Input
                    value={goal.target_metric}
                    disabled={!canManage}
                    placeholder="Target (e.g. PHQ-9 ≤ 7)"
                    aria-label="Target metric"
                    className="h-8 w-44 text-xs"
                    onChange={(event) =>
                      update(index, { target_metric: event.target.value })
                    }
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={add}
        >
          <Plus aria-hidden="true" />
          Add SMART Goal
        </Button>
      )}
    </div>
  );
}
