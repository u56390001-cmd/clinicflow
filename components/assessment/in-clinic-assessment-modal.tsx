"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { canSendOnline, scoreTemplateAnswers, severityFromBands } from "@/lib/assessment-library";
import { saveInClinicAssessmentAction } from "@/lib/actions/specialty-workspaces";
import {
  PSYCHOMETRIC_INSTRUMENTS,
  isPsychometricKey,
  scoreInstrument,
  severityFor,
  type PsychometricKey,
} from "@/lib/psychometrics";
import {
  getInstrument,
  isValidatedInstrumentCode,
  scoreValidatedInstrument,
  toPatientInstrumentModel,
} from "@/lib/scoring";
import type { AssessmentTemplate } from "@/types/database";

/**
 * ✍️ Mode A — In-clinic interactive administration.
 *
 * An inline, clinician-driven wizard that reuses the patient wizard's
 * one-question-per-step UX but never leaves the patient record: the clinician
 * taps the answers on this screen or hands the tablet to the patient sitting
 * in the room. Scores, subscales (DASS-21 D/A/S) and severity are computed by
 * the same deterministic engine used for remote links — no manual math.
 */

const TEMPLATE_PREFIX = "tmpl:";

/** Validated instruments outside the legacy bank (Phase 1 + OPD expansion). */
const EXTRA_INSTRUMENT_CODES = ["DASS-21", "ISI", "PSS-10"] as const;

type ExtraCode = (typeof EXTRA_INSTRUMENT_CODES)[number];

function isExtraCode(value: string): value is ExtraCode {
  return (EXTRA_INSTRUMENT_CODES as readonly string[]).includes(value);
}

type Step = {
  id: string;
  text: string;
  multiple: boolean;
  required: boolean;
  options: { value: number; label: string }[];
};

export function InClinicAssessmentModal({
  open,
  patientId,
  patientLabel,
  templates,
  onClose,
  onSaved,
}: {
  open: boolean;
  patientId: string;
  /** "Test {patient.name} in room" → shown in the bar so a tablet handoff is labeled. */
  patientLabel: string;
  templates: AssessmentTemplate[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pick, setPick] = useState<string>("PHQ-9");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [multi, setMulti] = useState<Record<string, number[]>>({});
  const [step, setStep] = useState(0);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ instrument: string; score: number; severity: string | null } | null>(
    null,
  );

  const storageKey = `inclinic:${patientId}`;

  // Remount-safe autosave: an accidental reload mid-administration keeps the
  // answers for this patient.
  useEffect(() => {
    if (!open || done) return;
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify({ pick, answers, multi, step }));
    } catch {
      // Private-mode browsers — autosave simply does not persist.
    }
  }, [open, done, storageKey, pick, answers, multi, step]);

  // Restore once per open.
  useEffect(() => {
    if (!open) return;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { pick?: string; answers?: Record<string, number>; multi?: Record<string, number[]>; step?: number };
        if (saved.pick) setPick(saved.pick);
        if (saved.answers) setAnswers(saved.answers);
        if (saved.multi) setMulti(saved.multi);
        if (typeof saved.step === "number") setStep(saved.step);
      }
    } catch {
      // Corrupt payload — start clean.
    }
  }, [open, storageKey]);

  const options = useMemo(() => {
    const builtIns = Object.keys(PSYCHOMETRIC_INSTRUMENTS).map((key) => ({
      value: key,
      label: PSYCHOMETRIC_INSTRUMENTS[key as PsychometricKey].shortName,
    }));
    const extras = EXTRA_INSTRUMENT_CODES.map((code) => ({
      value: code,
      label: code,
    }));
    const tmpl = templates.filter(canSendOnline).map((t) => ({
      value: `${TEMPLATE_PREFIX}${t.id}`,
      label: t.name,
    }));
    return [...builtIns, ...extras, ...tmpl];
  }, [templates]);

  const steps = useMemo<Step[]>(() => {
    if (!open) return [];
    if (pick.startsWith(TEMPLATE_PREFIX)) {
      const template = templates.find((t) => `${TEMPLATE_PREFIX}${t.id}` === pick);
      if (!template) return [];
      return template.questions
        .filter((q) => q.type !== "text")
        .map((q) => ({
          id: q.id,
          text: q.text,
          multiple: q.type === "multiple",
          required: q.required,
          options: q.options,
        }));
    }
    if (isPsychometricKey(pick)) {
      const bank = PSYCHOMETRIC_INSTRUMENTS[pick];
      return bank.items.map((item) => ({
        id: item.id,
        text: item.text,
        multiple: false,
        required: true,
        options: [...bank.options],
      }));
    }
    if (isExtraCode(pick) || isValidatedInstrumentCode(pick)) {
      const def = getInstrument(pick);
      if (!def) return [];
      const model = toPatientInstrumentModel(def);
      return model.items.map((item) => ({
        id: item.id,
        text: item.text,
        multiple: false,
        required: true,
        options: [...model.options],
      }));
    }
    return [];
  }, [open, pick, templates]);

  const previewResult = useMemo(() => {
    if (pick.startsWith(TEMPLATE_PREFIX)) {
      const template = templates.find((t) => `${TEMPLATE_PREFIX}${t.id}` === pick);
      if (!template) return null;
      const score = scoreTemplateAnswers(template, buildAnswers(answers, multi));
      return score === null
        ? null
        : { instrument: template.name, score, severity: severityFromBands(template.scoring.bands, score) };
    }
    if (isPsychometricKey(pick)) {
      const bank = PSYCHOMETRIC_INSTRUMENTS[pick];
      const score = scoreInstrument(bank, answers);
      return { instrument: bank.shortName, score, severity: severityFor(bank, score) };
    }
    if ((isExtraCode(pick) || isValidatedInstrumentCode(pick)) && steps.length > 0) {
      const result = scoreValidatedInstrument(pick, answers);
      return { instrument: result.instrumentName, score: result.rawScore ?? 0, severity: result.severityBand };
    }
    return null;
  }, [pick, answers, multi, templates, steps.length]);

  const complete = steps.length > 0 && steps.every((s) =>
    s.multiple ? (multi[s.id] ?? []).length > 0 : answers[s.id] !== undefined,
  );

  if (!open) return null;
  const current = steps[Math.min(step, Math.max(steps.length - 1, 0))];

  function setAnswer(id: string, value: number) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  function toggleMulti(id: string, value: number) {
    setMulti((prev) => {
      const has = (prev[id] ?? []).includes(value);
      return { ...prev, [id]: has ? (prev[id] ?? []).filter((v) => v !== value) : [...(prev[id] ?? []), value] };
    });
  }

  async function submit() {
    if (working || !complete) return;
    setWorking(true);
    setError(null);
    const result = await saveInClinicAssessmentAction({
      patientId,
      assessmentType: pick.startsWith(TEMPLATE_PREFIX)
        ? (templates.find((t) => `${TEMPLATE_PREFIX}${t.id}` === pick)?.name ?? pick.slice(TEMPLATE_PREFIX.length))
        : pick,
      templateId: pick.startsWith(TEMPLATE_PREFIX) ? pick.slice(TEMPLATE_PREFIX.length) : null,
      raterType: "CLINICIAN",
      answers: buildAnswers(answers, multi),
    });
    setWorking(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Non-fatal.
    }
    setDone({
      instrument: result.data.instrument,
      score: result.data.score ?? 0,
      severity: result.data.severity,
    });
    onSaved();
  }

  function reset() {
    setPick("PHQ-9");
    setAnswers({});
    setMulti({});
    setStep(0);
    setError(null);
    setDone(null);
  }

  function close() {
    onClose();
    reset();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-text-primary/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-card bg-surface shadow-xl sm:rounded-card">
        {/* Bar */}
        <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-3">
          <div className="min-w-0">
            <p className="text-ink truncate text-[13px] font-bold">
              Administer in-clinic · {patientLabel}
            </p>
            <p className="text-text-muted text-[11px]">
              {done
                ? "Scored — nothing was typed by hand."
                : "Tap the answers, or hand the tablet to the patient in the room."}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="text-text-muted rounded-pill p-1.5 hover:bg-app hover:text-text-primary"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {done ? (
            <div className="flex flex-col items-center py-8 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-emerald-100">
                <Check aria-hidden="true" className="size-7 text-emerald-600" />
              </span>
              <p className="text-ink mt-3 text-lg font-extrabold">{done.instrument} recorded</p>
              <p className="text-text-primary mt-1 text-sm">
                Score {done.score}
                {done.severity ? ` · ${done.severity}` : ""}
              </p>
              <p className="text-text-muted mt-2 text-[12px]">
                Item-level answers, subscales and the severity band were computed by the
                scoring engine and saved to the record.
              </p>
              <div className="mt-4 flex gap-2">
                <Button type="button" size="sm" onClick={close}>
                  Done
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={reset}>
                  Run another
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-3">
                <p className="text-ink mb-1.5 text-[12.5px] font-bold">Assessment</p>
                <select
                  value={pick}
                  onChange={(e) => {
                    setPick(e.target.value);
                    setAnswers({});
                    setMulti({});
                    setStep(0);
                    setError(null);
                  }}
                  className="w-full rounded-control border border-text-muted/25 bg-app px-2 py-1.5 text-[12.5px] text-text-primary outline-none"
                >
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {steps.length === 0 ? (
                <p className="text-text-muted py-8 text-center text-[12.5px]">
                  This assessment has no questions to administer.
                </p>
              ) : current ? (
                <>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-text-muted">
                    <span>
                      Question {Math.min(step + 1, steps.length)} of {steps.length}
                    </span>
                    <span>
                      {steps.filter((s) =>
                        s.multiple ? (multi[s.id] ?? []).length > 0 : answers[s.id] !== undefined,
                      ).length}/{steps.length} answered
                    </span>
                  </div>
                  <div className="bg-app mt-1.5 h-2 w-full overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${Math.round(
                          (steps.filter((s) =>
                            s.multiple ? (multi[s.id] ?? []).length > 0 : answers[s.id] !== undefined,
                          ).length /
                            steps.length) *
                            100,
                        )}%`,
                      }}
                    />
                  </div>

                  {current && (
                    <div className="border-hairline mt-4 rounded-panel border bg-white p-3.5 shadow-sm">
                      <p className="text-ink text-[14px] leading-snug font-semibold">
                        {current.text}
                      </p>
                      <div
                        className="mt-3 flex flex-col gap-2"
                        role={current.multiple ? undefined : "radiogroup"}
                        aria-label={current.text}
                      >
                        {current.options.map((option) => {
                          const isSelected = current.multiple
                            ? (multi[current.id] ?? []).includes(option.value)
                            : answers[current.id] === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              role={current.multiple ? undefined : "radio"}
                              aria-checked={current.multiple ? undefined : isSelected}
                              onClick={() =>
                                current.multiple
                                  ? toggleMulti(current.id, option.value)
                                  : setAnswer(current.id, option.value)
                              }
                              className={
                                "flex items-center gap-3 rounded-control border px-3 py-2.5 text-start transition-colors " +
                                (isSelected
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-hairline bg-surface text-text-secondary hover:border-primary/40")
                              }
                            >
                              <span
                                className={
                                  "flex size-7 shrink-0 items-center justify-center rounded-md text-[12px] font-bold " +
                                  (isSelected ? "bg-primary text-white" : "bg-primary/10 text-primary")
                                }
                                aria-hidden="true"
                              >
                                {option.value}
                              </span>
                              <span className="text-[12.5px] font-medium">{option.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {error && (
                    <p
                      role="alert"
                      className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
                    >
                      {error}
                    </p>
                  )}
                </>
              ) : null}
            </>
          )}
        </div>

        {/* Footer */}
        {!done && steps.length > 0 && current && (
          <div className="flex items-center gap-2 border-t border-hairline px-4 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              Back
            </Button>
            {previewResult && complete && (
              <span className="text-text-muted hidden text-[11px] font-semibold sm:block">
                {previewResult.instrument}: {previewResult.score}
                {previewResult.severity ? ` · ${previewResult.severity}` : ""}
              </span>
            )}
            {step < steps.length - 1 ? (
              <Button
                type="button"
                size="sm"
                className="flex-1"
                disabled={current.multiple ? (multi[current.id] ?? []).length === 0 : answers[current.id] === undefined}
                onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
              >
                Next
                <ChevronRight aria-hidden="true" className="size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="flex-1 gap-1.5"
                disabled={!complete || working}
                onClick={submit}
              >
                {working ? (
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                ) : (
                  <Check aria-hidden="true" className="size-3.5" />
                )}
                {working ? "Scoring…" : "Save & score"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** multiple-choice answers carry the SUM of the picked values (shared scorer). */
function buildAnswers(
  answers: Record<string, number>,
  multi: Record<string, number[]>,
): Record<string, number> {
  const out = { ...answers };
  for (const [id, values] of Object.entries(multi)) {
    out[id] = values.reduce((sum, v) => sum + v, 0);
  }
  return out;
}
