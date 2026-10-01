"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Building2,
  CalendarDays,
  Check,
  ClipboardList,
  Clock,
  FileText,
  Link2,
  Plus,
  ScanLine,
  Scissors,
  ShieldAlert,
  Syringe,
  Trash2,
  User,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { IntakeLinkModal } from "@/components/patients/record/intake-link-modal";
import { OcrUploadModal } from "@/components/patients/record/ocr-upload-modal";
import {
  addMedicalHistoryAction,
  deleteMedicalHistoryAction,
  verifyMedicalHistoryAction,
} from "@/lib/actions/medical-history";
import { cn } from "@/lib/utils";
import { formatDateTime, formatShortDate } from "@/lib/utils/datetime";
import {
  HISTORY_CATEGORY_LABELS,
  type ClinicalStatus,
  type HistoryCategory,
  type HistoryItem,
  type HistorySource,
} from "@/types/history";

/** Who recorded the entry — presented as a quiet eyebrow, not a pill. */
const SOURCE_LABELS: Record<HistorySource, string> = {
  doctor_entry: "Doctor",
  receptionist: "Reception",
  ai_ocr: "AI OCR",
  patient_intake: "Patient intake",
};

/** The seven groups, in the order the add-entry form offers them. */
const CATEGORY_ORDER: HistoryCategory[] = [
  "chronic",
  "past_illnesses",
  "surgical",
  "hospitalization",
  "family",
  "social",
  "immunization",
];

const CATEGORY_META: Record<
  HistoryCategory,
  { icon: LucideIcon; tone: string }
> = {
  chronic: { icon: Activity, tone: "bg-primary-tint text-primary" },
  past_illnesses: {
    icon: FileText,
    tone: "bg-hairline-soft text-text-secondary",
  },
  surgical: { icon: Scissors, tone: "bg-status-info/10 text-status-info" },
  hospitalization: {
    icon: Building2,
    tone: "bg-violet-500/10 text-violet-600",
  },
  family: {
    icon: ShieldAlert,
    tone: "bg-status-destructive/10 text-status-destructive",
  },
  social: { icon: User, tone: "bg-status-warning/10 text-status-warning" },
  immunization: {
    icon: Syringe,
    tone: "bg-status-success/10 text-status-success",
  },
};

/**
 * Clinical course, as a Badge variant.
 *
 * `chronic` is destructive-red because a chronic condition is the one that
 * changes what is safe to prescribe; `active` is a neutral success rather than an
 * alarm, because an active hay fever is not an emergency and tinting every live
 * condition red would make the tab cry wolf on every patient.
 */
const CLINICAL_VARIANT: Record<
  ClinicalStatus,
  "success" | "outline" | "destructive"
> = {
  active: "success",
  resolved: "outline",
  chronic: "destructive",
};

const CLINICAL_LABELS: Record<ClinicalStatus, string> = {
  active: "Active",
  resolved: "Resolved",
  chronic: "Chronic",
};

/**
 * One dated fact in an entry's provenance footer.
 *
 * Structured rather than run together in a sentence ("added 12 Mar 2024 · AI OCR
 * · Dr Sarah") because the three dates on a scanned entry answer three different
 * questions and the doctor has to be able to tell them apart at a glance: when
 * the condition started, when the document was written, and when the row landed
 * in this system. Only the ones that exist are rendered.
 */
function Stamp({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <Icon
        aria-hidden="true"
        className="text-ink-faint size-3 shrink-0"
        strokeWidth={2}
      />
      <span className="text-ink-faint">{label}</span>
      <span className="font-medium text-text-secondary">{value}</span>
    </span>
  );
}

/**
 * StructuredMedicalHistory — the tabular half of the History tab.
 *
 * One flat, newest-first list of entries. This used to nest rows inside seven
 * category panels, each with its own border, icon tile and heading, so a patient
 * with two entries paid for the chrome of seven categories and the reader had to
 * look in seven places to answer "what is on file?". The category is still on
 * every row — as a quiet icon-and-label beside the source — but the entries are
 * siblings now, in the order they were recorded.
 *
 * Provenance is the reason the rows are as tall as they are. A 1-click Verify
 * turns an AI-OCR or patient-intake row into a confirmed one; Delete is a
 * two-step inline confirm.
 *
 * Past History's six free-text prompts stay exactly as they were — this section
 * is the structured record in front of them, not a replacement for the text.
 */
export function StructuredMedicalHistory({
  items,
  patientId,
  patientFirstName,
  canManage,
}: {
  items: HistoryItem[];
  patientId: string;
  patientFirstName?: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const pendingCount = useMemo(
    () =>
      items.filter((item) => item.verification_status === "pending_approval")
        .length,
    [items],
  );

  function verify(id: string) {
    if (!canManage) return;
    setWorkingId(id);
    void verifyMedicalHistoryAction({}, toFormData([["entryId", id]])).then(
      (result) => {
        setWorkingId(null);
        if (!result.ok) return;
        router.refresh();
      },
    );
  }

  function runDelete(id: string) {
    setWorkingId(id);
    void deleteMedicalHistoryAction({}, toFormData([["entryId", id]])).then(
      (result) => {
        setWorkingId(null);
        setPendingDelete(null);
        if (!result.ok) return;
        router.refresh();
      },
    );
  }

  return (
    <section aria-label="Medical history">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
            Medical History
          </h3>
          <span className="rounded-pill bg-hairline-soft px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
            {items.length} {items.length === 1 ? "entry" : "entries"}
          </span>
          {pendingCount > 0 && (
            <Badge
              variant="warning"
              className="gap-1 px-2 py-0 text-[11px] font-semibold"
            >
              <Clock aria-hidden="true" className="size-3" />
              {pendingCount} {pendingCount === 1 ? "entry" : "entries"} need
              review
            </Badge>
          )}
        </div>
        {canManage && !adding && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-[12px]"
              onClick={() => setOcrOpen(true)}
            >
              <ScanLine aria-hidden="true" className="size-3.5" />
              Scan
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-[12px]"
              onClick={() => setIntakeOpen(true)}
            >
              <Link2 aria-hidden="true" className="size-3.5" />
              Intake link
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-[12px]"
              onClick={() => setAdding(true)}
            >
              <Plus aria-hidden="true" className="size-3.5" />
              Add entry
            </Button>
          </div>
        )}
      </div>

      {canManage && adding && (
        <AddEntryForm
          patientId={patientId}
          onAdded={() => {
            setAdding(false);
            router.refresh();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {ocrOpen && (
        <OcrUploadModal
          patientId={patientId}
          onClose={() => setOcrOpen(false)}
        />
      )}
      {intakeOpen && (
        <IntakeLinkModal
          patientId={patientId}
          patientFirstName={patientFirstName}
          onClose={() => setIntakeOpen(false)}
        />
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No structured history on file yet"
          description="Add chronic conditions, surgeries, hospitalizations and more here — or keep using the free-text Past History prompts below."
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((item) => {
            const meta = CATEGORY_META[item.category];
            const CategoryIcon = meta.icon;
            const pending = item.verification_status === "pending_approval";
            // An OCR row's `created_at` is the moment the scan was ingested, so
            // it is labelled as the scan rather than as the recording — the two
            // are the same instant, but only one of them is true of a row that
            // was never typed.
            const ingestLabel =
              item.source === "ai_ocr" ? "Scanned" : "Recorded";
            const ingestedAt = formatDateTime(item.created_at);

            return (
              <li
                key={item.id}
                className="rounded-panel border border-hairline bg-surface px-[14px] py-3 transition-colors hover:border-hairline-soft"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {/* Status and verification sit on the title line because
                        they are what the eye reads first: is this live, and can
                        it be trusted yet. */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-ink text-[13px] font-semibold leading-snug">
                        {item.relationship
                          ? `${item.relationship} — ${item.title}`
                          : item.title}
                      </p>
                      <Badge
                        variant={CLINICAL_VARIANT[item.clinical_status]}
                        className="px-1.5 py-0 text-[10px] font-semibold"
                      >
                        {CLINICAL_LABELS[item.clinical_status]}
                      </Badge>
                      {pending ? (
                        <Badge
                          variant="warning"
                          className="gap-1 px-1.5 py-0 text-[10px] font-semibold"
                        >
                          <Clock aria-hidden="true" className="size-2.5" />
                          Needs review
                        </Badge>
                      ) : (
                        <Badge
                          variant="default"
                          className="gap-1 px-1.5 py-0 text-[10px] font-semibold"
                        >
                          <Check aria-hidden="true" className="size-2.5" />
                          Verified
                        </Badge>
                      )}
                    </div>

                    {item.notes && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-text-secondary">
                        {item.notes}
                      </p>
                    )}
                  </div>

                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                      {pending && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1 border-primary/40 px-2.5 text-[11px] text-primary hover:bg-primary-tint"
                          disabled={workingId === item.id}
                          onClick={() => verify(item.id)}
                        >
                          {workingId === item.id ? (
                            <Spinner size="sm" />
                          ) : (
                            <Check aria-hidden="true" className="size-3" />
                          )}
                          Verify
                        </Button>
                      )}

                      {pendingDelete === item.id ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            className="gap-1 px-2.5 text-[11px]"
                            disabled={workingId === item.id}
                            onClick={() => runDelete(item.id)}
                          >
                            {workingId === item.id && <Spinner size="sm" />}
                            Delete
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="px-2 text-[11px]"
                            onClick={() => setPendingDelete(null)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-ink-faint px-2 hover:text-status-destructive"
                          aria-label={`Delete ${item.title}`}
                          onClick={() => setPendingDelete(item.id)}
                        >
                          <Trash2 aria-hidden="true" className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Provenance footer. The category lives here too — as an icon
                    and a label rather than a pill — so the row keeps one line of
                    metadata instead of four badges. */}
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline-soft pt-2 text-[11px]">
                  <span className="flex items-center gap-1 font-medium text-text-secondary">
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded-[4px]",
                        meta.tone,
                      )}
                    >
                      <CategoryIcon aria-hidden="true" className="size-2.5" />
                    </span>
                    {HISTORY_CATEGORY_LABELS[item.category]}
                    {item.created_by_name && (
                      <span className="text-ink-faint font-normal">
                        · {item.created_by_name}
                      </span>
                    )}
                  </span>

                  <span className="text-ink-faint">
                    {SOURCE_LABELS[item.source]}
                  </span>

                  {item.onset_date && (
                    <Stamp
                      icon={Activity}
                      label="Onset"
                      value={formatShortDate(item.onset_date)}
                    />
                  )}
                  {item.report_date && (
                    <Stamp
                      icon={CalendarDays}
                      label="Doc date"
                      value={formatShortDate(item.report_date)}
                    />
                  )}
                  {ingestedAt && (
                    <Stamp
                      icon={Clock}
                      label={ingestLabel}
                      value={ingestedAt}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Build a FormData bag for the small medical-history server actions. */
function toFormData(entries: Array<[string, string]>): FormData {
  const form = new FormData();
  for (const [key, value] of entries) {
    form.set(key, value);
  }
  return form;
}

const CATEGORY_OPTIONS = CATEGORY_ORDER.map((category) => (
  <option key={category} value={category}>
    {HISTORY_CATEGORY_LABELS[category]}
  </option>
));

function AddEntryForm({
  patientId,
  onAdded,
  onCancel,
}: {
  patientId: string;
  onAdded: () => void;
  onCancel: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{
    category: HistoryCategory;
    condition: string;
    date: string;
    clinicalStatus: ClinicalStatus;
    relationship: string;
    notes: string;
  }>({
    category: "chronic",
    condition: "",
    date: "",
    clinicalStatus: "active",
    relationship: "",
    notes: "",
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.condition.trim()) return;

    setWorking(true);
    setError(null);
    const data = new FormData();
    data.set("patientId", patientId);
    data.set("category", form.category);
    data.set("condition", form.condition);
    data.set("date", form.date || "");
    data.set("clinicalStatus", form.clinicalStatus);
    data.set("relationship", form.relationship);
    data.set("notes", form.notes);

    void addMedicalHistoryAction({}, data).then((result) => {
      setWorking(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onAdded();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="mb-2 rounded-panel border border-hairline bg-white px-[18px] py-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="mh-category"
            className="text-ink-faint text-[10px] font-bold uppercase tracking-wider"
          >
            Category
          </Label>
          <NativeSelect
            id="mh-category"
            value={form.category}
            onChange={(event) =>
              set("category", event.target.value as HistoryCategory)
            }
          >
            {CATEGORY_OPTIONS}
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="mh-condition"
            className="text-ink-faint text-[10px] font-bold uppercase tracking-wider"
          >
            Condition
          </Label>
          <Input
            id="mh-condition"
            value={form.condition}
            onChange={(event) => set("condition", event.target.value)}
            placeholder="e.g. Diabetes Type 2"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="mh-date"
            className="text-ink-faint text-[10px] font-bold uppercase tracking-wider"
          >
            Onset
          </Label>
          <Input
            id="mh-date"
            type="date"
            value={form.date}
            onChange={(event) => set("date", event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="mh-status"
            className="text-ink-faint text-[10px] font-bold uppercase tracking-wider"
          >
            Status
          </Label>
          <NativeSelect
            id="mh-status"
            value={form.clinicalStatus}
            onChange={(event) =>
              set("clinicalStatus", event.target.value as ClinicalStatus)
            }
          >
            <option value="active">Active</option>
            <option value="chronic">Chronic</option>
            <option value="resolved">Resolved</option>
          </NativeSelect>
        </div>

        {form.category === "family" && (
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="mh-relationship"
              className="text-ink-faint text-[10px] font-bold uppercase tracking-wider"
            >
              Relationship
            </Label>
            <Input
              id="mh-relationship"
              value={form.relationship}
              onChange={(event) => set("relationship", event.target.value)}
              placeholder="e.g. Father"
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label
            htmlFor="mh-notes"
            className="text-ink-faint text-[10px] font-bold uppercase tracking-wider"
          >
            Notes
          </Label>
          <Input
            id="mh-notes"
            value={form.notes}
            onChange={(event) => set("notes", event.target.value)}
            placeholder="Optional clinical note"
          />
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs font-medium text-red-600">{error}</p>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={working}
        >
          <X aria-hidden="true" className="size-3.5" />
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={working || !form.condition.trim()}
        >
          {working ? (
            <Spinner size="sm" />
          ) : (
            <Plus aria-hidden="true" className="size-3.5" />
          )}
          Add entry
        </Button>
      </div>
    </form>
  );
}
