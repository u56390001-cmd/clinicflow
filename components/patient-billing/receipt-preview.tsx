"use client";

import { useEffect, useState } from "react";
import { format as formatInTimeZone } from "date-fns-tz";
import { Printer, X } from "lucide-react";
import QRCode from "qrcode";

import { Button } from "@/components/ui/button";
import { PATIENT_PAYMENT_METHOD_META } from "@/lib/constants";
import type { PatientBillListRow } from "@/lib/patient-billing-queries";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import { formatCurrency } from "@/lib/utils/currency";
import { parseDateSafe } from "@/lib/utils/datetime";
import type {
  PatientPayment,
  PatientPaymentMethod,
  Receipt as ReceiptRow,
} from "@/types/database";

/**
 * Override for a receipt that has just been issued client-side, before the
 * bills list refreshes and picks up the new `receipts` row. The collect
 * flow knows the receipt number, the amount taken and the rail that took it;
 * this lets the popup render those facts immediately rather than flashing a
 * blank receipt for the round-trip.
 */
export interface ReceiptOverride {
  receiptNumber: number | null;
  paidAmount: number;
  paymentMethod: PatientPaymentMethod;
}

interface ReceiptPreviewProps {
  bill: PatientBillListRow;
  /** Clinic name shown in the receipt header and footer brand. */
  clinicName: string;
  clinicAddress?: string | null;
  clinicPhone?: string | null;
  /** Clinic IANA timezone — the paid-on stamp renders on the clinic's clock. */
  timezone: string;
  /** Data for a just-collected payment that the list has not re-fetched yet. */
  override?: ReceiptOverride | null;
  onClose: () => void;
}

/** "23 Sept 2026" — naive clinic-local values, anchored at UTC. */
function fmtDate(value: string): string {
  const date = parseDateSafe(value);
  return date ? formatInTimeZone(date, "d MMM yyyy", { timeZone: "UTC" }) : "";
}

/** "04:32 am" — naive clinic-local values, anchored at UTC. */
function fmtTime(value: string): string {
  const date = parseDateSafe(value);
  return date ? formatInTimeZone(date, "h:mm a", { timeZone: "UTC" }) : "";
}

function receiptLabel(receiptNumber: number | null): string {
  return receiptNumber != null
    ? `RCP-${String(receiptNumber).padStart(3, "0")}`
    : "—";
}

/** Everything both receipt formats need — derived once in the parent. */
interface ReceiptData {
  clinicName: string;
  clinicAddress?: string | null;
  clinicPhone?: string | null;
  billNumber: string | null;
  receiptNumber: number | null;
  headerDate: string;
  patientName: string | null | undefined;
  patientPhone: string | null | undefined;
  doctorName: string | null | undefined;
  doctorQualification: string | null | undefined;
  signatureUrl: string | null | undefined;
  items: PatientBillListRow["patient_bill_items"];
  currency: string;
  subtotal: number;
  discount: number;
  total: number;
  paidAmount: number;
  fullyPaid: boolean;
  paymentMethodLabel: string;
  paidOnDate: string;
  paidOnTime: string;
}

/**
 * The standard printable receipt — the Doxmate-style layout on the app's teal
 * design system: teal top/bottom stripe, clinic header with Bill / Receipt
 * numbers, patient / physician info grid, an itemised table with a teal header,
 * subtotal + discount + teal total bar, payment summary and payment
 * information blocks, and a thank-you footer with the doctor's signature.
 */
function StandardDoc({
  blackWhite,
  printable,
  ...data
}: ReceiptData & { blackWhite: boolean; printable?: boolean }) {
  const signatureUrl = data.signatureUrl;
  return (
    <div
      className={`bg-white ${printable ? "w-full" : "mx-auto max-w-[480px] shadow-[0_2px_20px_rgba(15,23,42,0.09)]"}`}
      style={{ filter: blackWhite ? "grayscale(1)" : "none" }}
    >
      {/* Top stripe */}
      <div className="h-[5px] bg-primary" />

      <div className="px-6 py-5">
        {/* Header — clinic on the left, Bill/Receipt numbers on the right */}
        <div className="mb-3.5 flex items-start justify-between gap-4 border-b-[1.5px] border-primary pb-3.5">
          <div>
            <div className="mb-1 text-sm font-bold text-text-primary">
              {data.clinicName}
            </div>
            <div className="text-[10px] leading-[1.7] text-text-secondary">
              {data.clinicAddress && (
                <>
                  {data.clinicAddress}
                  <br />
                </>
              )}
              {data.clinicPhone && <span>{data.clinicPhone}</span>}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-primary">
              Bill No.
            </div>
            <div className="mb-2 text-[10px] font-medium text-text-secondary">
              {data.billNumber ?? "—"}
            </div>
            <div className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-primary">
              Receipt No.
            </div>
            <div className="mb-2 text-[11px] font-bold text-text-primary">
              {receiptLabel(data.receiptNumber)}
            </div>
            <div className="text-[10px] text-text-secondary">
              {data.headerDate}
            </div>
          </div>
        </div>

        {/* Patient / Physician info grid */}
        <div className="mb-3.5 grid grid-cols-2 border border-text-muted/20">
          <div className="border-r border-text-muted/20 px-3 py-2.5">
            <div className="mb-1.5 text-[8px] font-bold uppercase tracking-[0.1em] text-primary">
              Patient
            </div>
            <div className="mb-0.5 text-xs font-bold text-text-primary">
              {data.patientName ?? "—"}
            </div>
            <div className="text-[10px] leading-[1.65] text-text-secondary">
              {data.patientPhone ?? ""}
            </div>
          </div>
          <div className="px-3 py-2.5">
            <div className="mb-1.5 text-[8px] font-bold uppercase tracking-[0.1em] text-primary">
              Physician
            </div>
            <div className="mb-0.5 text-xs font-bold text-text-primary">
              {data.doctorName ?? "—"}
            </div>
            <div className="text-[10px] leading-[1.65] text-text-secondary">
              {data.doctorQualification ?? ""}
            </div>
          </div>
        </div>

        {/* Line items */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-primary">
              <th className="px-3 py-[7px] text-left text-[9px] font-bold uppercase tracking-[0.08em] text-white">
                Description
              </th>
              <th className="px-3 py-[7px] text-right text-[9px] font-bold uppercase tracking-[0.08em] text-white">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id} className="border-b border-text-muted/10">
                <td className="px-3 py-2 align-top text-[11px] text-text-secondary">
                  {item.description}
                  {item.quantity > 1 ? ` ×${item.quantity}` : ""}
                </td>
                <td className="px-3 py-2 text-right align-top text-[11px] font-semibold tabular-nums text-text-primary">
                  {formatCurrency(item.line_total, data.currency)}
                </td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr>
                <td
                  colSpan={2}
                  className="px-3 py-2 text-center text-[11px] text-text-muted"
                >
                  No line items on this bill.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Totals */}
        <div className="border-t-[1.5px] border-text-muted/20 px-3 pt-2.5">
          <div className="flex justify-between py-[3px] text-[10.5px] text-text-secondary">
            <span>Subtotal</span>
            <span className="tabular-nums">
              {formatCurrency(data.subtotal, data.currency)}
            </span>
          </div>
          {data.discount > 0 && (
            <div className="flex justify-between py-[3px] text-[10.5px] font-medium text-status-success">
              <span>Discount</span>
              <span className="tabular-nums">
                -{formatCurrency(data.discount, data.currency)}
              </span>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between bg-primary px-3 py-[5px]">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-white">
              Total
            </span>
            <span className="text-lg font-extrabold tracking-tight tabular-nums text-white">
              {formatCurrency(data.total, data.currency)}
            </span>
          </div>
        </div>

        {/* Payment summary */}
        <div className="mt-2.5 overflow-hidden rounded-[4px] border border-text-muted/20">
          <div className="border-b border-text-muted/20 bg-app px-3 py-[7px] text-[8px] font-bold uppercase tracking-[0.1em] text-primary">
            Payment Summary
          </div>
          <div className="flex flex-col gap-1.5 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-medium text-text-secondary">
                Amount Paid
              </span>
              <span className="text-[10.5px] font-bold tabular-nums text-status-success">
                {formatCurrency(data.paidAmount, data.currency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-medium text-text-secondary">
                Payment Status
              </span>
              <span
                className={`rounded-pill px-2 py-0.5 text-[9.5px] font-bold ${
                  data.fullyPaid
                    ? "bg-status-success/15 text-status-success"
                    : "bg-status-warning/15 text-status-warning"
                }`}
              >
                {data.fullyPaid ? "✓ Fully Paid" : "Partial"}
              </span>
            </div>
          </div>
        </div>

        {/* Payment information */}
        <div className="mt-3 border border-text-muted/20">
          <div className="border-b border-text-muted/20 bg-app px-3 py-[7px] text-[8px] font-bold uppercase tracking-[0.1em] text-primary">
            Payment Information
          </div>
          <div className="grid grid-cols-3 gap-1.5 px-3 py-2.5">
            <div>
              <div className="mb-[3px] text-[8.5px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                Method
              </div>
              <div className="text-[11px] font-bold leading-[1.4] text-text-primary">
                {data.paymentMethodLabel}
              </div>
            </div>
            <div className="col-span-2">
              <div className="mb-[3px] text-[8.5px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                Paid On
              </div>
              <div className="text-[11px] font-bold leading-[1.4] text-text-primary">
                {data.paidOnDate
                  ? `${data.paidOnDate}${data.paidOnTime ? `, ${data.paidOnTime}` : ""}`
                  : "—"}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-text-muted/10 px-3 py-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.06em] text-text-muted">
              Payment Status
            </span>
            <span className="rounded-pill bg-status-success/15 px-2.5 py-[3px] text-[11px] font-bold text-status-success">
              ✓ Paid
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-3.5 flex items-end justify-between border-t border-text-muted/20 pt-3">
          <div className="text-[9.5px] leading-[1.7] text-text-muted">
            Thank you for visiting us
            <br />
            This is a computer-generated receipt.
          </div>
          {signatureUrl && (
            <div className="mx-4 shrink-0 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signatureUrl}
                alt={data.doctorName ?? "Signature"}
                className="mx-auto mb-1.5 block max-h-[110px] max-w-[200px] object-contain"
              />
              <div className="mx-auto w-[200px] border-t-[1.5px] border-primary/70 pt-[4px] text-[10px] font-bold uppercase tracking-[0.06em] text-text-primary">
                {data.doctorName}
              </div>
            </div>
          )}
          <div className="shrink-0 text-right">
            <div className="text-[11px] font-extrabold text-primary">
              {data.clinicName}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom stripe */}
      <div className="h-[4px] bg-primary" />
    </div>
  );
}

/**
 * A QR barcode for the thermal slip. Encodes the doctor's signature URL — scan
 * it and the signed image opens — falling back to a receipt-verification
 * string when no signature is on file. Generated client-side, same pattern as
 * `GoogleReviewQrCard`.
 */
function SignatureBarcode({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      width: 260,
      margin: 2,
      errorCorrectionLevel: "M",
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
          alt={label}
          className="mx-auto block h-[132px] w-[132px] object-contain"
        />
      ) : (
        <div className="mx-auto h-[132px] w-[132px] animate-pulse rounded-md bg-text-muted/20" />
      )}
      <div className="mt-1 text-[9px] uppercase tracking-[0.06em] text-text-muted">
        {label}
      </div>
    </div>
  );
}

/**
 * The thermal-roll receipt — the format a front-desk 80mm printer expects.
 * Narrow single column, black ink only (no colour fills), dashed separators,
 * compact rows, and a QR barcode carrying the doctor's signature instead of a
 * printed image.
 */
function ThermalDoc(data: ReceiptData) {
  const signatureValue = data.signatureUrl?.trim()
    ? data.signatureUrl.trim()
    : `MedBookAI|RCP:${data.receiptNumber ?? ""}`;

  return (
    <div className="mx-auto max-w-[300px] bg-white px-3 py-4">
      {/* Clinic header — centred */}
      <div className="text-center">
        <div className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-text-primary">
          {data.clinicName}
        </div>
        <div className="mt-1 text-[9px] leading-[1.5] text-text-secondary">
          {[data.clinicAddress, data.clinicPhone].filter(Boolean).join(" · ")}
        </div>
      </div>

      <div className="my-2 border-t border-dashed border-text-secondary/40" />

      {/* Bill / Receipt / Date */}
      <div className="space-y-1 text-[10px]">
        <div className="flex justify-between">
          <span className="text-text-muted">Bill :</span>
          <span className="font-semibold text-text-primary">
            {data.billNumber ?? "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Receipt :</span>
          <span className="font-bold text-text-primary">
            {receiptLabel(data.receiptNumber)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Date :</span>
          <span className="font-semibold text-text-primary">
            {data.headerDate}
          </span>
        </div>
      </div>

      <div className="my-2 border-t border-dashed border-text-secondary/40" />

      {/* Patient / Physician */}
      <div className="space-y-1 text-[10px]">
        <div>
          <span className="text-text-muted">Patient :</span>{" "}
          <span className="font-semibold text-text-primary">
            {data.patientName ?? "—"}
          </span>
          {data.patientPhone && (
            <span className="text-text-secondary">
              {" "}
              ({data.patientPhone})
            </span>
          )}
        </div>
        <div>
          <span className="text-text-muted">Physician :</span>{" "}
          <span className="font-semibold text-text-primary">
            {data.doctorName ?? "—"}
          </span>
          {data.doctorQualification && (
            <span className="text-text-secondary">
              , {data.doctorQualification}
            </span>
          )}
        </div>
      </div>

      <div className="my-2 border-t border-dashed border-text-secondary/40" />

      {/* Items */}
      <div className="text-center text-[9px] font-bold uppercase tracking-[0.12em] text-text-muted">
        Items
      </div>
      <div className="mt-1 space-y-1 text-[10px]">
        {data.items.map((item) => (
          <div key={item.id} className="flex justify-between gap-2">
            <span className="flex-1 truncate text-text-primary">
              {item.description}
              {item.quantity > 1 ? ` x${item.quantity}` : ""}
            </span>
            <span className="shrink-0 tabular-nums text-text-primary">
              {formatCurrency(item.line_total, data.currency)}
            </span>
          </div>
        ))}
        {data.items.length === 0 && (
          <div className="text-center text-text-muted">No items</div>
        )}
      </div>

      <div className="my-2 border-t border-dashed border-text-secondary/40" />

      {/* Totals */}
      <div className="space-y-1 text-[10px]">
        <div className="flex justify-between">
          <span className="text-text-primary">Subtotal</span>
          <span className="tabular-nums text-text-primary">
            {formatCurrency(data.subtotal, data.currency)}
          </span>
        </div>
        {data.discount > 0 && (
          <div className="flex justify-between">
            <span className="text-text-primary">Discount</span>
            <span className="tabular-nums text-text-primary">
              -{formatCurrency(data.discount, data.currency)}
            </span>
          </div>
        )}
        <div className="flex justify-between border-t border-text-secondary/40 pt-1 text-[12px] font-extrabold text-text-primary">
          <span>TOTAL</span>
          <span className="tabular-nums">
            {formatCurrency(data.total, data.currency)}
          </span>
        </div>
      </div>

      <div className="my-2 border-t border-dashed border-text-secondary/40" />

      {/* Payment */}
      <div className="space-y-1 text-[10px]">
        <div className="flex justify-between">
          <span className="text-text-muted">
            Paid ({data.paymentMethodLabel})
          </span>
          <span className="font-bold tabular-nums text-text-primary">
            {formatCurrency(data.paidAmount, data.currency)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Status</span>
          <span className="font-bold uppercase text-text-primary">
            {data.fullyPaid ? "Fully Paid" : "Partial"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Paid On</span>
          <span className="font-semibold text-text-primary">
            {data.paidOnDate
              ? `${data.paidOnDate}${data.paidOnTime ? `, ${data.paidOnTime}` : ""}`
              : "—"}
          </span>
        </div>
      </div>

      <div className="my-2 border-t border-dashed border-text-secondary/40" />

      {/* Signature barcode */}
      <SignatureBarcode
        value={signatureValue}
        label={data.doctorName ?? "Signature"}
      />

      <div className="mt-2 space-y-0.5 text-center text-[9px] text-text-secondary">
        <div>Thank you for visiting us</div>
        <div>This is a computer-generated receipt.</div>
      </div>
    </div>
  );
}

type PrintFormat = "standard" | "thermal";

/**
 * Receipt popup — the Doxmate-style printable receipt on a modal, now with a
 * Standard / Thermal format switch. Standard prints the A4 article receipt;
 * Thermal prints a narrow 80mm slip with a QR signature barcode. A Black &
 * White toggle drives the standard format's grayscale, and Print / Save PDF
 * renders only the selected receipt, never the app chrome.
 */
export function ReceiptPreview({
  bill,
  clinicName,
  clinicAddress,
  clinicPhone,
  timezone,
  override,
  onClose,
}: ReceiptPreviewProps) {
  const [blackWhite, setBlackWhite] = useState(false);
  const [format, setFormat] = useState<PrintFormat>("standard");

  // The receipt row when the list has it; otherwise the just-issued override.
  const receiptRow: ReceiptRow | null = bill.receipts[0] ?? null;
  const receiptNumber =
    override?.receiptNumber ?? receiptRow?.receipt_number ?? null;

  // Most recent payment on the bill — sorted, not relying on embed order.
  const latestPayment: PatientPayment | null =
    bill.patient_payments.length === 0
      ? null
      : [...bill.patient_payments].sort((a, b) =>
          b.collected_at.localeCompare(a.collected_at),
        )[0];

  const paymentMethod: PatientPaymentMethod | null =
    override?.paymentMethod ?? latestPayment?.payment_method ?? null;

  // What this receipt actually took in. A just-issued override knows its own
  // amount; otherwise it is the sum the clinic has recorded on the bill.
  const paidAmount =
    override?.paidAmount ??
    bill.patient_payments.reduce((sum, p) => sum + Number(p.amount) || 0, 0);

  // Paid-on stamp. Override receipts were recorded "now"; stored ones carry a
  // collected_at / generated_at that must render on the clinic's clock.
  const paidOnIso =
    latestPayment?.collected_at ?? receiptRow?.generated_at ?? null;
  const paidOnLocal = paidOnIso
    ? utcIsoToClinicLocalInput(paidOnIso, timezone)
    : "";

  const subtotal = bill.patient_bill_items.reduce(
    (sum, item) => sum + (Number(item.line_total) || 0),
    0,
  );
  const discount = Number(bill.discount_amount) || 0;
  const billTotal =
    Number(bill.total_amount) || Math.max(0, subtotal - discount);
  const total = override ? override.paidAmount : billTotal;
  const fullyPaid = paidAmount >= billTotal;

  const data: ReceiptData = {
    clinicName,
    clinicAddress,
    clinicPhone,
    billNumber: bill.bill_number,
    receiptNumber,
    headerDate: paidOnLocal ? fmtDate(paidOnLocal) : fmtDate(bill.bill_date ?? ""),
    patientName: bill.patients?.name,
    patientPhone: bill.patients?.phone,
    doctorName: bill.doctors?.name,
    doctorQualification: bill.doctors?.qualification,
    signatureUrl: bill.doctors?.signature_url,
    items: bill.patient_bill_items,
    currency: bill.currency,
    subtotal,
    discount,
    total,
    paidAmount,
    fullyPaid,
    paymentMethodLabel: paymentMethod
      ? PATIENT_PAYMENT_METHOD_META[paymentMethod].label
      : "—",
    paidOnDate: paidOnLocal ? fmtDate(paidOnLocal) : "",
    paidOnTime: paidOnLocal ? fmtTime(paidOnLocal) : "",
  };

  const handlePrint = () => {
    window.print();
  };

  const pageCss =
    format === "thermal"
      ? `@page { size: 80mm auto; margin: 0; }`
      : `@page { size: A4 portrait; margin: 10mm; }`;

  return (
    <>
      {/* On-screen full-screen popup (hidden when printing) */}
      <div className="no-print fixed inset-0 z-50 flex flex-col bg-app">
        {/* Action bar — Standard/Thermal, B&W toggle, Print in one centered row */}
        <div className="relative flex shrink-0 items-center justify-center gap-2.5 border-b border-text-muted/15 bg-surface px-16 py-3">
          <div className="flex overflow-hidden rounded-pill border border-text-muted/20 bg-app">
            {(["standard", "thermal"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFormat(key)}
                className={`px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  format === key
                    ? "bg-primary text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {key === "standard" ? "Standard" : "Thermal"}
              </button>
            ))}
          </div>

          <label className="flex cursor-pointer select-none items-center gap-2 rounded-pill border-[1.5px] border-text-muted/20 bg-app px-2.5 py-1.5 text-[12.5px] font-medium text-text-secondary">
            <span
              className={`relative h-[18px] w-[34px] shrink-0 rounded-pill transition-colors ${
                blackWhite ? "bg-primary" : "bg-text-muted/40"
              }`}
            >
              <span
                className={`absolute top-[2px] size-[14px] rounded-pill bg-white shadow transition-[left] ${
                  blackWhite ? "left-[18px]" : "left-[2px]"
                }`}
              />
            </span>
            <input
              type="checkbox"
              checked={blackWhite}
              onChange={(event) => setBlackWhite(event.target.checked)}
              className="hidden"
            />
            <span>Black &amp; White</span>
          </label>

          <Button
            size="sm"
            onClick={handlePrint}
            className="h-8 rounded-md bg-primary px-3 text-white hover:bg-primary/90"
          >
            <Printer className="mr-1.5 size-3.5" aria-hidden="true" />
            Print / Save PDF
          </Button>

          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 flex h-8 items-center gap-1 rounded-md px-2.5 text-[12.5px] font-medium text-text-secondary transition-colors hover:bg-text-muted/10 hover:text-text-primary"
          >
            <X className="size-4" aria-hidden="true" />
            Close
          </button>
        </div>

        {/* Scrollable receipt */}
        <div
          className={`min-h-0 flex-1 overflow-y-auto bg-text-muted/5 py-6 ${
            format === "thermal" ? "px-3" : "px-4"
          }`}
        >
          {format === "thermal" ? (
            <ThermalDoc {...data} />
          ) : (
            <StandardDoc {...data} blackWhite={blackWhite} />
          )}
        </div>
      </div>

      {/* Print-only copy — the single thing print renders */}
      <div className="rx-print-only hidden">
        <div
          className={
            format === "thermal" ? "rx-thermal-print" : "rx-standard-print"
          }
        >
          {format === "thermal" ? (
            <ThermalDoc {...data} />
          ) : (
            <StandardDoc {...data} blackWhite={blackWhite} printable />
          )}
        </div>
      </div>

      <style>{`
        ${pageCss}
        @media print {
          html, body {
            height: auto !important;
            overflow: visible !important;
            background: #fff !important;
          }
          body * { visibility: hidden; }
          .no-print { display: none !important; visibility: hidden !important; }
          .rx-print-only {
            display: block !important;
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
          }
          .rx-print-only, .rx-print-only * { visibility: visible; }
          .rx-print-only .rx-doc,
          .rx-print-only .mx-auto {
            box-shadow: none !important;
            max-width: none !important;
            margin: 0 !important;
            width: 100% !important;
          }
          .rx-standard-print { width: 100% !important; }
          .rx-thermal-print {
            width: 80mm !important;
            margin: 0 auto !important;
          }
          .rx-thermal-print .mx-auto {
            width: 80mm !important;
            margin: 0 auto !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </>
  );
}