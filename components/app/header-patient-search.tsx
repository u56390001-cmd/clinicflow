"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import {
  searchPatientsAction,
  type PatientQuickResult,
} from "@/lib/actions/patient-search";
import { APP_ROUTES } from "@/lib/constants";
import { patientDirectoryHref } from "@/lib/patient-directory";
import { cn } from "@/lib/utils";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

export function HeaderPatientSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientQuickResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setLoading(false);
      setResults([]);
      setSearched(false);
      setOpen(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchPatientsAction(trimmed);
        setResults(found);
      } catch {
        setResults([]);
      }
      setSearched(true);
      setLoading(false);
      setHighlighted(-1);
      setOpen(true);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function reset() {
    setQuery("");
    setResults([]);
    setSearched(false);
    setOpen(false);
    setHighlighted(-1);
  }

  function directoryHref(search: string) {
    return patientDirectoryHref({ q: search });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (open || query) {
        event.preventDefault();
        reset();
      }
      return;
    }
    if (!open || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((previous) => (previous + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((previous) =>
        previous <= 0 ? results.length - 1 : previous - 1,
      );
    } else if (event.key === "Enter") {
      const selected = highlighted >= 0 ? results[highlighted] : null;
      if (selected) {
        event.preventDefault();
        reset();
        router.push(patientDirectoryHref({ selectedId: selected.id }));
      }
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor="global-patient-search" className="sr-only">
        Search patients
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
      />
      <input
        ref={inputRef}
        id="global-patient-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => {
          if (searched && !loading) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        placeholder="Search by patient name or phone..."
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls="global-patient-search-results"
        aria-autocomplete="list"
        aria-activedescendant={
          open && highlighted >= 0 && results[highlighted]
            ? `patient-option-${results[highlighted].id}`
            : undefined
        }
        className="h-10 w-full rounded-control border border-text-muted/40 bg-surface pl-9 pr-9 text-sm text-text-primary transition-colors placeholder:text-text-muted hover:border-text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 [&::-webkit-search-cancel-button]:hidden"
      />
      {loading ? (
        <Spinner
          size="sm"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
      ) : null}

      {open && searched && !loading ? (
        <div
          id="global-patient-search-results"
          role="listbox"
          aria-label="Patient results"
          className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-card border border-text-muted/30 bg-surface shadow-dropdown"
        >
          {results.length === 0 ? (
            <div className="px-4 py-3">
              <p className="text-sm font-medium text-text-primary">
                No patients found.
              </p>
              <p className="mt-0.5 text-xs text-text-secondary">
                Try a different name or phone number.
              </p>
            </div>
          ) : (
            results.map((patient, index) => (
              <Link
                key={patient.id}
                id={`patient-option-${patient.id}`}
                role="option"
                aria-selected={index === highlighted}
                href={patientDirectoryHref({ selectedId: patient.id })}
                onMouseDown={(event) => event.preventDefault()}
                onClick={reset}
                onMouseEnter={() => setHighlighted(index)}
                className={cn(
                  "flex flex-col gap-0.5 px-4 py-2.5",
                  index === highlighted ? "bg-app" : "bg-surface",
                )}
              >
                <span className="truncate text-sm font-medium text-text-primary">
                  {patient.name}
                </span>
                {patient.phone ? (
                  <span className="truncate text-xs text-text-secondary">
                    {patient.phone}
                  </span>
                ) : null}
              </Link>
            ))
          )}
          <div className="border-t border-text-muted/20">
            <Link
              href={
                query.trim()
                  ? directoryHref(query.trim())
                  : APP_ROUTES.app.patients
              }
              onMouseDown={(event) => event.preventDefault()}
              onClick={reset}
              className="block px-4 py-2.5 text-sm font-medium text-primary hover:bg-app"
            >
              View all in Patients
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
