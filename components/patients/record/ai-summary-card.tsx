"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronRight, Copy, RefreshCw, ScanLine, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import { formatNaiveDate } from "@/lib/utils/datetime";

/**
 * The literal empty-state copy from the module spec, for a patient with no
 * consultation history. Kept as a constant so the wording cannot drift.
 */
export const AI_SUMMARY_EMPTY_STATE =
  "Summary will be available after consultation history is created";

type GenerateResponse = {
  ok: boolean;
  summary?: string | null;
  generatedAt?: string | null;
  error?: string;
};

/**
 * AI Patient Summary card.
 *
 * The card is always rendered, even with nothing to show — its presence tells
 * staff the feature exists and what unlocks it, which a hidden card cannot.
 *
 * The body is a compact bullet list (summaries arrive as "- " bullets from both
 * the record generator and the document scanner) on a white card for contrast —
 * a doctor glancing between consults gets the takeaways in two or three lines.
 *
 * Generation is manual (plan §1.4 / decision D4): the button POSTs to
 * `/api/patients/{id}/ai-summary`, which caches the result on the patient row.
 * A scanned document's summary lands in a different column (`ai_scan_summary`,
 * migration 0115) and renders in its own collapsible section below — the two
 * sources never overwrite each other. Nothing generates on page load, so
 * opening a record costs no model call. The button only appears when the
 * deployment has set `PATIENT_AI_SUMMARY_ENABLED` — a control that always
 * errors is worse than no control.
 */
export function AiSummaryCard({
  patientId,
  summary,
  generatedAt,
  generatedFromVisitCount,
  visitCount,
  hasClinicalData,
  emptyCopy,
  refreshLabel = false,
  timezone,
  canManage,
  enabled,
  scanSummary,
  scanGeneratedAt,
}: {
  patientId: string;
  summary: string | null;
  generatedAt: string | null;
  generatedFromVisitCount: number | null;
  visitCount: number;
  /**
   * True when the patient has a record without any visit — e.g. a psychology
   * patient who only submitted an online assessment. Defaults to false so the
   * general record's behaviour is unchanged.
   */
  hasClinicalData?: boolean;
  /** Overrides {@link AI_SUMMARY_EMPTY_STATE} for the no-history empty state. */
  emptyCopy?: string;
  /** Renders a labelled Refresh/Generate button instead of the icon-only one. */
  refreshLabel?: boolean;
  timezone: string;
  canManage: boolean;
  /** `PATIENT_AI_SUMMARY_ENABLED` — resolved on the server and passed down. */
  enabled: boolean;
  /**
   * Summary extracted from a scanned document (AI OCR → `ai_scan_summary`).
   * Rendered in its own collapsible section so an outside lab report never
   * mixes with the clinic's own consultation summary.
   */
  scanSummary?: string | null;
  scanGeneratedAt?: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedScan, setCopiedScan] = useState(false);
  const [scanOpen, setScanOpen] = useState(true);
  const hasScan = Boolean(scanSummary?.trim());
  // Shows the new text immediately; `router.refresh()` then brings the server
  // prop into line. Both end up with the same value.
  const [fresh, setFresh] = useState<{
    summary: string;
    generatedAt: string | null;
  } | null>(null);

  const shownSummary = fresh?.summary ?? summary;
  const shownGeneratedAt = fresh ? fresh.generatedAt : generatedAt;
  const hasSummary = Boolean(shownSummary?.trim());
  const hasHistory = visitCount > 0 || Boolean(hasClinicalData);

  // A summary written after two visits is out of date once the fifth happens.
  // Suppressed while `fresh` is set: what was just generated cannot be stale.
  const stale =
    hasSummary &&
    !fresh &&
    generatedFromVisitCount !== null &&
    visitCount > generatedFromVisitCount;

  const canGenerate = enabled && canManage && hasHistory;

  async function generate() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/patients/${patientId}/ai-summary?force=1`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => null)) as
        | GenerateResponse
        | null;

      if (!response.ok || !body?.ok) {
        setError(
          body?.error ?? "Could not generate a summary right now. Please try again.",
        );
        return;
      }
      if (body.summary) {
        setFresh({
          summary: body.summary,
          generatedAt: body.generatedAt ?? null,
        });
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!shownSummary) return;
    try {
      await navigator.clipboard.writeText(shownSummary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to the clipboard.");
    }
  }

  // Summaries arrive as "- " bullets on one line each; strip the dash and paint
  // a small teal marker instead so the text itself stays scannable.
  const bullets = hasSummary
    ? (shownSummary ?? "")
        .split("\n")
        .map((line) => line.replace(/^[-•*]\s+/, "").trim())
        .filter(Boolean)
    : [];

  const scanBullets = hasScan
    ? (scanSummary ?? "")
        .split("\n")
        .map((line) => line.replace(/^[-•*]\s+/, "").trim())
        .filter(Boolean)
    : [];

  async function copyScan() {
    if (!scanSummary) return;
    try {
      await navigator.clipboard.writeText(scanSummary);
      setCopiedScan(true);
      setTimeout(() => setCopiedScan(false), 2000);
    } catch {
      setError("Could not copy to the clipboard.");
    }
  }

  return (
    <section className="rounded-card border border-hairline bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded-md bg-brand-pale text-brand-cta">
          <Sparkles aria-hidden="true" className="size-3.5" />
        </span>
        <h3 className="text-sm font-semibold text-ink">AI Patient Summary</h3>
        {canGenerate &&
          (refreshLabel ? (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-7 gap-1.5 px-2.5 text-[12px]"
              onClick={generate}
              disabled={pending}
              aria-busy={pending}
            >
              {pending ? (
                <Spinner size="sm" />
              ) : (
                <RefreshCw aria-hidden="true" className="size-3.5" />
              )}
              {pending ? "Generating…" : hasSummary ? "Refresh" : "Generate"}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto size-7"
              onClick={generate}
              disabled={pending}
              aria-busy={pending}
              title={hasSummary ? "Regenerate summary" : "Generate summary"}
            >
              {pending ? (
                <Spinner size="sm" />
              ) : (
                <RefreshCw aria-hidden="true" className="size-3.5" />
              )}
              <span className="sr-only">
                {hasSummary ? "Regenerate summary" : "Generate summary"}
              </span>
            </Button>
          ))}
      </div>

      {hasSummary ? (
        <>
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {bullets.map((bullet, index) => (
              <li
                key={`bullet-${bullet.slice(0, 24)}-${index}`}
                className="flex gap-2 text-[13px] leading-relaxed text-slate-700"
              >
                <span
                  aria-hidden="true"
                  className="mt-[7px] size-1.5 shrink-0 rounded-full bg-brand-cta"
                />
                {bullet}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className="text-[11px] text-slate-400">
              {shownGeneratedAt
                ? `Generated: ${formatNaiveDate(utcIsoToClinicLocalInput(shownGeneratedAt, timezone))}`
                : "Generated earlier"}
            </p>
            <button
              type="button"
              onClick={copy}
              title="Copy summary to clipboard"
              className="ml-1 flex items-center gap-1 rounded-control border border-hairline bg-app px-1.5 py-0.5 text-[11px] font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
            >
              {copied ? (
                <Check aria-hidden="true" className="size-3" />
              ) : (
                <Copy aria-hidden="true" className="size-3" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
            {stale && (
              <>
                <Badge variant="warning" className="gap-1">
                  <AlertTriangle aria-hidden="true" className="size-3" />
                  Outdated summary
                </Badge>
                {canGenerate && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 gap-1 border-slate px-2 text-[11px] text-status-warning"
                    onClick={generate}
                    disabled={pending}
                    aria-busy={pending}
                  >
                    {pending ? <Spinner size="sm" /> : <RefreshCw aria-hidden="true" className="size-3" />}
                    Update
                  </Button>
                )}
              </>
            )}
          </div>
        </>
      ) : hasHistory && canGenerate ? (
        <div className="mt-2.5 flex flex-col items-start gap-2">
          <p className="text-sm text-slate-500">
            {emptyCopy ?? "No summary has been generated for this patient."}
          </p>
          <Button size="sm" className="gap-1.5" onClick={generate} disabled={pending} aria-busy={pending}>
            {pending ? <Spinner size="sm" /> : <Sparkles aria-hidden="true" className="size-3.5" />}
            {pending ? "Generating…" : "✨ Generate AI Patient Summary"}
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">
          {!hasHistory
            ? emptyCopy ?? AI_SUMMARY_EMPTY_STATE
            : "No summary has been generated for this patient."}
        </p>
      )}

      {pending && (
        <div className="mt-3 animate-pulse space-y-2" aria-busy="true" aria-label="Generating summary">
          <div className="h-3 w-11/12 rounded bg-slate-100" />
          <div className="h-3 w-9/12 rounded bg-slate-100" />
          <div className="h-3 w-10/12 rounded bg-slate-100" />
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs text-status-destructive">{error}</p>
      )}

      {hasScan && (
        <div className="mt-3 rounded-control border border-hairline bg-app p-3">
          <button
            type="button"
            onClick={() => setScanOpen((open) => !open)}
            aria-expanded={scanOpen}
            className="flex w-full items-center gap-1.5 text-left"
          >
            <ChevronRight
              aria-hidden="true"
              className={cn(
                "size-3.5 text-text-muted transition-transform",
                scanOpen && "rotate-90",
              )}
            />
            <ScanLine aria-hidden="true" className="size-3.5 text-text-secondary" />
            <span className="text-[12px] font-semibold text-ink">
              Document scan insights
            </span>
            <span className="text-[11px] text-ink-faint">
              {scanBullets.length} point{scanBullets.length === 1 ? "" : "s"}
            </span>
          </button>
          {scanOpen && (
            <div className="mt-2.5">
              <ul className="flex flex-col gap-1.5">
                {scanBullets.map((bullet, index) => (
                  <li
                    key={`scan-${bullet.slice(0, 24)}-${index}`}
                    className="flex gap-2 text-[12.5px] leading-relaxed text-slate-600"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-[6.5px] size-1.5 shrink-0 rounded-full bg-text-muted/60"
                    />
                    {bullet}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center gap-2">
                <p className="text-[11px] text-slate-400">
                  {scanGeneratedAt
                    ? `Scanned: ${formatNaiveDate(utcIsoToClinicLocalInput(scanGeneratedAt, timezone))}`
                    : "Scanned earlier"}
                </p>
                <button
                  type="button"
                  onClick={copyScan}
                  title="Copy scan summary to clipboard"
                  className="flex items-center gap-1 rounded-control border border-hairline bg-surface px-1.5 py-0.5 text-[11px] font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
                >
                  {copiedScan ? (
                    <Check aria-hidden="true" className="size-3" />
                  ) : (
                    <Copy aria-hidden="true" className="size-3" />
                  )}
                  {copiedScan ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}