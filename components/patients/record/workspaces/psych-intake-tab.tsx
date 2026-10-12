"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  BriefcaseMedical,
  ChevronDown,
  ClipboardList,
  FileText,
  Loader2,
  MessageCircle,
  Pill,
  Send,
  Stethoscope,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { NarrativeAssistNote } from "@/components/patients/record/workspaces/narrative-assist-note";
import { PsychIntakeSuggestionsCard } from "@/components/patients/record/workspaces/psych-intake-suggestions-card";
import { ChipNote, ChipPicker } from "@/components/patients/record/workspaces/specialty-form";
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

const STRESSOR_OPTIONS = [
  "Work",
  "Academic",
  "Family",
  "Relationship",
  "Financial",
  "Health",
  "Trauma",
  "Housing",
  "Isolation",
] as const;

const SEVERITY_OPTIONS = ["Mild", "Moderate", "Severe", "Very severe"] as const;

const SUBSTANCE_OPTIONS = ["None", "Alcohol", "Tobacco", "Drugs", "Other"] as const;

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

/** Accordion card, same interaction as the MSE sections. */
function IntakeSection({
  icon: Icon,
  title,
  badge,
  defaultOpen,
  children,
}: {
  icon: LucideIcon;
  title: string;
  badge?: React.ReactNode;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
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
        <span className="min-w-0 flex-1 text-[13px] font-bold text-ink">{title}</span>
        {badge}
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 shrink-0 text-text-muted transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="space-y-3.5 border-t border-hairline px-4 pb-4 pt-3">{children}</div>
      )}
    </div>
  );
}

function SubstanceUseCard({
  value,
  onSave,
  badge,
  disabled,
}: {
  value?: string | null;
  onSave: (next: string) => Promise<boolean>;
  badge?: React.ReactNode;
  disabled: boolean;
}) {
  const [types, setTypes] = useState(() => splitHybrid(value).tokens);
  const detailsRef = useRef(splitHybrid(value).details);
  const emittedRef = useRef(value ?? "");

  useEffect(() => {
    if ((value ?? "") === emittedRef.current) return;
    const next = splitHybrid(value);
    setTypes(next.tokens);
    detailsRef.current = next.details;
    emittedRef.current = value ?? "";
  }, [value]);

  async function commit(next: string) {
    emittedRef.current = next;
    return onSave(next);
  }

  async function commitTypes(next: string[]) {
    setTypes(next);
    await commit(joinHybrid(next, detailsRef.current));
  }

  async function commitDetails(next: string) {
    detailsRef.current = next.trim();
    return commit(joinHybrid(types, next));
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-ink mb-1.5 text-[12.5px] font-bold">Substances</p>
        {disabled ? (
          types.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {types.map((token) => (
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
            options={SUBSTANCE_OPTIONS}
            value={types}
            onChange={(next) => void commitTypes(next)}
          />
        )}
      </div>
      <NarrativeAssistNote
        label="Details"
        name="psych-intake-substance-details"
        value={splitHybrid(value).details}
        onSave={commitDetails}
        fieldLabel="Substance use details (frequency, duration, last use, treatment)"
        rows={3}
        placeholder="Frequency, duration, last use, treatment history…"
        disabled={disabled}
        badge={badge}
      />
    </div>
  );
}

function FamilyHistoryCard({
  value,
  onSave,
  disabled,
}: {
  value?: string | null;
  onSave: (next: string) => Promise<boolean>;
  disabled: boolean;
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

  async function commitDetails(next: string) {
    detailsRef.current = next.trim();
    return commit(joinHybrid(tokens, next));
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-ink mb-1.5 text-[12.5px] font-bold">Known history</p>
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
            options={FAMILY_HISTORY_OPTIONS}
            value={tokens}
            onChange={(next) => {
              setTokens(next);
              void commit(joinHybrid(next, detailsRef.current));
            }}
          />
        )}
      </div>
      <NarrativeAssistNote
        label="Relationship / details"
        name="psych-intake-family-details"
        value={splitHybrid(value).details}
        onSave={commitDetails}
        fieldLabel="Family mental health history — who had what, and how it relates to the patient"
        rows={3}
        placeholder="e.g. Mother had depression, treated from 2004…"
        disabled={disabled}
      />
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
    intake?.previous_therapy_history,
    intake?.previous_diagnosis,
    intake?.family_mental_health_history,
    intake?.psychosocial_background,
    intake?.stressors,
    intake?.substance_use_history,
    intake?.additional_clinical_notes,
  ].every((entry) => !entry?.trim());

  const severity = intake?.presenting_concern_severity;

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
            A clinician workspace, not the patient-facing form. Review the AI
            extracted history first, then fill the sections below — structured
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
        )}

        <div className="space-y-2.5">
          <IntakeSection
            icon={Stethoscope}
            title="Presenting concern"
            defaultOpen
          >
            <div className="space-y-3.5">
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
              <NarrativeAssistNote
                label="Duration"
                name="psych-intake-presenting-duration"
                value={intake?.presenting_concern_duration}
                onSave={onSave("presenting_concern_duration")}
                fieldLabel="How long the presenting concern has been present"
                rows={2}
                placeholder="e.g. 3 months…"
                disabled={!canManage}
                badge={<ProvenancePill entry={provenance.presenting_concern_duration} />}
              />
              <div>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-ink text-[12.5px] font-bold">Severity</p>
                  <ProvenancePill entry={provenance.presenting_concern_severity} />
                </div>
                {canManage ? (
                  <ChipPicker
                    options={SEVERITY_OPTIONS}
                    value={severity ? [severity] : []}
                    onChange={(next) => void onSave("presenting_concern_severity")(next[0] ?? "")}
                    single
                  />
                ) : severity ? (
                  <span className="rounded-pill border border-hairline bg-app px-2.5 py-1 text-[11.5px] font-medium text-text-primary">
                    {severity}
                  </span>
                ) : (
                  <span className="text-[11.5px] text-ink-faint">Not recorded</span>
                )}
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
            </div>
          </IntakeSection>

          <IntakeSection
            icon={MessageCircle}
            title="Previous therapy history"
            badge={<ProvenancePill entry={provenance.previous_therapy_history} />}
            defaultOpen={Boolean(intake?.previous_therapy_history?.trim())}
          >
            <ChipNote
              label="Approaches"
              value={intake?.previous_therapy_history}
              options={THERAPY_HISTORY_OPTIONS}
              onSave={onSave("previous_therapy_history")}
              disabled={!canManage}
              helper="Select every approach the patient has tried — other approaches can be added directly."
            />
          </IntakeSection>

          <IntakeSection
            icon={BriefcaseMedical}
            title="Previous diagnosis"
            badge={<ProvenancePill entry={provenance.previous_diagnosis} />}
            defaultOpen={Boolean(intake?.previous_diagnosis?.trim())}
          >
            <SearchTagSelect
              label="Diagnoses"
              value={intake?.previous_diagnosis}
              options={DIAGNOSIS_OPTIONS}
              onSave={onSave("previous_diagnosis")}
              placeholder="Search diagnoses or add your own…"
              disabled={!canManage}
              helper="Multiple diagnoses supported. Type to filter or add an unknown one directly."
            />
          </IntakeSection>

          <IntakeSection
            icon={Users}
            title="Family mental health history"
            badge={<ProvenancePill entry={provenance.family_mental_health_history} />}
            defaultOpen={Boolean(intake?.family_mental_health_history?.trim())}
          >
            <FamilyHistoryCard
              value={intake?.family_mental_health_history}
              onSave={onSave("family_mental_health_history")}
              disabled={!canManage}
            />
          </IntakeSection>

          <IntakeSection
            icon={Activity}
            title="Social & psychosocial history"
            badge={<ProvenancePill entry={provenance.psychosocial_background} />}
            defaultOpen={Boolean(intake?.psychosocial_background?.trim())}
          >
            <NarrativeAssistNote
              label="Narrative"
              name="psych-intake-psychosocial_background"
              value={intake?.psychosocial_background}
              onSave={onSave("psychosocial_background")}
              fieldLabel="Social & psychosocial history (family, upbringing, education, occupation, relationships, social support, life events)"
              rows={5}
              placeholder="Family background, education, occupation, relationships, social support, important life events…"
              disabled={!canManage}
            />
          </IntakeSection>

          <IntakeSection
            icon={Activity}
            title="Current stressors"
            badge={<ProvenancePill entry={provenance.stressors} />}
            defaultOpen={Boolean(intake?.stressors?.trim())}
          >
            <ChipNote
              label="Current stressors"
              value={intake?.stressors}
              options={STRESSOR_OPTIONS}
              onSave={onSave("stressors")}
              disabled={!canManage}
              helper="Select the stressors the patient is currently facing, or add one."
            />
          </IntakeSection>

          <IntakeSection
            icon={Pill}
            title="Substance use history"
            badge={<ProvenancePill entry={provenance.substance_use_history} />}
            defaultOpen={Boolean(intake?.substance_use_history?.trim())}
          >
            <SubstanceUseCard
              value={intake?.substance_use_history}
              onSave={onSave("substance_use_history")}
              disabled={!canManage}
            />
          </IntakeSection>

          <IntakeSection
            icon={ClipboardList}
            title="Additional clinical notes"
            badge={<ProvenancePill entry={provenance.additional_clinical_notes} />}
            defaultOpen={Boolean(intake?.additional_clinical_notes?.trim())}
          >
            <NarrativeAssistNote
              label="Notes"
              name="psych-intake-additional-notes"
              value={intake?.additional_clinical_notes}
              onSave={onSave("additional_clinical_notes")}
              fieldLabel="Additional clinical notes for the intake history"
              rows={4}
              placeholder="Anything else relevant to the history…"
              disabled={!canManage}
            />
          </IntakeSection>
        </div>
      </div>
    </RecordSection>
  );
}