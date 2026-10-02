"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  ClipboardList,
  Copy,
  FlaskConical,
  History,
  Lock,
  Pill,
  Plus,
  Search,
  X,
} from "lucide-react";

import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { Button } from "@/components/ui/button";
import { DiagnosisTags } from "@/components/patients/record/diagnosis-tags";
import { LabSubParameterPopover } from "@/components/patients/record/lab-sub-parameter-popover";
import {
  PastLabHistoryModal,
  type PastLabHistoryEntry,
} from "@/components/patients/record/past-lab-history-modal";
import {
  CellSelect,
  DURATION_UNITS,
  MEDICINE_FORMS,
  MEDICINE_FREQUENCIES,
  MEDICINE_INSTRUCTIONS,
  RxCard,
  RxField,
  RX_CELL,
  RX_LABEL,
} from "@/components/patients/record/rx-card";
import {
  BLANK_MEDICINE,
  draftFromPrescription,
  type PrescriptionDraft,
  usePrescriptionDraft,
  usePrescriptionDraftBridge,
} from "@/components/patients/record/prescription-draft-context";
import { labTestLabel } from "@/lib/lab-panels";
import { OPD_MEDICINE_SUGGESTIONS } from "@/lib/opd-medicines";
import { parseOcrMedicineString } from "@/lib/ocr-medicine-parser";
import { formatShortDate, addDaysToNaive } from "@/lib/utils/datetime";
import { cn } from "@/lib/utils";
import type {
  LabOrder,
  MedicineEntry as MedEntry,
  PatientMedication,
  Prescription,
  PrescriptionTemplate,
} from "@/types/database";

/**
 * The one payload shape `savePrescriptionAction` accepts, built from the live
 * draft rather than scraped off the DOM.
 *
 * The action bar needs to commit a prescription without submitting a form
 * (Completing a visit must save what is on screen first), so the payload is
 * built here — once — and both paths go through the same validator.
 */
export function prescriptionFormData(
  visitId: string,
  draft: PrescriptionDraft,
): FormData {
  const formData = new FormData();
  formData.set("visitId", visitId);
  formData.set("chiefComplaint", draft.chiefComplaint);
  formData.set("findings", draft.findings);
  formData.set("diagnosis", draft.diagnosis);
  formData.set("customDiagnosis", draft.customDiagnosis);
  formData.set("medicines", JSON.stringify(draft.medicines));
  formData.set("labOrders", JSON.stringify(draft.labOrders));
  formData.set("followUpDate", draft.followUpDate);
  formData.set("followUpNotes", draft.followUpNotes);
  formData.set("doctorNotes", draft.doctorNotes);
  return formData;
}

/**
 * A scanned medicine as a prescription row.
 *
 * `PatientMedication` records what a report *said* — a strength, a frequency, a
 * duration — while a prescription row records what the doctor is prescribing.
 * The doctor ticks it, sees the row, and edits anything that needs editing.
 *
 * WHAT THE ROW IS FILLED WITH, and why it is not simply the scan's own columns:
 *
 * - **Name** — the scan's `medicine_name` run through `parseOcrMedicineString`,
 *   so "Tab. Rivotril 0.5 mg" becomes "Rivotril" rather than a name that matches
 *   nothing in the catalogue. The stripped strength is not thrown away: it is
 *   appended back onto the name, because this grid has no strength column and a
 *   dose that exists only in the database is a dose nobody reads.
 * - **Route/Form** — the scan's `strength` is used as the fallback the cell
 *   already renders when no form is set, which is how "500 mg" stays visible
 *   until a real form is chosen. When the parser *can* read a dosage form from
 *   the text, that form wins, because a select showing "Tablet" is more useful
 *   than one showing a number. A doctor's own edit to any of this simply
 *   overwrites it — nothing here is locked.
 * - **Frequency, duration, instructions** — passed through untouched. These are
 *   the scan's own words and inventing a default would be a guess about a
 *   clinical instruction.
 */
export function medicineEntryFromMedication(
  medication: PatientMedication,
): MedEntry {
  const parsed = parseOcrMedicineString(medication.medicine_name);
  const cleanedName = parsed.name.trim() || medication.medicine_name.trim();

  // Re-attach the strength the parser removed, and use it as the form fallback
  // too, so a row created from a scan never loses its dose.
  const strength = (medication.strength ?? "").trim() || parsed.strength;
  const displayName =
    parsed.strength &&
    !cleanedName.toLowerCase().includes(parsed.strength.toLowerCase())
      ? `${cleanedName} ${parsed.strength}`.trim()
      : cleanedName;

  return {
    name: displayName,
    route: strength,
    form: parsed.form,
    frequency: medication.frequency ?? "",
    duration: medication.duration ?? "",
    unit: "",
    instructions: medication.instructions ?? "",
  };
}

/**
 * What loading a template does to a draft: the clinical content comes from the
 * template, and the complaint and findings stay — they belong to this patient
 * and this visit, and no template should overwrite them. Empty medicine and lab
 * lists clear rather than vanish, so a doctor who loads the wrong template can
 * see that it did replace their list.
 */
export function applyTemplate(
  template: PrescriptionTemplate,
): Partial<PrescriptionDraft> {
  return {
    diagnosis: template.diagnosis,
    customDiagnosis: template.custom_diagnosis,
    medicines: template.medicines?.length
      ? template.medicines
      : [{ ...BLANK_MEDICINE }],
    labOrders: template.lab_orders?.length ? template.lab_orders : [],
    doctorNotes: template.doctor_notes,
  };
}

/** The medicines grid's column widths, in the printed page's proportions. */
const MEDICINE_GRID =
  "grid grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_72px] items-start gap-2";

const MEDICINE_COLUMNS = [
  "Medicine",
  "Route/Form",
  "Frequency",
  "Duration + Unit",
  "Instructions",
];

/**
 * "5 days" split into an amount and a unit, so the duration cell can be a number
 * box next to a unit menu. Returns the raw number and unit when the value is
 * free text the two boxes cannot represent ("until review") — the unit menu
 * then carries that value itself rather than overwriting it.
 */
function splitDuration(value: string): { amount: string; unit: string } {
  const match = /^(\d+(?:\.\d+)?)\s*([A-Za-z]+)?/.exec((value ?? "").trim());
  if (!match) return { amount: "", unit: value?.trim() ?? "" };
  const unit = DURATION_UNITS.find(
    (option) => option.toLowerCase() === (match[2] ?? "").toLowerCase(),
  );
  return { amount: match[1], unit: unit ?? "" };
}

/** Days per unit, for turning "after 2 weeks" back into a real date. */
const FOLLOW_UP_DAYS: Record<string, number> = {
  Days: 1,
  Weeks: 7,
  Months: 30,
};

/**
 * "Follow up after 1 week", from the copilot, into the `YYYY-MM-DD` the draft
 * stores — the same arithmetic the Follow-Up card does when the doctor types it.
 *
 * Exported because two callers now need it and they must not disagree: the card
 * (hand-typed amount + unit) and `prescription-workspace`'s copilot handler
 * (amount + unit straight out of the model). The copilot handler used to assign
 * the raw number to `followUpDate`, which is a date column: "1" parses as
 * nothing, so the Follow-Up card rendered empty and the save wrote "1" as the
 * follow-up date.
 *
 * Returns `""` for anything unusable, which is what the card already treats as
 * "no follow-up set".
 */
export function followUpDateFrom(
  visitDate: string | null,
  amount: string,
  unit: string,
): string {
  if (!visitDate) return "";
  const count = Number.parseInt(amount, 10);
  if (!Number.isFinite(count) || count <= 0) return "";
  return addDaysToNaive(visitDate, count * (FOLLOW_UP_DAYS[unit] ?? 1));
}

/**
 * A stored follow-up date expressed as "after n days/weeks/months" from the
 * visit. Derived, never stored: there is one date on the record, and the two
 * boxes are two ways of writing it, so the two can never disagree.
 */
function followUpParts(
  followUpDate: string,
  visitDate: string | null,
): { amount: string; unit: string } {
  if (!followUpDate || !visitDate) return { amount: "", unit: "Days" };
  const from = Date.parse(`${visitDate.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${followUpDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to))
    return { amount: "", unit: "Days" };
  const days = Math.round((to - from) / 86_400_000);
  if (days <= 0) return { amount: "", unit: "Days" };
  if (days % 30 === 0) return { amount: String(days / 30), unit: "Months" };
  if (days % 7 === 0) return { amount: String(days / 7), unit: "Weeks" };
  return { amount: String(days), unit: "Days" };
}

/**
 * The label above a prose field. Deliberately NOT the uppercase micro-label the
 * value cells use: that style is for short categories (ROUTE, FREQUENCY) where
 * the shouting is the point. A sentence-case label sits under a bold card title
 * without competing with it, and it is the only style on the page that reads as
 * a sentence — which is what these two fields hold.
 */
const NARRATIVE_LABEL = "text-[12px] font-semibold text-text-secondary";

/**
 * The ceiling on the two narrative fields, and on the private note below them.
 *
 * Chosen so that the widest case — a full consultation's findings — still leaves
 * "Internal Doctor Notes" and the action bar visible on a laptop at the bottom of
 * the prescription column. This is a layout guarantee, not a content limit: the
 * box scrolls, so nothing is lost, only the growth past the cap.
 */
const NARRATIVE_MAX_H = "max-h-[150px]";

/**
 * One labelled auto-growing field — the shared primitive, used controlled.
 *
 * `NARRATIVE_MAX_H` caps the box. Without a ceiling, a long examination finding
 * grows its card without limit and pushes "Internal Doctor Notes" and the action
 * bar off the bottom of the screen — the two things the doctor needs after
 * writing the findings. Auto-grow is kept (a three-line answer should not leave
 * three empty lines below it) but it now stops at the cap and scrolls, so the
 * initial height, the maximum height, and everything below it are all stable.
 */
function GrowField({
  id,
  name,
  label,
  placeholder,
  value,
  onValue,
  invalid,
  fill,
}: {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  value: string;
  onValue: (next: string) => void;
  invalid?: boolean;
  /**
   * Share a row's height with a sibling field — see `AutoGrowTextarea`'s `fill`.
   * Chief complaint and examination findings are read against each other, and
   * two boxes of different heights side by side read as two unrelated boxes.
   */
  fill?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={cn("flex min-w-0 flex-col gap-1.5", fill && "h-full")}
    >
      <span className={NARRATIVE_LABEL}>{label}</span>
      <AutoGrowTextarea
        id={id}
        name={name}
        rows={2}
        value={value}
        fill={fill}
        placeholder={placeholder}
        onChange={(event) => onValue(event.target.value)}
        className={cn(
          "scrollbar-thin text-ink w-full resize-none overflow-y-auto rounded-[10px] border-[1.5px] bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed transition-colors placeholder:text-text-muted/70 focus:outline-none",
          NARRATIVE_MAX_H,
          fill && "flex-1",
          invalid ? "border-primary" : "border-hairline focus:border-primary",
        )}
      />
    </label>
  );
}

/**
 * One row of the "Previous Medicines" table.
 *
 * Laid out on the same grid as the live prescription above it, and for the same
 * reason: a doctor comparing the two should be able to run their eye straight
 * down a column — name against name, dose against dose — without the two tables
 * having different shapes. Four columns carry the earlier course (when, dose,
 * route, how long) and the last one carries the checkbox.
 *
 * A checkbox, not a button, because the state is the point: a doctor scanning
 * this list needs to see at a glance which of these drugs are already in the
 * prescription above, and a checkbox shows that where a button would have to
 * be replaced by a label.
 */
function PastMedicine({
  id,
  name,
  unit,
  route,
  form,
  duration,
  prescribedOn,
  doctorName,
  alreadyAdded,
  onToggle,
}: {
  id: string;
  name: string;
  unit: string;
  route: string;
  form: string;
  duration: string;
  prescribedOn: string | null;
  doctorName: string | null;
  alreadyAdded: boolean;
  onToggle: (next: boolean) => void;
}) {
  const routeForm = [form, route].filter(Boolean).join(" / ");
  // An em dash rather than a blank: a missing cell in a dosing table is
  // information, and it keeps the columns optically aligned.
  const cell = (value: string) => (
    <span
      className={cn(
        "truncate text-[12px]",
        value ? "text-ink" : "text-text-muted/70",
      )}
    >
      {value || "—"}
    </span>
  );

  return (
    <div
      className={cn(
        MEDICINE_GRID,
        "border-b border-hairline-soft py-2.5 last:border-b-0",
        alreadyAdded && "bg-primary-tint",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <input
          type="checkbox"
          id={id}
          checked={alreadyAdded}
          onChange={(event) => onToggle(event.target.checked)}
          aria-label={`Add ${name} to this prescription`}
          className="size-3.5 shrink-0 accent-primary"
        />
        <label
          htmlFor={id}
          className="text-ink min-w-0 cursor-pointer truncate text-[13px] font-semibold"
        >
          {name}
        </label>
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="text-ink truncate text-[12px]">
          {prescribedOn ? formatShortDate(prescribedOn) : "—"}
        </span>
        {doctorName && (
          <span className="truncate text-[10px] text-text-muted">
            {doctorName}
          </span>
        )}
      </div>
      {cell(unit)}
      {cell(routeForm)}
      {cell(duration)}
      <div className="flex items-center justify-end">
        <span
          className={cn(
            "text-[11px] font-semibold uppercase leading-none tracking-wide",
            alreadyAdded ? "text-primary" : "text-text-muted",
          )}
        >
          {alreadyAdded ? "In use" : "Add"}
        </span>
      </div>
    </div>
  );
}

/** Common tests, offered as suggestions for the lab input. */
const LAB_SUGGESTIONS = [
  "CBC",
  "RBS",
  "FBS",
  "Urine Routine",
  "Ultrasound Abdomen",
  "X-Ray Chest",
  "LFT",
  "KFT",
  "TSH",
  "Dengue NS1",
  "Malaria Parasite",
  "Urine Culture",
  "Lipid Profile",
];

/**
 * The Rx builder — everything a doctor writes during a consultation, on one
 * surface, in one card language: a header, a medicines grid, a follow-up, and
 * the notes that never print.
 *
 * The draft lives in the shared context, so this is a different *shape* of the
 * same prescription the voice copilot and the consultation screen write — not a
 * second source of truth. The action bar commits it through the same
 * `savePrescriptionAction`.
 */
export function RxBuilder({
  visitId,
  prescription,
  pastMedicines,
  pastLabHistory,
  visitDate,
  doctorName,
  templateMenu,
}: {
  visitId: string;
  prescription: Prescription | null;
  /**
   * This patient's earlier medicines, most recent course per drug, with the
   * date and the doctor who wrote it.
   */
  pastMedicines: {
    medicine: MedEntry;
    /** Sort key: the visit date, falling back to the row's creation time. */
    lastUsed: string;
    prescribedOn: string | null;
    doctorName: string | null;
  }[];
  /**
   * Lab tests ordered on this patient's earlier visits, newest first, one entry
   * per visit. Feeds the "Previous Lab History" sheet on the lab card.
   */
  pastLabHistory: PastLabHistoryEntry[];
  /** The visit's own date (naive `YYYY-MM-DD`) — the zero a follow-up counts from. */
  visitDate: string | null;

  doctorName: string | null;
  /** The "Load Template" control, rendered in the header card's action slot. */
  templateMenu?: React.ReactNode;
}) {
  const ctx = usePrescriptionDraft();
  const bridge = usePrescriptionDraftBridge(visitId);

  const [localDraft, setLocalDraft] = useState<PrescriptionDraft>(() =>
    draftFromPrescription(prescription),
  );
  const setLocal = (updates: Partial<typeof localDraft>) =>
    setLocalDraft((prev) => ({ ...prev, ...updates }));

  const draft = bridge?.draft ?? localDraft;
  const patch = bridge ? bridge.patch : setLocal;
  const marked = useMemo(
    () => new Set(Object.keys(bridge?.applied ?? {})),
    [bridge?.applied],
  );

  useEffect(() => {
    ctx?.ensure(visitId, localDraft);
    // Seeded per visit, exactly like the consultation form: a save refreshes
    // the page with a new prescription, and re-seeding on that would drop a
    // live draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, visitId]);

  const [labQuery, setLabQuery] = useState("");
  const [labHistoryOpen, setLabHistoryOpen] = useState(false);
  const medicineNameListId = "rx-medicine-names";

  const updateMedicine = (
    index: number,
    field: keyof MedEntry,
    value: string,
  ) =>
    patch({
      medicines: draft.medicines.map((medicine, i) =>
        i === index ? { ...medicine, [field]: value } : medicine,
      ),
    });

  const removeMedicine = (index: number) =>
    patch({ medicines: draft.medicines.filter((_, i) => i !== index) });

  const addMedicine = (medicine?: MedEntry) =>
    patch({
      medicines: [
        ...draft.medicines,
        medicine ? { ...medicine } : { ...BLANK_MEDICINE },
      ],
    });

  /**
   * Duplicate a line, not clear it: a second course of the same drug at a
   * different strength or duration is a common prescription, and retyping six
   * cells to say it twice is how the two copies drift apart.
   */
  const duplicateMedicine = (index: number) =>
    patch({
      medicines: [
        ...draft.medicines.slice(0, index + 1),
        { ...draft.medicines[index] },
        ...draft.medicines.slice(index + 1),
      ],
    });

  /**
   * Untick and every row of that drug goes, not just the first.
   *
   * The checkbox answers "is this drug in this prescription at all", so it is
   * driven by whether *any* row matches. Removing one row and leaving a second
   * would keep the tick lit with nothing left to switch off — and the row
   * Duplicate button makes a second identical row easy to create.
   */
  const removeMedicineByName = (name: string) => {
    const key = name.trim().toLowerCase();
    patch({
      medicines: draft.medicines.filter(
        (medicine) => medicine.name.trim().toLowerCase() !== key,
      ),
    });
  };

  /**
   * Adds a lab order, optionally narrowed to specific panel parameters.
   *
   * Re-adding a test that is already on the prescription is a no-op rather than
   * a second chip: the same panel twice on one Rx is a duplicate the lab would
   * bill twice, and the chip's gear is the place to change the selection.
   */
  const addLabTest = (testName: string, subParameters?: string[]) => {
    const name = testName.trim();
    if (!name) return;
    const already = draft.labOrders.some(
      (order) => order.test_name.toLowerCase() === name.toLowerCase(),
    );
    if (already) {
      setLabQuery("");
      return;
    }
    const next: LabOrder = { test_name: name, notes: "" };
    if (subParameters && subParameters.length > 0) {
      next.sub_parameters = [...subParameters];
    }
    patch({ labOrders: [...draft.labOrders, next] });
    setLabQuery("");
  };

  const removeLabTest = (index: number) =>
    patch({ labOrders: draft.labOrders.filter((_, i) => i !== index) });

  /**
   * Repeats a past visit's orders, keeping only the tests this prescription
   * does not already carry.
   *
   * Skipping rather than appending matters: "Order Again" on a visit whose Hb
   * and lipid profile are both already on the prescription should leave the
   * table as it is, not print the same panel twice. The sheet stays open on
   * purpose — repeating one visit's tests and then another is a normal way to
   * use it, and closing after each one would make that two round trips.
   */
  const reorderPastLabTests = (orders: LabOrder[]) => {
    const onFile = new Set(
      draft.labOrders.map((order) => order.test_name.trim().toLowerCase()),
    );
    const additions = orders
      .filter((order) => !onFile.has(order.test_name.trim().toLowerCase()))
      .map((order) => ({
        test_name: order.test_name,
        notes: "",
        ...(order.sub_parameters?.length
          ? { sub_parameters: [...order.sub_parameters] }
          : {}),
      }));
    if (additions.length > 0) {
      patch({ labOrders: [...draft.labOrders, ...additions] });
    }
  };

  /**
   * What the medicine name cell offers: this patient's own previous drugs
   * first, then the general OPD catalogue.
   *
   * Past medicines come first because they are what a repeat prescription is
   * actually made of — the same drug in a different strength reads as a
   * different drug to the catalogue's dedupe, so putting them ahead keeps the
   * exact bottle the patient already has at the top of their own list.
   *
   * De-duplicated on a normalised name so "Paracetamol 500 mg" does not appear
   * twice under the patient's spelling and the catalogue's, and left
   * independent of the draft on purpose: the same list has to be offered to
   * every row of the grid, so filtering out what is already prescribed would
   * make a drug vanish from row 2 the moment it was added to row 1.
   */
  const medicineNames = useMemo(() => {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const name of [
      ...pastMedicines.map((row) => row.medicine.name),
      ...OPD_MEDICINE_SUGGESTIONS,
    ]) {
      const trimmed = name.trim();
      const key = trimmed.toLowerCase();
      if (!trimmed || seen.has(key)) continue;
      seen.add(key);
      merged.push(trimmed);
    }
    return merged;
  }, [pastMedicines]);
  const inUse = useMemo(
    () =>
      new Set(
        draft.medicines.map((medicine) => medicine.name.trim().toLowerCase()),
      ),
    [draft.medicines],
  );

  // The badge counts prescribed medicines, not rows: a table holding one blank
  // line is an empty prescription, and "1" on an empty table reads as a mistake.
  const prescribedCount = useMemo(
    () => draft.medicines.filter((medicine) => medicine.name.trim()).length,
    [draft.medicines],
  );

  const followUp = followUpParts(draft.followUpDate, visitDate);

  const setFollowUp = (amount: string, unit: string) => {
    patch({ followUpDate: followUpDateFrom(visitDate, amount, unit) });
  };

  return (
    /* A real form, deliberately without an action: it is the doctor's
       keystrokes that matter here, and the only commit is the action bar's
       "Save & Complete Visit", which posts the draft itself. Submitting is
       cancelled so pressing Enter in a one-line field can never navigate. */
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => event.preventDefault()}
    >
      {/* The consultation comes first, always: what the patient complained of
          and what was found is the reason every box below it is filled in. No
          card title — the two field labels already name this panel, and a
          heading above them would only say it a third time. */}
      <RxCard>
        {/* Side by side from `md` rather than `lg`: the prescription surface
            sits beside the clinical rail, so by the time the viewport is wide
            enough for `lg` the writing column is already past half a laptop and
            the two fields stacked for no reason. Equal heights (both `fill`) so
            a long examination finding grows its row and the complaint beside it
            stays level with it instead of ending mid-air. */}
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 md:items-stretch">
          <GrowField
            id="rx-chief-complaint"
            name="chiefComplaint"
            label="Chief Complaint"
            placeholder="Fever with cough since 3 days"
            value={draft.chiefComplaint}
            onValue={(value) => patch({ chiefComplaint: value })}
            invalid={marked.has("chiefComplaint")}
            fill
          />
          <GrowField
            id="rx-findings"
            name="findings"
            label="Clinical / Examination Findings"
            placeholder="Throat congested, chest clear on auscultation"
            value={draft.findings}
            onValue={(value) => patch({ findings: value })}
            invalid={marked.has("findings")}
            fill
          />
        </div>
      </RxCard>

      {/* The header: what is being prescribed, to whom, by whom, and when.
          Date and doctor are read-only because both are already decided by the
          time a prescription is written — retyping them can only introduce a
          mismatch with the visit they belong to. Loading a template lives here
          too, above the diagnosis it fills, so a doctor never has to reach the
          bottom of a long form to change their mind about the whole layout. */}
      <RxCard
        icon={ClipboardList}
        title="Prescription Header"
        action={templateMenu}
      >
        {/* Diagnosis gets the full width of the card: the search box sits above
            its chips, and in a third of a card those chips wrapped to three
            lines while the two read-only facts beside them each held a single
            short word. Date and doctor take the row underneath instead — they
            are two short values, and they read as one pair. */}
        <div className="flex flex-col gap-3.5">
          <DiagnosisTags
            diagnosis={draft.diagnosis}
            customDiagnosis={draft.customDiagnosis}
            onChange={(next) => patch(next)}
            invalid={marked.has("diagnosis") || marked.has("customDiagnosis")}
          />
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <RxField
              id="rx-date"
              label="Date"
              value={visitDate ? formatShortDate(visitDate) : "—"}
              disabled
              readOnly
            />
            <RxField
              id="rx-doctor"
              label="Doctor"
              value={doctorName ?? "—"}
              disabled
              readOnly
            />
          </div>
        </div>
      </RxCard>

      {/* Active prescription */}
      <RxCard
        icon={Pill}
        title="Medicines"
        count={prescribedCount}
        action={
          <Button
            type="button"
            size="sm"
            onClick={() => addMedicine()}
            className="h-8 shrink-0 rounded-[8px] bg-primary px-4 text-[13px] font-semibold text-white shadow-action hover:bg-primary/90"
          >
            <Plus
              data-icon="inline-start"
              className="size-3.5"
              aria-hidden="true"
            />
            Add Medicine
          </Button>
        }
      >
        <datalist id={medicineNameListId}>
          {medicineNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <div className="flex flex-col">
          <div
            className={cn(
              MEDICINE_GRID,
              "border-b-[1.5px] border-hairline pb-2 text-[11px] font-bold uppercase leading-none tracking-[0.04em] text-text-muted",
            )}
          >
            {MEDICINE_COLUMNS.map((column) => (
              <span key={column}>{column}</span>
            ))}
            <span className="sr-only">Row actions</span>
          </div>

          {draft.medicines.map((medicine, index) => {
            const duration = splitDuration(medicine.duration);
            return (
              <div
                key={index}
                className={cn(
                  MEDICINE_GRID,
                  "border-b border-hairline-soft py-2.5 last:border-b-0",
                  marked.has("medicines") && "bg-primary-tint",
                )}
              >
                {/* The dose this row already carries, shown rather than dropped:
                    the grid has no dose cell of its own, and a strength that
                    lives only in the database is a strength nobody reads. */}
                <div className="relative min-w-0">
                  <input
                    aria-label={`Medicine ${index + 1}`}
                    list={medicineNameListId}
                    value={medicine.name}
                    placeholder="Search medicine..."
                    onChange={(event) =>
                      updateMedicine(index, "name", event.target.value)
                    }
                    className={cn(RX_CELL, medicine.unit && "pr-9")}
                  />
                  {medicine.unit && (
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 truncate text-[10px] text-text-muted">
                      {medicine.unit}
                    </span>
                  )}
                </div>

                <CellSelect
                  ariaLabel={`Route or form of medicine ${index + 1}`}
                  value={medicine.form || medicine.route}
                  options={MEDICINE_FORMS}
                  placeholder="Select"
                  onValueChange={(value) =>
                    updateMedicine(index, "form", value)
                  }
                />

                <CellSelect
                  ariaLabel={`Frequency of medicine ${index + 1}`}
                  value={medicine.frequency}
                  options={MEDICINE_FREQUENCIES}
                  placeholder="Select"
                  onValueChange={(value) =>
                    updateMedicine(index, "frequency", value)
                  }
                />

                <div className="flex min-w-0 items-center gap-1.5">
                  <input
                    aria-label={`Duration of medicine ${index + 1}`}
                    type="number"
                    min={1}
                    max={365}
                    inputMode="numeric"
                    value={duration.amount}
                    placeholder="5"
                    onChange={(event) =>
                      updateMedicine(
                        index,
                        "duration",
                        event.target.value && duration.unit
                          ? `${event.target.value} ${duration.unit}`
                          : event.target.value,
                      )
                    }
                    className={cn(
                      RX_CELL,
                      "w-[52px] shrink-0 text-center tabular-nums",
                    )}
                  />
                  <CellSelect
                    ariaLabel={`Duration unit of medicine ${index + 1}`}
                    value={duration.unit}
                    options={DURATION_UNITS}
                    placeholder="Unit"
                    onValueChange={(unit) =>
                      updateMedicine(
                        index,
                        "duration",
                        duration.amount ? `${duration.amount} ${unit}` : unit,
                      )
                    }
                  />
                </div>

                <CellSelect
                  ariaLabel={`Instructions for medicine ${index + 1}`}
                  value={medicine.instructions}
                  options={MEDICINE_INSTRUCTIONS}
                  placeholder="Select"
                  onValueChange={(value) =>
                    updateMedicine(index, "instructions", value)
                  }
                />

                <div className="flex items-center justify-end gap-1 pt-0.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Duplicate row"
                    onClick={() => duplicateMedicine(index)}
                    aria-label={`Duplicate medicine ${index + 1}`}
                    className="size-8 rounded-[7px] border-primary/25 text-primary hover:bg-primary/10"
                  >
                    <Copy
                      className="size-3.5"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Remove row"
                    onClick={() => removeMedicine(index)}
                    aria-label={`Remove medicine ${index + 1}`}
                    className="size-8 rounded-[7px] border-status-destructive/30 text-status-destructive hover:bg-status-destructive/10"
                  >
                    <X
                      className="size-3.5"
                      strokeWidth={2.2}
                      aria-hidden="true"
                    />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </RxCard>

      {/* What this patient was prescribed before, in the same shape as the table
          above: same grid, same columns, so the two read as one instrument.
          Sits directly under the live prescription because that is the
          comparison the doctor is actually making.

          Rendered even when there is nothing to show. A first-time patient's
          blank history is information — the doctor needs to know the list is
          empty rather than wonder whether it failed to load — and a card that
          appears and disappears with the data makes the surface jump around
          between patients. */}
      <RxCard
        icon={History}
        title="Previous Medicines"
        count={pastMedicines.length > 0 ? pastMedicines.length : undefined}
        action={
          pastMedicines.length > 0 ? (
            <span className="text-[11px] text-text-muted">
              Tick to add · untick to remove
            </span>
          ) : undefined
        }
      >
        {pastMedicines.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-[10px] border border-dashed border-hairline bg-canvas/40 px-3.5 py-4">
            <History
              aria-hidden="true"
              className="size-4 shrink-0 text-text-muted"
              strokeWidth={1.8}
            />
            <p className="text-[12px] leading-snug text-text-secondary">
              No earlier prescription on file for this patient. Anything written
              here today starts their medicine history.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            <div
              className={cn(
                MEDICINE_GRID,
                "border-b-[1.5px] border-hairline pb-2 text-[11px] font-bold uppercase leading-none tracking-[0.04em] text-text-muted",
              )}
            >
              <span>Medicine</span>
              <span>Prescribed On</span>
              <span>Dose</span>
              <span>Route / Form</span>
              <span>Duration</span>
              <span className="sr-only">Add to prescription</span>
            </div>

            <div className="scrollbar-thin max-h-72 overflow-y-auto">
              {pastMedicines.map((row, index) => {
                const key = row.medicine.name.trim().toLowerCase();
                return (
                  <PastMedicine
                    key={`${key}-${row.lastUsed}-${index}`}
                    id={`past-med-${index}`}
                    name={row.medicine.name}
                    unit={row.medicine.unit}
                    route={row.medicine.route}
                    form={row.medicine.form}
                    duration={row.medicine.duration}
                    prescribedOn={row.prescribedOn}
                    doctorName={row.doctorName}
                    alreadyAdded={inUse.has(key)}
                    onToggle={(checked) =>
                      checked
                        ? addMedicine(row.medicine)
                        : removeMedicineByName(row.medicine.name)
                    }
                  />
                );
              })}
            </div>
          </div>
        )}
      </RxCard>

      {/* Lab tests: one field, and what has been ordered so far as chips. A
      panel chip carries a gear, because "CBC" and "CBC, platelets + ESR only"
      are different orders and only the second one is what the patient should
      be billed for. */}
      <RxCard
        icon={FlaskConical}
        title="Lab Tests Ordered"
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setLabHistoryOpen(true)}
            className="h-7 shrink-0 gap-1.5 rounded-[8px] border border-hairline bg-surface px-2.5 text-[11px] font-semibold text-text-secondary hover:bg-app hover:text-primary"
          >
            <History aria-hidden="true" className="size-3.5" />
            Previous Lab History
          </Button>
        }
      >
        <div className="flex flex-col gap-2.5">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-text-muted"
            />
            <input
              aria-label="Add a lab test"
              list="rx-lab-suggestions"
              value={labQuery}
              placeholder="Type a test and press Enter"
              onChange={(event) => setLabQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                // The search field sits in a form: Enter must add the test, never
                // submit the prescription on the way.
                event.preventDefault();
                addLabTest(labQuery);
              }}
              className="text-ink w-full rounded-[10px] border-[1.5px] border-hairline bg-surface py-2.5 pl-9 pr-3.5 text-[13px] transition-colors placeholder:text-text-muted/70 focus:border-primary focus:outline-none"
            />
            <datalist id="rx-lab-suggestions">
              {LAB_SUGGESTIONS.filter(
                (test) =>
                  !draft.labOrders.some(
                    (order) =>
                      order.test_name.toLowerCase() === test.toLowerCase(),
                  ),
              ).map((test) => (
                <option key={test} value={test} />
              ))}
            </datalist>
          </div>
          {draft.labOrders.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {draft.labOrders.map((order, index) => (
                <li
                  key={`${order.test_name}-${index}`}
                  className="flex items-center gap-1 rounded-pill border border-hairline bg-app py-0.5 pl-2 pr-1 text-[12px] font-medium text-text-primary"
                >
                  {labTestLabel(order.test_name, order.sub_parameters)}
                  <LabSubParameterPopover
                    testName={order.test_name}
                    selected={order.sub_parameters ?? []}
                    onChange={(next) =>
                      patch({
                        labOrders: draft.labOrders.map((item, i) =>
                          i === index
                            ? { ...item, sub_parameters: next }
                            : item,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    onClick={() => removeLabTest(index)}
                    aria-label={`Remove ${order.test_name}`}
                    className="rounded-pill p-0.5 text-text-muted transition-colors hover:bg-hairline hover:text-status-destructive"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </RxCard>

      {/* Follow-up. Counted in days/weeks/months from the visit rather than
          picked from a calendar: "after 5 days" is how a follow-up is decided,
          and a date picker makes the doctor do date arithmetic to say it. */}
      <RxCard icon={CalendarClock} title="Follow-Up">
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="min-w-0">
            <label
              htmlFor="rx-follow-up-after"
              className={cn("mb-1.5 block", RX_LABEL)}
            >
              Follow-up After
            </label>
            <div className="flex items-center gap-2">
              <input
                id="rx-follow-up-after"
                type="number"
                min={1}
                max={99}
                inputMode="numeric"
                value={followUp.amount}
                placeholder="e.g. 5"
                disabled={!visitDate}
                onChange={(event) =>
                  setFollowUp(event.target.value, followUp.unit)
                }
                className={cn(
                  RX_CELL,
                  "h-10 w-20 shrink-0 px-3.5 text-center text-[13px] tabular-nums",
                  !visitDate && "cursor-default bg-app text-text-muted",
                )}
              />
              <div className="min-w-0 flex-1">
                <CellSelect
                  ariaLabel="Follow-up unit"
                  value={followUp.unit}
                  options={DURATION_UNITS}
                  onValueChange={(unit) => setFollowUp(followUp.amount, unit)}
                  className="[&_select]:h-10 [&_select]:px-3.5 [&_select]:text-[13px]"
                />
              </div>
            </div>
            {draft.followUpDate && (
              <p className="mt-1.5 text-[11px] text-text-muted">
                Returns {formatShortDate(draft.followUpDate)}
              </p>
            )}
          </div>

          <div className="min-w-0">
            <label
              htmlFor="rx-follow-up-notes"
              className={cn("mb-1.5 block", RX_LABEL)}
            >
              Follow-up Notes
            </label>
            <input
              id="rx-follow-up-notes"
              name="followUpNotes"
              value={draft.followUpNotes}
              placeholder="e.g. Repeat BP check, review MRI report"
              onChange={(event) => patch({ followUpNotes: event.target.value })}
              className="text-ink w-full rounded-[10px] border-[1.5px] border-hairline bg-surface px-3.5 py-2.5 text-[13px] transition-colors placeholder:text-text-muted/70 focus:border-primary focus:outline-none"
            />
          </div>
        </div>
      </RxCard>

      {/* Private note — never on the patient's copy. Capped like the narrative
             fields above, and for the same reason: it is the last card in the
             column, so an uncapped note grows the form's total height rather
             than pushing something else off-screen — but the action bar that
             saves the visit must never end up below the fold because a remark
             ran long. */}
      <RxCard icon={Lock} title="Internal Doctor Notes">
        <AutoGrowTextarea
          id="rx-doctor-notes"
          name="doctorNotes"
          rows={2}
          value={draft.doctorNotes}
          placeholder="Private clinical remarks — not printed on the patient's copy"
          onChange={(event) => patch({ doctorNotes: event.target.value })}
          className={cn(
            "scrollbar-thin text-ink w-full resize-none overflow-y-auto rounded-[10px] border-[1.5px] border-hairline bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed transition-colors placeholder:text-text-muted/70 focus:border-primary focus:outline-none",
            NARRATIVE_MAX_H,
          )}
        />
      </RxCard>

      {/* Portalled, so it escapes both the card and the collapsible rail. */}
      <PastLabHistoryModal
        open={labHistoryOpen}
        onOpenChange={setLabHistoryOpen}
        entries={pastLabHistory}
        onReorder={reorderPastLabTests}
      />
    </form>
  );
}
