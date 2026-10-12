"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { submitPreVisitLinkAction } from "@/lib/actions/patient-links";
import { PRE_VISIT_QUESTIONS } from "@/lib/pre-visit";

/**
 * The patient-facing pre-visit questionnaire. Questions are driven entirely by
 * `PRE_VISIT_QUESTIONS`, so the form, its validation copy, and the `psych_intake`
 * mapping stay in one place.
 */
export function PreVisitForm({
  token,
  preview,
}: {
  token: string;
  preview: { patientFirstName: string; clinicName: string };
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const answered = useMemo(
    () => PRE_VISIT_QUESTIONS.filter((q) => (answers[q.key] ?? "").trim().length > 0).length,
    [answers],
  );
  const total = PRE_VISIT_QUESTIONS.length;
  const progress = Math.round((answered / total) * 100);

  function set(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function submit() {
    if (working) return;
    for (const question of PRE_VISIT_QUESTIONS) {
      if (question.required && (answers[question.key] ?? "").trim().length === 0) {
        setError(`Please answer: ${question.label}`);
        return;
      }
    }
    setWorking(true);
    setError(null);

    const form = new FormData();
    form.set("token", token);
    form.set("answers", JSON.stringify(answers));

    void submitPreVisitLinkAction(null, form).then((res) => {
      setWorking(false);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="rounded-panel border border-hairline bg-surface px-6 py-12 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100">
          <Check aria-hidden="true" className="size-7 text-emerald-600" />
        </div>
        <h1 className="mt-4 text-xl font-extrabold text-text-primary">Thank you</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">
          Your answers were shared with{" "}
          <span className="font-medium text-text-primary">{preview.clinicName}</span>. Your
          clinician will review them before your visit.
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
        Before your visit
      </h1>
      <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
        A few questions to help your clinician prepare. Your answers stay private
        between you and {preview.clinicName}.
      </p>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
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
        {PRE_VISIT_QUESTIONS.map((question) => (
          <div
            key={question.key}
            className="rounded-panel border border-hairline bg-white p-4 shadow-sm"
          >
            <Label htmlFor={`pv-${question.key}`} className="block">
              {question.label}
              {question.required && <span className="text-red-500"> *</span>}
            </Label>
            {question.help && (
              <p className="mt-0.5 text-[11px] leading-relaxed text-text-muted">
                {question.help}
              </p>
            )}

            {question.type === "choice" ? (
              <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(question.options ?? []).map((option) => {
                  const isSelected = answers[question.key] === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => set(question.key, option)}
                      className={
                        "rounded-control border px-3 py-2 text-[12.5px] font-medium transition-colors " +
                        (isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-hairline bg-surface text-text-secondary hover:border-primary/40 hover:text-primary")
                      }
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            ) : question.type === "text" ? (
              <Input
                id={`pv-${question.key}`}
                className="mt-2.5"
                value={answers[question.key] ?? ""}
                onChange={(event) => set(question.key, event.target.value)}
              />
            ) : (
              <Textarea
                id={`pv-${question.key}`}
                className="mt-2.5"
                rows={3}
                value={answers[question.key] ?? ""}
                onChange={(event) => set(question.key, event.target.value)}
              />
            )}
          </div>
        ))}
      </div>

      <Button type="button" className="mt-5 w-full" disabled={working} onClick={submit}>
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
    </div>
  );
}
