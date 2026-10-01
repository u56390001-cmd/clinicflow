"use client";

import { useCallback, useEffect, useMemo, useActionState, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MedicineEntry } from "@/components/consultation/medicine-entry";
import { LabOrderEntry } from "@/components/consultation/lab-order-entry";
import { TemplateManager } from "@/components/consultation/template-manager";
import {
  BLANK_MEDICINE,
  draftFromPrescription,
  usePrescriptionDraft,
  usePrescriptionDraftBridge,
} from "@/components/patients/record/prescription-draft-context";
import { savePrescriptionAction } from "@/lib/actions/consultation";
import { cn } from "@/lib/utils";
import type { PrescriptionDraft } from "@/components/patients/record/prescription-draft-context";
import type { ActionResult } from "@/types";
import type { Prescription, MedicineEntry as MedEntry, LabOrder, PrescriptionTemplate } from "@/types/database";
import type { CopilotExtraction } from "@/lib/copilot/types";

export interface PrescriptionFormRef {
  populateFromCopilot: (data: CopilotExtraction) => void;
}

/**
 * Full prescription form — chief complaint, findings, diagnosis, medicines,
 * lab orders, follow-up, doctor notes, templates, and print.
 *
 * Two owners of the field values, and only one is ever active:
 *
 * - **Internal state** (the default) — the full-screen Write Prescription
 *   overlay and `/app/consultation` render this component outside any draft
 *   provider, so there is no context and every keystroke lives in local state
 *   exactly as it always has.
 * - **The draft context** — the patient record's Prescription tab wraps the
 *   form in a `PrescriptionDraftProvider`; values move up into it, which is
 *   what lets a doctor switch to History mid-prescription and come back to the
 *   same half-typed row (the tab unmounts, the draft doesn't). The same object
 *   is the voice copilot's write target — `applied` marks ring fields amber
 *   until the doctor edits them.
 */
export const PrescriptionForm = forwardRef<PrescriptionFormRef, {
  visitId: string;
  prescription: Prescription | null;
  doctorId: string | null;
  templates: PrescriptionTemplate[];
  /**
   * False where "Save as Template" is rendered outside the form — the patient
   * record's Rx workspace puts it in its sub-header, next to Print and Complete.
   */
  showTemplateSave?: boolean;
}>(function PrescriptionForm({
  visitId,
  prescription,
  doctorId,
  templates,
  showTemplateSave = true,
}, ref) {
  const router = useRouter();
  // Raw context for seeding; the gated bridge below is only live once the
  // provider actually holds a draft for THIS visit (a different visit's draft
  // must never leak in, and outside any provider both are null → fallback).
  const ctx = usePrescriptionDraft();
  const bridge = usePrescriptionDraftBridge(visitId);

  // The fallback owner — used whenever no provider claims this visit.
  const [localDraft, setLocalDraft] = useState<PrescriptionDraft>(() =>
    draftFromPrescription(prescription),
  );
  // Updater-free merge: patching one field must not clobber the other eight.
  const setLocal = useCallback(
    (updates: Partial<PrescriptionDraft>) =>
      setLocalDraft((prev) => ({ ...prev, ...updates })),
    [],
  );

  const draft = bridge?.draft ?? localDraft;
  const patch = bridge ? bridge.patch : setLocal;
  // Fields the copilot wrote and the doctor hasn't touched since — empty
  // outside the tab, so every ring below degrades to `undefined`.
  const marked = useMemo(
    () => new Set(Object.keys(bridge?.applied ?? {})),
    [bridge?.applied],
  );

  // Seed the context for this visit. `ensure` adopts the seed only when the
  // visit genuinely changed, so a draft that survived a tab switch is kept —
  // that is the whole point of the context. Idempotent by visit id, so it is
  // safe to run on every provider change; the dep list stays minimal.
  useEffect(() => {
    ctx?.ensure(visitId, draftFromPrescription(prescription));
    // Seeding is keyed to the visit, not to every prop re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, visitId]);

  // The field names the JSX below reads bare — one alias list so the markup
  // never has to know which owner (context or local state) is active.
  const {
    chiefComplaint,
    findings,
    diagnosis,
    customDiagnosis,
    medicines,
    labOrders,
    followUpDate,
    followUpNotes,
    doctorNotes,
  } = draft;

  const [state, formAction] = useActionState<
    ActionResult<string> | null,
    FormData
  >(savePrescriptionAction, null);

  // Handle each successful save exactly once. `bridge` legitimately changes
  // identity on every keystroke, and the `ok` boolean stays `true` across
  // consecutive saves — keying on the result *object* fires on every fresh
  // save and never re-fires while typing after one.
  const handledResult = useRef<ActionResult<string> | null>(null);
  useEffect(() => {
    if (state?.ok && handledResult.current !== state) {
      handledResult.current = state;
      // A save is the doctor's confirmation of everything on screen — AI
      // marks included — so the review rings clear with it (no-op when no
      // provider owns this visit).
      bridge?.clearApplied();
      router.refresh();
    }
  }, [state, bridge, router]);

  // Medicine handlers
  const addMedicine = useCallback(() => {
    patch({ medicines: [...draft.medicines, { ...BLANK_MEDICINE }] });
  }, [draft.medicines, patch]);

  const updateMedicine = useCallback(
    (index: number, field: keyof MedEntry, value: string) => {
      patch({
        medicines: draft.medicines.map((m, i) =>
          i === index ? { ...m, [field]: value } : m,
        ),
      });
    },
    [draft.medicines, patch],
  );

  const removeMedicine = useCallback(
    (index: number) => {
      patch({ medicines: draft.medicines.filter((_, i) => i !== index) });
    },
    [draft.medicines, patch],
  );

  // Lab order handlers
  const addLabOrder = useCallback(() => {
    patch({ labOrders: [...draft.labOrders, { test_name: "", notes: "" }] });
  }, [draft.labOrders, patch]);

  const updateLabOrder = useCallback(
    (index: number, field: keyof LabOrder, value: string) => {
      patch({
        labOrders: draft.labOrders.map((o, i) =>
          i === index ? { ...o, [field]: value } : o,
        ),
      });
    },
    [draft.labOrders, patch],
  );

  const removeLabOrder = useCallback(
    (index: number) => {
      patch({ labOrders: draft.labOrders.filter((_, i) => i !== index) });
    },
    [draft.labOrders, patch],
  );

  // Template load handler — overwrites the five fields a template owns,
  // leaving chief complaint / findings / follow-up alone (as before).
  const handleLoadTemplate = useCallback(
    (template: PrescriptionTemplate) => {
      patch({
        diagnosis: template.diagnosis,
        customDiagnosis: template.custom_diagnosis,
        medicines: template.medicines?.length
          ? template.medicines
          : [{ ...BLANK_MEDICINE }],
        labOrders: template.lab_orders?.length ? template.lab_orders : [],
        doctorNotes: template.doctor_notes,
      });
    },
    [patch],
  );

  // Copilot populate handler — maps CopilotExtraction to PrescriptionDraft
  const populateFromCopilot = useCallback(
    (extracted: CopilotExtraction) => {
      if (!extracted) return;

      const updates: Partial<PrescriptionDraft> = {};

      if (extracted.chief_complaint) {
        updates.chiefComplaint = extracted.chief_complaint;
      }

      if (extracted.findings) {
        updates.findings = extracted.findings;
      }

      if (extracted.diagnosis) {
        updates.diagnosis = extracted.diagnosis;
      }

      if (extracted.medicines && extracted.medicines.length > 0) {
        updates.medicines = extracted.medicines.map((m) => ({
          name: m.name,
          route: m.route || "Oral",
          form: m.form || "Tablet",
          frequency: m.frequency,
          duration: m.duration,
          unit: m.unit || "Days",
          instructions: m.instructions
        }));
      }

      if (extracted.lab_orders && extracted.lab_orders.length > 0) {
        updates.labOrders = extracted.lab_orders.map((l) => ({
          test_name: l.test_name,
          notes: l.notes || ""
        }));
      }

      if (extracted.follow_up_after) {
        updates.followUpDate = extracted.follow_up_after;
      }

      if (extracted.follow_up_notes) {
        updates.followUpNotes = extracted.follow_up_notes;
      }

      if (extracted.doctor_notes) {
        updates.doctorNotes = extracted.doctor_notes;
      }

      patch(updates);

      // Mark populated fields for amber ring
      if (bridge) {
        const keys = Object.keys(updates) as (keyof PrescriptionDraft)[];
        bridge.markApplied(keys);
      }
    },
    [patch, bridge],
  );

  // Expose populate method via ref
  useImperativeHandle(ref, () => ({
    populateFromCopilot
  }), [populateFromCopilot]);

  /** Ring for copilot-written fields — one class source so no field is missed. */
  const ring = (key: keyof PrescriptionDraft) =>
    marked.has(key)
      ? // The amber ring is the "AI wrote this, doctor hasn't confirmed it
        // yet" signal — never decorative.
        "ring-2 ring-status-warning/60"
      : undefined;

  return (
    <div className="space-y-6">
      {/* Template Manager: rendered as a sibling of the main form because it
          owns its own <form>s (save + delete). A <form> cannot nest inside
          another <form> — invalid HTML that also breaks React hydration. */}
      {doctorId && (
        <TemplateManager
          doctorId={doctorId}
          templates={templates}
          onLoad={handleLoadTemplate}
          values={draft}
          showSave={showTemplateSave}
        />
      )}

      <form action={formAction} className="space-y-6">
      <input type="hidden" name="visitId" value={visitId} />
      <input type="hidden" name="medicines" value={JSON.stringify(medicines)} />
      <input type="hidden" name="labOrders" value={JSON.stringify(labOrders)} />

      {/* Chief Complaint */}
      <div className="space-y-1.5">
        <Label htmlFor="chiefComplaint" className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
          Chief Complaint
          {marked.has("chiefComplaint") && <CopilotMark />}
        </Label>
        <Textarea
          id="chiefComplaint"
          name="chiefComplaint"
          value={chiefComplaint}
          onChange={(e) => patch({ chiefComplaint: e.target.value })}
          placeholder="Patient's primary complaint..."
          rows={2}
          className={ring("chiefComplaint")}
        />
      </div>

      {/* Clinical Findings */}
      <div className="space-y-1.5">
        <Label htmlFor="findings" className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
          Clinical / Examination Findings
          {marked.has("findings") && <CopilotMark />}
        </Label>
        <Textarea
          id="findings"
          name="findings"
          value={findings}
          onChange={(e) => patch({ findings: e.target.value })}
          placeholder="Examination findings, observations..."
          rows={3}
          className={ring("findings")}
        />
      </div>

      {/* Diagnosis */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="diagnosis" className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Diagnosis
            {marked.has("diagnosis") && <CopilotMark />}
          </Label>
          <Input
            id="diagnosis"
            name="diagnosis"
            value={diagnosis}
            onChange={(e) => patch({ diagnosis: e.target.value })}
            placeholder="e.g. Upper Respiratory Infection"
            className={ring("diagnosis")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="customDiagnosis" className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Custom Diagnosis (Free Text)
            {marked.has("customDiagnosis") && <CopilotMark />}
          </Label>
          <Input
            id="customDiagnosis"
            name="customDiagnosis"
            value={customDiagnosis}
            onChange={(e) => patch({ customDiagnosis: e.target.value })}
            placeholder="Alternative / additional diagnosis"
            className={ring("customDiagnosis")}
          />
        </div>
      </div>

      {/* Medicines */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Medicines ({medicines.length})
            {marked.has("medicines") && <CopilotMark />}
          </Label>
          <Button type="button" variant="outline" size="sm" onClick={addMedicine} className="text-xs">
            <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
            Add Medicine
          </Button>
        </div>
        <div className={cn("space-y-2", ring("medicines") && "rounded-lg ring-2 ring-status-warning/60 p-1.5")}>
          {medicines.map((med, i) => (
            <MedicineEntry
              key={i}
              index={i}
              medicine={med}
              onChange={updateMedicine}
              onRemove={removeMedicine}
              canRemove={medicines.length > 1}
            />
          ))}
        </div>
      </div>

      {/* Lab Orders */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Lab Tests Ordered ({labOrders.length})
            {marked.has("labOrders") && <CopilotMark />}
          </Label>
          <Button type="button" variant="outline" size="sm" onClick={addLabOrder} className="text-xs">
            <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
            Add Lab Test
          </Button>
        </div>
        {labOrders.length > 0 && (
          <div className={cn("space-y-2", ring("labOrders") && "rounded-lg ring-2 ring-status-warning/60 p-1.5")}>
            {labOrders.map((order, i) => (
              <LabOrderEntry
                key={i}
                index={i}
                order={order}
                onChange={updateLabOrder}
                onRemove={removeLabOrder}
                canRemove={labOrders.length > 1}
              />
            ))}
          </div>
        )}
      </div>

      {/* Follow-up */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="followUpDate" className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Follow-Up Date
            {marked.has("followUpDate") && <CopilotMark />}
          </Label>
          <Input
            id="followUpDate"
            name="followUpDate"
            type="date"
            value={followUpDate}
            onChange={(e) => patch({ followUpDate: e.target.value })}
            className={ring("followUpDate")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="followUpNotes" className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Follow-Up Notes
            {marked.has("followUpNotes") && <CopilotMark />}
          </Label>
          <Input
            id="followUpNotes"
            name="followUpNotes"
            value={followUpNotes}
            onChange={(e) => patch({ followUpNotes: e.target.value })}
            placeholder="e.g. Review blood work results"
            className={ring("followUpNotes")}
          />
        </div>
      </div>

      {/* Doctor Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="doctorNotes" className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
          Doctor Notes
          {marked.has("doctorNotes") && <CopilotMark />}
        </Label>
        <Textarea
          id="doctorNotes"
          name="doctorNotes"
          value={doctorNotes}
          onChange={(e) => patch({ doctorNotes: e.target.value })}
          placeholder="Additional notes for the patient or file..."
          rows={3}
          className={ring("doctorNotes")}
        />
      </div>

      {state && !state.ok && (
        <p className="text-xs text-status-destructive">{state.message}</p>
      )}
      {state?.ok && (
        <p className="text-xs text-status-success">Prescription saved successfully.</p>
      )}
      </form>
    </div>
  );
});

/** The "AI wrote this — review it" chip sitting beside a marked field's label. */
function CopilotMark() {
  return (
    <span
      className="copilot-field-in ml-1.5 inline-flex items-center rounded-pill bg-status-warning/15 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase leading-none tracking-wider text-status-warning"
      title="Filled by the voice copilot — edit or resave to clear"
    >
      AI
    </span>
  );
}
