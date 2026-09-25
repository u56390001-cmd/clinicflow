"use client";

import type { Prescription, MedicineEntry, LabOrder, Patient, Doctor, Vitals } from "@/types/database";

/**
 * Print-optimized prescription preview. Hidden on screen, shown via
 * window.print() with @media print CSS.
 */
export function PrescriptionPreview({
  prescription,
  patient,
  doctor,
  clinicName,
  clinicAddress,
  clinicPhone,
  visitDate,
  vitals,
}: {
  prescription: Prescription;
  patient: Patient;
  doctor: Doctor | null;
  clinicName: string;
  clinicAddress: string | null;
  clinicPhone: string | null;
  visitDate: string;
  vitals: Vitals | null;
}) {
  return (
    <div className="print-preview hidden" id="prescription-print-area">
      <style>{`
        @media print {
          .print-preview { display: block !important; }
          body * { visibility: hidden; }
          .print-preview, .print-preview * { visibility: visible; }
          .print-preview {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 40px;
            background: white;
          }
        }
      `}</style>

      {/* Clinic Header */}
      <div className="mb-6 border-b-2 border-text-primary pb-4 text-center">
        <h1 className="text-xl font-bold text-text-primary">{clinicName}</h1>
        {clinicAddress && (
          <p className="text-xs text-text-secondary">{clinicAddress}</p>
        )}
        {clinicPhone && (
          <p className="text-xs text-text-secondary">Phone: {clinicPhone}</p>
        )}
        <h2 className="mt-2 text-lg font-semibold text-primary">PRESCRIPTION</h2>
      </div>

      {/* Patient Info */}
      <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Patient</span>
          <p className="font-medium text-text-primary">{patient.name}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Date</span>
          <p className="font-medium text-text-primary">{visitDate}</p>
        </div>
        {patient.phone && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Phone</span>
            <p className="font-medium text-text-primary">{patient.phone}</p>
          </div>
        )}
        {doctor && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Doctor</span>
            <p className="font-medium text-text-primary">
              Dr. {doctor.name}
              {doctor.specialty ? ` — ${doctor.specialty}` : ""}
            </p>
          </div>
        )}
      </div>

      {/* Vitals */}
      {vitals && (
        <div className="mb-4 rounded border border-text-muted/30 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Vitals
          </h3>
          <div className="grid grid-cols-5 gap-2 text-xs">
            {vitals.blood_pressure && (
              <div><span className="text-text-muted">BP:</span> {vitals.blood_pressure}</div>
            )}
            {vitals.temperature != null && (
              <div><span className="text-text-muted">Temp:</span> {vitals.temperature}°F</div>
            )}
            {vitals.pulse != null && (
              <div><span className="text-text-muted">Pulse:</span> {vitals.pulse} bpm</div>
            )}
            {vitals.weight != null && (
              <div><span className="text-text-muted">Weight:</span> {vitals.weight} kg</div>
            )}
            {vitals.height != null && (
              <div><span className="text-text-muted">Height:</span> {vitals.height} cm</div>
            )}
          </div>
        </div>
      )}

      {/* Chief Complaint */}
      {prescription.chief_complaint && (
        <div className="mb-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Chief Complaint
          </h3>
          <p className="text-sm text-text-primary">{prescription.chief_complaint}</p>
        </div>
      )}

      {/* Findings */}
      {prescription.findings && (
        <div className="mb-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Clinical Findings
          </h3>
          <p className="text-sm text-text-primary">{prescription.findings}</p>
        </div>
      )}

      {/* Diagnosis */}
      {(prescription.diagnosis || prescription.custom_diagnosis) && (
        <div className="mb-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Diagnosis
          </h3>
          <p className="text-sm text-text-primary">
            {prescription.diagnosis}
            {prescription.custom_diagnosis ? ` (${prescription.custom_diagnosis})` : ""}
          </p>
        </div>
      )}

      {/* Medicines */}
      {prescription.medicines.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Medicines
          </h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-text-muted/30 text-left text-[10px] font-bold uppercase tracking-wider text-text-muted">
                <th className="pb-1 pr-2">#</th>
                <th className="pb-1 pr-2">Medicine</th>
                <th className="pb-1 pr-2">Route / Form</th>
                <th className="pb-1 pr-2">Frequency</th>
                <th className="pb-1 pr-2">Duration</th>
                <th className="pb-1">Instructions</th>
              </tr>
            </thead>
            <tbody>
              {prescription.medicines.map((med: MedicineEntry, i: number) => (
                <tr key={i} className="border-b border-text-muted/10">
                  <td className="py-1.5 pr-2 text-text-muted">{i + 1}</td>
                  <td className="py-1.5 pr-2 font-medium">{med.name}</td>
                  <td className="py-1.5 pr-2">
                    {[med.route, med.form].filter(Boolean).join(" / ")}
                  </td>
                  <td className="py-1.5 pr-2">{med.frequency}</td>
                  <td className="py-1.5 pr-2">{med.duration}</td>
                  <td className="py-1.5">{med.instructions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Lab Orders */}
      {prescription.lab_orders.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Lab Tests Ordered
          </h3>
          <ul className="list-inside list-disc text-sm text-text-primary">
            {prescription.lab_orders.map((order: LabOrder, i: number) => (
              <li key={i}>
                {order.test_name}
                {order.notes ? ` — ${order.notes}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Follow-up */}
      {(prescription.follow_up_date || prescription.follow_up_notes) && (
        <div className="mb-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Follow-Up
          </h3>
          <p className="text-sm text-text-primary">
            {prescription.follow_up_date && `Date: ${prescription.follow_up_date}`}
            {prescription.follow_up_date && prescription.follow_up_notes && " — "}
            {prescription.follow_up_notes}
          </p>
        </div>
      )}

      {/* Doctor Notes */}
      {prescription.doctor_notes && (
        <div className="mb-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Doctor Notes
          </h3>
          <p className="text-sm text-text-primary">{prescription.doctor_notes}</p>
        </div>
      )}

      {/* Signature */}
      <div className="mt-12 flex justify-end">
        <div className="text-center">
          {doctor?.signature_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={doctor.signature_url}
              alt={`Signature of Dr. ${doctor.name}`}
              className="mx-auto mb-1 h-12 object-contain"
            />
          )}
          <div className="mb-1 h-px w-40 bg-text-primary" />
          <p className="text-sm font-medium text-text-primary">
            {doctor ? `Dr. ${doctor.name}` : "Doctor"}
          </p>
          {doctor?.specialty && (
            <p className="text-xs text-text-secondary">{doctor.specialty}</p>
          )}
          {doctor?.credentials && doctor.credentials.length > 0 && (
            <p className="text-xs text-text-secondary">
              {doctor.credentials.join(", ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
