"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  CheckCircle,
  Eye,
  FileText,
  ListChecks,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Printer,
  Sparkles,
  TestTube2,
  Stethoscope,
} from "lucide-react";

import { PrescriptionPreview } from "@/components/consultation/prescription-preview";
import {
  TemplateLoadMenu,
  TemplateSaveControl,
} from "@/components/consultation/template-manager";
import { CopilotDrawer } from "@/components/consultation/copilot-drawer";
import { MedicationReviewActions } from "@/components/patients/record/medication-review-actions";
import { AI_SUMMARY_EMPTY_STATE } from "@/components/patients/record/ai-summary-card";
import {
  draftFromPrescription,
  usePrescriptionDraft,
  type PrescriptionDraft,
} from "@/components/patients/record/prescription-draft-context";
import {
  applyTemplate,
  followUpDateFrom,
  medicineEntryFromMedication,
  prescriptionFormData,
  RxBuilder,
} from "@/components/patients/record/rx-builder";
import type { ActiveVisitInfo } from "@/components/patients/record/record-banner";
import type { PastLabHistoryEntry } from "@/components/patients/record/past-lab-history-modal";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { VitalsForm } from "@/components/queue/vitals-form";
import {
  completeAndAdvanceAction,
  savePrescriptionAction,
} from "@/lib/actions/consultation";
import {
  fetchPrescriptionTemplates,
  findDoctorForUser,
} from "@/lib/consultation-queries";
import { createClient } from "@/lib/supabase/client";
import {
  patientDirectoryHref,
  type PatientDirectoryParams,
} from "@/lib/patient-directory";
import { patientDocumentHref } from "@/lib/patient-documents-queries";
import { avatarColorFor, initialsOf } from "@/lib/utils/avatar";
import { ageFromDob, formatNaiveDate } from "@/lib/utils/datetime";
import { computeBmi, deriveBloodPressure } from "@/lib/vitals-fields";
import { cn } from "@/lib/utils";

import type { ConsultationPreAnswer } from "@/lib/consultation-queries";
import type { PatientDocumentView } from "@/lib/patient-documents-queries";
import type { CopilotExtraction } from "@/lib/copilot/types";
import type {
  Doctor,
  MedicineEntry,
  PatientDirectoryRow,
  PatientMedication,
  PatientLabResult,
  Prescription,
  PrescriptionTemplate,
  Vitals,
} from "@/types/database";

type VisitDoctor = {
  id: string | null;
  name: string | null;
  specialty: string | null;
};

/** The micro-label above every value in the rail. */
const FIELD_LABEL =
  "text-[10px] font-bold uppercase leading-none tracking-[0.07em] text-text-muted";
/** A section rule inside the rail. */
const RAIL_HEAD =
  "flex items-center gap-1.5 border-b border-hairline pb-1.5 text-[10px] font-bold uppercase leading-none tracking-[0.08em] text-text-muted";

const GENDER_LABELS: Record<"male" | "female" | "other", string> = {
  male: "Male",
  female: "Female",
  other: "Other",
};

/**
 * The AI summary as at most three lines.
 *
 * Summaries reach the `patients` row as "- " bullets on separate lines (both the
 * record generator and the document scanner write them that way), so the same
 * strip AiSummaryCard renders on the Overview tab is parsed the same way here —
 * the leading marker is dropped and a teal dot replaces it.
 *
 * Three, not all. A rail is a glance, not a read: the full summary belongs on the
 * Overview tab, and what earns its place next to a prescription is the top of
 * the list — the presenting problem and the standing conditions.
 */
function summaryLines(summary: string | null | undefined, limit = 3) {
  return (summary ?? "")
    .split("\n")
    .map((line) => line.replace(/^[-•*]\s+/, "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

/**
 * The prescription workspace — the record's Prescriptions tab, working.
 *
 * It replaced a full-screen overlay that mounted the whole consultation screen
 * behind a modal: same form, but the patient record underneath stayed dark and
 * unreachable, every fact on it was re-fetched, and the doctor's browser Back
 * button had nowhere to go. Embedded, the workspace reads straight from the
 * record's own data.
 *
 * The shape is a clinical console, not a page of cards. A collapsible rail on
 * the left holds everything that is *about* the patient and nothing the doctor
 * writes — vitals, the pre-consultation answers, reports on file, and the
 * medicines AI read out of scanned documents — and collapses to a 52px strip so
 * the writing surface can take a laptop screen whole. The right side is the only
 * part that changes as the consultation goes on, so it gets the width, the
 * attention, and its own scrollbar: a prescription is long, and the bar that
 * ends it must not scroll away with the eighth medicine.
 *
 * There is deliberately no patient header here. The record already names the
 * patient above the tab bar, and a second copy of the name and phone inside
 * every tab is the kind of redundancy that makes a dense screen feel cluttered
 * without making it more informative.
 */
/**
 * How many rows a rail list shows before it hands over to a modal. Past five
 * the doctor's eye stops scanning the list and starts scrolling it, and a
 * scrolling sidebar pushes the vitals above it out of reach.
 */
const RAIL_ITEM_LIMIT = 5;

/**
 * A short heading for the abnormal flag, derived from the enum rather than
 * stored: "High" and "Critical" are different clinical signals and the doctor
 * has to be able to tell them apart at a glance in a 220px scroll.
 */
const ABNORMAL_LABEL: Record<
  NonNullable<PatientLabResult["abnormal"]>,
  string
> = {
  normal: "Normal",
  high: "High",
  low: "Low",
  critical: "Critical",
};

/**
 * One extracted lab value: what it measures on the left, what it came out as
 * on the right.
 *
 * The value carries the visual weight and the test name supports it, because a
 * rail is scanned for "which number is out" — not read for the report. The
 * abnormal flag is a text badge rather than a coloured dot: a dot is unreadable
 * to a red-green colourblind reader, and "High" versus "Low" is a direction the
 * dot could not carry anyway.
 */
function ScannedLabRow({ result }: { result: PatientLabResult }) {
  const abnormal =
    result.abnormal && result.abnormal !== "normal" ? result.abnormal : null;
  return (
    <li className="flex min-w-0 items-center justify-between gap-2 rounded-[8px] border border-hairline bg-surface px-2 py-1.5">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-ink truncate text-[12px] font-bold">
          {result.test_name}
        </span>
        <span className="truncate text-[11px] text-text-muted">
          {result.report_date ? formatNaiveDate(result.report_date) : "No date"}
        </span>
      </span>
      <span className="flex shrink-0 items-baseline gap-1">
        <span className="text-ink text-[12px] font-bold tabular-nums">
          {result.test_value ?? "—"}
        </span>
        {result.unit && (
          <span className="text-[11px] text-text-muted">{result.unit}</span>
        )}
        {abnormal && (
          <Badge
            variant={abnormal === "critical" ? "destructive" : "warning"}
            className="text-[9px]"
          >
            {ABNORMAL_LABEL[abnormal]}
          </Badge>
        )}
      </span>
    </li>
  );
}

/**
 * One scanned-document medicine, with its import tick.
 *
 * The tick is the doc's strictest rule and the reason this is its own
 * component: it is disabled until a clinician has approved the row. A
 * pending row is still a machine's reading of a scan, and an unverified
 * medicine name reaching a prescription is the exact failure the review
 * gate exists to prevent — so the disabled state is also spelled out in
 * text, since a grey tick alone reads as "broken" rather than "locked".
 */
function ScannedMedicineRow({
  medication,
  checked,
  onToggle,
  canManage,
}: {
  medication: PatientMedication;
  checked: boolean;
  onToggle: (medication: PatientMedication, next: boolean) => void;
  canManage: boolean;
}) {
  const verified = medication.status === "active";
  const inputId = `scanned-${medication.id}`;
  const details = [
    medication.strength,
    medication.frequency,
    medication.duration,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded-[8px] border bg-surface px-2 py-1.5",
        verified ? "border-hairline" : "border-hairline-soft",
      )}
    >
      <input
        type="checkbox"
        id={inputId}
        checked={checked}
        disabled={!verified}
        onChange={(event) => onToggle(medication, event.target.checked)}
        aria-label={
          verified
            ? `Add ${medication.medicine_name} to this prescription`
            : `${medication.medicine_name} — verify this medicine before it can be added`
        }
        className={cn(
          "mt-0.5 size-3.5 shrink-0 accent-primary",
          !verified && "cursor-not-allowed opacity-40",
        )}
      />
      <label
        htmlFor={inputId}
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          verified ? "cursor-pointer" : "cursor-not-allowed",
        )}
      >
        <span
          className={cn(
            "truncate text-[12px] font-semibold",
            verified ? "text-ink" : "text-text-muted",
          )}
        >
          {medication.medicine_name}
        </span>
        {details && (
          <span className="truncate text-[11px] text-text-muted">
            {details}
          </span>
        )}
        {!verified && (
          <span className="text-ink-faint text-[10px] font-semibold uppercase tracking-[0.04em]">
            {medication.status === "discontinued" ? "Discarded" : "Unverified"}
          </span>
        )}
      </label>
      {medication.status === "active_pending" && canManage && (
        <MedicationReviewActions medicationId={medication.id} />
      )}
    </li>
  );
}

export function PrescriptionWorkspace({
  clinicId,
  clinic,
  patient,
  visit,
  visitVitals,
  visitPrescription,
  doctor,
  documents,
  scannedMedicines,
  pastMedicines,
  pastLabHistory,
  labResults,
  recentVisits,
  preAnswers,
  timezone,
  canManage,
  params,
}: {
  clinicId: string;
  clinic: { name: string; address: string | null; phone: string | null };
  patient: PatientDirectoryRow;
  visit: ActiveVisitInfo;
  visitVitals: Vitals | null;
  visitPrescription: Prescription | null;
  /** The visit's assigned doctor — drives templates and the print header. */
  doctor: VisitDoctor | null;
  /** Reports and documents already on file for this patient. */
  documents: PatientDocumentView[];
  /**
   * Lab values extracted from scanned reports (migration 0053), newest first.
   * Only `ai_ocr` rows are listed — a manually entered value would be a lie
   * under a heading that says "OCR".
   */
  labResults: PatientLabResult[];
  /** Medicines AI read from scanned documents, awaiting the doctor's review. */
  scannedMedicines: PatientMedication[];
  /**
   * This patient's earlier medicines, most recent course per drug, with the
   * date and the doctor who wrote it.
   */
  pastMedicines: {
    medicine: MedicineEntry;
    /** Sort key: the visit date, falling back to the row's creation time. */
    lastUsed: string;
    prescribedOn: string | null;
    doctorName: string | null;
  }[];
  /**
   * Lab tests ordered on earlier visits, newest first, for the builder's
   * "Previous Lab History" modal. The current visit is already excluded by the
   * caller.
   */
  pastLabHistory: PastLabHistoryEntry[];
  /**
   * The last two or three past visits — the rail's history strip. The current
   * visit is already excluded by the caller.
   */
  recentVisits: {
    id: string;
    visitDate: string | null;
    doctorName: string | null;
    chiefComplaint: string;
    diagnosis: string;
  }[];
  preAnswers: ConsultationPreAnswer[];
  timezone: string;
  canManage: boolean;
  params: PatientDirectoryParams;
}) {
  const router = useRouter();
  const [railOpen, setRailOpen] = useState(true);
  const [scannedOpen, setScannedOpen] = useState(true);
  const [medsDialogOpen, setMedsDialogOpen] = useState(false);
  const [labResultsDialogOpen, setLabResultsDialogOpen] = useState(false);
  const [reportsDialogOpen, setReportsDialogOpen] = useState(false);
  /**
   * The rail's two write surfaces, each closed until asked for.
   *
   * Vitals used to be context-only in this panel, and that was right while the
   * numbers came from reception: a prescription screen that silently re-saves
   * vitals nobody meant to touch is a clinical hazard. The doctor now asks for
   * the edit explicitly, and the form that opens is the record's own
   * `VitalsForm` — same validation, same doctor field config, same write — so
   * there is only one place in the app where a reading can be corrected.
   */
  const [vitalsEditing, setVitalsEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  /**
   * Full screen. The rail collapse buys back width inside the tab; this buys
   * back the page around it — the record header, the tab strip and the queue
   * all stop competing for a prescription that is eight medicines long. It is a
   * mode of the same mounted workspace, never a second copy, so nothing
   * half-written is ever in one place and not the other.
   */
  const [expanded, setExpanded] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  /**
   * Full screen is a *relocation*, not a second copy.
   *
   * The workspace lives in a host <div> this component owns outright. Closed,
   * that host sits inside the tab and the workspace is a card between the tab
   * strip and the tab body. Open, the same host node moves to <body> and the
   * workspace inside it goes `fixed`, clear of the app shell entirely.
   *
   * It has to leave the tab rather than out-rank it. The shell's header is
   * `sticky top-0 z-30` with `backdrop-blur`, and no z-index on an element
   * inside the record can ever paint over that — a high number only competes
   * within its own stacking context, and the tab body is nested below the
   * header. Portalling to <body> is the only way to actually be on top.
   *
   * Moving the host (rather than conditionally rendering a portal) keeps one
   * mounted instance the whole time, so the draft, the rail's width, the open
   * dropdowns and the scroll positions all survive the trip.
   */
  const slotRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = document.createElement("div");
    setHost(element);
    return () => element.remove();
  }, []);

  useEffect(() => {
    if (!host || !slotRef.current) return;
    const target = expanded ? document.body : slotRef.current;
    if (host.parentElement !== target) target.appendChild(host);
  }, [host, expanded]);

  useEffect(() => {
    if (!expanded) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKeyDown);

    // The record is still in the document behind the overlay; a full-height
    // workspace must not drag it along when the wheel turns.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    shellRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);

  // Templates are per doctor, so they can only be read once the doctor is
  // known. The visit's own doctor wins; a doctor-less visit falls back to the
  // signed-in user's own record, which is what the old overlay did.
  const [templates, setTemplates] = useState<PrescriptionTemplate[]>([]);
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      let doctorId = doctor?.id ?? null;
      if (!doctorId) {
        const own = await findDoctorForUser(supabase, clinicId);
        doctorId = own?.id ?? null;
      }
      if (!doctorId || cancelled) return;
      const rows = await fetchPrescriptionTemplates(
        supabase,
        clinicId,
        doctorId,
      );
      if (!cancelled) setTemplates(rows);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [clinicId, doctor?.id]);

  /**
   * The draft is seeded here rather than in the builder, because the rail's
   * checkboxes and the action bar both read it — and it has to be the *live*
   * draft, not the last saved prescription, or importing a scanned medicine
   * would write into the previous consultation. Seeding is idempotent per visit,
   * so the builder's own `ensure` is a no-op afterwards and a draft that
   * survived a tab switch is kept.
   */
  const draftContext = usePrescriptionDraft();
  useEffect(() => {
    draftContext?.ensure(visit.id, draftFromPrescription(visitPrescription));
    // Seeding is keyed to the visit: a save refreshes the page with a new
    // prescription object, and re-running on that would reseed a live draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftContext, visit.id]);
  const draft = draftContext?.visitId === visit.id ? draftContext.draft : null;

  const [isAdvancing, startAdvance] = useTransition();
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  const handlePrint = useCallback(() => window.print(), []);

  /**
   * Completing a visit must not be able to lose the prescription on screen, so
   * the draft is committed first and the visit is only completed once that
   * succeeded. (Neither action does the other's job: `savePrescriptionAction`
   * upserts the prescription, `completeAndAdvanceAction` closes the visit and
   * returns the next patient in this doctor's queue.)
   */
  const handleComplete = useCallback(() => {
    if (!draft) return;
    startAdvance(async () => {
      setAdvanceError(null);
      const saved = await savePrescriptionAction(
        null,
        prescriptionFormData(visit.id, draft),
      );
      if (!saved.ok) {
        setAdvanceError(saved.message);
        return;
      }
      draftContext?.clearApplied();

      const advance = new FormData();
      advance.set("visitId", visit.id);
      const advanced = await completeAndAdvanceAction(null, advance);
      if (!advanced.ok) {
        setAdvanceError(advanced.message);
        return;
      }
      // Carry the doctor to the next patient in their queue rather than back
      // to a list they have to re-find someone on; an empty queue just
      // refreshes the record they just closed.
      const nextPatientId = advanced.data;
      if (nextPatientId) {
        router.push(
          patientDirectoryHref({ ...params, selectedId: nextPatientId }),
        );
      } else {
        router.refresh();
      }
    });
  }, [draft, visit.id, draftContext, router, params]);

  /**
   * Ticking a scanned medicine copies it into the live table, and unticking
   * takes it back out — identity is the name, because the same drug scanned
   * from two reports is one medicine, not two.
   */
  const toggleScanned = useCallback(
    (medication: PatientMedication, checked: boolean) => {
      if (!draft) return;
      const name = medication.medicine_name.trim();
      if (!name) return;
      const key = name.toLowerCase();
      const present = draft.medicines.some(
        (entry) => entry.name.trim().toLowerCase() === key,
      );
      if (checked === present) return;
      draftContext?.patch({
        medicines: checked
          ? [...draft.medicines, medicineEntryFromMedication(medication)]
          : draft.medicines.filter(
              (entry) => entry.name.trim().toLowerCase() !== key,
            ),
      });
    },
    [draft, draftContext],
  );

  const visitDate = visit.startedAt
    ? new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: timezone,
      }).format(new Date(visit.startedAt))
    : null;

  // The same date as a naive `YYYY-MM-DD`, for arithmetic rather than display:
  // "follow up after 5 days" has to be added to a day, not to a sentence.
  // UTC-anchored like every other naive date in the app.
  const visitDateNaive = visit.startedAt
    ? new Date(visit.startedAt).toISOString().slice(0, 10)
    : null;

  // Reports on file: dated when the clinic recorded a date for them, else when
  // they were uploaded. Both columns exist, neither is guaranteed.
  const reports = useMemo(
    () =>
      [...documents].sort((a, b) =>
        (b.document_date ?? b.uploaded_at).localeCompare(
          a.document_date ?? a.uploaded_at,
        ),
      ),
    [documents],
  );

  const inTable = useCallback(
    (name: string) =>
      !!draft?.medicines.some(
        (entry) =>
          entry.name.trim().toLowerCase() === name.trim().toLowerCase(),
      ),
    [draft],
  );

  // The rail shows vitals; it no longer refuses to. Read-only by default, with
  // the record's own form one click away (see `vitalsEditing`).
  //
  // Order is the reading order a doctor takes at the bedside: pressure and
  // pulse, then temperature and saturation, then weight and sugar — three rows
  // of two. The remaining measurements (respiratory rate, height, BMI) follow
  // underneath rather than interleaved, so the first three rows stay the three
  // rows the design specifies no matter which values happen to exist today.
  const vitalsReadings = useMemo(() => {
    if (!visitVitals) return [];
    const primary = [
      {
        key: "bp",
        label: "Blood Pressure",
        value: deriveBloodPressure(
          visitVitals.systolic_bp,
          visitVitals.diastolic_bp,
          visitVitals.blood_pressure,
        ),
        unit: "mmHg",
      },
      {
        key: "pulse",
        label: "Pulse",
        value: visitVitals.pulse != null ? String(visitVitals.pulse) : "",
        unit: "bpm",
      },
      {
        key: "temp",
        label: "Temperature",
        value:
          visitVitals.temperature != null
            ? String(visitVitals.temperature)
            : "",
        unit: "°F",
      },
      {
        key: "spo2",
        label: "SpO₂",
        value: visitVitals.spo2 != null ? String(visitVitals.spo2) : "",
        unit: "%",
      },
      {
        key: "wt",
        label: "Weight",
        value: visitVitals.weight != null ? String(visitVitals.weight) : "",
        unit: "kg",
      },
      {
        key: "sugar",
        label: "Blood Sugar",
        value:
          visitVitals.blood_sugar != null
            ? String(visitVitals.blood_sugar)
            : "",
        unit: "mg/dL",
      },
    ];
    const remaining = [
      {
        key: "rr",
        label: "Resp Rate",
        value:
          visitVitals.respiratory_rate != null
            ? String(visitVitals.respiratory_rate)
            : "",
        unit: "bpm",
      },
      {
        key: "ht",
        label: "Height",
        value: visitVitals.height != null ? String(visitVitals.height) : "",
        unit: "cm",
      },
      {
        key: "bmi",
        label: "BMI",
        value: String(
          computeBmi(
            visitVitals.height != null ? String(visitVitals.height) : "",
            visitVitals.weight != null ? String(visitVitals.weight) : "",
          ) ??
            visitVitals.bmi ??
            "",
        ),
        unit: "kg/m²",
      },
    ];
    return [...primary, ...remaining].filter((reading) => reading.value !== "");
  }, [visitVitals]);

  // The AI summary lives on the patient row, generated from the Overview tab —
  // the rail only reads it.
  const aiLines = useMemo(
    () => summaryLines(patient.ai_summary),
    [patient.ai_summary],
  );
  /**
   * Only OCR-sourced values, newest report first. A value entered by hand is
   * excluded here on purpose — this heading claims OCR, and a manually typed
   * number under it would be read as extracted from a scan.
   */
  const ocrLabResults = useMemo(
    () => labResults.filter((result) => result.source === "ai_ocr"),
    [labResults],
  );
  const isFirstVisit = (patient.visit_count ?? 0) <= 1;

  return (
    // The slot never moves; only the host inside it does. While the host is
    // away the slot holds the same box the workspace was filling, so the record
    // behind keeps its height and the page does not jump on the way in or out.
    <div
      ref={slotRef}
      className={cn(
        "min-w-0",
        expanded && "h-[calc(100dvh-var(--app-header-h)-9.5rem)] min-h-[560px]",
      )}
    >
      {host
        ? createPortal(
            <div
              ref={shellRef}
              role={expanded ? "dialog" : undefined}
              aria-modal={expanded ? true : undefined}
              aria-label={
                expanded ? "Prescription workspace, full screen" : undefined
              }
              tabIndex={expanded ? -1 : undefined}
              className={cn(
                "flex flex-col overflow-hidden bg-surface",
                expanded
                  ? // Full screen: the viewport, nothing of the record or the
                    // shell showing through. z-[100] clears every layer the
                    // app itself portals to <body> (menus and hover tips sit
                    // at z-50 and would otherwise float over the form).
                    "fixed inset-0 z-[100]"
                  : // In the tab: a panel between the tab strip and the tab body.
                    "h-[calc(100dvh-var(--app-header-h)-9.5rem)] min-h-[560px] rounded-card border border-hairline",
              )}
            >
              {/* No patient header: the record names the patient above the tab bar.
          What this bar owns is the two switches that change how much room the
          prescription gets: the rail, and the page around the whole thing. */}
              <div className="flex shrink-0 items-center gap-2 border-b border-hairline px-3 py-1.5">
                <Stethoscope
                  aria-hidden="true"
                  className="size-4 shrink-0 text-primary"
                />
                <h2 className="text-ink min-w-0 flex-1 truncate text-[13px] font-bold">
                  Prescription Workspace
                </h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setRailOpen((open) => !open)}
                  aria-expanded={railOpen}
                  aria-controls="rx-rail"
                  aria-label={
                    railOpen
                      ? "Collapse clinical context"
                      : "Expand clinical context"
                  }
                  title={
                    railOpen
                      ? "Collapse clinical context"
                      : "Expand clinical context"
                  }
                  className="hover:text-ink size-7 shrink-0 text-text-muted hover:bg-app"
                >
                  {railOpen ? (
                    <PanelLeftClose aria-hidden="true" />
                  ) : (
                    <PanelLeftOpen aria-hidden="true" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setExpanded((open) => !open)}
                  aria-expanded={expanded}
                  aria-label={expanded ? "Exit full screen" : "Full screen"}
                  title={expanded ? "Exit full screen (Esc)" : "Full screen"}
                  className="hover:text-ink size-7 shrink-0 text-text-muted hover:bg-app"
                >
                  {expanded ? (
                    <Minimize2 aria-hidden="true" />
                  ) : (
                    <Maximize2 aria-hidden="true" />
                  )}
                </Button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
                {/* Rail — context only. Collapsing trades prose for numbers. */}
                <aside
                  id="rx-rail"
                  aria-label="Clinical context"
                  className={cn(
                    "flex shrink-0 flex-col overflow-hidden border-r border-hairline bg-canvas transition-all duration-300 ease-in-out",
                    "w-full",
                    // The rail's two widths: a third of the console open, an icon strip
                    // shut, so the writing surface can take a laptop screen whole.
                    railOpen ? "lg:w-[30%]" : "lg:w-[52px]",
                  )}
                >
                  {railOpen ? (
                    <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
                      {/* 1 · Who this is. The record header above the tab bar
                      carries the same name, and this copy is not redundancy: in
                      full screen that header is gone, and a prescription read
                      against the wrong patient is the one mistake a screen full
                      of numbers makes easy. Dosing needs age, sex and weight in
                      the same glance, so they are here rather than a tab away. */}
                      <section className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold",
                              avatarColorFor(patient.id),
                            )}
                          >
                            {initialsOf(patient.name)}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="text-ink truncate text-[14px] font-bold leading-tight">
                              {patient.name}
                            </span>
                            {patient.patient_code && (
                              <span className="truncate font-mono text-[10px] font-semibold tracking-tight text-text-muted">
                                {patient.patient_code}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[
                            {
                              label: "Age",
                              value:
                                ageFromDob(patient.date_of_birth) ??
                                patient.age,
                              suffix: "y",
                            },
                            {
                              label: "Gender",
                              value: patient.gender
                                ? GENDER_LABELS[patient.gender]
                                : null,
                              suffix: "",
                            },
                            {
                              label: "Weight",
                              value: patient.weight,
                              suffix: "kg",
                            },
                          ].map((fact) => (
                            <div
                              key={fact.label}
                              className="flex min-w-0 flex-col rounded-[8px] border border-hairline bg-surface px-2 py-1.5"
                            >
                              <span className="truncate text-[9px] font-bold uppercase leading-none tracking-[0.05em] text-text-muted">
                                {fact.label}
                              </span>
                              <span className="flex items-baseline gap-0.5">
                                <span className="text-ink truncate text-[13px] font-bold tabular-nums leading-tight">
                                  {fact.value ?? "—"}
                                </span>
                                {fact.value != null && fact.suffix && (
                                  <span className="text-[9px] font-medium text-text-muted">
                                    {fact.suffix}
                                  </span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={isFirstVisit ? "default" : "info"}>
                            {isFirstVisit ? "First Visit" : "Follow-up"}
                          </Badge>
                          <Badge variant="default">
                            Token #{visit.tokenNumber}
                          </Badge>
                          <Badge variant="info">
                            Visit {patient.visit_count ?? 0}
                          </Badge>
                        </div>
                      </section>

                      {/* 2 · Three lines of what the record already says about
                      this patient. Generated elsewhere (Overview tab) and cached
                      on the patient row, so opening a prescription costs no
                      model call. */}
                      <section className="flex flex-col gap-1.5">
                        <span className={RAIL_HEAD}>
                          <Sparkles aria-hidden="true" className="size-3" />
                          AI OCR Summary
                        </span>
                        {aiLines.length > 0 ? (
                          <ul className="flex flex-col gap-1">
                            {aiLines.map((line, index) => (
                              <li
                                key={`${line.slice(0, 24)}-${index}`}
                                className="flex gap-1.5 text-[12px] leading-snug text-text-primary"
                              >
                                <span
                                  aria-hidden="true"
                                  className="mt-[6px] size-1 shrink-0 rounded-full bg-primary"
                                />
                                <span className="min-w-0">{line}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[12px] leading-snug text-text-muted">
                            {patient.visit_count > 0
                              ? "No summary yet. Generate one from the Overview tab."
                              : AI_SUMMARY_EMPTY_STATE}
                          </p>
                        )}
                      </section>

                      {/* 3 · Lab values AI read off scanned reports. Capped like the
                      medicine list above: past five the rail stops being scannable,
                      and the remainder is one click away in the sheet. */}
                      {ocrLabResults.length > 0 && (
                        <section className="flex min-h-0 flex-col gap-2">
                          <span className={RAIL_HEAD}>
                            <TestTube2 aria-hidden="true" className="size-3" />
                            Scanned Document Lab Results (OCR)
                            <Badge variant="warning" className="text-[9px]">
                              {ocrLabResults.length}
                            </Badge>
                          </span>
                          <ul className="scrollbar-thin -mr-1 flex max-h-[220px] flex-col gap-1 overflow-y-auto pr-1">
                            {ocrLabResults
                              .slice(0, RAIL_ITEM_LIMIT)
                              .map((result) => (
                                <ScannedLabRow
                                  key={result.id}
                                  result={result}
                                />
                              ))}
                          </ul>
                          {ocrLabResults.length > RAIL_ITEM_LIMIT && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setLabResultsDialogOpen(true)}
                              className="h-6 justify-start rounded-[6px] px-2 text-[11px] font-semibold text-primary hover:bg-primary-tint hover:text-primary"
                            >
                              View All ({ocrLabResults.length}) Results
                            </Button>
                          )}
                        </section>
                      )}

                      {/* 3 · Vitals. The numbers get the weight a label would
                      otherwise take; the correction is one click and uses the
                      record's own form. */}
                      <section className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              RAIL_HEAD,
                              "min-w-0 flex-1 border-b-0 pb-0",
                            )}
                          >
                            Vitals
                          </span>
                          {visitVitals && (
                            <Badge variant="success" className="text-[9px]">
                              Recorded
                            </Badge>
                          )}
                          {canManage && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setVitalsEditing((open) => !open)}
                              aria-expanded={vitalsEditing}
                              className="hover:text-ink h-6 shrink-0 px-1.5 text-[11px] font-semibold text-text-muted hover:bg-app"
                            >
                              <Pencil aria-hidden="true" className="size-3" />
                              {vitalsEditing ? "Close" : "Edit"}
                            </Button>
                          )}
                        </div>
                        {vitalsEditing ? (
                          <div className="rounded-[10px] border border-hairline bg-surface p-2.5">
                            <VitalsForm
                              visitId={visit.id}
                              existingVitals={visitVitals}
                              config={null}
                              onSaved={() => setVitalsEditing(false)}
                            />
                          </div>
                        ) : vitalsReadings.length > 0 ? (
                          <div className="grid grid-cols-2 gap-1.5">
                            {vitalsReadings.map((reading) => (
                              <div
                                key={reading.key}
                                title={reading.label}
                                className="flex min-w-0 flex-col rounded-[8px] border border-hairline bg-surface px-2 py-1.5"
                              >
                                <span className="truncate text-[9px] font-bold uppercase leading-none tracking-[0.05em] text-text-muted">
                                  {reading.label}
                                </span>
                                <span className="flex items-baseline gap-1">
                                  <span className="text-ink text-[15px] font-bold tabular-nums leading-tight">
                                    {reading.value}
                                  </span>
                                  <span className="text-[10px] font-medium text-text-muted">
                                    {reading.unit}
                                  </span>
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[12px] text-text-muted">
                            No vitals recorded for this visit.
                          </p>
                        )}
                      </section>

                      {/* 4 · Medicines AI read out of scanned documents. Capped
                  so a 30-medicine scan can't stretch the rail past the fold;
                  the remainder lives behind View All. */}
                      {scannedMedicines.length > 0 && (
                        <section className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => setScannedOpen((open) => !open)}
                            aria-expanded={scannedOpen}
                            aria-controls="rx-scanned"
                            className="flex items-center gap-1.5 text-left"
                          >
                            <span className={RAIL_HEAD}>
                              Scanned Document Medicines
                              <Badge
                                variant="warning"
                                className="ml-auto text-[9px]"
                              >
                                OCR · {scannedMedicines.length}
                              </Badge>
                            </span>
                          </button>
                          {scannedOpen && (
                            <>
                              <ul
                                id="rx-scanned"
                                className="flex flex-col gap-1"
                              >
                                {scannedMedicines
                                  .slice(0, RAIL_ITEM_LIMIT)
                                  .map((medication) => (
                                    <ScannedMedicineRow
                                      key={medication.id}
                                      medication={medication}
                                      checked={inTable(
                                        medication.medicine_name,
                                      )}
                                      onToggle={toggleScanned}
                                      canManage={canManage}
                                    />
                                  ))}
                              </ul>
                              {scannedMedicines.length > RAIL_ITEM_LIMIT && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setMedsDialogOpen(true)}
                                  className="h-6 justify-start rounded-[6px] px-2 text-[11px] font-semibold text-primary hover:bg-primary-tint hover:text-primary"
                                >
                                  View All ({scannedMedicines.length}) Meds
                                </Button>
                              )}
                            </>
                          )}
                        </section>
                      )}

                      {/* 5 · Dated reports, capped the same way. The full history
                  goes to a modal rather than a scrollbar that eats the rail. */}
                      <section className="flex min-h-0 flex-col gap-2">
                        <span className={RAIL_HEAD}>
                          <FileText aria-hidden="true" className="size-3" />
                          Recent Labs &amp; Reports
                        </span>
                        {reports.length > 0 ? (
                          <>
                            <ul className="scrollbar-thin -mr-1 flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
                              {reports
                                .slice(0, RAIL_ITEM_LIMIT)
                                .map((report) => (
                                  <li
                                    key={report.id}
                                    className="flex min-w-0 items-center gap-2 rounded-[8px] bg-surface px-2 py-1.5"
                                  >
                                    <span className="flex min-w-0 flex-1 flex-col">
                                      <span className="text-ink truncate text-[12px] font-medium">
                                        {report.document_name}
                                      </span>
                                      <span className="text-[11px] text-text-muted">
                                        {report.document_date ??
                                          report.uploaded_at}
                                      </span>
                                    </span>
                                    <Button asChild variant="ghost" size="icon">
                                      <a
                                        href={patientDocumentHref(report.id)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label={`Quick view ${report.document_name}`}
                                        title="Quick view"
                                        className="size-6 shrink-0 text-text-muted hover:bg-app hover:text-primary"
                                      >
                                        <Eye
                                          aria-hidden="true"
                                          className="size-3.5"
                                        />
                                      </a>
                                    </Button>
                                  </li>
                                ))}
                            </ul>
                            {reports.length > RAIL_ITEM_LIMIT && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setReportsDialogOpen(true)}
                                className="h-6 justify-start rounded-[6px] px-2 text-[11px] font-semibold text-primary hover:bg-primary-tint hover:text-primary"
                              >
                                View All Lab Reports ({reports.length})
                              </Button>
                            )}
                          </>
                        ) : (
                          <p className="text-[12px] text-text-muted">
                            No reports on file for this patient.
                          </p>
                        )}
                      </section>

                      {/* 6 · What happened on the last two or three visits.
                      Closed by default and pinned to the bottom: a doctor reads
                      it when a prescription looks like a repeat, which is after
                      they have started writing, not before. */}
                      <section className="flex flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => setHistoryOpen((open) => !open)}
                          aria-expanded={historyOpen}
                          aria-controls="rx-history"
                          className="flex items-center gap-1.5 text-left"
                        >
                          <span className={RAIL_HEAD}>
                            <Stethoscope
                              aria-hidden="true"
                              className="size-3"
                            />
                            Recent Visits
                            <ChevronDown
                              aria-hidden="true"
                              className={cn(
                                "ml-auto size-3 transition-transform duration-200",
                                historyOpen && "rotate-180",
                              )}
                            />
                          </span>
                        </button>
                        {historyOpen && (
                          <ul id="rx-history" className="flex flex-col gap-1.5">
                            {recentVisits.length > 0 ? (
                              recentVisits.map((row) => (
                                <li
                                  key={row.id}
                                  className="flex flex-col gap-0.5 rounded-[8px] bg-surface px-2 py-1.5"
                                >
                                  <span className="flex items-baseline justify-between gap-2">
                                    <span className="text-ink text-[11px] font-bold tabular-nums">
                                      {row.visitDate
                                        ? formatNaiveDate(row.visitDate)
                                        : "Date not recorded"}
                                    </span>
                                    {row.doctorName && (
                                      <span className="truncate text-[10px] text-text-muted">
                                        {row.doctorName}
                                      </span>
                                    )}
                                  </span>
                                  {row.chiefComplaint && (
                                    <span className="text-[12px] leading-snug text-text-primary">
                                      {row.chiefComplaint}
                                    </span>
                                  )}
                                  {row.diagnosis && (
                                    <span className="truncate text-[11px] text-text-muted">
                                      {row.diagnosis}
                                    </span>
                                  )}
                                </li>
                              ))
                            ) : (
                              <li className="text-[12px] text-text-muted">
                                No earlier visits with notes on file.
                              </li>
                            )}
                          </ul>
                        )}
                      </section>

                      {/* What the patient filled in before the consultation. Not
                      one of the design's six sections, but it belongs beside the
                      AI overview rather than at the bottom: both are the
                      patient's own account of the problem, and the doctor's first
                      two minutes are spent reconciling them. */}
                      {preAnswers.length > 0 && (
                        <section className="flex flex-col gap-2">
                          <span className={RAIL_HEAD}>
                            <ListChecks aria-hidden="true" className="size-3" />
                            Pre-Consultation
                          </span>
                          {preAnswers.map((answer) => (
                            <div
                              key={answer.id}
                              className="flex flex-col gap-px"
                            >
                              <span className={FIELD_LABEL}>
                                {answer.question?.question_text ?? "Question"}
                              </span>
                              <span className="whitespace-pre-wrap text-[12px] leading-snug text-text-primary">
                                {answer.answer_text}
                              </span>
                            </div>
                          ))}
                        </section>
                      )}
                    </div>
                  ) : (
                    /* Collapsed: the identity and the numbers stay reachable,
               because a doctor should be able to check whose record this is, or
               read BP or weight, without reopening the panel. */
                    <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto p-1.5">
                      <span
                        title={patient.name}
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                          avatarColorFor(patient.id),
                        )}
                      >
                        {initialsOf(patient.name)}
                      </span>
                      {vitalsReadings.map((reading) => (
                        <div
                          key={reading.key}
                          title={`${reading.label}: ${reading.value} ${reading.unit}`}
                          className="flex w-full flex-col items-center rounded-[6px] bg-app px-1 py-1"
                        >
                          <span className="text-[8px] font-bold uppercase tracking-[0.04em] text-text-muted">
                            {reading.key === "bp" ? "BP" : reading.label}
                          </span>
                          <span className="text-ink text-[11px] font-bold tabular-nums">
                            {reading.value}
                          </span>
                        </div>
                      ))}
                      {scannedMedicines.length > 0 && (
                        <span
                          title={`${scannedMedicines.length} scanned medicines`}
                          className="flex flex-col items-center gap-0.5 rounded-[6px] bg-app px-1.5 py-1"
                        >
                          <Stethoscope
                            aria-hidden="true"
                            className="size-3 text-text-muted"
                          />
                          <span className="text-ink text-[10px] font-bold tabular-nums">
                            {scannedMedicines.length}
                          </span>
                        </span>
                      )}
                      {reports.length > 0 && (
                        <span
                          title={`${reports.length} reports on file`}
                          className="flex flex-col items-center gap-0.5 rounded-[6px] bg-app px-1.5 py-1"
                        >
                          <FileText
                            aria-hidden="true"
                            className="size-3 text-text-muted"
                          />
                          <span className="text-ink text-[10px] font-bold tabular-nums">
                            {reports.length}
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                </aside>

                {/* Writing surface. Its own scroll plane, so the bar below never moves. */}
                <div className="flex min-w-0 flex-1">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
                      <RxBuilder
                        visitId={visit.id}
                        prescription={visitPrescription}
                        pastMedicines={pastMedicines}
                        pastLabHistory={pastLabHistory}
                        visitDate={visitDateNaive}
                        doctorName={doctor?.name ?? null}
                        templateMenu={
                          <TemplateLoadMenu
                            templates={templates}
                            onLoad={(template) =>
                              draftContext?.patch(applyTemplate(template))
                            }
                          />
                        }
                      />
                    </div>

                    {/* The end-of-visit row. Ending a visit is the only filled control on
                the screen, because it is the only irreversible one — and it saves
                first, so nothing written above is lost by finishing. Loading a
                template is not here: it belongs above the diagnosis it fills. */}
                    <div className="flex shrink-0 items-center justify-end gap-2 border-t border-hairline bg-surface px-4 py-2.5">
                      {advanceError && (
                        <span
                          role="alert"
                          className="text-[12px] text-status-destructive"
                        >
                          {advanceError}
                        </span>
                      )}
                      <TemplateSaveControl
                        doctorId={doctor?.id ?? null}
                        values={draft}
                        disabled={!canManage}
                        compact
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={handlePrint}
                        className="hover:text-ink h-8 text-[12px] text-text-secondary hover:bg-app"
                      >
                        <Printer data-icon="inline-start" aria-hidden="true" />
                        Print Preview
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleComplete}
                        disabled={isAdvancing || !canManage || !draft}
                        className="h-8 text-[12px] font-semibold"
                      >
                        <CheckCircle
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
                        {isAdvancing ? "Completing…" : "Save & Complete Visit"}
                      </Button>
                    </div>
                  </div>

                  {/* AI Copilot Drawer - Right Side */}
                  <CopilotDrawer
                    patientProfile={{
                      allergies: patient.known_allergies || undefined,
                      current_meds: patient.current_medications || undefined,
                    }}
                    onPopulateForm={(extracted: CopilotExtraction) => {
                      if (!draftContext) return;

                      const updates: Partial<PrescriptionDraft> = {};
                      if (extracted.chief_complaint)
                        updates.chiefComplaint = extracted.chief_complaint;
                      if (extracted.findings)
                        updates.findings = extracted.findings;
                      if (extracted.diagnosis)
                        updates.diagnosis = extracted.diagnosis;
                      if (extracted.medicines?.length) {
                        updates.medicines = extracted.medicines.map((m) => ({
                          name: m.name,
                          route: m.route || "Oral",
                          form: m.form || "Tablet",
                          frequency: m.frequency,
                          duration: m.duration,
                          unit: m.unit || "Days",
                          instructions: m.instructions,
                        }));
                      }
                      if (extracted.lab_orders?.length) {
                        updates.labOrders = extracted.lab_orders.map((l) => ({
                          test_name: l.test_name,
                          notes: l.notes || "",
                        }));
                      }
                      // The copilot speaks in "after 1 week"; the draft stores a
                      // date. Both halves are needed — assigning the amount alone
                      // wrote "1" into a date column, which rendered as an empty
                      // Follow-Up box and saved as an invalid date.
                      if (extracted.follow_up_after) {
                        const followUpDate = followUpDateFrom(
                          visitDateNaive,
                          extracted.follow_up_after,
                          extracted.follow_up_unit ?? "Weeks",
                        );
                        if (followUpDate) updates.followUpDate = followUpDate;
                      }
                      if (extracted.follow_up_notes)
                        updates.followUpNotes = extracted.follow_up_notes;
                      if (extracted.doctor_notes)
                        updates.doctorNotes = extracted.doctor_notes;

                      draftContext.patch(updates);
                      if (Object.keys(updates).length > 0) {
                        draftContext.markApplied(
                          Object.keys(updates) as (keyof PrescriptionDraft)[],
                        );
                      }
                    }}
                  />
                </div>
              </div>

              {/* The printable prescription — hidden on screen, expanded by Print
          Preview. Built from the live draft, not the last saved row, so what
          comes out of the printer is what the doctor just reviewed. */}
              <PrescriptionPreview
                prescription={{
                  ...(visitPrescription ?? ({} as Prescription)),
                  chief_complaint:
                    draft?.chiefComplaint ??
                    visitPrescription?.chief_complaint ??
                    "",
                  findings:
                    draft?.findings ?? visitPrescription?.findings ?? "",
                  diagnosis:
                    draft?.diagnosis ?? visitPrescription?.diagnosis ?? "",
                  custom_diagnosis:
                    draft?.customDiagnosis ??
                    visitPrescription?.custom_diagnosis ??
                    "",
                  medicines:
                    draft?.medicines ?? visitPrescription?.medicines ?? [],
                  lab_orders:
                    draft?.labOrders ?? visitPrescription?.lab_orders ?? [],
                  follow_up_date:
                    draft?.followUpDate ??
                    visitPrescription?.follow_up_date ??
                    null,
                  follow_up_notes:
                    draft?.followUpNotes ??
                    visitPrescription?.follow_up_notes ??
                    "",
                  doctor_notes:
                    draft?.doctorNotes ?? visitPrescription?.doctor_notes ?? "",
                }}
                patient={patient}
                doctor={
                  doctor
                    ? ({
                        id: doctor.id,
                        name: doctor.name,
                      } as unknown as Doctor)
                    : null
                }
                clinicName={clinic.name}
                clinicAddress={clinic.address}
                clinicPhone={clinic.phone}
                visitDate={visitDate ?? ""}
                vitals={visitVitals}
              />
            </div>,
            host,
          )
        : null}

      {/* The overflow halves of the rail's two capped lists. Radix portals both
      to the body, so they escape the narrow rail and land centred over the
  whole workspace — and the full-screen editor below keeps its own higher
  layer, so a modal opened from the inline view can never sit under it. */}
      <Dialog open={medsDialogOpen} onOpenChange={setMedsDialogOpen}>
        <DialogContent size="wide">
          <DialogHeader>
            <DialogTitle>Scanned Document Medicines</DialogTitle>
            <DialogDescription>
              Tick a medicine to add it to this prescription. Unverified rows
              stay locked until a clinician approves them.
            </DialogDescription>
          </DialogHeader>
          <ul className="scrollbar-thin -mr-1 flex max-h-[60vh] flex-col gap-1 overflow-y-auto pr-1">
            {scannedMedicines.map((medication) => (
              <ScannedMedicineRow
                key={medication.id}
                medication={medication}
                checked={inTable(medication.medicine_name)}
                onToggle={toggleScanned}
                canManage={canManage}
              />
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={reportsDialogOpen} onOpenChange={setReportsDialogOpen}>
        <DialogContent size="wide">
          <DialogHeader>
            <DialogTitle>Lab &amp; Diagnostic Reports</DialogTitle>
            <DialogDescription>
              Every dated report on file for this patient.
            </DialogDescription>
          </DialogHeader>
          <ul className="scrollbar-thin -mr-1 flex max-h-[60vh] flex-col gap-1 overflow-y-auto pr-1">
            {reports.map((report) => (
              <li
                key={report.id}
                className="flex min-w-0 items-center gap-2 rounded-[8px] border border-hairline bg-surface px-2 py-1.5"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-ink truncate text-[12px] font-semibold">
                    {report.document_name}
                  </span>
                  <span className="text-[11px] text-text-muted">
                    {report.document_date ?? report.uploaded_at}
                  </span>
                </span>
                <Button asChild variant="ghost" size="sm">
                  <a
                    href={patientDocumentHref(report.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-6 shrink-0 gap-1 rounded-[6px] px-2 text-[11px] font-semibold text-primary hover:bg-primary-tint hover:text-primary"
                  >
                    <Eye aria-hidden="true" className="size-3.5" />
                    Quick view
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog
        open={labResultsDialogOpen}
        onOpenChange={setLabResultsDialogOpen}
      >
        <DialogContent size="wide">
          <DialogHeader>
            <DialogTitle>Scanned Lab Results</DialogTitle>
            <DialogDescription>
              Every lab value AI extracted from this patient&apos;s uploaded
              reports.
            </DialogDescription>
          </DialogHeader>
          <ul className="scrollbar-thin -mr-1 flex max-h-[60vh] flex-col gap-1 overflow-y-auto pr-1">
            {ocrLabResults.map((result) => (
              <ScannedLabRow key={result.id} result={result} />
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
