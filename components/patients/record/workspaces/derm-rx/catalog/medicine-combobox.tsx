"use client";

/**
 * Global medicine combobox — replaces the native datalist. Result rows carry
 * Brand / Generic / Strength / Form under section headers
 * ("My favourites" | "Recent" | "Catalogue"), plus an `Add "{query}" as
 * custom drug` row when nothing matches. Keyboard: ArrowUp/Down navigate,
 * Enter selects (or adds the custom candidate), Escape closes. The input
 * clears and re-focuses after every action so the loop is search → add →
 * type next.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { CornerDownLeft, Heart, Plus, Search } from "lucide-react";

import { Input } from "@/components/ui/input";

import type { CatalogItem } from "./catalog-item";
import { useMedicineSearch } from "./use-medicine-search";

export type MedicineComboboxProps = {
  items: CatalogItem[];
  /** Appends a typed RxItem from the chosen catalogue row / custom name. */
  onSelect: (selection: { item?: CatalogItem; customName?: string }) => void;
  placeholder?: string;
  disabled?: boolean;
};

export type MedicineComboboxHandle = { focus: () => void };

type Row =
  | { kind: "item"; item: CatalogItem }
  | { kind: "custom"; name: string };

export const MedicineCombobox = forwardRef<
  MedicineComboboxHandle,
  MedicineComboboxProps
>(function MedicineCombobox({ items, onSelect, placeholder, disabled }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  const { query, setQuery, results, isFavorite, toggleFavorite, rememberRecent } =
    useMedicineSearch({ items });
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);

  const rows: Row[] = [
    ...results.favourites.map(
      (item): Row => ({
        kind: "item",
        item,
      }),
    ),
    ...results.recent.map((item): Row => ({ kind: "item", item })),
    ...results.catalogue.map((item): Row => ({ kind: "item", item })),
    ...(results.customCandidate
      ? [{ kind: "custom", name: results.customCandidate } satisfies Row]
      : []),
  ];

  const commit = useCallback(
    (row: Row) => {
      if (row.kind === "item") {
        rememberRecent(row.item);
        onSelect({ item: row.item });
      } else {
        onSelect({ customName: row.name });
      }
      setQuery("");
      setCursor(-1);
      setOpen(false);
      // The focus loop: the doctor types the next drug immediately.
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [onSelect, rememberRecent, setQuery],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && query !== "") setOpen(true);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((current) => Math.min(current + 1, rows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((current) => Math.max(current - 1, -1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (cursor >= 0 && rows[cursor]) {
        commit(rows[cursor]!);
      } else if (results.customCandidate) {
        commit({ kind: "custom", name: results.customCandidate });
      } else if (results.catalogue[0]) {
        const first: Row = { kind: "item", item: results.catalogue[0] };
        commit(first);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      setCursor(-1);
    }
  };

  // Blanking the input leaves an open dropdown hanging around.
  useEffect(() => {
    if (query === "") {
      setOpen(false);
      setCursor(-1);
    }
  }, [query]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted/70" />
        <Input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls="derm-rx-medlist-options"
          aria-autocomplete="list"
          value={query}
          disabled={disabled}
          placeholder={placeholder ?? "Medicine search — Enter se add ho jayegi"}
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(-1);
          }}
          onFocus={() => query !== "" && setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-10 border-input-border bg-surface pl-9 pr-10"
        />
        {query !== "" ? (
          <button
            type="button"
            aria-label="Search clear karen"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-text-muted hover:text-text-primary"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
          >
            ×
          </button>
        ) : null}
      </div>
      {open && rows.length > 0 ? (
        <ul
          id="derm-rx-medlist-options"
          role="listbox"
          aria-label="Medicine results"
          className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-hairline bg-surface py-1 shadow-lg"
        >
          {rows.map((row, index) => {
            const key =
              row.kind === "custom"
                ? `custom:${row.name}`
                : `${row.item.id}:${index}`;
            const sections =
              index === 0 ||
              (row.kind === "item" &&
                rows[index - 1]?.kind === "item" &&
                sectionOf(
                  row.item,
                    results.favourites,
                    results.recent,
                  ) !==
                  sectionOf(
                    (
                      rows[index - 1] as Extract<Row, { kind: "item" }>
                    ).item,
                    results.favourites,
                    results.recent,
                  ));
            const highlight = index === cursor;
            return (
              <li
                key={key}
                role="option"
                aria-selected={highlight}
                tabIndex={-1}
                onMouseDown={(event) => {
                  // Use mousedown so the popover does not steal focus first.
                  event.preventDefault();
                  commit(row);
                }}
                onMouseEnter={() => setCursor(index)}
              >
                {sections && row.kind === "item" ? (
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted/70">
                    {sectionOf(
                      row.item,
                    results.favourites,
                    results.recent,
                  )}
                  </p>
                ) : null}
                <div
                  className={
                    "flex cursor-pointer items-center gap-2 px-3 py-2 " +
                    (highlight ? " bg-app" : " hover:bg-app")
                  }
                >
                  {row.kind === "custom" ? (
                    <>
                      <Plus className="h-4 w-4 shrink-0 text-primary" />
                      <span className="text-sm text-text-primary font-medium">
                        Add &ldquo;{row.name}&rdquo; as custom drug
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {row.item.brand}
                        </p>
                        {row.item.generic || row.item.form ? (
                          <p className="truncate text-xs text-text-muted">
                            {[
                              row.item.generic,
                              row.item.strengths.join(", "),
                              row.item.form,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        ) : null}
                      </div>
                      {row.item.route !== "any" ? (
                        <span className="rounded-md bg-chip px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
                          {row.item.route}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        aria-label={
                          isFavorite(row.item)
                            ? "Favourites se hatayen"
                            : "Favourites mein add karen"
                        }
                        className="rounded-lg p-1 text-text-muted/60 hover:text-primary"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleFavorite(row.item);
                        }}
                      >
                        <Heart
                          className={
                            "h-3.5 w-3.5 " +
                            (isFavorite(row.item) ? "fill-current text-primary" : "")
                          }
                        />
                      </button>
                      {highlight ? (
                        <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-text-muted/60" />
                      ) : null}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
});

function sectionOf(
  item: CatalogItem,
  favourites: CatalogItem[],
  recent: CatalogItem[],
): string {
  if (favourites.some((f) => f.id === item.id)) return "My favourites";
  if (recent.some((r) => r.id === item.id)) return "Recent";
  return "Catalogue";
}
