"use client";

import { useActionState, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MedicineEntry } from "@/components/consultation/medicine-entry";
import { LabOrderEntry } from "@/components/consultation/lab-order-entry";
import { TemplateManager } from "@/components/consultation/template-manager";
import { savePrescriptionAction } from "@/lib/actions/consultation";
import type { ActionResult } from "@/types";
import type { Prescription, MedicineEntry as MedEntry, LabOrder, PrescriptionTemplate } from "@/types/database";

/**
 * Full prescription form — chief complaint, findings, diagnosis, medicines,
 * lab orders, follow-up, doctor notes, templates, and print.
 */
export function PrescriptionForm({
  visitId,
  prescription,
  doctorId,
  templates,
}: {
  visitId: string;
  prescription: Prescription | null;
  doctorId: string | null;
  templates: PrescriptionTemplate[];
}) {
  const router = useRouter();

  const [chiefComplaint, setChiefComplaint] = useState(prescription?.chief_complaint ?? "");
  const [findings, setFindings] = useState(prescription?.findings ?? "");
  const [diagnosis, setDiagnosis] = useState(prescription?.diagnosis ?? "");
  const [customDiagnosis, setCustomDiagnosis] = useState(prescription?.custom_diagnosis ?? "");
  const [medicines, setMedicines] = useState<MedEntry[]>(
    prescription?.medicines?.length
      ? prescription.medicines
      : [{ name: "", route: "", form: "", frequency: "", duration: "", unit: "", instructions: "" }],
  );
  const [labOrders, setLabOrders] = useState<LabOrder[]>(
    prescription?.lab_orders?.length ? prescription.lab_orders : [],
  );
  const [followUpDate, setFollowUpDate] = useState(prescription?.follow_up_date ?? "");
  const [followUpNotes, setFollowUpNotes] = useState(prescription?.follow_up_notes ?? "");
  const [doctorNotes, setDoctorNotes] = useState(prescription?.doctor_notes ?? "");

  const [state, formAction] = useActionState<
    ActionResult<string> | null,
    FormData
  >(savePrescriptionAction, null);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state?.ok, router]);

  // Medicine handlers
  const addMedicine = useCallback(() => {
    setMedicines((prev) => [
      ...prev,
      { name: "", route: "", form: "", frequency: "", duration: "", unit: "", instructions: "" },
    ]);
  }, []);

  const updateMedicine = useCallback((index: number, field: keyof MedEntry, value: string) => {
    setMedicines((prev) => prev.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  }, []);

  const removeMedicine = useCallback((index: number) => {
    setMedicines((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Lab order handlers
  const addLabOrder = useCallback(() => {
    setLabOrders((prev) => [...prev, { test_name: "", notes: "" }]);
  }, []);

  const updateLabOrder = useCallback((index: number, field: keyof LabOrder, value: string) => {
    setLabOrders((prev) => prev.map((o, i) => (i === index ? { ...o, [field]: value } : o)));
  }, []);

  const removeLabOrder = useCallback((index: number) => {
    setLabOrders((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Template load handler
  const handleLoadTemplate = useCallback((template: PrescriptionTemplate) => {
    setDiagnosis(template.diagnosis);
    setCustomDiagnosis(template.custom_diagnosis);
    setMedicines(
      template.medicines?.length
        ? template.medicines
        : [{ name: "", route: "", form: "", frequency: "", duration: "", unit: "", instructions: "" }],
    );
    setLabOrders(template.lab_orders?.length ? template.lab_orders : []);
    setDoctorNotes(template.doctor_notes);
  }, []);

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
        </Label>
        <Textarea
          id="chiefComplaint"
          name="chiefComplaint"
          value={chiefComplaint}
          onChange={(e) => setChiefComplaint(e.target.value)}
          placeholder="Patient's primary complaint..."
          rows={2}
        />
      </div>

      {/* Clinical Findings */}
      <div className="space-y-1.5">
        <Label htmlFor="findings" className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
          Clinical / Examination Findings
        </Label>
        <Textarea
          id="findings"
          name="findings"
          value={findings}
          onChange={(e) => setFindings(e.target.value)}
          placeholder="Examination findings, observations..."
          rows={3}
        />
      </div>

      {/* Diagnosis */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="diagnosis" className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Diagnosis
          </Label>
          <Input
            id="diagnosis"
            name="diagnosis"
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            placeholder="e.g. Upper Respiratory Infection"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="customDiagnosis" className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Custom Diagnosis (Free Text)
          </Label>
          <Input
            id="customDiagnosis"
            name="customDiagnosis"
            value={customDiagnosis}
            onChange={(e) => setCustomDiagnosis(e.target.value)}
            placeholder="Alternative / additional diagnosis"
          />
        </div>
      </div>

      {/* Medicines */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Medicines ({medicines.length})
          </Label>
          <Button type="button" variant="outline" size="sm" onClick={addMedicine} className="text-xs">
            <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
            Add Medicine
          </Button>
        </div>
        <div className="space-y-2">
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
          <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Lab Tests Ordered ({labOrders.length})
          </Label>
          <Button type="button" variant="outline" size="sm" onClick={addLabOrder} className="text-xs">
            <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
            Add Lab Test
          </Button>
        </div>
        {labOrders.length > 0 && (
          <div className="space-y-2">
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
          </Label>
          <Input
            id="followUpDate"
            name="followUpDate"
            type="date"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="followUpNotes" className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Follow-Up Notes
          </Label>
          <Input
            id="followUpNotes"
            name="followUpNotes"
            value={followUpNotes}
            onChange={(e) => setFollowUpNotes(e.target.value)}
            placeholder="e.g. Review blood work results"
          />
        </div>
      </div>

      {/* Doctor Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="doctorNotes" className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
          Doctor Notes
        </Label>
        <Textarea
          id="doctorNotes"
          name="doctorNotes"
          value={doctorNotes}
          onChange={(e) => setDoctorNotes(e.target.value)}
          placeholder="Additional notes for the patient or file..."
          rows={3}
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
}
