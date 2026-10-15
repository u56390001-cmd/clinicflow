"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Edit2, Loader2, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  generateLongitudinalInsightAction,
  saveClinicalNoteAction,
} from "@/lib/actions/clinical-notes";
import type { LongitudinalTrajectory } from "@/lib/ai/longitudinal-summary";
import { cn } from "@/lib/utils";

export interface AISummaryCardProps {
  patientId: string;
  /** Scored assessments on file; drives the "need two" hint and display only. */
  assessmentCount: number;
  canManage: boolean;
  className?: string;
}

function trajectoryBadge(t: LongitudinalTrajectory) {
  const map = {
    IMPROVING: "bg-emerald-100 text-emerald-700",
    STABLE: "bg-slate-100 text-slate-700",
    DETERIORATING: "bg-rose-100 text-rose-700",
    FLUCTUATING: "bg-amber-100 text-amber-700",
  } as const;
  return map[t];
}

/**
 * Phase 4 — clinician-in-the-loop AI summary card.
 *
 * Draft, edit and approval states. An unapproved draft is never clinical
 * documentation: only `[Approve & Save to EHR]` writes to the append-only
 * `clinical_notes` table (via a Server Action that also records the audit
 * event), so the EHR only ever contains text a clinician signed off on.
 */
export function AISummaryCard({ patientId, assessmentCount, canManage, className }: AISummaryCardProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [trajectory, setTrajectory] = useState<LongitudinalTrajectory | null>(null);
  const [summary, setSummary] = useState("");
  const [observations, setObservations] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setSaved(false);
    const result = await generateLongitudinalInsightAction(patientId);
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setTrajectory(result.data.trajectory);
    setSummary(result.data.summary_markdown);
    setObservations(result.data.key_observations);
    setEditing(false);
  }

  async function approveAndSave() {
    if (saving || !summary.trim()) return;
    setSaving(true);
    setError(null);
    const result = await saveClinicalNoteAction({
      patientId,
      contentMarkdown: summary.trim(),
      source: "ai_longitudinal_summary",
      metadata: {
        trajectory,
        key_observations: observations,
        assessment_count: assessmentCount,
      },
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSaved(true);
    setEditing(false);
    toast.success("Approved and saved to EHR");
  }

  if (!canManage) return null;

  const hasDraft = summary.trim().length > 0;

  return (
    <div className={cn("rounded-panel border border-hairline bg-surface p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles aria-hidden="true" className="size-4 text-primary" />
          <h3 className="text-sm font-bold text-text-primary">AI longitudinal summary</h3>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={generate} disabled={loading || saving}>
          {loading ? (
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw aria-hidden="true" className="size-3.5" />
          )}
          {hasDraft ? "Regenerate" : "Generate"}
        </Button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700"
        >
          {error}
        </p>
      )}

      {trajectory && (
        <div className="mt-3 flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              trajectoryBadge(trajectory),
            )}
          >
            {trajectory}
          </span>
          <span className="text-xs text-text-muted">{assessmentCount} assessment(s)</span>
        </div>
      )}

      {hasDraft && (
        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                AI draft — not yet part of the record
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing((v) => !v)}
                disabled={saved}
              >
                <Edit2 aria-hidden="true" className="size-3.5" />
                {editing ? "Cancel edit" : "Edit"}
              </Button>
            </div>
            {editing ? (
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={4}
                className="w-full resize-y rounded-control border border-text-muted/25 bg-surface p-2 text-sm leading-relaxed text-text-primary outline-none"
              />
            ) : (
              <p className="whitespace-pre-line text-sm leading-relaxed text-text-primary">
                {summary}
              </p>
            )}
          </div>

          {observations.length > 0 && (
            <div className="rounded-lg border border-hairline bg-white p-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Key observations
              </span>
              <ul className="mt-2 space-y-1.5">
                {observations.map((observation, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 text-sm text-text-secondary"
                  >
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                    {editing ? (
                      <input
                        value={observation}
                        onChange={(e) => {
                          const next = [...observations];
                          next[index] = e.target.value;
                          setObservations(next);
                        }}
                        className="w-full rounded-control border border-text-muted/25 bg-surface px-2 py-1 text-xs text-text-primary outline-none"
                      />
                    ) : (
                      <span>{observation}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={approveAndSave}
              disabled={saved || saving || !summary.trim()}
            >
              {saving ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <Check aria-hidden="true" className="size-3.5" />
              )}
              {saved ? "Saved to EHR" : "Approve & Save to EHR"}
            </Button>
          </div>
        </div>
      )}

      {!hasDraft && !loading && (
        <p className="mt-3 text-sm text-text-muted">
          {assessmentCount >= 2
            ? "Generate an AI summary of longitudinal trends across this patient's assessments."
            : "At least two scored assessments are needed to analyse a trend."}
        </p>
      )}
    </div>
  );
}
