/**
 * Psychology — Intake & History tab (`psy_intake`).
 *
 * The owning clinician surface for the intake history (0083, 0116). Refactored
 * from eleven stacked accordions into a two-column layout of four always-open
 * cards: the presenting problem column and the history column sit side by side
 * on desktop. The schema, hybrid chip storage, provenance pills, autosave
 * contracts and AI suggestion queue are unchanged.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BriefcaseMedical,
  ClipboardList,
  FileText,
  Loader2,
  Send,
  Stethoscope,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { NoteStatus } from "@/components/patients/record/workspaces/specialty-form";
import { NarrativeAssistNote } from "@/components/patients/record/workspaces/narrative-assist-note";
import { PsychIntakeSuggestionsCard } from "@/components/patients/record/workspaces/psych-intake-suggestions-card";
import { ChipNote, ChipPicker, useFieldSave, parseList } from "@/components/patients/record/workspaces/specialty-form";
import { SearchTagSelect } from "@/components/patients/record/workspaces/search-tag-select";
import { RecordSection } from "@/components/patients/record/record-primitives";
import { savePsychIntakeAction } from "@/lib/actions/specialty-workspaces";
import { sendPsychPreVisitLinkAction } from "@/lib/actions/patient-links";
import { readIntakeProvenance } from "@/lib/psych-intake";
import { PRE_VISIT_CREATED_BY } from "@/lib/patient-links-shared";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/utils/datetime";
import type { PatientPsychBundle } from "@/lib/patient-record";
import type { IntakeFieldKey, IntakeProvenanceEntry } from "@/types/database";

const THERAPY_HISTORY_OPTIONS = [
  "CBT",
  "DBT",
  "Family therapy",
  "Group therapy",
  "Counselling",
  "Psychodynamic",
  "EMDR",
  "Medication therapy",
] as const;

const DIAGNOSIS_OPTIONS = [
  "Depression",
  "Generalised anxiety",
  "Anxiety disorder",
  "Panic disorder",
  "Social anxiety",
  "PTSD",
  "OCD",
  "ADHD",
  "Bipolar disorder",
  "Substance use",
  "Eating disorder",
  "Psychosis",
] as const;

const FAMILY_HISTORY_OPTIONS = [
  "None known",
  "Depression",
  "Anxiety",
  "Bipolar disorder",
  "Substance use",
  "Suicide history",
  "Psychiatric illness",
] as const;

const CRISIS_OPTIONS = [
  "None known",
  "Past suicide attempt",
  "Past self-harm / NSSI",
  "Inpatient psychiatric admission",
  "Emergency crisis contact",
] as const;

const SLEEP_OPTIONS = [
  "Normal",
  "Initial insomnia",
  "Broken / restless sleep",
  "Early morning awakening",
  "Hypersomnia",
] as const;

const APPETITE_OPTIONS = [
  "Normal",
  "Reduced / low energy",
  "Increased / binge",
] as const;

const TRAUMA_OPTIONS = [
  "No trauma reported",
  "Childhood abuse / neglect",
  "PTSD / single event trauma",
  "Domestic violence",
  "Loss / bereavement",
] as const;

const STRESSOR_OPTIONS = [
  "Work",
  "Academic",
  "Financial",
  "Relationship",
  "Housing",
  "Health",
  "Family",
] as const;

const SEVERITY_OPTIONS = ["Mild", "Moderate", "Severe", "Very severe"] as const;

const SUBSTANCE_OPTIONS = ["None", "Alcohol", "Tobacco", "Drugs", "Other"] as const;

/**
 * Duration is stored as a plain string ("3 Months") in
 * `presenting_concern_duration`; the editor renders a number + unit pair.
 * Legacy free-text values that do not re-parse keep a plain text input.
 */
const DURATION_UNITS = ["Days", "Weeks", "Months", "Years"] as const;

function parseDuration(value?: string | null): {
  count: string;
  unit: string;
  parseable: boolean;
} {
  const raw = (value ?? "").trim();
  const match = raw.match(/^(\d+)\s*(day|week|month|year)s?$/i);
  if (match) {
    const unit =
      match[2].charAt(0).toUpperCase() +
      match[2].slice(1).toLowerCase().replace(/s$/, "");
    return { count: match[1], unit, parseable: true };
  }
  if (/^\d+$/.test(raw)) return { count: raw, unit: "Months", parseable: true };
  return { count: "", unit: "Months", parseable: raw.length === 0 };
}

/** Hybrid column storage: comma-joined chips on the first line, then a note. */
function splitHybrid(value?: string | null): { tokens: string[]; details: string } {
  const raw = value ?? "";
  const lines = raw.split("\n");
  const first = (lines[0] ?? "").trim();
  const tokens = first
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) return { tokens: [], details: raw.trim() };
  return { tokens, details: lines.slice(1).join("\n").trim() };
}

function joinHybrid(tokens: string[], details: string): string {
  const head = tokens
    .map((token) => token.trim())
    .filter(Boolean)
    .join(", ");
  const tail = details.trim();
  if (!head) return tail;
  return tail ? `${head}\n\n${tail}` : head;
}

const SOURCE_TEXTS: Record<IntakeProvenanceEntry["source"], string> = {
  patient: "Patient reported",
  ai: "AI extracted",
  clinician: "Clinician added",
};

/** Source + status pill for one field's provenance. */
function ProvenancePill({ entry }: { entry?: IntakeProvenanceEntry }) {
  if (!entry) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill border px-1.5 py-px text-[10px] font-medium leading-tight",
        entry.source === "patient"
          ? "border-status-info/30 bg-status-info/10 text-status-info"
          : entry.source === "ai"
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-hairline bg-app text-text-secondary",
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-pill",
          entry.source === "patient"
            ? "bg-status-info"
            : entry.source === "ai"
              ? "bg-primary"
              : "bg-text-muted",
        )}
      />
      {SOURCE_TEXTS[entry.source]}
      {entry.status === "updated" && (
        <span className="font-semibold text-status-warning">· Updated</span>
      )}
    </span>
  );
}

/**
 * An always-open bordered card — the input-surface that replaces the old
 * collapsible `IntakeSection`. Every card is visible at once, so reviewing and
 * editing intake costs zero clicks.
 */
function IntakePanel({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-card border border-hairline bg-surface p-4"
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-primary/10 text-primary">
          <Icon aria-hidden="true" className="size-3.5" />
        </span>
        <span className="text-[13px] font-bold text-ink">{title}</span>
      </div>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

function SectionLabel({
  text,
  badge,
}: {
  text: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
      <p className="text-ink text-[12.5px] font-bold">{text}</p>
      {badge}
    </div>
  );
}

/**
 * A combined chip + note field for one hybrid column: chips commit on
 * selection, the narrative note saves on blur. The blank value is unified
 * first (chips joined on line one, narrative on the lines after) — used for
 * family history, substance use, personal crisis and trauma (0116).
 */
function HybridChipsCard({
  chipsLabel,
  options,
  value,
  onSave,
  disabled,
  badge,
  detailsLabel,
  detailsFieldLabel,
  detailsPlaceholder,
  detailsRows = 3,
}: {
  chipsLabel: string;
  options: readonly string[];
  value?: string | null;
  onSave: (next: string) => Promise<boolean>;
  disabled: boolean;
  badge?: React.ReactNode;
  detailsLabel: string;
  detailsFieldLabel: string;
  detailsPlaceholder: string;
  detailsRows?: number;
}) {
  const [tokens, setTokens] = useState(() => splitHybrid(value).tokens);
  const detailsRef = useRef(splitHybrid(value).details);
  const emittedRef = useRef(value ?? "");

  useEffect(() => {
    if ((value ?? "") === emittedRef.current) return;
    const next = splitHybrid(value);
    setTokens(next.tokens);
    detailsRef.current = next.details;
    emittedRef.current = value ?? "";
  }, [value]);

  async function commit(next: string) {
    emittedRef.current = next;
    return onSave(next);
  }

  async function commitTokens(next: string[]) {
    setTokens(next);
    await commit(joinHybrid(next, detailsRef.current));
  }

  async function commitDetails(next: string) {
    detailsRef.current = next.trim();
    return commit(joinHybrid(tokens, next));
  }

  return (
    <div className="space-y-3">
      <div>
        <SectionLabel text={chipsLabel} />
        {disabled ? (
          tokens.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {tokens.map((token) => (
                <span
                  key={token}
                  className="rounded-pill border border-hairline bg-app px-2.5 py-1 text-[11.5px] font-medium leading-none text-text-primary"
                >
                  {token}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-[11.5px] text-ink-faint">Not recorded</span>
          )
        ) : (
          <ChipPicker
            options={options}
            value={tokens}
            onChange={(next) => void commitTokens(next)}
          />
        )}
      </div>
      <NarrativeAssistNote
        label={detailsLabel}
        name={`psych-intake-${detailsFieldLabel.toLowerCase().replace(/\W+/g, "-")}`}
        value={splitHybrid(value).details}
        onSave={commitDetails}
        fieldLabel={detailsFieldLabel}
        rows={detailsRows}
        placeholder={detailsPlaceholder}
        disabled={disabled}
        badge={badge}
      />
    </div>
  );
}

/** Single-select chip row that writes straight through (severity · 0116). */
function SingleSelectChips({
  options,
  value,
  onSave,
}: {
  options: readonly string[];
  value?: string | null;
  onSave: (next: string) => Promise<boolean>;
}) {
  const { run } = useFieldSave(onSave);
  const active = parseList(value)[0] ?? null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const isActive = active === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => run(isActive ? "" : option)}
            aria-pressed={isActive}
            className={cn(
              "rounded-pill border px-2.5 py-1 text-[11.5px] font-medium leading-none transition-colors",
              isActive
                ? "border-primary bg-primary/10 font-semibold text-primary"
                : "border-hairline bg-surface text-text-secondary hover:border-primary/40 hover:text-primary",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

/** Numeric duration: `[ 3 ] [ Months ▾ ]` — one string upsert per edit. */
function DurationField({
  value,
  onSave,
  disabled,
  badge,
}: {
  value?: string | null;
  onSave: (next: string) => Promise<boolean>;
  disabled: boolean;
  badge?: React.ReactNode;
}) {
  const initial = parseDuration(value);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const persisted = useRef(value ?? "");
  const [count, setCount] = useState(initial.count);
  const [unit, setUnit] = useState(initial.unit);
  const [legacy, setLegacy] = useState(
    initial.parseable ? "" : (value ?? "").trim(),
  );

  useEffect(() => {
    if ((value ?? "") === persisted.current) return;
    const next = parseDuration(value);
    persisted.current = value ?? "";
    setCount(next.count);
    setUnit(next.unit);
    setLegacy(next.parseable ? "" : (value ?? "").trim());
  }, [value]);

  async function commit(nextCount: string, nextUnit: string) {
    const formatted = nextCount.trim() ? `${nextCount.trim()} ${nextUnit}` : "";
    if (persisted.current === formatted) return;
    setState("saving");
    const ok = await onSave(formatted);
    if (ok) {
      persisted.current = formatted;
      setState("saved");
    } else {
      setState("error");
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-ink text-[12.5px] font-bold">Duration</p>
        <NoteStatus state={state} />
        {badge}
      </div>
      {legacy ? (
        <>
          <Input
            type="text"
            disabled={disabled}
            value={legacy}
            onChange={(event) => setLegacy(event.target.value)}
            onBlur={() => {
              persisted.current = legacy;
              void onSave(legacy.trim()).then((ok) =>
                setState(ok ? "saved" : "error"),
              );
            }}
            placeholder="e.g. about a year…"
          />
          <p className="mt-1 text-[11px] text-ink-faint">
            This entry was written as free text, so it stays editable as text.
          </p>
        </>
      ) : (
        <div className="flex gap-1.5">
          <Input
            type="number"
            min={0}
            disabled={disabled}
            value={count}
            onChange={(event) => setCount(event.target.value)}
            onBlur={() => void commit(count, unit)}
            placeholder="e.g. 3"
            className="w-20"
            aria-label="Duration count"
          />
          <NativeSelect
            value={unit}
            disabled={disabled}
            onChange={(event) => {
              setUnit(event.target.value);
              void commit(count, event.target.value);
            }}
            className="w-32"
            aria-label="Duration unit"
          >
            {DURATION_UNITS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
    </div>
  );
}

export function IntakeHistoryTab({
  patientId,
  psych,
  canManage,
  timezone,
  whatsappNumber,
}: {
  patientId: string;
  psych: PatientPsychBundle;
  canManage: boolean;
  timezone: string;
  whatsappNumber: string | null;
}) {
  const intake = psych.intake;
  const [sending, setSending] = useState(false);
  const provenance = readIntakeProvenance(intake?.field_provenance);
  const hasWhatsapp = (whatsappNumber ?? "").replace(/[^\d]/g, "").length > 0;

  const save =
    (field: IntakeFieldKey) =>
    (value: string) =>
      savePsychIntakeAction(patientId, { [field]: value.trim() ? value : null }).then((r) => r.ok);
  const onSave = (field: IntakeFieldKey) =>
    canManage ? save(field) : async () => true;

  const isPreVisit = intake?.updated_by === PRE_VISIT_CREATED_BY;
  const meta = intake?.updated_at
    ? `${isPreVisit ? "Imported from the pre-visit questionnaire" : `Entered by ${intake.updated_by}`} · ${formatShortDate(
        utcIsoToClinicLocalInput(intake.updated_at, timezone),
      )}`
    : null;

  const isEmpty = [
    intake?.presenting_concern,
    intake?.presenting_concern_duration,
    intake?.presenting_concern_severity,
    intake?.presenting_concern_words,
    intake?.sleep_quality,
    intake?.appetite_energy,
    intake?.personal_crisis_history,
    intake?.previous_therapy_history,
    intake?.previous_diagnosis,
    intake?.family_mental_health_history,
    intake?.trauma_history,
    intake?.psychosocial_background,
    intake?.stressors,
    intake?.substance_use_history,
    intake?.additional_clinical_notes,
  ].every((entry) => !entry?.trim());

  async function sendIntakeForm() {
    if (!canManage || sending || !hasWhatsapp) return;
    setSending(true);
    const result = await sendPsychPreVisitLinkAction(patientId);
    setSending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    const url = `${window.location.origin}${result.data.path}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard may be unavailable — the WhatsApp message still carries the link */
    }
    if (result.data.whatsappSent) {
      toast.success("Intake form sent on WhatsApp · copied to clipboard");
    } else {
      toast("Intake form link created · copied to clipboard", {
        description: "WhatsApp isn't connected for this clinic, so send it manually.",
      });
    }
  }

  return (
    <RecordSection title="Intake & Psychological History">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-2xl text-[12px] leading-relaxed text-text-muted">
            A clinician workspace, not the patient-facing form. Structured
            fields save as you select, narrative fields save on blur.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {meta && (
              <span className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-app px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                <ClipboardList aria-hidden="true" className="size-3 text-text-muted" />
                {meta}
              </span>
            )}
            {canManage && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-[12px]"
                onClick={() => void sendIntakeForm()}
                disabled={sending || !hasWhatsapp}
                title={
                  hasWhatsapp
                    ? "Send the patient intake form via WhatsApp"
                    : "Add a WhatsApp number to send the intake form"
                }
              >
                {sending ? (
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                ) : (
                  <Send aria-hidden="true" className="size-3.5" />
                )}
                Send intake form
              </Button>
            )}
          </div>
        </div>

        <PsychIntakeSuggestionsCard
          patientId={patientId}
          suggestions={psych.suggestions}
          canManage={canManage}
        />

        {isEmpty && (
          <div className="flex items-start gap-3 rounded-card border border-dashed border-primary/30 bg-primary/5 px-4 py-4">
            <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-text-primary">
                No intake history available yet.
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-text-secondary">
                Send patient intake form or add history during consultation.
              </p>
            </div>
            {canManage && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-[12px]"
                onClick={() => void sendIntakeForm()}
                disabled={sending || !hasWhatsapp}
              >
                {sending ? (
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                ) : (
                  <Send aria-hidden="true" className="size-3.5" />
                )}
                Send intake form
              </Button>
            )}
          </div>
        )}

        {/* Two-column clinical layout — every card always open (0116 UX). */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 xl:gap-5">
          {/* ------------------------------------------------------------ */}
          {/* Column 1 — presenting problem & axis                          */}
          {/* ------------------------------------------------------------ */}
          <div className="space-y-4">
            <IntakePanel icon={Stethoscope} title="Presenting problem & biological signs">
              <NarrativeAssistNote
                label="Main concern"
                name="psych-intake-presenting-concern"
                value={intake?.presenting_concern}
                onSave={onSave("presenting_concern")}
                fieldLabel="Presenting concern — the reason for coming"
                rows={2}
                placeholder="What brought the patient in…"
                disabled={!canManage}
                badge={<ProvenancePill entry={provenance.presenting_concern} />}
              />

              <DurationField
                value={intake?.presenting_concern_duration}
                onSave={onSave("presenting_concern_duration")}
                disabled={!canManage}
                badge={<ProvenancePill entry={provenance.presenting_concern_duration} />}
              />

              <div>
                <SectionLabel
                  text="Severity"
                  badge={
                    <ProvenancePill entry={provenance.presenting_concern_severity} />
                  }
                />
                {canManage ? (
                  <SingleSelectChips
                    options={SEVERITY_OPTIONS}
                    value={intake?.presenting_concern_severity}
                    onSave={onSave("presenting_concern_severity")}
                  />
                ) : intake?.presenting_concern_severity ? (
                  <span className="rounded-pill border border-hairline bg-app px-2.5 py-1 text-[11.5px] font-medium text-text-primary">
                    {intake.presenting_concern_severity}
                  </span>
                ) : (
                  <span className="text-[11.5px] text-ink-faint">Not recorded</span>
                )}
              </div>

              <div>
                <SectionLabel
                  text="Sleep — vegetative baseline"
                  badge={<ProvenancePill entry={provenance.sleep_quality} />}
                />
                <ChipNote
                  label=""
                  value={intake?.sleep_quality}
                  options={SLEEP_OPTIONS}
                  onSave={onSave("sleep_quality")}
                  disabled={!canManage}
                />
              </div>

              <div>
                <SectionLabel
                  text="Appetite & energy — vegetative baseline"
                  badge={<ProvenancePill entry={provenance.appetite_energy} />}
                />
                <ChipNote
                  label=""
                  value={intake?.appetite_energy}
                  options={APPETITE_OPTIONS}
                  onSave={onSave("appetite_energy")}
                  disabled={!canManage}
                />
              </div>

              <NarrativeAssistNote
                label="Patient's own words"
                name="psych-intake-presenting-words"
                value={intake?.presenting_concern_words}
                onSave={onSave("presenting_concern_words")}
                fieldLabel="The presenting concern in the patient's own words"
                rows={3}
                placeholder="How the patient describes it…"
                disabled={!canManage}
                badge={<ProvenancePill entry={provenance.presenting_concern_words} />}
              />
            </IntakePanel>

            <IntakePanel icon={TriangleAlert} title="Trauma & stress factors">
              <HybridChipsCard
                chipsLabel="Trauma & adverse events (ACEs)"
                options={TRAUMA_OPTIONS}
                value={intake?.trauma_history}
                onSave={onSave("trauma_history")}
                disabled={!canManage}
                badge={<ProvenancePill entry={provenance.trauma_history} />}
                detailsLabel="Trauma details"
                detailsFieldLabel="Trauma & adverse events — specific events, ages at exposure and ongoing impact"
                detailsPlaceholder="e.g. left the patient at 19, ongoing nightmares…"
                detailsRows={3}
              />
              <ChipNote
                label="Current stressors (day-to-day)"
                value={intake?.stressors}
                options={STRESSOR_OPTIONS}
                onSave={onSave("stressors")}
                disabled={!canManage}
                badge={<ProvenancePill entry={provenance.stressors} />}
                helper="Everyday pressures — acute or childhood events live in the trauma group above."
              />
            </IntakePanel>
          </div>

          {/* ------------------------------------------------------------ */}
          {/* Column 2 — psychiatric & psychosocial history                 */}
          {/* ------------------------------------------------------------ */}
          <div className="space-y-4">
            <IntakePanel icon={BriefcaseMedical} title="Psychiatric history & safety">
              <HybridChipsCard
                chipsLabel="Personal crisis history"
                options={CRISIS_OPTIONS}
                value={intake?.personal_crisis_history}
                onSave={onSave("personal_crisis_history")}
                disabled={!canManage}
                badge={<ProvenancePill entry={provenance.personal_crisis_history} />}
                detailsLabel="Crisis details"
                detailsFieldLabel="Personal psychiatric crisis history — when, where, what happened, treatment received"
                detailsPlaceholder="e.g. attempt in 2019, hospitalised three days…"
                detailsRows={3}
              />
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-ink text-[12.5px] font-bold">Previous diagnoses</p>
                  <ProvenancePill entry={provenance.previous_diagnosis} />
                </div>
                <SearchTagSelect
                  label=""
                  value={intake?.previous_diagnosis}
                  options={DIAGNOSIS_OPTIONS}
                  onSave={onSave("previous_diagnosis")}
                  placeholder="Search diagnoses or add your own…"
                  disabled={!canManage}
                  helper="Multiple diagnoses supported. Type to filter or add an unknown one directly."
                />
              </div>
              <ChipNote
                label="Previous therapies"
                value={intake?.previous_therapy_history}
                options={THERAPY_HISTORY_OPTIONS}
                onSave={onSave("previous_therapy_history")}
                disabled={!canManage}
                badge={<ProvenancePill entry={provenance.previous_therapy_history} />}
                helper="Select every approach the patient has tried — other approaches can be added directly."
              />
              <HybridChipsCard
                chipsLabel="Family mental health history"
                options={FAMILY_HISTORY_OPTIONS}
                value={intake?.family_mental_health_history}
                onSave={onSave("family_mental_health_history")}
                disabled={!canManage}
                badge={<ProvenancePill entry={provenance.family_mental_health_history} />}
                detailsLabel="Family details"
                detailsFieldLabel="Family mental health history — who had what, and how it relates to the patient"
                detailsPlaceholder="e.g. Mother had depression, treated from 2004…"
                detailsRows={3}
              />
            </IntakePanel>

            <IntakePanel icon={Users} title="Psychosocial & substance factors">
              <HybridChipsCard
                chipsLabel="Substances"
                options={SUBSTANCE_OPTIONS}
                value={intake?.substance_use_history}
                onSave={onSave("substance_use_history")}
                disabled={!canManage}
                badge={<ProvenancePill entry={provenance.substance_use_history} />}
                detailsLabel="Details"
                detailsFieldLabel="Substance use details (frequency, duration, last use, treatment)"
                detailsPlaceholder="Frequency, duration, last use, treatment history…"
                detailsRows={3}
              />
              <NarrativeAssistNote
                label="Social & psychosocial background"
                name="psych-intake-psychosocial_background"
                value={intake?.psychosocial_background}
                onSave={onSave("psychosocial_background")}
                fieldLabel="Social & psychosocial history (family, upbringing, education, occupation, relationships, social support, life events)"
                rows={5}
                placeholder="Family background, education, occupation, relationships, social support, important life events…"
                disabled={!canManage}
                badge={<ProvenancePill entry={provenance.psychosocial_background} />}
              />
              <NarrativeAssistNote
                label="Additional clinical notes"
                name="psych-intake-additional-notes"
                value={intake?.additional_clinical_notes}
                onSave={onSave("additional_clinical_notes")}
                fieldLabel="Additional clinical notes for the intake history"
                rows={4}
                placeholder="Anything else relevant to the history…"
                disabled={!canManage}
                badge={<ProvenancePill entry={provenance.additional_clinical_notes} />}
              />
            </IntakePanel>
          </div>
        </div>
      </div>
    </RecordSection>
  );
}
