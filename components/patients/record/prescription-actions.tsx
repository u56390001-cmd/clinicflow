"use client";

import { useCallback, useEffect, useState, useTransition, type ComponentProps } from "react";
import { Eye, Loader2, Pencil, Printer } from "lucide-react";
import { toast } from "sonner";

import { PrescriptionPreview } from "@/components/consultation/prescription-preview";
import {
  PrescriptionDraftProvider,
  usePrescriptionDraft,
} from "@/components/patients/record/prescription-draft-context";
import {
  RxBuilder,
  prescriptionFormData,
} from "@/components/patients/record/rx-builder";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { savePrescriptionAction } from "@/lib/actions/consultation";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import { cn } from "@/lib/utils";
import { formatNaiveDate } from "@/lib/utils/datetime";
import type { PatientPrescriptionRow } from "@/lib/patient-record";
import type {
  Doctor,
  PatientDirectoryRow,
} from "@/types/database";

/** The editor's own prop shape, so the dialog can never drift from `RxBuilder`. */
type PastMedicines = ComponentProps<typeof RxBuilder>["pastMedicines"];

/** Clinic-local "12 Oct 2026, 4:30 pm" for the last-updated stamp. */
function formatStamp(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** One `LABEL / value` pair in the read-only dialog. */
function ViewField({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
}) {
  if (!value?.trim()) return null;
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-text-primary">
        {value}
      </p>
    </div>
  );
}

/**
 * The per-card action row on the Prescriptions tab: View, Print and (for
 * clinicians) Edit. Edit reuses the consultation's `RxBuilder` inside a fresh
 * draft provider, so the on-screen editor is the one doctors already know, and
 * saving runs through the same `savePrescriptionAction` — which stamps
 * `updated_by` and appends the audit entry.
 */
export function PrescriptionActions({
  prescription,
  patient,
  clinic,
  timezone,
  canManage,
  pastMedicines,
  pastLabHistory,
}: {
  prescription: PatientPrescriptionRow;
  patient: PatientDirectoryRow;
  clinic: { name: string; address: string | null; phone: string | null };
  timezone: string;
  canManage: boolean;
  pastMedicines: PastMedicines;
  pastLabHistory: ComponentProps<typeof RxBuilder>["pastLabHistory"];
}) {
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [printPending, setPrintPending] = useState(false);

  const issued = prescription.visitDate ?? prescription.created_at;
  const visitDateLabel =
    formatNaiveDate(utcIsoToClinicLocalInput(issued, timezone)) || "";
  const visitDateNaive = utcIsoToClinicLocalInput(issued, timezone).slice(0, 10);
  const diagnosis =
    prescription.custom_diagnosis?.trim() || prescription.diagnosis?.trim() || "";

  // Print is a full-page browser action, so the preview has to be in the DOM
  // before window.print() runs. Mount it, let a paint happen, print, unmount.
  useEffect(() => {
    if (!printPending) return;
    const timer = setTimeout(() => {
      window.print();
      setPrintPending(false);
    }, 80);
    return () => clearTimeout(timer);
  }, [printPending]);

  const handlePrint = useCallback(() => setPrintPending(true), []);

  const previewDoctor = prescription.doctorName
    ? ({
        id: prescription.doctor_id ?? "",
        name: prescription.doctorName,
      } as unknown as Doctor)
    : null;

  const actionClass =
    "h-7 gap-1.5 rounded-[7px] px-2 text-[11px] font-semibold text-text-secondary hover:bg-brand-pale hover:text-brand-forest transition-colors";

  return (
    <>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={actionClass}
          onClick={() => setViewOpen(true)}
        >
          <Eye aria-hidden="true" className="size-3.5" />
          View
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={actionClass}
          onClick={handlePrint}
        >
          <Printer aria-hidden="true" className="size-3.5" />
          Print
        </Button>
        {canManage && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              actionClass,
              "text-brand-forest hover:bg-brand-forest hover:text-white",
            )}
            onClick={() => setEditOpen(true)}
          >
            <Pencil aria-hidden="true" className="size-3.5" />
            Edit Prescription
          </Button>
        )}
      </div>

      {/* Read-only detail view. The card is the summary; this is the same
          prescription without the surrounding list, for a focused read. */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent size="wide" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Prescription</DialogTitle>
            <DialogDescription>
              {visitDateLabel || "Undated"}
              {prescription.doctorName
                ? ` · Dr. ${prescription.doctorName}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="scrollbar-thin -mr-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
            <ViewField label="Diagnosis" value={diagnosis} />
            <ViewField
              label="Chief complaint"
              value={prescription.chief_complaint}
            />
            {prescription.medicines.length > 0 ? (
              <div className="overflow-x-auto rounded-control border border-text-muted/20">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-text-muted/20 bg-app text-left">
                      {["Medicine", "Dose", "Frequency", "Duration", "Instructions"].map(
                        (heading) => (
                          <th
                            key={heading}
                            scope="col"
                            className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted"
                          >
                            {heading}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-text-muted/15">
                    {prescription.medicines.map((medicine, index) => (
                      <tr key={`${medicine.name}-${index}`}>
                        <td className="px-3 py-2 font-medium text-text-primary">
                          {medicine.name || "—"}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {[medicine.unit, medicine.form, medicine.route]
                            .filter(Boolean)
                            .join(" ") || "—"}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {medicine.frequency || "—"}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {medicine.duration || "—"}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {medicine.instructions || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-text-muted">
                No medicines on this prescription.
              </p>
            )}

            {prescription.lab_orders.length > 0 && (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  Lab orders
                </p>
                <ul className="mt-1 flex flex-col gap-1">
                  {prescription.lab_orders.map((order, index) => (
                    <li
                      key={`${order.test_name}-${index}`}
                      className="text-sm text-text-primary"
                    >
                      {order.test_name}
                      {order.notes && (
                        <span className="text-text-secondary">
                          {" — "}
                          {order.notes}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <ViewField label="Findings" value={prescription.findings} />
            <ViewField label="Doctor notes" value={prescription.doctor_notes} />
            {prescription.follow_up_date && (
              <ViewField
                label="Follow-up"
                value={`${formatNaiveDate(prescription.follow_up_date)}${
                  prescription.follow_up_notes
                    ? ` · ${prescription.follow_up_notes}`
                    : ""
                }`}
              />
            )}
            <LastUpdatedNote prescription={prescription} timezone={timezone} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit reuses the consultation editor. A fresh provider per open means
          the draft is always seeded from the saved row, never a stale one. */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent size="wide" className="max-w-4xl">
          <PrescriptionDraftProvider>
            <EditPrescriptionForm
              prescription={prescription}
              visitId={prescription.visit_id}
              visitDateNaive={visitDateNaive}
              doctorName={prescription.doctorName}
              pastMedicines={pastMedicines}
              pastLabHistory={pastLabHistory}
              onDone={() => setEditOpen(false)}
              onCancel={() => setEditOpen(false)}
            />
          </PrescriptionDraftProvider>
        </DialogContent>
      </Dialog>

      {/* Hidden print sheet, mounted only while printing. `hideClassInPrint`
          suppresses the consultation workspace's own preview so only this one
          reaches the paper. */}
      {printPending && (
        <PrescriptionPreview
          prescription={prescription}
          patient={patient}
          doctor={previewDoctor}
          clinicName={clinic.name}
          clinicAddress={clinic.address}
          clinicPhone={clinic.phone}
          visitDate={visitDateLabel}
          vitals={null}
          printClass="rx-history-print"
          printId="rx-history-print-area"
          hideClassInPrint="print-preview"
        />
      )}
    </>
  );
}

/** "Last updated: <stamp> · Updated by: Dr <name>", hidden when never edited. */
export function LastUpdatedNote({
  prescription,
  timezone,
}: {
  prescription: PatientPrescriptionRow;
  timezone: string;
}) {
  if (!prescription.updated_by_name) return null;
  return (
    <p className="mt-1 border-t border-hairline pt-2 text-[11px] text-text-muted">
      Last updated: {formatStamp(prescription.updated_at, timezone)}
      {prescription.updated_by_name
        ? ` · Updated by: Dr ${prescription.updated_by_name}`
        : ""}
    </p>
  );
}

function EditPrescriptionForm({
  prescription,
  visitId,
  visitDateNaive,
  doctorName,
  pastMedicines,
  pastLabHistory,
  onDone,
  onCancel,
}: {
  prescription: PatientPrescriptionRow;
  visitId: string;
  visitDateNaive: string | null;
  doctorName: string | null;
  pastMedicines: PastMedicines;
  pastLabHistory: ComponentProps<typeof RxBuilder>["pastLabHistory"];
  onDone: () => void;
  onCancel: () => void;
}) {
  const ctx = usePrescriptionDraft();
  const [isSaving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const draft = ctx?.visitId === visitId ? ctx.draft : null;

  const handleSave = () => {
    if (!draft) return;
    startSave(async () => {
      setError(null);
      const result = await savePrescriptionAction(
        null,
        prescriptionFormData(visitId, draft),
      );
      if (!result.ok) {
        setError(result.message);
        toast.error(result.message);
        return;
      }
      ctx?.clearApplied();
      toast.success("Prescription updated successfully");
      onDone();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit prescription</DialogTitle>
        <DialogDescription>
          Changes are saved against the original visit and stamped with your
          name.
        </DialogDescription>
      </DialogHeader>
      <div className="scrollbar-thin -mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
        <RxBuilder
          visitId={visitId}
          prescription={prescription}
          pastMedicines={pastMedicines}
          pastLabHistory={pastLabHistory}
          visitDate={visitDateNaive}
          doctorName={doctorName}
        />
      </div>
      <DialogFooter className="items-center">
        {error && (
          <span
            role="alert"
            className="mr-auto text-[12px] text-status-destructive"
          >
            {error}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={!draft || isSaving}
          className="gap-1.5 bg-brand-cta font-semibold text-white hover:bg-brand-forest"
        >
          {isSaving && (
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          )}
          {isSaving ? "Saving…" : "Save changes"}
        </Button>
      </DialogFooter>
    </>
  );
}
