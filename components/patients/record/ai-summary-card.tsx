"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
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
 * Generation is manual (plan §1.4 / decision D4): the button POSTs to
 * `/api/patients/{id}/ai-summary`, which caches the result on the patient row.
 * Nothing generates on page load, so opening a record costs no model call. The
 * button only appears when the deployment has set `PATIENT_AI_SUMMARY_ENABLED` —
 * a control that always errors is worse than no control.
 */
export function AiSummaryCard({
  patientId,
  summary,
  generatedAt,
  generatedFromVisitCount,
  visitCount,
  timezone,
  canManage,
  enabled,
}: {
  patientId: string;
  summary: string | null;
  generatedAt: string | null;
  generatedFromVisitCount: number | null;
  visitCount: number;
  timezone: string;
  canManage: boolean;
  /** `PATIENT_AI_SUMMARY_ENABLED` — resolved on the server and passed down. */
  enabled: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shows the new text immediately; `router.refresh()` then brings the server
  // prop into line. Both end up with the same value.
  const [fresh, setFresh] = useState<{
    summary: string;
    generatedAt: string | null;
  } | null>(null);

  const shownSummary = fresh?.summary ?? summary;
  const shownGeneratedAt = fresh ? fresh.generatedAt : generatedAt;
  const hasSummary = Boolean(shownSummary?.trim());
  const hasHistory = visitCount > 0;

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

  return (
    <section className="rounded-card border border-primary/25 bg-primary/5 p-4">
      <div className="flex items-center gap-2">
        <Sparkles aria-hidden="true" className="size-4 text-primary" />
        <h3 className="text-sm font-semibold text-secondary">
          AI Patient Summary
        </h3>
        {canGenerate && (
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
        )}
      </div>

      {hasSummary ? (
        <>
          <p className="mt-2 whitespace-pre-wrap text-sm text-text-primary">
            {shownSummary}
          </p>
          <p className="mt-3 text-xs text-text-muted">
            {shownGeneratedAt
              ? `Generated ${formatNaiveDate(utcIsoToClinicLocalInput(shownGeneratedAt, timezone))}`
              : "Generated earlier"}
            {stale ? " · new visits since" : ""}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-text-secondary">
          {!hasHistory
            ? AI_SUMMARY_EMPTY_STATE
            : canGenerate
              ? "No summary yet. Generate one from this patient's recorded history."
              : "No summary has been generated for this patient."}
        </p>
      )}

      {pending && (
        <p className="mt-2 text-xs text-text-muted">Reading the record…</p>
      )}
      {error && (
        <p className="mt-2 text-xs text-status-destructive">{error}</p>
      )}
    </section>
  );
}
