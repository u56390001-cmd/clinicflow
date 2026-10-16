"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Accessibility,
  Activity,
  AlignLeft,
  Brain,
  Check,
  ChevronDown,
  Compass,
  Ear,
  Eye,
  Gauge,
  Lightbulb,
  Loader2,
  MessageSquare,
  PenLine,
  Pill,
  Scale,
  ShieldAlert,
  Smile,
  Sparkles,
  TriangleAlert,
  Wand2,
  type LucideIcon,
} from "lucide-react";

import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NarrativeAssistNote } from "@/components/patients/record/workspaces/narrative-assist-note";
import { ChipPicker, NoteStatus } from "@/components/patients/record/workspaces/specialty-form";
import { VoiceInputButton } from "@/components/patients/record/workspaces/voice-input-button";
import {
  assistPsychMseAction,
  savePsychMseFindingsAction,
  savePsychMseSummaryAction,
  type MseAssistKind,
} from "@/lib/actions/specialty-workspaces";
import {
  MSE_FIELD_SHORT_LABELS,
  MSE_OPTIONS,
  MSE_SECTIONS,
  buildMseOverview,
  hasMseFindings,
  mseSummarySentence,
  readMseFindings,
  sectionFindingCount,
  type MseFieldKey,
  type MseFindings,
  type MseSectionDef,
} from "@/lib/psych-mse";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/utils/datetime";
import type { PatientPsychBundle } from "@/lib/patient-record";

const SECTION_ICONS: Record<string, LucideIcon> = {
  appearance: Eye,
  behavior: Activity,
  consciousness: Gauge,
  orientation: Compass,
  speech: MessageSquare,
  mood: Smile,
  affect: Smile,
  thought_process: Brain,
  thought_content: Brain,
  perception: Ear,
  cognition: Brain,
  insight: Lightbulb,
  judgment: Scale,
  risk: ShieldAlert,
  functioning: Accessibility,
  substance: Pill,
  notes: PenLine,
};

function MseSectionCard({
  section,
  findings,
  canManage,
  onToggle,
  onCommitNote,
  onCommitAdditional,
  onCommitScore,
}: {
  section: MseSectionDef;
  findings: MseFindings;
  canManage: boolean;
  onToggle: (field: MseFieldKey, options: string[]) => void;
  onCommitNote: (field: MseFieldKey, text: string) => Promise<boolean>;
  onCommitAdditional: (text: string) => Promise<boolean>;
  onCommitScore: (key: "mmse" | "moca", value: string) => void;
}) {
  const [open, setOpen] = useState(() =>
    section.kind === "notes"
      ? Boolean(findings.additional_notes?.trim())
      : sectionFindingCount(findings, section) > 0 || (section.fields[0] ?? "") === "appearance",
  );
  const Icon = SECTION_ICONS[section.id] ?? Brain;
  const count = sectionFindingCount(findings, section);

  if (section.kind === "notes") {
    return (
      <div className="rounded-card border border-hairline bg-surface">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex w-full items-center gap-2.5 rounded-card px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-pill",
              open ? "bg-primary/10 text-primary" : "bg-app text-text-secondary",
            )}
          >
            <Icon aria-hidden="true" className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1 text-[13px] font-bold text-ink">{section.title}</span>
          {count > 0 && (
            <span className="rounded-pill bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {count}
            </span>
          )}
          <ChevronDown
            aria-hidden="true"
            className={cn("size-4 transition-transform text-text-muted", open && "rotate-180")}
          />
        </button>
        {open && (
          <div className="space-y-3.5 border-t border-hairline px-4 pb-4 pt-3">
            <NarrativeAssistNote
              label="Additional notes"
              name="psych-mse-additional-notes"
              value={findings.additional_notes ?? ""}
              onSave={onCommitAdditional}
              fieldLabel="Additional mental status notes"
              rows={5}
              placeholder="Anything else relevant to the examination…"
              disabled={!canManage}
            />
          </div>
        )}
      </div>
    );
  }

  const noteField = section.fields[0] ?? "appearance";

  return (
    <div className="rounded-card border border-hairline bg-surface">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-card px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-pill",
            open ? "bg-primary/10 text-primary" : "bg-app text-text-secondary",
          )}
        >
          <Icon aria-hidden="true" className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 text-[13px] font-bold text-ink">{section.title}</span>
        {count > 0 && (
          <span className="rounded-pill bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            {count}
          </span>
        )}
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 transition-transform text-text-muted", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="space-y-3.5 border-t border-hairline px-4 pb-4 pt-3">
          {section.description && (
            <p className="text-[11.5px] leading-relaxed text-ink-faint">{section.description}</p>
          )}

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
            {section.fields.map((field) => {
              const state = findings[field];
              const short = MSE_FIELD_SHORT_LABELS[field];
              return (
                <div key={field}>
                  {short && (
                    <p className="text-ink mb-1.5 text-[12.5px] font-bold">{short}</p>
                  )}
                  {canManage ? (
                    <ChipPicker
                      options={MSE_OPTIONS[field]}
                      value={state?.options ?? []}
                      onChange={(options) => onToggle(field, options)}
                    />
                  ) : (state?.options.length ?? 0) > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {(state?.options ?? []).map((option) => (
                        <span
                          key={option}
                          className="rounded-pill border border-hairline bg-app px-2.5 py-1 text-[11.5px] font-medium capitalize leading-none text-text-primary"
                        >
                          {option.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[11.5px] text-ink-faint">Not recorded</span>
                  )}
                </div>
              );
            })}

            {section.scores && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-ink mb-1.5 block text-[12.5px] font-bold">MMSE</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    defaultValue={findings.mmse ?? ""}
                    disabled={!canManage}
                    placeholder="0–30"
                    aria-label="MMSE total score"
                    className="h-9"
                    onBlur={(event) => onCommitScore("mmse", event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-ink mb-1.5 block text-[12.5px] font-bold">MoCA</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    defaultValue={findings.moca ?? ""}
                    disabled={!canManage}
                    placeholder="0–30"
                    aria-label="MoCA total score"
                    className="h-9"
                    onBlur={(event) => onCommitScore("moca", event.target.value)}
                  />
                </label>
              </div>
            )}
          </div>

          {section.noteLabel && (
            <NarrativeAssistNote
              label={section.noteLabel}
              name={`psych-mse-note-${section.id}`}
              value={findings[noteField]?.note ?? ""}
              onSave={(text) => onCommitNote(noteField, text)}
              fieldLabel={`${section.title} observation`}
              rows={section.id === "risk" || section.id === "substance" || section.id === "mood" ? 3 : 2}
              placeholder="Observation…"
              disabled={!canManage}
            />
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-card border border-hairline bg-surface p-6 text-center">
      <Brain aria-hidden="true" className="mx-auto mb-2 size-5 text-text-muted" />
      <p className="text-[12.5px] font-semibold text-ink">No mental status examination recorded</p>
      <p className="mt-0.5 text-[11.5px] text-ink-faint">
        Open the sections below to record the findings.
      </p>
    </div>
  );
}

export function MseTab({
  patientId,
  psych,
  canManage,
  timezone,
}: {
  patientId: string;
  psych: PatientPsychBundle;
  canManage: boolean;
  timezone: string;
}) {
  const mse = psych.mse;
  const [findings, setFindings] = useState<MseFindings>(() => readMseFindings(mse?.findings));
  const findingsRef = useRef(findings);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [summary, setSummary] = useState(mse?.ai_summary ?? "");
  const savedSummary = useRef(mse?.ai_summary ?? "");
  const [summaryBusy, setSummaryBusy] = useState<MseAssistKind | "save" | null>(null);

  const commit = useCallback(
    async (next: MseFindings): Promise<boolean> => {
      findingsRef.current = next;
      setFindings(next);
      setSaveState("saving");
      const result = await savePsychMseFindingsAction(patientId, { findings: next });
      setSaveState(result.ok ? "saved" : "error");
      return result.ok;
    },
    [patientId],
  );

  function toggleOptions(field: MseFieldKey, options: string[]) {
    if (!canManage) return;
    const previous = findingsRef.current;
    void commit({ ...previous, [field]: { ...(previous[field] ?? { options: [], note: "" }), options } });
  }

  function commitNote(field: MseFieldKey, text: string) {
    const previous = findingsRef.current;
    return commit({
      ...previous,
      [field]: { ...(previous[field] ?? { options: [], note: "" }), note: text },
    });
  }

  function commitAdditional(text: string) {
    const previous = findingsRef.current;
    const next = { ...previous };
    if (text.trim()) next.additional_notes = text.trim();
    else delete next.additional_notes;
    return commit(next);
  }

  function commitScore(key: "mmse" | "moca", value: string) {
    if (!canManage) return;
    const previous = findingsRef.current;
    const next = { ...previous };
    if (value.trim()) next[key] = value.trim();
    else delete next[key];
    void commit(next);
  }

  async function generateSummary() {
    if (!canManage || summaryBusy) return;
    setSummaryBusy("summary");
    const result = await assistPsychMseAction({ kind: "summary", findings });
    setSummaryBusy(null);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setSummary(result.data);
  }

  async function assistSummary(kind: Exclude<MseAssistKind, "summary">) {
    if (!canManage || summaryBusy) return;
    setSummaryBusy(kind);
    const result = await assistPsychMseAction({ kind, fieldLabel: "Clinical summary", text: summary });
    setSummaryBusy(null);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setSummary(result.data);
  }

  function handleDictateSummary(recognised: string) {
    const next = summary.trim() ? `${summary.trim()} ${recognised}` : recognised;
    setSummary(next);
  }

  async function approveSummary() {
    if (!canManage || summaryBusy) return;
    setSummaryBusy("save");
    const result = await savePsychMseSummaryAction(patientId, { summary });
    setSummaryBusy(null);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    savedSummary.current = summary.trim();
    toast.success("Clinical summary approved and saved.");
  }

  const overview = buildMseOverview(findings);
  const sentence = mseSummarySentence(findings);
  const approved = summary.trim() === savedSummary.current;
  const anyFindings = hasMseFindings(findings);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
            Mental Status Examination
          </h3>
          <p className="mt-0.5 text-[11px] text-ink-faint">
            Record the examination, then let the assistant draft the clinical summary.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <NoteStatus state={saveState} />
          {mse?.assessed_at && (
            <span className="text-[11px] text-ink-faint">
              Assessed{" "}
              {formatShortDate(utcIsoToClinicLocalInput(mse.assessed_at, timezone))}
              {mse.updated_by ? ` by ${mse.updated_by}` : ""}
            </span>
          )}
        </div>
      </div>

      {!canManage && !anyFindings && <EmptyState />}

      <div className="space-y-2.5">
        {MSE_SECTIONS.map((section) => (
          <MseSectionCard
            key={section.id}
            section={section}
            findings={findings}
            canManage={canManage}
            onToggle={toggleOptions}
            onCommitNote={commitNote}
            onCommitAdditional={commitAdditional}
            onCommitScore={commitScore}
          />
        ))}
      </div>

      {anyFindings && (
        <div className="rounded-card border border-hairline bg-surface p-4">
          <div className="mb-3 flex items-center gap-1.5">
            <Brain aria-hidden="true" className="size-3.5 text-primary" />
            <h4 className="text-[12.5px] font-bold text-ink">Mental Status Overview</h4>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {overview.map((row) => (
              <div key={row.label}>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                  {row.label}
                </dt>
                <dd className="text-[12.5px] font-semibold leading-snug text-text-primary">
                  {row.value}
                </dd>
              </div>
            ))}
            {overview.length === 0 && (
              <dd className="text-[11.5px] text-ink-faint">Nothing recorded yet.</dd>
            )}
          </div>
          {sentence && (
            <p className="mt-3 rounded-control border border-primary/20 bg-primary/5 px-3 py-2 text-[12.5px] italic leading-relaxed text-text-primary">
              {sentence}
            </p>
          )}
        </div>
      )}

      <div className="rounded-card border border-primary/25 bg-primary/5 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink">
            <Sparkles aria-hidden="true" className="size-3.5 text-primary" />
            Clinical summary
          </h4>
          {!approved && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-status-warning">
              <TriangleAlert aria-hidden="true" className="size-3" />
              Not yet approved — AI output is a draft
            </span>
          )}
          {approved && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
              <Check aria-hidden="true" className="size-3" />
              Approved &amp; saved
            </span>
          )}
        </div>

        <p className="mb-2 text-[11.5px] leading-relaxed text-ink-faint">
          {canManage
            ? "Generate it from the recorded findings, then edit, dictate or polish it before approving."
            : "The approved clinical summary below was recorded on the exam date."}
        </p>

        <AutoGrowTextarea
          value={summary}
          onChange={(event) => canManage && setSummary(event.target.value)}
          rows={5}
          disabled={!canManage}
          aria-label="Clinical summary"
          placeholder="Generate from findings, or write your own…"
          className="w-full resize-none rounded-control border border-primary/25 bg-surface p-2.5 text-[12.5px] leading-relaxed text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
        />

        {canManage && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-3 text-[12px]"
              disabled={summaryBusy !== null}
              onClick={() => void generateSummary()}
            >
              {summaryBusy === "summary" ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <Sparkles aria-hidden="true" className="size-3.5" />
              )}
              Generate from findings
            </Button>

            <VoiceInputButton onTranscript={handleDictateSummary} label="Voice to note" />

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-[12px] text-text-secondary hover:text-primary"
              disabled={summaryBusy !== null}
              onClick={() => void assistSummary("draft")}
            >
              {summaryBusy === "draft" ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <Wand2 aria-hidden="true" className="size-3.5" />
              )}
              AI draft
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-[12px] text-text-secondary hover:text-primary"
              disabled={summaryBusy !== null}
              onClick={() => void assistSummary("improve")}
            >
              {summaryBusy === "improve" ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <Wand2 aria-hidden="true" className="size-3.5" />
              )}
              Improve
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-[12px] text-text-secondary hover:text-primary"
              disabled={summaryBusy !== null}
              onClick={() => void assistSummary("summarize")}
            >
              {summaryBusy === "summarize" ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <AlignLeft aria-hidden="true" className="size-3.5" />
              )}
              Summarise
            </Button>

            <span className="mx-1 hidden h-5 w-px bg-hairline sm:block" />

            <Button
              type="button"
              variant="primary"
              size="sm"
              className="ml-auto h-8 gap-1.5 px-3 text-[12px]"
              disabled={summaryBusy !== null || !summary.trim() || approved}
              onClick={() => void approveSummary()}
            >
              {summaryBusy === "save" ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <Check aria-hidden="true" className="size-3.5" />
              )}
              Approve &amp; save
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}