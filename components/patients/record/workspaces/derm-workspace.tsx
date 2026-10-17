/**
 * Dermatology workspace — the Dermatologist's patient record tabs (migration
 * 0077). Replaces the general record's tab group for doctors whose specialty
 * resolves to `dermatology`.
 *
 * Clinical information architecture follows
 * `docs/MedBookAI_Dermatology_Master_Implementation_Prompt.md`:
 *   Overview & History · Examination & Diagnosis · Photos & Body Map ·
 *   Procedures · Prescriptions · Documents.
 *
 * Skin photos live in the patient's Documents (their upload bucket already
 * exists); the Photos tab renders those images and tags them — body region,
 * baseline / follow-up / post-treatment, before-after pairing and lesion notes
 * — in `derm_photos` rather than owning files.
 *
 * The workspace only wires up what the backend actually supports. Capabilities
 * that need schema/service work (persisted body-map pins, coded terminology
 * search, specimen tracking, encounter-scoped visits) are reported as gaps, not
 * faked here.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarDays,
  Camera,
  ChevronRight,
  History,
  Loader2,
  Pill,
  Scissors,
  Stethoscope,
  TriangleAlert,
} from "lucide-react";

import { ConfirmDeleteButton } from "@/components/patients/record/workspaces/confirm-delete";
import {
  DermBodyMap,
  DermScoringTools,
} from "@/components/patients/record/workspaces/derm-body-map";
import { DermPhotosTab } from "@/components/patients/record/workspaces/derm-photos-tab";
import {
  AutosaveNote,
  ChipPicker,
  NoteStatus,
  SelectNote,
  SpecialtyHeading,
  type NoteState,
} from "@/components/patients/record/workspaces/specialty-form";
import {
  RecordEmpty,
  RecordFact,
  RecordNote,
  RecordSection,
} from "@/components/patients/record/record-primitives";
import { CopilotDrawer } from "@/components/consultation/copilot-drawer";
import { DocumentsTab } from "@/components/patients/record/documents-tab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteDermExamAction,
  deleteDermProcedureAction,
  saveDermExamAction,
  saveDermProcedureAction,
  saveDermProfileAction,
  saveDermRxAction,
} from "@/lib/actions/specialty-workspaces";
import type {
  DermNoteExtraction,
  WorkspaceExtraction,
} from "@/lib/copilot/types";
import { patientDirectoryHref } from "@/lib/patient-directory";
import {
  patientDocumentHref,
  type PatientDocumentView,
} from "@/lib/patient-documents-queries";
import { cn } from "@/lib/utils";
import type { PatientDermBundle } from "@/lib/patient-record";
import { DERMATOLOGY_WORKSPACE } from "@/lib/specialty-workspaces";
import type {
  DermExam,
  DermPrescription,
  DermProcedure,
  PatientDirectoryRow,
} from "@/types/database";

type Props = {
  patient: PatientDirectoryRow;
  derm: PatientDermBundle;
  documents: PatientDocumentView[];
  activeTab: string;
  canManage: boolean;
  params: { selectedId: string };
  timezone: string;
};

export function DermWorkspace({
  patient,
  derm,
  documents,
  activeTab,
  canManage,
  params,
  timezone,
}: Props) {
  return (
    <div className="space-y-4">
      {activeTab === "derm_overview" && (
        <SkinOverviewTab
          patient={patient}
          derm={derm}
          canManage={canManage}
          params={params}
        />
      )}
      {activeTab === "derm_exam" && (
        <ExamTab
          patient={patient}
          derm={derm}
          canManage={canManage}
          documents={documents}
          params={params}
        />
      )}
      {activeTab === "derm_photos" && (
        <DermPhotosTab
          patient={patient}
          derm={derm}
          documents={documents}
          canManage={canManage}
          params={params}
        />
      )}
      {activeTab === "derm_procedures" && (
        <ProceduresTab patient={patient} derm={derm} canManage={canManage} />
      )}
      {activeTab === "derm_rx" && (
        <RxTab patient={patient} derm={derm} canManage={canManage} />
      )}
      {activeTab === "derm_documents" && (
        <DocumentsTab
          patientId={patient.id}
          documents={documents}
          timezone={timezone}
          canManage={canManage}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Overview & History                                                        */
/* ------------------------------------------------------------------------- */

function SkinOverviewTab({
  patient,
  derm,
  canManage,
  params,
}: {
  patient: PatientDirectoryRow;
  derm: PatientDermBundle;
  canManage: boolean;
  params: { selectedId: string };
}) {
  const profile = derm.profile;
  const latestExam = derm.exams[0] ?? null;
  const latestProcedure = derm.procedures[0] ?? null;
  const latestRx = derm.prescriptions[0] ?? null;

  const save =
    (field: keyof NonNullable<PatientDermBundle["profile"]>) =>
    (value: string) =>
      saveDermProfileAction(patient.id, { [field]: value }).then((r) => r.ok);

  async function toggleBiopsyAlert(checked: boolean) {
    const result = await saveDermProfileAction(patient.id, {
      biopsy_alert: checked,
    });
    if (result.ok) {
      toast.success(checked ? "Biopsy alert set" : "Biopsy alert cleared");
    } else {
      toast.error(result.message);
    }
  }

  const today = todayIso();
  const todayExam = derm.exams.find((exam) => exam.exam_date === today) ?? null;
  const previousExam =
    derm.exams.find((exam) => exam.id !== todayExam?.id) ?? null;

  const allergies = [
    profile?.drug_allergies?.trim(),
    profile?.topical_allergies?.trim(),
    profile?.allergies?.trim(),
    patient.known_allergies?.trim(),
  ].filter((value): value is string => Boolean(value && value.length > 0));

  const riskFields: Array<{
    field:
      | "drug_allergies"
      | "topical_allergies"
      | "allergies"
      | "current_orals"
      | "current_topicals"
      | "active_conditions"
      | "previous_skin_conditions"
      | "relevant_systemic_history"
      | "family_history"
      | "previous_treatment_history"
      | "biopsy_notes";
    label: string;
  }> = [
    { field: "drug_allergies", label: "Drug allergies" },
    { field: "topical_allergies", label: "Topical / contact allergies" },
    { field: "allergies", label: "Other allergies & sensitivities" },
    { field: "current_orals", label: "Current oral medications" },
    { field: "current_topicals", label: "Current topicals & skincare" },
    { field: "active_conditions", label: "Active conditions" },
    { field: "previous_skin_conditions", label: "Past skin conditions" },
    { field: "relevant_systemic_history", label: "Relevant systemic history" },
    { field: "family_history", label: "Family history" },
    {
      field: "previous_treatment_history",
      label: "Previous treatment history",
    },
    { field: "biopsy_notes", label: "Biopsy notes" },
  ];

  const quickActions = [
    { tab: "derm_exam", label: "Record examination", icon: Stethoscope },
    { tab: "derm_photos", label: "Skin photos", icon: Camera },
    { tab: "derm_procedures", label: "Procedures", icon: Scissors },
    { tab: "derm_rx", label: "Prescription & routine", icon: Pill },
  ] as const;

  return (
    <div className="space-y-4">
      {profile?.biopsy_alert && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-card border border-status-warning/40 bg-status-warning/10 p-3"
        >
          <Stethoscope
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-status-warning"
          />
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold text-text-primary">
              Biopsy follow-up alert
            </p>
            <p className="text-[11.5px] text-text-secondary">
              {profile.biopsy_notes?.trim() ||
                "A biopsy is pending review for this patient."}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {quickActions.map(({ tab, label, icon: Icon }) => (
          <Button
            key={tab}
            asChild
            variant="outline"
            size="sm"
            className="h-auto justify-start gap-2 py-2.5"
          >
            <Link
              href={patientDirectoryHref({
                selectedId: params.selectedId,
                tab,
              })}
              scroll={false}
            >
              <Icon aria-hidden="true" className="size-4 text-primary" />
              <span className="text-left text-[12.5px]">{label}</span>
            </Link>
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <RecordSection title="Patient snapshot">
          <dl className="grid grid-cols-1 gap-3">
            <RecordFact label="Name">{patient.name}</RecordFact>
            <RecordFact label="Patient ID">{patient.patient_code}</RecordFact>
            <RecordFact label="Date of birth">
              {patient.date_of_birth}
            </RecordFact>
            <RecordFact label="Sex">{patient.gender}</RecordFact>
            <RecordFact label="Phone">{patient.phone}</RecordFact>
            <RecordFact label="Blood group">{patient.blood_group}</RecordFact>
          </dl>
          <div className="mt-4 border-t border-hairline pt-3">
            <SelectNote
              label="Fitzpatrick skin type"
              name="derm-fitzpatrick"
              value={profile?.fitzpatrick_type ?? null}
              options={FITZPATRICK_TYPES}
              onSave={canManage ? save("fitzpatrick_type") : async () => true}
              disabled={!canManage}
              placeholder="Not recorded"
              helper="Laser & chemical-peel safety classification."
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="text-ink flex items-center gap-2 text-[12.5px] font-bold">
              <input
                type="checkbox"
                checked={profile?.biopsy_alert ?? false}
                onChange={(event) =>
                  canManage && toggleBiopsyAlert(event.target.checked)
                }
                disabled={!canManage}
                className="size-4 accent-[var(--color-primary)]"
              />
              <Stethoscope aria-hidden="true" className="size-4 text-primary" />
              Biopsy alert
            </label>
            {profile?.biopsy_alert && (
              <Badge className="bg-status-warning/15 text-status-warning">
                Biopsy pending
              </Badge>
            )}
          </div>
        </RecordSection>

        <RecordSection
          title="Today's complaint & HPI"
          meta={<span className="text-ink-faint text-[11px]">{today}</span>}
        >
          <DermComplaintCard
            patient={patient}
            todayExam={todayExam}
            previousExam={previousExam}
            canManage={canManage}
          />
        </RecordSection>

        <RecordSection title="Risks, allergies & history">
          <div
            className={cn(
              "rounded-card border p-2.5",
              allergies.length > 0
                ? "border-status-destructive/40 bg-status-destructive/5"
                : "border-hairline bg-app/60",
            )}
          >
            <p
              className={cn(
                "flex items-center gap-1.5 text-[11.5px] font-bold",
                allergies.length > 0
                  ? "text-status-destructive"
                  : "text-text-secondary",
              )}
            >
              <TriangleAlert aria-hidden="true" className="size-3.5" />
              Allergy alert
            </p>
            {allergies.length > 0 ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11.5px] text-text-primary">
                {allergies.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-faint mt-1 text-[11.5px]">
                No allergies recorded.
              </p>
            )}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3">
            {riskFields.map(({ field, label }) => (
              <AutosaveNote
                key={field}
                label={label}
                name={`derm-profile-${field}`}
                value={profile?.[field] ?? null}
                onSave={canManage ? save(field) : async () => true}
                rows={2}
              />
            ))}
          </div>
        </RecordSection>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecordSection
          title="Latest examination"
          meta={
            latestExam && (
              <Link
                href={patientDirectoryHref({
                  selectedId: params.selectedId,
                  tab: "derm_exam",
                })}
                scroll={false}
                className="flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
              >
                All examinations
                <ChevronRight aria-hidden="true" className="size-3" />
              </Link>
            )
          }
        >
          {latestExam ? (
            <ExamSummary exam={latestExam} />
          ) : (
            <RecordNote label="Status" value="No examination recorded yet." />
          )}
        </RecordSection>

        <RecordSection
          title="Latest procedure"
          meta={
            latestProcedure && (
              <Link
                href={patientDirectoryHref({
                  selectedId: params.selectedId,
                  tab: "derm_procedures",
                })}
                scroll={false}
                className="flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
              >
                All procedures
                <ChevronRight aria-hidden="true" className="size-3" />
              </Link>
            )
          }
        >
          {latestProcedure ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-text-primary">
                {latestProcedure.procedure_name}
              </p>
              <p className="text-ink-faint flex items-center gap-1 text-[11px]">
                <CalendarDays aria-hidden="true" className="size-3.5" />
                {latestProcedure.procedure_date}
              </p>
              <RecordNote label="Notes" value={latestProcedure.notes} />
            </div>
          ) : (
            <RecordNote label="Status" value="No procedure recorded yet." />
          )}
        </RecordSection>
      </div>

      <RecordSection
        title="Latest prescription & routine"
        meta={
          latestRx && (
            <Link
              href={patientDirectoryHref({
                selectedId: params.selectedId,
                tab: "derm_rx",
              })}
              scroll={false}
              className="flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
            >
              Open prescription
              <ChevronRight aria-hidden="true" className="size-3" />
            </Link>
          )
        }
      >
        {latestRx ? (
          <RxSummary rx={latestRx} />
        ) : (
          <RecordNote
            label="Status"
            value="No dermatology prescription recorded yet."
          />
        )}
      </RecordSection>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Overview & History — quick chips, today's encounter + copy-forward        */
/* ------------------------------------------------------------------------- */

const FITZPATRICK_TYPES = [
  "Type I",
  "Type II",
  "Type III",
  "Type IV",
  "Type V",
  "Type VI",
] as const;

const CHIEF_COMPLAINT_OPTIONS = [
  "Acne",
  "Eczema flare",
  "Hair loss",
  "Rash",
  "Mole check",
  "Pigmentation",
] as const;
const DURATION_OPTIONS = ["Days", "Weeks", "Months", "Years"] as const;
const SEVERITY_OPTIONS = ["Mild", "Moderate", "Severe"] as const;
const TRIGGER_OPTIONS = [
  "Sun exposure",
  "New skincare",
  "Stress",
  "Diet",
  "Seasonal change",
] as const;
const SYMPTOM_OPTIONS = [
  "Itching",
  "Pain",
  "Bleeding",
  "Scaling",
  "Burning",
] as const;

/** Local calendar date (YYYY-MM-DD) — matches how visit days are recorded. */
function todayIso(): string {
  return new Date().toLocaleDateString("en-CA");
}

type EncounterFields = {
  chief_complaints: string[];
  morphology: string[];
  distribution: string;
  diagnosis: string;
  icd_code: string;
  notes: string;
  duration: string;
  severity: string;
  triggers: string[];
  associated_symptoms: string[];
  hpi: string;
};

/**
 * The whole encounter row, so a Tab 1 save carries Tab 2's fields through
 * unchanged instead of clearing them.
 */
function encounterFields(exam: DermExam | null): EncounterFields {
  return {
    chief_complaints: exam?.chief_complaints ?? [],
    morphology: exam?.morphology ?? [],
    distribution: exam?.distribution ?? "",
    diagnosis: exam?.diagnosis ?? "",
    icd_code: exam?.icd_code ?? "",
    notes: exam?.notes ?? "",
    duration: exam?.duration ?? "",
    severity: exam?.severity ?? "",
    triggers: exam?.triggers ?? [],
    associated_symptoms: exam?.associated_symptoms ?? [],
    hpi: exam?.hpi ?? "",
  };
}

/**
 * "Today's complaint" — the Tab 1 quick-chip capture (chief complaint, duration,
 * severity, triggers, associated symptoms, HPI) written to today's `derm_exams`
 * encounter row. Autosaves on each chip tap; a follow-up can carry the previous
 * visit's complaint forward, which stays a visible draft until the clinician
 * changes something (or presses the explicit save).
 */
function DermComplaintCard({
  patient,
  todayExam,
  previousExam,
  canManage,
}: {
  patient: PatientDirectoryRow;
  todayExam: DermExam | null;
  previousExam: DermExam | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [rowId, setRowId] = useState<string | null>(todayExam?.id ?? null);
  const [fields, setFields] = useState<EncounterFields>(() =>
    encounterFields(todayExam),
  );
  const [status, setStatus] = useState<NoteState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [carriedFrom, setCarriedFrom] = useState<string | null>(null);

  function persist(patch: Partial<EncounterFields>) {
    if (!canManage) return;
    const next = { ...fields, ...patch };
    setFields(next);
    setStatus("saving");
    setMessage(null);
    void saveDermExamAction(patient.id, {
      id: rowId ?? "",
      chief_complaints: next.chief_complaints,
      morphology: next.morphology,
      distribution: next.distribution,
      diagnosis: next.diagnosis,
      icd_code: next.icd_code,
      notes: next.notes,
      duration: next.duration,
      severity: next.severity,
      triggers: next.triggers,
      associated_symptoms: next.associated_symptoms,
      hpi: next.hpi,
    }).then((result) => {
      if (result.ok) {
        setRowId(result.data);
        setStatus("saved");
        setCarriedFrom(null);
        router.refresh();
      } else {
        setStatus("error");
        setMessage(result.message);
      }
    });
  }

  function carryForward() {
    if (!previousExam) return;
    const prior = encounterFields(previousExam);
    setFields((current) => ({
      ...current,
      chief_complaints: prior.chief_complaints,
      duration: prior.duration,
      severity: prior.severity,
      triggers: prior.triggers,
      associated_symptoms: prior.associated_symptoms,
      hpi: prior.hpi,
    }));
    setCarriedFrom(previousExam.exam_date);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-ink-faint text-[11px]">
          {todayExam
            ? "Saved against today's encounter."
            : "New encounter — the first save creates today's record."}
        </p>
        <NoteStatus state={status} message={message} />
      </div>

      <ChipPicker
        label="Chief complaint"
        options={CHIEF_COMPLAINT_OPTIONS}
        value={fields.chief_complaints}
        onChange={(next) => persist({ chief_complaints: next })}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ChipPicker
          label="Duration"
          single
          options={DURATION_OPTIONS}
          value={fields.duration ? [fields.duration] : []}
          onChange={(next) => persist({ duration: next[0] ?? "" })}
        />
        <ChipPicker
          label="Severity"
          single
          options={SEVERITY_OPTIONS}
          value={fields.severity ? [fields.severity] : []}
          onChange={(next) => persist({ severity: next[0] ?? "" })}
        />
      </div>

      <ChipPicker
        label="Triggers"
        options={TRIGGER_OPTIONS}
        value={fields.triggers}
        onChange={(next) => persist({ triggers: next })}
      />

      <ChipPicker
        label="Associated symptoms"
        options={SYMPTOM_OPTIONS}
        value={fields.associated_symptoms}
        onChange={(next) => persist({ associated_symptoms: next })}
      />

      <div>
        <label
          htmlFor="derm-hpi"
          className="text-ink mb-1.5 block text-[12.5px] font-bold"
        >
          History of present illness
        </label>
        <Textarea
          id="derm-hpi"
          rows={3}
          value={fields.hpi}
          onChange={(event) =>
            setFields((current) => ({ ...current, hpi: event.target.value }))
          }
          onBlur={(event) => persist({ hpi: event.currentTarget.value })}
          placeholder="Onset, progression, prior treatments, relevant background…"
          disabled={!canManage}
        />
      </div>

      {previousExam && (
        <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={carryForward}
            disabled={!canManage}
          >
            <History aria-hidden="true" className="size-3.5" />
            Copy previous history
          </Button>
          {carriedFrom && (
            <span className="text-[11px] font-medium text-status-warning">
              Carried forward from {carriedFrom} — review, then save.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Examination & Diagnosis                                                   */
/* ------------------------------------------------------------------------- */

const CHIEF_COMPLAINTS = ["Rash", "Itching", "Pain", "Lesion"] as const;
const MORPHOLOGY = ["Macule", "Papule", "Plaque", "Nodule", "Vesicle"] as const;
const DISTRIBUTIONS = ["Localized", "Generalized", "Dermatomal"] as const;

function ExamTab({
  patient,
  derm,
  canManage,
  documents,
  params,
}: {
  patient: PatientDirectoryRow;
  derm: PatientDermBundle;
  canManage: boolean;
  documents: PatientDocumentView[];
  params: { selectedId: string };
}) {
  const router = useRouter();
  const todayExam =
    derm.exams.find((exam) => exam.exam_date === todayIso()) ?? null;
  const [rowId, setRowId] = useState<string | null>(todayExam?.id ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complaints, setComplaints] = useState<string[]>(
    todayExam?.chief_complaints ?? [],
  );
  const [morphology, setMorphology] = useState<string[]>(
    todayExam?.morphology ?? [],
  );
  const [distribution, setDistribution] = useState<string[]>(
    todayExam?.distribution
      ? [
          todayExam.distribution.charAt(0).toUpperCase() +
            todayExam.distribution.slice(1),
        ]
      : [],
  );
  const [diagnosis, setDiagnosis] = useState(todayExam?.diagnosis ?? "");
  const [icdCode, setIcdCode] = useState(todayExam?.icd_code ?? "");
  const [notes, setNotes] = useState(todayExam?.notes ?? "");
  const [duration] = useState(todayExam?.duration ?? "");
  const [severity] = useState(todayExam?.severity ?? "");
  const [triggers] = useState<string[]>(todayExam?.triggers ?? []);
  const [associatedSymptoms] = useState<string[]>(
    todayExam?.associated_symptoms ?? [],
  );
  const [hpi] = useState(todayExam?.hpi ?? "");

  async function addExam() {
    if (!canManage) return;
    const hasClinicalDetail =
      complaints.length > 0 ||
      morphology.length > 0 ||
      distribution.length > 0 ||
      diagnosis.trim().length > 0 ||
      notes.trim().length > 0;
    if (!hasClinicalDetail) {
      setError(
        "Record at least a complaint, morphology, diagnosis or note before saving.",
      );
      return;
    }
    setError(null);
    setPending(true);
    const result = await saveDermExamAction(patient.id, {
      id: rowId ?? "",
      chief_complaints: complaints,
      morphology,
      distribution: distribution[0]?.toLowerCase() ?? "",
      diagnosis,
      icd_code: icdCode,
      notes,
      duration,
      severity,
      triggers,
      associated_symptoms: associatedSymptoms,
      hpi,
    });
    setPending(false);
    if (result.ok) {
      toast.success(rowId ? "Examination updated" : "Examination recorded");
      setRowId(result.data);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function removeExam(id: string) {
    const result = await deleteDermExamAction(id);
    if (result.ok) {
      toast.success("Examination removed");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  /**
   * Lands an ambient/commanded dermatology extraction in the examination form.
   * The chip fields accept a controlled vocabulary, so model output is matched
   * case-insensitively against those options; anything that misses lands in the
   * free-text notes instead of being dropped.
   */
  function handleCopilotPopulate(data: WorkspaceExtraction) {
    const note = data as DermNoteExtraction;
    const match = (raw: string, options: readonly string[]) =>
      options.find(
        (option) => option.toLowerCase() === raw.trim().toLowerCase(),
      ) ?? null;

    const matchedComplaints = note.chief_complaints
      .map((item) => match(item, CHIEF_COMPLAINTS))
      .filter((item): item is string => item !== null);
    const matchedMorphology = note.morphology
      .map((item) => match(item, MORPHOLOGY))
      .filter((item): item is string => item !== null);
    const matchedDistribution = match(note.distribution, DISTRIBUTIONS);

    const unmatched = [
      ...note.chief_complaints.filter((item) => !match(item, CHIEF_COMPLAINTS)),
      ...note.morphology.filter((item) => !match(item, MORPHOLOGY)),
    ];

    const hasAnything =
      matchedComplaints.length > 0 ||
      matchedMorphology.length > 0 ||
      matchedDistribution !== null ||
      note.diagnosis ||
      note.icd10_candidates.length > 0 ||
      note.exam_summary;
    if (!hasAnything) return;

    setComplaints(matchedComplaints);
    setMorphology(matchedMorphology);
    setDistribution(matchedDistribution ? [matchedDistribution] : []);
    setDiagnosis(note.diagnosis);
    setIcdCode(note.icd10_candidates[0]?.toUpperCase() ?? "");

    const noteParts = [
      note.exam_summary,
      note.treatment_summary && `Treatment: ${note.treatment_summary}`,
      note.application_instructions &&
        `Application: ${note.application_instructions}`,
      note.patient_instructions && `Instructions: ${note.patient_instructions}`,
      unmatched.length > 0 && `Additional findings: ${unmatched.join(", ")}`,
    ].filter((part): part is string => Boolean(part && part.trim()));
    if (noteParts.length > 0) setNotes(noteParts.join("\n\n"));
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <RecordSection
              title="Body map & lesion pins"
              className="xl:col-span-2"
            >
              <DermBodyMap
                patientId={patient.id}
                examId={todayExam?.id ?? null}
                lesions={derm.lesions}
                canManage={canManage}
              />
            </RecordSection>

            <RecordSection title="Photos & comparison">
              <DermPhotoStrip
                documents={documents}
                derm={derm}
                params={params}
              />
            </RecordSection>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <RecordSection title="Skin examination" className="xl:col-span-2">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <ChipPicker
                  label="Chief complaint"
                  value={complaints}
                  onChange={setComplaints}
                  options={CHIEF_COMPLAINTS}
                />
                <ChipPicker
                  label="Morphology"
                  value={morphology}
                  onChange={setMorphology}
                  options={MORPHOLOGY}
                />
                <ChipPicker
                  label="Distribution"
                  single
                  value={distribution}
                  onChange={setDistribution}
                  options={DISTRIBUTIONS}
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="derm-exam-diagnosis"
                      className="text-ink mb-1.5 block text-[12.5px] font-bold"
                    >
                      Diagnosis
                    </label>
                    <Input
                      id="derm-exam-diagnosis"
                      value={diagnosis}
                      onChange={(event) => setDiagnosis(event.target.value)}
                      placeholder="e.g. Plaque psoriasis"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="derm-exam-icd"
                      className="text-ink mb-1.5 block text-[12.5px] font-bold"
                    >
                      ICD-10 code
                    </label>
                    <Input
                      id="derm-exam-icd"
                      value={icdCode}
                      onChange={(event) =>
                        setIcdCode(event.target.value.toUpperCase())
                      }
                      placeholder="e.g. L40.0"
                      autoComplete="off"
                      className="font-mono"
                    />
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <label
                  htmlFor="derm-exam-notes"
                  className="text-ink mb-1.5 block text-[12.5px] font-bold"
                >
                  Clinical notes
                </label>
                <Textarea
                  id="derm-exam-notes"
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Lesion size, distribution, dermoscopy findings, patient instructions…"
                />
              </div>
              {error && (
                <p className="mt-2 text-[12px] font-medium text-status-destructive">
                  {error}
                </p>
              )}
              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  onClick={addExam}
                  disabled={pending}
                  className="gap-1.5"
                >
                  {pending ? (
                    <Loader2
                      aria-hidden="true"
                      className="size-3.5 animate-spin"
                    />
                  ) : (
                    <Stethoscope aria-hidden="true" className="size-3.5" />
                  )}
                  {pending
                    ? "Saving…"
                    : rowId
                      ? "Update examination"
                      : "Record examination"}
                </Button>
              </div>
            </RecordSection>

            <RecordSection title="Severity scoring">
              <DermScoringTools
                patientId={patient.id}
                examId={todayExam?.id ?? null}
                scores={todayExam?.severity_scores ?? []}
                canManage={canManage}
              />
            </RecordSection>
          </div>

          <CopilotDrawer
            mode="dermatology"
            contextLabel={`${DERMATOLOGY_WORKSPACE.name} Copilot`}
            workspaceContext={DERMATOLOGY_WORKSPACE.copilotContext}
            patientProfile={{
              allergies: patient.known_allergies || undefined,
              current_meds: patient.current_medications || undefined,
            }}
            onPopulateForm={handleCopilotPopulate}
          />
        </>
      )}

      {derm.exams.length > 0 ? (
        <div className="space-y-3">
          <SpecialtyHeading
            title="Examination history"
            description="Newest first"
          />
          {derm.exams.map((exam) => (
            <ExamRow
              key={exam.id}
              exam={exam}
              canManage={canManage}
              onDelete={removeExam}
            />
          ))}
        </div>
      ) : (
        <RecordEmpty
          icon={Stethoscope}
          title="No examinations yet"
          description="Record each skin examination with chief complaint, morphology, distribution and an ICD-assisted diagnosis."
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Photos & comparison — the gallery itself lives in the Photos & Body Map tab */
/* ------------------------------------------------------------------------- */

function DermPhotoStrip({
  documents,
  derm,
  params,
}: {
  documents: PatientDocumentView[];
  derm: PatientDermBundle;
  params: { selectedId: string };
}) {
  const imageDocs = new Set(
    documents
      .filter((doc) => doc.mime_type.startsWith("image/"))
      .map((doc) => doc.id),
  );
  const tagged = derm.photos
    .filter((photo) => photo.document_id && imageDocs.has(photo.document_id))
    .slice(0, 6);

  return (
    <div className="space-y-3">
      <p className="text-ink-faint text-[11px]">
        Baseline / follow-up tagging and explicit before/after pairing live in
        the Photos & Body Map tab.
      </p>
      {tagged.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-hairline p-4 text-center">
          <Camera aria-hidden="true" className="text-ink-faint size-5" />
          <p className="text-ink-faint mt-2 text-[11.5px]">
            No tagged photos yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {tagged.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.id}
              src={patientDocumentHref(photo.document_id as string)}
              alt={photo.body_region}
              loading="lazy"
              decoding="async"
              className="aspect-square w-full rounded-control border border-hairline object-cover"
            />
          ))}
        </div>
      )}
      <Button asChild variant="outline" size="sm" className="w-full">
        <Link
          href={patientDirectoryHref({
            selectedId: params.selectedId,
            tab: "derm_photos",
          })}
          scroll={false}
        >
          Open Photos & Body Map
        </Link>
      </Button>
    </div>
  );
}

const COMPLAINT_LABEL: Record<string, string> = {
  rash: "Rash",
  itching: "Itching",
  pain: "Pain",
  lesion: "Lesion",
};
const MORPHOLOGY_LABEL: Record<string, string> = {
  macule: "Macule",
  papule: "Papule",
  plaque: "Plaque",
  nodule: "Nodule",
  vesicle: "Vesicle",
};

function ExamSummary({ exam }: { exam: DermExam }) {
  const complaints = exam.chief_complaints.map(
    (c) => COMPLAINT_LABEL[c.toLowerCase()] ?? c,
  );
  const morphology = exam.morphology.map(
    (m) => MORPHOLOGY_LABEL[m.toLowerCase()] ?? m,
  );
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-text-primary">
        {exam.diagnosis || "Examination"}
      </p>
      <p className="text-ink-faint flex items-center gap-1 text-[11px]">
        <CalendarDays aria-hidden="true" className="size-3.5" />
        {exam.exam_date}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {complaints.map((c) => (
          <Badge key={c} className="bg-app text-text-secondary">
            {c}
          </Badge>
        ))}
        {morphology.map((m) => (
          <Badge key={m} className="bg-primary/10 text-primary">
            {m}
          </Badge>
        ))}
        {exam.distribution && (
          <Badge className="bg-status-warning/15 capitalize text-status-warning">
            {exam.distribution}
          </Badge>
        )}
        {exam.icd_code && (
          <span className="text-ink-faint font-mono text-[11px]">
            {exam.icd_code}
          </span>
        )}
      </div>
      <RecordNote label="Notes" value={exam.notes} />
    </div>
  );
}

function ExamRow({
  exam,
  canManage,
  onDelete,
}: {
  exam: DermExam;
  canManage: boolean;
  onDelete: (id: string) => void;
}) {
  const complaints = exam.chief_complaints.map(
    (c) => COMPLAINT_LABEL[c.toLowerCase()] ?? c,
  );
  const morphology = exam.morphology.map(
    (m) => MORPHOLOGY_LABEL[m.toLowerCase()] ?? m,
  );

  return (
    <RecordSection
      title={`${exam.exam_date} — ${exam.diagnosis || "Examination"}`}
      meta={
        canManage && (
          <ConfirmDeleteButton
            ariaLabel="Delete examination"
            title="Delete this examination?"
            description="This permanently removes the examination record entry."
            onConfirm={() => onDelete(exam.id)}
          />
        )
      }
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {complaints.map((c) => (
          <Badge key={c} className="bg-app text-text-secondary">
            {c}
          </Badge>
        ))}
        {morphology.map((m) => (
          <Badge key={m} className="bg-primary/10 text-primary">
            {m}
          </Badge>
        ))}
        {exam.distribution && (
          <Badge className="bg-status-warning/15 capitalize text-status-warning">
            {exam.distribution}
          </Badge>
        )}
        {exam.icd_code && (
          <span className="text-ink-faint font-mono text-[11px]">
            {exam.icd_code}
          </span>
        )}
      </div>
      <div className="mt-2">
        <RecordNote label="Notes" value={exam.notes} />
      </div>
    </RecordSection>
  );
}

/* ------------------------------------------------------------------------- */
/* Procedures                                                                */
/* ------------------------------------------------------------------------- */

const PROCEDURE_PRESETS = [
  "Skin biopsy",
  "Cryotherapy",
  "Chemical peel",
  "Laser procedure",
  "Minor procedure",
] as const;
const CONSENT_OPTIONS = ["Obtained", "Declined", "Documented"] as const;

function ProceduresTab({
  patient,
  derm,
  canManage,
}: {
  patient: PatientDirectoryRow;
  derm: PatientDermBundle;
  canManage: boolean;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(today);
  const [consent, setConsent] = useState<string[]>(["Documented"]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function addProcedure() {
    if (!canManage) return;
    if (!name.trim()) {
      setError("Enter or pick a procedure name.");
      return;
    }
    setError(null);
    setPending(true);
    const result = await saveDermProcedureAction(patient.id, {
      procedure_name: name,
      procedure_date: date,
      consent_status: (consent[0] ?? "Documented").toLowerCase(),
      notes,
    });
    setPending(false);
    if (result.ok) {
      toast.success("Procedure recorded");
      setName("");
      setDate(today);
      setConsent(["Documented"]);
      setNotes("");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function removeProcedure(id: string) {
    const result = await deleteDermProcedureAction(id);
    if (result.ok) {
      toast.success("Procedure removed");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <RecordSection
          title="Record a procedure"
          meta={<Badge className="bg-app text-text-secondary">Logbook</Badge>}
        >
          <div className="mb-3 flex flex-wrap gap-1.5">
            {PROCEDURE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setName(preset)}
                aria-pressed={name === preset}
                className={
                  name === preset
                    ? "rounded-pill border border-primary bg-primary/10 px-2.5 py-1 text-[11.5px] font-semibold text-primary"
                    : "rounded-pill border border-hairline bg-app px-2.5 py-1 text-[11.5px] font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
                }
              >
                {preset}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label
                htmlFor="derm-proc-name"
                className="text-ink mb-1.5 block text-[12.5px] font-bold"
              >
                Procedure name
              </label>
              <Input
                id="derm-proc-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Punch biopsy"
                autoComplete="off"
              />
            </div>
            <div>
              <label
                htmlFor="derm-proc-date"
                className="text-ink mb-1.5 block text-[12.5px] font-bold"
              >
                Date
              </label>
              <Input
                id="derm-proc-date"
                type="date"
                value={date}
                max={today}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            <ChipPicker
              label="Consent"
              single
              value={consent}
              onChange={setConsent}
              options={CONSENT_OPTIONS}
            />
          </div>
          <div className="mt-4">
            <label
              htmlFor="derm-proc-notes"
              className="text-ink mb-1.5 block text-[12.5px] font-bold"
            >
              Notes
            </label>
            <Textarea
              id="derm-proc-notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Site, settings, aftercare, specimen details…"
            />
          </div>
          {error && (
            <p className="mt-2 text-[12px] font-medium text-status-destructive">
              {error}
            </p>
          )}
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={addProcedure}
              disabled={pending}
              className="gap-1.5"
            >
              {pending ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <Scissors aria-hidden="true" className="size-3.5" />
              )}
              {pending ? "Saving…" : "Record procedure"}
            </Button>
          </div>
        </RecordSection>
      )}

      {derm.procedures.length > 0 ? (
        <div className="space-y-3">
          <SpecialtyHeading
            title="Procedure history"
            description="Newest first"
          />
          {derm.procedures.map((procedure) => (
            <ProcedureRow
              key={procedure.id}
              procedure={procedure}
              canManage={canManage}
              onDelete={removeProcedure}
            />
          ))}
        </div>
      ) : (
        <RecordEmpty
          icon={Scissors}
          title="No procedures recorded"
          description="Biopsy, cryotherapy, chemical peel, laser procedures and minor procedures."
        />
      )}
    </div>
  );
}

const CONSENT_LABEL: Record<string, string> = {
  obtained: "Consent obtained",
  declined: "Consent declined",
  documented: "Consent documented",
};

function ProcedureRow({
  procedure,
  canManage,
  onDelete,
}: {
  procedure: DermProcedure;
  canManage: boolean;
  onDelete: (id: string) => void;
}) {
  return (
    <RecordSection
      title={procedure.procedure_name}
      meta={
        canManage && (
          <ConfirmDeleteButton
            ariaLabel="Delete procedure"
            title="Delete this procedure?"
            description="This permanently removes the procedure record entry."
            onConfirm={() => onDelete(procedure.id)}
          />
        )
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-ink-faint flex items-center gap-1 text-[11px]">
          <CalendarDays aria-hidden="true" className="size-3.5" />
          {procedure.procedure_date}
        </span>
        {procedure.consent_status && (
          <Badge className="bg-app text-text-secondary">
            {CONSENT_LABEL[procedure.consent_status] ??
              procedure.consent_status}
          </Badge>
        )}
      </div>
      <RecordNote label="Notes" value={procedure.notes} />
    </RecordSection>
  );
}

/* ------------------------------------------------------------------------- */
/* Prescriptions — topical/skincare fields on top of the record (0077)       */
/*                                                                            */
/* The General Physician prescription engine owns prescriptions proper. This  */
/* tab holds the dermatology-specific skincare routine and instructions the   */
/* GP model does not carry. Unifying it is a larger backend change; until then */
/* the two are kept distinct so nothing is written twice.                     */
/* ------------------------------------------------------------------------- */

const TOPICAL_FORMS = ["Cream", "Ointment", "Gel", "Lotion"] as const;

function RxTab({
  patient,
  derm,
  canManage,
}: {
  patient: PatientDirectoryRow;
  derm: PatientDermBundle;
  canManage: boolean;
}) {
  const router = useRouter();
  const latest = derm.prescriptions[0] ?? null;

  const [pending, setPending] = useState(false);
  const [form, setForm] = useState<string[]>(
    latest?.topical_form ? [latest.topical_form] : [],
  );

  const formValue =
    (form[0] as Exclude<DermPrescription["topical_form"], null> | null) ?? null;

  async function saveRx() {
    if (!canManage) return;
    setPending(true);
    const result = await saveDermRxAction(patient.id, {
      id: latest?.id ?? null,
      topical_form: formValue,
      application_instructions: latest?.application_instructions ?? null,
      skincare_routine_am: latest?.skincare_routine_am ?? null,
      skincare_routine_pm: latest?.skincare_routine_pm ?? null,
      patient_education: latest?.patient_education ?? null,
    });
    setPending(false);
    if (result.ok) {
      toast.success(latest ? "Prescription updated" : "Prescription saved");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <div className="space-y-4">
      <RecordSection
        title={
          latest
            ? `Dermatology prescription · ${latest.created_at.slice(0, 10)}`
            : "Dermatology prescription"
        }
        meta={
          <Badge className="bg-app text-text-secondary">
            Topical & skincare
          </Badge>
        }
      >
        <ChipPicker
          label="Topical form"
          single
          value={form}
          onChange={setForm}
          options={TOPICAL_FORMS}
        />
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <AutosaveNote
            label="Application instructions"
            name="derm-rx-application"
            value={latest?.application_instructions}
            onSave={
              canManage
                ? async (value) =>
                    saveDermRxAction(patient.id, {
                      id: latest?.id ?? null,
                      application_instructions: value || null,
                      topical_form: formValue,
                    }).then((r) => r.ok)
                : async () => true
            }
            rows={3}
            placeholder="e.g. Apply a thin layer twice daily to affected area"
          />
          <AutosaveNote
            label="Patient education"
            name="derm-rx-education"
            value={latest?.patient_education}
            onSave={
              canManage
                ? async (value) =>
                    saveDermRxAction(patient.id, {
                      id: latest?.id ?? null,
                      patient_education: value || null,
                      topical_form: formValue,
                    }).then((r) => r.ok)
                : async () => true
            }
            rows={3}
            placeholder="e.g. Use sunscreen daily; avoid picking at lesions"
          />
          <AutosaveNote
            label="Skincare routine — AM"
            name="derm-rx-am"
            value={latest?.skincare_routine_am}
            onSave={
              canManage
                ? async (value) =>
                    saveDermRxAction(patient.id, {
                      id: latest?.id ?? null,
                      skincare_routine_am: value || null,
                      topical_form: formValue,
                    }).then((r) => r.ok)
                : async () => true
            }
            rows={3}
            placeholder="Cleanser → treatment → moisturiser → SPF"
          />
          <AutosaveNote
            label="Skincare routine — PM"
            name="derm-rx-pm"
            value={latest?.skincare_routine_pm}
            onSave={
              canManage
                ? async (value) =>
                    saveDermRxAction(patient.id, {
                      id: latest?.id ?? null,
                      skincare_routine_pm: value || null,
                      topical_form: formValue,
                    }).then((r) => r.ok)
                : async () => true
            }
            rows={3}
            placeholder="Cleanser → treatment → night moisturiser"
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={saveRx}
            disabled={pending}
            className="gap-1.5"
          >
            {pending ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <Pill aria-hidden="true" className="size-3.5" />
            )}
            {pending ? "Saving…" : "Save prescription"}
          </Button>
        </div>
      </RecordSection>

      {derm.prescriptions.length > 1 && (
        <div className="space-y-3">
          <SpecialtyHeading
            title="Previous prescriptions"
            description="Newest first"
          />
          {derm.prescriptions.slice(1).map((rx) => (
            <RecordSection
              key={rx.id}
              title={`${rx.created_at.slice(0, 10)} — ${
                rx.topical_form
                  ? `Topical ${TOPICAL_LABEL[rx.topical_form] ?? rx.topical_form}`
                  : "Prescription"
              }`}
            >
              <RxSummary rx={rx} />
            </RecordSection>
          ))}
        </div>
      )}
    </div>
  );
}

const TOPICAL_LABEL: Record<string, string> = {
  cream: "Cream",
  ointment: "Ointment",
  gel: "Gel",
  lotion: "Lotion",
};

function RxSummary({ rx }: { rx: DermPrescription }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <RecordNote
        label="Application instructions"
        value={rx.application_instructions}
      />
      <RecordNote label="Patient education" value={rx.patient_education} />
      <RecordNote label="AM routine" value={rx.skincare_routine_am} />
      <RecordNote label="PM routine" value={rx.skincare_routine_pm} />
    </div>
  );
}
