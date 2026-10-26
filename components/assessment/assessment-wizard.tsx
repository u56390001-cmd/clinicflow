"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ClinicHeader } from "@/components/assessment/clinic-header";
import { AssessmentLanguageToggle } from "@/components/assessment/assessment-language-toggle";
import { severityFromBands } from "@/lib/assessment-library";
import { submitAssessmentLinkAction } from "@/lib/actions/patient-links";
import {
  PSYCHOMETRIC_INSTRUMENTS,
  severityFor,
  type PsychometricKey,
} from "@/lib/psychometrics";
import {
  dirForLanguage,
  getInstrumentTranslation,
  languageFromClient,
  resolveLocalized,
  uiString,
  urduTypographyClass,
  type AssessmentLanguage,
} from "@/lib/assessments/translations";
import type { PatientInstrumentModel } from "@/lib/scoring/types";
import type { AssessmentQuestion, AssessmentTemplate } from "@/types/database";

type Result = { score: number; severity: string | null; instrument: string };

type Step = {
  id: string;
  text: string;
  required: boolean;
  multiple: boolean;
  options: { value: number; label: string }[];
};

type SavedProgress = {
  answers: Record<string, number>;
  multi: Record<string, number[]>;
  step: number;
  language?: AssessmentLanguage;
};

/**
 * Phase 3 mobile assessment wizard (`/eval/[token]`).
 *
 * A one-question-at-a-time, thumb-reachable alternative to the scrolling
 * `AssessmentForm`. Same three document sources and the same server-side scorer
 * (`submitAssessmentLinkAction`) — only the presentation differs:
 *   * one question per step with Back / Next;
 *   * a clear numeric scale legend on every item;
 *   * progress auto-saved to `sessionStorage` so a dropped connection or an
 *     accidental refresh does not lose answers — the chosen language is stored
 *     alongside `eval:{token}`;
 *   * full 3-way localisation (`AssessmentLanguageToggle`): English / اردو /
 *     Roman Urdu, swapping labels, directions (`dir`) and typography instantly
 *     without touching the numeric scoring keys;
 *   * full RTL support (Tailwind logical properties + a `dir` on the root), so
 *     Urdu Nastaliq patients read the wizard correctly.
 */
export function AssessmentWizard({
  token,
  instrumentKey,
  instrument,
  template,
  preview,
  initialLanguage,
}: {
  token: string;
  instrumentKey?: PsychometricKey | null;
  instrument?: PatientInstrumentModel | null;
  template?: AssessmentTemplate | null;
  preview: {
    patientFirstName: string;
    clinicName: string;
    clinicPhone?: string | null;
    clinicAddress?: string | null;
    clinicLogoPath?: string | null;
  };
  /** Server-detected from the Accept-Language header (ur/ar → اردو). */
  initialLanguage?: AssessmentLanguage;
}) {
  const bank = instrumentKey ? PSYCHOMETRIC_INSTRUMENTS[instrumentKey] : null;
  const storageKey = `eval:${token}`;

  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [multi, setMulti] = useState<Record<string, number[]>>({});
  const [step, setStep] = useState(0);
  const [restored, setRestored] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [lang, setLang] = useState<AssessmentLanguage>(initialLanguage ?? "en");
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Restore any in-progress answers for this token (session memory).
  // The patient's language choice rides along in the same payload.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as SavedProgress;
        if (saved && typeof saved === "object") {
          if (saved.answers) setAnswers(saved.answers);
          if (saved.multi) setMulti(saved.multi);
          if (typeof saved.step === "number") setStep(saved.step);
          if (saved.language) setLang(saved.language);
        }
      } else if (!initialLanguage) {
        setLang(languageFromClient());
      }
    } catch {
      // Corrupt/stale payload — start clean rather than trap the patient.
    }
    setRestored(true);
  }, [storageKey, initialLanguage]);

  // Auto-save progress locally; cleared on successful submit.
  useEffect(() => {
    if (!restored || result) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ answers, multi, step, language: lang }),
      );
    } catch {
      // Storage unavailable (private mode) — autosave is best-effort.
    }
  }, [answers, multi, step, lang, restored, result, storageKey]);

  const dir = dirForLanguage(lang);
  const typography = urduTypographyClass(lang);

  /** Items for the engine/bank renderer (validated instrument or legacy bank). */
  const bankItems = useMemo(
    () =>
      instrument?.items ??
      bank?.items.map((item) => ({ id: item.id, text: item.text })) ??
      [],
    [instrument, bank],
  );
  const bankOptions = useMemo(
    () => instrument?.options ?? bank?.options ?? [],
    [instrument, bank],
  );
  const branching = useMemo(() => instrument?.branching ?? [], [instrument]);

  /** Translation pack for validated instruments (PHQ-9 / GAD-7 / DASS-21). */
  const pack = useMemo(
    () => getInstrumentTranslation(instrument?.code ?? instrumentKey ?? null),
    [instrument?.code, instrumentKey],
  );

  /** Item ids that apply given the current branching answers. */
  const applicable = useMemo(() => {
    const set = new Set(bankItems.map((item) => item.id));
    for (const rule of branching) {
      const value = answers[rule.dependsOn];
      const active = value !== undefined && rule.showWhen.includes(value);
      for (const id of rule.items) {
        if (active) set.add(id);
        else set.delete(id);
      }
    }
    return set;
  }, [bankItems, branching, answers]);

  const usingBank = bankItems.length > 0;

  const steps: Step[] = useMemo(() => {
    if (usingBank) {
      return bankItems
        .filter((item) => applicable.has(item.id))
        .map((item) => ({
          id: item.id,
          text: item.text,
          required: true,
          multiple: false,
          options: bankOptions.map((option) => ({
            value: option.value,
            label: option.label,
          })),
        }));
    }
    if (template) {
      return template.questions
        .filter((question): question is AssessmentQuestion => question.type !== "text")
        .map((question) => ({
          id: question.id,
          text: question.text,
          required: question.required,
          multiple: question.type === "multiple",
          options: question.options.map((option) => ({
            value: option.value,
            label: option.label || String(option.value),
          })),
        }));
    }
    return [];
  }, [usingBank, bankItems, applicable, bankOptions, template]);

  /** Display layer: localised item text + option labels, English fallback. */
  const displaySteps: Step[] = useMemo(() => {
    if (lang === "en" || !pack) return steps;
    return steps.map((s) => ({
      ...s,
      text: pack.items[s.id] ? (resolveLocalized(pack.items[s.id], lang) ?? s.text) : s.text,
      options: s.options.map((option) => ({
        value: option.value,
        label: pack.options[option.value]
          ? (resolveLocalized(pack.options[option.value], lang) ?? option.label)
          : option.label,
      })),
    }));
  }, [steps, lang, pack]);

  const clampedStep = displaySteps.length === 0 ? 0 : Math.min(step, displaySteps.length - 1);
  const current = displaySteps[clampedStep];

  function isAnswered(item: Step): boolean {
    if (item.multiple) return (multi[item.id] ?? []).length > 0;
    return answers[item.id] !== undefined;
  }

  const answeredCount = steps.filter(isAnswered).length;
  const total = steps.length;
  const progress = total > 0 ? Math.round((answeredCount / total) * 100) : 0;
  const complete = total > 0 && answeredCount === total;

  function setAnswer(id: string, value: number) {
    setAnswers((prev) => {
      const next = { ...prev, [id]: value };
      for (const rule of branching) {
        const depends = next[rule.dependsOn];
        const active = depends !== undefined && rule.showWhen.includes(depends);
        if (!active) {
          for (const branchId of rule.items) delete next[branchId];
        }
      }
      return next;
    });
  }

  function toggleMulti(questionId: string, value: number) {
    setMulti((prev) => {
      const currentValues = prev[questionId] ?? [];
      const has = currentValues.includes(value);
      const next = has
        ? currentValues.filter((v) => v !== value)
        : [...currentValues, value];
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

  function goNext() {
    setError(null);
    setStep((s) => Math.min(s + 1, steps.length - 1));
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  function submit() {
    if (working) return;
    if (!complete) {
      setError(uiString("errorIncomplete", lang));
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
        setError(uiString("errorSubmitFailed", lang));
        return;
      }
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        // Non-fatal.
      }
      setResult(res.data);
    });
  }

  const instrumentName =
    instrument?.name ?? bank?.name ?? template?.name ?? "Questionnaire";
  const packInstructions = pack?.instructions;
  const instructions = packInstructions
    ? resolveLocalized(packInstructions, lang)
    : (instrument?.instructions ??
      bank?.instructions ??
      template?.description ??
      "");
  const Back = dir === "rtl" ? ChevronRight : ChevronLeft;
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;

  if (result) {
    const band = usingBank
      ? instrument
        ? result.severity
        : severityFor(bank!, result.score)
      : severityFromBands(template?.scoring.bands ?? [], result.score);
    return (
      <div dir={dir} className={typography}>
        <div className="rounded-panel border border-hairline bg-surface px-6 py-12 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100">
            <Check aria-hidden="true" className="size-7 text-emerald-600" />
          </div>
          <h1 className="mt-4 text-xl font-extrabold text-text-primary">
            {uiString("submittedTitle", lang)}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">
            {uiString("thankYouBody", lang, {
              instrument: result.instrument,
              clinic: preview.clinicName,
            })}
            {band
              ? uiString("thankYouBand", lang, { band })
              : uiString("thankYouBodyPlain", lang)}
          </p>
          <p className="mt-6 text-xs text-text-muted">{uiString("closeNote", lang)}</p>
        </div>
      </div>
    );
  }

  if (displaySteps.length === 0 || !current) {
    return (
      <div dir={dir} className={typography}>
        <div className="rounded-panel border border-hairline bg-surface px-6 py-12 text-center">
          <h1 className="text-xl font-extrabold text-text-primary">
            {uiString("emptyTitle", lang)}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">
            {uiString("emptyBody", lang, { clinic: preview.clinicName })}
          </p>
        </div>
      </div>
    );
  }

  const selected = answers[current.id];

  return (
    <div dir={dir} className={typography}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-2 border-b border-hairline pb-5">
        <ClinicHeader
          clinicName={preview.clinicName}
          phone={preview.clinicPhone}
          address={preview.clinicAddress}
          logoPath={preview.clinicLogoPath}
        />
        <AssessmentLanguageToggle value={lang} onChange={setLang} />
      </div>
      <header>
        <h1 className="text-2xl font-extrabold text-text-primary">{instrumentName}</h1>
      </header>
      {instructions && clampedStep === 0 ? (
        <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">{instructions}</p>
      ) : null}

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] font-semibold text-text-muted">
          <span>
            {uiString("questionOf", lang, { current: clampedStep + 1, total })}
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

      <div className="mt-5 rounded-panel border border-hairline bg-white p-4 shadow-sm">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-start text-[15px] font-semibold leading-snug text-text-primary outline-none"
        >
          {current.text}
          {current.required ? (
            <span className="ms-1 text-status-destructive" aria-hidden="true">
              *
            </span>
          ) : null}
        </h2>

        <div
          role="radiogroup"
          aria-label={current.text}
          className="mt-4 flex flex-col gap-2"
        >
          {current.options.map((option) => {
            const isSelected = current.multiple
              ? (multi[current.id] ?? []).includes(option.value)
              : selected === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() =>
                  current.multiple
                    ? toggleMulti(current.id, option.value)
                    : setAnswer(current.id, option.value)
                }
                className={
                  "assessment-choice-label flex items-center gap-3 rounded-control border px-3 py-3 text-start transition-colors " +
                  (isSelected
                    ? "border-primary bg-primary/10"
                    : "border-hairline bg-surface hover:border-primary/40")
                }
              >
                <span
                  className={
                    "flex size-8 shrink-0 items-center justify-center rounded-md text-[13px] font-bold " +
                    (isSelected
                      ? "bg-primary text-white"
                      : "bg-primary/10 text-primary")
                  }
                  aria-hidden="true"
                >
                  {option.value}
                </span>
                <span
                  className={
                    "text-[13px] font-medium " +
                    (isSelected ? "text-primary" : "text-text-secondary")
                  }
                >
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={clampedStep === 0 || working}
          onClick={goBack}
        >
          <Back aria-hidden="true" className="size-4" />
          {uiString("back", lang)}
        </Button>

        {clampedStep < total - 1 ? (
          <Button
            type="button"
            className="flex-1"
            disabled={!isAnswered(current)}
            onClick={goNext}
          >
            {uiString("next", lang)}
            <Next aria-hidden="true" className="size-4" />
          </Button>
        ) : (
          <Button
            type="button"
            className="flex-1"
            disabled={working || !complete}
            onClick={submit}
          >
            {working ? (
              <>
                <Spinner size="sm" />
                {uiString("submitting", lang)}
              </>
            ) : (
              <>
                <Check aria-hidden="true" className="size-4" />
                {uiString("submit", lang)}
              </>
            )}
          </Button>
        )}
      </div>

      <p className="mt-3 text-center text-[11px] leading-relaxed text-text-muted">
        {uiString("footnote", lang, { clinic: preview.clinicName })}
      </p>
    </div>
  );
}
