"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { severityFromBands } from "@/lib/assessment-library";
import { submitAssessmentLinkAction } from "@/lib/actions/patient-links";
import {
  PSYCHOMETRIC_INSTRUMENTS,
  severityFor,
  type PsychometricKey,
} from "@/lib/psychometrics";
import type {
  AssessmentQuestion,
  AssessmentTemplate,
} from "@/types/database";

type Result = { score: number; severity: string | null; instrument: string };

/**
 * The patient-facing psychometric assessment.
 *
 * Two document sources share one renderer:
 *   * the built-in bank (PHQ-9, GAD-7, BDI-II, PCL-5), driven entirely by
 *     `lib/psychometrics.ts`; and
 *   * clinic library templates (migration 0085) that are scored and
 *     patient-completable, rendered from their stored questions/options.
 *
 * Mobile-first, with a progress bar. Answers are plain per-item values for
 * single/scale; multiple-choice stores the SUM of the selected option values so
 * the shared sum-scorer (server side) tallies correctly. The score + severity
 * band are generated automatically on submit.
 */
export function AssessmentForm({
  token,
  instrumentKey,
  template,
  preview,
}: {
  token: string;
  /** Present for the built-in instrument flow, absent for template templates. */
  instrumentKey?: PsychometricKey | null;
  /** The clinic library template this link was minted for, when applicable. */
  template?: AssessmentTemplate | null;
  preview: { patientFirstName: string; clinicName: string };
}) {
  const bank = instrumentKey ? PSYCHOMETRIC_INSTRUMENTS[instrumentKey] : null;

  /** Numeric answers for single/scale questions (keyed by question id). */
  const [answers, setAnswers] = useState<Record<string, number>>({});
  /** Selected option values for multiple-choice questions (keyed by question id). */
  const [multi, setMulti] = useState<Record<string, number[]>>({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const scorableQuestions = useMemo(
    () => (template ? template.questions.filter((q) => q.type !== "text") : []),
    [template],
  );

  function isAnswered(question: AssessmentQuestion): boolean {
    if (question.type === "multiple") return (multi[question.id] ?? []).length > 0;
    return answers[question.id] !== undefined;
  }

  function answeredCount(): number {
    if (bank) return 0; // computed below via bank.items
    return scorableQuestions.filter(isAnswered).length;
  }

  const answered = bank ? 0 : answeredCount();
  const totalScored = bank ? 0 : scorableQuestions.length;

  const answeredItems = bank ? bank.items.filter((i) => answers[i.id] !== undefined).length : answered;
  const total = bank ? bank.items.length : totalScored;
  const progress = total > 0 ? Math.round((answeredItems / total) * 100) : 0;
  const complete = answeredItems === total && total > 0;

  function toggleMulti(questionId: string, value: number) {
    setMulti((prev) => {
      const current = prev[questionId] ?? [];
      const has = current.includes(value);
      const next = has ? current.filter((v) => v !== value) : [...current, value];
      return { ...prev, [questionId]: next };
    });
  }

  function buildAnswers(): Record<string, number> {
    const out: Record<string, number> = { ...answers };
    for (const [questionId, values] of Object.entries(multi)) {
      out[questionId] = values.reduce((sum, v) => sum + v, 0);
    }
    return out;
  }

  function submit() {
    if (working) return;
    if (!complete) {
      setError("Please answer every question before submitting.");
      return;
    }
    setWorking(true);
    setError(null);

    const form = new FormData();
    form.set("token", token);
    form.set("answers", JSON.stringify(buildAnswers()));

    void submitAssessmentLinkAction(null, form).then((res) => {
      setWorking(false);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setResult(res.data);
    });
  }

  const instrumentName = bank?.name ?? template?.name ?? "Questionnaire";
  const instructions = bank?.instructions ?? template?.description ?? "";

  if (result) {
    const band = bank
      ? severityFor(bank, result.score)
      : severityFromBands(template?.scoring.bands ?? [], result.score);
    return (
      <div className="rounded-panel border border-hairline bg-surface px-6 py-12 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100">
          <Check aria-hidden="true" className="size-7 text-emerald-600" />
        </div>
        <h1 className="mt-4 text-xl font-extrabold text-text-primary">Submitted</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">
          Thank you. Your {result.instrument} answers were shared with{" "}
          <span className="font-medium text-text-primary">{preview.clinicName}</span>.
          {band ? ` The result falls in the "${band}" range — your clinician will review it with you.` : " Your clinician will review it with you."}
        </p>
        <p className="mt-6 text-xs text-text-muted">You can close this page now.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
        {preview.clinicName}
      </p>
      <h1 className="mt-1 text-2xl font-extrabold text-text-primary">
        {instrumentName}
      </h1>
      {instructions ? (
        <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
          {instructions}
        </p>
      ) : null}

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] font-semibold text-text-muted">
          <span>
            {answeredItems} of {total} answered
          </span>
          <span>{progress}%</span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
        >
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-4">
        {bank
          ? bank.items.map((item, index) => {
              const selected = answers[item.id];
              return (
                <div
                  key={item.id}
                  className="rounded-panel border border-hairline bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-bold text-primary">
                      {index + 1}
                    </span>
                    <p className="text-[13.5px] font-semibold leading-snug text-text-primary">
                      {item.text}
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {bank.options.map((option) => {
                      const isSelected = selected === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() =>
                            setAnswers((prev) => ({ ...prev, [item.id]: option.value }))
                          }
                          className={
                            "rounded-control border px-3 py-2 text-left text-[12.5px] font-medium transition-colors " +
                            (isSelected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-hairline bg-surface text-text-secondary hover:border-primary/40 hover:text-primary")
                          }
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          : template
            ? template.questions.map((question, index) => {
                if (question.type === "text") {
                  return (
                    <div
                      key={question.id}
                      className="rounded-panel border border-hairline bg-surface p-4 text-[12px] italic text-text-muted"
                    >
                      “{question.text}” is answered with your clinician.
                    </div>
                  );
                }
                const multiple = question.type === "multiple";
                const picked = multiple ? (multi[question.id] ?? []) : [];
                const selected = answers[question.id];
                return (
                  <div
                    key={question.id}
                    className="rounded-panel border border-hairline bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-bold text-primary">
                        {index + 1}
                      </span>
                      <p className="text-[13.5px] font-semibold leading-snug text-text-primary">
                        {question.text}
                        {question.required ? (
                          <span className="ml-1 text-status-destructive" aria-hidden="true">
                            *
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {question.options.map((option) => {
                        const isSelected = multiple
                          ? picked.includes(option.value)
                          : selected === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() =>
                              multiple
                                ? toggleMulti(question.id, option.value)
                                : setAnswers((prev) => ({
                                    ...prev,
                                    [question.id]: option.value,
                                  }))
                            }
                            className={
                              "rounded-control border px-3 py-2 text-left text-[12.5px] font-medium transition-colors " +
                              (isSelected
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-hairline bg-surface text-text-secondary hover:border-primary/40 hover:text-primary")
                            }
                          >
                            {option.label || option.value}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            : null}
      </div>

      <Button
        type="button"
        className="mt-5 w-full"
        disabled={working || !complete}
        onClick={submit}
      >
        {working ? (
          <>
            <Spinner size="sm" />
            Submitting…
          </>
        ) : (
          <>
            <Check aria-hidden="true" className="size-4" />
            Submit answers
          </>
        )}
      </Button>

      <p className="mt-3 text-center text-[11px] leading-relaxed text-text-muted">
        Shared privately with {preview.clinicName} only. This is not a diagnosis —
        your clinician will interpret your answers.
      </p>
    </div>
  );
}