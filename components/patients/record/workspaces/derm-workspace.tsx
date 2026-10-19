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
 * that need schema/service work (persisted body-map pins, specimen tracking,
 * encounter-scoped visits) are reported as gaps, not faked here.
 */

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  History,
  Loader2,
  MapPin,
  Pill,
  Plus,
  Stethoscope,
  TriangleAlert,
  Video,
  X,
} from "lucide-react";

import { ConfirmDeleteButton } from "@/components/patients/record/workspaces/confirm-delete";
import {
  DermScoringTools,
  LesionEditor,
} from "@/components/patients/record/workspaces/derm-body-map";
import { BodyMapPanel } from "@/components/patients/record/workspaces/derm-body-map-panel";
import { PinPhotosPanel } from "@/components/patients/record/workspaces/derm-pin-photos";
import { DermDiagnoses } from "@/components/patients/record/workspaces/derm-diagnosis";
import { DermProcedures } from "@/components/patients/record/workspaces/derm-procedures";
import { DermRxMeds } from "@/components/patients/record/workspaces/derm-rx-meds";
import { DermSummary } from "@/components/patients/record/workspaces/derm-summary";
import { DermPhotosTab } from "@/components/patients/record/workspaces/derm-photos-tab";
import {
  DermIntakeSummary,
  buildIntakeSuggestion,
  type IntakeSuggestion,
} from "@/components/patients/record/workspaces/derm-intake-summary";
import { SearchTagSelect } from "@/components/patients/record/workspaces/search-tag-select";
import { TerminologySearch } from "@/components/patients/record/workspaces/terminology-search";
import { VoiceInputButton } from "@/components/patients/record/workspaces/voice-input-button";
import {
  AutosaveNote,
  ChipPicker,
  NoteStatus,
  parseList,
  serializeList,
  SpecialtyHeading,
  type NoteState,
} from "@/components/patients/record/workspaces/specialty-form";
import {
  RecordEmpty,
  RecordNote,
  RecordSection,
} from "@/components/patients/record/record-primitives";
import { CopilotDrawer } from "@/components/consultation/copilot-drawer";
import { DocumentsTab } from "@/components/patients/record/documents-tab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useHoverTip } from "@/components/ui/hover-tip";
import {
  deleteDermExamAction,
  deleteDermLesionAction,
  saveDermExamAction,
  saveDermProfileAction,
  saveDermRxAction,
} from "@/lib/actions/specialty-workspaces";
import { verifyMedicalHistoryAction } from "@/lib/actions/medical-history";
import type {
  DermNoteExtraction,
  WorkspaceExtraction,
} from "@/lib/copilot/types";
import type { ConsultationPreAnswer } from "@/lib/consultation-queries";
import type { PatientDocumentView } from "@/lib/patient-documents-queries";
import { cn } from "@/lib/utils";
import type { PatientDermBundle } from "@/lib/patient-record";
import { DERMATOLOGY_WORKSPACE } from "@/lib/specialty-workspaces";
import type {
  DermExam,
  DermPrescription,
  PatientDirectoryRow,
} from "@/types/database";
import type { HistoryItem } from "@/types/history";

type Props = {
  patient: PatientDirectoryRow;
  derm: PatientDermBundle;
  documents: PatientDocumentView[];
  activeTab: string;
  canManage: boolean;
  /** Owner/admin/clinic_admin — Tab 5's machine registry manager only. */
  canManageClinic?: boolean;
  params: { selectedId: string };
  timezone: string;
  /**
   * Today's active visit/encounter for this patient (null outside a live
   * visit). Stamped onto every derm row created while it is active, so the
   * record answers "what did this visit produce" (migration 0104).
   */
  activeVisitId?: string | null;
  /** How today's visit is delivered (appointments.consultation_type) — Tab 1 badge. */
  visitType?: "online" | "in_clinic" | null;
  /** Unimported pre-intake history rows (source=patient_intake, pending) — Tab 1 banner. */
  pendingIntake?: HistoryItem[];
  /** Pre-appointment questionnaire answers — Tab 1's AI Intake Summary. */
  preAnswers?: ConsultationPreAnswer[];
};

export function DermWorkspace({
  patient,
  derm,
  documents,
  activeTab,
  canManage,
  canManageClinic,
  params,
  timezone,
  activeVisitId = null,
  visitType = null,
  pendingIntake = [],
  preAnswers = [],
}: Props) {
  const today = todayIso();
  const todayExam = derm.exams.find((exam) => exam.exam_date === today) ?? null;
  return (
    <div className="space-y-4">
      {activeTab === "derm_overview" && (
        <SkinOverviewTab
          patient={patient}
          derm={derm}
          canManage={canManage}
          visitId={activeVisitId}
          visitType={visitType}
          pendingIntake={pendingIntake}
          preAnswers={preAnswers}
        />
      )}
      {activeTab === "derm_exam" && (
        <ExamTab
          patient={patient}
          derm={derm}
          canManage={canManage}
          documents={documents}
          params={params}
          visitId={activeVisitId}
        />
      )}
      {activeTab === "derm_photos" && (
        <DermPhotosTab
          patient={patient}
          derm={derm}
          documents={documents}
          canManage={canManage}
          params={params}
          visitId={activeVisitId}
        />
      )}
      {activeTab === "derm_procedures" && (
        <DermProcedures
          patientId={patient.id}
          procedures={derm.procedures}
          lesions={derm.lesions}
          machines={derm.machines}
          canManage={canManage}
          canManageClinic={canManageClinic}
          visitId={activeVisitId}
        />
      )}
      {activeTab === "derm_rx" && (
        <RxTab
          patient={patient}
          derm={derm}
          canManage={canManage}
          visitId={activeVisitId}
        />
      )}
      {activeTab === "derm_summary" && (
        <DermSummary
          patientId={patient.id}
          exam={todayExam}
          diagnoses={derm.diagnoses}
          lesions={derm.lesions}
          procedures={derm.procedures}
          prescriptions={derm.prescriptions}
          billing={derm.billing}
          canManage={canManage}
        />
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
/* Overview & History — Tab 1 (spec: gemini-code-1792390612396)              */
/*                                                                            */
/* Layout: pre-intake banner → 60/40 grid (complaint capture | risks &        */
/* background) → past-encounters timeline. The patient snapshot card, the     */
/* internal sub-nav links and the empty "latest" placeholders are gone: the   */
/* sticky record header owns demographics, the tab strip owns navigation.     */
/* ------------------------------------------------------------------------- */

type DermProfileField = keyof NonNullable<PatientDermBundle["profile"]>;

type AllergyCategory = "Drug" | "Topical" | "Other";

const ALLERGY_CATEGORY_FIELD: Record<AllergyCategory, DermProfileField> = {
  Drug: "drug_allergies",
  Topical: "topical_allergies",
  Other: "allergies",
};

type AllergyTag = {
  /** Category-prefixed so identical text in two categories never collides. */
  id: string;
  text: string;
  category: AllergyCategory;
  /** From patients.known_allergies — displayed, edited in Health Info. */
  readOnly: boolean;
};

/**
 * Flattens the three profile allergy columns plus the record-level
 * known_allergies into the one tag list the unified card renders.
 */
function buildAllergyTags(
  fields: {
    drugAllergies?: string | null;
    topicalAllergies?: string | null;
    otherAllergies?: string | null;
  },
  knownAllergies?: string | null,
): AllergyTag[] {
  const tags: AllergyTag[] = [];
  const add = (category: AllergyCategory, raw?: string | null) => {
    for (const text of parseList(raw)) {
      const id = `${category}:${text}`;
      if (!tags.some((tag) => tag.id === id)) {
        tags.push({ id, text, category, readOnly: false });
      }
    }
  };
  add("Drug", fields.drugAllergies);
  add("Topical", fields.topicalAllergies);
  add("Other", fields.otherAllergies);
  for (const text of parseList(knownAllergies)) {
    tags.push({
      id: `record:${text}`,
      text,
      category: "Other",
      readOnly: true,
    });
  }
  return tags;
}

/** Laser / chemical-peel safety reading for each Fitzpatrick skin type. */
const FITZPATRICK_TIPS: Record<(typeof FITZPATRICK_TYPES)[number], string> = {
  "Type I":
    "Very fair — always burns, never tans. Lowest laser fluence; high burn & PIH risk.",
  "Type II":
    "Fair — burns easily, tans minimally. Conservative fluence, strict sun avoidance.",
  "Type III":
    "Light — gradual tan. Moderate fluence; watch post-inflammatory pigment.",
  "Type IV":
    "Olive — tans well, rarely burns. Higher PIH risk after ablative lasers.",
  "Type V":
    "Brown — usually pigmented. Avoid aggressive resurfacing; test spot first.",
  "Type VI":
    "Deeply pigmented — never burns. Lowest fluence, test spot, firm post-care.",
};

/**
 * 1-click Fitzpatrick selector (replaces the old SelectNote dropdown); each
 * type carries its laser/peel safety tooltip. Clicking the active type clears
 * the value, so "not recorded" is one click away.
 */
function FitzpatrickSelector({
  value,
  canManage,
  onSelect,
}: {
  value: string | null;
  canManage: boolean;
  onSelect: (next: string) => void;
}) {
  const { tipProps, tooltip } = useHoverTip();
  return (
    <div>
      <p className="text-ink mb-1.5 text-[12.5px] font-bold">
        Fitzpatrick skin type
      </p>
      <div
        role="group"
        aria-label="Fitzpatrick skin type"
        className="flex flex-wrap gap-1.5"
      >
        {FITZPATRICK_TYPES.map((type) => {
          const selected = value === type;
          return (
            <button
              key={type}
              type="button"
              disabled={!canManage}
              aria-pressed={selected}
              {...tipProps(FITZPATRICK_TIPS[type], canManage)}
              onClick={() => onSelect(selected ? "" : type)}
              className={cn(
                "rounded-control border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                selected
                  ? "border-primary bg-primary text-white"
                  : "border-hairline bg-surface text-text-secondary hover:border-primary/50 hover:text-primary",
                !canManage && "cursor-not-allowed opacity-60",
              )}
            >
              {type}
            </button>
          );
        })}
      </div>
      {tooltip}
      <p className="text-ink-faint mt-1.5 text-[11px]">
        {value
          ? `${value} — hover a type for its laser & peel safety rating.`
          : "Not recorded — hover a type for its laser & peel safety rating."}
      </p>
    </div>
  );
}

function SkinOverviewTab({
  patient,
  derm,
  canManage,
  visitId,
  visitType = null,
  pendingIntake = [],
  preAnswers = [],
}: {
  patient: PatientDirectoryRow;
  derm: PatientDermBundle;
  canManage: boolean;
  visitId?: string | null;
  visitType?: "online" | "in_clinic" | null;
  pendingIntake?: HistoryItem[];
  preAnswers?: ConsultationPreAnswer[];
}) {
  const router = useRouter();
  const profile = derm.profile;
  const latestProcedure = derm.procedures[0] ?? null;

  const save = (field: DermProfileField) => (value: string) =>
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
  const pastEncounters = derm.exams.filter((exam) => exam.exam_date !== today);

  /** Right column — one box per history field; allergies live in the card. */
  const historyFields: Array<{
    field: Exclude<DermProfileField, "biopsy_alert">;
    label: string;
  }> = [
    { field: "active_conditions", label: "Active conditions" },
    { field: "previous_skin_conditions", label: "Past skin conditions" },
    { field: "relevant_systemic_history", label: "Relevant systemic history" },
    { field: "family_history", label: "Family history" },
    {
      field: "previous_treatment_history",
      label: "Previous treatment history",
    },
  ];

  /* --- Unified allergy card ------------------------------------------------ */
  const {
    drug_allergies: drugAllergies,
    topical_allergies: topicalAllergies,
    allergies: otherAllergies,
  } = profile ?? {};
  const knownAllergies = patient.known_allergies;

  const [allergyTags, setAllergyTags] = useState<AllergyTag[]>(() =>
    buildAllergyTags(
      { drugAllergies, topicalAllergies, otherAllergies },
      knownAllergies,
    ),
  );
  const [allergyDraft, setAllergyDraft] = useState("");
  const [allergyCategory, setAllergyCategory] =
    useState<AllergyCategory>("Drug");

  // The profile comes back from the server after every save; re-sync so the
  // card never drifts from what was actually persisted.
  useEffect(() => {
    setAllergyTags(
      buildAllergyTags(
        { drugAllergies, topicalAllergies, otherAllergies },
        knownAllergies,
      ),
    );
  }, [drugAllergies, topicalAllergies, otherAllergies, knownAllergies]);

  async function persistAllergyCategory(
    category: AllergyCategory,
    tags: AllergyTag[],
  ) {
    const texts = tags
      .filter((tag) => !tag.readOnly && tag.category === category)
      .map((tag) => tag.text);
    const ok = await save(ALLERGY_CATEGORY_FIELD[category])(
      serializeList(texts),
    );
    if (!ok) {
      toast.error("Could not save the allergy change.");
      setAllergyTags(
        buildAllergyTags(
          { drugAllergies, topicalAllergies, otherAllergies },
          knownAllergies,
        ),
      );
    }
  }

  function addAllergy(event: FormEvent) {
    event.preventDefault();
    const text = allergyDraft.trim();
    if (!text) return;
    const next: AllergyTag[] = [
      ...allergyTags,
      {
        id: `${allergyCategory}:${text}`,
        text,
        category: allergyCategory,
        readOnly: false,
      },
    ];
    setAllergyTags(next);
    setAllergyDraft("");
    void persistAllergyCategory(allergyCategory, next);
  }

  function removeAllergy(tag: AllergyTag) {
    const next = allergyTags.filter((item) => item.id !== tag.id);
    setAllergyTags(next);
    void persistAllergyCategory(tag.category, next);
  }

  /* --- Pre-intake import --------------------------------------------------- */
  const [importing, setImporting] = useState(false);

  /**
   * Bulk-verifies the patient's unimported pre-intake rows so they land as
   * first-class, verified entries in the structured medical history (the same
   * rows the History tab already renders with a pending badge).
   */
  async function importIntake() {
    if (!canManage || pendingIntake.length === 0 || importing) return;
    setImporting(true);
    let imported = 0;
    for (const entry of pendingIntake) {
      const formData = new FormData();
      formData.set("entryId", entry.id);
      const result = await verifyMedicalHistoryAction(null, formData);
      if (result.ok) imported += 1;
    }
    setImporting(false);
    if (imported > 0) {
      toast.success(
        `${imported} pre-intake ${imported === 1 ? "item" : "items"} imported into the medical history`,
      );
      router.refresh();
    } else {
      toast.error("Nothing was imported — please try again.");
    }
  }

  async function selectFitzpatrick(next: string) {
    const ok = await save("fitzpatrick_type")(next);
    if (ok) router.refresh();
    else toast.error("Could not save the skin type.");
  }

  /* --- AI intake summary (deterministic, Approve & Import) --------------- */
  const suggestion = buildIntakeSuggestion(patient, preAnswers);
  const [intakeImported, setIntakeImported] = useState(false);
  // The complaint card registers its merge routine here; the button above it
  // just calls through, so the import uses the card's own save path.
  const applyIntakeRef = useRef<((s: IntakeSuggestion) => void) | null>(null);

  function approveIntake() {
    if (!suggestion || !applyIntakeRef.current) return;
    applyIntakeRef.current(suggestion);
    setIntakeImported(true);
  }

  /* --- Past-encounter detail drawer (right side) ------------------------- */
  const [drawerExam, setDrawerExam] = useState<DermExam | null>(null);

  const consent = latestProcedure?.consent_status ?? null;

  return (
    <div className="space-y-4">
      {/* Status row — visit type, digital consent, biopsy toggle */}
      <div className="flex flex-wrap items-center gap-2">
        {visitType === "online" && (
          <Badge className="gap-1 bg-primary/10 text-primary">
            <Video aria-hidden="true" className="size-3.5" />
            Telehealth (ZegoCloud)
          </Badge>
        )}
        {visitType === "in_clinic" && (
          <Badge className="gap-1 bg-app text-text-secondary">
            <Building2 aria-hidden="true" className="size-3.5" />
            In-Person
          </Badge>
        )}
        {consent && latestProcedure && (
          <Badge
            className={cn(
              consent === "obtained" &&
                "bg-status-success/15 text-status-success",
              consent === "declined" &&
                "bg-status-destructive/15 text-status-destructive",
              consent === "documented" && "bg-app text-text-secondary",
            )}
            title={`${latestProcedure.procedure_name} · ${latestProcedure.procedure_date}`}
          >
            {consent === "obtained" && (
              <CheckCircle2 aria-hidden="true" className="size-3.5" />
            )}
            {consent === "obtained"
              ? "Digital Consent Signed"
              : consent === "declined"
                ? "Consent declined"
                : "Consent documented"}
          </Badge>
        )}
        <label className="text-ink ml-auto flex items-center gap-2 text-[12.5px] font-bold">
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

      {canManage && pendingIntake.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-card border border-status-success/40 bg-status-success/10 p-3"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-status-success/15">
            <ClipboardList
              aria-hidden="true"
              className="size-4 text-status-success"
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold text-text-primary">
              Patient Pre-Intake Received
            </p>
            <p className="text-[11.5px] text-text-secondary">
              {pendingIntake.length}{" "}
              {pendingIntake.length === 1 ? "entry" : "entries"} waiting to
              import
              {pendingIntake.length > 0 && (
                <>
                  {": "}
                  {pendingIntake
                    .slice(0, 3)
                    .map((entry) => entry.title)
                    .join(", ")}
                  {pendingIntake.length > 3 &&
                    ` +${pendingIntake.length - 3} more`}
                </>
              )}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={importIntake}
            disabled={importing}
          >
            {importing ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <ClipboardList aria-hidden="true" className="size-3.5" />
            )}
            Import &amp; Pre-fill Intake Data
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          {suggestion && (
            <DermIntakeSummary
              suggestion={suggestion}
              imported={intakeImported}
              disabled={!canManage}
              onApprove={approveIntake}
            />
          )}
          <RecordSection
            title="Today's complaint & HPI"
            meta={<span className="text-ink-faint text-[11px]">{today}</span>}
          >
            <DermComplaintCard
              patient={patient}
              todayExam={todayExam}
              previousExam={previousExam}
              canManage={canManage}
              visitId={visitId}
              applyIntakeRef={applyIntakeRef}
            />
          </RecordSection>
        </div>

        <div className="space-y-4">
          <RecordSection title="Skin type & procedure safety">
            <FitzpatrickSelector
              value={profile?.fitzpatrick_type ?? null}
              canManage={canManage}
              onSelect={selectFitzpatrick}
            />
          </RecordSection>

          <RecordSection
            title="Allergies & Sensitivities"
            meta={
              allergyTags.length > 0 ? (
                <span className="rounded-pill bg-status-destructive/15 px-2 py-0.5 text-[10.5px] font-bold text-status-destructive">
                  {allergyTags.length} recorded
                </span>
              ) : (
                <span className="rounded-pill bg-app px-2 py-0.5 text-[10.5px] font-bold text-text-secondary">
                  NKDA
                </span>
              )
            }
          >
            <div
              className={cn(
                "rounded-card border-2 p-2.5",
                allergyTags.length > 0
                  ? "border-status-destructive/50 bg-status-destructive/5"
                  : "border-hairline bg-app/60",
              )}
            >
              <p
                className={cn(
                  "flex items-center gap-1.5 text-[11.5px] font-bold",
                  allergyTags.length > 0
                    ? "text-status-destructive"
                    : "text-text-secondary",
                )}
              >
                <TriangleAlert aria-hidden="true" className="size-3.5" />
                Allergy alert
              </p>
              {allergyTags.length > 0 ? (
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {allergyTags.map((tag) => (
                    <li
                      key={tag.id}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-control border px-2 py-0.5 text-[11px] font-medium",
                        tag.readOnly
                          ? "border-hairline bg-app text-text-muted"
                          : tag.category === "Drug"
                            ? "border-status-destructive/40 bg-status-destructive/10 text-status-destructive"
                            : "border-status-warning/40 bg-status-warning/10 text-status-warning",
                      )}
                    >
                      <span
                        title={
                          tag.readOnly
                            ? "From the patient's demographics — edit in Health Info"
                            : tag.category
                        }
                      >
                        {tag.text}
                      </span>
                      {tag.readOnly ? (
                        <span className="text-ink-faint text-[10px]">
                          record
                        </span>
                      ) : (
                        canManage && (
                          <button
                            type="button"
                            aria-label={`Remove ${tag.text}`}
                            onClick={() => removeAllergy(tag)}
                            className="-mr-0.5 rounded-pill p-0.5 transition-colors hover:bg-black/10"
                          >
                            <X aria-hidden="true" className="size-3" />
                          </button>
                        )
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-faint mt-1.5 text-[11.5px]">
                  No known allergies recorded.
                </p>
              )}

              {canManage && (
                <form
                  onSubmit={addAllergy}
                  className="mt-2.5 flex flex-wrap items-center gap-2"
                >
                  <Input
                    value={allergyDraft}
                    onChange={(event) => setAllergyDraft(event.target.value)}
                    placeholder="Add an allergy…"
                    aria-label="New allergy"
                    className="h-8 min-w-[10rem] flex-1 text-[12.5px]"
                  />
                  <NativeSelect
                    value={allergyCategory}
                    onChange={(event) =>
                      setAllergyCategory(event.target.value as AllergyCategory)
                    }
                    aria-label="Allergy category"
                    className="h-8 w-28 text-[12.5px]"
                  >
                    <option>Drug</option>
                    <option>Topical</option>
                    <option>Other</option>
                  </NativeSelect>
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1"
                    disabled={!allergyDraft.trim()}
                  >
                    <Plus aria-hidden="true" className="size-3.5" />
                    Add Allergy
                  </Button>
                </form>
              )}
            </div>
          </RecordSection>

          <RecordSection title="Current skincare & oral meds">
            <div className="space-y-3">
              <AutosaveNote
                label="Oral medications"
                name="derm-profile-current_orals"
                value={profile?.current_orals ?? null}
                onSave={canManage ? save("current_orals") : async () => true}
                rows={2}
                helper="e.g. Accutane, antibiotics, supplements"
              />
              <AutosaveNote
                label="Topicals & skincare"
                name="derm-profile-current_topicals"
                value={profile?.current_topicals ?? null}
                onSave={canManage ? save("current_topicals") : async () => true}
                rows={2}
                helper="Retinoids, creams, actives"
              />
            </div>
          </RecordSection>

          <RecordSection title="Relevant medical & family history">
            <div className="space-y-3">
              {historyFields.map(({ field, label }) => (
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
      </div>

      <RecordSection
        title="Past encounters"
        meta={
          <span className="text-ink-faint text-[11px]">
            {pastEncounters.length === 0
              ? "None yet"
              : `${pastEncounters.length} previous`}
          </span>
        }
      >
        {pastEncounters.length > 0 ? (
          <ol className="relative space-y-3 border-l border-hairline pl-4">
            {pastEncounters.slice(0, 8).map((exam) => (
              <li key={exam.id} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary/70 ring-4 ring-surface"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-ink flex items-center gap-1.5 text-[12.5px] font-semibold">
                      <CalendarDays
                        aria-hidden="true"
                        className="text-ink-faint size-3.5"
                      />
                      {exam.exam_date} — {exam.diagnosis || "Examination"}
                    </p>
                    {exam.chief_complaints.length > 0 && (
                      <p className="text-ink-faint mt-0.5 truncate text-[11px]">
                        {exam.chief_complaints.join(", ")}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 gap-0.5 px-2 text-[11px]"
                    onClick={() => setDrawerExam(exam)}
                  >
                    View Record
                    <ChevronRight aria-hidden="true" className="size-3" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <RecordNote
            label="Status"
            value="No previous consultations recorded for this patient."
          />
        )}
        {pastEncounters.length > 8 && (
          <p className="text-ink-faint mt-2 text-[11px]">
            Showing the most recent 8 of {pastEncounters.length} encounters —
            open an examination tab for the full list.
          </p>
        )}
      </RecordSection>

      {/* Past-encounter detail — slides in from the right (drawer, not a tab jump) */}
      <Dialog
        open={drawerExam !== null}
        onOpenChange={(open) => {
          if (!open) setDrawerExam(null);
        }}
      >
        <DialogContent className="left-auto top-0 h-full max-h-full w-full max-w-md translate-x-0 translate-y-0 rounded-none border-y-0 border-r-0 data-[state=open]:animate-drawer-in">
          {drawerExam && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {drawerExam.exam_date} —{" "}
                  {drawerExam.diagnosis || "Examination"}
                </DialogTitle>
                <DialogDescription>
                  {patient.name}
                  {drawerExam.chief_complaints.length > 0
                    ? ` · ${drawerExam.chief_complaints.join(", ")}`
                    : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="scrollbar-thin -mr-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
                <ExamDrawerChips
                  label="Chief complaints"
                  items={drawerExam.chief_complaints}
                  tone="primary"
                />
                <ExamDrawerChips
                  label="Morphology"
                  items={drawerExam.morphology}
                />
                <ExamDrawerChips label="Triggers" items={drawerExam.triggers} />
                <ExamDrawerChips
                  label="Associated symptoms"
                  items={drawerExam.associated_symptoms}
                />
                {drawerExam.duration && (
                  <RecordNote label="Duration" value={drawerExam.duration} />
                )}
                {drawerExam.severity && (
                  <RecordNote label="Severity" value={drawerExam.severity} />
                )}
                {drawerExam.distribution && (
                  <RecordNote
                    label="Distribution"
                    value={
                      drawerExam.distribution.charAt(0).toUpperCase() +
                      drawerExam.distribution.slice(1)
                    }
                  />
                )}
                <RecordNote
                  label="Diagnosis"
                  value={
                    drawerExam.diagnosis
                      ? `${drawerExam.diagnosis}${drawerExam.icd_code ? ` (${drawerExam.icd_code})` : ""}`
                      : null
                  }
                />
                <RecordNote
                  label="History of present illness"
                  value={drawerExam.hpi}
                />
                <RecordNote label="Notes" value={drawerExam.notes} />
                <RecordNote label="Assessment" value={drawerExam.assessment} />
                <RecordNote
                  label="Patient explanation"
                  value={drawerExam.patient_explanation}
                />
                {drawerExam.follow_up_date && (
                  <RecordNote
                    label="Follow-up"
                    value={`${drawerExam.follow_up_date}${drawerExam.follow_up_notes ? ` — ${drawerExam.follow_up_notes}` : ""}`}
                  />
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Overview & History — quick chips, today's encounter + copy-forward        */
/* ------------------------------------------------------------------------- */

/** Chip group inside the past-encounter drawer — renders nothing when empty. */
function ExamDrawerChips({
  label,
  items,
  tone = "neutral",
}: {
  label: string;
  items: string[];
  tone?: "neutral" | "primary";
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-ink text-[11.5px] font-bold">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Badge
            key={item}
            className={cn(
              "bg-app text-text-secondary",
              tone === "primary" && "bg-primary/10 text-primary",
            )}
          >
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

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

/**
 * Curated dermatology complaint vocabulary behind Tab 1's search/create
 * combobox: the six quick chips first, then common skin presentations. The
 * input also accepts free text, so the list is a starting point, not a gate.
 */
const DERM_COMPLAINT_TAGS: readonly string[] = [
  ...CHIEF_COMPLAINT_OPTIONS,
  "Acne scars",
  "Rosacea",
  "Perioral dermatitis",
  "Seborrheic dermatitis",
  "Contact dermatitis",
  "Atopic dermatitis",
  "Hand eczema",
  "Dyshidrotic eczema",
  "Nummular dermatitis",
  "Stasis dermatitis",
  "Psoriasis",
  "Vitiligo",
  "Melasma",
  "Post-inflammatory hyperpigmentation",
  "Acanthosis nigricans",
  "Keloid",
  "Hypertrophic scar",
  "Striae (stretch marks)",
  "Warts",
  "Molluscum",
  "Skin tag",
  "Sebaceous cyst",
  "Seborrheic keratosis",
  "Herpes simplex",
  "Herpes zoster",
  "Impetigo",
  "Cellulitis",
  "Folliculitis",
  "Boil / abscess",
  "Tinea corporis",
  "Scalp ringworm",
  "Athlete's foot",
  "Nail fungus",
  "Scabies",
  "Urticaria",
  "Angioedema",
  "Erythema multiforme",
  "Erythema nodosum",
  "Lichen planus",
  "Pityriasis rosea",
  "Granuloma annulare",
  "Prurigo nodularis",
  "Neurodermatitis",
  "Alopecia areata",
  "Androgenetic alopecia",
  "Dandruff",
  "Hyperhidrosis",
  "Xerosis",
  "Sunburn",
  "Photodermatitis",
  "Purpura / easy bruising",
  "Nail changes",
  "Insect bite reaction",
  "Lip dermatitis",
];

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
  visitId,
  applyIntakeRef,
}: {
  patient: PatientDirectoryRow;
  todayExam: DermExam | null;
  previousExam: DermExam | null;
  canManage: boolean;
  visitId?: string | null;
  /** Registers the Approve & Import applier with the parent (Tab 1 summary). */
  applyIntakeRef?: { current: ((s: IntakeSuggestion) => void) | null };
}) {
  const router = useRouter();
  const [rowId, setRowId] = useState<string | null>(todayExam?.id ?? null);
  const [fields, setFields] = useState<EncounterFields>(() =>
    encounterFields(todayExam),
  );
  const [status, setStatus] = useState<NoteState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [carriedFrom, setCarriedFrom] = useState<string | null>(null);

  function persist(
    patch: Partial<EncounterFields>,
    successMessage?: string,
  ): Promise<boolean> {
    if (!canManage) return Promise.resolve(false);
    const next = { ...fields, ...patch };
    setFields(next);
    setStatus("saving");
    setMessage(null);
    return saveDermExamAction(
      patient.id,
      {
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
      },
      visitId,
    ).then((result) => {
      if (result.ok) {
        setRowId(result.data);
        setStatus("saved");
        setCarriedFrom(null);
        router.refresh();
        if (successMessage) toast.success(successMessage);
        return true;
      }
      setStatus("error");
      setMessage(result.message);
      if (successMessage) toast.error(result.message);
      return false;
    });
  }

  /**
   * Approve & Import (AI Intake Summary): union the suggested chips into the
   * encounter, fill duration/severity/HPI only where they are still empty, and
   * save the merged result once through the normal autosave path.
   */
  function applyIntakeSuggestion(s: IntakeSuggestion) {
    if (!canManage) return;
    const merge = (base: string[], extra: string[]) => {
      const next = base.slice();
      for (const raw of extra) {
        const value = raw.trim();
        if (!value) continue;
        if (!next.some((item) => item.toLowerCase() === value.toLowerCase())) {
          next.push(value);
        }
      }
      return next;
    };
    void persist(
      {
        chief_complaints: merge(fields.chief_complaints, s.chief_complaints),
        triggers: merge(fields.triggers, s.triggers),
        associated_symptoms: merge(
          fields.associated_symptoms,
          s.associated_symptoms,
        ),
        duration: fields.duration || s.duration || "",
        severity: fields.severity || s.severity || "",
        hpi: fields.hpi.trim() ? fields.hpi : (s.hpi ?? fields.hpi),
      },
      "Suggested intake data merged into today's encounter.",
    );
  }

  // Keep the parent's button pointed at the latest closure (no dep array —
  // re-registers on every render so the merge always sees current fields).
  useEffect(() => {
    if (applyIntakeRef) applyIntakeRef.current = applyIntakeSuggestion;
  });

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
        options={[
          ...CHIEF_COMPLAINT_OPTIONS,
          ...fields.chief_complaints.filter(
            (item) =>
              !(CHIEF_COMPLAINT_OPTIONS as readonly string[]).includes(item),
          ),
        ]}
        value={fields.chief_complaints}
        onChange={(next) => void persist({ chief_complaints: next })}
      />

      <SearchTagSelect
        label="Search or add complaint"
        value={fields.chief_complaints.join(", ")}
        options={DERM_COMPLAINT_TAGS}
        placeholder="🔍 Search or Add Complaint…"
        helper="Search the curated list, or type any term to create a custom complaint tag."
        hideSelectedChips
        disabled={!canManage}
        onSave={(next) =>
          persist({
            chief_complaints: next
              .split(",")
              .map((token) => token.trim())
              .filter(Boolean),
          })
        }
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
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label
            htmlFor="derm-hpi"
            className="text-ink text-[12.5px] font-bold"
          >
            History of present illness
          </label>
          <VoiceInputButton
            disabled={!canManage}
            label="AI Voice Note"
            onTranscript={(text) =>
              persist({
                hpi: fields.hpi.trim() ? `${fields.hpi} ${text}` : text,
              })
            }
          />
        </div>
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
            Copy last visit HPI
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
  visitId,
}: {
  patient: PatientDirectoryRow;
  derm: PatientDermBundle;
  canManage: boolean;
  documents: PatientDocumentView[];
  params: { selectedId: string };
  visitId?: string | null;
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
  const [assessment, setAssessment] = useState(todayExam?.assessment ?? "");
  const [patientExplanation, setPatientExplanation] = useState(
    todayExam?.patient_explanation ?? "",
  );
  const [duration] = useState(todayExam?.duration ?? "");
  const [severity] = useState(todayExam?.severity ?? "");
  const [triggers] = useState<string[]>(todayExam?.triggers ?? []);
  const [associatedSymptoms] = useState<string[]>(
    todayExam?.associated_symptoms ?? [],
  );
  const [hpi] = useState(todayExam?.hpi ?? "");

  // The active lesion pin — shared by all three columns (map, photos,
  // morphology editor) so they stay in sync (Tab 2 spec).
  const [selectedPinId, setSelectedPinId] = useState<string | null>(
    derm.lesions[0]?.id ?? null,
  );
  const selectedLesion =
    derm.lesions.find((lesion) => lesion.id === selectedPinId) ?? null;

  async function removePin(id: string) {
    const result = await deleteDermLesionAction(id);
    if (result.ok) {
      if (selectedPinId === id) setSelectedPinId(null);
      toast.success("Lesion pin removed");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function addExam() {
    if (!canManage) return;
    const hasClinicalDetail =
      complaints.length > 0 ||
      morphology.length > 0 ||
      distribution.length > 0 ||
      diagnosis.trim().length > 0 ||
      notes.trim().length > 0 ||
      assessment.trim().length > 0 ||
      patientExplanation.trim().length > 0;
    if (!hasClinicalDetail) {
      setError(
        "Record at least a complaint, morphology, diagnosis or note before saving.",
      );
      return;
    }
    setError(null);
    setPending(true);
    const result = await saveDermExamAction(
      patient.id,
      {
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
        assessment,
        patient_explanation: patientExplanation,
      },
      visitId,
    );
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
            <RecordSection title="Body map">
              <BodyMapPanel
                patientId={patient.id}
                examId={todayExam?.id ?? null}
                lesions={derm.lesions}
                canManage={canManage}
                visitId={visitId}
                selectedId={selectedPinId}
                onSelect={setSelectedPinId}
              />
            </RecordSection>

            <RecordSection
              title="Dermoscopy photos"
              meta={
                selectedLesion ? (
                  <Badge className="bg-[#dc2626]/10 text-[#dc2626]">
                    Pin #{selectedLesion.pin_number}
                  </Badge>
                ) : undefined
              }
            >
              <PinPhotosPanel
                documents={documents}
                photos={derm.photos}
                selectedLesion={selectedLesion}
                params={params}
                canManage={canManage}
              />
            </RecordSection>

            {selectedLesion ? (
              <LesionEditor
                key={selectedLesion.id}
                patientId={patient.id}
                lesion={selectedLesion}
                canManage={canManage}
                onDelete={removePin}
                onSaved={() => router.refresh()}
              />
            ) : (
              <RecordSection title="Morphology & findings">
                <div className="flex h-full min-h-40 flex-col items-center justify-center rounded-card border border-dashed border-hairline p-4 text-center">
                  <MapPin
                    aria-hidden="true"
                    className="text-ink-faint size-5"
                  />
                  <p className="mt-2 text-[12px] text-text-secondary">
                    No pin selected
                  </p>
                  <p className="text-ink-faint mt-0.5 text-[11px]">
                    Click the body map to add a lesion pin.
                  </p>
                </div>
              </RecordSection>
            )}
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
                  <TerminologySearch
                    label="Diagnosis"
                    inputId="derm-exam-diagnosis"
                    value={diagnosis}
                    placeholder="e.g. Plaque psoriasis"
                    onChange={setDiagnosis}
                    onSelect={(hit) => {
                      setDiagnosis(hit.display);
                      setIcdCode(hit.code);
                    }}
                  />
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
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="derm-exam-assessment"
                    className="text-ink mb-1.5 block text-[12.5px] font-bold"
                  >
                    Assessment
                  </label>
                  <Textarea
                    id="derm-exam-assessment"
                    rows={4}
                    value={assessment}
                    onChange={(event) => setAssessment(event.target.value)}
                    placeholder="Clinical reasoning, differentials considered, confidence…"
                  />
                </div>
                <div>
                  <label
                    htmlFor="derm-exam-explanation"
                    className="text-ink mb-1.5 block text-[12.5px] font-bold"
                  >
                    Explanation for the patient
                  </label>
                  <Textarea
                    id="derm-exam-explanation"
                    rows={4}
                    value={patientExplanation}
                    onChange={(event) =>
                      setPatientExplanation(event.target.value)
                    }
                    placeholder="Plain-language summary the patient can take away…"
                  />
                </div>
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
                visitId={visitId}
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

      <DermDiagnoses
        patientId={patient.id}
        examId={todayExam?.id ?? null}
        diagnoses={derm.diagnoses}
        canManage={canManage}
        visitId={visitId}
      />

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
  visitId,
}: {
  patient: PatientDirectoryRow;
  derm: PatientDermBundle;
  canManage: boolean;
  visitId?: string | null;
}) {
  const router = useRouter();
  const latest = derm.prescriptions[0] ?? null;
  // Every allergy string this patient carries — the profile's drug/topical/
  // other fields plus the record-level known_allergies — in the order the
  // risk card reads them, fed straight to the safety panel below.
  const allergies = [
    derm.profile?.drug_allergies,
    derm.profile?.topical_allergies,
    derm.profile?.allergies,
    patient.known_allergies,
  ];

  const [pending, setPending] = useState(false);
  const [form, setForm] = useState<string[]>(
    latest?.topical_form ? [latest.topical_form] : [],
  );

  const formValue =
    (form[0] as Exclude<DermPrescription["topical_form"], null> | null) ?? null;

  async function saveRx() {
    if (!canManage) return;
    setPending(true);
    const result = await saveDermRxAction(
      patient.id,
      {
        id: latest?.id ?? null,
        topical_form: formValue,
        application_instructions: latest?.application_instructions ?? null,
        skincare_routine_am: latest?.skincare_routine_am ?? null,
        skincare_routine_pm: latest?.skincare_routine_pm ?? null,
        patient_education: latest?.patient_education ?? null,
      },
      visitId,
    );
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
      <DermRxMeds
        patientId={patient.id}
        prescriptionId={latest?.id ?? null}
        medicines={latest?.medicines ?? []}
        labOrders={latest?.lab_orders ?? []}
        skincareAm={latest?.skincare_routine_am ?? null}
        skincarePm={latest?.skincare_routine_pm ?? null}
        allergies={allergies}
        canManage={canManage}
        visitId={visitId}
      />

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
                    saveDermRxAction(
                      patient.id,
                      {
                        id: latest?.id ?? null,
                        application_instructions: value || null,
                        topical_form: formValue,
                      },
                      visitId,
                    ).then((r) => r.ok)
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
                    saveDermRxAction(
                      patient.id,
                      {
                        id: latest?.id ?? null,
                        patient_education: value || null,
                        topical_form: formValue,
                      },
                      visitId,
                    ).then((r) => r.ok)
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
                    saveDermRxAction(
                      patient.id,
                      {
                        id: latest?.id ?? null,
                        skincare_routine_am: value || null,
                        topical_form: formValue,
                      },
                      visitId,
                    ).then((r) => r.ok)
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
                    saveDermRxAction(
                      patient.id,
                      {
                        id: latest?.id ?? null,
                        skincare_routine_pm: value || null,
                        topical_form: formValue,
                      },
                      visitId,
                    ).then((r) => r.ok)
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
