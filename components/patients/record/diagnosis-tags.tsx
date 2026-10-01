"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

import { searchDiagnoses } from "@/lib/diagnoses";
import { cn } from "@/lib/utils";
import { RxTag } from "@/components/patients/record/rx-card";

/**
 * Split a stored diagnosis column into individual entries.
 *
 * The column has always been one free-text string; comma is the separator
 * doctors already use when they type more than one, so it is the one that is
 * read back. Both columns are read, because a prescription written before
 * multiple diagnoses existed put the free-text one in `custom_diagnosis`, and a
 * chip list that silently dropped it would lose a diagnosis on the next save.
 */
export function splitDiagnoses(diagnosis: string, customDiagnosis: string): string[] {
  return [...new Set(
    `${diagnosis ?? ""}, ${customDiagnosis ?? ""}`
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  )];
}

type Suggestion = { value: string; isCustom: boolean };

/**
 * Diagnosis as a list of chips with a search box, rather than one text input.
 *
 * A prescription has more than one diagnosis often enough that a single box
 * trains doctors to write "fever, cough" into a field with no idea it is
 * comma-separated — which is unreadable in the record's history and unsearchable
 * in the AI summary. Chips make the count visible and each entry removable on
 * its own.
 *
 * The typed value is always accepted, listed first when it is not in the clinic's
 * catalogue. This field can never refuse a diagnosis: the catalogue is a typing
 * shortcut, not a diagnosis list.
 */
export function DiagnosisTags({
  diagnosis,
  customDiagnosis,
  onChange,
  invalid,
}: {
  diagnosis: string;
  customDiagnosis: string;
  onChange: (next: { diagnosis: string; customDiagnosis: string }) => void;
  invalid?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const listId = useId();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tags = useMemo(
    () => splitDiagnoses(diagnosis, customDiagnosis),
    [diagnosis, customDiagnosis],
  );

  const suggestions = useMemo<Suggestion[]>(() => {
    const typed = query.trim();
    const matches = searchDiagnoses(typed).map((value) => ({
      value,
      isCustom: false,
    }));
    if (!typed) return matches;
    if (matches.some((match) => match.value.toLowerCase() === typed.toLowerCase())) {
      return matches;
    }
    return [{ value: typed, isCustom: true }, ...matches];
  }, [query]);

  // Keep the highlight inside the list: the suggestion set changes with every
  // keystroke, and a stale index would commit the wrong diagnosis on Enter.
  useEffect(() => {
    setHighlight(0);
  }, [query]);

  useEffect(
    () => () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    [],
  );

  const commit = (next: string[]) => {
    const unique = [...new Set(next.map((entry) => entry.trim()).filter(Boolean))];
    // Everything lands in `diagnosis` and the free-text column is cleared: one
    // printed line, one searchable string. Splitting known from custom would
    // surface on the printout as a stray parenthesis the doctor never typed.
    onChange({ diagnosis: unique.join(", "), customDiagnosis: "" });
  };

  const add = (value: string) => {
    const entry = value.trim();
    if (!entry) return;
    commit([...tags, entry]);
    setQuery("");
    setOpen(false);
  };

  const remove = (value: string) => commit(tags.filter((tag) => tag !== value));

  return (
    <div className="min-w-0">
      <label htmlFor={`${listId}-input`} className="mb-1.5 block text-[11.5px] font-bold uppercase tracking-[0.04em] text-text-secondary">
        Diagnosis
        <span aria-hidden="true" className="text-status-destructive">
          {" "}
          *
        </span>
      </label>

      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-text-muted"
        />
        <input
          id={`${listId}-input`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-option-${highlight}` : undefined}
          autoComplete="off"
          value={query}
          placeholder="Search or type diagnosis..."
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Deferred so a click on a suggestion lands before the list closes.
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              const picked = suggestions[highlight];
              add(picked ? picked.value : query);
              return;
            }
            if (event.key === "Backspace" && !query && tags.length > 0) {
              remove(tags[tags.length - 1]);
              return;
            }
            if (event.key === "Escape") {
              setOpen(false);
              return;
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) {
                setOpen(true);
                return;
              }
              const step = event.key === "ArrowDown" ? 1 : -1;
              setHighlight((prev) => {
                const next = prev + step;
                if (next < 0) return suggestions.length - 1;
                if (next >= suggestions.length) return 0;
                return next;
              });
            }
          }}
          className={cn(
            "w-full rounded-[10px] border-[1.5px] bg-surface py-2.5 pl-9 pr-3.5 text-[13px] text-ink transition-colors placeholder:text-text-muted/70 focus:outline-none",
            invalid ? "border-primary" : "border-hairline focus:border-primary",
          )}
        />

        {open && suggestions.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Diagnosis suggestions"
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-56 overflow-y-auto rounded-[10px] border border-hairline bg-surface p-1 shadow-md"
          >
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.value}
                id={`${listId}-option-${index}`}
                role="option"
                aria-selected={index === highlight}
                // preventDefault on mousedown: the click must land before blur
                // tears the list down.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => add(suggestion.value)}
                className={cn(
                  "cursor-pointer rounded-[7px] px-2.5 py-1.5 text-[12.5px] transition-colors",
                  index === highlight ? "bg-primary/10 text-primary" : "text-text-primary",
                )}
              >
                {suggestion.value}
                {suggestion.isCustom && (
                  <span className="ml-2 text-[11px] text-text-muted">add as typed</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* The chosen diagnoses sit BELOW the search box, the way the design has
          it: the box is where the hand is, and a chip that appears above it
          pushes the field the doctor is typing into upward motion. They wrap
          onto as many lines as they need rather than scrolling sideways — a
          long diagnosis list must never be hidden behind a horizontal bar. */}
      {tags.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag}>
              <RxTag label={tag} onRemove={() => remove(tag)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
