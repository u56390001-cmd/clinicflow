"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Pencil, Sparkles, Wand2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  approveAllPsychIntakeSuggestionsAction,
  approvePsychIntakeSuggestionAction,
  generatePsychIntakeSuggestionsAction,
  rejectPsychIntakeSuggestionAction,
  updatePsychIntakeSuggestionAction,
} from "@/lib/actions/specialty-workspaces";
import type { PsychIntakeSuggestion } from "@/types/database";

const FIELD_LABELS: Record<PsychIntakeSuggestion["field"], string> = {
  previous_therapy_history: "Therapy history",
  previous_diagnosis: "Previous diagnosis",
  family_mental_health_history: "Family history",
  psychosocial_background: "Psychosocial",
  stressors: "Stressors",
  substance_use_history: "Substance use",
};

const SOURCE_LABELS: Record<PsychIntakeSuggestion["source"], string> = {
  pre_visit: "Patient intake form",
  document: "Uploaded document",
  session: "Session notes",
  assessment: "Assessment",
  ai: "AI summary",
};

type RowAction = "approve" | "reject" | "save";

/**
 * The AI review queue at the top of the Intake & History tab. The assistant
 * reads the patient's recent session notes, assessments, intake form and
 * uploaded documents and stages proposed history additions here; nothing
 * reaches the permanent record until the psychologist approves it. Review lets
 * the clinician approve or reject one row, Edit corrects it first, and Accept
 * All folds every pending suggestion into the history in one pass.
 */
export function PsychIntakeSuggestionsCard({
  patientId,
  suggestions,
  canManage,
}: {
  patientId: string;
  suggestions: PsychIntakeSuggestion[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [busy, setBusy] = useState<{ id: string; kind: RowAction } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (!canManage && suggestions.length === 0) return null;

  async function generate() {
    if (generating) return;
    setGenerating(true);
    const result = await generatePsychIntakeSuggestionsAction(patientId);
    setGenerating(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(result.data);
    router.refresh();
  }

  async function acceptAll() {
    if (accepting || suggestions.length === 0) return;
    setAccepting(true);
    const result = await approveAllPsychIntakeSuggestionsAction(patientId);
    setAccepting(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("All suggestions accepted into the intake history.");
    router.refresh();
  }

  async function review(id: string, kind: RowAction) {
    if (busy) return;
    if (kind === "save") {
      const value = draft.trim();
      if (!value) {
        toast.error("A suggestion cannot be empty.");
        return;
      }
      setBusy({ id, kind });
      const result = await updatePsychIntakeSuggestionAction({ id, value });
      setBusy(null);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setEditingId(null);
      toast.success("Suggestion updated.");
      router.refresh();
      return;
    }

    setBusy({ id, kind });
    const result =
      kind === "approve"
        ? await approvePsychIntakeSuggestionAction({ id })
        : await rejectPsychIntakeSuggestionAction({ id });
    setBusy(null);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(
      kind === "approve"
        ? "Added to the patient's history."
        : "Suggestion dismissed.",
    );
    router.refresh();
  }

  const pendingCount = suggestions.length;

  return (
    <section className="rounded-card border border-primary/25 bg-primary/5 p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink">
          <Sparkles aria-hidden="true" className="size-3.5 text-primary" />
          AI Extracted History
          {pendingCount > 0 && (
            <Badge variant="info" className="ml-1">
              {pendingCount} to review
            </Badge>
          )}
        </h4>
        {canManage && (
          <div className="flex flex-wrap items-center gap-1.5">
            {pendingCount > 0 && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-[12px]"
                onClick={acceptAll}
                disabled={accepting}
              >
                {accepting ? (
                  <>
                    <Spinner size="sm" /> Accepting…
                  </>
                ) : (
                  <>
                    <Check aria-hidden="true" className="size-3.5" />
                    Accept all
                  </>
                )}
              </Button>
            )}
            <Button
              type="button"
              variant={pendingCount > 0 ? "ghost" : "outline"}
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-[12px] text-text-secondary hover:text-primary"
              onClick={generate}
              disabled={generating || accepting}
            >
              {generating ? (
                <>
                  <Spinner size="sm" /> Reviewing notes…
                </>
              ) : (
                <>
                  <Wand2 aria-hidden="true" className="size-3.5" />
                  {pendingCount > 0 ? "Find more" : "Scan recent notes"}
                </>
              )}
            </Button>
          </div>
        )}
      </header>

      {pendingCount === 0 ? (
        <p className="text-[12px] leading-relaxed text-text-secondary">
          The assistant reads the patient&apos;s intake form, uploaded documents
          and previous records and proposes history details for you to review.
          Nothing is added to the record until you accept it.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {suggestions.map((suggestion) => {
            const rowBusy = busy?.id === suggestion.id ? busy.kind : null;
            const disabled = busy !== null;
            const editing = editingId === suggestion.id;

            return (
              <li
                key={suggestion.id}
                className="rounded-control border border-primary/20 bg-surface px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center rounded-pill border border-primary/30 bg-primary/10 px-1.5 py-px text-[10px] font-semibold leading-tight text-primary">
                        {FIELD_LABELS[suggestion.field]}
                      </span>
                      <span className="text-[11px] font-medium text-text-muted">
                        {SOURCE_LABELS[suggestion.source]}
                        {suggestion.source_label
                          ? ` · ${suggestion.source_label}`
                          : ""}
                      </span>
                    </span>

                    {editing ? (
                      <Textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        rows={2}
                        className="mt-1 min-h-0 text-[13px]"
                        autoFocus
                      />
                    ) : (
                      <span className="text-[13px] leading-snug text-text-primary">
                        {suggestion.value}
                      </span>
                    )}
                  </div>

                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      {editing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => review(suggestion.id, "save")}
                            disabled={disabled}
                            title="Save changes"
                            aria-label="Save suggestion changes"
                            className="inline-flex size-6 items-center justify-center rounded-md text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50"
                          >
                            {rowBusy === "save" ? (
                              <Spinner size="sm" />
                            ) : (
                              <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            disabled={disabled}
                            title="Cancel edit"
                            aria-label="Cancel edit"
                            className="inline-flex size-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50"
                          >
                            <X aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(suggestion.id);
                              setDraft(suggestion.value);
                            }}
                            disabled={disabled}
                            title="Edit"
                            aria-label="Edit suggestion"
                            className="inline-flex size-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50"
                          >
                            <Pencil aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
                          </button>
                          <button
                            type="button"
                            onClick={() => review(suggestion.id, "approve")}
                            disabled={disabled}
                            title="Approve — add to history"
                            aria-label="Approve suggestion"
                            className="inline-flex size-6 items-center justify-center rounded-md text-status-success transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50"
                          >
                            {rowBusy === "approve" ? (
                              <Spinner size="sm" />
                            ) : (
                              <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => review(suggestion.id, "reject")}
                            disabled={disabled}
                            title="Reject"
                            aria-label="Reject suggestion"
                            className="inline-flex size-6 items-center justify-center rounded-md text-status-destructive transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50"
                          >
                            {rowBusy === "reject" ? (
                              <Spinner size="sm" />
                            ) : (
                              <X aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pendingCount > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
          AI proposed these from the intake form, documents and previous
          records. Review each one, edit to correct first, or accept all.
        </p>
      )}
    </section>
  );
}
