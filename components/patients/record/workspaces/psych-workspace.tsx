/**
 * Psychology workspace Ã¢â‚¬â€ the Clinical Psychologist's patient record tabs
 * (migration 0077). Replaces the general record's tab group for doctors whose
 * specialty resolves to `psychology`.
 *
 * Layout mirrors the reference: read-only snapshot tiles by default, autosave
 * notes on Edit (same pattern as Past History), and committed rows for session
 * notes and psychometrics Ã¢â‚¬â€ each inserts a distinct record, so they get save
 * buttons and a history list rather than per-field blur saves.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Activity,
  Brain,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  FileText,
  History,
  Loader2,
  Rocket,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Target,
  Trash2,
  TrendingUp,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";

import { AutosaveNote, ChipNote, SelectNote, parseList } from "@/components/patients/record/workspaces/specialty-form";
import { IntakeHistoryTab } from "@/components/patients/record/workspaces/psych-intake-tab";
import { MseTab } from "@/components/patients/record/workspaces/psych-mse-tab";
import { SessionsTab, type PsychDraft } from "@/components/patients/record/workspaces/psych-sessions-tab";
import { PatientLinksPanel } from "@/components/patients/record/workspaces/patient-links-panel";
import { AssessmentSafetyBanner } from "@/components/patients/record/workspaces/assessment-safety-banner";
import { TrendChart } from "@/components/clinical/TrendChart";
import { AISummaryCard as LongitudinalSummaryCard } from "@/components/clinical/AISummaryCard";
import { AiSummaryCard } from "@/components/patients/record/ai-summary-card";
import { DocumentsTab } from "@/components/patients/record/documents-tab";
import { RecordEmpty, RecordFact, RecordSection } from "@/components/patients/record/record-primitives";
import { CopilotDrawer } from "@/components/consultation/copilot-drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getActiveAssessmentTemplatesAction } from "@/lib/actions/assessment-library";
import {
  deletePsychAssessmentAction,
  generateAssessmentInterpretationAction,
  savePsychAssessmentAction,
  savePsychCarePlanAction,
  savePsychMseFindingsAction,
} from "@/lib/actions/specialty-workspaces";
import { canSendOnline, severityFromBands, templateMaxScore } from "@/lib/assessment-library";
import {
  createAssessmentScheduleRuleAction,
  deleteAssessmentScheduleRuleAction,
  listAssessmentScheduleRulesAction,
  setAssessmentScheduleRuleActiveAction,
} from "@/lib/actions/assessment-schedules";
import { getInstrument } from "@/lib/scoring";
import { ASSESSMENT_RATERS, raterLabel } from "@/lib/assessments/raters";
import { useAmbientRecorder } from "@/lib/copilot/hooks/useAmbientRecorder";
import type { PsychNoteExtraction, WorkspaceExtraction } from "@/lib/copilot/types";
import { mseFindingsFromCopilotNote, readMseFindings } from "@/lib/psych-mse";
import { setPsychCopilotReady } from "@/components/patients/record/workspaces/psych-copilot-ready";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/utils/datetime";
import { SESSION_TYPE_META } from "@/lib/psych-session";
import type { PatientPsychBundle } from "@/lib/patient-record";
import type { PatientDocumentView } from "@/lib/patient-documents-queries";
import { PSYCHOMETRIC_INSTRUMENTS, isPsychometricKey } from "@/lib/psychometrics";
import { hasPsychSummaryContent } from "@/lib/psych-summary";
import { PSYCHOLOGY_WORKSPACE, type PsychTabId } from "@/lib/specialty-workspaces";
import type {
  AssessmentRaterType,
  AssessmentScheduleRule,
  AssessmentTemplate,
  PatientDirectoryRow,
  PsychAssessment,
  PsychCarePlan,
} from "@/types/database";

type Props = {
  patient: PatientDirectoryRow;
  psych: PatientPsychBundle;
  documents: PatientDocumentView[];
  activeTab: PsychTabId;
  canManage: boolean;
  timezone: string;
  aiSummaryEnabled: boolean;
  /** `?tab=psy_psychometrics` Ã¢â‚¬â€ the Overview's "View history" target. */
  assessmentsHref: string;
  /** `?tab=psy_documents` Ã¢â‚¬â€ the Overview's "View" documents target. */
  documentsHref: string;
  /** `?tab=psy_sessions` — the Overview timeline's session-event target. */
  sessionsHref: string;
  /** `?tab=psy_intake` — the Overview timeline/intake-context target. */
  intakeHref: string;
  /** `?tab=psy_care_plan` — the Overview care-plan snapshot target. */
  carePlanHref: string;
};

export function PsychWorkspace({ patient, psych, documents, activeTab, canManage, timezone, aiSummaryEnabled, assessmentsHref, documentsHref, sessionsHref, intakeHref, carePlanHref }: Props) {
  const [seed, setSeed] = useState<PsychDraft | null>(null);
  const [library, setLibrary] = useState<AssessmentTemplate[]>([]);
  /** A copilot extraction that triaged HIGH/CRISIS — banner until dismissed. */
  const [riskAlert, setRiskAlert] = useState<string | null>(null);

  /**
   * Active assessment-library templates (migration 0085), loaded once for the
   * workspace: they feed the Psychometrics select, its severity autofill, the
   * trend bar ceilings, and the send-to-patient assessment picker.
   */
  useEffect(() => {
    void getActiveAssessmentTemplatesAction().then((result) => {
      if (result.ok) setLibrary(result.data.templates);
    });
  }, []);

  /**
   * One master audio engine, lifted here so recording survives tab switches —
   * the psychologist can open the MSE or Psychometrics mid-session while the
   * microphone keeps capturing. Both the CopilotDrawer and the Session Notes
   * tab receive this same instance, so there are never two record buttons.
   */
  const ambient = useAmbientRecorder({
    workspaceKind: "psychology",
    workspaceContext: PSYCHOLOGY_WORKSPACE.copilotContext,
  });

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
    setSeed({
      format: note.format === "DAP" ? "DAP" : "BIRP",
      fields,
      riskLevel: note.risk_level,
      riskNotes: note.risk_notes?.trim() || null,
    });
  }, []);

  /** The 🚨 workspace alert from the drawer's HIGH/CRISIS extraction. */
  const handleRiskFlag = useCallback((notes: string) => {
    setRiskAlert(notes);
    toast.error(`High-risk content detected in the session — review the safety plan.`);
  }, []);

  /**
   * 📋 Push to Today's MSE: keyword-map the copilot's observables onto real MSE
   * tokens and merge with the stored exam, then commit through the same server
   * action the MSE tab uses.
   */
  const handlePushToMse = useCallback(
    async (note: PsychNoteExtraction) => {
      const merged = mseFindingsFromCopilotNote(note, readMseFindings(psych.mse?.findings));
      const result = await savePsychMseFindingsAction(patient.id, { findings: merged });
      if (result.ok) {
        toast.success("Observations pushed to today's MSE.");
      } else {
        toast.error(result.message);
      }
    },
    [patient.id, psych.mse?.findings],
  );

  /** ✨ Sessions "Draft Ready" badge — visible while a seeded draft waits. */
  useEffect(() => {
    setPsychCopilotReady(seed !== null);
    return () => setPsychCopilotReady(false);
  }, [seed]);

  return (
    <div className="tab-fade-in">
      <div className={cn("flex flex-col gap-4", canManage && "xl:flex-row xl:items-start")}>
        <div className="min-w-0 flex-1 space-y-4">
          {riskAlert && (
            <div className="flex flex-col gap-1.5 rounded-card border border-status-destructive/40 bg-status-destructive/10 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-status-destructive" />
                <p className="flex-1 text-[12.5px] font-bold text-status-destructive">
                  High Risk Ideation Detected in Session — Review Safety Plan
                </p>
                <button
                  type="button"
                  onClick={() => setRiskAlert(null)}
                  aria-label="Dismiss risk alert"
                  className="rounded-pill p-1 text-status-destructive/70 hover:bg-status-destructive/10 hover:text-status-destructive"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </div>
              {riskAlert.trim() && (
                <p className="text-[12px] leading-relaxed text-text-primary">{riskAlert}</p>
              )}
            </div>
          )}
          <AssessmentSafetyBanner assessments={psych.assessments} canManage={canManage} />
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
              sessionsHref={sessionsHref}
              intakeHref={intakeHref}
              carePlanHref={carePlanHref}
            />
          )}
          {activeTab === "psy_intake" && (
            <IntakeHistoryTab
              patientId={patient.id}
              psych={psych}
              canManage={canManage}
              timezone={timezone}
              whatsappNumber={patient.whatsapp_number}
            />
          )}
          {activeTab === "psy_mse" && (
            <MseTab patientId={patient.id} psych={psych} canManage={canManage} timezone={timezone} />
          )}
          {activeTab === "psy_sessions" && (
            <SessionsTab
              patient={patient}
              psych={psych}
              canManage={canManage}
              seed={seed}
              onSeedApplied={() => setSeed(null)}
              ambient={ambient}
            />
          )}
          {activeTab === "psy_psychometrics" && (
            <PsychometricsTab
              patientId={patient.id}
              psych={psych}
              canManage={canManage}
              whatsappNumber={patient.whatsapp_number}
              templates={library}
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
            recorder={ambient}
            onRiskFlag={handleRiskFlag}
            onPushToMse={(note) => void handlePushToMse(note)}
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
 * captured by the workflow that owns it Ã¢â‚¬â€ pre-visit intake, psychometric links,
 * uploaded documents, session notes or the care plan Ã¢â‚¬â€ so nothing here is typed
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

/** A read-only token (concern, risk factor) Ã¢â‚¬â€ the display counterpart of ChipNote. */
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

/** A quiet tag for how a result arrived Ã¢â‚¬â€ a patient link stands out. */
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

/** How a document arrived Ã¢â‚¬â€ a patient link, the desk, or a clinician. */
const DOC_SOURCE_LABEL: Record<string, string> = {
  patient_online: "Patient online",
  reception: "Reception",
  staff: "Clinic",
};

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

function OverviewSafetyTab({
  patient,
  psych,
  documents,
  canManage,
  timezone,
  aiSummaryEnabled,
  assessmentsHref,
  documentsHref,
  sessionsHref,
  intakeHref,
  carePlanHref,
}: {
  patient: PatientDirectoryRow;
  psych: PatientPsychBundle;
  documents: PatientDocumentView[];
  canManage: boolean;
  timezone: string;
  aiSummaryEnabled: boolean;
  assessmentsHref: string;
  documentsHref: string;
  sessionsHref: string;
  intakeHref: string;
  carePlanHref: string;
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
        scanSummary={patient.ai_scan_summary}
        scanGeneratedAt={patient.ai_scan_summary_generated_at}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <SafetySnapshotCard snapshot={safety} allergies={patient.known_allergies} />
          <CurrentConcernsCard concerns={concerns} />
        </div>

        <div className="flex flex-col gap-4">
          <ClinicalContextCard patient={patient} psych={psych} href={intakeHref} />
          <LatestAssessmentsCard assessments={psych.assessments} href={assessmentsHref} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ClinicalTimelineCard
          psych={psych}
          documents={documents}
          timezone={timezone}
          hrefs={{
            assessment: assessmentsHref,
            session: sessionsHref,
            document: documentsHref,
            intake: intakeHref,
          }}
          className="lg:col-span-2"
        />
        <div className="flex flex-col gap-4">
          <DocumentsSummaryCard documents={documents} href={documentsHref} />
          <CarePlanSnapshotCard carePlan={psych.carePlan} href={carePlanHref} />
        </div>
      </div>
    </div>
  );
}

/**
 * The safety snapshot is derived, never typed here. A recorded `psych_safety`
 * row (written by the pre-visit link or a session workflow) wins; otherwise the
 * level is inferred from the structured signals the record already holds Ã¢â‚¬â€ the
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
  href,
}: {
  patient: PatientDirectoryRow;
  psych: PatientPsychBundle;
  href: string;
}) {
  const previousDiagnosis = mergeTags(psych.intake?.previous_diagnosis).join(", ");
  const previousTherapy = mergeTags(psych.intake?.previous_therapy_history).join(", ");

  return (
    <OverviewCard
      icon={Stethoscope}
      title="Clinical context"
      action={
        <Button asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[12px]">
          <Link href={href}>
            View intake
            <ChevronRight aria-hidden="true" className="size-3.5" />
          </Link>
        </Button>
      }
    >
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

function CarePlanSnapshotCard({
  carePlan,
  href,
}: {
  carePlan: PsychCarePlan | null;
  href: string;
}) {
  const therapy = parseList(carePlan?.intervention_plan)[0] ?? null;
  const goal = carePlan?.therapy_goals?.split("\n")[0]?.trim() || null;

  return (
    <OverviewCard
      icon={Target}
      title="Care plan"
      action={
        <Button asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[12px]">
          <Link href={href}>
            Open
            <ChevronRight aria-hidden="true" className="size-3.5" />
          </Link>
        </Button>
      }
    >
      <dl className="grid grid-cols-1 gap-3">
        <RecordFact label="Therapy">{therapy}</RecordFact>
        <RecordFact label="Active goal">{goal}</RecordFact>
        <RecordFact label="Follow-up">{carePlan?.follow_up_frequency}</RecordFact>
      </dl>
      {carePlan?.psychiatrist_referral && (
        <div className="mt-3">
          <Badge className="bg-primary/10 text-primary">Referral</Badge>
        </div>
      )}
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
  hrefs,
  className,
}: {
  psych: PatientPsychBundle;
  documents: PatientDocumentView[];
  timezone: string;
  /** Per-kind tab target: clicking an event opens the tab that owns it. */
  hrefs: Record<TimelineEventKind, string>;
  className?: string;
}) {
  const events = buildTimeline(psych, documents, timezone);

  return (
    <OverviewCard icon={History} title="Clinical timeline" className={className}>
      {events.length > 0 ? (
        <ol className="space-y-1">
          {events.map((event) => {
            const Icon = TIMELINE_ICON[event.kind];
            return (
              <li key={event.id}>
                <Link
                  href={hrefs[event.kind]}
                  className="group -mx-2 flex items-start gap-3 rounded-control px-2 py-1.5 transition-colors hover:bg-app"
                >
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-pill bg-app text-text-secondary group-hover:bg-surface">
                    <Icon aria-hidden="true" className="size-3" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium text-text-primary">
                      {event.label}
                    </span>
                    {event.detail && (
                      <span className="block truncate text-[11.5px] text-text-muted">
                        {event.detail}
                      </span>
                    )}
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="mt-2 size-3.5 shrink-0 text-text-muted/40 transition-colors group-hover:text-primary"
                  />
                  <time className="mt-1 shrink-0 text-[11px] text-ink-faint">
                    {event.dateLabel}
                  </time>
                </Link>
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

/** Select value for a library template (templates and built-ins share one picker). */
const TEMPLATE_PREFIX = "tmpl:";

function templateValue(template: AssessmentTemplate): string {
  return `${TEMPLATE_PREFIX}${template.id}`;
}

/** The published band a raw score falls in, or "" when nothing matches. */
function severityForBuiltIn(type: string, score: number | null): string {
  if (score === null) return "";
  const instrument = ASSESSMENT_LIBRARY[type];
  if (!instrument || instrument.bands.length === 0) return "";
  for (const band of instrument.bands) {
    if (score <= band.upTo) return band.label;
  }
  return instrument.bands[instrument.bands.length - 1]?.label ?? "";
}

/**
 * Severity autofill for the whole picker: library templates (migration 0085)
 * resolve through their stored scoring bands, built-ins through the bank above.
 */
function severityForChoice(type: string, templates: AssessmentTemplate[], score: number | null): string {
  if (score === null) return "";
  if (type.startsWith(TEMPLATE_PREFIX)) {
    const template = templates.find((t) => templateValue(t) === type);
    if (!template) return "";
    return severityFromBands(template.scoring.bands, score) ?? "";
  }
  return severityForBuiltIn(type, score);
}

function PsychometricsTab({
  patientId,
  psych,
  canManage,
  whatsappNumber,
  templates = [],
}: {
  patientId: string;
  psych: PatientPsychBundle;
  canManage: boolean;
  whatsappNumber: string | null;
  templates?: AssessmentTemplate[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [type, setType] = useState("PHQ-9");
  const [score, setScore] = useState("");
  const [severity, setSeverity] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [raterType, setRaterType] = useState<AssessmentRaterType>("SELF");
  const [raterName, setRaterName] = useState("");

  const selectedTemplate = type.startsWith(TEMPLATE_PREFIX)
    ? (templates.find((t) => templateValue(t) === type) ?? null)
    : null;
  const instrument = ASSESSMENT_LIBRARY[type] ?? ASSESSMENT_LIBRARY.Other;
  const max = selectedTemplate ? templateMaxScore(selectedTemplate.scoring) : instrument.max;

  /** Template lookup for the trend rows below (template_id â†’ template). */
  const templateById = useCallback(
    (id: string | null | undefined) =>
      id ? (templates.find((t) => t.id === id) ?? null) : null,
    [templates],
  );

  function changeType(next: string) {
    setType(next);
    setSeverity(severityForChoice(next, templates, score === "" ? null : Number(score)));
  }

  function changeScore(next: string) {
    setScore(next);
    setSeverity(severityForChoice(type, templates, next === "" ? null : Number(next)));
  }

  async function addAssessment() {
    if (!canManage) return;
    setPending(true);
    const result = await savePsychAssessmentAction(patientId, {
      assessment_type: selectedTemplate ? selectedTemplate.name : type,
      template_id: selectedTemplate?.id ?? null,
      score: score === "" ? null : Number(score),
      severity: severity || null,
      conducted_at: date || null,
      notes: notes || null,
      rater_type: raterType,
      rater_name: raterName || null,
    });
    setPending(false);
    if (result.ok) {
      toast.success("Assessment recorded");
      setScore("");
      setSeverity("");
      setDate("");
      setNotes("");
      setRaterType("SELF");
      setRaterName("");
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

  const selectOptions = [
    ...ASSESSMENT_TYPES.map((key) => ({
      value: key,
      label:
        key === "Other"
          ? "Other"
          : `${ASSESSMENT_LIBRARY[key].label} (/${ASSESSMENT_LIBRARY[key].max})`,
    })),
    ...templates.map((t) => ({
      value: templateValue(t),
      label: `${t.name} (/${templateMaxScore(t.scoring)})`,
    })),
  ];

  return (
    <div className="space-y-4">
      <RecordSection title="Score history">
        {psych.assessments.length > 0 ? (
          <div className="space-y-3">
            <TrendChart assessments={psych.assessments} templates={templates} />
            {psych.assessments.map((a) => (
              <AssessmentTrendRow
                key={a.id}
                assessment={a}
                canManage={canManage}
                onDelete={removeAssessment}
                template={templateById(a.template_id)}
              />
            ))}
          </div>
        ) : (
          <RecordEmpty
            icon={TrendingUp}
            title="No assessments on file"
            description="Log a standard instrument (PHQ-9, GAD-7, BDI-II, PCL-5) or a clinic library template to track score history and trends."
          />
        )}
      </RecordSection>

      <LongitudinalSummaryCard
        patientId={patientId}
        assessmentCount={psych.assessments.filter((a) => a.score !== null).length}
        canManage={canManage}
      />

      <AssessmentScheduleCard
        patientId={patientId}
        canManage={canManage}
        templates={templates.filter(canSendOnline)}
        hasWhatsappNumber={Boolean(whatsappNumber)}
      />

      <RaterComparisonCard assessments={psych.assessments} templates={templates} />

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
                {selectOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-ink mb-1.5 text-[12.5px] font-bold">Score</p>
              <input
                type="number"
                min={0}
                max={max}
                value={score}
                onChange={(e) => changeScore(e.target.value)}
                placeholder={`0–${max}`}
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
            <div>
              <p className="text-ink mb-1.5 text-[12.5px] font-bold">Respondent</p>
              <select
                value={raterType}
                onChange={(e) => setRaterType(e.target.value as AssessmentRaterType)}
                className="w-full rounded-control border border-text-muted/25 bg-surface px-2 py-1.5 text-[12.5px] text-text-primary outline-none"
              >
                {ASSESSMENT_RATERS.map((rater) => (
                  <option key={rater.value} value={rater.value}>
                    {rater.label}
                  </option>
                ))}
              </select>
            </div>
            {raterType !== "SELF" && raterType !== "CLINICIAN" && (
              <div>
                <p className="text-ink mb-1.5 text-[12.5px] font-bold">
                  Respondent name <span className="font-normal text-text-muted">(optional)</span>
                </p>
                <input
                  type="text"
                  value={raterName}
                  onChange={(e) => setRaterName(e.target.value)}
                  placeholder="e.g. mother, class teacher"
                  className="w-full rounded-control border border-text-muted/25 bg-surface px-2 py-1.5 text-[12.5px] text-text-primary outline-none"
                />
              </div>
            )}
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
        templates={templates.filter(canSendOnline)}
      />
    </div>
  );
}

function measureLabelFor(key: string, templates: AssessmentTemplate[]): string {
  const template = templates.find((t) => t.name === key);
  if (template) return template.name;
  const validated = getInstrument(key);
  if (validated) return validated.shortName;
  return ASSESSMENT_LIBRARY[key]?.label ?? key;
}

/**
 * Phase 7 — cross-rater comparison. Groups the patient's administrations of one
 * measure by respondent and shows the latest score each rater gave, so a
 * discrepancy (e.g. parent vs teacher) is visible at a glance. Renders nothing
 * until a measure has been answered by more than one respondent.
 */
function RaterComparisonCard({
  assessments,
  templates,
}: {
  assessments: PsychAssessment[];
  templates: AssessmentTemplate[];
}) {
  const groups = useMemo(() => {
    const byKey = new Map<string, Map<AssessmentRaterType, PsychAssessment>>();
    for (const a of assessments) {
      const key = a.instrument_code ?? a.assessment_type;
      const rater = (a.rater_type ?? "SELF") as AssessmentRaterType;
      const map = byKey.get(key) ?? new Map<AssessmentRaterType, PsychAssessment>();
      const existing = map.get(rater);
      if (!existing || new Date(a.conducted_at) >= new Date(existing.conducted_at)) {
        map.set(rater, a);
      }
      byKey.set(key, map);
    }
    return [...byKey.entries()]
      .filter(([, map]) => map.size > 1)
      .map(([key, map]) => ({
        key,
        label: measureLabelFor(key, templates),
        rows: ASSESSMENT_RATERS.map((rater) => ({
          rater: rater.value,
          label: rater.label,
          assessment: map.get(rater.value),
        })).filter(
          (
            row,
          ): row is {
            rater: AssessmentRaterType;
            label: string;
            assessment: PsychAssessment;
          } => row.assessment !== undefined,
        ),
      }));
  }, [assessments, templates]);

  const [selectedKey, setSelectedKey] = useState<string>("");
  useEffect(() => {
    if (groups.length > 0 && !groups.some((group) => group.key === selectedKey)) {
      setSelectedKey(groups[0].key);
    }
  }, [groups, selectedKey]);

  if (groups.length === 0) return null;
  const group = groups.find((entry) => entry.key === selectedKey) ?? groups[0];

  const scores = group.rows
    .map((row) => row.assessment.score)
    .filter((score): score is number => score !== null);
  const range = scores.length > 1 ? Math.max(...scores) - Math.min(...scores) : null;

  return (
    <RecordSection title="Multi-rater comparison">
      <p className="text-text-muted mb-3 text-[12.5px] leading-relaxed">
        The same measure answered by different respondents. Differences between raters can be
        clinically meaningful — for example a parent versus a teacher in child cases.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label htmlFor="rater-compare-measure" className="text-ink text-[12.5px] font-bold">
          Measure
        </label>
        <select
          id="rater-compare-measure"
          value={group.key}
          onChange={(event) => setSelectedKey(event.target.value)}
          className="rounded-control border border-text-muted/25 bg-surface px-2 py-1.5 text-[12.5px] text-text-primary outline-none"
        >
          {groups.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
            </option>
          ))}
        </select>
        {range !== null && (
          <span className="bg-app text-text-secondary rounded-pill px-2 py-0.5 text-[11px] font-semibold">
            Range: {range} pts
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-control border border-text-muted/15">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[12.5px]">
          <thead className="bg-app text-text-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Respondent</th>
              <th className="px-3 py-2 font-semibold">Score</th>
              <th className="px-3 py-2 font-semibold">Severity</th>
              <th className="px-3 py-2 font-semibold">Date</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row) => (
              <tr key={row.rater} className="border-t border-text-muted/10">
                <td className="text-ink px-3 py-2 font-medium">
                  {row.label}
                  {row.assessment.rater_name ? ` · ${row.assessment.rater_name}` : ""}
                </td>
                <td className="text-text-primary px-3 py-2">{row.assessment.score ?? "—"}</td>
                <td className="text-text-secondary px-3 py-2">{row.assessment.severity ?? "—"}</td>
                <td className="text-text-muted px-3 py-2">
                  {formatShortDate(row.assessment.conducted_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </RecordSection>
  );
}

function AssessmentScheduleCard({
  patientId,
  canManage,
  templates,
  hasWhatsappNumber,
}: {
  patientId: string;
  canManage: boolean;
  templates: AssessmentTemplate[];
  hasWhatsappNumber: boolean;
}) {
  const router = useRouter();
  const [rules, setRules] = useState<AssessmentScheduleRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const defaultChoice = ASSESSMENT_TYPES.filter((key) => key !== "Other")[0] ?? "";
  const [choice, setChoice] = useState<string>(defaultChoice);
  const [cadence, setCadence] = useState("2");
  const [unit, setUnit] = useState<"days" | "weeks">("weeks");

  const optionList = [
    ...ASSESSMENT_TYPES.filter((key) => key !== "Other").map((key) => ({
      value: key,
      label: ASSESSMENT_LIBRARY[key].label,
    })),
    ...templates.map((t) => ({ value: templateValue(t), label: t.name })),
  ];

  const load = useCallback(async () => {
    const result = await listAssessmentScheduleRulesAction(patientId);
    if (result.ok) setRules(result.data);
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  function labelFor(rule: AssessmentScheduleRule): string {
    if (rule.template_id) {
      return (
        templates.find((t) => t.id === rule.template_id)?.name ??
        rule.assessment_type ??
        "Assessment"
      );
    }
    return rule.assessment_type
      ? (ASSESSMENT_LIBRARY[rule.assessment_type]?.label ?? rule.assessment_type)
      : "Assessment";
  }

  async function addRule() {
    const n = Number(cadence);
    if (!Number.isFinite(n) || n < 1) {
      toast.error("Enter a cadence of at least 1.");
      return;
    }
    const cadenceDays = Math.round(unit === "weeks" ? n * 7 : n);
    if (cadenceDays > 365) {
      toast.error("Cadence can be at most 365 days.");
      return;
    }
    const isTemplate = choice.startsWith(TEMPLATE_PREFIX);
    setPending(true);
    const result = await createAssessmentScheduleRuleAction({
      patientId,
      assessmentType: isTemplate ? null : choice,
      templateId: isTemplate ? choice.slice(TEMPLATE_PREFIX.length) : null,
      cadenceDays,
    });
    setPending(false);
    if (result.ok) {
      toast.success("Reminder scheduled");
      setRules((prev) => [result.data, ...prev]);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function toggleRule(rule: AssessmentScheduleRule) {
    const result = await setAssessmentScheduleRuleActiveAction(rule.id, !rule.active);
    if (result.ok) {
      setRules((prev) => prev.map((r) => (r.id === rule.id ? result.data : r)));
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function removeRule(id: string) {
    const result = await deleteAssessmentScheduleRuleAction(id);
    if (result.ok) {
      setRules((prev) => prev.filter((r) => r.id !== id));
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <RecordSection title="Recurring assessments">
      <p className="text-text-muted mb-3 text-[12.5px] leading-relaxed">
        Automatically send a fresh invite on a schedule so scores can be tracked over time.
      </p>
      {!hasWhatsappNumber && (
        <p className="mb-3 text-[12px] font-semibold text-status-destructive">
          This patient has no WhatsApp number — reminders are created but won&apos;t be delivered
          until one is added.
        </p>
      )}

      {loading ? (
        <div className="text-text-muted flex items-center gap-2 text-[12.5px]">
          <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> Loading…
        </div>
      ) : rules.length > 0 ? (
        <ul className="space-y-2">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="bg-app flex flex-wrap items-center justify-between gap-2 rounded-control border border-text-muted/15 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-ink text-[12.5px] font-bold">{labelFor(rule)}</p>
                <p className="text-text-muted text-[11.5px]">
                  Every {rule.cadence_days} day{rule.cadence_days === 1 ? "" : "s"}
                  {rule.active && rule.next_run_at
                    ? ` · next ${formatShortDate(rule.next_run_at)}`
                    : " · paused"}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {canManage && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleRule(rule)}
                    >
                      {rule.active ? "Pause" : "Resume"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove reminder"
                      onClick={() => removeRule(rule.id)}
                    >
                      <Trash2 aria-hidden="true" className="size-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-text-muted text-[12.5px]">No recurring assessments yet.</p>
      )}

      {canManage && optionList.length > 0 && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[160px] flex-1">
            <p className="text-ink mb-1.5 text-[12.5px] font-bold">Assessment</p>
            <select
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              className="w-full rounded-control border border-text-muted/25 bg-surface px-2 py-1.5 text-[12.5px] text-text-primary outline-none"
            >
              {optionList.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="w-[90px]">
            <p className="text-ink mb-1.5 text-[12.5px] font-bold">Repeat every</p>
            <input
              type="number"
              min={1}
              max={365}
              value={cadence}
              onChange={(e) => setCadence(e.target.value)}
              className="w-full rounded-control border border-text-muted/25 bg-surface px-2 py-1.5 text-[12.5px] text-text-primary outline-none"
            />
          </div>
          <div className="w-[110px]">
            <p className="text-ink mb-1.5 text-[12.5px] font-bold">Unit</p>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as "days" | "weeks")}
              className="w-full rounded-control border border-text-muted/25 bg-surface px-2 py-1.5 text-[12.5px] text-text-primary outline-none"
            >
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
            </select>
          </div>
          <Button type="button" size="sm" onClick={addRule} disabled={pending} className="gap-1.5">
            {pending ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <CalendarClock aria-hidden="true" className="size-3.5" />
            )}
            {pending ? "Saving…" : "Schedule"}
          </Button>
        </div>
      )}
    </RecordSection>
  );
}

function AssessmentTrendRow({ assessment, canManage, onDelete, template }: { assessment: PsychAssessment; canManage: boolean; onDelete: (id: string) => void; template?: AssessmentTemplate | null }) {
  const meta = ASSESSMENT_LIBRARY[assessment.assessment_type] ?? ASSESSMENT_LIBRARY.Other;
  const max = template ? templateMaxScore(template.scoring) : meta.max;
  const pct = assessment.score === null ? 0 : Math.min(100, Math.round((assessment.score / max) * 100));
  const [showResponses, setShowResponses] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [aiResult, setAiResult] = useState<{ interpretation: string; source: "ai" | "rule" } | null>(null);

  const canInterpret = assessment.score !== null;

  async function interpret() {
    if (interpreting) return;
    setInterpreting(true);
    const result = await generateAssessmentInterpretationAction(assessment.id);
    setInterpreting(false);
    if (result.ok) {
      setAiResult(result.data);
    } else {
      toast.error(result.message);
    }
  }

  // Item-level answers only exist for online submissions (0080). Map them back
  // to the question text â€” the library template's stored questions when the
  // assessment carries a template_id (0085), else the instrument bank.
  const responses =
    template && assessment.answers
      ? template.questions
          .filter((q) => q.type !== "text")
          .map((q) => ({ text: q.text, value: assessment.answers?.[q.id] }))
      : isPsychometricKey(assessment.assessment_type)
        ? PSYCHOMETRIC_INSTRUMENTS[assessment.assessment_type].items.map((item) => ({
            text: item.text,
            value: assessment.answers?.[item.id],
          }))
        : [];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        <div className="w-24 shrink-0 sm:w-28">
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
        <div className="w-28 min-w-0 shrink text-right sm:w-40">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {assessment.severity && <span className="text-[11.5px] font-medium text-text-secondary">{assessment.severity}</span>}
            <CompletedByBadge value={assessment.completed_by} />
            {assessment.rater_type && assessment.rater_type !== "SELF" && (
              <span className="rounded-pill bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold text-primary">
                {raterLabel(assessment.rater_type)}
                {assessment.rater_name ? ` · ${assessment.rater_name}` : ""}
              </span>
            )}
          </div>
          {assessment.notes && <p className="truncate text-[11px] text-ink-faint" title={assessment.notes}>{assessment.notes}</p>}
          <div className="mt-0.5 flex flex-wrap items-center justify-end gap-2">
            {responses.length > 0 && (
              <button
                type="button"
                onClick={() => setShowResponses((v) => !v)}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                {showResponses ? "Hide responses" : "View responses"}
              </button>
            )}
            {canInterpret && (
              <button
                type="button"
                onClick={interpret}
                disabled={interpreting}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-60"
              >
                {interpreting ? (
                  <Loader2 aria-hidden="true" className="size-3 animate-spin" />
                ) : (
                  <Sparkles aria-hidden="true" className="size-3" />
                )}
                {interpreting ? "Interpreting…" : aiResult ? "Re-interpret" : "AI interpretation"}
              </button>
            )}
          </div>
        </div>
        {canManage && (
          <Button type="button" variant="ghost" size="sm" aria-label="Delete assessment" className="text-status-destructive" onClick={() => onDelete(assessment.id)}>
            <Trash2 aria-hidden="true" className="size-3.5" />
          </Button>
        )}
      </div>

      {showResponses && responses.length > 0 && (
        <ul className="ml-0 space-y-1 rounded-control bg-app p-2.5 sm:ml-28">
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

      {aiResult && (
        <div className="ml-0 rounded-control border border-primary/20 bg-primary/5 p-2.5 sm:ml-28">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-primary">
            <Sparkles aria-hidden="true" className="size-3" />
            {aiResult.source === "ai" ? "AI interpretation" : "Template interpretation"}
          </p>
          <p className="mt-1 whitespace-pre-line text-[11.5px] leading-relaxed text-text-secondary">
            {aiResult.interpretation}
          </p>
          <p className="mt-1.5 text-[10px] text-ink-faint">
            Generated guidance — review before use. Not a diagnosis.
          </p>
        </div>
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
