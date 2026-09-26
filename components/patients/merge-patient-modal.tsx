"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRightLeft,
  GitMerge,
  Loader2,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mergePatientProfilesAction } from "@/lib/actions/patients";
import {
  searchPatientsAction,
  type PatientQuickResult,
} from "@/lib/actions/patient-search";
import type { PatientDirectoryRow } from "@/types/database";

/**
 * Merge a duplicate patient into the open (primary) record.
 *
 * Two steps on purpose: finding the duplicate is a search problem, destroying
 * an identity is a decision problem — so the second step shows exactly what
 * will move before anything can be submitted. The RPC (0041) re-parents every
 * appointment, visit, prescription, document, bill and WhatsApp conversation,
 * then soft-archives the duplicate; nothing is deleted.
 */
export function MergePatientModal({
  primary,
  onClose,
}: {
  /** The record that is open — receives everything the duplicate owns. */
  primary: PatientDirectoryRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [rawSearch, setRawSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<PatientQuickResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PatientQuickResult | null>(null);
  const [isMerging, startMergeTransition] = useTransition();

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  // Debounce the search (~300ms) so we don't hit the server on every keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setSearchQuery(rawSearch), 300);
    return () => window.clearTimeout(t);
  }, [rawSearch]);

  useEffect(() => {
    let cancelled = false;
    const query = searchQuery.trim();
    if (query.length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    searchPatientsAction(query)
      .then((rows) => {
        if (cancelled) return;
        // The primary is open behind this modal — it can never be its own duplicate.
        setResults(rows.filter((r) => r.id !== primary.id));
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchQuery, primary.id]);

  const canSubmit = selected !== null && !isMerging;

  const handleMerge = useMemo(() => {
    const duplicate = selected;
    if (!duplicate) return null;
    return () => {
      startMergeTransition(async () => {
        const formData = new FormData();
        formData.set("primaryPatientId", primary.id);
        formData.set("duplicatePatientId", duplicate.id);
        const res = await mergePatientProfilesAction(formData);
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        toast.success(
          `“${duplicate.name}” merged into “${primary.name}” — nothing was deleted.`,
        );
        onClose();
        // The duplicate just left the directory and the primary's tabs gained
        // its history — re-read the server data behind this record.
        router.refresh();
      });
    };
  }, [selected, primary.id, primary.name, onClose, router]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Merge duplicate patient"
    >
      <div className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* ── Gradient header (same shell as the patient form modal) ────── */}
        <div className="relative flex-shrink-0 bg-gradient-to-r from-primary to-primary-light px-6 py-4 text-white">
          <div className="absolute inset-0 bg-black/5" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="rounded-lg bg-white/20 p-2 backdrop-blur-sm">
                <GitMerge aria-hidden="true" className="h-[18px] w-[18px]" />
              </div>
              <div>
                <h2 className="text-lg font-bold leading-tight">
                  Merge Duplicate
                </h2>
                <p className="mt-0.5 text-xs text-white/80">
                  Fold a duplicate record into “{primary.name}”
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-xl p-2 transition-all hover:bg-white/20"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {!selected ? (
            <>
              <p className="text-sm text-text-secondary">
                Find the duplicate record by name, phone, or UHID — the open
                patient keeps everything it owns and receives the
                duplicate&apos;s.
              </p>

              <div className="relative mt-4">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
                />
                <Input
                  autoFocus
                  value={rawSearch}
                  onChange={(e) => setRawSearch(e.target.value)}
                  placeholder="Search name, phone, or UHID…"
                  className="pl-9"
                  aria-label="Search patients to merge"
                />
              </div>

              <div className="mt-4">
                {searching && (
                  <p className="flex items-center gap-2 py-4 text-sm text-text-muted">
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    Searching…
                  </p>
                )}

                {!searching && results === null && (
                  <p className="py-4 text-sm text-text-muted">
                    Type at least two characters to search this clinic&apos;s
                    patients.
                  </p>
                )}

                {!searching && results !== null && results.length === 0 && (
                  <p className="py-4 text-sm text-text-muted">
                    No other patients match “{searchQuery.trim()}”.
                  </p>
                )}

                {!searching &&
                  results?.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setSelected(row)}
                      className="mb-2 flex w-full items-center justify-between gap-3 rounded-xl border border-text-muted/20 bg-app/40 px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-text-primary">
                          {row.name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-text-muted">
                          {[row.patient_code ? `UHID ${row.patient_code}` : null, row.phone]
                            .filter(Boolean)
                            .join(" · ") || "No phone or UHID"}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-[11px] leading-tight text-text-muted">
                        <span className="block tabular-nums">
                          {row.visit_count} visit{row.visit_count === 1 ? "" : "s"}
                        </span>
                        <span className="block tabular-nums">
                          {row.appointment_count} appt
                          {row.appointment_count === 1 ? "" : "s"}
                        </span>
                      </span>
                    </button>
                  ))}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary transition-colors hover:text-text-primary"
              >
                <ArrowLeft aria-hidden="true" className="size-3.5" />
                Back to search
              </button>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-text-muted/20 bg-app/40 px-4 py-3">
                <div className="min-w-0 text-center flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    Duplicate
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-text-primary">
                    {selected.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-text-muted">
                    {selected.patient_code ? `UHID ${selected.patient_code}` : "No UHID"}
                  </p>
                  <p className="mt-1 text-[11px] tabular-nums text-text-muted">
                    {selected.visit_count} visits · {selected.appointment_count} appointments
                  </p>
                </div>
                <ArrowRightLeft
                  aria-hidden="true"
                  className="size-5 shrink-0 text-primary"
                />
                <div className="min-w-0 flex-1 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    Primary (kept)
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-text-primary">
                    {primary.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-text-muted">
                    {primary.patient_code ? `UHID ${primary.patient_code}` : "No UHID"}
                  </p>
                  <p className="mt-1 text-[11px] tabular-nums text-text-muted">
                    {primary.visit_count} visits · {primary.appointment_count} appointments
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-status-warning/30 bg-status-warning/[0.07] px-4 py-3">
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-status-warning"
                />
                <p className="text-[12.5px] leading-relaxed text-text-primary">
                  The duplicate&apos;s <strong>{selected.visit_count} visits</strong>,{" "}
                  <strong>{selected.appointment_count} appointments</strong>, and all
                  prescriptions, documents, bills and WhatsApp threads move to{" "}
                  <strong>{primary.name}</strong>. The duplicate then disappears from
                  the patient list — its record is archived, never deleted, but this
                  can&apos;t be undone from the app.
                </p>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-text-muted/15 bg-app px-6 py-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          {selected && handleMerge && (
            <Button
              size="sm"
              onClick={handleMerge}
              disabled={!canSubmit}
              className="bg-status-destructive text-white hover:bg-status-destructive/90"
            >
              {isMerging ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <GitMerge aria-hidden="true" className="size-4" />
              )}
              {isMerging ? "Merging…" : "Merge records"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
