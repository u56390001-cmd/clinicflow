/**
 * AI Patient Intake Summary — Tab 1, top of the Chief Complaint column.
 *
 * Deterministic (no model call): composes a one-line narrative and a suggested
 * field set from the patient's pre-appointment questionnaire
 * (`pre_consultation_answers`) using keyword matching, so the summary renders
 * instantly, offline, and identically on every visit.
 *
 * "Approve & Import" is non-destructive: chips are unioned into the encounter,
 * duration/severity/HPI fill only empty fields, and the merged result saves as
 * a single autosave (DermComplaintCard owns the write).
 */

import { CheckCircle2, Download, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ConsultationPreAnswer } from "@/lib/consultation-queries";
import type { PatientDirectoryRow } from "@/types/database";

export type IntakeSuggestion = {
  narrative: string;
  chief_complaints: string[];
  triggers: string[];
  associated_symptoms: string[];
  duration: string | null;
  severity: string | null;
  hpi: string | null;
};

type Matcher = [pattern: RegExp, label: string];

const COMPLAINT_MATCHERS: Matcher[] = [
  [/\bacne|pimple|breakout/, "Acne"],
  [/\beczema|dermatitis/, "Eczema flare"],
  [/\bhair (loss|fall|thinning)|alopecia/, "Hair loss"],
  [/\brash|eruption/, "Rash"],
  [/\bmole|nevus|naevus/, "Mole check"],
  [/\bpigment|melasma|dark patch/, "Pigmentation"],
  [/\bpsoriasis/, "Psoriasis"],
  [/\bvitiligo/, "Vitiligo"],
  [/\bkeloid/, "Keloid"],
  [/\bringworm|tinea|fungal|athlete'?s foot/, "Tinea / Ringworm"],
  [/\burticaria|hives?/, "Urticaria"],
  [/\brosacea/, "Rosacea"],
  [/\bwart|verruca/, "Warts"],
  [/\bscabies/, "Scabies"],
];

const TRIGGER_MATCHERS: Matcher[] = [
  [/\bsun|uv light|sunbed/, "Sun exposure"],
  [/\bserum|skincare|skin care|cosmetic|new product|moisturi/, "New skincare"],
  [/\bstress/, "Stress"],
  [/\bdiet|food/, "Diet"],
  [/\bseason|winter|summer|weather/, "Seasonal change"],
];

const SYMPTOM_MATCHERS: Matcher[] = [
  [/\bitch/, "Itching"],
  [/\bburn/, "Burning"],
  [/\bpain|tender|sore/, "Pain"],
  [/\bbleed/, "Bleeding"],
  [/\bscal(?:e|es|ing|y)|flake/, "Scaling"],
];

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

function matchAll(corpus: string, matchers: Matcher[]): string[] {
  const hits: string[] = [];
  for (const [pattern, label] of matchers) {
    if (pattern.test(corpus) && !hits.includes(label)) hits.push(label);
  }
  return hits;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function headFor(patient: PatientDirectoryRow): string {
  const parts: string[] = [];
  if (patient.age !== null && patient.age !== undefined) {
    parts.push(`${patient.age}yo`);
  }
  const initial =
    patient.gender === "female"
      ? "F"
      : patient.gender === "male"
        ? "M"
        : patient.gender === "other"
          ? "Other"
          : null;
  if (initial) parts.push(initial);
  return parts.length > 0 ? parts.join(" ") : "Patient";
}

/**
 * Builds the Tab 1 summary from the questionnaire, or null when there is
 * nothing usable to summarize (no answers, or only trivial Yes/No replies).
 */
export function buildIntakeSuggestion(
  patient: PatientDirectoryRow,
  preAnswers: ConsultationPreAnswer[],
): IntakeSuggestion | null {
  const answers = preAnswers
    .map((answer) => answer.answer_text?.trim() ?? "")
    .filter(Boolean);
  if (preAnswers.length === 0) return null;

  const corpus = preAnswers
    .map(
      (answer) =>
        `${answer.question?.question_text ?? ""} ${answer.answer_text ?? ""}`,
    )
    .join(" \n ")
    .toLowerCase();

  // The longest prose reply is the patient's own statement of the problem.
  const core = [...answers].sort((a, b) => b.length - a.length)[0] ?? null;
  if (!core || core.length < 15) return null;

  const statement = /^(I|my|we|the patient)\b/i.test(core);
  const head = headFor(patient);
  const body = statement ? core.trim() : lowerFirst(core.trim());
  let narrative = statement
    ? `${head} — ${body}`
    : `${head} presents with ${body}`;
  if (!/[.!?]$/.test(narrative)) narrative += ".";

  // Duration: "…for 2 months", "…since 3 weeks" → chip label (Months, …).
  let duration: string | null = null;
  const durationMatch = corpus.match(
    /(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:-\s*)?(day|week|month|year)s?\b/,
  );
  if (durationMatch) {
    const count = /^\d+$/.test(durationMatch[1])
      ? Number(durationMatch[1])
      : (WORD_NUMBERS[durationMatch[1]] ?? null);
    if (count && count > 0) {
      const unit = durationMatch[2];
      duration = unit.charAt(0).toUpperCase() + unit.slice(1) + "s";
    }
  }

  let severity: string | null = null;
  if (/\bsevere|unbearable|worst|very bad/.test(corpus)) severity = "Severe";
  else if (/\bmoderate|medium/.test(corpus)) severity = "Moderate";
  else if (/\bmild|slight|little/.test(corpus)) severity = "Mild";

  return {
    narrative,
    chief_complaints: matchAll(corpus, COMPLAINT_MATCHERS),
    triggers: matchAll(corpus, TRIGGER_MATCHERS),
    associated_symptoms: matchAll(corpus, SYMPTOM_MATCHERS),
    duration,
    severity,
    hpi: core,
  };
}

export function DermIntakeSummary({
  suggestion,
  onApprove,
  imported,
  disabled = false,
}: {
  suggestion: IntakeSuggestion;
  onApprove: () => void;
  imported: boolean;
  disabled?: boolean;
}) {
  const preview = [
    suggestion.duration,
    suggestion.severity,
    ...suggestion.chief_complaints,
    ...suggestion.associated_symptoms,
    ...suggestion.triggers,
  ].filter((item): item is string => Boolean(item));

  return (
    <div
      role="status"
      className="rounded-card border border-status-success/40 bg-status-success/10 p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-ink flex items-center gap-1.5 text-[12.5px] font-semibold">
            <Sparkles
              aria-hidden="true"
              className="size-4 text-status-success"
            />
            AI Patient Intake Summary
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
            {suggestion.narrative}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0 gap-1.5"
          onClick={onApprove}
          disabled={disabled || imported}
        >
          {imported ? (
            <CheckCircle2 aria-hidden="true" className="size-3.5" />
          ) : (
            <Download aria-hidden="true" className="size-3.5" />
          )}
          {imported ? "Imported" : "Approve & Import AI Suggested Data"}
        </Button>
      </div>

      {preview.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-ink-faint text-[11px] font-medium">
            Suggested:
          </span>
          {preview.map((item) => (
            <Badge
              key={item}
              className="border-hairline bg-surface text-text-secondary"
            >
              {item}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
