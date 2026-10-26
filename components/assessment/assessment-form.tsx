"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";

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
import type {
  AssessmentQuestion,
  AssessmentTemplate,
} from "@/types/database";

type Result = { score: number; severity: string | null; instrument: string };

/**
 * The patient-facing psychometric assessment.
 *
 * Three document sources share one renderer:
 *   * a Phase 1 validated instrument (PHQ-9 / GAD-7 / C-SSRS / PCL-5 /
 *     WHODAS 2.0), rendered from a serializable engine model and including
 *     C-SSRS branching;
 *   * the legacy built-in bank (BDI-II), driven by `lib/psychometrics.ts`; and
 *   * clinic library templates (migration 0085) that are scored and
 *     patient-completable, rendered from their stored questions/options.
 *
 * 3-WAY LOCALISATION (`AssessmentLanguageToggle`): English / Urdu Nastaliq / Roman
 * Urdu, switched instantly and persisted under `eval:{token}` in sessionStorage.
 * PHQ-9 / GAD-7 / DASS-21 carry full translation packs in
 * `lib/assessments/translations/`; everything else falls back to English. The
 * layer is display-only — answers keep their numeric keys/values, so scoring,
 * the answers JSONB and severity never see a translated word.
 */
export function AssessmentForm({
  token,
  instrumentKey,
  instrument,
  template,
  preview,
  initialLanguage,
}: {
  token: string;
  /** Present for the legacy built-in instrument flow. */
  instrumentKey?: PsychometricKey | null;
  /** Present for a Phase 1 validated instrument. */
  instrument?: PatientInstrumentModel | null;
  /** The clinic library template this link was minted for, when applicable. */
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

  /** Numeric answers for single/scale questions (keyed by question id). */
  const [answers, setAnswers] = useState<Record<string, number>>({});
  /** Selected option values for multiple-choice questions (keyed by question id). */
  const [multi, setMulti] = useState<Record<string, number[]>>({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // Language: server hint first, then the patient's own previous choice, then
  // the browser locale. A stored choice wins because it was made deliberately.
  const [lang, setLang] = useState<AssessmentLanguage>(initialLanguage ?? "en");
  useEffect(() => {
    if (initialLanguage) return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { language?: AssessmentLanguage };
        if (saved?.language) {
          setLang(saved.language);
          return;
        }
      }
    } catch {
      // No storage — fall through to browser detection.
    }
    setLang(languageFromClient());
  }, [initialLanguage, storageKey]);

  // Persist the chosen language — the wizard keeps progress here too.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      const saved = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      if (saved.language !== lang) {
        sessionStorage.setItem(storageKey, JSON.stringify({ ...saved, language: lang }));
      }
    } catch {
      // Storage unavailable — best-effort persistence.
    }
  }, [lang, storageKey]);

  const dir = dirForLanguage(lang);
  const typography = urduTypographyClass(lang);

  const scorableQuestions = useMemo(
    () => (template ? template.questions.filter((q) => q.type !== "text") : []),
    [template],
  );

  /** Items for the engine/bank renderer (validated instrument or legacy bank). */
  const bankItems = useMemo(
    () => instrument?.items ?? bank?.items.map((item) => ({ id: item.id, text: item.text })) ?? [],
    [instrument, bank],
  );
  const bankOptions = instrument?.options ?? bank?.options ?? [];
  const branching = useMemo(() => instrument?.branching ?? [], [instrument]);

  /** Translation pack for validated instruments (PHQ-9 / GAD-7 / DASS-21). */
  const pack = useMemo(
    () => getInstrumentTranslation(instrument?.code ?? instrumentKey ?? null),
    [instrument?.code, instrumentKey],
  );

  /** Localised item text with the strict English fallback. */
  function itemText(id: string, fallback: string): string {
    if (pack && pack.items[id]) return resolveLocalized(pack.items[id], lang) ?? fallback;
    return fallback;
  }

  /** Localised option label with the strict English fallback (value untouched). */
  function optionLabel(value: number, fallback: string): string {
    if (pack && pack.options[value]) {
      return resolveLocalized(pack.options[value], lang) ?? fallback;
    }
    return fallback;
  }

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

  function isAnswered(question: AssessmentQuestion): boolean {
    if (question.type === "multiple") return (multi[question.id] ?? []).length > 0;
    return answers[question.id] !== undefined;
  }

  const templateAnswered = scorableQuestions.filter(isAnswered).length;
  const bankAnswered = bankItems.filter(
    (item) => applicable.has(item.id) && answers[item.id] !== undefined,
  ).length;

  const usingBank = bankItems.length > 0;
  const answeredItems = usingBank ? bankAnswered : templateAnswered;
  const total = usingBank ? applicable.size : scorableQuestions.length;
  const progress = total > 0 ? Math.round((answeredItems / total) * 100) : 0;
  const complete = total > 0 && answeredItems === total;

  /** Set a numeric answer and drop any now-inapplicable branch answers. */
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
      setResult(res.data);
    });
  }

  const instrumentName = instrument?.name ?? bank?.name ?? template?.name ?? "Questionnaire";
  const instrumentCode = instrument?.code ?? instrumentKey ?? null;
  const packInstrument = getInstrumentTranslation(instrumentCode);
  const instructions =
    packInstrument?.instructions
      ? resolveLocalized(packInstrument.instructions, lang)
      : ((instrument?.instructions ?? bank?.instructions ?? template?.description ?? "") as string);

  if (result) {
    const band = usingBank
      ? (instrument ? result.severity : severityFor(bank!, result.score))
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
        <h1 className="text-2xl font-extrabold text-text-primary">
          {instrumentName}
        </h1>
      </header>
      {instructions ? (
        <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
          {instructions}
        </p>
      ) : null}

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] font-semibold text-text-muted">
          <span>
            {uiString("answeredOf", lang, { answered: answeredItems, total })}
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
        {usingBank
          ? bankItems.map((item, index) => {
              if (!applicable.has(item.id)) return null;
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
                    <p className="text-start text-[13.5px] font-semibold leading-snug text-text-primary">
                      {itemText(item.id, item.text)}
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {bankOptions.map((option) => {
                      const isSelected = selected === option.value;
                      return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setAnswer(item.id, option.value)}
                        className={
                          "assessment-choice-label rounded-control border px-3 py-2 text-start text-[12.5px] font-medium transition-colors " +
                          (isSelected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-hairline bg-surface text-text-secondary hover:border-primary/40 hover:text-primary")
                        }
                      >
                        {optionLabel(option.value, option.label)}
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
                      {uiString("noQuestionsNote", lang, { text: question.text })}
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
                      <p className="text-start text-[13.5px] font-semibold leading-snug text-text-primary">
                        {question.text}
                        {question.required ? (
                          <span className="ms-1 text-status-destructive" aria-hidden="true">
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
                              "assessment-choice-label rounded-control border px-3 py-2 text-start text-[12.5px] font-medium transition-colors " +
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
            {uiString("submitting", lang)}
          </>
        ) : (
          <>
            <Check aria-hidden="true" className="size-4" />
            {uiString("submit", lang)}
          </>
        )}
      </Button>

      <p className="mt-3 text-center text-[11px] leading-relaxed text-text-muted">
        {uiString("footnote", lang, { clinic: preview.clinicName })}
      </p>
    </div>
  );
}
