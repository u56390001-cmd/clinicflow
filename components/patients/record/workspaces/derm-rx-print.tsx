"use client";

import { useEffect } from "react";

import { clinicLogoPublicUrl } from "@/lib/clinic-logo-url";
import type { DermPrescription } from "@/types/database";

/**
 * 🖨 Dermatology prescription print sheet (single page, clinic letterhead).
 * Two variants:
 *  - "print" (default): mount-then-print, same pattern as the care-plan print
 *    surface — hidden inline, the `<style>` block hides everything else when
 *    `window.print()` fires.
 *  - "preview": visible inline inside the preview dialog; printing is driven
 *    externally by stamping out a "print" variant after the dialog closes.
 */
export type DermRxLetterhead = {
  name: string;
  phone: string | null;
  address: string | null;
  logoPath: string | null;
};

export type DermRxPrintToday = {
  diagnosis: string | null;
  icdCode: string | null;
  procedures: { name: string; bottleId: string | null }[];
};

export function DermRxPrint({
  rx,
  patient,
  letterhead,
  clinician,
  today,
  variant = "print",
}: {
  rx: DermPrescription;
  patient: {
    name: string;
    patient_code: string | null;
    date_of_birth: string | null;
    gender: string | null;
  };
  letterhead: DermRxLetterhead | null;
  clinician: string;
  today: DermRxPrintToday;
  variant?: "print" | "preview";
}) {
  useEffect(() => {
    if (variant !== "print") return;
    const timer = window.setTimeout(() => {
      window.print();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [variant]);

  const logoUrl = clinicLogoPublicUrl(letterhead?.logoPath ?? null);
  const age = patient.date_of_birth
    ? (() => {
        const born = new Date(patient.date_of_birth);
        if (Number.isNaN(born.getTime())) return null;
        const now = new Date();
        let years = now.getFullYear() - born.getFullYear();
        const beforeBirthday =
          now.getMonth() < born.getMonth() ||
          (now.getMonth() === born.getMonth() &&
            now.getDate() < born.getDate());
        if (beforeBirthday) years -= 1;
        return years >= 0 && years < 130 ? `${years} yrs` : null;
      })()
    : null;
  const gender = patient.gender
    ? (patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1))
    : null;
  const medicines = rx.medicines.filter((m) => m.name.trim());
  const labs = rx.lab_orders.filter((l) => l.test_name.trim());
  const hasRoutine = Boolean(
    rx.skincare_routine_am?.trim() || rx.skincare_routine_pm?.trim(),
  );

  return (
    <div
      className={
        variant === "print"
          ? "derm-rx-print-area hidden"
          : "derm-rx-print-area rounded-card border border-hairline bg-white p-8 shadow-sm"
      }
    >
      <style>{`
        @media print {
          .derm-rx-print-area { display: block !important; }
          body * { visibility: hidden; }
          .derm-rx-print-area, .derm-rx-print-area * { visibility: visible; }
          .derm-rx-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 36px 40px;
            background: white;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>

      {/* Clinic letterhead */}
      <div className="mb-5 border-b-2 border-text-primary pb-4">
        <div className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {logoUrl && (
              <img
                src={logoUrl}
                alt=""
                className="h-14 w-14 border border-hairline object-contain"
              />
            )}
            <div className="min-w-0">
              <h1 className="truncate text-base font-extrabold uppercase tracking-widest text-text-primary">
                {letterhead?.name ?? "Clinic"}
              </h1>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
                {letterhead?.phone ? `${letterhead.phone}` : ""}
                {letterhead?.phone && letterhead?.address ? " · " : ""}
                {letterhead?.address ?? ""}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-text-muted">Prescribed by</p>
            <p className="text-sm font-semibold text-text-primary">
              {clinician || "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Title */}
      <p className="mb-4 text-lg font-bold text-text-primary">
        Dermatology Prescription
      </p>

      {/* Patient demographics */}
      <div className="mb-4 grid grid-cols-4 gap-3 text-[12px]">
        <span><strong>Patient:</strong> {patient.name}</span>
        <span><strong>Age/Gender:</strong> {age ?? "—"} / {gender ?? "—"}</span>
        <span><strong>UHID:</strong> {patient.patient_code ?? "—"}</span>
        <span><strong>Date:</strong> {rx.created_at.slice(0, 10)}</span>
      </div>

      {/* Diagnosis & procedures pulled from today's encounter */}
      {(today.diagnosis || today.procedures.length > 0) && (
        <div className="mb-4 rounded border border-hairline bg-app p-3 text-[12px]">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Diagnosis &amp; procedures
          </p>
          <p className="leading-relaxed text-text-primary">
            {today.diagnosis
              ? `${today.diagnosis}${today.icdCode ? ` (ICD-10: ${today.icdCode})` : ""}`
              : ""}
            {today.diagnosis && today.procedures.length > 0 ? " · " : ""}
            {today.procedures
              .map(
                (p) =>
                  `${p.name}${p.bottleId ? ` (Bottle ${p.bottleId})` : ""}`,
              )
              .join("; ")}
          </p>
        </div>
      )}

      {/* Structured Rx table */}
      <div className="mb-4">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
          Rx ({medicines.length})
        </p>
        {medicines.length === 0 ? (
          <p className="border-b border-hairline/60 py-1.5 text-[12px] text-text-secondary">
            No medicines on this prescription.
          </p>
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-hairline text-left text-[10px] uppercase tracking-wider text-text-muted">
                <th className="py-1.5 pr-3 font-bold">#</th>
                <th className="py-1.5 pr-3 font-bold">Medicine</th>
                <th className="py-1.5 pr-3 font-bold">Route / Form</th>
                <th className="py-1.5 pr-3 font-bold">Frequency</th>
                <th className="py-1.5 pr-3 font-bold">Duration</th>
                <th className="py-1.5 pr-3 font-bold">Amount</th>
                <th className="py-1.5 font-bold">Instructions</th>
              </tr>
            </thead>
            <tbody>
              {medicines.map((medicine, index) => (
                <tr
                  key={index}
                  className="border-b border-hairline/60 align-top"
                >
                  <td className="py-1.5 pr-3 font-mono text-text-muted">
                    {index + 1}
                  </td>
                  <td className="py-1.5 pr-3 font-semibold leading-snug">
                    {medicine.name}
                  </td>
                  <td className="py-1.5 pr-3 leading-snug">
                    {[medicine.route, medicine.form]
                      .filter(Boolean)
                      .join(" / ") || "—"}
                  </td>
                  <td className="py-1.5 pr-3">{medicine.frequency || "—"}</td>
                  <td className="py-1.5 pr-3">{medicine.duration || "—"}</td>
                  <td className="py-1.5 pr-3">{medicine.unit || "—"}</td>
                  <td className="py-1.5">{medicine.instructions || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Advised investigations */}
      {labs.length > 0 && (
        <div className="mb-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Advised investigations ({labs.length})
          </p>
          <ul className="text-[12px] leading-relaxed">
            {labs.map((order, index) => (
              <li
                key={index}
                className="border-b border-hairline/60 py-1.5"
              >
                • {order.test_name}
                {order.notes ? ` — ${order.notes}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Application instructions + skincare routine */}
      {(rx.application_instructions?.trim() || hasRoutine) && (
        <div className="mb-4 grid grid-cols-2 gap-6 text-[12px]">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Application instructions {rx.topical_form ? `(${rx.topical_form})` : ""}
            </p>
            <p className="whitespace-pre-wrap leading-relaxed text-text-primary">
              {rx.application_instructions?.trim() || "—"}
            </p>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Patient skincare routine
            </p>
            <p className="whitespace-pre-wrap leading-relaxed text-text-primary">
              {rx.skincare_routine_am?.trim()
                ? `AM: ${rx.skincare_routine_am}\n`
                : ""}
              {rx.skincare_routine_pm?.trim() ? `PM: ${rx.skincare_routine_pm}` : ""}
              {!hasRoutine ? "—" : ""}
            </p>
          </div>
        </div>
      )}

      {/* Patient education */}
      {rx.patient_education?.trim() && (
        <div className="mb-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Patient advice
          </p>
          <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-text-primary">
            {rx.patient_education}
          </p>
        </div>
      )}

      {/* Signature footer */}
      <div className="mt-10 border-t border-hairline pt-5">
        <div className="flex items-end justify-between gap-8">
          <div className="text-center">
            <div className="mb-2 h-px w-56 bg-text-primary" />
            <p className="text-sm font-semibold text-text-primary">
              {clinician || "Clinician"}
            </p>
            <p className="text-[11px] text-text-secondary">
              Dermatologist signature
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-text-secondary">
              This prescription is medication advice only — take exactly as
              directed and report adverse reactions promptly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
