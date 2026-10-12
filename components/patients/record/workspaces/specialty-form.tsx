/**
 * Small form primitives shared by the specialty workspace tabs (0077).
 *
 * The snapshot tabs (safety / intake / MSE / care plan / skin profile) are
 * autosave-on-blur like Past History: one narrow server action per note, with a
 * "Saving / Saved / Not saved" state so the write is never silent. Event tabs
 * (sessions, assessments, exams, procedures, photos) use a commit button with a
 * pending state instead, because each one inserts a distinct record rather
 * than patching a row.
 */

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";

import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { NativeSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type NoteState = "idle" | "saving" | "saved" | "error";

/** Inline "Saving / Saved / Not saved" marker, matching Past History. */
export function NoteStatus({ state, message }: { state: NoteState; message?: string | null }) {
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
        {message || "Not saved"}
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

/**
 * A labelled note that saves itself on blur. Uncontrolled, like the rest of the
 * record's autosaving surfaces: `value` is the last-persisted text, `onSave` is
 * called with new text and returns whether the database accepted it. A failed
 * save marks the field "Not saved" and pages can re-blur to retry.
 */
export function AutosaveNote({
  label,
  name,
  value,
  onSave,
  rows = 3,
  placeholder,
  helper,
}: {
  label: string;
  name: string;
  value?: string | null;
  onSave: (next: string) => Promise<boolean>;
  rows?: number;
  placeholder?: string;
  helper?: string;
}) {
  const [state, setState] = useState<NoteState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const persisted = useRef(value ?? "");

  function handleBlur(event: React.FocusEvent<HTMLTextAreaElement>) {
    const next = event.currentTarget.value.trim();
    if (persisted.current === next) return;

    setState("saving");
    startTransition(async () => {
      const ok = await onSave(next);
      if (ok) {
        persisted.current = next;
        setState("saved");
        return;
      }
      setState("error");
      setMessage("Not saved");
    });
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={name} className="text-ink text-[12.5px] font-bold">
          {label}
        </label>
        <NoteStatus state={state} message={message} />
      </div>
      <AutoGrowTextarea
        id={name}
        name={name}
        rows={rows}
        placeholder={placeholder}
        defaultValue={value ?? ""}
        onBlur={handleBlur}
        className={cn(
          "w-full resize-none rounded-control border border-text-muted/25 bg-surface p-2.5 text-[12.5px] leading-relaxed text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-primary/60 focus:ring-2 focus:ring-primary/15",
          state === "error" && "border-status-destructive",
        )}
      />
      {helper && state === "idle" && (
        <p className="mt-1 text-[11px] text-ink-faint">{helper}</p>
      )}
    </div>
  );
}

/** A multi-select chip row for text[] fields (chief complaints, morphology…). */
export function ChipPicker({
  options,
  value,
  onChange,
  label,
  single,
}: {
  options: readonly string[];
  /** Active options; when `single`, the first element is the selection. */
  value: string[];
  onChange: (next: string[]) => void;
  label?: string;
  single?: boolean;
}) {
  function toggle(option: string) {
    if (single) {
      onChange(value.includes(option) || value[0] === option ? [] : [option]);
      return;
    }
    onChange(
      value.includes(option)
        ? value.filter((v) => v !== option)
        : [...value, option],
    );
  }

  return (
    <div>
      {label && (
        <p className="text-ink mb-1.5 text-[12.5px] font-bold">{label}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = value.includes(option) || value[0] === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              aria-pressed={active}
              className={cn(
                "rounded-pill border px-2.5 py-1 text-[11.5px] font-medium capitalize leading-none transition-colors",
                active
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-hairline bg-surface text-text-secondary hover:border-primary/40 hover:text-primary",
              )}
            >
              {option.replace(/_/g, " ")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Section heading used inside the specialty tab panels. */
export function SpecialtyHeading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
          {title}
        </h3>
        {description && (
          <p className="mt-0.5 text-[11px] text-ink-faint">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Bounded-selection primitives (0079)                                       */
/*                                                                            */
/* The snapshot columns are plain text, so a multi-select is persisted as its */
/* comma-joined tokens and read back with `parseList`. Selection saves on the */
/* spot, exactly like AutosaveNote saves on blur — the clinician never has to */
/* remember to press anything. "Other…" keeps a free-text escape hatch so the */
/* 30% judgement case is not lost to a fixed menu.                            */
/* ------------------------------------------------------------------------- */

/** Splits a persisted comma list back into its selected tokens. */
export function parseList(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

/** Serializes selected tokens the way the snapshot text columns store them. */
export function serializeList(tokens: string[]): string {
  return tokens.join(", ");
}

/** Shared autosave state for the selection primitives below. */
function useFieldSave(onSave: (next: string) => Promise<boolean>) {
  const [state, setState] = useState<NoteState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(next: string) {
    setState("saving");
    startTransition(async () => {
      const ok = await onSave(next);
      if (ok) {
        setState("saved");
        return;
      }
      setState("error");
      setMessage("Not saved");
    });
  }

  return { state, message, run };
}

/** Labelled dropdown that saves on change — used where exactly one value wins. */
export function SelectNote({
  label,
  name,
  value,
  options,
  onSave,
  placeholder = "Select…",
  helper,
  disabled = false,
}: {
  label: string;
  name: string;
  value?: string | null;
  options: readonly string[];
  onSave: (next: string) => Promise<boolean>;
  placeholder?: string;
  helper?: string;
  disabled?: boolean;
}) {
  const { state, message, run } = useFieldSave(onSave);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={name} className="text-ink text-[12.5px] font-bold">
          {label}
        </label>
        <NoteStatus state={state} message={message} />
      </div>
      <NativeSelect
        id={name}
        name={name}
        defaultValue={value ?? ""}
        disabled={disabled}
        onChange={(event) => run(event.target.value)}
        className={cn(state === "error" && "border-status-destructive")}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </NativeSelect>
      {helper && state === "idle" && (
        <p className="mt-1 text-[11px] text-ink-faint">{helper}</p>
      )}
    </div>
  );
}

/** Multi- (or single-) select chip row that saves on selection. */
export function ChipNote({
  label,
  value,
  options,
  onSave,
  single = false,
  allowCustom = true,
  helper,
  disabled = false,
}: {
  label: string;
  value?: string | null;
  options: readonly string[];
  onSave: (next: string) => Promise<boolean>;
  single?: boolean;
  allowCustom?: boolean;
  helper?: string;
  disabled?: boolean;
}) {
  const { state, message, run } = useFieldSave(onSave);
  const [selected, setSelected] = useState<string[]>(() => parseList(value));
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState("");

  useEffect(() => {
    setSelected(parseList(value));
  }, [value]);

  const known = new Set(options);
  const customSelected = selected.filter((token) => !known.has(token));
  const showCustomInput = customOpen || customSelected.length > 0;

  function commit(next: string[]) {
    setSelected(next);
    setCustomOpen(next.some((token) => !known.has(token)));
    run(serializeList(next));
  }

  function toggleOption(option: string) {
    if (disabled) return;
    if (single) {
      commit(selected.length === 1 && selected[0] === option ? [] : [option]);
      return;
    }
    commit(
      selected.includes(option)
        ? selected.filter((token) => token !== option)
        : [...selected, option],
    );
  }

  function toggleCustom() {
    if (disabled) return;
    if (showCustomInput) {
      setCustomOpen(false);
      setCustomDraft("");
      if (customSelected.length > 0) {
        commit(selected.filter((token) => known.has(token)));
      }
      return;
    }
    setCustomOpen(true);
    setCustomDraft(customSelected.join(", "));
  }

  function commitCustom() {
    const text = customDraft.trim();
    const kept = selected.filter((token) => known.has(token));
    if (single) {
      commit(text ? [text] : []);
    } else {
      commit(text ? [...kept, text] : kept);
    }
    setCustomOpen(false);
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-ink text-[12.5px] font-bold">{label}</p>
        <NoteStatus state={state} message={message} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggleOption(option)}
              aria-pressed={active}
              disabled={disabled}
              className={cn(
                "rounded-pill border px-2.5 py-1 text-[11.5px] font-medium leading-none transition-colors",
                active
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-hairline bg-surface text-text-secondary hover:border-primary/40 hover:text-primary",
                disabled && "cursor-default opacity-80",
              )}
            >
              {option}
            </button>
          );
        })}
        {allowCustom && !disabled && (
          <button
            type="button"
            onClick={toggleCustom}
            aria-pressed={showCustomInput}
            className={cn(
              "rounded-pill border px-2.5 py-1 text-[11.5px] font-medium leading-none transition-colors",
              showCustomInput
                ? "border-primary bg-primary/10 font-semibold text-primary"
                : "border-dashed border-hairline bg-surface text-text-muted hover:border-primary/40 hover:text-primary",
            )}
          >
            {customSelected.length > 0 && !customOpen
              ? customSelected.join(", ")
              : "Other…"}
          </button>
        )}
      </div>
      {showCustomInput && !disabled && (
        <input
          type="text"
          value={customDraft}
          autoFocus
          placeholder="Type and press Enter"
          onChange={(event) => setCustomDraft(event.target.value)}
          onBlur={commitCustom}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitCustom();
            }
          }}
          className="mt-2 w-full rounded-control border border-text-muted/25 bg-surface px-2.5 py-1.5 text-[12.5px] text-text-primary outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
        />
      )}
      {helper && state === "idle" && (
        <p className="mt-1 text-[11px] text-ink-faint">{helper}</p>
      )}
    </div>
  );
}