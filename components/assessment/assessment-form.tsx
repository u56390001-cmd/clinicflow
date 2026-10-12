"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { submitAssessmentLinkAction } from "@/lib/actions/patient-links";
import {
  PSYCHOMETRIC_INSTRUMENTS,
  severityFor,
  type PsychometricKey,
} from "@/lib/psychometrics";

type Result = { score: number; severity: string | null; instrument: string };

/**
 * The patient-facing psychometric assessment (PHQ-9, GAD-7, BDI-II, PCL-5).
 *
 * Mobile-first: one instrument definition drives the whole form — instruments
 * are not branched in the UI. A progress bar tracks answered items, and the
 * score + severity band are generated automatically on submit.
 */
export function AssessmentForm({
  token,
  instrumentKey,
  preview,
}: {
  token: string;
  instrumentKey: PsychometricKey;
  preview: { patientFirstName: string; clinicName: string };
}) {
  const instrument = PSYCHOMETRIC_INSTRUMENTS[instrumentKey];
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const answered = useMemo(
    () => instrument.items.filter((item) => answers[item.id] !== undefined).length,
    [answers, instrument.items],
  );
  const total = instrument.items.length;
  const progress = Math.round((answered / total) * 100);
  const complete = answered === total;

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
    form.set("answers", JSON.stringify(answers));

    void submitAssessmentLinkAction(null, form).then((res) => {
      setWorking(false);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setResult(res.data);
    });
  }

  if (result) {
    const band = severityFor(instrument, result.score);
    return (
      <div className="rounded-panel border border-hairline bg-surface px-6 py-12 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100">
          <Check aria-hidden="true" className="size-7 text-emerald-600" />
        </div>
        <h1 className="mt-4 text-xl font-extrabold text-text-primary">Submitted</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">
          Thank you. Your {instrument.shortName} answers were shared with{" "}
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
        {instrument.name}
      </h1>
      <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
        {instrument.instructions}
      </p>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] font-semibold text-text-muted">
          <span>
            {answered} of {total} answered
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
        {instrument.items.map((item, index) => {
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
                {instrument.options.map((option) => {
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
        })}
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
