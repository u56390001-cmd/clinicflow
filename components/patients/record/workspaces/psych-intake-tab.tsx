"use client";

import { useRef, useState } from "react";
import {
  Activity,
  FileText,
  MessageCircle,
  Pill,
  Sparkles,
  Stethoscope,
  Users,
  type LucideIcon,
} from "lucide-react";

import { NarrativeAssistNote } from "@/components/patients/record/workspaces/narrative-assist-note";
import { PsychIntakeSuggestionsCard } from "@/components/patients/record/workspaces/psych-intake-suggestions-card";
import { ChipNote, ChipPicker } from "@/components/patients/record/workspaces/specialty-form";
import { SearchTagSelect } from "@/components/patients/record/workspaces/search-tag-select";
import { RecordSection } from "@/components/patients/record/record-primitives";
import { savePsychIntakeAction } from "@/lib/actions/specialty-workspaces";
import { PRE_VISIT_CREATED_BY } from "@/lib/patient-links-shared";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/utils/datetime";
import type { PatientPsychBundle } from "@/lib/patient-record";

type IntakeField =
  | "previous_therapy_history"
  | "previous_diagnosis"
  | "family_mental_health_history"
  | "psychosocial_background"
  | "stressors"
  | "substance_use_history";

const THERAPY_HISTORY_OPTIONS = [
  "None",
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

const SUBSTANCE_OPTIONS = ["None", "Alcohol", "Tobacco", "Drugs", "Other"] as const;

function splitSubstance(value?: string | null): { types: string[]; details: string } {
  const raw = value ?? "";
  const lines = raw.split("\n");
  const first = (lines[0] ?? "").trim();
  const tokens = first
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  const allKnown =
    tokens.length > 0 &&
    tokens.every((token) =>
      (SUBSTANCE_OPTIONS as readonly string[]).includes(token),
    );
  if (allKnown) {
    return { types: tokens, details: lines.slice(1).join("\n").trim() };
  }
  return { types: [], details: raw.trim() };
}

function joinSubstance(types: string[], details: string): string {
  const head = types.join(", ");
  const tail = details.trim();
  if (!head) return tail;
  return tail ? `${head}\n${tail}` : head;
}

function SourcePill({ source }: { source: string | null }) {
  if (!source) return null;
  const isPreVisit = source === PRE_VISIT_CREATED_BY;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill border px-1.5 py-px text-[10px] font-medium leading-tight",
        isPreVisit
          ? "border-status-info/30 bg-status-info/10 text-status-info"
          : "border-hairline bg-app text-text-muted",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-pill",
          isPreVisit ? "bg-status-info" : "bg-text-muted",
        )}
      />
      {isPreVisit ? "Pre-visit form" : "Clinician"}
    </span>
  );
}

function HistoryCard({
  icon: Icon,
  title,
  source,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  source?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-hairline bg-surface p-4",
        className,
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink">
          <Icon aria-hidden="true" className="size-3.5 text-primary" />
          {title}
        </h4>
        <SourcePill source={source ?? null} />
      </div>
      {children}
    </div>
  );
}

function SubstanceUseCard({
  value,
  onSave,
  source,
  disabled,
}: {
  value?: string | null;
  onSave: (next: string) => Promise<boolean>;
  source: string | null;
  disabled: boolean;
}) {
  const initial = splitSubstance(value);
  const [types, setTypes] = useState<string[]>(initial.types);
  const detailsRef = useRef(initial.details);

  async function commitTypes(next: string[]) {
    setTypes(next);
    await onSave(joinSubstance(next, detailsRef.current));
  }

  async function commitDetails(next: string) {
    detailsRef.current = next.trim();
    return onSave(joinSubstance(types, next));
  }

  return (
    <HistoryCard icon={Pill} title="Substance use history" source={source}>
      <div className="space-y-3">
        <ChipPicker
          options={SUBSTANCE_OPTIONS}
          value={types}
          onChange={(next) => void commitTypes(next)}
          label="Substances"
        />
        <NarrativeAssistNote
          label="Details"
          name="psych-intake-substance-details"
          value={initial.details}
          onSave={commitDetails}
          fieldLabel="Substance use details (frequency, duration, last use, treatment)"
          rows={3}
          placeholder="Frequency, duration, last use, treatment history…"
          disabled={disabled}
        />
      </div>
    </HistoryCard>
  );
}

export function IntakeHistoryTab({
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
  const intake = psych.intake;

  const save =
    (field: IntakeField) =>
    (value: string) =>
      savePsychIntakeAction(patientId, { [field]: value }).then((r) => r.ok);
  const onSave = (field: IntakeField) =>
    canManage ? save(field) : async () => true;

  const source = intake?.updated_by
    ? intake.updated_by
    : null;

  const fields: Array<string | null | undefined> = [
    intake?.previous_therapy_history,
    intake?.previous_diagnosis,
    intake?.family_mental_health_history,
    intake?.psychosocial_background,
    intake?.stressors,
    intake?.substance_use_history,
  ];
  const isEmpty = fields.every((entry) => !entry?.trim());

  const provenance = intake?.updated_at
    ? `${source === PRE_VISIT_CREATED_BY ? "Imported from the pre-visit questionnaire" : `Entered by ${source}`} · ${formatShortDate(
        utcIsoToClinicLocalInput(intake.updated_at, timezone),
      )}`
    : null;

  return (
    <RecordSection title="Intake & Psychological History">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-2xl text-[12px] leading-relaxed text-text-muted">
            Collect the patient&apos;s background here. Structured fields save as
            you select; narrative fields save on blur and support voice dictation
            and AI drafting.
          </p>
          {provenance && (
            <span className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-app px-2.5 py-1 text-[11px] font-medium text-text-secondary">
              <FileText aria-hidden="true" className="size-3 text-text-muted" />
              {provenance}
            </span>
          )}
        </div>

        {isEmpty && (
          <div className="flex items-start gap-3 rounded-card border border-dashed border-primary/30 bg-primary/5 px-4 py-3">
            <Sparkles
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-primary"
            />
            <div>
              <p className="text-[12.5px] font-semibold text-text-primary">
                No history information yet
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-text-secondary">
                Record the background below, or complete the patient intake /
                upload previous records so the details carry into future visits.
              </p>
            </div>
          </div>
        )}

        <PsychIntakeSuggestionsCard
          patientId={patientId}
          suggestions={psych.suggestions}
          canManage={canManage}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <HistoryCard
            icon={MessageCircle}
            title="Previous therapy history"
            source={source}
          >
            <ChipNote
              label="Approaches"
              value={intake?.previous_therapy_history}
              options={THERAPY_HISTORY_OPTIONS}
              onSave={onSave("previous_therapy_history")}
              disabled={!canManage}
              helper="Select every approach the patient has tried, or add one."
            />
          </HistoryCard>

          <HistoryCard icon={Stethoscope} title="Previous diagnosis" source={source}>
            <SearchTagSelect
              label="Diagnoses"
              value={intake?.previous_diagnosis}
              options={DIAGNOSIS_OPTIONS}
              onSave={onSave("previous_diagnosis")}
              placeholder="Search diagnoses or add your own…"
              disabled={!canManage}
              helper="Type to filter. Unknown diagnoses can be added directly."
            />
          </HistoryCard>

          <HistoryCard
            icon={Users}
            title="Family mental health history"
            source={source}
          >
            <ChipNote
              label="Known history"
              value={intake?.family_mental_health_history}
              options={FAMILY_HISTORY_OPTIONS}
              onSave={onSave("family_mental_health_history")}
              disabled={!canManage}
              helper="Select relatives' conditions, or add a note."
            />
          </HistoryCard>

          <HistoryCard icon={Activity} title="Stressors" source={source}>
            <ChipNote
              label="Current stressors"
              value={intake?.stressors}
              options={STRESSOR_OPTIONS}
              onSave={onSave("stressors")}
              disabled={!canManage}
              helper="Select the stressors the patient is currently facing."
            />
          </HistoryCard>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <HistoryCard
            icon={FileText}
            title="Psychosocial background"
            source={source}
          >
            <NarrativeAssistNote
              label="Narrative"
              name="psych-intake-psychosocial_background"
              value={intake?.psychosocial_background}
              onSave={onSave("psychosocial_background")}
              fieldLabel="Psychosocial background (family, upbringing, education, occupation, relationships, social support, life events)"
              rows={5}
              placeholder="Family background, education, occupation, relationships, social support, important life events…"
              disabled={!canManage}
            />
          </HistoryCard>

          <SubstanceUseCard
            value={intake?.substance_use_history}
            onSave={onSave("substance_use_history")}
            source={source}
            disabled={!canManage}
          />
        </div>
      </div>
    </RecordSection>
  );
}
