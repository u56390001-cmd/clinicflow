"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Patient-identity QR for the printed prescription. Encodes the UHID
 * (`patient_code`) plus ids so a scanner — or the reception search box —
 * resolves a returning patient even when their phone number changed.
 *
 * Generated client-side with the same pattern as `SignatureBarcode` in
 * `components/patient-billing/receipt-preview.tsx`. Error-correction "H"
 * (30% recovery) keeps the code scannable through thermal-print bleed and
 * small smudges. Renders nothing on failure so a QR glitch can never block
 * the prescription itself.
 */
export function PrescriptionQr({
  patientCode,
  patientId,
  clinicId,
}: {
  patientCode: string;
  patientId: string;
  clinicId: string;
}) {
  // Stable payload string; recomputed only when identity changes.
  const value = JSON.stringify({
    patient_code: patientCode,
    patient_id: patientId,
    clinic_id: clinicId,
  });
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      width: 260,
      margin: 2,
      errorCorrectionLevel: "H",
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div className="text-center">
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt={`Patient UHID ${patientCode}`}
          className="mx-auto block h-[88px] w-[88px] object-contain"
        />
      ) : (
        <div className="mx-auto h-[88px] w-[88px] animate-pulse rounded-md bg-text-muted/20" />
      )}
      <div className="mt-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-text-muted">
        UHID {patientCode}
      </div>
    </div>
  );
}
