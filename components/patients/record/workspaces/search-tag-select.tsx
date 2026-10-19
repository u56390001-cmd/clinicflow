"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved" | "error";

function parse(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

/**
 * A searchable multi-select with a free-text escape hatch, for clinical
 * vocabularies that are long enough to scan but never complete (previous
 * diagnoses). Selected tokens persist as a comma list through `onSave`; the
 * "Add …" row keeps the 30%-judgement case out of the fixed menu.
 */
export function SearchTagSelect({
  label,
  value,
  options,
  onSave,
  placeholder = "Search or add…",
  helper,
  disabled = false,
  hideSelectedChips = false,
}: {
  label: string;
  value?: string | null;
  options: readonly string[];
  onSave: (next: string) => Promise<boolean>;
  placeholder?: string;
  helper?: string;
  disabled?: boolean;
  /** Search/create-only mode: skip the chips row (a sibling control already
   *  renders the selection as toggleable chips). */
  hideSelectedChips?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>(() => parse(value));
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [state, setState] = useState<SaveState>("idle");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelected(parse(value));
  }, [value]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return options.filter(
      (option) =>
        !selected.includes(option) &&
        (needle === "" || option.toLowerCase().includes(needle)),
    );
  }, [options, query, selected]);

  const trimmedQuery = query.trim();
  const canAddCustom =
    trimmedQuery.length > 0 &&
    !options.some(
      (option) => option.toLowerCase() === trimmedQuery.toLowerCase(),
    ) &&
    !selected.some(
      (option) => option.toLowerCase() === trimmedQuery.toLowerCase(),
    );

  const rows = canAddCustom ? filtered.length + 1 : filtered.length;

  async function commit(next: string[]) {
    setSelected(next);
    setState("saving");
    const ok = await onSave(next.join(", "));
    setState(ok ? "saved" : "error");
  }

  function add(token: string) {
    const clean = token.trim();
    if (!clean || selected.includes(clean)) return;
    setQuery("");
    setHighlight(0);
    void commit([...selected, clean]);
  }

  function remove(token: string) {
    void commit(selected.filter((item) => item !== token));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((index) => Math.min(index + 1, Math.max(rows - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (canAddCustom && highlight === filtered.length) {
        add(trimmedQuery);
      } else if (filtered[highlight]) {
        add(filtered[highlight]);
      } else if (canAddCustom) {
        add(trimmedQuery);
      }
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "Backspace" && query === "" && selected.length > 0) {
      remove(selected[selected.length - 1]);
    }
  }

  const statusLabel =
    state === "saving"
      ? "Saving"
      : state === "saved"
        ? "Saved"
        : state === "error"
          ? "Not saved"
          : "";

  return (
    <div ref={rootRef} className="relative">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-ink text-[12.5px] font-bold">{label}</p>
        {statusLabel && (
          <span
            className={cn(
              "text-[11px] font-medium",
              state === "error" ? "text-status-destructive" : "text-text-muted",
            )}
          >
            {statusLabel}
          </span>
        )}
      </div>

      {!hideSelectedChips && selected.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {selected.map((token) => (
            <span
              key={token}
              className="inline-flex items-center gap-1 rounded-pill border border-primary/30 bg-primary/10 py-1 pl-2.5 pr-1.5 text-[11.5px] font-medium text-primary"
            >
              {token}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(token)}
                  aria-label={`Remove ${token}`}
                  className="rounded-pill p-0.5 hover:bg-primary/15"
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-controls="search-tag-options"
          aria-autocomplete="list"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className={cn(
            "w-full rounded-control border border-text-muted/25 bg-surface py-2 pl-2.5 pr-8 text-[12.5px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-primary/60 focus:ring-2 focus:ring-primary/15",
            state === "error" && "border-status-destructive",
            disabled && "cursor-default opacity-80",
          )}
        />
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-muted"
        />

        {open && !disabled && rows > 0 && (
          <ul
            id="search-tag-options"
            role="listbox"
            className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-control border border-hairline bg-surface py-1 shadow-lg"
          >
            {filtered.map((option, index) => (
              <li
                key={option}
                role="option"
                aria-selected={index === highlight}
              >
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => add(option)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] text-text-primary",
                    index === highlight && "bg-primary/10 text-primary",
                  )}
                >
                  {selected.includes(option) ? (
                    <Check aria-hidden="true" className="size-3.5" />
                  ) : (
                    <span className="size-3.5" />
                  )}
                  {option}
                </button>
              </li>
            ))}
            {canAddCustom && (
              <li role="option" aria-selected={highlight === filtered.length}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(filtered.length)}
                  onClick={() => add(trimmedQuery)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] font-medium text-primary",
                    highlight === filtered.length && "bg-primary/10",
                  )}
                >
                  <Plus aria-hidden="true" className="size-3.5" />
                  Add &ldquo;{trimmedQuery}&rdquo;
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {helper && state === "idle" && (
        <p className="text-ink-faint mt-1 text-[11px]">{helper}</p>
      )}
    </div>
  );
}
