"use client";

import { useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Gauge,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ASSESSMENT_QUESTION_TYPES,
  ASSESSMENT_QUESTION_TYPE_LABELS,
  ASSESSMENT_TARGET_SPECIALTIES,
  ASSESSMENT_TARGET_SPECIALTY_LABELS,
  makeQuestion,
} from "@/lib/assessment-library";
import { saveAssessmentTemplateAction } from "@/lib/actions/assessment-library";
import { cn } from "@/lib/utils";
import type {
  AssessmentInterpretationRule,
  AssessmentQuestion,
  AssessmentQuestionOption,
  AssessmentQuestionType,
  AssessmentScoring,
  AssessmentSeverityBand,
  AssessmentTargetSpecialty,
  AssessmentTemplate,
  AssessmentTemplateStatus,
  ClinicAssessmentCategory,
} from "@/types/database";

type Draft = {
  id?: string | null;
  name: string;
  description: string;
  category_id: string | null;
  target_specialty: AssessmentTargetSpecialty;
  status: AssessmentTemplateStatus;
  questions: AssessmentQuestion[];
  scoring: AssessmentScoring;
  interpretation: AssessmentInterpretationRule[];
};

const STEPS = [
  { label: "Basic info", icon: "basic" },
  { label: "Questions", icon: "questions" },
  { label: "Scoring", icon: "scoring" },
  { label: "AI interpretation", icon: "ai" },
] as const;

function freshDraft(): Draft {
  return {
    id: null,
    name: "",
    description: "",
    category_id: null,
    target_specialty: "psychology",
    status: "active",
    questions: [],
    scoring: { method: "sum", min_score: 0, max_score: 30, bands: [] },
    interpretation: [],
  };
}

function fromTemplate(template: AssessmentTemplate): Draft {
  return {
    id: template.id,
    name: template.name,
    description: template.description ?? "",
    category_id: template.category_id ?? null,
    target_specialty: template.target_specialty,
    status: template.status,
    questions: template.questions.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      options: q.options.map((o) => ({ label: o.label, value: o.value })),
      required: q.required,
    })),
    scoring: template.scoring
      ? {
          method: template.scoring.method,
          min_score: template.scoring.min_score,
          max_score: template.scoring.max_score,
          bands: template.scoring.bands.map((b) => ({ min: b.min, max: b.max, label: b.label })),
        }
      : { method: "sum", min_score: 0, max_score: 30, bands: [] },
    interpretation: template.interpretation.map((r) => ({ min: r.min, max: r.max, text: r.text })),
  };
}

/** Band-stack sanity check, shared with the server action. */
function bandsOrdered(bands: AssessmentSeverityBand[]): boolean {
  return bands.every(
    (band, index) =>
      band.min <= band.max &&
      (index === 0 || (bands[index - 1]?.max ?? -1) < band.min),
  );
}

function BandsEditor({
  bands,
  onChange,
}: {
  bands: AssessmentSeverityBand[];
  onChange: (bands: AssessmentSeverityBand[]) => void;
}) {
  function patch(index: number, field: "min" | "max" | "label", value: string | number) {
    const next = bands.map((band, i) => (i === index ? { ...band, [field]: value } : band));
    onChange(next);
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] font-semibold text-text-primary">Severity bands</p>
      {bands.length === 0 ? (
        <p className="rounded-card border border-dashed border-hairline p-3 text-[12px] text-ink-faint">
          No bands yet — the workspace won&#39;t auto-fill severity until you add at
          least one.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {bands.map((band, index) => (
            <li key={`${band.min}-${band.max}-${index}`} className="flex flex-wrap items-center gap-2">
              <label className="flex w-16 shrink-0 flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">From</span>
                <Input
                  type="number"
                  min={0}
                  value={band.min}
                  onChange={(e) => patch(index, "min", Number(e.target.value))}
                  className="h-8"
                  aria-label={`Band ${index + 1} minimum score`}
                />
              </label>
              <label className="flex w-16 shrink-0 flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">To</span>
                <Input
                  type="number"
                  min={0}
                  value={band.max}
                  onChange={(e) => patch(index, "max", Number(e.target.value))}
                  className="h-8"
                  aria-label={`Band ${index + 1} maximum score`}
                />
              </label>
              <label className="min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Label</span>
                <Input
                  value={band.label}
                  onChange={(e) => patch(index, "label", e.target.value)}
                  placeholder="e.g. Moderate"
                  className="h-8"
                  aria-label={`Band ${index + 1} label`}
                />
              </label>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onChange(bands.filter((_, i) => i !== index))}
                aria-label="Remove band"
                className="mt-4 size-8"
              >
                <Trash2 className="size-4 text-status-destructive" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const last = bands[bands.length - 1];
            const start = last ? last.max + 1 : 0;
            onChange([...bands, { min: start, max: Math.max(start + 4, start), label: "" }]);
          }}
          className="gap-1.5"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Add band
        </Button>
        {!bandsOrdered(bands) ? (
          <p className="text-[11.5px] font-medium text-status-destructive">
            Bands must be ascending and non-overlapping.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function InterpretationEditor({
  rules,
  onChange,
}: {
  rules: AssessmentInterpretationRule[];
  onChange: (rules: AssessmentInterpretationRule[]) => void;
}) {
  function patch(index: number, field: "min" | "max" | "text", value: string | number) {
    const next = rules.map((rule, i) => (i === index ? { ...rule, [field]: value } : rule));
    onChange(next);
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] font-semibold text-text-primary">Interpretation rules</p>
      {rules.length === 0 ? (
        <p className="rounded-card border border-dashed border-hairline p-3 text-[12px] text-ink-faint">
          No rules yet. Add score ranges with guidance text, or leave empty to
          rely on severity bands alone.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rules.map((rule, index) => (
            <li key={`${rule.min}-${rule.max}-${index}`} className="rounded-card border border-hairline bg-app p-3">
              <div className="flex items-center gap-2">
                <label className="flex w-20 shrink-0 flex-col gap-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">From</span>
                  <Input
                    type="number"
                    min={0}
                    value={rule.min}
                    onChange={(e) => patch(index, "min", Number(e.target.value))}
                    className="h-8"
                    aria-label={`Rule ${index + 1} minimum score`}
                  />
                </label>
                <label className="flex w-20 shrink-0 flex-col gap-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">To</span>
                  <Input
                    type="number"
                    min={0}
                    value={rule.max}
                    onChange={(e) => patch(index, "max", Number(e.target.value))}
                    className="h-8"
                    aria-label={`Rule ${index + 1} maximum score`}
                  />
                </label>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onChange(rules.filter((_, i) => i !== index))}
                  aria-label="Remove rule"
                  className="size-8"
                >
                  <Trash2 className="size-4 text-status-destructive" aria-hidden="true" />
                </Button>
              </div>
              <Textarea
                value={rule.text}
                onChange={(e) => patch(index, "text", e.target.value)}
                rows={2}
                placeholder="Guidance for this score range (shown to the clinician)…"
                className="mt-2"
              />
            </li>
          ))}
        </ul>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          const last = rules[rules.length - 1];
          const start = last ? last.max + 1 : 0;
          onChange([...rules, { min: start, max: Math.max(start + 4, start), text: "" }]);
        }}
        className="w-fit gap-1.5"
      >
        <Plus className="size-3.5" aria-hidden="true" />
        Add rule
      </Button>
    </div>
  );
}

function QuestionEditor({
  question,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  question: AssessmentQuestion;
  index: number;
  total: number;
  onChange: (patch: Partial<AssessmentQuestion>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  function selectType(type: AssessmentQuestionType) {
    onChange({
      type,
      options:
        type === "text" || question.options.length > 0
          ? type === "text"
            ? []
            : question.options
          : [{ label: "", value: 0 }, { label: "", value: 1 }],
    });
  }

  function patchOption(optionIndex: number, patch: Partial<AssessmentQuestionOption>) {
    onChange({
      options: question.options.map((option, i) =>
        i === optionIndex ? { ...option, ...patch } : option,
      ),
    });
  }

  const showOptions = question.type !== "text";

  return (
    <li className="rounded-card border border-hairline bg-app p-3">
      <div className="flex items-center gap-1">
        <span className="mr-1 text-[12px] font-bold text-ink-faint">{index + 1}</span>
        <Input
          value={question.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="Question text…"
          aria-label={`Question ${index + 1} text`}
          className="flex-1"
        />
        <div className="flex items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Move question up"
            className="size-8"
          >
            <ArrowUp className="size-4" aria-hidden="true" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="Move question down"
            className="size-8"
          >
            <ArrowDown className="size-4" aria-hidden="true" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onRemove}
            aria-label="Remove question"
            className="size-8"
          >
            <Trash2 className="size-4 text-status-destructive" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <NativeSelect
          value={question.type}
          onChange={(e) => selectType(e.target.value as AssessmentQuestionType)}
          aria-label="Question type"
          className="w-40"
        >
          {ASSESSMENT_QUESTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {ASSESSMENT_QUESTION_TYPE_LABELS[type]}
            </option>
          ))}
        </NativeSelect>
        <label className="flex items-center gap-1.5 text-[12px] font-medium text-text-secondary">
          Optional
          <Switch
            checked={!question.required}
            onCheckedChange={(checked) => onChange({ required: !checked })}
            className="scale-75"
          />
        </label>
      </div>

      {showOptions ? (
        <div className="mt-2.5 flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            Options — multiple choice tallies the sum of selected values
          </p>
          {question.options.map((option, optionIndex) => (
            <div key={optionIndex} className="flex items-center gap-2">
              <Input
                type="number"
                value={option.value}
                onChange={(e) => patchOption(optionIndex, { value: Number(e.target.value) })}
                aria-label={`Option ${optionIndex + 1} value`}
                className="h-8 w-20"
              />
              <Input
                value={option.label}
                onChange={(e) => patchOption(optionIndex, { label: e.target.value })}
                placeholder="Response label"
                aria-label={`Option ${optionIndex + 1} label`}
                className="h-8 flex-1"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() =>
                  onChange({ options: question.options.filter((_, i) => i !== optionIndex) })
                }
                aria-label="Remove option"
                className="size-8"
              >
                <X className="size-4 text-ink-faint" aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onChange({
                options: [
                  ...question.options,
                  {
                    label: "",
                    value: (question.options[question.options.length - 1]?.value ?? 0) + 1,
                  },
                ],
              })
            }
            className="w-fit gap-1.5"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add option
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Four-step template builder: Basic info → Questions → Scoring →
 * AI interpretation. Both create (initial=null) and edit (initial=template)
 * run through this dialog; the payload is validated in the server action.
 */
export function AssessmentTemplateBuilderDialog({
  open,
  onOpenChange,
  categories,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ClinicAssessmentCategory[];
  initial: AssessmentTemplate | null;
  onSaved: () => void;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => (initial ? fromTemplate(initial) : freshDraft()));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [isPending, startTransition] = useTransition();

  function patch(patch: Partial<Draft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    setError(null);
  }

  function patchQuestion(index: number, change: Partial<AssessmentQuestion>) {
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) => (i === index ? { ...q, ...change } : q)),
    }));
  }

  function addQuestion() {
    setDraft((prev) => ({ ...prev, questions: [...prev.questions, makeQuestion("single")] }));
  }

  function removeQuestion(index: number) {
    setDraft((prev) => ({ ...prev, questions: prev.questions.filter((_, i) => i !== index) }));
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    setDraft((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.questions.length) return prev;
      const questions = [...prev.questions];
      const [moved] = questions.splice(index, 1);
      questions.splice(target, 0, moved);
      return { ...prev, questions };
    });
  }

  function canAdvance(): boolean {
    if (step === 0) {
      if (!draft.name.trim()) {
        setError("Give the assessment a name before moving on.");
        return false;
      }
      return true;
    }
    if (step === 1) {
      const blank = draft.questions.find((q) => !q.text.trim());
      if (blank) {
        setError("Every question needs text — empty questions aren't saved.");
        return false;
      }
      return true;
    }
    if (step === 2) {
      if (draft.scoring.min_score > draft.scoring.max_score) {
        setError("The score range is backwards — minimum can't exceed maximum.");
        return false;
      }
      if (!bandsOrdered(draft.scoring.bands)) {
        setError("Severity bands must be ascending and non-overlapping.");
        return false;
      }
      return true;
    }
    return true;
  }

  function next() {
    if (!canAdvance()) return;
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function save() {
    if (!canAdvance()) return;
    setPending(true);
    startTransition(async () => {
      const result = await saveAssessmentTemplateAction({
        id: draft.id ?? null,
        name: draft.name.trim(),
        description: draft.description.trim(),
        category_id: draft.category_id,
        target_specialty: draft.target_specialty,
        status: draft.status,
        questions: draft.questions.map((q) => ({
          id: q.id,
          text: q.text.trim(),
          type: q.type,
          options: q.options.map((o) => ({ label: o.label.trim(), value: o.value })),
          required: q.required,
        })),
        scoring: {
          method: draft.scoring.method,
          min_score: draft.scoring.min_score,
          max_score: draft.scoring.max_score,
          bands: draft.scoring.bands.map((b) => ({
            min: b.min,
            max: b.max,
            label: b.label.trim(),
          })),
        },
        interpretation: draft.interpretation.map((r) => ({
          min: r.min,
          max: r.max,
          text: r.text.trim(),
        })),
      });
      setPending(false);
      if (result.ok) {
        toast.success(initial ? "Assessment updated." : "Assessment saved.");
        onSaved();
        onOpenChange(false);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setError(null);
          setStep(0);
        }
      }}
    >
      <DialogContent size="wide">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit assessment template" : "Create assessment template"}</DialogTitle>
          <DialogDescription>
            Four steps: basics, questions, scoring and interpretation rules.
          </DialogDescription>
        </DialogHeader>

        <ol
          className="flex items-center gap-1 overflow-x-auto rounded-card border border-hairline bg-app p-2"
          aria-label="Template builder steps"
        >
          {STEPS.map((stepMeta, index) => {
            const active = index === step;
            const done = index < step;
            return (
              <li key={stepMeta.label} className="flex min-w-0 flex-1 items-center gap-1">
                <button
                  type="button"
                  onClick={() => (index < step ? setStep(index) : undefined)}
                  disabled={index > step || pending}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-control px-2.5 py-1.5 text-left transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : done
                        ? "text-text-primary hover:bg-skeleton"
                        : "text-text-muted",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-pill text-[11px] font-bold",
                      done
                        ? "bg-status-success/15 text-status-success"
                        : active
                          ? "bg-primary/20 text-primary"
                          : "bg-skeleton text-ink-faint",
                    )}
                  >
                    {done ? <Check className="size-3" aria-hidden="true" /> : index + 1}
                  </span>
                  <span className="truncate text-[12px] font-semibold">{stepMeta.label}</span>
                </button>
                {index < STEPS.length - 1 ? (
                  <span className="h-px w-2 shrink-0 bg-hairline" aria-hidden="true" />
                ) : null}
              </li>
            );
          })}
        </ol>

        <div className="flex min-h-[22rem] flex-col gap-4 overflow-y-auto pr-1">
          {step === 0 ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="template-name">Name</Label>
                  <Input
                    id="template-name"
                    value={draft.name}
                    onChange={(e) => patch({ name: e.target.value })}
                    placeholder="e.g. PHQ-9 · Depression"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="template-specialty">Target specialty</Label>
                  <NativeSelect
                    id="template-specialty"
                    value={draft.target_specialty}
                    onChange={(e) => patch({ target_specialty: e.target.value as AssessmentTargetSpecialty })}
                  >
                    {ASSESSMENT_TARGET_SPECIALTIES.map((specialty) => (
                      <option key={specialty} value={specialty}>
                        {ASSESSMENT_TARGET_SPECIALTY_LABELS[specialty]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="template-category">Category</Label>
                  <NativeSelect
                    id="template-category"
                    value={draft.category_id ?? ""}
                    onChange={(e) =>
                      patch({ category_id: e.target.value === "" ? null : e.target.value })
                    }
                  >
                    <option value="">Uncategorised</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-[12.5px] font-semibold text-text-primary">
                    Active
                    <Switch
                      checked={draft.status === "active"}
                      onCheckedChange={(checked) =>
                        patch({ status: checked ? "active" : "draft" })
                      }
                    />
                  </label>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="template-description">Description</Label>
                <Textarea
                  id="template-description"
                  rows={3}
                  value={draft.description}
                  onChange={(e) => patch({ description: e.target.value })}
                  placeholder="What this assessment measures, how long it takes, who it's for…"
                />
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <div className="flex flex-col gap-3">
              {draft.questions.length > 0 ? (
                <ul className="flex flex-col gap-3">
                  {draft.questions.map((question, index) => (
                    <QuestionEditor
                      key={question.id}
                      question={question}
                      index={index}
                      total={draft.questions.length}
                      onChange={(change) => patchQuestion(index, change)}
                      onRemove={() => removeQuestion(index)}
                      onMove={(direction) => moveQuestion(index, direction)}
                    />
                  ))}
                </ul>
              ) : (
                <p className="rounded-card border border-dashed border-hairline p-4 text-[12.5px] text-ink-faint">
                  No questions yet. You can keep it manual (clinician enters the
                  score), or add questions for patient-completed assessments.
                </p>
              )}
              <Button variant="outline" onClick={addQuestion} className="w-fit gap-1.5">
                <Plus className="size-4" aria-hidden="true" />
                Add question
              </Button>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="scoring-method">Scoring method</Label>
                  <NativeSelect
                    id="scoring-method"
                    value={draft.scoring.method}
                    onChange={(e) =>
                      patch({
                        scoring: {
                          ...draft.scoring,
                          method: e.target.value as AssessmentScoring["method"],
                        },
                      })
                    }
                  >
                    <option value="sum">Sum of answer values</option>
                    <option value="average">Average of answers</option>
                    <option value="manual">Clinician scores manually</option>
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="scoring-min">Minimum score</Label>
                  <Input
                    id="scoring-min"
                    type="number"
                    min={0}
                    value={draft.scoring.min_score}
                    onChange={(e) =>
                      patch({ scoring: { ...draft.scoring, min_score: Number(e.target.value) } })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="scoring-max">Maximum score</Label>
                  <Input
                    id="scoring-max"
                    type="number"
                    min={0}
                    value={draft.scoring.max_score}
                    onChange={(e) =>
                      patch({ scoring: { ...draft.scoring, max_score: Number(e.target.value) } })
                    }
                  />
                </div>
              </div>
              <BandsEditor
                bands={draft.scoring.bands}
                onChange={(bands) => patch({ scoring: { ...draft.scoring, bands } })}
              />
            </div>
          ) : null}

          {step === 3 ? (
            <div className="flex flex-col gap-4">
              <InterpretationEditor
                rules={draft.interpretation}
                onChange={(interpretation) => patch({ interpretation })}
              />
              <p className="flex items-center gap-1.5 text-[11.5px] text-ink-faint">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Rules help the AI phrase clinical guidance from the score. They&#39;re
                shown to clinicians, never to patients.
              </p>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-control border border-status-destructive/30 bg-status-destructive/5 px-3 py-2 text-[12.5px] font-medium text-status-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          {step > 0 ? (
            <Button variant="ghost" onClick={() => { setError(null); setStep((s) => s - 1); }} disabled={pending}>
              Back
            </Button>
          ) : null}
          {step === STEPS.length - 1 ? (
            <Button onClick={save} disabled={pending || isPending} className="gap-1.5">
              <Save className="size-4" aria-hidden="true" />
              {pending ? "Saving…" : initial ? "Save changes" : "Create template"}
            </Button>
          ) : (
            <Button onClick={next} className="gap-1.5">
              <Gauge className="size-4" aria-hidden="true" />
              Next
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}