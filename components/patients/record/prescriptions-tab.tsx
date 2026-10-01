"use client";

import { useMemo } from "react";
import { CalendarClock, CalendarDays, Pill, ScanLine } from "lucide-react";

import { MedicationReviewActions } from "@/components/patients/record/medication-review-actions";
import { PrescriptionWorkspace } from "@/components/patients/record/prescription-workspace";
import {
  RecordEmpty,
  RecordNote,
  RecordSection,
} from "@/components/patients/record/record-primitives";
import type { ActiveVisitInfo } from "@/components/patients/record/record-banner";
import type { PastLabHistoryEntry } from "@/components/patients/record/past-lab-history-modal";
import { Badge } from "@/components/ui/badge";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import { cn } from "@/lib/utils";
import { formatNaiveDate, formatShortDate } from "@/lib/utils/datetime";
import type { PatientDirectoryParams } from "@/lib/patient-directory";
import type { PatientPrescriptionRow } from "@/lib/patient-record";
import type { PatientDocumentView } from "@/lib/patient-documents-queries";
import type {
  MedicineEntry,
  PatientDirectoryRow,
  PatientLabResult,
  PatientMedication,
  Prescription,
  Vitals,
} from "@/types/database";
import type { ConsultationPreAnswer } from "@/lib/consultation-queries";

/** The visit's assigned doctor — drives templates and the vitals field set. */
type VisitDoctor = {
  id: string | null;
  name: string | null;
  specialty: string | null;
};

/**
 * Every medicine this patient has been prescribed here, newest first, one row
 * per name.
 *
 * The builder offers these for one-click reuse because the second visit of a
 * chronic problem is overwhelmingly the same handful of drugs — retyping them
 * is the slowest part of writing a prescription, and the most error-prone.
 * Dedupe keeps the most recent dosing, since that is the one still in effect.
 *
 * The whole earlier prescription travels with each row — the date it was written
 * on, the dose, the route, the course length and the doctor who wrote it — so
 * the doctor can see *what was actually prescribed last time* instead of a bare
 * drug name. Re-adding a name whose dosing has since changed is how a patient
 * ends up on two strengths of the same tablet, and the date is what tells them
 * whether the row above is the old course or a fresh one.
 */
/**
 * The last few past visits, for the rail's history accordion.
 *
 * The current visit is excluded — its prescription is the one being written in
 * the workspace next to it, so listing it as history would be the doctor reading
 * their own typing back at them. Only visits that actually carry clinical
 * writing are kept: a visit with no complaint and no diagnosis teaches nothing
 * in a three-line strip.
 */
function collectRecentVisits(
  prescriptions: PatientPrescriptionRow[],
  activeVisitId: string | null,
) {
  return prescriptions
    .filter(
      (row) =>
        row.visit_id !== activeVisitId &&
        Boolean(
          (row.chief_complaint ?? "").trim() || (row.diagnosis ?? "").trim(),
        ),
    )
    .slice(0, 3)
    .map((row) => ({
      id: row.id,
      visitDate: row.visitDate,
      doctorName: row.doctorName,
      chiefComplaint: row.chief_complaint ?? "",
      diagnosis: row.diagnosis ?? "",
    }));
}

/**
 * Lab tests ordered on earlier visits, newest first, one entry per visit.
 *
 * Deliberately per-visit rather than deduplicated per test: "Order Again" is
 * most often used to repeat what the *last* visit did — a HbA1c and a lipid
 * profile re-run together after three months — and a flattened "all tests ever
 * ordered" list would hand that back as six unrelated chips. The active visit
 * is excluded, since the doctor is writing that one right now.
 */
function collectPastLabHistory(
  prescriptions: PatientPrescriptionRow[],
  activeVisitId: string | null,
): PastLabHistoryEntry[] {
  return prescriptions
    .filter((row) => row.visit_id !== activeVisitId)
    .map((row) => ({
      lastUsed: row.visitDate ?? row.created_at ?? "",
      visitDate: row.visitDate,
      doctorName: row.doctorName,
      // A row can carry a null-ish lab_orders from before the column was
      // defaulted; the guard keeps the modal's types honest.
      orders: Array.isArray(row.lab_orders) ? row.lab_orders : [],
    }))
    .filter((entry) => entry.orders.length > 0)
    .sort((a, b) => b.lastUsed.localeCompare(a.lastUsed));
}

function collectPastMedicines(prescriptions: PatientPrescriptionRow[]) {
  const byName = new Map<
    string,
    {
      medicine: MedicineEntry;
      lastUsed: string;
      prescribedOn: string | null;
      doctorName: string | null;
    }
  >();
  for (const prescription of prescriptions) {
    // The visit date is what the doctor wrote on the script; `created_at` is
    // only a fallback for rows that predate the column.
    const lastUsed = prescription.visitDate ?? prescription.created_at ?? "";
    for (const medicine of prescription.medicines) {
      const name = medicine.name?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const seen = byName.get(key);
      if (!seen || lastUsed > seen.lastUsed) {
        byName.set(key, {
          medicine,
          lastUsed,
          prescribedOn: prescription.visitDate,
          doctorName: prescription.doctorName,
        });
      }
    }
  }
  return [...byName.values()].sort((a, b) =>
    b.lastUsed.localeCompare(a.lastUsed),
  );
}

/**
 * Prescriptions — the record's writing surface plus everything already written.
 *
 * When the patient is checked in today the workspace is the tab: the doctor's
 * own vitals and the saved prescription for the live visit, ready to edit. That
 * replaced a full-screen Write Prescription overlay, so "Write Prescription" in
 * the header now just switches to this tab.
 *
 * With no live visit the tab is the history it has always been, and the
 * medicines AI pulled out of scanned documents lead it — they sit outside the
 * visit chart but are exactly what a doctor checks before prescribing.
 */
export function PrescriptionsTab({
  clinicId,
  clinic,
  patient,
  prescriptions,
  medications,
  documents,
  labResults,
  timezone,
  canManage,
  params,
  activeVisit,
  visitVitals,
  visitPrescription,
  visitDoctor,
  preAnswers,
}: {
  /** The signed-in clinic — templates and the print header for the workspace. */
  clinicId: string;
  clinic: { name: string; address: string | null; phone: string | null };
  patient: PatientDirectoryRow;
  prescriptions: PatientPrescriptionRow[];
  medications?: PatientMedication[];
  /** Reports on file — the workspace rail's "Previous Labs & Reports". */
  documents?: PatientDocumentView[];
  /**
   * Lab values extracted from scanned reports (0053) for the workspace rail's
   * "Scanned Lab Results" list. Optional so the tab keeps working for callers
   * that have not wired the query yet.
   */
  labResults?: PatientLabResult[];
  timezone: string;
  canManage?: boolean;
  params: PatientDirectoryParams;
  /** Today's live visit, when the patient is checked in. */
  activeVisit: ActiveVisitInfo | null;
  visitVitals: Vitals | null;
  visitPrescription: Prescription | null;
  visitDoctor: VisitDoctor | null;
  preAnswers: ConsultationPreAnswer[];
}) {
  const scanned = (medications ?? []).filter(
    (medication) => medication.source === "ai_ocr",
  );
  const scannedPending = scanned.filter(
    (medication) => medication.status === "active_pending",
  );
  const pastMedicines = useMemo(
    () => collectPastMedicines(prescriptions),
    [prescriptions],
  );
  const recentVisits = useMemo(
    () => collectRecentVisits(prescriptions, activeVisit?.id ?? null),
    [prescriptions, activeVisit?.id],
  );
  const pastLabHistory = useMemo(
    () => collectPastLabHistory(prescriptions, activeVisit?.id ?? null),
    [prescriptions, activeVisit?.id],
  );

  const hasWorkspace = activeVisit !== null;
  const hasHistory = prescriptions.length > 0 || scanned.length > 0;

  if (!hasWorkspace && !hasHistory) {
    return (
      <RecordEmpty
        icon={Pill}
        title="No prescriptions yet"
        description="Prescriptions written during a consultation are collected here, so the full medication history is one place."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {activeVisit && (
        <PrescriptionWorkspace
          clinicId={clinicId}
          clinic={clinic}
          patient={patient}
          visit={activeVisit}
          visitVitals={visitVitals}
          visitPrescription={visitPrescription}
          doctor={visitDoctor}
          documents={documents ?? []}
          labResults={labResults ?? []}
          scannedMedicines={scanned}
          pastMedicines={pastMedicines}
          pastLabHistory={pastLabHistory}
          recentVisits={recentVisits}
          preAnswers={preAnswers}
          timezone={timezone}
          canManage={canManage ?? false}
          params={params}
        />
      )}

      {!hasHistory ? null : (
        <div className="flex flex-col gap-3">
          {/* With a live visit the OCR list lives in the workspace rail, where a
              tick imports it straight into the prescription. This copy is the
              no-visit case, where there is no rail to put it in. */}
          {scanned.length > 0 && !activeVisit && (
            <RecordSection
              title="Medicines scanned from documents"
              meta={
                scannedPending.length > 0 ? (
                  <Badge variant="warning">
                    {scannedPending.length} pending review
                  </Badge>
                ) : null
              }
            >
              <ul className="flex flex-col gap-2">
                {scanned.map((medication) => {
                  const pending = medication.status === "active_pending";
                  const dose = [medication.strength, medication.frequency]
                    .filter(Boolean)
                    .join(" • ");
                  const details = [dose, medication.duration]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li
                      key={medication.id}
                      className={cn(
                        "flex items-start justify-between gap-3 rounded-control border px-3 py-2.5",
                        pending
                          ? "border-primary/30 bg-primary-tint"
                          : "border-hairline bg-app",
                      )}
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-ink flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                          {medication.medicine_name}
                          <Badge variant="warning">AI OCR</Badge>
                        </span>
                        {details && (
                          <span className="text-xs font-medium text-text-secondary">
                            {details}
                          </span>
                        )}
                        {medication.instructions && (
                          <span className="text-xs text-text-secondary">
                            {medication.instructions}
                          </span>
                        )}
                        {(medication.report_date || medication.report_name) && (
                          <span className="flex items-center gap-1 text-[11px] text-text-muted">
                            {formatShortDate(medication.report_date) && (
                              <>
                                <CalendarDays
                                  aria-hidden="true"
                                  className="size-3 shrink-0"
                                  strokeWidth={2.25}
                                />
                                {formatShortDate(medication.report_date)}
                              </>
                            )}
                            {medication.report_name && (
                              <> · {medication.report_name}</>
                            )}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {pending ? (
                          canManage ? (
                            <MedicationReviewActions
                              medicationId={medication.id}
                            />
                          ) : (
                            <Badge variant="warning">Pending review</Badge>
                          )
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {scannedPending.length > 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] leading-relaxed text-text-secondary">
                  <ScanLine
                    aria-hidden="true"
                    className="size-3.5 text-primary"
                  />
                  {scannedPending.length === 1
                    ? "1 medicine"
                    : `${scannedPending.length} medicines`}{" "}
                  came from scanned documents and needs verification before
                  joining the active list.
                </p>
              )}
            </RecordSection>
          )}

          {prescriptions.map((prescription) => {
            const issued = prescription.visitDate ?? prescription.created_at;
            const diagnosis =
              prescription.custom_diagnosis?.trim() ||
              prescription.diagnosis?.trim() ||
              "";

            return (
              <RecordSection
                key={prescription.id}
                title={
                  formatNaiveDate(utcIsoToClinicLocalInput(issued, timezone)) ||
                  "Undated"
                }
                meta={
                  <span className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                    {prescription.tokenNumber !== null && (
                      <span className="font-mono text-text-muted">
                        #{prescription.tokenNumber}
                      </span>
                    )}
                    {prescription.doctorName && (
                      <span>Dr. {prescription.doctorName}</span>
                    )}
                    {prescription.medicines.length > 0 && (
                      <Badge variant="outline">
                        {prescription.medicines.length}{" "}
                        {prescription.medicines.length === 1
                          ? "medicine"
                          : "medicines"}
                      </Badge>
                    )}
                  </span>
                }
              >
                <div className="flex flex-col gap-3">
                  {diagnosis && (
                    <RecordNote label="Diagnosis" value={diagnosis} />
                  )}
                  <RecordNote
                    label="Chief complaint"
                    value={prescription.chief_complaint}
                  />

                  {prescription.medicines.length > 0 ? (
                    <div className="overflow-x-auto rounded-control border border-text-muted/20">
                      <table className="w-full min-w-[520px] text-sm">
                        <thead>
                          <tr className="border-b border-text-muted/20 bg-app text-left">
                            {[
                              "Medicine",
                              "Dose",
                              "Frequency",
                              "Duration",
                              "Instructions",
                            ].map((heading) => (
                              <th
                                key={heading}
                                scope="col"
                                className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted"
                              >
                                {heading}
                              </th>
                            ))}
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

                  <RecordNote label="Findings" value={prescription.findings} />
                  <RecordNote
                    label="Doctor notes"
                    value={prescription.doctor_notes}
                  />

                  {prescription.follow_up_date && (
                    <p className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
                      <CalendarClock aria-hidden="true" className="size-3.5" />
                      Follow-up {formatNaiveDate(prescription.follow_up_date)}
                      {prescription.follow_up_notes
                        ? ` · ${prescription.follow_up_notes}`
                        : ""}
                    </p>
                  )}
                </div>
              </RecordSection>
            );
          })}
        </div>
      )}
    </div>
  );
}
