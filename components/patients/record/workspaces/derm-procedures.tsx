"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, Pencil, Scissors } from "lucide-react";

import { ConfirmDeleteButton } from "@/components/patients/record/workspaces/confirm-delete";
import {
  ChipPicker,
  SpecialtyHeading,
} from "@/components/patients/record/workspaces/specialty-form";
import {
  RecordEmpty,
  RecordNote,
  RecordSection,
} from "@/components/patients/record/record-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteDermProcedureAction,
  saveDermProcedureAction,
  updateDermSpecimenStatusAction,
} from "@/lib/actions/specialty-workspaces";
import { cn } from "@/lib/utils";
import type {
  DermLesion,
  DermProcedure,
  DermProcedureKind,
  DermSpecimenStatus,
} from "@/types/database";

const PROCEDURE_KINDS: { value: DermProcedureKind; label: string }[] = [
  { value: "laser", label: "Laser / energy" },
  { value: "injectable", label: "Injectable" },
  { value: "peel", label: "Chemical peel" },
  { value: "cryotherapy", label: "Cryotherapy" },
  { value: "electrocautery", label: "Electrocautery" },
  { value: "minor_surgery", label: "Minor surgery" },
  { value: "biopsy", label: "Biopsy" },
  { value: "other", label: "Other" },
];

type FieldDef = { key: string; label: string; placeholder: string };

/** Which parameter inputs the form shows for each procedure family. The values
 *  are what the clinician records â€” this logbook never drives a machine. */
const PARAM_FIELDS: Record<DermProcedureKind, FieldDef[]> = {
  laser: [
    { key: "machine", label: "Machine / device", placeholder: "e.g. Nd:YAG" },
    { key: "energy", label: "Energy / fluence", placeholder: "e.g. 6 J/cmÂ²" },
    { key: "spot_size", label: "Spot size", placeholder: "e.g. 8 mm" },
    { key: "pulse", label: "Pulse duration", placeholder: "e.g. 20 ms" },
    { key: "passes", label: "Passes", placeholder: "e.g. 2" },
    { key: "cooling", label: "Cooling", placeholder: "e.g. contact" },
  ],
  injectable: [
    {
      key: "product",
      label: "Product / brand",
      placeholder: "e.g. Botulinum A",
    },
    { key: "lot", label: "Lot / batch", placeholder: "Batch number" },
    { key: "units_site", label: "Units per site", placeholder: "e.g. 4 U" },
    { key: "units_total", label: "Total units", placeholder: "e.g. 20 U" },
    {
      key: "reconstitution",
      label: "Reconstitution",
      placeholder: "e.g. 2.5 mL saline",
    },
  ],
  peel: [
    { key: "agent", label: "Agent", placeholder: "e.g. Glycolic acid" },
    { key: "concentration", label: "Concentration", placeholder: "e.g. 30%" },
    { key: "layers", label: "Layers", placeholder: "e.g. 2" },
    { key: "contact_time", label: "Contact time", placeholder: "e.g. 3 min" },
    { key: "endpoint", label: "Endpoint", placeholder: "e.g. erythema" },
  ],
  cryotherapy: [
    { key: "agent", label: "Agent", placeholder: "e.g. liquid nitrogen" },
    { key: "freeze_time", label: "Freeze time", placeholder: "e.g. 10 s" },
    { key: "cycles", label: "Cycles", placeholder: "e.g. 2" },
    { key: "endpoint", label: "Endpoint", placeholder: "e.g. ice ball" },
  ],
  electrocautery: [
    { key: "mode", label: "Mode", placeholder: "e.g. coagulation" },
    { key: "power", label: "Power", placeholder: "e.g. 15 W" },
    { key: "passes", label: "Passes", placeholder: "e.g. 1" },
  ],
  minor_surgery: [
    { key: "technique", label: "Technique", placeholder: "e.g. excision" },
    {
      key: "anesthesia",
      label: "Anaesthesia",
      placeholder: "e.g. 2% lignocaine",
    },
    { key: "suture", label: "Suture", placeholder: "e.g. 4-0 nylon" },
  ],
  biopsy: [
    { key: "biopsy_type", label: "Biopsy type", placeholder: "e.g. punch" },
    { key: "technique", label: "Technique", placeholder: "e.g. 4 mm punch" },
    {
      key: "anesthesia",
      label: "Anaesthesia",
      placeholder: "e.g. 2% lignocaine",
    },
  ],
  other: [],
};

const PRESET_NAMES = [
  "Skin biopsy",
  "Cryotherapy",
  "Chemical peel",
  "Laser procedure",
  "Intralesional injection",
  "Minor procedure",
] as const;

const CONSENT_OPTIONS = ["Obtained", "Declined", "Documented"] as const;
const AFTERCARE_CHIPS = [
  "Keep dry 24h",
  "Sunscreen",
  "Avoid picking",
  "Emollient daily",
  "Analgesia if needed",
] as const;

const SPECIMEN_STATUS_OPTIONS: { value: DermSpecimenStatus; label: string }[] =
  [
    { value: "collected", label: "Collected" },
    { value: "sent_to_lab", label: "Sent to lab" },
    { value: "in_lab", label: "In lab" },
    { value: "reported", label: "Reported" },
    { value: "cancelled", label: "Cancelled" },
  ];

const CONSENT_LABEL: Record<string, string> = {
  obtained: "Consent obtained",
  declined: "Consent declined",
  documented: "Consent documented",
};

const KIND_LABEL: Record<string, string> = Object.fromEntries(
  PROCEDURE_KINDS.map((kind) => [kind.value, kind.label]),
);

const EMPTY_FORM = {
  name: "",
  date: new Date().toISOString().slice(0, 10),
  kind: "other" as DermProcedureKind,
  consent: ["Documented"],
  bodySite: "",
  notes: "",
  aftercare: "",
  complications: "",
  lesionId: "",
  specimenType: "",
  specimenLab: "",
  specimenStatus: "collected" as DermSpecimenStatus,
  specimenDispatchedAt: "",
  params: {} as Record<string, string>,
};

/**
 * Tab 5 â€” procedures, device/agent parameters, consent, aftercare and the
 * biopsy/specimen tracker. A clinical logbook: recorded values are what the
 * clinician typed, never a claim of live machine control.
 */
export function DermProcedures({
  patientId,
  procedures,
  lesions,
  canManage,
}: {
  patientId: string;
  procedures: DermProcedure[];
  lesions: DermLesion[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setParam(key: string, value: string) {
    setForm((current) => ({
      ...current,
      params: { ...current.params, [key]: value },
    }));
  }

  function reset() {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setError(null);
  }

  function loadForEdit(procedure: DermProcedure) {
    setEditingId(procedure.id);
    setForm({
      name: procedure.procedure_name,
      date: procedure.procedure_date,
      kind: (procedure.procedure_kind ?? "other") as DermProcedureKind,
      consent: [
        (procedure.consent_status[0]?.toUpperCase() ?? "D") +
          procedure.consent_status.slice(1),
      ],
      bodySite: procedure.body_site ?? "",
      notes: procedure.notes ?? "",
      aftercare: procedure.aftercare ?? "",
      complications: procedure.complications ?? "",
      lesionId: procedure.lesion_id ?? "",
      specimenType: procedure.specimen_type ?? "",
      specimenLab: procedure.specimen_lab ?? "",
      specimenStatus:
        (procedure.specimen_status as DermSpecimenStatus) ?? "collected",
      specimenDispatchedAt: procedure.specimen_dispatched_at ?? "",
      params: { ...procedure.params },
    });
    setError(null);
  }

  async function save() {
    if (!canManage) return;
    if (!form.name.trim()) {
      setError("Enter or pick a procedure name.");
      return;
    }
    setError(null);
    setPending(true);
    const result = await saveDermProcedureAction(patientId, {
      id: editingId ?? "",
      procedure_name: form.name,
      procedure_date: form.date,
      consent_status: (form.consent[0] ?? "Documented").toLowerCase(),
      procedure_kind: form.kind,
      lesion_id: form.lesionId,
      body_site: form.bodySite,
      params: form.params,
      notes: form.notes,
      aftercare: form.aftercare,
      complications: form.complications,
      specimen_type: form.specimenType,
      specimen_lab: form.specimenLab,
      specimen_status: form.kind === "biopsy" ? form.specimenStatus : "",
      specimen_dispatched_at: form.specimenDispatchedAt,
    });
    setPending(false);
    if (result.ok) {
      toast.success(editingId ? "Procedure updated" : "Procedure recorded");
      reset();
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function remove(id: string) {
    const result = await deleteDermProcedureAction(id);
    if (result.ok) {
      toast.success("Procedure removed");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function setSpecimenStatus(
    id: string,
    specimen_status: DermSpecimenStatus,
  ) {
    const result = await updateDermSpecimenStatusAction({
      id,
      specimen_status,
    });
    if (result.ok) {
      toast.success("Specimen status updated");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  const fields = PARAM_FIELDS[form.kind];

  return (
    <div className="space-y-4">
      {canManage && (
        <RecordSection
          title={editingId ? "Edit procedure" : "Record a procedure"}
          meta={<Badge className="bg-app text-text-secondary">Logbook</Badge>}
        >
          <div className="mb-3 flex flex-wrap gap-1.5">
            {PROCEDURE_KINDS.map((kind) => (
              <button
                key={kind.value}
                type="button"
                onClick={() => set("kind", kind.value)}
                aria-pressed={form.kind === kind.value}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                  form.kind === kind.value
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : "border-hairline bg-app text-text-secondary hover:border-primary/40 hover:text-primary",
                )}
              >
                {kind.label}
              </button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap gap-1.5">
            {PRESET_NAMES.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => set("name", preset)}
                aria-pressed={form.name === preset}
                className={
                  form.name === preset
                    ? "rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-[11.5px] font-semibold text-primary"
                    : "rounded-full border border-hairline bg-app px-2.5 py-1 text-[11.5px] font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
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
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
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
                value={form.date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(event) => set("date", event.target.value)}
              />
            </div>
            <ChipPicker
              label="Consent"
              single
              value={form.consent}
              onChange={(value) => set("consent", value)}
              options={["Obtained", "Declined", "Documented"]}
            />
            <div>
              <label
                htmlFor="derm-proc-site"
                className="text-ink mb-1.5 block text-[12.5px] font-bold"
              >
                Body site
              </label>
              <Input
                id="derm-proc-site"
                value={form.bodySite}
                onChange={(event) => set("bodySite", event.target.value)}
                placeholder="e.g. Left forearm"
                autoComplete="off"
              />
            </div>
            <div>
              <label
                htmlFor="derm-proc-lesion"
                className="text-ink mb-1.5 block text-[12.5px] font-bold"
              >
                Linked lesion pin
              </label>
              <NativeSelect
                id="derm-proc-lesion"
                value={form.lesionId}
                onChange={(event) => set("lesionId", event.target.value)}
              >
                <option value="">Not linked</option>
                {lesions.map((lesion) => (
                  <option key={lesion.id} value={lesion.id}>
                    #{lesion.pin_number} Â· {lesion.body_region}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          {PARAM_FIELDS[form.kind].length > 0 && (
            <div className="mt-4">
              <p className="text-ink mb-2 text-[12px] font-bold uppercase tracking-wide">
                {PROCEDURE_KINDS.find((k) => k.value === form.kind)?.label}{" "}
                parameters
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {PARAM_FIELDS[form.kind].map((field) => (
                  <div key={field.key}>
                    <label
                      htmlFor={`derm-param-${field.key}`}
                      className="mb-1 block text-[11.5px] font-semibold text-text-secondary"
                    >
                      {field.label}
                    </label>
                    <Input
                      id={`derm-param-${field.key}`}
                      value={form.params[field.key] ?? ""}
                      onChange={(event) =>
                        setParam(field.key, event.target.value)
                      }
                      placeholder={field.placeholder}
                      autoComplete="off"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {form.kind === "biopsy" && (
            <div className="mt-4 rounded-card border border-hairline p-3">
              <p className="text-ink mb-2 text-[12px] font-bold uppercase tracking-wide">
                Biopsy & specimen tracker
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="derm-spec-type"
                    className="mb-1 block text-[11.5px] font-semibold text-text-secondary"
                  >
                    Specimen / biopsy type
                  </label>
                  <Input
                    id="derm-spec-type"
                    value={form.specimenType}
                    onChange={(event) =>
                      set("specimenType", event.target.value)
                    }
                    placeholder="e.g. punch biopsy"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label
                    htmlFor="derm-spec-lab"
                    className="mb-1 block text-[11.5px] font-semibold text-text-secondary"
                  >
                    Pathology lab
                  </label>
                  <Input
                    id="derm-spec-lab"
                    value={form.specimenLab}
                    onChange={(event) => set("specimenLab", event.target.value)}
                    placeholder="e.g. City Histopath"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label
                    htmlFor="derm-spec-status"
                    className="mb-1 block text-[11.5px] font-semibold text-text-secondary"
                  >
                    Status
                  </label>
                  <NativeSelect
                    id="derm-spec-status"
                    value={form.specimenStatus}
                    onChange={(event) =>
                      set(
                        "specimenStatus",
                        event.target.value as DermSpecimenStatus,
                      )
                    }
                  >
                    {(
                      [
                        "collected",
                        "sent_to_lab",
                        "in_lab",
                        "reported",
                      ] as const
                    ).map((status) => (
                      <option key={status} value={status}>
                        {status.replace(/_/g, " ")}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div>
                  <label
                    htmlFor="derm-spec-dispatch"
                    className="mb-1 block text-[11.5px] font-semibold text-text-secondary"
                  >
                    Dispatch date
                  </label>
                  <Input
                    id="derm-spec-dispatch"
                    type="date"
                    value={form.specimenDispatchedAt}
                    onChange={(event) =>
                      set("specimenDispatchedAt", event.target.value)
                    }
                  />
                </div>
              </div>
              <p className="mt-2 text-[11px] text-text-muted">
                A specimen ID is generated on save. This is the clinic&apos;s own
                numbering â€” it is not a lab-issued barcode.
              </p>
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="derm-proc-notes"
                className="text-ink mb-1.5 block text-[12.5px] font-bold"
              >
                Procedure notes
              </label>
              <Textarea
                id="derm-proc-notes"
                rows={2}
                value={form.notes}
                onChange={(event) => set("notes", event.target.value)}
                placeholder="Findings, technique, observationsâ€¦"
              />
            </div>
            <div>
              <label
                htmlFor="derm-proc-aftercare"
                className="text-ink mb-1.5 block text-[12.5px] font-bold"
              >
                Aftercare
              </label>
              <Textarea
                id="derm-proc-aftercare"
                rows={2}
                value={form.aftercare}
                onChange={(event) => set("aftercare", event.target.value)}
                placeholder="Cleansing, dressing changes, sun protectionâ€¦"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  "Keep dry 24 h",
                  "Leave dressing 48 h",
                  "Sunscreen daily",
                  "Avoid picking",
                  "Antibiotic ointment",
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() =>
                      set(
                        "aftercare",
                        form.aftercare ? `${form.aftercare}; ${chip}` : chip,
                      )
                    }
                    className="rounded-full border border-hairline bg-app px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <label
              htmlFor="derm-proc-complications"
              className="text-ink mb-1.5 block text-[12.5px] font-bold"
            >
              Complications / adverse events
            </label>
            <Textarea
              id="derm-proc-complications"
              rows={2}
              value={form.complications}
              onChange={(event) => set("complications", event.target.value)}
              placeholder="Any unexpected bleeding, reaction, etc."
            />
          </div>

          {error && (
            <p className="mt-2 text-[12px] font-medium text-status-destructive">
              {error}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            {editingId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={reset}
                disabled={pending}
              >
                Cancel
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={pending}
              className="gap-1.5"
            >
              <Scissors aria-hidden="true" className="size-3.5" />
              {pending
                ? "Savingâ€¦"
                : editingId
                  ? "Update procedure"
                  : "Record procedure"}
            </Button>
          </div>
        </RecordSection>
      )}

      {procedures.length > 0 ? (
        <div className="space-y-3">
          <SpecialtyHeading
            title="Procedure history"
            description="Newest first"
          />
          {procedures.map((procedure) => (
            <ProcedureRow
              key={procedure.id}
              procedure={procedure}
              canManage={canManage}
              onEdit={loadForEdit}
              onDelete={remove}
              onSpecimenStatus={setSpecimenStatus}
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

const SPECIMEN_STATUS_LABEL: Record<string, string> = {
  collected: "Collected",
  sent_to_lab: "Sent to lab",
  in_lab: "In lab",
  reported: "Reported",
  cancelled: "Cancelled",
};

function ProcedureRow({
  procedure,
  canManage,
  onDelete,
  onEdit,
  onSpecimenStatus,
}: {
  procedure: DermProcedure;
  canManage: boolean;
  onDelete: (id: string) => void;
  onEdit: (procedure: DermProcedure) => void;
  onSpecimenStatus: (id: string, status: DermSpecimenStatus) => void;
}) {
  const params = Object.entries(procedure.params ?? {});
  return (
    <RecordSection
      title={procedure.procedure_name}
      meta={
        canManage && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-text-muted"
              onClick={() => onEdit(procedure)}
              aria-label="Edit procedure"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>{" "}
            <ConfirmDeleteButton
              ariaLabel="Delete procedure"
              title="Delete this procedure?"
              description="This permanently removes the procedure record entry."
              onConfirm={() => onDelete(procedure.id)}
            />
          </div>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-faint flex items-center gap-1 text-[11px]">
          <CalendarDays aria-hidden="true" className="size-3.5" />
          {procedure.procedure_date}
        </span>
        {procedure.procedure_kind && (
          <Badge className="bg-app text-text-secondary">
            {KIND_LABEL[procedure.procedure_kind] ?? procedure.procedure_kind}
          </Badge>
        )}
        {procedure.consent_status && (
          <Badge className="bg-app text-text-secondary">
            {CONSENT_LABEL[procedure.consent_status] ??
              procedure.consent_status}
          </Badge>
        )}
        {procedure.body_site && (
          <span className="text-[11.5px] text-text-secondary">
            {procedure.body_site}
          </span>
        )}
      </div>

      {Object.keys(procedure.params).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(procedure.params).map(([key, value]) => (
            <span
              key={key}
              className="rounded-full border border-hairline px-2 py-0.5 text-[11px]"
            >

              <span className="text-text-muted">{fieldLabel(key)}:</span>{" "}
              <span className="font-medium text-text-secondary">{value}</span>
            </span>
          ))}
        </div>
      )}

      <RecordNote label="Notes" value={procedure.notes} />
      <RecordNote label="Aftercare" value={procedure.aftercare} />
      {procedure.complications && (
        <RecordNote label="Complications" value={procedure.complications} />
      )}

      {procedure.specimen_id && (
        <div className="mt-3 rounded-card border border-hairline p-3">
          <p className="text-ink mb-1.5 text-[12px] font-bold uppercase tracking-wide">
            Specimen {procedure.specimen_id}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-text-secondary">
            {procedure.specimen_type && (
              <span>Type: {procedure.specimen_type}</span>
            )}
            {procedure.specimen_lab && (
              <span>Lab: {procedure.specimen_lab}</span>
            )}
            {procedure.specimen_dispatched_at && (
              <span>Dispatched: {procedure.specimen_dispatched_at}</span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Status
            </span>
            {canManage ? (
              <NativeSelect
                aria-label="Specimen status"
                className="h-8 w-[150px] text-[12px]"
                value={procedure.specimen_status ?? "collected"}
                onChange={(event) =>
                  onSpecimenStatus(
                    procedure.id,
                    event.target.value as DermSpecimenStatus,
                  )
                }
              >
                {(
                  [
                    "collected",
                    "sent_to_lab",
                    "in_lab",
                    "reported",
                    "cancelled",
                  ] as const
                ).map((status) => (
                  <option key={status} value={status}>
                    {status.replace(/_/g, " ")}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <span className="text-[12.5px] capitalize text-text-secondary">
                {(procedure.specimen_status ?? "collected").replace(/_/g, " ")}
              </span>
            )}
          </div>
        </div>
      )}
    </RecordSection>
  );
}

function fieldLabel(k: string) { return k.replace(/_/g, ' '); }
