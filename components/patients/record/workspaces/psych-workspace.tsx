/**
 * Psychology workspace — the Clinical Psychologist's patient record tabs
 * (migration 0077). Replaces the general record's tab group for doctors whose
 * specialty resolves to `psychology`.
 *
 * Layout mirrors the reference: read-only snapshot tiles by default, autosave
 * notes on Edit (same pattern as Past History), and committed rows for session
 * notes and psychometrics — each inserts a distinct record, so they get save
 * buttons and a history list rather than per-field blur saves.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Activity,
  Brain,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  FileText,
  History,
  Loader2,
  Rocket,
  ShieldAlert,
  Stethoscope,
  Target,
  Trash2,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import { AutosaveNote, ChipNote, SelectNote, SpecialtyHeading, parseList } from "@/components/patients/record/workspaces/specialty-form";
import { PatientLinksPanel } from "@/components/patients/record/workspaces/patient-links-panel";
import { AiSummaryCard } from "@/components/patients/record/ai-summary-card";
import { DocumentsTab } from "@/components/patients/record/documents-tab";
import { RecordEmpty, RecordFact, RecordNote, RecordSection } from "@/components/patients/record/record-primitives";
import { CopilotDrawer } from "@/components/consultation/copilot-drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  deletePsychAssessmentAction,
  deletePsychSessionAction,
  savePsychAssessmentAction,
  savePsychCarePlanAction,
  savePsychIntakeAction,
  savePsychMseAction,
  savePsychSessionAction,
} from "@/lib/actions/specialty-workspaces";
import type { PsychNoteExtraction, WorkspaceExtraction } from "@/lib/copilot/types";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/utils/datetime";
import type { PatientPsychBundle } from "@/lib/patient-record";
import type { PatientDocumentView } from "@/lib/patient-documents-queries";
import { PSYCHOMETRIC_INSTRUMENTS, isPsychometricKey } from "@/lib/psychometrics";
import { hasPsychSummaryContent } from "@/lib/psych-summary";
import { PSYCHOLOGY_WORKSPACE, type PsychTabId } from "@/lib/specialty-workspaces";
import type {
  PatientDirectoryRow,
  PsychAssessment,
  PsychCarePlan,
  PsychSession,
} from "@/types/database";

type Props = {
  patient: PatientDirectoryRow;
  psych: PatientPsychBundle;
  documents: PatientDocumentView[];
  activeTab: PsychTabId;
  canManage: boolean;
  timezone: string;
  aiSummaryEnabled: boolean;
  /** `?tab=psy_psychometrics` — the Overview's "View history" target. */
  assessmentsHref: string;
  /** `?tab=psy_documents` — the Overview's "View" documents target. */
  documentsHref: string;
};

/** A session note a copilot extraction produced, waiting for the Sessions tab. */
type PsychDraft = {
  format: "BIRP" | "DAP";
  fields: Record<string, string>;
};

export function PsychWorkspace({ patient, psych, documents, activeTab, canManage, timezone, aiSummaryEnabled, assessmentsHref, documentsHref }: Props) {
  const [seed, setSeed] = useState<PsychDraft | null>(null);

  /**
   * One AI surface for the whole workspace: the existing psychology
   * CopilotDrawer, mounted once and visible on every tab — no second copilot,
   * no new route. Its extraction is a session note, so it seeds the Session
   * Notes form. The draft is held here and handed to that tab when it mounts,
   * so a note captured on the MSE tab still lands when the psychologist
   * switches over.
   */
  const handleCopilotPopulate = useCallback((data: WorkspaceExtraction) => {
    const note = data as PsychNoteExtraction;
    const fields: Record<string, string> = {};
    if (note.behavior) fields.behavior = note.behavior;
    if (note.intervention) fields.intervention = note.intervention;
    if (note.response) fields.response = note.response;
    if (note.observation_data) fields.observation_data = note.observation_data;
    if (note.assessment) fields.assessment = note.assessment;
    if (note.plan) fields.plan = note.plan;
    if (Object.keys(fields).length === 0) return;
    setSeed({ format: note.format === "DAP" ? "DAP" : "BIRP", fields });
  }, []);

  return (
    <div className="tab-fade-in">
      <div className={cn("flex flex-col gap-4", canManage && "xl:flex-row xl:items-start")}>
        <div className="min-w-0 flex-1 space-y-4">
          {activeTab === "psy_overview" && (
            <OverviewSafetyTab
              patient={patient}
              psych={psych}
              documents={documents}
              canManage={canManage}
              timezone={timezone}
              aiSummaryEnabled={aiSummaryEnabled}
              assessmentsHref={assessmentsHref}
              documentsHref={documentsHref}
            />
          )}
          {activeTab === "psy_intake" && <IntakeTab patientId={patient.id} psych={psych} canManage={canManage} />}
          {activeTab === "psy_mse" && <MseTab patientId={patient.id} psych={psych} canManage={canManage} />}
          {activeTab === "psy_sessions" && (
            <SessionsTab
              patient={patient}
              psych={psych}
              canManage={canManage}
              seed={seed}
              onSeedApplied={() => setSeed(null)}
            />
          )}
          {activeTab === "psy_psychometrics" && (
            <PsychometricsTab
              patientId={patient.id}
              psych={psych}
              canManage={canManage}
              whatsappNumber={patient.whatsapp_number}
            />
          )}
          {activeTab === "psy_documents" && (
            <DocumentsTab
              patientId={patient.id}
              documents={documents}
              timezone={timezone}
              canManage={canManage}
            />
          )}
          {activeTab === "psy_care_plan" && <CarePlanTab patientId={patient.id} psych={psych} canManage={canManage} />}
        </div>
        {canManage && (
          <CopilotDrawer
            mode="psychology"
            contextLabel={`${PSYCHOLOGY_WORKSPACE.name} Copilot`}
            workspaceContext={PSYCHOLOGY_WORKSPACE.copilotContext}
            patientProfile={{
              allergies: patient.known_allergies || undefined,
              current_meds: patient.current_medications || undefined,
            }}
            onPopulateForm={handleCopilotPopulate}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Overview & Safety                                                         */
/* ------------------------------------------------------------------------- */

type RiskLevel = "low" | "moderate" | "high" | "crisis";

/** One escalating risk scale, shared by the snapshot hero and the timeline. */
const RISK_TONE: Record<
  RiskLevel,
  { label: string; panel: string; text: string; dot: string }
> = {
  low: {
    label: "Low risk",
    panel: "border-status-success/25 bg-status-success/5",
    text: "text-status-success",
    dot: "bg-status-success",
  },
  moderate: {
    label: "Moderate risk",
    panel: "border-status-warning/30 bg-status-warning/5",
    text: "text-status-warning",
    dot: "bg-status-warning",
  },
  high: {
    label: "High risk",
    panel: "border-orange-300 bg-orange-50",
    text: "text-orange-700",
    dot: "bg-orange-500",
  },
  crisis: {
    label: "Crisis risk",
    panel: "border-status-destructive/30 bg-status-destructive/5",
    text: "text-status-destructive",
    dot: "bg-status-destructive",
  },
};

/**
 * The Overview is a read-only clinical dashboard. Every value it shows was
 * captured by the workflow that owns it — pre-visit intake, psychometric links,
 * uploaded documents, session notes or the care plan — so nothing here is typed
 * by hand and the card is always a faithful window onto another tab.
 */
function OverviewCard({
  icon: Icon,
  title,
  action,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-card border border-hairline bg-surface p-4",
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        {action ? <div className="ml-auto flex items-center gap-1">{action}</div> : null}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

/** A read-only token (concern, risk factor) — the display counterpart of ChipNote. */
function ReadPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-pill border border-hairline bg-app px-2.5 py-1 text-[11.5px] font-medium leading-none text-text-secondary">
      {children}
    </span>
  );
}

/**
 * A read-only pill list with an empty state and an optional "+N more" toggle.
 * `maxVisible` of 0 (the default) shows everything.
 */
function PillList({
  tokens,
  emptyText,
  maxVisible = 0,
}: {
  tokens: string[];
  emptyText: string;
  maxVisible?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (tokens.length === 0) {
    return <p className="text-[12.5px] italic text-ink-faint">{emptyText}</p>;
  }

  const visible = maxVisible && !expanded ? tokens.slice(0, maxVisible) : tokens;
  const remaining = tokens.length - visible.length;

  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((token) => (
        <ReadPill key={token}>{token}</ReadPill>
      ))}
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-pill border border-dashed border-hairline bg-surface px-2.5 py-1 text-[11.5px] font-medium leading-none text-text-muted transition-colors hover:border-primary/40 hover:text-primary"
        >
          +{remaining} more
        </button>
      )}
    </div>
  );
}

/** Values that mean "asked, nothing found" and should not render as a pill. */
const EMPTY_TOKENS = new Set(["none", "none known", "none identified", "nil", "n/a"]);

/** Merge one or more comma-lists into a de-duplicated pill list. */
function mergeTags(...values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    for (const token of parseList(value)) {
      const key = token.toLowerCase();
      if (EMPTY_TOKENS.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(token);
    }
  }
  return out;
}

/** Who entered a psychometric result (0080). */
const COMPLETED_BY_LABEL: Record<PsychAssessment["completed_by"], string> = {
  patient_online: "Patient online",
  reception: "Reception desk",
  psychologist: "Psychologist",
};

/** A quiet tag for how a result arrived — a patient link stands out. */
function CompletedByBadge({ value }: { value: PsychAssessment["completed_by"] }) {
  return (
    <Badge
      className={
        value === "patient_online"
          ? "bg-primary/10 text-primary"
          : "bg-app text-text-secondary"
      }
    >
      {COMPLETED_BY_LABEL[value]}
    </Badge>
  );
}

/** How a document arrived — a patient link, the desk, or a clinician. */
const DOC_SOURCE_LABEL: Record<string, string> = {
  patient_online: "Patient online",
  reception: "Reception",
  staff: "Clinic",
};

/**
 * Selection menus for the structured fields (0079). They lead with the answers
 * a clinician reaches for most, and every row keeps an "Other…" escape hatch so
 * an atypical presentation is recorded in the patient's own words instead of
 * being forced into the nearest menu item.
 */
const THERAPY_HISTORY_OPTIONS = [
  "None",
  "CBT",
  "DBT",
  "Family therapy",
  "Group therapy",
  "Counselling",
  "Psychodynamic",
  "Medication",
] as const;

const DIAGNOSIS_OPTIONS = [
  "Depression",
  "Generalised anxiety",
  "Panic disorder",
  "Social anxiety",
  "PTSD",
  "OCD",
  "Bipolar disorder",
  "ADHD",
  "Substance use",
  "Eating disorder",
  "Psychosis",
  "None",
] as const;

const FAMILY_HISTORY_OPTIONS = [
  "None known",
  "Depression",
  "Anxiety",
  "Bipolar",
  "Schizophrenia / psychosis",
  "Substance use",
  "Suicide history",
] as const;

const STRESSOR_OPTIONS = [
  "Work",
  "Academic",
  "Family",
  "Relationship",
  "Financial",
  "Health",
  "Grief",
  "Trauma",
  "Legal",
  "Housing",
  "Isolation",
] as const;

const INTERVENTION_OPTIONS = [
  "CBT",
  "DBT",
  "Psychoeducation",
  "Relaxation training",
  "Exposure",
  "Behavioural activation",
  "Motivational interviewing",
  "Family therapy",
  "Medication review",
  "Crisis planning",
] as const;

const HOMEWORK_OPTIONS = [
  "Mood diary",
  "Thought record",
  "Breathing exercises",
  "Behavioural activation tasks",
  "Sleep hygiene",
  "Exposure tasks",
  "Reading / psychoeducation",
  "None",
] as const;

const FOLLOW_UP_OPTIONS = [
  "Weekly",
  "Fortnightly",
  "Monthly",
  "Every 3 months",
  "PRN",
  "Discharged",
] as const;

const SESSION_TYPE_META: Record<
  "initial" | "individual" | "follow_up" | "crisis" | "group",
  string
> = {
  initial: "Initial assessment",
  individual: "Individual therapy",
  follow_up: "Follow-up",
  crisis: "Crisis",
  group: "Group",
};

function OverviewSafetyTab({
  patient,
  psych,
  documents,
  canManage,
  timezone,
  aiSummaryEnabled,
  assessmentsHref,
  documentsHref,
}: {
  patient: PatientDirectoryRow;
  psych: PatientPsychBundle;
  documents: PatientDocumentView[];
  canManage: boolean;
  timezone: string;
  aiSummaryEnabled: boolean;
  assessmentsHref: string;
  documentsHref: string;
}) {
  const safety = buildSafetySnapshot(psych, timezone);
  const concerns = mergeTags(
    psych.safety?.current_concerns,
    psych.intake?.stressors,
  );

  return (
    <div className="space-y-4">
      <AiSummaryCard
        patientId={patient.id}
        summary={patient.ai_summary}
        generatedAt={patient.ai_summary_generated_at}
        generatedFromVisitCount={patient.ai_summary_visit_count}
        visitCount={patient.visit_count}
        hasClinicalData={hasPsychSummaryContent(psych)}
        emptyCopy="No clinical information available yet. Complete intake, upload documents, or record an assessment to generate insights."
        refreshLabel
        timezone={timezone}
        canManage={canManage}
        enabled={aiSummaryEnabled}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <SafetySnapshotCard snapshot={safety} allergies={patient.known_allergies} />
          <CurrentConcernsCard concerns={concerns} />
        </div>

        <div className="flex flex-col gap-4">
          <ClinicalContextCard patient={patient} psych={psych} />
          <LatestAssessmentsCard assessments={psych.assessments} href={assessmentsHref} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ClinicalTimelineCard
          psych={psych}
          documents={documents}
          timezone={timezone}
          className="lg:col-span-2"
        />
        <div className="flex flex-col gap-4">
          <DocumentsSummaryCard documents={documents} href={documentsHref} />
          <CarePlanSnapshotCard carePlan={psych.carePlan} />
        </div>
      </div>
    </div>
  );
}

/**
 * The safety snapshot is derived, never typed here. A recorded `psych_safety`
 * row (written by the pre-visit link or a session workflow) wins; otherwise the
 * level is inferred from the structured signals the record already holds — the
 * MSE risk-thoughts field and the self-harm items on PHQ-9 / BDI-II.
 */
type RiskSnapshot = {
  /** A `psych_safety` row exists, so the level is a recorded value. */
  assessed: boolean;
  level: RiskLevel;
  /** The level was inferred from structured signals, not recorded directly. */
  derived: boolean;
  factors: string[];
  /** Display-ready "last reviewed" date, or null when nothing is on file. */
  lastReviewed: string | null;
};

/** The self-harm / suicidal-ideation item on a scored instrument, when answered. */
function riskItemLabel(assessments: PsychAssessment[]): string | null {
  for (const assessment of assessments) {
    if (assessment.assessment_type === "PHQ-9" && assessment.answers) {
      const value = assessment.answers["phq9_9"];
      if (typeof value === "number" && value > 0) {
        return `Self-harm thoughts · PHQ-9 item 9 (${value})`;
      }
    }
  }
  for (const assessment of assessments) {
    if (assessment.assessment_type === "BDI-II" && assessment.answers) {
      const value = assessment.answers["bdi2_9"];
      if (typeof value === "number" && value > 0) {
        return `Suicidal thoughts · BDI-II item 9 (${value})`;
      }
    }
  }
  return null;
}

function buildSafetySnapshot(
  psych: PatientPsychBundle,
  timezone: string,
): RiskSnapshot {
  const safety = psych.safety;
  const riskThoughts = (psych.mse?.risk_thoughts ?? "").trim();
  const hasThoughts = riskThoughts.length > 0 && riskThoughts.toLowerCase() !== "none";
  const thoughtLower = riskThoughts.toLowerCase();
  const active = hasThoughts && (thoughtLower.includes("active") || thoughtLower.includes("self-harm") || thoughtLower.includes("harm to others"));
  const passive = hasThoughts && thoughtLower.includes("passive");
  const itemLabel = riskItemLabel(psych.assessments);

  const factors = mergeTags(
    safety?.risk_factors,
    hasThoughts ? `MSE · ${riskThoughts}` : null,
    itemLabel,
  );

  let level: RiskLevel = "low";
  let derived = false;
  if (safety) {
    level = safety.risk_level;
  } else if (active) {
    level = "high";
    derived = true;
  } else if (passive) {
    level = "moderate";
    derived = true;
  }

  return {
    assessed: Boolean(safety),
    level,
    derived,
    factors,
    lastReviewed: safety?.updated_at
      ? formatShortDate(utcIsoToClinicLocalInput(safety.updated_at, timezone))
      : null,
  };
}

function SafetySnapshotCard({
  snapshot,
  allergies,
}: {
  snapshot: RiskSnapshot;
  allergies: string | null;
}) {
  const showLevel = snapshot.assessed || snapshot.level !== "low";
  const tone = RISK_TONE[snapshot.level];
  const panel = showLevel ? tone.panel : "border-hairline bg-app";
  const text = showLevel ? tone.text : "text-text-secondary";
  const dot = showLevel ? tone.dot : "bg-text-muted";

  return (
    <OverviewCard icon={ShieldAlert} title="Safety snapshot">
      <div className="space-y-4">
        <div className={cn("flex items-center gap-3 rounded-control border px-3.5 py-3", panel)}>
          <span className={cn("size-2.5 shrink-0 rounded-pill", dot)} />
          <div className="min-w-0">
            <p className={cn("text-[15px] font-semibold", text)}>
              {showLevel ? tone.label : "Not yet assessed"}
            </p>
            <p className="text-[11px] text-text-muted">
              {snapshot.assessed
                ? "Recorded in the safety record"
                : snapshot.derived
                  ? "Inferred from intake, MSE & assessments"
                  : "No risk screening recorded yet"}
            </p>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
            Active risk factors
          </p>
          <PillList tokens={snapshot.factors} emptyText="None identified" />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <RecordFact label="Last reviewed">
            {snapshot.lastReviewed ?? undefined}
          </RecordFact>
          <RecordFact label="Medical alerts">{allergies || undefined}</RecordFact>
        </div>
      </div>
    </OverviewCard>
  );
}

function CurrentConcernsCard({ concerns }: { concerns: string[] }) {
  return (
    <OverviewCard icon={Activity} title="Current concerns">
      <PillList
        tokens={concerns}
        emptyText="No active concerns recorded"
        maxVisible={8}
      />
    </OverviewCard>
  );
}

function ClinicalContextCard({
  patient,
  psych,
}: {
  patient: PatientDirectoryRow;
  psych: PatientPsychBundle;
}) {
  const previousDiagnosis = mergeTags(psych.intake?.previous_diagnosis).join(", ");
  const previousTherapy = mergeTags(psych.intake?.previous_therapy_history).join(", ");

  return (
    <OverviewCard icon={Stethoscope} title="Clinical context">
      <dl className="grid grid-cols-1 gap-3">
        <RecordFact label="Previous diagnosis">
          {previousDiagnosis || undefined}
        </RecordFact>
        <RecordFact label="Previous therapy">
          {previousTherapy || undefined}
        </RecordFact>
        <RecordFact label="Current medication">
          {patient.current_medications || undefined}
        </RecordFact>
      </dl>
    </OverviewCard>
  );
}

function LatestAssessmentsCard({
  assessments,
  href,
}: {
  assessments: PsychAssessment[];
  href: string;
}) {
  const latest = assessments.slice(0, 3);
  return (
    <OverviewCard
      icon={TrendingUp}
      title="Latest assessment scores"
      action={
        assessments.length > 0 ? (
          <Button asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[12px]">
            <Link href={href}>
              View history
              <ChevronRight aria-hidden="true" className="size-3.5" />
            </Link>
          </Button>
        ) : null
      }
    >
      {latest.length > 0 ? (
        <ul className="space-y-3">
          {latest.map((assessment) => (
            <li key={assessment.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-semibold text-ink">
                  {assessment.assessment_type}
                </span>
                <span className="text-[12px] text-text-secondary">
                  {assessment.score !== null ? `Score ${assessment.score}` : "—"}
                  {assessment.severity ? ` · ${assessment.severity}` : ""}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[11px] text-ink-faint">
                  {formatShortDate(assessment.conducted_at)}
                </span>
                <CompletedByBadge value={assessment.completed_by} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] italic text-ink-faint">No assessments on file.</p>
      )}
    </OverviewCard>
  );
}

function DocumentsSummaryCard({
  documents,
  href,
}: {
  documents: PatientDocumentView[];
  href: string;
}) {
  const count = documents.length;
  const latest = documents[0] ?? null;

  return (
    <OverviewCard
      icon={FileText}
      title="Documents"
      action={
        count > 0 ? (
          <Button asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[12px]">
            <Link href={href}>
              View
              <ChevronRight aria-hidden="true" className="size-3.5" />
            </Link>
          </Button>
        ) : null
      }
    >
      {latest ? (
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium text-text-primary">
            {count} document{count === 1 ? "" : "s"} on file
          </p>
          <p className="truncate text-[12px] text-text-secondary">
            Latest: {latest.document_name}
          </p>
          <p className="text-[11px] text-ink-faint">
            {DOC_SOURCE_LABEL[latest.source] ?? "Clinic"}
            {latest.document_date ? ` · ${formatShortDate(latest.document_date)}` : ""}
          </p>
        </div>
      ) : (
        <p className="text-[12.5px] italic text-ink-faint">No documents on file.</p>
      )}
    </OverviewCard>
  );
}

function CarePlanSnapshotCard({ carePlan }: { carePlan: PsychCarePlan | null }) {
  const therapy = parseList(carePlan?.intervention_plan)[0] ?? null;
  const goal = carePlan?.therapy_goals?.split("\n")[0]?.trim() || null;

  return (
    <OverviewCard
      icon={Target}
      title="Care plan"
      action={
        carePlan?.psychiatrist_referral ? (
          <Badge className="bg-primary/10 text-primary">Referral</Badge>
        ) : null
      }
    >
      <dl className="grid grid-cols-1 gap-3">
        <RecordFact label="Therapy">{therapy}</RecordFact>
        <RecordFact label="Active goal">{goal}</RecordFact>
        <RecordFact label="Follow-up">{carePlan?.follow_up_frequency}</RecordFact>
      </dl>
    </OverviewCard>
  );
}

type TimelineEventKind = "assessment" | "session" | "document" | "intake";
type TimelineEvent = {
  id: string;
  at: string;
  dateLabel: string;
  kind: TimelineEventKind;
  label: string;
  detail?: string;
};

const TIMELINE_ICON: Record<TimelineEventKind, LucideIcon> = {
  assessment: TrendingUp,
  session: Brain,
  document: FileText,
  intake: ClipboardList,
};

/**
 * The patient's journey, newest first, merged from these activity streams:
 * sessions, intake, assessments and uploaded documents. The care plan and
 * concerns have their own cards, so they are not repeated here.
 */
function buildTimeline(
  psych: PatientPsychBundle,
  documents: PatientDocumentView[],
  timezone: string,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const assessment of psych.assessments) {
    events.push({
      id: `assessment-${assessment.id}`,
      at: assessment.conducted_at ?? "",
      dateLabel: formatShortDate(assessment.conducted_at),
      kind: "assessment",
      label: `${assessment.assessment_type} recorded`,
      detail:
        assessment.score !== null
          ? `Score ${assessment.score}${assessment.severity ? ` · ${assessment.severity}` : ""}`
          : assessment.severity ?? undefined,
    });
  }

  for (const session of psych.sessions) {
    events.push({
      id: `session-${session.id}`,
      at: session.session_date ?? "",
      dateLabel: formatShortDate(session.session_date),
      kind: "session",
      label: SESSION_TYPE_META[session.session_type],
      detail: session.format,
    });
  }

  for (const document of documents) {
    const local = document.uploaded_at
      ? utcIsoToClinicLocalInput(document.uploaded_at, timezone)
      : "";
    events.push({
      id: `document-${document.id}`,
      at: document.uploaded_at ?? "",
      dateLabel: formatShortDate(local),
      kind: "document",
      label: "Document uploaded",
      detail: document.document_name,
    });
  }

  if (psych.intake?.updated_at) {
    events.push({
      id: `intake-${psych.intake.id}`,
      at: psych.intake.updated_at,
      dateLabel: formatShortDate(
        utcIsoToClinicLocalInput(psych.intake.updated_at, timezone),
      ),
      kind: "intake",
      label: "Intake & history recorded",
    });
  }

  return events
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
    .slice(0, 6);
}

function ClinicalTimelineCard({
  psych,
  documents,
  timezone,
  className,
}: {
  psych: PatientPsychBundle;
  documents: PatientDocumentView[];
  timezone: string;
  className?: string;
}) {
  const events = buildTimeline(psych, documents, timezone);

  return (
    <OverviewCard icon={History} title="Clinical timeline" className={className}>
      {events.length > 0 ? (
        <ol className="space-y-3.5">
          {events.map((event) => {
            const Icon = TIMELINE_ICON[event.kind];
            return (
              <li key={event.id} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-pill bg-app text-text-secondary">
                  <Icon aria-hidden="true" className="size-3" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-text-primary">
                    {event.label}
                  </p>
                  {event.detail && (
                    <p className="truncate text-[11.5px] text-text-muted">
                      {event.detail}
                    </p>
                  )}
                </div>
                <time className="shrink-0 text-[11px] text-ink-faint">
                  {event.dateLabel}
                </time>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-[12.5px] italic text-ink-faint">
          No clinical activity recorded yet.
        </p>
      )}
    </OverviewCard>
  );
}

/* ------------------------------------------------------------------------- */
/* Intake & Psychological History                                            */
/* ------------------------------------------------------------------------- */

type IntakeField =
  | "previous_therapy_history"
  | "previous_diagnosis"
  | "family_mental_health_history"
  | "psychosocial_background"
  | "stressors"
  | "substance_use_history";

/** Only the two fields that are genuinely narrative stay as prose (0079). */
const INTAKE_TEXT_FIELDS: Array<{
  field: IntakeField;
  label: string;
  placeholder: string;
}> = [
  {
    field: "psychosocial_background",
    label: "Psychosocial background",
    placeholder: "Family, upbringing, education, occupation, social supports…",
  },
  {
    field: "substance_use_history",
    label: "Substance use history",
    placeholder: "Substances, frequency, duration, last use, treatment…",
  },
];

function IntakeTab({ patientId, psych, canManage }: { patientId: string; psych: PatientPsychBundle; canManage: boolean }) {
  const intake = psych.intake;
  const save =
    (field: IntakeField) =>
    (value: string) =>
      savePsychIntakeAction(patientId, { [field]: value }).then((r) => r.ok);
  const onSave = (field: IntakeField) =>
    canManage ? save(field) : async () => true;

  return (
    <RecordSection title="Intake & Psychological History">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ChipNote
            label="Previous therapy history"
            value={intake?.previous_therapy_history}
            options={THERAPY_HISTORY_OPTIONS}
            onSave={onSave("previous_therapy_history")}
            disabled={!canManage}
          />
          <ChipNote
            label="Previous diagnosis"
            value={intake?.previous_diagnosis}
            options={DIAGNOSIS_OPTIONS}
            onSave={onSave("previous_diagnosis")}
            disabled={!canManage}
          />
          <ChipNote
            label="Family mental health history"
            value={intake?.family_mental_health_history}
            options={FAMILY_HISTORY_OPTIONS}
            onSave={onSave("family_mental_health_history")}
            disabled={!canManage}
          />
          <ChipNote
            label="Stressors"
            value={intake?.stressors}
            options={STRESSOR_OPTIONS}
            onSave={onSave("stressors")}
            disabled={!canManage}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {INTAKE_TEXT_FIELDS.map(({ field, label, placeholder }) => (
            <AutosaveNote
              key={field}
              label={label}
              name={`psych-intake-${field}`}
              value={intake?.[field] ?? null}
              onSave={onSave(field)}
              rows={4}
              placeholder={placeholder}
            />
          ))}
        </div>
      </div>
    </RecordSection>
  );
}

/* ------------------------------------------------------------------------- */
/* Mental Status Examination                                                 */
/* ------------------------------------------------------------------------- */

/**
 * Standard descriptors per MSE domain. One tap records the observation; the
 * ChipNote "Other…" escape hatch still allows a bespoke phrase when none fit.
 */
const MSE_OPTIONS: Record<string, readonly string[]> = {
  appearance_grooming: ["Neat", "Adequate", "Dishevelled", "Unkempt"],
  appearance_eye_contact: ["Good", "Fair", "Poor", "Avoidant"],
  appearance_behaviour: [
    "Cooperative",
    "Calm",
    "Restless",
    "Agitated",
    "Withdrawn",
    "Guarded",
    "Hostile",
  ],
  speech_rate: ["Normal", "Slow", "Rapid", "Pressured"],
  speech_tone: ["Normal", "Monotone", "Loud", "Soft", "Tremulous"],
  speech_volume: ["Normal", "Loud", "Soft"],
  mood_patient_reported: [
    "Euthymic",
    "Depressed",
    "Anxious",
    "Irritable",
    "Elevated",
    "Anhedonic",
    "Mixed",
  ],
  affect_observed: [
    "Congruent",
    "Restricted",
    "Blunted",
    "Flat",
    "Labile",
    "Incongruent",
  ],
  thought_process: [
    "Linear",
    "Circumstantial",
    "Tangential",
    "Flight of ideas",
    "Loosening",
    "Perseverative",
  ],
  thought_content: [
    "No abnormality",
    "Worries",
    "Obsessions",
    "Delusions",
    "Suicidal ideation",
    "Hopelessness",
    "Guilt",
  ],
  risk_thoughts: [
    "None",
    "Passive ideation",
    "Active ideation",
    "Self-harm",
    "Harm to others",
  ],
  cognition_orientation: ["Oriented x3", "Oriented x2", "Disoriented"],
  cognition_memory: ["Intact", "Mild impairment", "Impaired"],
  cognition_insight: ["Good", "Partial", "Poor", "Absent"],
  cognition_judgment: ["Good", "Fair", "Impaired", "Absent"],
};

const MSE_GROUPS: Array<{ title: string; fields: Array<{ field: keyof NonNullable<PatientPsychBundle["mse"]>; label: string }> }> = [
  {
    title: "Appearance",
    fields: [
      { field: "appearance_grooming", label: "Grooming" },
      { field: "appearance_eye_contact", label: "Eye contact" },
      { field: "appearance_behaviour", label: "Behaviour" },
    ],
  },
  {
    title: "Speech",
    fields: [
      { field: "speech_rate", label: "Rate" },
      { field: "speech_tone", label: "Tone" },
      { field: "speech_volume", label: "Volume" },
    ],
  },
  {
    title: "Mood & Affect",
    fields: [
      { field: "mood_patient_reported", label: "Patient reported mood" },
      { field: "affect_observed", label: "Observed affect" },
    ],
  },
  {
    title: "Thought",
    fields: [
      { field: "thought_process", label: "Thought process" },
      { field: "thought_content", label: "Thought content" },
      { field: "risk_thoughts", label: "Risk thoughts" },
    ],
  },
  {
    title: "Cognition",
    fields: [
      { field: "cognition_orientation", label: "Orientation" },
      { field: "cognition_memory", label: "Memory" },
      { field: "cognition_insight", label: "Insight" },
      { field: "cognition_judgment", label: "Judgment" },
    ],
  },
];

function MseTab({ patientId, psych, canManage }: { patientId: string; psych: PatientPsychBundle; canManage: boolean }) {
  const mse = psych.mse;
  const save =
    (field: (typeof MSE_GROUPS)[number]["fields"][number]["field"]) =>
    (value: string) =>
      savePsychMseAction(patientId, { [field]: value }).then((r) => r.ok);

  return (
    <div className="space-y-4">
      {MSE_GROUPS.map((group) => (
        <RecordSection key={group.title} title={group.title}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {group.fields.map(({ field, label }) => (
              <ChipNote
                key={field}
                label={label}
                value={mse?.[field] ?? null}
                options={MSE_OPTIONS[field] ?? []}
                onSave={canManage ? save(field) : async () => true}
                single
                disabled={!canManage}
              />
            ))}
          </div>
        </RecordSection>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Session Notes (BIRP / DAP)                                                */
/* ------------------------------------------------------------------------- */

function SessionsTab({
  patient,
  psych,
  canManage,
  seed,
  onSeedApplied,
}: {
  patient: PatientDirectoryRow;
  psych: PatientPsychBundle;
  canManage: boolean;
  seed: PsychDraft | null;
  onSeedApplied: () => void;
}) {
  const router = useRouter();
  const [format, setFormat] = useState<"BIRP" | "DAP">("BIRP");
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [sessionDate, setSessionDate] = useState("");
  const [sessionType, setSessionType] = useState<keyof typeof SESSION_TYPE_META>("individual");

  // The copilot lives at the workspace level (available on every tab). A note
  // captured elsewhere arrives here as a seed and is merged once the form is
  // on screen; the parent then clears it so it is applied exactly once.
  useEffect(() => {
    if (!seed) return;
    setFormat(seed.format);
    setDraft((current) => ({ ...current, ...seed.fields }));
    onSeedApplied();
  }, [seed, onSeedApplied]);

  const fields: Array<{ key: string; label: string }> =
    format === "BIRP"
      ? [
          { key: "behavior", label: "Behavior" },
          { key: "intervention", label: "Intervention" },
          { key: "response", label: "Response" },
          { key: "plan", label: "Plan" },
        ]
      : [
          { key: "observation_data", label: "Data" },
          { key: "assessment", label: "Assessment" },
          { key: "plan", label: "Plan" },
        ];

  async function saveSession() {
    if (!canManage) return;
    setPending(true);
    const payload: Record<string, string> = {
      format,
      session_type: sessionType,
      ...draft,
    };
    if (sessionDate) payload.session_date = sessionDate;
    const result = await savePsychSessionAction(patient.id, payload);
    setPending(false);
    if (result.ok) {
      toast.success("Session note saved");
      setDraft({});
      setSessionDate("");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function removeSession(id: string) {
    const result = await deletePsychSessionAction(id);
    if (result.ok) router.refresh();
    else toast.error(result.message);
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <RecordSection title="Write session note">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-control border border-hairline bg-app p-0.5">
              {(["BIRP", "DAP"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setFormat(kind)}
                  aria-pressed={format === kind}
                  className={cn(
                    "rounded-control px-3 py-1 text-[12px] font-semibold transition-colors",
                    format === kind ? "bg-white text-primary shadow-sm" : "text-text-secondary hover:text-primary",
                  )}
                >
                  {kind}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-[12px] font-medium text-text-secondary">
              Session type
              <select
                value={sessionType}
                onChange={(e) =>
                  setSessionType(e.target.value as keyof typeof SESSION_TYPE_META)
                }
                className="rounded-control border border-text-muted/25 bg-surface px-2 py-1 text-[12px] text-text-primary outline-none"
              >
                {(Object.keys(SESSION_TYPE_META) as Array<keyof typeof SESSION_TYPE_META>).map((key) => (
                  <option key={key} value={key}>
                    {SESSION_TYPE_META[key]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[12px] font-medium text-text-secondary">
              <CalendarDays aria-hidden="true" className="size-3.5" />
              <input
                type="date"
                value={sessionDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setSessionDate(e.target.value)}
                className="rounded-control border border-text-muted/25 bg-surface px-2 py-1 text-[12px] text-text-primary outline-none"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {fields.map(({ key, label }) => (
              <div key={key}>
                <p className="text-ink mb-1.5 text-[12.5px] font-bold">{label}</p>
                <textarea
                  rows={4}
                  value={draft[key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  placeholder={format === "BIRP" ? "What the client did and said in session…" : "Facts observed and reported in this session…"}
                  className="w-full resize-y rounded-control border border-text-muted/25 bg-surface p-2.5 text-[12.5px] leading-relaxed text-text-primary outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                />
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <Button type="button" size="sm" onClick={saveSession} disabled={pending} className="gap-1.5">
              {pending ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : <ClipboardList aria-hidden="true" className="size-3.5" />}
              {pending ? "Saving…" : "Save session note"}
            </Button>
          </div>
        </RecordSection>
      )}

      {psych.sessions.length > 0 ? (
        <div className="space-y-3">
          <SpecialtyHeading title="Session history" description="Newest first" />
          {psych.sessions.map((session) => (
            <SessionRow key={session.id} session={session} canManage={canManage} onDelete={removeSession} />
          ))}
        </div>
      ) : (
        <RecordEmpty
          icon={Brain}
          title="No session notes yet"
          description="Session notes use the BIRP or DAP format — no medical prescription format."
        />
      )}
    </div>
  );
}

function SessionRow({ session, canManage, onDelete }: { session: PsychSession; canManage: boolean; onDelete: (id: string) => void }) {
  const rows = (
    session.format === "BIRP"
      ? [
          ["Behavior", session.behavior],
          ["Intervention", session.intervention],
          ["Response", session.response],
          ["Plan", session.plan],
        ]
      : [
          ["Data", session.observation_data],
          ["Assessment", session.assessment],
          ["Plan", session.plan],
        ]
  ) as Array<[string, string | null]>;

  const entries = rows.filter(([, value]) => value?.trim());

  return (
    <RecordSection
      title={`${session.session_date} · ${SESSION_TYPE_META[session.session_type]} · ${session.format}`}
      meta={
        canManage && (
          <Button type="button" variant="ghost" size="sm" className="text-status-destructive" onClick={() => onDelete(session.id)}>
            <Trash2 aria-hidden="true" className="size-3.5" />
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-3">
        {entries.map(([label, value]) => (
          <RecordNote key={label} label={label} value={value} />
        ))}
        {entries.length === 0 && <p className="text-ink-faint text-[12px] italic">No fields recorded.</p>}
      </div>
    </RecordSection>
  );
}

/* ------------------------------------------------------------------------- */
/* Psychometrics                                                            */
/* ------------------------------------------------------------------------- */

/**
 * Psychometric instrument library (0079). Each instrument carries its ceiling
 * (so the score input can bound itself) and its published severity bands (so
 * the severity field fills itself from the score instead of being retyped).
 */
const ASSESSMENT_LIBRARY: Record<
  string,
  { label: string; max: number; bands: Array<{ upTo: number; label: string }> }
> = {
  "PHQ-9": {
    label: "PHQ-9 · Depression",
    max: 27,
    bands: [
      { upTo: 4, label: "Minimal" },
      { upTo: 9, label: "Mild" },
      { upTo: 14, label: "Moderate" },
      { upTo: 19, label: "Moderately severe" },
      { upTo: 27, label: "Severe" },
    ],
  },
  "GAD-7": {
    label: "GAD-7 · Anxiety",
    max: 21,
    bands: [
      { upTo: 4, label: "Minimal" },
      { upTo: 9, label: "Mild" },
      { upTo: 14, label: "Moderate" },
      { upTo: 21, label: "Severe" },
    ],
  },
  BAI: {
    label: "BAI · Anxiety",
    max: 63,
    bands: [
      { upTo: 7, label: "Minimal" },
      { upTo: 15, label: "Mild" },
      { upTo: 25, label: "Moderate" },
      { upTo: 63, label: "Severe" },
    ],
  },
  "BDI-II": {
    label: "BDI-II · Depression",
    max: 63,
    bands: [
      { upTo: 13, label: "Minimal" },
      { upTo: 19, label: "Mild" },
      { upTo: 28, label: "Moderate" },
      { upTo: 63, label: "Severe" },
    ],
  },
  "PCL-5": {
    label: "PCL-5 · PTSD",
    max: 80,
    bands: [
      { upTo: 30, label: "Below threshold" },
      { upTo: 33, label: "Threshold" },
      { upTo: 80, label: "Probable PTSD" },
    ],
  },
  "OCI-R": {
    label: "OCI-R · OCD",
    max: 72,
    bands: [
      { upTo: 20, label: "Subclinical" },
      { upTo: 40, label: "Moderate" },
      { upTo: 72, label: "Severe" },
    ],
  },
  AUDIT: {
    label: "AUDIT · Alcohol",
    max: 40,
    bands: [
      { upTo: 7, label: "Low risk" },
      { upTo: 15, label: "Hazardous" },
      { upTo: 19, label: "Harmful" },
      { upTo: 40, label: "Dependence likely" },
    ],
  },
  ASRS: {
    label: "ASRS · ADHD",
    max: 24,
    bands: [
      { upTo: 16, label: "Unlikely" },
      { upTo: 24, label: "Likely ADHD" },
    ],
  },
  Other: { label: "Other", max: 30, bands: [] },
};

const ASSESSMENT_TYPES = Object.keys(ASSESSMENT_LIBRARY);

/** The published band a raw score falls in, or "" when nothing matches. */
function severityFor(type: string, score: number | null): string {
  if (score === null) return "";
  const instrument = ASSESSMENT_LIBRARY[type];
  if (!instrument || instrument.bands.length === 0) return "";
  for (const band of instrument.bands) {
    if (score <= band.upTo) return band.label;
  }
  return instrument.bands[instrument.bands.length - 1]?.label ?? "";
}

function PsychometricsTab({
  patientId,
  psych,
  canManage,
  whatsappNumber,
}: {
  patientId: string;
  psych: PatientPsychBundle;
  canManage: boolean;
  whatsappNumber: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [type, setType] = useState("PHQ-9");
  const [score, setScore] = useState("");
  const [severity, setSeverity] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");

  const instrument = ASSESSMENT_LIBRARY[type] ?? ASSESSMENT_LIBRARY.Other;

  function changeType(next: string) {
    setType(next);
    setSeverity(severityFor(next, score === "" ? null : Number(score)));
  }

  function changeScore(next: string) {
    setScore(next);
    setSeverity(severityFor(type, next === "" ? null : Number(next)));
  }

  async function addAssessment() {
    if (!canManage) return;
    setPending(true);
    const result = await savePsychAssessmentAction(patientId, {
      assessment_type: type,
      score: score === "" ? null : Number(score),
      severity: severity || null,
      conducted_at: date || null,
      notes: notes || null,
    });
    setPending(false);
    if (result.ok) {
      toast.success("Assessment recorded");
      setScore("");
      setSeverity("");
      setDate("");
      setNotes("");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function removeAssessment(id: string) {
    const result = await deletePsychAssessmentAction(id);
    if (result.ok) router.refresh();
    else toast.error(result.message);
  }

  return (
    <div className="space-y-4">
      <RecordSection title="Score history">
        {psych.assessments.length > 0 ? (
          <div className="space-y-3">
            {psych.assessments.map((a) => (
              <AssessmentTrendRow key={a.id} assessment={a} canManage={canManage} onDelete={removeAssessment} />
            ))}
          </div>
        ) : (
          <RecordEmpty
            icon={TrendingUp}
            title="No assessments on file"
            description="Log a standard instrument (PHQ-9, GAD-7, BDI-II, PCL-5…) to track score history and trends."
          />
        )}
      </RecordSection>

      {canManage && (
        <RecordSection title="Log assessment">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-ink mb-1.5 text-[12.5px] font-bold">Assessment</p>
              <select
                value={type}
                onChange={(e) => changeType(e.target.value)}
                className="w-full rounded-control border border-text-muted/25 bg-surface px-2 py-1.5 text-[12.5px] text-text-primary outline-none"
              >
                {ASSESSMENT_TYPES.map((key) => (
                  <option key={key} value={key}>
                    {key === "Other"
                      ? "Other"
                      : `${ASSESSMENT_LIBRARY[key].label} (/${ASSESSMENT_LIBRARY[key].max})`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-ink mb-1.5 text-[12.5px] font-bold">Score</p>
              <input
                type="number"
                min={0}
                max={instrument.max}
                value={score}
                onChange={(e) => changeScore(e.target.value)}
                placeholder={`0–${instrument.max}`}
                className="w-full rounded-control border border-text-muted/25 bg-surface px-2 py-1.5 text-[12.5px] text-text-primary outline-none"
              />
            </div>
            <div>
              <p className="text-ink mb-1.5 text-[12.5px] font-bold">Severity</p>
              <input
                type="text"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                placeholder="Auto-filled from score"
                className="w-full rounded-control border border-text-muted/25 bg-surface px-2 py-1.5 text-[12.5px] text-text-primary outline-none"
              />
            </div>
            <div>
              <p className="text-ink mb-1.5 text-[12.5px] font-bold">Date</p>
              <input
                type="date"
                value={date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-control border border-text-muted/25 bg-surface px-2 py-1.5 text-[12.5px] text-text-primary outline-none"
              />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-ink mb-1.5 text-[12.5px] font-bold">Notes</p>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full resize-y rounded-control border border-text-muted/25 bg-surface p-2.5 text-[12.5px] leading-relaxed text-text-primary outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button type="button" size="sm" onClick={addAssessment} disabled={pending} className="gap-1.5">
              {pending ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : <TrendingUp aria-hidden="true" className="size-3.5" />}
              {pending ? "Saving…" : "Record assessment"}
            </Button>
          </div>
        </RecordSection>
      )}

      <PatientLinksPanel
        patientId={patientId}
        whatsappNumber={whatsappNumber}
        canManage={canManage}
      />
    </div>
  );
}

function AssessmentTrendRow({ assessment, canManage, onDelete }: { assessment: PsychAssessment; canManage: boolean; onDelete: (id: string) => void }) {
  const meta = ASSESSMENT_LIBRARY[assessment.assessment_type] ?? ASSESSMENT_LIBRARY.Other;
  const pct = assessment.score === null ? 0 : Math.min(100, Math.round((assessment.score / meta.max) * 100));
  const [showResponses, setShowResponses] = useState(false);

  // Item-level answers only exist for online submissions (0080). Map them back
  // to the instrument's question text when the type is a known instrument.
  const instrument = isPsychometricKey(assessment.assessment_type)
    ? PSYCHOMETRIC_INSTRUMENTS[assessment.assessment_type]
    : null;
  const responses =
    instrument && assessment.answers
      ? instrument.items.map((item) => ({
          text: item.text,
          value: assessment.answers?.[item.id],
        }))
      : [];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        <div className="w-28 shrink-0">
          <p className="text-[12px] font-semibold text-secondary">{assessment.assessment_type}</p>
          <p className="text-[11px] text-ink-faint">{assessment.conducted_at}</p>
        </div>
        <div className="h-8 flex-1 overflow-hidden rounded-pill bg-app">
          <div
            className={cn("flex h-full items-center rounded-pill px-2 text-[11px] font-semibold text-white", assessment.score === null ? "w-0" : "bg-primary")}
            style={{ width: `${pct}%` }}
          >
            {assessment.score}
          </div>
        </div>
        <div className="w-40 shrink-0 text-right">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {assessment.severity && <span className="text-[11.5px] font-medium text-text-secondary">{assessment.severity}</span>}
            <CompletedByBadge value={assessment.completed_by} />
          </div>
          {assessment.notes && <p className="truncate text-[11px] text-ink-faint" title={assessment.notes}>{assessment.notes}</p>}
          {responses.length > 0 && (
            <button
              type="button"
              onClick={() => setShowResponses((v) => !v)}
              className="mt-0.5 text-[11px] font-medium text-primary hover:underline"
            >
              {showResponses ? "Hide responses" : "View responses"}
            </button>
          )}
        </div>
        {canManage && (
          <Button type="button" variant="ghost" size="sm" className="text-status-destructive" onClick={() => onDelete(assessment.id)}>
            <Trash2 aria-hidden="true" className="size-3.5" />
          </Button>
        )}
      </div>

      {showResponses && responses.length > 0 && (
        <ul className="ml-28 space-y-1 rounded-control bg-app p-2.5">
          {responses.map((response, index) => (
            <li key={index} className="flex items-start justify-between gap-3">
              <span className="text-[11.5px] leading-snug text-text-secondary">
                {index + 1}. {response.text}
              </span>
              <span className="shrink-0 text-[11.5px] font-semibold text-text-primary">
                {response.value ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Care Plan                                                                 */
/* ------------------------------------------------------------------------- */

function CarePlanTab({ patientId, psych, canManage }: { patientId: string; psych: PatientPsychBundle; canManage: boolean }) {
  const carePlan = psych.carePlan;

  const save =
    (field: keyof NonNullable<PatientPsychBundle["carePlan"]>) =>
    (value: string) =>
      savePsychCarePlanAction(patientId, { [field]: value }).then((r) => r.ok);

  const saveReferral = async (checked: boolean) => {
    const result = await savePsychCarePlanAction(patientId, { psychiatrist_referral: checked });
    if (result.ok) toast.success(checked ? "Psychiatrist referral flagged" : "Referral flag cleared");
    else toast.error(result.message);
  };

  return (
    <RecordSection title="Care Plan">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-[12.5px] font-bold text-ink">
          <input
            type="checkbox"
            checked={carePlan?.psychiatrist_referral ?? false}
            onChange={(e) => canManage && saveReferral(e.target.checked)}
            disabled={!canManage}
            className="size-4 accent-[var(--color-primary)]"
          />
          <Rocket aria-hidden="true" className="size-4 text-primary" />
          Psychiatrist referral
        </label>
        {carePlan?.psychiatrist_referral && (
          <Badge className="bg-primary/10 text-primary">Referral active</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <AutosaveNote
          label="Therapy goals"
          name="psych-care-therapy_goals"
          value={carePlan?.therapy_goals}
          onSave={canManage ? save("therapy_goals") : async () => true}
          rows={3}
          placeholder="Agreed goals, one per line…"
        />
        <SelectNote
          label="Follow-up frequency"
          name="psych-care-follow_up_frequency"
          value={carePlan?.follow_up_frequency}
          options={FOLLOW_UP_OPTIONS}
          onSave={canManage ? save("follow_up_frequency") : async () => true}
          disabled={!canManage}
        />
        <ChipNote
          label="Intervention plan"
          value={carePlan?.intervention_plan}
          options={INTERVENTION_OPTIONS}
          onSave={canManage ? save("intervention_plan") : async () => true}
          disabled={!canManage}
        />
        <ChipNote
          label="Homework assignments"
          value={carePlan?.homework_assignments}
          options={HOMEWORK_OPTIONS}
          onSave={canManage ? save("homework_assignments") : async () => true}
          disabled={!canManage}
        />
        <div className="md:col-span-2">
          <AutosaveNote
            label="Referral notes"
            name="psych-care-referral-notes"
            value={carePlan?.referral_notes}
            onSave={canManage ? save("referral_notes") : async () => true}
            rows={3}
          />
        </div>
      </div>
    </RecordSection>
  );
}