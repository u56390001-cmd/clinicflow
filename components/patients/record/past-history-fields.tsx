"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import {
  Check,
  ClipboardList,
  Loader2,
  Pencil,
  TriangleAlert,
} from "lucide-react";

import {
  PAST_HISTORY_CARD_CLASS,
  PAST_HISTORY_FIELDS,
  PAST_HISTORY_FIELD_CLASS,
  PAST_HISTORY_RULE_CLASS,
  PAST_HISTORY_TILE_CLASS,
  PAST_HISTORY_TILE_TITLE_CLASS,
  type PastHistoryColumn,
} from "@/components/patients/record/past-history-config";
import { Button } from "@/components/ui/button";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { updatePatientPastHistoryAction } from "@/lib/actions/patients";
import { cn } from "@/lib/utils";

type FieldState = "idle" | "saving" | "saved" | "error";

/**
 * Split a free-text answer into the lines a clinician typed.
 *
 * Newlines only, never commas: these are sentences ("Diabetes since 2019,
 * Hypertension since 2021") and "Father: Hypertension, Diabetes" is one fact about
 * one relative. Splitting on commas would turn both into fragments.
 */
function answerLines(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Past History — the six free-text answers from `docs/HEALTH INFO.txt`.
 *
 * Read-only by default, as six tiles in a two-column grid, with "Edit health
 * info" opening the six textareas. This used to render all six textareas live in
 * the tab at all times: six boxes three rows deep, most of them empty, which on a
 * patient with a sparse history meant the tab's first screen was six empty
 * rectangles and the actual record was below the fold. A doctor reading history is
 * not editing it, so the default view now shows text, and editing is one click
 * away.
 *
 * The textareas keep the reference card's own border, radius and padding, and
 * still autosave per column on blur — one narrow server action per column rather
 * than a full patient update that could race another form's changes. The patient
 * form popup edits the same six columns, so the two paths stay in sync through
 * the database rather than through duplicated form state.
 *
 * A save that fails reverts the field to its last persisted value rather than
 * leaving the screen showing something the database never accepted.
 */
export function PastHistoryFields({
  patientId,
  values,
  canManage,
}: {
  patientId: string;
  values: Record<PastHistoryColumn, string | null>;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [states, setStates] = useState<
    Partial<Record<PastHistoryColumn, FieldState>>
  >({});
  const [error, setError] = useState<
    Partial<Record<PastHistoryColumn, string>>
  >({});
  const [, startTransition] = useTransition();

  // The value last known to be in the database per column. Compared on blur so
  // clicking in and out of an untouched box does not fire six writes.
  const saved = useRef<Record<PastHistoryColumn, string>>(
    Object.fromEntries(
      PAST_HISTORY_FIELDS.map(({ column }) => [column, values[column] ?? ""]),
    ) as Record<PastHistoryColumn, string>,
  );

  const save = useCallback(
    (column: PastHistoryColumn, next: string) => {
      if (saved.current[column] === next) return;

      setStates((s) => ({ ...s, [column]: "saving" }));
      setError((e) => ({ ...e, [column]: undefined }));

      startTransition(async () => {
        const result = await updatePatientPastHistoryAction({
          patientId,
          field: column,
          value: next,
        });

        if (result.ok) {
          saved.current[column] = next;
          setStates((s) => ({ ...s, [column]: "saved" }));
          return;
        }

        setStates((s) => ({ ...s, [column]: "error" }));
        setError((e) => ({ ...e, [column]: result.message }));
      });
    },
    [patientId],
  );

  return (
    <section>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
            Past History
          </h3>
          <p className="text-ink-faint mt-0.5 text-[11px]">
            Structured clinical background & lifestyle factors
          </p>
        </div>
        {canManage && (
          <Button
            type="button"
            variant={editing ? "outline" : "ghost"}
            size="sm"
            className="gap-1.5 text-[12px]"
            aria-pressed={editing}
            onClick={() => setEditing((open) => !open)}
          >
            {editing ? (
              <ClipboardList aria-hidden="true" className="size-3.5" />
            ) : (
              <Pencil aria-hidden="true" className="size-3.5" />
            )}
            {editing ? "Done editing" : "Edit health info"}
          </Button>
        )}
      </div>

      {editing && canManage ? (
        /* Editing keeps the reference card: six labelled textareas with their
           own save state, because that is the surface the reference specifies
           and it is the one that reads correctly while typing. */
        <div className={PAST_HISTORY_CARD_CLASS}>
          {PAST_HISTORY_FIELDS.map(({ column, label, placeholder, rule }) => {
            const state = states[column] ?? "idle";
            const message = error[column];

            return (
              <div key={column} className={cn(rule && PAST_HISTORY_RULE_CLASS)}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label
                    htmlFor={`past-history-${column}`}
                    className="text-ink text-[12.5px] font-bold"
                  >
                    {label}
                  </label>
                  {/* The reference card's label row is space-between; this fills
                      the right-hand side with the save state so autosave is never
                      silent, which matters when there is no Save button. */}
                  <FieldStatus state={state} />
                </div>
                <AutoGrowTextarea
                  id={`past-history-${column}`}
                  name={column}
                  rows={3}
                  placeholder={placeholder}
                  defaultValue={values[column] ?? ""}
                  onBlur={(event) => save(column, event.currentTarget.value)}
                  className={cn(
                    PAST_HISTORY_FIELD_CLASS,
                    state === "error" && "border-status-destructive",
                  )}
                />
                {message && (
                  <p className="mt-1 text-[11px] text-status-destructive">
                    {message}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {PAST_HISTORY_FIELDS.map(({ column, label }) => {
            const lines = answerLines(values[column]);
            return (
              <div key={column} className={PAST_HISTORY_TILE_CLASS}>
                <h4 className={PAST_HISTORY_TILE_TITLE_CLASS}>{label}</h4>
                {lines.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {lines.map((line, index) => (
                      <p
                        key={index}
                        className="text-[12px] leading-relaxed text-text-secondary"
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                ) : (
                  /* A named empty state rather than nothing: the doctor needs to
                     see that immunisations were never recorded, which is
                     different from not knowing the field exists. */
                  <p className="text-ink-faint text-[12px] italic leading-relaxed">
                    No history recorded
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function FieldStatus({ state }: { state: FieldState }) {
  if (state === "saving") {
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium text-text-muted">
        <Loader2 aria-hidden="true" className="size-3 animate-spin" />
        Saving
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="flex items-center gap-1 text-[11px] font-semibold text-status-destructive">
        <TriangleAlert aria-hidden="true" className="size-3" />
        Not saved
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
        <Check aria-hidden="true" className="size-3" />
        Saved
      </span>
    );
  }
  return null;
}
