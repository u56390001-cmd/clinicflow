"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import { searchTerminologyAction } from "@/lib/actions/terminology";
import { cn } from "@/lib/utils";
import type { TerminologyCodeSystem, TerminologyHit } from "@/types/database";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

const SYSTEM_LABEL: Record<TerminologyCodeSystem, string> = {
  "ICD-10-CM": "ICD-10",
  "SNOMED-CT": "SNOMED",
};

/**
 * Coded diagnosis search (migration 0101): type a term or a partial code and
 * pick a verified ICD-10-CM / SNOMED-CT row. Free text still works — the input
 * is controlled by the parent, so a clinician can type a label the catalog
 * doesn't have and move on; picking a hit fills both the label and the code
 * through `onSelect`.
 *
 * Debounced 250 ms against `searchTerminologyAction`. The effect is keyed on
 * `open` too: after a pick the parent sets the value programmatically while
 * the dropdown closes, and skipping the closed state avoids re-searching text
 * the clinician just confirmed. A request counter drops stale responses when
 * the user keeps typing.
 */
export function TerminologySearch({
  label,
  value,
  onChange,
  onSelect,
  system,
  placeholder = "Search diagnosis or code…",
  inputId,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  onSelect: (hit: TerminologyHit) => void;
  system?: TerminologyCodeSystem;
  placeholder?: string;
  inputId?: string;
  disabled?: boolean;
}) {
  const autoId = useId();
  const listId = `${autoId}-terminology-options`;
  const generatedInputId = `${autoId}-terminology-input`;

  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<TerminologyHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const needle = value.trim();
    if (needle.length < MIN_QUERY_LENGTH) {
      setHits([]);
      setSearching(false);
      setFailed(false);
      return;
    }
    const timer = window.setTimeout(() => {
      const requestId = ++requestRef.current;
      setSearching(true);
      searchTerminologyAction(needle, system)
        .then((result) => {
          if (requestId !== requestRef.current) return;
          setFailed(!result.ok);
          setHits(result.ok ? result.data : []);
          setHighlight(0);
        })
        .finally(() => {
          if (requestId !== requestRef.current) return;
          setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [value, open, system]);

  const trimmed = value.trim();
  const showStatus = trimmed.length >= MIN_QUERY_LENGTH;
  const rows = hits.length;

  function choose(hit: TerminologyHit) {
    onSelect(hit);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open && showStatus) setOpen(true);
      setHighlight((index) => Math.min(index + 1, Math.max(rows - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      if (open && hits[highlight]) {
        event.preventDefault();
        choose(hits[highlight]);
      }
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <label
        htmlFor={inputId ?? generatedInputId}
        className="text-ink mb-1.5 block text-[12.5px] font-bold"
      >
        {label}
      </label>

      <div className="relative">
        <input
          id={inputId ?? generatedInputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className={cn(
            "w-full rounded-control border border-text-muted/25 bg-surface py-2 pl-2.5 pr-8 text-[12.5px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-primary/60 focus:ring-2 focus:ring-primary/15",
            disabled && "cursor-default opacity-80",
          )}
        />
        {searching ? (
          <Loader2
            aria-hidden="true"
            className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-text-muted"
          />
        ) : (
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-muted"
          />
        )}

        {open && !disabled && showStatus && (
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-control border border-hairline bg-surface py-1 shadow-lg"
          >
            {searching && rows === 0 && (
              <li className="px-2.5 py-2 text-[12px] text-text-muted">
                Searching…
              </li>
            )}
            {!searching && failed && (
              <li className="px-2.5 py-2 text-[12px] text-status-destructive">
                Search unavailable — type the diagnosis manually.
              </li>
            )}
            {!searching && !failed && rows === 0 && (
              <li className="px-2.5 py-2 text-[12px] text-text-muted">
                No matches — keep typing to enter it manually.
              </li>
            )}
            {hits.map((hit, index) => (
              <li
                key={hit.code}
                role="option"
                aria-selected={index === highlight}
              >
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => choose(hit)}
                  className={cn(
                    "flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left",
                    index === highlight && "bg-primary/10",
                  )}
                >
                  <span className="bg-surface-muted shrink-0 rounded border border-hairline px-1.5 py-0.5 font-mono text-[11px] font-semibold text-text-secondary">
                    {hit.code}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-primary">
                    {hit.display}
                  </span>
                  <span className="hidden shrink-0 text-[10.5px] uppercase tracking-wide text-text-muted sm:inline">
                    {hit.category ?? SYSTEM_LABEL[hit.code_system]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
