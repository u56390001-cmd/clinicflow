"use client";

/**
 * Derma Rx print sheet — the SAME render pipeline as the editor preview and
 * share text: everything comes from `buildRxViewModel` (render/view-model.ts)
 * so no component re-writes the prescription. Language switch is a prop:
 * English / Roman Urdu / Urdu (RTL). `plainHeader` collapses the big
 * letterhead into a single text line (letterhead-free look).
 */

import { useEffect } from "react";
import QRCode from "react-qr-code";

import { clinicLogoPublicUrl } from "@/lib/clinic-logo-url";
import type { DermPrescription } from "@/types/database";

import { readRxItems } from "../schema/rx-item";
import type { RxLocale } from "../render/i18n";
import { buildRxViewModel, type RxDocument } from "../render/view-model";
import type {
  DermRxLetterhead,
  DermRxPrintToday,
} from "../../derm-rx-print";

export type DermRxPrintSheetProps = {
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
  locale: RxLocale;
  /** Letterhead-free compact header. */
  plainHeader?: boolean;
  /** Approved version stamp (migration 0124). */
  status?: string | null;
  version?: number | null;
  variant?: "print" | "preview";
};

function patientAge(patient: DermRxPrintSheetProps["patient"]): string | null {
  if (!patient.date_of_birth) return null;
  const born = new Date(patient.date_of_birth);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const beforeBirthday =
    now.getMonth() < born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
  if (beforeBirthday) years -= 1;
  return years >= 0 && years < 130 ? `${years} yrs` : null;
}

export function rxDocumentFromRow(
  rx: DermRxPrintSheetProps["rx"],
  patient: DermRxPrintSheetProps["patient"],
  clinician: string,
  today: DermRxPrintToday,
  locale: RxLocale,
): RxDocument {
  const items = readRxItems(rx.medicines);
  return buildRxViewModel({
    locale,
    items,
    rxId: rx.id,
    issuedOn: (rx.updated_at ?? rx.created_at).slice(0, 10),
    patient: {
      name: patient.name,
      code: patient.patient_code,
      gender: patient.gender,
      age: patientAge(patient),
    },
    clinician,
    diagnosis: today.diagnosis,
    icdCode: today.icdCode,
    procedures: today.procedures.map(
      (p) => `${p.name}${p.pin ? ` (Pin #${p.pin})` : ""}`,
    ),
    meta: {
      application: rx.application_instructions ?? "",
      education: rx.patient_education ?? "",
      skincareAm: (rx.skincare_routine_am ?? "").split("\n").filter(Boolean),
      skincarePm: (rx.skincare_routine_pm ?? "").split("\n").filter(Boolean),
    },
    labs: (rx.lab_orders ?? [])
      .filter((l) => l.test_name.trim())
      .map((l) => ({ test_name: l.test_name, notes: l.notes ?? "" })),
    followUp: rx.follow_up ?? null,
  });
}

export function DermRxPrintSheet({
  rx,
  patient,
  letterhead,
  clinician,
  today,
  locale,
  plainHeader = false,
  status,
  version,
  variant = "print",
}: DermRxPrintSheetProps) {
  useEffect(() => {
    if (variant !== "print") return;
    const timer = window.setTimeout(() => {
      window.print();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [variant]);

  const logoUrl = plainHeader
    ? null
    : clinicLogoPublicUrl(letterhead?.logoPath ?? null);
  const gender = patient.gender
    ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)
    : null;
  const rxDoc = rxDocumentFromRow(rx, patient, clinician, today, locale);
  const isFinal = status === "final";
  const qrPayload = [
    "DERM-RX",
    patient.patient_code ?? "no-uhid",
    rxDoc.issuedOn,
    `v${version ?? 1}`,
    clinician,
  ].join("|");

  return (
    <div
      dir={rxDoc.direction}
      className={
        variant === "print"
          ? "derm-rx-print-area hidden"
          : "derm-rx-print-area rounded-xl border border-hairline bg-white p-8"
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

      {/* Header — letterhead or collapsed plain line */}
      {plainHeader ? (
        <div className="mb-4 border-b border-hairline pb-2">
          <p className="flex items-baseline justify-between text-xs font-medium text-text-secondary">
            <span className="font-bold uppercase tracking-widest text-text-primary">
              {letterhead?.name ?? "Clinic"}
            </span>
            <span>{[letterhead?.phone, letterhead?.address].filter(Boolean).join(" · ")}</span>
          </p>
        </div>
      ) : (
        <div className="mb-5 border-b-2 border-text-primary pb-4">
          <div className="flex items-start justify-between gap-6">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {logoUrl && (
                /* eslint-disable-next-line @next/next/no-img-element -- print sheet needs the raw logo img (offline print, legacy-identical) */
                <img
                  alt=""
                  src={logoUrl}
                  className="h-14 w-14 border border-hairline object-contain"
                />
              )}
              <div className="min-w-0">
                <h1 className="truncate text-base font-extrabold uppercase tracking-widest text-text-primary">
                  {letterhead?.name ?? "Clinic"}
                </h1>
                <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
                  {[letterhead?.phone, letterhead?.address]
                    .filter(Boolean)
                    .join(" · ")}
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
      )}

      {/* Title + version/approval stamp */}
      <div className="mb-4 flex items-baseline justify-between">
        <p className="text-lg font-bold text-text-primary">
          Dermatology Prescription
        </p>
        {isFinal ? (
          <span className="rounded border border-[#b4cfb2] bg-[#eff7ee] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[#3c6e3a]">
            Approved · v{version ?? 1}
          </span>
        ) : null}
      </div>

      {/* Patient demographics */}
      <div className="mb-4 grid grid-cols-4 gap-3 text-[12px]">
        <span><strong>Patient:</strong> {patient.name}</span>
        <span><strong>Age/Gender:</strong> {rxDoc.patient.age ?? "—"} / {gender ?? "—"}</span>
        <span><strong>UHID:</strong> {patient.patient_code ?? "—"}</span>
        <span><strong>Date:</strong> {rxDoc.issuedOn}</span>
      </div>

      {/* Diagnosis & procedures */}
      {(today.diagnosis || rxDoc.procedures.length > 0) && (
        <div className="mb-4 rounded border border-hairline bg-app p-3 text-[12px]">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Diagnosis &amp; procedures
          </p>
          <p className="leading-relaxed text-text-primary">
            {today.diagnosis
              ? `${today.diagnosis}${today.icdCode ? ` (ICD-10: ${today.icdCode})` : ""}`
              : ""}
            {today.diagnosis && rxDoc.procedures.length > 0 ? " · " : ""}
            {rxDoc.procedures.join("; ")}
          </p>
        </div>
      )}

      {/* Medicines: lines fed exclusively by the view model */}
      <div className="mb-4">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
          Rx ({rxDoc.lines.length})
        </p>
        {rxDoc.lines.length === 0 ? (
          <p className="border-b border-hairline/60 py-1.5 text-[12px] text-text-secondary">
            No medicines on this prescription.
          </p>
        ) : (
          <ol className="text-[12.5px]">
            {rxDoc.lines.map((line) => (
              <li
                key={line.index}
                className="flex items-baseline gap-2 border-b border-hairline/60 py-1.5"
              >
                <span className="w-5 shrink-0 font-mono text-text-muted">
                  {line.index}
                </span>
                <span className="min-w-0 whitespace-nowrap font-semibold text-text-primary">
                  {line.title}
                </span>
                <span className="min-w-0 flex-1 leading-relaxed text-text-secondary">
                  {line.detail}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* View-model sections: routine columns, application/education, labs */}
      {rxDoc.sections.map((section, index) => (
        <div
          key={`${section.kind}-${index}-${section.heading}`}
          className="mb-4"
        >
          {section.columns ? (
            <div className="grid grid-cols-2 gap-6 text-[12px]">
              {section.columns.map((column) => (
                <div key={column.heading}>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    {section.heading} — {column.heading}
                  </p>
                  {column.lines.length === 0 ? (
                    <p className="leading-relaxed text-text-secondary">—</p>
                  ) : (
                    <ul className="leading-relaxed text-text-primary">
                      {column.lines.map((step, i) => (
                        <li key={`${column.heading}-${i}`}>• {step}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                {section.heading}
                {section.kind === "labs" ? ` (${section.lines.length})` : ""}
              </p>
              <ul className="text-[12px] leading-relaxed">
                {section.lines.map((l) => (
                  <li
                    key={`${section.kind}-${l.title}`}
                    className="border-b border-hairline/60 py-1.5 text-text-primary"
                  >
                    {l.title}
                    {l.title && l.detail ? " — " : ""}
                    {l.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}

      {/* Follow-up */}
      {rxDoc.followUp ? (
        <div className="mb-4 text-[12px]">
          <p>
            <strong>Follow-up:</strong> {rxDoc.followUp}
          </p>
        </div>
      ) : null}

      {/* Signature footer + verification QR */}
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
          <div className="flex items-end gap-4">
            <div className="text-right">
              <QRCode
                value={qrPayload}
                size={96}
                title="Prescription verification"
              />
              <p className="mt-1 text-[9px] uppercase tracking-wide text-text-muted">
                {patient.patient_code ?? "—"} · {rxDoc.issuedOn} · v
                {version ?? 1}
              </p>
            </div>
            <div className="max-w-[13rem] text-right">
              <p className="text-[11px] text-text-secondary">
                Medication advice only — take exactly as directed.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Approved Rx footer */}
      {isFinal ? (
        <div className="mt-3 rounded border border-[#b4cfb2] bg-[#eff7ee] px-3 py-2 text-[10px] text-[#3c6e3a]">
          Approved Rx (v{version ?? 1}) — content frozen at approval; any edit
          starts a new version row.
        </div>
      ) : null}
    </div>
  );
}
