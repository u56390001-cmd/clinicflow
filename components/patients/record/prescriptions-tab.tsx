import { CalendarClock, Pill } from "lucide-react";

import {
  RecordEmpty,
  RecordNote,
  RecordSection,
} from "@/components/patients/record/record-primitives";
import { Badge } from "@/components/ui/badge";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import { formatNaiveDate } from "@/lib/utils/datetime";
import type { PatientPrescriptionRow } from "@/lib/patient-record";

/**
 * Prescriptions — every prescription written for this patient, newest first, as
 * a flat list independent of the visit accordion.
 *
 * Fully expanded rather than collapsed: a prescription is read, not scanned, and
 * a pharmacist or a doctor checking for interactions needs all of the medicines
 * visible at once.
 */
export function PrescriptionsTab({
  prescriptions,
  timezone,
}: {
  prescriptions: PatientPrescriptionRow[];
  timezone: string;
}) {
  if (prescriptions.length === 0) {
    return (
      <RecordEmpty
        icon={Pill}
        title="No prescriptions yet"
        description="Prescriptions written during a consultation are collected here, so the full medication history is one place."
      />
    );
  }

  return (
    <div className="space-y-3">
      {prescriptions.map((prescription) => {
        const issued =
          prescription.visitDate ?? prescription.created_at;
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
            <div className="space-y-3">
              {diagnosis && <RecordNote label="Diagnosis" value={diagnosis} />}
              <RecordNote
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
                  <ul className="mt-1 space-y-1">
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
              <RecordNote label="Doctor notes" value={prescription.doctor_notes} />

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
  );
}
