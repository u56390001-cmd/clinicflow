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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  ClipboardPaste,
  History,
  Images,
  Loader2,
  MapPin,
  Plus,
  Scissors,
  Sparkles,
  Stethoscope,
  Sun,
  TriangleAlert,
  Users,
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
import { patientDirectoryHref } from "@/lib/patient-directory";
import { patientDocumentHref } from "@/lib/patient-documents-queries";
import { PHOTO_TYPE_LABEL } from "@/lib/derm-photo-utils";
import type { ConsultationPreAnswer } from "@/lib/consultation-queries";
import type { PatientDocumentView } from "@/lib/patient-documents-queries";
import { cn } from "@/lib/utils";
import type { PatientDermBundle } from "@/lib/patient-record";
import { DERMATOLOGY_WORKSPACE } from "@/lib/specialty-workspaces";
import type {
  DermExam,
  DermLesion,
  DermPhoto,
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
          params={params}
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
          presets={derm.presets}
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
          patientInfo={{
            name: patient.name,
            patientCode: patient.patient_code,
            dateOfBirth: patient.date_of_birth,
            gender: patient.gender,
          }}
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
                "flex items-center gap-1.5 rounded-control border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                selected
                  ? "border-primary bg-primary text-white"
                  : "border-hairline bg-surface text-text-secondary hover:border-primary/50 hover:text-primary",
                !canManage && "cursor-not-allowed opacity-60",
              )}
            >
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full ring-1 ring-black/15"
                style={{ backgroundColor: FITZPATRICK_SWATCH[type] }}
              />
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

/**
 * One-tap ingredient chips above a regimen textarea. Tapping toggles the chip
 * in the comma-serialized list and autosaves; chips already in the saved value
 * render active. The textarea below stays the free-text escape hatch.
 */
function RegimenChipRow({
  chips,
  value,
  canManage,
  onToggle,
}: {
  chips: readonly string[];
  value: string | null;
  canManage: boolean;
  onToggle: (chip: string, active: boolean) => void;
}) {
  const existing = parseList(value);
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => {
        const active = existing.some(
          (item) => item.toLowerCase() === chip.toLowerCase(),
        );
        return (
          <button
            key={chip}
            type="button"
            disabled={!canManage}
            aria-pressed={active}
            onClick={() => onToggle(chip, active)}
            className={cn(
              "rounded-control border px-2 py-0.5 text-[11px] font-medium transition-colors",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-hairline bg-surface text-text-secondary hover:border-primary/50 hover:text-primary",
              !canManage && "cursor-not-allowed opacity-60",
            )}
          >
            {chip}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Structured risk-history tag toggles (sun exposure / family skin cancer).
 * Same toggle-and-autosave contract as RegimenChipRow, with a heading.
 */
function RiskTagToggle({
  icon,
  title,
  tags,
  value,
  canManage,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  tags: readonly string[];
  value: string | null;
  canManage: boolean;
  onToggle: (tag: string) => void;
}) {
  const existing = parseList(value);
  return (
    <div>
      <p className="text-ink flex items-center gap-1.5 text-[12.5px] font-bold">
        {icon}
        {title}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {tags.map((tag) => {
          const active = existing.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              disabled={!canManage}
              aria-pressed={active}
              onClick={() => onToggle(tag)}
              className={cn(
                "rounded-control border px-2 py-0.5 text-[11px] font-medium transition-colors",
                active
                  ? "border-status-warning bg-status-warning/10 text-status-warning"
                  : "border-hairline bg-surface text-text-secondary hover:border-status-warning/50 hover:text-status-warning",
                !canManage && "cursor-not-allowed opacity-60",
              )}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Active Lesions & Photo Progress — the compact Tab 1 window into Tab 3.
 *
 * Renders the latest tagged captures (the bundle arrives ordered
 * taken-at-desc) with their region, photo type and capture date, plus the
 * open lesion pins, and deep-links to `?tab=derm_photos` for the full
 * gallery. Read-only: tagging/pairing stays in the Photos tab.
 */
function ActivePhotoPreview({
  photos,
  lesions,
  params,
}: {
  photos: DermPhoto[];
  lesions: DermLesion[];
  params: { selectedId: string };
}) {
  const recentPhotos = photos.slice(0, 3);
  const activePins = lesions.slice(0, 3);
  return (
    <div className="space-y-3">
      {recentPhotos.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {recentPhotos.map((photo) => (
            <figure key={photo.id} className="min-w-0 space-y-1">
              <div className="relative aspect-square overflow-hidden rounded-control border border-hairline bg-app">
                {photo.document_id ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={patientDocumentHref(photo.document_id)}
                    alt={`${photo.body_region} — ${PHOTO_TYPE_LABEL[photo.photo_type]} skin photo`}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-1 text-text-muted">
                    <Images aria-hidden="true" className="size-4" />
                    <span className="text-[10px]">Not linked</span>
                  </div>
                )}
              </div>
              <figcaption className="text-ink-faint truncate text-[10.5px]">
                {photo.body_region} · {PHOTO_TYPE_LABEL[photo.photo_type]} ·{" "}
                {photo.taken_at}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : activePins.length === 0 ? (
        <RecordNote
          label="Status"
          value="No tagged photos or lesion pins yet — capture them in the Photos tab."
        />
      ) : null}
      {activePins.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activePins.map((lesion) => (
            <Badge key={lesion.id} className="bg-app text-text-secondary">
              <MapPin aria-hidden="true" className="size-3" />
              {lesion.body_region} Pin #{lesion.pin_number}
            </Badge>
          ))}
        </div>
      )}
      <Link
        href={patientDirectoryHref({ ...params, tab: "derm_photos" })}
        className="inline-flex items-center gap-1.5 rounded-control border border-hairline bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-primary transition-colors hover:border-primary/50"
      >
        📸 View Full Gallery
        <ChevronRight aria-hidden="true" className="size-3" />
      </Link>
    </div>
  );
}

function SkinOverviewTab({
  patient,
  derm,
  canManage,
  params,
  visitId,
  visitType = null,
  pendingIntake = [],
  preAnswers = [],
}: {
  patient: PatientDirectoryRow;
  derm: PatientDermBundle;
  canManage: boolean;
  /** Directory URL params — builds the `?tab=derm_photos` gallery deep link. */
  params: { selectedId: string };
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

  /**
   * Regimen chip toggle (topicals/orals): merge into the comma-serialized
   * list and autosave through the same single-field path the textareas use.
   * The textarea below is uncontrolled, so a successful save triggers a
   * refresh whose new `key` remounts it with the merged text.
   */
  async function toggleRegimen(
    field: "current_topicals" | "current_orals",
    chip: string,
    active: boolean,
  ) {
    if (!canManage) return;
    const current = parseList(profile?.[field]);
    const next = active
      ? current.filter((item) => item.toLowerCase() !== chip.toLowerCase())
      : [...current, chip];
    const ok = await save(field)(serializeList(next));
    if (ok) router.refresh();
    else toast.error("Could not save the regimen change.");
  }

  /** Structured risk-tag toggle (sun exposure / family skin cancer, 0119). */
  async function toggleRiskTag(
    field: "sun_exposure_history" | "family_skin_cancer_risk",
    tag: string,
  ) {
    if (!canManage) return;
    const current = parseList(profile?.[field]);
    const next = current.includes(tag)
      ? current.filter((item) => item !== tag)
      : [...current, tag];
    const ok = await save(field)(serializeList(next));
    if (ok) router.refresh();
    else toast.error("Could not save the risk flag.");
  }

  /* --- AI intake summary (deterministic, Approve & Import) --------------- */
  const suggestion = buildIntakeSuggestion(patient, preAnswers);
  const [intakeImported, setIntakeImported] = useState(false);
  // The complaint card registers its merge routine here; the button above it
  // just calls through, so the import uses the card's own save path.
  const applyIntakeRef = useRef<((s: IntakeSuggestion) => void) | null>(null);
  // Same bridge pattern for "Push History to Session Note": the card owns the
  // encounter fields, so it registers the push routine; the header button calls
  // through and the card formats + appends the history summary into the HPI.
  const historyPushRef = useRef<(() => void) | null>(null);

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Column 1 — snapshot: demographics capsule, skin type, structured risks */}
        <div className="space-y-4">
          <RecordSection title="Patient snapshot">
            <div className="space-y-1.5 text-[12.5px]">
              <p className="text-ink font-semibold">{patient.name}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-text-secondary">
                <span>#{patient.patient_code}</span>
                {patient.gender && <span>{patient.gender}</span>}
                {(() => {
                  const dobMs = patient.date_of_birth
                    ? new Date(patient.date_of_birth).getTime()
                    : NaN;
                  if (Number.isNaN(dobMs)) return null;
                  const age = Math.floor(
                    (Date.now() - dobMs) / (365.25 * 24 * 60 * 60 * 1000),
                  );
                  return <span>{age} yrs</span>;
                })()}
              </div>
            </div>
          </RecordSection>

          <RecordSection title="Skin type & procedure safety">
            <FitzpatrickSelector
              value={profile?.fitzpatrick_type ?? null}
              canManage={canManage}
              onSelect={selectFitzpatrick}
            />
          </RecordSection>

          <RecordSection title="Sun & family skin-cancer risk">
            <div className="space-y-3">
              <RiskTagToggle
                icon={<Sun aria-hidden="true" className="size-3.5 text-status-warning" />}
                title="Sun exposure / sunburn history"
                tags={SUN_EXPOSURE_TAGS}
                value={profile?.sun_exposure_history ?? null}
                canManage={canManage}
                onToggle={(tag) => void toggleRiskTag("sun_exposure_history", tag)}
              />
              <RiskTagToggle
                icon={<Users aria-hidden="true" className="size-3.5 text-primary" />}
                title="Family skin-cancer risk"
                tags={FAMILY_RISK_TAGS}
                value={profile?.family_skin_cancer_risk ?? null}
                canManage={canManage}
                onToggle={(tag) => void toggleRiskTag("family_skin_cancer_risk", tag)}
              />
            </div>
          </RecordSection>
        </div>

        {/* Column 2 — today's encounter: intake summary + complaint capture */}
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
              historyContext={{
                fitzpatrick: profile?.fitzpatrick_type ?? null,
                topicals: profile?.current_topicals ?? null,
                orals: profile?.current_orals ?? null,
                allergies:
                  allergyTags.map((tag) => tag.text).join(", ") || null,
              }}
              historyPushRef={historyPushRef}
            />
          </RecordSection>
        </div>

        {/* Column 3 — risks & background: allergies, regimen, photo progress */}
        <div className="space-y-4">
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
              <div className="space-y-1.5">
                <RegimenChipRow
                  chips={ORAL_CHIPS}
                  value={profile?.current_orals ?? null}
                  canManage={canManage}
                  onToggle={(chip, active) =>
                    void toggleRegimen("current_orals", chip, active)
                  }
                />
                <AutosaveNote
                  // Uncontrolled textarea: the value-keyed remount shows chips
                  // added above the moment the refresh lands.
                  key={`current_orals-${profile?.current_orals ?? ""}`}
                  label="Oral medications"
                  name="derm-profile-current_orals"
                  value={profile?.current_orals ?? null}
                  onSave={canManage ? save("current_orals") : async () => true}
                  rows={2}
                  helper="e.g. Accutane, antibiotics, supplements"
                />
              </div>
              <div className="space-y-1.5">
                <RegimenChipRow
                  chips={TOPICAL_CHIPS}
                  value={profile?.current_topicals ?? null}
                  canManage={canManage}
                  onToggle={(chip, active) =>
                    void toggleRegimen("current_topicals", chip, active)
                  }
                />
                <AutosaveNote
                  key={`current_topicals-${profile?.current_topicals ?? ""}`}
                  label="Topicals & skincare"
                  name="derm-profile-current_topicals"
                  value={profile?.current_topicals ?? null}
                  onSave={canManage ? save("current_topicals") : async () => true}
                  rows={2}
                  helper="Retinoids, creams, actives"
                />
              </div>
            </div>
          </RecordSection>

          <RecordSection title="Active lesions & photo progress">
            <ActivePhotoPreview
              photos={derm.photos}
              lesions={derm.lesions}
              params={params}
            />
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

/**
 * Approximate tone swatch per Fitzpatrick type, so the selector reads at a
 * glance instead of asking every doctor to memorise the numbering. Shades are
 * the conventional reference swatches (pale white through deeply pigmented);
 * they are indicative, not diagnostic.
 */
const FITZPATRICK_SWATCH: Record<(typeof FITZPATRICK_TYPES)[number], string> = {
  "Type I": "#FFE0BD",
  "Type II": "#F1C27D",
  "Type III": "#E0AC69",
  "Type IV": "#C68642",
  "Type V": "#8D5524",
  "Type VI": "#5C3317",
};

/** Single-tap ingredients for the current-topicals regimen. */
const TOPICAL_CHIPS = [
  "Tretinoin/Retinoid",
  "Salicylic Acid 2%",
  "Benzoyl Peroxide",
  "Topical Steroid",
  "Azelaic Acid",
  "Sunscreen SPF50+",
  "Moisturizer",
] as const;

/** Single-tap ingredients for the current-oral-medications regimen. */
const ORAL_CHIPS = [
  "Doxycycline/Lymecycline",
  "Isotretinoin",
  "Spironolactone",
  "Antihistamine",
  "Oral Steroid",
] as const;

/** Structured UV-exposure / sunburn history chips (migration 0119). */
const SUN_EXPOSURE_TAGS = [
  "Daily Outdoor Work",
  "Frequent Sunburns",
  "Tanning Bed Use",
  "Strict Sun Protection",
] as const;

/** Structured hereditary skin-cancer risk chips (migration 0119). */
const FAMILY_RISK_TAGS = [
  "Family Melanoma",
  "Family Non-Melanoma Skin Cancer",
  "Dysplastic Nevus Syndrome",
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
  historyContext,
  historyPushRef,
}: {
  patient: PatientDirectoryRow;
  todayExam: DermExam | null;
  previousExam: DermExam | null;
  canManage: boolean;
  visitId?: string | null;
  /** Registers the Approve & Import applier with the parent (Tab 1 summary). */
  applyIntakeRef?: { current: ((s: IntakeSuggestion) => void) | null };
  /** Profile-side history (Fitzpatrick, regimen, allergies) for the push. */
  historyContext?: {
    fitzpatrick: string | null;
    topicals: string | null;
    orals: string | null;
    allergies: string | null;
  };
  /** Registers the Push-History routine with the parent's header button. */
  historyPushRef?: { current: (() => void) | null };
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

  // Keep the parent's buttons pointed at the latest closures (no dep array —
  // re-registers on every render so the merge/push always see current fields).
  useEffect(() => {
    if (applyIntakeRef) applyIntakeRef.current = applyIntakeSuggestion;
    if (historyPushRef) historyPushRef.current = pushHistoryToNote;
  });

  /**
   * 📋 Push History to Session Note — the Tab-1 workflow bridge.
   *
   * Formats the structured clinical summary (complaint, window, triggers,
   * symptoms, Fitzpatrick, regimen, allergies) and appends it to today's
   * encounter HPI — the dermatologist's session note — through the normal
   * autosave path, so it lands in `derm_exams.hpi` and the past-encounter
   * drawer instead of a throwaway clipboard string.
   */
  function pushHistoryToNote() {
    if (!canManage) return;
    const complaint = fields.chief_complaints.join(", ");
    const window = [fields.duration, fields.severity]
      .filter(Boolean)
      .join(", ");
    const parts: string[] = [];
    if (complaint) {
      parts.push(`HPI: ${complaint}${window ? ` (${window})` : ""}`);
    }
    if (fields.triggers.length) {
      parts.push(`Triggers: ${fields.triggers.join(", ")}`);
    }
    if (fields.associated_symptoms.length) {
      parts.push(`Symptoms: ${fields.associated_symptoms.join(", ")}`);
    }
    if (historyContext?.fitzpatrick) {
      parts.push(`Fitzpatrick: ${historyContext.fitzpatrick}`);
    }
    const regimen = [historyContext?.topicals, historyContext?.orals]
      .filter(Boolean)
      .join("; ");
    if (regimen) parts.push(`Active Skincare/Meds: ${regimen}`);
    if (historyContext?.allergies) {
      parts.push(`Allergies: ${historyContext.allergies}`);
    }
    if (parts.length === 0) {
      toast.error("Nothing recorded yet — capture a complaint or history first.");
      return;
    }
    const snippet = `${parts.join(". ")}.`;
    const merged = fields.hpi.trim()
      ? `${fields.hpi.trim()} ${snippet}`
      : snippet;
    void persist(
      { hpi: merged },
      "History pushed into today's session note (HPI).",
    );
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
      {/* 📋 Workflow bridge — profile history + today's chips into the note */}
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 font-semibold"
          onClick={pushHistoryToNote}
          disabled={!canManage}
        >
          📋 Push History to Session Note
        </Button>
      </div>

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
  // The copilot is a slide-over drawer opened from the header button — it
  // never occupies the examination body, which must stay focused on the form.
  const [copilotOpen, setCopilotOpen] = useState(false);
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
   * Builds the exam summary line pushed downstream: today's pins (this exam's
   * pins, or today's unassigned pins when the exam row is still unsaved), the
   * latest severity score, and the diagnosis with ICD-10.
   */
  function buildExamSnippet(): string | null {
    const examId = rowId || todayExam?.id || null;
    const today = todayIso();
    const pins = derm.lesions.filter(
      (pin) =>
        pin.exam_id
          ? pin.exam_id === examId
          : pin.created_at.slice(0, 10) === today,
    );
    const parts: string[] = [];
    if (pins.length > 0) {
      const pinText = pins
        .map((pin) => {
          const bits = [
            pin.morphology.join("/"),
            pin.color.join("/"),
            pin.size_value
              ? `${pin.size_value}${pin.size_unit ?? "mm"}`
              : null,
          ].filter(Boolean);
          const lat = pin.laterality
            ? `${pin.laterality.charAt(0).toUpperCase()}${pin.laterality.slice(1)} `
            : "";
          return `Pin #${pin.pin_number} ${lat}${pin.body_region} — ${
            bits.join(", ") || "unclassified"
          }`;
        })
        .join("; ");
      parts.push(`EXAMINATION: ${pinText}.`);
    }
    const scores = todayExam?.severity_scores ?? [];
    const latestScore = scores[scores.length - 1];
    if (latestScore) {
      parts.push(
        `Severity: ${latestScore.kind} ${latestScore.total} (${latestScore.band}).`,
      );
    }
    if (diagnosis.trim()) {
      parts.push(
        `DIAGNOSIS: ${diagnosis.trim()}${
          icdCode.trim()
            ? ` (ICD-10: ${icdCode.trim().toUpperCase()})`
            : ""
        }.`,
      );
    }
    return parts.length ? parts.join(" ") : null;
  }

  /**
   * [ 📋 Push Examination to Prescription & Treatment Plan ] — one tap that
   * (1) appends the structured exam summary to today's assessment, and
   * (2) appends it to the Rx tab's application instructions (today's active
   * prescription if one exists, else a fresh plan row), so the doctor never
   * re-types findings on the treatment tab.
   */
  async function pushExamToRx() {
    if (!canManage || pending) return;
    const snippet = buildExamSnippet();
    if (!snippet) {
      setError(
        "Nothing to push yet — drop pins, score severity or record a diagnosis first.",
      );
      return;
    }
    setError(null);
    setPending(true);
    const mergedAssessment = assessment.trim()
      ? `${assessment.trim()} ${snippet}`
      : snippet;
    // Update path rebuilds the payload from ALL form keys with defaults —
    // send the full state so the other fields are never wiped.
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
        assessment: mergedAssessment,
        patient_explanation: patientExplanation,
      },
      visitId,
    );
    if (!result.ok) {
      setPending(false);
      toast.error(result.message);
      return;
    }
    setAssessment(mergedAssessment);
    setRowId(result.data);

    // The prescription tab keeps its own rows: append into today's active
    // application instructions, or open a fresh plan carrying the summary.
    const latestRx = derm.prescriptions[0] ?? null;
    const rxToday =
      latestRx && latestRx.created_at.slice(0, 10) === todayIso();
    const existing = latestRx && rxToday ? latestRx.application_instructions : null;
    const mergedInstructions = existing?.trim()
      ? `${existing.trim()} ${snippet}`
      : snippet;
    const rxResult = await saveDermRxAction(
      patient.id,
      {
        id: latestRx && rxToday ? latestRx.id : null,
        topical_form: latestRx && rxToday ? latestRx.topical_form : "",
        application_instructions: mergedInstructions,
      },
      visitId,
    );
    setPending(false);
    if (rxResult.ok) {
      toast.success("Examination pushed to assessment & prescription plan");
      router.refresh();
    } else {
      toast.error(rxResult.message);
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
          {/* Tab header: one copilot entry point (slide-over), no inline card. */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-ink text-[14px] font-bold">
              Examination &amp; diagnosis
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCopilotOpen(true)}
              className="gap-1.5"
            >
              <Sparkles aria-hidden="true" className="size-3.5 text-primary" />
              AI Copilot
            </Button>
          </div>

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

          {/* Row 2: diagnosis & assessment (left) + severity scoring (right).
              Chief complaint / morphology chips were removed as duplicated UI —
              pin morphology lives on the body map, and today's complaint is
              already captured on the Overview tab. The underlying state is
              carried from today's exam and preserved on save. */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <RecordSection title="Diagnosis & assessment">
              {/* Row 1 — distribution: dedicated full-width chip row. */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-bold text-text-secondary">
                  Distribution
                </span>
                <div className="flex flex-wrap gap-2">
                  {DISTRIBUTIONS.map((option) => {
                    const active = distribution.includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        disabled={!canManage}
                        aria-pressed={active}
                        onClick={() =>
                          setDistribution(active ? [] : [option])
                        }
                        className={cn(
                          "rounded-full border px-3 py-1 text-[11.5px] font-semibold capitalize transition-colors disabled:opacity-60",
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-hairline text-text-secondary hover:border-primary/50 hover:text-text-primary",
                        )}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 2 — coded diagnosis (wide) + derived ICD-10 (narrow). */}
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="md:col-span-2">
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
                </div>
                <div className="md:col-span-1">
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

              {/* Row 3 — clinical notes: dedicated full-width row. */}
              <div className="mt-4">
                <label
                  htmlFor="derm-exam-notes"
                  className="text-ink mb-1.5 block text-[12.5px] font-bold"
                >
                  Clinical Notes (Lesion size, distribution, dermoscopy
                  findings)
                </label>
                <Textarea
                  id="derm-exam-notes"
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Lesion size, distribution, dermoscopy findings, patient instructions…"
                />
              </div>

              {/* Row 4 — reasoning (left) + patient explanation (right). */}
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="derm-exam-assessment"
                    className="text-ink mb-1.5 block text-[12.5px] font-bold"
                  >
                    Assessment &amp; Clinical Reasoning
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
                    Explanation for Patient
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
              {/* Row 5 — action bar: push CTA (primary) + save (secondary). */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={pushExamToRx}
                  disabled={pending}
                  className="gap-1.5"
                >
                  <ClipboardPaste
                    aria-hidden="true"
                    className="size-3.5"
                  />
                  Push Examination to Prescription &amp; Treatment Plan
                </Button>
                <Button
                  type="button"
                  variant="outline"
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

          {/* Slide-over copilot: opened from the header button, backdrop
              click or ✕ closes; the examination form stays underneath. */}
          {copilotOpen && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Dermatology Copilot"
              className="fixed inset-0 z-50 flex justify-end bg-black/40"
              onClick={() => setCopilotOpen(false)}
            >
              <aside
                className="h-full w-full max-w-sm overflow-y-auto border-l border-hairline bg-surface shadow-xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
                  <p className="text-ink flex items-center gap-1.5 text-[12.5px] font-bold">
                    <Sparkles
                      aria-hidden="true"
                      className="size-3.5 text-primary"
                    />
                    Dermatology Copilot
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label="Close Copilot"
                    onClick={() => setCopilotOpen(false)}
                    className="size-7 p-0"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </Button>
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
              </aside>
            </div>
          )}
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

  // Auto-import (§4): today's encounter diagnosis + procedures, pulled live
  // from the Tab 2 exam row and the Tab 4 procedure logbook into the Rx
  // builder header — one glance shows what this prescription is treating.
  const today = new Date().toISOString().slice(0, 10);
  const examForContext =
    (visitId
      ? (derm.exams.find(
          (exam) =>
            exam.visit_id === visitId &&
            exam.diagnosis?.trim(),
        ) ?? null)
      : null) ?? derm.exams.find((exam) => exam.exam_date === today) ?? null;
  const todayProcedures = derm.procedures.filter(
    (procedure) => procedure.procedure_date === today,
  );
  const todayContext = {
    diagnosis: examForContext?.diagnosis?.trim() ?? null,
    icdCode: examForContext?.icd_code?.trim() ?? null,
    procedures: todayProcedures.map((procedure) => ({
      name: procedure.procedure_name,
      bottleId: procedure.specimen_barcode ?? null,
    })),
  };

  return (
    <div className="space-y-4">
      {/* Auto-import summary badge (§4) — live from today's encounter tabs. */}
      <RecordSection
        title="Auto-imported from today's encounter"
        meta={
          <Badge className="border-primary/30 bg-primary/10 text-primary">
            Live · Tab 2 + 4
          </Badge>
        }
      >
        {todayContext.diagnosis || todayContext.procedures.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {todayContext.diagnosis && (
              <Badge className="gap-1 border-primary/30 bg-primary/10 text-primary">
                <Stethoscope aria-hidden="true" className="size-3" />
                {todayContext.diagnosis}
                {todayContext.icdCode ? ` · ICD-10 ${todayContext.icdCode}` : ""}
              </Badge>
            )}
            {todayContext.procedures.map((procedure) => (
              <Badge
                key={procedure.name}
                className="gap-1 bg-app text-text-secondary"
              >
                <Scissors aria-hidden="true" className="size-3" />
                {procedure.name}
                {procedure.bottleId ? ` · Bottle ${procedure.bottleId}` : ""}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-[12.5px] text-text-muted">
            {visitId
              ? "No diagnosis or procedure recorded on today's encounter yet."
              : "Recording a diagnosis (Tab 2) or a procedure (Tab 4) today will surface it here automatically."}
          </p>
        )}
      </RecordSection>

      <DermRxMeds
        patientId={patient.id}
        patient={patient}
        prescription={latest}
        today={todayContext}
        allergies={allergies}
        canManage={canManage}
        visitId={visitId}
      />

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
