"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
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

/**
 * Merge a duplicate patient into the open (primary) record.
 *
 * Two steps on purpose: finding the duplicate is a search problem, destroying
 * an identity is a decision problem — so the second step shows exactly what
 * will move before anything can be submitted. The RPC (0041) re-parents every
 * appointment, visit, prescription, document, bill and WhatsApp conversation,
 * then soft-archives the duplicate; nothing is deleted.
 */
/**
 * What the modal needs to know about the surviving record. Deliberately not the
 * whole `PatientDirectoryRow`: the booking flow holds the raw `patients` row (it
 * never reads the directory view), so the two tallies are optional and their
 * line is simply omitted when absent. Both `Patient` and `PatientDirectoryRow`
 * satisfy this shape.
 */
export type MergePrimary = {
  id: string;
  name: string;
  patient_code: string | null;
  visit_count?: number;
  appointment_count?: number;
};

export function MergePatientModal({
  primary,
  onClose,
  onMerged,
}: {
  /** The record that is open — receives everything the duplicate owns. */
  primary: MergePrimary;
  onClose: () => void;
  /**
   * Called with the surviving patient's id immediately before `onClose()`. The
   * booking flow uses it to re-point its own patient selection when the record
   * the receptionist had picked was itself merged away — without it the form
   * would keep submitting an id that is now archived.
   */
  onMerged?: (primaryPatientId: string) => void;
}) {
  const router = useRouter();
  const [rawSearch, setRawSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<PatientQuickResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PatientQuickResult | null>(null);
  const [isMerging, startMergeTransition] = useTransition();

  // Escape closes this modal — and only this one. The patients workspace opens
  // it standalone, but the booking flow opens it *inside* another modal that
  // listens for the same key; this handler runs in the capture phase and stops
  // propagation, so Escape peels off the merge step and leaves the booking form
  // (and everything typed into it) exactly where it was.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    }
    document.addEventListener("keydown", handleKey, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey, true);
      // Restores whatever was in force *before* this modal — which, in the
      // booking flow, is the parent modal's own lock, so the page stays frozen.
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

  /**
   * Which record survives. The modal opens with the one the user pointed at as
   * primary, but the search step doubles as the place to correct a wrong guess —
   * picking the other side here swaps the roles with no round trip, and the
   * confirmation panel always states the direction before anything is submitted.
   */
  const [swapped, setSwapped] = useState(false);

  // Each side is built with whichever tallies belong to it, so the panel can read
  // both sides uniformly. The open record always carries them (`PatientDirectoryRow`);
  // a search result does too (`PatientQuickResult`).
  const openRecord: MergePrimary = {
    id: primary.id,
    name: primary.name,
    patient_code: primary.patient_code,
    visit_count: primary.visit_count,
    appointment_count: primary.appointment_count,
  };
  const searchHit: MergePrimary = {
    id: selected?.id ?? "",
    name: selected?.name ?? "",
    patient_code: selected?.patient_code ?? null,
    visit_count: selected?.visit_count,
    appointment_count: selected?.appointment_count,
  };
  const duplicateSide: MergePrimary = swapped ? openRecord : searchHit;
  const keepsSide: MergePrimary = swapped ? searchHit : openRecord;

  const handleMerge = useMemo(() => {
    const duplicateId = duplicateSide.id;
    if (!duplicateId || !keepsSide.id) return null;
    const duplicateName = duplicateSide.name;
    const keepsName = keepsSide.name;
    const keepsId = keepsSide.id;
    return () => {
      startMergeTransition(async () => {
        const formData = new FormData();
        formData.set("primaryPatientId", keepsId);
        formData.set("duplicatePatientId", duplicateId);
        const res = await mergePatientProfilesAction(formData);
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        toast.success(
          `“${duplicateName}” merged into “${keepsName}” — nothing was deleted.`,
        );
        // Told before close: the booking flow re-points its patient selection at
        // the surviving record while this modal is still mounted.
        onMerged?.(keepsId);
        onClose();
        // The duplicate just left the directory and the primary's tabs gained
        // its history — re-read the server data behind this record.
        router.refresh();
      });
    };
  }, [
    duplicateSide.id,
    duplicateSide.name,
    keepsSide.id,
    keepsSide.name,
    onMerged,
    onClose,
    router,
  ]);

  // Portalled to `body` and stacked above the booking modal (z-[100]): the
  // patients workspace opens this standalone, but the booking flow opens it from
  // inside BookingModal, whose panel is an animating stacking context — a plain
  // child would be clipped by it. `onClick` on the overlay never reaches the
  // parent modal's own backdrop-close, so the form underneath is untouched.
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
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
                    {duplicateSide.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-text-muted">
                    {duplicateSide.patient_code
                      ? `UHID ${duplicateSide.patient_code}`
                      : "No UHID"}
                  </p>
                  <p className="mt-1 text-[11px] tabular-nums text-text-muted">
                    {selected.visit_count} visits · {selected.appointment_count}{" "}
                    appointments
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
                    {keepsSide.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-text-muted">
                    {keepsSide.patient_code
                      ? `UHID ${keepsSide.patient_code}`
                      : "No UHID"}
                  </p>
                  <p className="mt-1 text-[11px] tabular-nums text-text-muted">
                    {keepsSide.appointment_count !== undefined
                      ? `${keepsSide.visit_count} visits · ${keepsSide.appointment_count} appointments`
                      : "Receives everything below"}
                  </p>
                </div>
              </div>

              {/* Wrong way round? Nothing is submitted yet — the search result
                  and the open record trade places, so whichever profile the user
                  actually means is the one that survives. */}
              <button
                type="button"
                onClick={() => setSwapped((value) => !value)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <ArrowRightLeft aria-hidden="true" className="size-3.5" />
                Keep “{swapped ? primary.name : selected.name}” instead
              </button>

              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-status-warning/30 bg-status-warning/[0.07] px-4 py-3">
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-status-warning"
                />
                <p className="text-[12.5px] leading-relaxed text-text-primary">
                  The duplicate&apos;s <strong>{selected.visit_count} visits</strong>,{" "}
                  <strong>{selected.appointment_count} appointments</strong>, and all
                  prescriptions, documents, bills and WhatsApp threads move to{" "}
                  <strong>{keepsSide.name}</strong>. The duplicate then disappears
                  from the patient list — its record is archived, never deleted, but
                  this can&apos;t be undone from the app.
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
    </div>,
    document.body,
  );
}
