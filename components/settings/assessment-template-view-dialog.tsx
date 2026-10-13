"use client";

import {
  ClipboardList,
  ListChecks,
  Gauge,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ASSESSMENT_QUESTION_TYPE_LABELS,
  ASSESSMENT_TARGET_SPECIALTY_LABELS,
} from "@/lib/assessment-library";
import type {
  AssessmentInterpretationRule,
  AssessmentQuestion,
  AssessmentScoring,
  AssessmentTemplate,
  ClinicAssessmentCategory,
} from "@/types/database";

function SectionHeading({
  icon: Icon,
  children,
  count,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <h4 className="flex items-center gap-2 text-[13px] font-bold text-text-primary">
      <Icon className="size-4 text-primary" aria-hidden="true" />
      {children}
      {count !== undefined ? (
        <span className="font-semibold text-ink-faint">({count})</span>
      ) : null}
    </h4>
  );
}

function OptionList({ question }: { question: AssessmentQuestion }) {
  if (question.type === "text" || question.options.length === 0) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5">
      {question.options.map((option) => (
        <li
          key={option.value}
          className="rounded-pill border border-hairline bg-skeleton px-2 py-0.5 text-[11.5px] text-text-secondary"
        >
          {option.label ? `${option.label} · ${option.value}` : option.value}
        </li>
      ))}
    </ul>
  );
}

function QuestionCard({
  question,
  index,
}: {
  question: AssessmentQuestion;
  index: number;
}) {
  return (
    <li className="rounded-card border border-hairline bg-app p-3">
      <p className="text-[12.5px] font-semibold leading-snug text-text-primary">
        <span className="mr-1.5 text-ink-faint">{index + 1}.</span>
        {question.text}
        {question.required ? (
          <span className="ml-1 text-status-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <Badge variant="outline">
          {ASSESSMENT_QUESTION_TYPE_LABELS[question.type]}
        </Badge>
        {question.type !== "text" ? (
          <span className="text-[11.5px] text-ink-faint">
            {question.options.length} option{question.options.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      <OptionList question={question} />
    </li>
  );
}

function BandRow({ band }: { band: AssessmentScoring["bands"][number] }) {
  return (
    <div className="flex items-center gap-2 rounded-control border border-hairline bg-app px-2.5 py-1.5">
      <span className="shrink-0 rounded-pill bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
        {band.min}–{band.max}
      </span>
      <span className="truncate text-[12.5px] font-medium text-text-primary">
        {band.label}
      </span>
    </div>
  );
}

function InterpretationRow({ rule }: { rule: AssessmentInterpretationRule }) {
  return (
    <li className="rounded-card border border-hairline bg-app p-3">
      <span className="shrink-0 rounded-pill bg-status-info/10 px-2 py-0.5 text-[11px] font-bold text-status-info">
        Score {rule.min}–{rule.max}
      </span>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-secondary">
        {rule.text}
      </p>
    </li>
  );
}

/**
 * Read-only peek at a library template: meta, questions, scoring bands and the
 * AI interpretation rules. The manager's rows stay small; details live here.
 */
export function AssessmentTemplateViewDialog({
  open,
  onOpenChange,
  template,
  category,
  usageCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: AssessmentTemplate | null;
  category?: ClinicAssessmentCategory | null;
  usageCount: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide">
        <DialogHeader>
          <DialogTitle>{template?.name ?? "Assessment template"}</DialogTitle>
          <DialogDescription>
            {template?.status === "active"
              ? "Active — shown in the Psychometrics workspace."
              : "Draft — not yet available in the workspace."}
          </DialogDescription>
        </DialogHeader>

        {template ? (
          <div className="flex flex-col gap-5 overflow-y-auto pr-1">
            <div className="rounded-card border border-hairline bg-app p-3.5">
              <p className="text-[12.5px] leading-relaxed text-text-secondary">
                {template.description || "No description."}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Badge variant="outline">{template.status}</Badge>
                <Badge variant="outline">
                  {ASSESSMENT_TARGET_SPECIALTY_LABELS[template.target_specialty]}
                </Badge>
                {category ? <Badge variant="outline">{category.name}</Badge> : null}
                <Badge variant="outline">Used in {usageCount} record{usageCount === 1 ? "" : "s"}</Badge>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <SectionHeading icon={ListChecks} count={template.questions.length}>
                Questions
              </SectionHeading>
              {template.questions.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {template.questions.map((question, index) => (
                    <QuestionCard key={question.id} question={question} index={index} />
                  ))}
                </ul>
              ) : (
                <p className="rounded-card border border-dashed border-hairline p-3 text-[12.5px] text-ink-faint">
                  No questions yet — this template is scored manually.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <SectionHeading icon={Gauge}>Scoring</SectionHeading>
              <div className="rounded-card border border-hairline bg-app p-3.5">
                <div className="flex items-center gap-2 text-[12px] capitalize text-text-secondary">
                  <Badge variant="outline">{template.scoring.method}</Badge>
                  <span>
                    Score range {template.scoring.min_score}–{template.scoring.max_score}
                  </span>
                </div>
                {template.scoring.bands.length > 0 ? (
                  <div className="mt-3 flex flex-col gap-1.5">
                    {template.scoring.bands.map((band) => (
                      <BandRow key={`${band.min}-${band.max}`} band={band} />
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[12px] text-ink-faint">
                    No severity bands defined.
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <SectionHeading icon={Sparkles} count={template.interpretation.length}>
                AI interpretation rules
              </SectionHeading>
              {template.interpretation.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {template.interpretation.map((rule, index) => (
                    <InterpretationRow key={index} rule={rule} />
                  ))}
                </ul>
              ) : (
                <p className="rounded-card border border-dashed border-hairline p-3 text-[12.5px] text-ink-faint">
                  No interpretation rules yet — the workspace will show the
                  severity band label only.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-ink-faint">
            <ClipboardList className="size-5" aria-hidden="true" />
            No template selected.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}