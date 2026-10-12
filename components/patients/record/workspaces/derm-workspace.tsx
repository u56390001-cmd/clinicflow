/**
 * Dermatology workspace — the Dermatologist's patient record tabs (migration
 * 0077). Replaces the general record's tab group for doctors whose specialty
 * resolves to `dermatology`.
 *
 * Skin photos live in the patient's Documents (their upload bucket already
 * exists); this workspace's Photo & Body Mapping tab marks those images up —
 * body region, baseline / follow-up / post-treatment, before-after pairing and
 * lesion notes — in `derm_photos` rather than owning files.
 */

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarDays,
  Camera,
  FileImage,
  ImagePlus,
  Loader2,
  Scissors,
  Stethoscope,
  Trash2,
} from "lucide-react";

import { AutosaveNote, ChipPicker, SpecialtyHeading } from "@/components/patients/record/workspaces/specialty-form";
import { RecordEmpty, RecordFact, RecordNote, RecordSection } from "@/components/patients/record/record-primitives";
import { CopilotDrawer } from "@/components/consultation/copilot-drawer";
import { DocumentsTab } from "@/components/patients/record/documents-tab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  deleteDermExamAction,
  deleteDermPhotoAction,
  deleteDermProcedureAction,
  saveDermExamAction,
  saveDermPhotoAction,
  saveDermProcedureAction,
  saveDermProfileAction,
  saveDermRxAction,
} from "@/lib/actions/specialty-workspaces";
import type { DermNoteExtraction, WorkspaceExtraction } from "@/lib/copilot/types";
import { patientDirectoryHref } from "@/lib/patient-directory";
import type { PatientDermBundle } from "@/lib/patient-record";
import { DERMATOLOGY_WORKSPACE, type DermTabId } from "@/lib/specialty-workspaces";
import type { PatientDocumentView } from "@/lib/patient-documents-queries";
import type {
  DermExam,
  DermPhoto,
  DermPrescription,
  DermProcedure,
  PatientDirectoryRow,
} from "@/types/database";

type Props = {
  patient: PatientDirectoryRow;
  derm: PatientDermBundle;
  documents: PatientDocumentView[];
  activeTab: DermTabId;
  canManage: boolean;
  params: { selectedId: string };
  timezone: string;
};

export function DermWorkspace({ patient, derm, documents, activeTab, canManage, params, timezone }: Props) {
  return (
    <div className="tab-fade-in space-y-4">
      {activeTab === "derm_overview" && <SkinOverviewTab patient={patient} derm={derm} canManage={canManage} />}
      {activeTab === "derm_exam" && <ExamTab patient={patient} derm={derm} canManage={canManage} />}
      {activeTab === "derm_photos" && <PhotosTab patient={patient} derm={derm} documents={documents} canManage={canManage} params={params} />}
      {activeTab === "derm_procedures" && <ProceduresTab patient={patient} derm={derm} canManage={canManage} />}
      {activeTab === "derm_rx" && <RxTab patient={patient} derm={derm} canManage={canManage} />}
      {activeTab === "derm_documents" && (
        <DocumentsTab patientId={patient.id} documents={documents} timezone={timezone} canManage={canManage} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Skin Overview                                                             */
/* ------------------------------------------------------------------------- */

function SkinOverviewTab({ patient, derm, canManage }: { patient: PatientDirectoryRow; derm: PatientDermBundle; canManage: boolean }) {
  const profile = derm.profile;

  const save =
    (field: keyof NonNullable<PatientDermBundle["profile"]>) =>
    (value: string) =>
      saveDermProfileAction(patient.id, { [field]: value }).then((r) => r.ok);

  const toggleBiopsyAlert = async (checked: boolean) => {
    const result = await saveDermProfileAction(patient.id, { biopsy_alert: checked });
    if (result.ok) toast.success(checked ? "Biopsy alert set" : "Biopsy alert cleared");
    else toast.error(result.message);
  };

  const fields: Array<{ field: "skin_type" | "active_conditions" | "allergies" | "previous_skin_conditions" | "biopsy_notes" | "previous_treatment_history"; label: string }> = [
    { field: "skin_type", label: "Skin type" },
    { field: "active_conditions", label: "Active conditions" },
    { field: "allergies", label: "Allergies" },
    { field: "previous_skin_conditions", label: "Previous skin conditions" },
    { field: "previous_treatment_history", label: "Previous treatment history" },
    { field: "biopsy_notes", label: "Biopsy notes" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <RecordSection title="Skin profile" className="lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[12.5px] font-bold text-ink">
              <input
                type="checkbox"
                checked={profile?.biopsy_alert ?? false}
                onChange={(e) => canManage && toggleBiopsyAlert(e.target.checked)}
                disabled={!canManage}
                className="size-4 accent-[var(--color-primary)]"
              />
              <Stethoscope aria-hidden="true" className="size-4 text-primary" />
              Biopsy alert
            </label>
            {profile?.biopsy_alert && <Badge className="bg-red-100 text-red-600">Biopsy pending</Badge>}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {fields.map(({ field, label }) => (
              <AutosaveNote
                key={field}
                label={label}
                name={`derm-profile-${field}`}
                value={profile?.[field] ?? null}
                onSave={canManage ? save(field) : async () => true}
                rows={3}
              />
            ))}
          </div>
        </RecordSection>

        <RecordSection title="Patient Skin Profile">
          <dl className="grid grid-cols-1 gap-3">
            <RecordFact label="Patient">{patient.name}</RecordFact>
            <RecordFact label="ID">{patient.patient_code}</RecordFact>
            <RecordFact label="Phone">{patient.phone}</RecordFact>
            <RecordFact label="Skin examinations">{derm.exams.length}</RecordFact>
            <RecordFact label="Procedures">{derm.procedures.length}</RecordFact>
            <RecordFact label="Tagged photos">{derm.photos.length}</RecordFact>
            {derm.exams[0] && (
              <RecordFact label="Latest diagnosis">{derm.exams[0].diagnosis ?? "—"}</RecordFact>
            )}
          </dl>
        </RecordSection>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Skin Examination                                                          */
/* ------------------------------------------------------------------------- */

const CHIEF_COMPLAINTS = ["Rash", "Itching", "Pain", "Lesion"] as const;
const MORPHOLOGY = ["Macule", "Papule", "Plaque", "Nodule", "Vesicle"] as const;
const DISTRIBUTIONS = ["Localized", "Generalized", "Dermatomal"] as const;

function ExamTab({ patient, derm, canManage }: { patient: PatientDirectoryRow; derm: PatientDermBundle; canManage: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [complaints, setComplaints] = useState<string[]>([]);
  const [morphology, setMorphology] = useState<string[]>([]);
  const [distribution, setDistribution] = useState<string[]>([]);
  const [diagnosis, setDiagnosis] = useState("");
  const [icdCode, setIcdCode] = useState("");
  const [notes, setNotes] = useState("");

  async function addExam() {
    if (!canManage) return;
    setPending(true);
    const result = await saveDermExamAction(patient.id, {
      chief_complaints: complaints,
      morphology,
      distribution: distribution[0] ?? null,
      diagnosis: diagnosis || null,
      icd_code: icdCode || null,
      notes: notes || null,
    });
    setPending(false);
    if (result.ok) {
      toast.success("Examination recorded");
      setComplaints([]);
      setMorphology([]);
      setDistribution([]);
      setDiagnosis("");
      setIcdCode("");
      setNotes("");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function removeExam(id: string) {
    const result = await deleteDermExamAction(id);
    if (result.ok) router.refresh();
    else toast.error(result.message);
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
      options.find((option) => option.toLowerCase() === raw.trim().toLowerCase()) ?? null;

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
      note.application_instructions && `Application: ${note.application_instructions}`,
      note.patient_instructions && `Instructions: ${note.patient_instructions}`,
      unmatched.length > 0 && `Additional findings: ${unmatched.join(", ")}`,
    ].filter((part): part is string => Boolean(part && part.trim()));
    if (noteParts.length > 0) setNotes(noteParts.join("\n\n"));
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1">
        <RecordSection title="Skin Examination">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ChipPicker label="Chief complaint" value={complaints} onChange={setComplaints} options={CHIEF_COMPLAINTS} />
            <ChipPicker label="Morphology" value={morphology} onChange={setMorphology} options={MORPHOLOGY} />
            <ChipPicker label="Distribution" single value={distribution} onChange={setDistribution} options={DISTRIBUTIONS} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-ink mb-1.5 text-[12.5px] font-bold">Diagnosis</p>
                <input
                  type="text"
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  placeholder="e.g. Plaque psoriasis"
                  className="w-full rounded-control border border-text-muted/25 bg-surface px-2 py-1.5 text-[12.5px] text-text-primary outline-none"
                />
              </div>
              <div>
                <p className="text-ink mb-1.5 text-[12.5px] font-bold">ICD code</p>
                <input
                  type="text"
                  value={icdCode}
                  onChange={(e) => setIcdCode(e.target.value.toUpperCase())}
                  placeholder="e.g. L40.0"
                  className="w-full rounded-control border border-text-muted/25 bg-surface px-2 py-1.5 font-mono text-[12.5px] text-text-primary outline-none"
                />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <p className="text-ink mb-1.5 text-[12.5px] font-bold">Notes</p>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full resize-y rounded-control border border-text-muted/25 bg-surface p-2.5 text-[12.5px] leading-relaxed text-text-primary outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button type="button" size="sm" onClick={addExam} disabled={pending} className="gap-1.5">
              {pending ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : <Stethoscope aria-hidden="true" className="size-3.5" />}
              {pending ? "Saving…" : "Record examination"}
            </Button>
          </div>
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
        </div>
      )}

      {derm.exams.length > 0 ? (
        <div className="space-y-3">
          <SpecialtyHeading title="Examination history" description="Newest first" />
          {derm.exams.map((exam) => (
            <ExamRow key={exam.id} exam={exam} canManage={canManage} onDelete={removeExam} />
          ))}
        </div>
      ) : (
        <RecordEmpty
          icon={Stethoscope}
          title="No examinations yet"
          description="Record each skin examination with chief complaint, morphology, distribution and ICD-assisted diagnosis."
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

function ExamRow({ exam, canManage, onDelete }: { exam: DermExam; canManage: boolean; onDelete: (id: string) => void }) {
  const complaints = exam.chief_complaints.map((c) => COMPLAINT_LABEL[c.toLowerCase()] ?? c);
  const morphology = exam.morphology.map((m) => MORPHOLOGY_LABEL[m.toLowerCase()] ?? m);

  return (
    <RecordSection
      title={`${exam.exam_date} — ${exam.diagnosis || "Examination"}`}
      meta={
        canManage && (
          <Button type="button" variant="ghost" size="sm" className="text-status-destructive" onClick={() => onDelete(exam.id)}>
            <Trash2 aria-hidden="true" className="size-3.5" />
          </Button>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {complaints.map((c) => (
          <Badge key={c} className="bg-app text-text-secondary">{c}</Badge>
        ))}
        {morphology.map((m) => (
          <Badge key={m} className="bg-primary/10 text-primary">{m}</Badge>
        ))}
        {exam.distribution && <Badge className="bg-amber-100 text-amber-700 capitalize">{exam.distribution}</Badge>}
        {exam.icd_code && <span className="font-mono text-[11px] text-ink-faint">{exam.icd_code}</span>}
      </div>
      <RecordNote label="Notes" value={exam.notes} />
    </RecordSection>
  );
}

/* ------------------------------------------------------------------------- */
/* Photo & Body Mapping                                                      */
/* ------------------------------------------------------------------------- */

const PHOTO_TYPES = ["Baseline", "Follow-up", "Post-treatment"] as const;
const BODY_REGIONS = [
  "Scalp",
  "Face / Ears",
  "Neck",
  "Chest",
  "Back",
  "Abdomen",
  "Shoulders",
  "Upper arm — Left",
  "Upper arm — Right",
  "Forearm — Left",
  "Forearm — Right",
  "Hands",
  "Thighs",
  "Lower legs",
  "Feet",
  "Nails",
  "Groin / Genitals",
] as const;

function PhotosTab({
  patient,
  derm,
  documents,
  canManage,
  params,
}: {
  patient: PatientDirectoryRow;
  derm: PatientDermBundle;
  documents: PatientDocumentView[];
  canManage: boolean;
  params: { selectedId: string };
}) {
  const router = useRouter();
  const images = useMemo(
    () => documents.filter((doc) => doc.mime_type.startsWith("image/")),
    [documents],
  );

  const [pending, setPending] = useState(false);
  const [documentId, setDocumentId] = useState("");
  const [region, setRegion] = useState("");
  const [photoType, setPhotoType] = useState("Baseline");
  const [lesionNotes, setLesionNotes] = useState("");
  const [pairedWith, setPairedWith] = useState("");

  async function tagPhoto() {
    if (!canManage) return;
    if (!documentId) {
      toast.error("Pick an uploaded image to tag");
      return;
    }
    setPending(true);
    const result = await saveDermPhotoAction(patient.id, {
      document_id: documentId,
      body_region: region,
      photo_type: photoType.toLowerCase().replace("-", "_").replace(" ", "_"),
      lesion_notes: lesionNotes || null,
      paired_with: pairedWith || null,
    });
    setPending(false);
    if (result.ok) {
      toast.success("Photo tagged");
      setDocumentId("");
      setRegion("");
      setPhotoType("Baseline");
      setLesionNotes("");
      setPairedWith("");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function removePhoto(id: string) {
    const result = await deleteDermPhotoAction(id);
    if (result.ok) router.refresh();
    else toast.error(result.message);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SpecialtyHeading
          title="Skin images"
          description="Files live in Documents; tag uploaded images here with region and before/after pairing."
        >
          {canManage && images.length > 0 && (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link
                href={patientDirectoryHref({ selectedId: params.selectedId, tab: "derm_documents" })}
                scroll={false}
              >
                <ImagePlus aria-hidden="true" className="size-3.5" />
                Upload images
              </Link>
            </Button>
          )}
        </SpecialtyHeading>
      </div>

      {canManage && (
        <RecordSection title="Tag a skin photo">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-ink mb-1.5 text-[12.5px] font-bold">Uploaded image</p>
              {images.length > 0 ? (
                <select
                  value={documentId}
                  onChange={(e) => setDocumentId(e.target.value)}
                  className="w-full rounded-control border border-text-muted/25 bg-surface px-2 py-1.5 text-[12.5px] text-text-primary outline-none"
                >
                  <option value="">Pick an image…</option>
                  {images.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.document_name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-ink-faint text-[12px] italic">
                  No images uploaded yet — upload on the Documents tab.
                </p>
              )}
            </div>
            <div>
              <p className="text-ink mb-1.5 text-[12.5px] font-bold">Body region</p>
              <input
                type="text"
                list="derm-body-regions"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="e.g. Back"
                className="w-full rounded-control border border-text-muted/25 bg-surface px-2 py-1.5 text-[12.5px] text-text-primary outline-none"
              />
              <datalist id="derm-body-regions">
                {BODY_REGIONS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
            <div>
              <p className="text-ink mb-1.5 text-[12.5px] font-bold">Photo type</p>
              <select
                value={photoType}
                onChange={(e) => setPhotoType(e.target.value)}
                className="w-full rounded-control border border-text-muted/25 bg-surface px-2 py-1.5 text-[12.5px] text-text-primary outline-none"
              >
                {PHOTO_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-ink mb-1.5 text-[12.5px] font-bold">Before / after pair</p>
              <select
                value={pairedWith}
                onChange={(e) => setPairedWith(e.target.value)}
                className="w-full rounded-control border border-text-muted/25 bg-surface px-2 py-1.5 text-[12.5px] text-text-primary outline-none"
              >
                <option value="">— None —</option>
                {derm.photos.map((photo) => (
                  <option key={photo.id} value={photo.id}>
                    {photo.body_region} · {photo.photo_type.replace(/_/g, " ")} · {photo.taken_at}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <p className="text-ink mb-1.5 text-[12.5px] font-bold">Lesion notes</p>
            <textarea
              rows={2}
              value={lesionNotes}
              onChange={(e) => setLesionNotes(e.target.value)}
              className="w-full resize-y rounded-control border border-text-muted/25 bg-surface p-2.5 text-[12.5px] leading-relaxed text-text-primary outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button type="button" size="sm" onClick={tagPhoto} disabled={pending} className="gap-1.5">
              {pending ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : <Camera aria-hidden="true" className="size-3.5" />}
              {pending ? "Saving…" : "Tag photo"}
            </Button>
          </div>
        </RecordSection>
      )}

      {derm.photos.length > 0 ? (
        <div className="space-y-3">
          <SpecialtyHeading title="Mapped photos" description="Newest first" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {derm.photos.map((photo) => (
              <PhotoRow key={photo.id} photo={photo} canManage={canManage} onDelete={removePhoto} />
            ))}
          </div>
        </div>
      ) : (
        <RecordEmpty
          icon={FileImage}
          title="No photos mapped"
          description="Upload skin images on the Documents tab, then tag each with a body region for before/after comparison."
        />
      )}
    </div>
  );
}

const PHOTO_TYPE_LABEL: Record<string, string> = {
  baseline: "Baseline",
  follow_up: "Follow-up",
  post_treatment: "Post-treatment",
};

function PhotoRow({ photo, canManage, onDelete }: { photo: DermPhoto; canManage: boolean; onDelete: (id: string) => void }) {
  return (
    <RecordSection
      title={`${photo.body_region} — ${PHOTO_TYPE_LABEL[photo.photo_type] ?? photo.photo_type}`}
      meta={
        canManage && (
          <Button type="button" variant="ghost" size="sm" className="text-status-destructive" onClick={() => onDelete(photo.id)}>
            <Trash2 aria-hidden="true" className="size-3.5" />
          </Button>
        )
      }
    >
      <p className="text-[11px] text-ink-faint">{photo.taken_at}</p>
      <RecordNote label="Lesion notes" value={photo.lesion_notes} />
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

function ProceduresTab({ patient, derm, canManage }: { patient: PatientDirectoryRow; derm: PatientDermBundle; canManage: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [consent, setConsent] = useState<string[]>(["Documented"]);
  const [notes, setNotes] = useState("");

  async function addProcedure() {
    if (!canManage) return;
    setPending(true);
    const result = await saveDermProcedureAction(patient.id, {
      procedure_name: name,
      procedure_date: date || null,
      consent_status: (consent[0] ?? "Documented").toLowerCase(),
      notes: notes || null,
    });
    setPending(false);
    if (result.ok) {
      toast.success("Procedure recorded");
      setName("");
      setDate("");
      setConsent(["Documented"]);
      setNotes("");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function removeProcedure(id: string) {
    const result = await deleteDermProcedureAction(id);
    if (result.ok) router.refresh();
    else toast.error(result.message);
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <RecordSection title="Record a procedure">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {PROCEDURE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setName(preset)}
                className="rounded-pill border border-hairline bg-app px-2.5 py-1 text-[11.5px] font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
              >
                {preset}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-ink mb-1.5 text-[12.5px] font-bold">Procedure name</p>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Punch biopsy"
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
            <ChipPicker label="Consent status" single value={consent} onChange={setConsent} options={CONSENT_OPTIONS} />
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
            <Button type="button" size="sm" onClick={addProcedure} disabled={pending || !name.trim()} className="gap-1.5">
              {pending ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : <Scissors aria-hidden="true" className="size-3.5" />}
              {pending ? "Saving…" : "Record procedure"}
            </Button>
          </div>
        </RecordSection>
      )}

      {derm.procedures.length > 0 ? (
        <div className="space-y-3">
          <SpecialtyHeading title="Procedure history" description="Newest first" />
          {derm.procedures.map((procedure) => (
            <ProcedureRow key={procedure.id} procedure={procedure} canManage={canManage} onDelete={removeProcedure} />
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

function ProcedureRow({ procedure, canManage, onDelete }: { procedure: DermProcedure; canManage: boolean; onDelete: (id: string) => void }) {
  return (
    <RecordSection
      title={`${procedure.procedure_name}`}
      meta={
        canManage && (
          <Button type="button" variant="ghost" size="sm" className="text-status-destructive" onClick={() => onDelete(procedure.id)}>
            <Trash2 aria-hidden="true" className="size-3.5" />
          </Button>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1 text-[11px] text-ink-faint">
          <CalendarDays aria-hidden="true" className="size-3.5" />
          {procedure.procedure_date}
        </span>
        {procedure.consent_status && <Badge className="bg-app text-text-secondary">{CONSENT_LABEL[procedure.consent_status] ?? procedure.consent_status}</Badge>}
      </div>
      <RecordNote label="Notes" value={procedure.notes} />
    </RecordSection>
  );
}

/* ------------------------------------------------------------------------- */
/* Dermatology Prescription                                                  */
/* ------------------------------------------------------------------------- */

const TOPICAL_FORMS = ["Cream", "Ointment", "Gel", "Lotion"] as const;

function RxTab({ patient, derm, canManage }: { patient: PatientDirectoryRow; derm: PatientDermBundle; canManage: boolean }) {
  const router = useRouter();
  const latest = derm.prescriptions[0] ?? null;

  const [pending, setPending] = useState(false);
  const [form, setForm] = useState<string[]>(latest?.topical_form ? [latest.topical_form] : []);

  async function saveRx() {
    if (!canManage) return;
    setPending(true);
    const result = await saveDermRxAction(patient.id, {
      id: latest?.id ?? null,
      topical_form: (form[0] as Exclude<DermPrescription["topical_form"], null> | null) ?? null,
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
        title={latest ? `Dermatology prescription · ${latest.created_at.slice(0, 10)}` : "Dermatology prescription"}
      >
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <ChipPicker label="Topical form" single value={form} onChange={setForm} options={TOPICAL_FORMS} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <AutosaveNote
            label="Application instructions"
            name="derm-rx-application"
            value={latest?.application_instructions}
            onSave={canManage ? async (value) => saveDermRxAction(patient.id, { id: latest?.id ?? null, application_instructions: value || null, topical_form: (form[0] as Exclude<DermPrescription["topical_form"], null> | null) ?? null }).then((r) => r.ok) : async () => true}
            rows={3}
            placeholder="e.g. Apply thin layer twice daily"
          />
          <AutosaveNote
            label="Patient education"
            name="derm-rx-education"
            value={latest?.patient_education}
            onSave={canManage ? async (value) => saveDermRxAction(patient.id, { id: latest?.id ?? null, patient_education: value || null, topical_form: (form[0] as Exclude<DermPrescription["topical_form"], null> | null) ?? null }).then((r) => r.ok) : async () => true}
            rows={3}
          />
          <AutosaveNote
            label="Skincare routine — AM"
            name="derm-rx-am"
            value={latest?.skincare_routine_am}
            onSave={canManage ? async (value) => saveDermRxAction(patient.id, { id: latest?.id ?? null, skincare_routine_am: value || null, topical_form: (form[0] as Exclude<DermPrescription["topical_form"], null> | null) ?? null }).then((r) => r.ok) : async () => true}
            rows={3}
          />
          <AutosaveNote
            label="Skincare routine — PM"
            name="derm-rx-pm"
            value={latest?.skincare_routine_pm}
            onSave={canManage ? async (value) => saveDermRxAction(patient.id, { id: latest?.id ?? null, skincare_routine_pm: value || null, topical_form: (form[0] as Exclude<DermPrescription["topical_form"], null> | null) ?? null }).then((r) => r.ok) : async () => true}
            rows={3}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="button" size="sm" onClick={saveRx} disabled={pending} className="gap-1.5">
            {pending ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : null}
            {pending ? "Saving…" : "Save prescription"}
          </Button>
        </div>
      </RecordSection>

      {derm.prescriptions.length > 1 && (
        <div className="space-y-3">
          <SpecialtyHeading title="Previous prescriptions" description="Newest first" />
          {derm.prescriptions.slice(1).map((rx) => (
            <RxRow key={rx.id} rx={rx} />
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

function RxRow({ rx }: { rx: DermPrescription }) {
  return (
    <RecordSection title={`${rx.created_at.slice(0, 10)} — ${rx.topical_form ? `Topical ${TOPICAL_LABEL[rx.topical_form] ?? rx.topical_form}` : "Prescription"}`}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <RecordNote label="Application instructions" value={rx.application_instructions} />
        <RecordNote label="Patient education" value={rx.patient_education} />
        <RecordNote label="AM routine" value={rx.skincare_routine_am} />
        <RecordNote label="PM routine" value={rx.skincare_routine_pm} />
      </div>
    </RecordSection>
  );
}