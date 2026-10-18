"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, Pencil, Plus, Scissors, X } from "lucide-react";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteClinicMachineAction,
  saveClinicMachineAction,
} from "@/lib/actions/clinic-machines";
import {
  deleteDermProcedureAction,
  saveDermProcedureAction,
  updateDermSpecimenStatusAction,
} from "@/lib/actions/specialty-workspaces";
import { cn } from "@/lib/utils";
import type {
  ClinicMachine,
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

/**
 * `params` keys the clinician invented on the fly ("Add Custom Parameter",
 * §9.4) are namespaced so they never collide with a profile or base field
 * key; the stored suffix is the label the clinician typed.
 */
const CUSTOM_PREFIX = "custom: ";
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
  /** Selected registry machine (client-only — history keeps the name snapshot). */
  machineId: "",
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
  machines,
  canManage,
  canManageClinic,
}: {
  patientId: string;
  procedures: DermProcedure[];
  lesions: DermLesion[];
  /** The clinic's machine registry (0102) — drives the parameter profiles. */
  machines: ClinicMachine[];
  canManage: boolean;
  /** Owner/admin/clinic_admin — gates the machine registry manager. */
  canManageClinic?: boolean;
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

  /** "Add Custom Parameter" (§9.4) — a namespaced empty row, never colliding. */
  function addCustomParam() {
    setForm((current) => {
      const params = { ...current.params };
      let label = "New parameter";
      let suffix = 2;
      while (`${CUSTOM_PREFIX}${label}` in params) {
        label = `New parameter ${suffix}`;
        suffix += 1;
      }
      params[`${CUSTOM_PREFIX}${label}`] = "";
      return { ...current, params };
    });
  }

  /** Renaming a custom parameter moves its value to the new namespaced key. */
  function renameCustomParam(oldKey: string, label: string) {
    setForm((current) => {
      const params = { ...current.params };
      const value = params[oldKey] ?? "";
      delete params[oldKey];
      params[`${CUSTOM_PREFIX}${label}`] = value;
      return { ...current, params };
    });
  }

  function removeParam(key: string) {
    setForm((current) => {
      const params = { ...current.params };
      delete params[key];
      return { ...current, params };
    });
  }

  /**
   * Choosing a registered machine snapshots its name into `params.machine`
   * (history survives a later rename/retirement) and swaps the parameter
   * inputs to that machine's profile.
   */
  function selectMachine(machineId: string) {
    setForm((current) => {
      const params = { ...current.params };
      const machine = machines.find((entry) => entry.id === machineId);
      if (machine) params.machine = machine.name;
      else delete params.machine;
      return { ...current, machineId, params };
    });
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
      machineId:
        machines.find(
          (machine) => machine.name === (procedure.params.machine ?? ""),
        )?.id ?? "",
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

  const activeMachines = machines.filter((machine) => machine.is_active);
  const selectedMachine =
    machines.find((machine) => machine.id === form.machineId) ?? null;
  /** The machine picker belongs on the laser/energy card (§9.3/§9.4). */
  const machineSelectVisible =
    form.kind === "laser" && activeMachines.length > 0;
  /**
   * Parameter inputs: a selected machine's profile replaces the base list
   * when the clinic defined fields for it; otherwise the base list (minus the
   * free-text machine row while the picker represents it).
   */
  const profileFields =
    machineSelectVisible &&
    selectedMachine &&
    selectedMachine.parameter_fields.length > 0
      ? selectedMachine.parameter_fields
      : null;
  const baseFields = profileFields
    ? []
    : PARAM_FIELDS[form.kind].filter(
        (field) =>
          !(machineSelectVisible && selectedMachine && field.key === "machine"),
      );
  const customKeys = Object.keys(form.params).filter((key) =>
    key.startsWith(CUSTOM_PREFIX),
  );

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

          <div className="mt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-ink text-[12px] font-bold uppercase tracking-wide">
                {PROCEDURE_KINDS.find((k) => k.value === form.kind)?.label}{" "}
                parameters
              </p>
              <button
                type="button"
                onClick={addCustomParam}
                className="flex items-center gap-1 rounded-full border border-hairline px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
              >
                <Plus aria-hidden="true" className="size-3" />
                Add custom parameter
              </button>
            </div>

            {machineSelectVisible && (
              <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="derm-proc-machine"
                    className="mb-1 block text-[11.5px] font-semibold text-text-secondary"
                  >
                    Machine / device profile
                  </label>
                  <NativeSelect
                    id="derm-proc-machine"
                    value={form.machineId}
                    onChange={(event) => selectMachine(event.target.value)}
                  >
                    <option value="">Manual entry (no profile)</option>
                    {activeMachines.map((machine) => (
                      <option key={machine.id} value={machine.id}>
                        {machine.name}
                        {machine.brand_model ? ` - ${machine.brand_model}` : ""}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                {selectedMachine && (
                  <div className="flex flex-wrap items-center gap-1.5 pb-1">
                    {selectedMachine.category && (
                      <Badge className="bg-app text-text-secondary">
                        {selectedMachine.category}
                      </Badge>
                    )}
                    {selectedMachine.parameter_fields.length > 0 && (
                      <span className="text-[11px] text-text-muted">
                        {selectedMachine.parameter_fields.length} parameter
                        {selectedMachine.parameter_fields.length === 1
                          ? ""
                          : "s"}{" "}
                        from this profile
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {(profileFields ?? baseFields).length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(profileFields ?? baseFields).map((field) => (
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
            )}

            {customKeys.length > 0 && (
              <div className="mt-3 space-y-2">
                {customKeys.map((key) => (
                  <div key={key} className="flex items-end gap-2">
                    <div className="min-w-0 flex-1 sm:max-w-[240px]">
                      <label
                        htmlFor={`derm-custom-${key}`}
                        className="mb-1 block text-[11.5px] font-semibold text-text-secondary"
                      >
                        Parameter
                      </label>
                      <Input
                        id={`derm-custom-${key}`}
                        value={key.slice(CUSTOM_PREFIX.length)}
                        onChange={(event) =>
                          renameCustomParam(key, event.target.value)
                        }
                        placeholder="e.g. Spot cooling"
                        autoComplete="off"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor={`derm-custom-value-${key}`}
                        className="mb-1 block text-[11.5px] font-semibold text-text-secondary"
                      >
                        Value
                      </label>
                      <Input
                        id={`derm-custom-value-${key}`}
                        value={form.params[key] ?? ""}
                        onChange={(event) => setParam(key, event.target.value)}
                        placeholder="e.g. 30/20"
                        autoComplete="off"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeParam(key)}
                      aria-label="Remove custom parameter"
                      className="mb-1.5 flex size-7 shrink-0 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-app hover:text-status-destructive"
                    >
                      <X aria-hidden="true" className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="mt-2 text-[11px] text-text-muted">
              Values are entered by hand from the device&apos;s display — this
              record does not configure or read from the machine.
            </p>
          </div>

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
                A specimen ID is generated on save. This is the clinic&apos;s
                own numbering â€” it is not a lab-issued barcode.
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

      {canManageClinic && <MachineManager machines={machines} />}

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

type MachineFormState = {
  id: string;
  name: string;
  brand_model: string;
  category: string;
  is_active: boolean;
  fields: { label: string; placeholder: string }[];
};

const EMPTY_MACHINE_FORM: MachineFormState = {
  id: "",
  name: "",
  brand_model: "",
  category: "",
  is_active: true,
  fields: [{ label: "", placeholder: "" }],
};

/**
 * Admin-only (owner/admin/clinic_admin, §9.4) registry for the clinic's
 * in-office machines. Each machine's parameter fields become the inputs the
 * procedure card shows when the clinician selects it; recorded values still
 * save into the procedure's own `params` snapshot, so history survives
 * renames and retirements.
 */
function MachineManager({ machines }: { machines: ClinicMachine[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState<MachineFormState>({
    ...EMPTY_MACHINE_FORM,
  });

  function openAdd() {
    setForm({
      ...EMPTY_MACHINE_FORM,
      fields: [{ label: "", placeholder: "" }],
    });
    setOpen(true);
  }

  function openEdit(machine: ClinicMachine) {
    setForm({
      id: machine.id,
      name: machine.name,
      brand_model: machine.brand_model ?? "",
      category: machine.category ?? "",
      is_active: machine.is_active,
      fields:
        machine.parameter_fields.length > 0
          ? machine.parameter_fields.map((field) => ({
              label: field.label,
              placeholder: field.placeholder ?? "",
            }))
          : [{ label: "", placeholder: "" }],
    });
    setOpen(true);
  }

  function setField(
    index: number,
    patch: Partial<{ label: string; placeholder: string }>,
  ) {
    setForm((current) => ({
      ...current,
      fields: current.fields.map((field, position) =>
        position === index ? { ...field, ...patch } : field,
      ),
    }));
  }

  function addField() {
    setForm((current) => ({
      ...current,
      fields: [...current.fields, { label: "", placeholder: "" }],
    }));
  }

  function removeField(index: number) {
    setForm((current) => ({
      ...current,
      fields: current.fields.filter((_, position) => position !== index),
    }));
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error("Enter the machine name.");
      return;
    }
    setPending(true);
    const result = await saveClinicMachineAction({
      id: form.id || undefined,
      name: form.name,
      brand_model: form.brand_model,
      category: form.category,
      is_active: form.is_active,
      parameter_fields: form.fields
        .filter((field) => field.label.trim())
        .map((field) => ({
          key: "",
          label: field.label.trim(),
          placeholder: field.placeholder.trim(),
        })),
    });
    setPending(false);
    if (result.ok) {
      toast.success(form.id ? "Machine updated" : "Machine added");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function remove(id: string) {
    const result = await deleteClinicMachineAction(id);
    if (result.ok) {
      toast.success("Machine removed");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <RecordSection
      title="Clinic machines"
      meta={
        <Badge className="bg-app text-text-secondary">
          {machines.length} registered
        </Badge>
      }
    >
      <p className="text-[12px] text-text-muted">
        Register each in-office device once and define the parameters it
        actually has; the procedure card then shows exactly those fields when
        the machine is selected.
      </p>

      {machines.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-text-muted">
          No machines registered yet.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {machines.map((machine) => (
            <li
              key={machine.id}
              className="flex items-start justify-between gap-3 rounded-card border border-hairline bg-surface p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-ink text-[13px] font-semibold">
                    {machine.name}
                  </span>
                  {machine.brand_model && (
                    <span className="text-[11.5px] text-text-secondary">
                      {machine.brand_model}
                    </span>
                  )}
                  <Badge
                    className={
                      machine.is_active
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "bg-app text-text-muted"
                    }
                  >
                    {machine.is_active ? "Active" : "Retired"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[11.5px] text-text-muted">
                  {machine.category ? `${machine.category} - ` : ""}
                  {machine.parameter_fields.length} parameter
                  {machine.parameter_fields.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-text-muted"
                  onClick={() => openEdit(machine)}
                  aria-label="Edit machine"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <ConfirmDeleteButton
                  ariaLabel="Delete machine"
                  title="Remove this machine?"
                  description="Procedures already recorded keep their values; only the registry entry and its parameter profile are removed."
                  onConfirm={() => remove(machine.id)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={openAdd}
        >
          <Plus aria-hidden="true" className="size-3.5" />
          Add machine
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="wide">
          <DialogHeader>
            <DialogTitle>
              {form.id ? "Edit machine" : "Add machine"}
            </DialogTitle>
            <DialogDescription>
              The name and parameter fields below become the inputs the
              procedure card shows when this machine is selected. Values are
              recorded manually — nothing here links to the device itself.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="machine-name"
                  className="text-ink mb-1.5 block text-[12.5px] font-bold"
                >
                  Machine name
                </label>
                <Input
                  id="machine-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="e.g. Nd:YAG laser"
                  autoComplete="off"
                />
              </div>
              <div>
                <label
                  htmlFor="machine-brand"
                  className="text-ink mb-1.5 block text-[12.5px] font-bold"
                >
                  Brand / model
                </label>
                <Input
                  id="machine-brand"
                  value={form.brand_model}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      brand_model: event.target.value,
                    }))
                  }
                  placeholder="e.g. GentleMax Pro"
                  autoComplete="off"
                />
              </div>
              <div>
                <label
                  htmlFor="machine-category"
                  className="text-ink mb-1.5 block text-[12.5px] font-bold"
                >
                  Category
                </label>
                <Input
                  id="machine-category"
                  value={form.category}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                  placeholder="e.g. Laser / energy"
                  autoComplete="off"
                />
              </div>
              <div>
                <label
                  htmlFor="machine-status"
                  className="text-ink mb-1.5 block text-[12.5px] font-bold"
                >
                  Status
                </label>
                <NativeSelect
                  id="machine-status"
                  value={form.is_active ? "active" : "retired"}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      is_active: event.target.value === "active",
                    }))
                  }
                >
                  <option value="active">Active</option>
                  <option value="retired">Retired</option>
                </NativeSelect>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-ink text-[12px] font-bold uppercase tracking-wide">
                  Parameter fields
                </p>
                <button
                  type="button"
                  onClick={addField}
                  className="flex items-center gap-1 rounded-full border border-hairline px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <Plus aria-hidden="true" className="size-3" />
                  Add field
                </button>
              </div>
              <div className="space-y-2">
                {form.fields.map((field, index) => (
                  <div key={index} className="flex items-end gap-2">
                    <div className="min-w-0 flex-1 sm:max-w-[240px]">
                      <label
                        htmlFor={`machine-field-label-${index}`}
                        className="mb-1 block text-[11.5px] font-semibold text-text-secondary"
                      >
                        Parameter
                      </label>
                      <Input
                        id={`machine-field-label-${index}`}
                        value={field.label}
                        onChange={(event) =>
                          setField(index, { label: event.target.value })
                        }
                        placeholder="e.g. Fluence"
                        autoComplete="off"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor={`machine-field-placeholder-${index}`}
                        className="mb-1 block text-[11.5px] font-semibold text-text-secondary"
                      >
                        Hint
                      </label>
                      <Input
                        id={`machine-field-placeholder-${index}`}
                        value={field.placeholder}
                        onChange={(event) =>
                          setField(index, { placeholder: event.target.value })
                        }
                        placeholder="e.g. 6 J/cm2"
                        autoComplete="off"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeField(index)}
                      aria-label="Remove parameter field"
                      className="mb-1.5 flex size-7 shrink-0 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-app hover:text-status-destructive"
                    >
                      <X aria-hidden="true" className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={pending}
              className="gap-1.5"
            >
              {pending ? "Saving..." : form.id ? "Save machine" : "Add machine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RecordSection>
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

function fieldLabel(k: string) {
  if (k.startsWith(CUSTOM_PREFIX)) return k.slice(CUSTOM_PREFIX.length);
  return k.replace(/_/g, " ");
}
