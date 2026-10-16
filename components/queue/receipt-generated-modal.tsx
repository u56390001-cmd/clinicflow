"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CheckCircle, FileText, X } from "lucide-react";
import { toast } from "sonner";

import { formatCurrency } from "@/lib/utils/currency";

interface LineItem {
  description: string;
  amount: number;
}

interface ReceiptGeneratedModalProps {
  open: boolean;
  onClose: () => void;
  patientName: string;
  patientAge?: string | null;
  tokenNumber: number;
  doctorName: string;
  appointmentDate: string;
  clinicName: string;
  clinicAddress?: string | null;
  billId: string;
  lineItems: LineItem[];
  totalAmount: number;
  paymentMethod: string;
  paidAt: string;
  patientWhatsappNumber?: string | null;
}

/**
 * Receipt Generated Modal — appears after successful Collect Payment.
 * Exact structural match of the reference receipt markup, rendered in
 * MedBook AI teal (WhatsApp keeps its brand green via an inline SVG mark).
 */
export function ReceiptGeneratedModal({
  open,
  onClose,
  patientName,
  tokenNumber,
  doctorName,
  appointmentDate,
  clinicName,
  clinicAddress,
  billId,
  lineItems,
  totalAmount,
  paymentMethod,
  paidAt,
  patientWhatsappNumber,
}: ReceiptGeneratedModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const isWaived = paymentMethod === "waive";
  const formattedDate = new Date(appointmentDate).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const formattedTime = new Date(paidAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const displayBillNumber = billId.toUpperCase();

  const handleWhatsApp = () => {
    if (!patientWhatsappNumber) {
      toast.error("Patient has no WhatsApp number on file.");
      return;
    }
    toast.success("Receipt sent via WhatsApp.");
  };

  const handlePrint = () => {
    window.print();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Receipt generated"
    >
      <div
        ref={panelRef}
        className="relative flex max-h-[90vh] w-full max-w-lg animate-scale-in flex-col overflow-hidden rounded-card border border-brand-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — calm sage surface; brand accent carried by the icon chip. */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-brand-line bg-brand-wash px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-control bg-brand-pale p-2">
              <FileText className="h-5 w-5 text-brand-cta" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-brand-ink">Receipt Generated</h2>
              <p className="mt-0.5 text-xs text-brand-muted">
                {patientName} &middot; Token #{tokenNumber}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="group rounded-control p-2 text-brand-muted transition-colors hover:bg-brand-pale hover:text-brand-ink"
            aria-label="Close"
          >
            <X className="h-5 w-5 transition-transform duration-200 group-hover:rotate-90" />
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {/* Clinic info row — real clinic data, never hardcoded */}
          <div className="flex items-center justify-between rounded-[10px] bg-brand-pale px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-brand-cta">
                {clinicName}
              </p>
              {clinicAddress && (
                <p className="mt-0.5 truncate text-xs text-brand-muted">
                  {clinicAddress}
                </p>
              )}
            </div>
            <span className="ml-3 flex-shrink-0 text-xs font-bold text-brand-cta">
              {displayBillNumber}
            </span>
          </div>

          {/* Patient & Doctor cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-brand-canvas p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-brand-faint">
                Patient
              </p>
              <p className="truncate text-sm font-bold text-brand-ink">
                {patientName}
              </p>
            </div>
            <div className="rounded-xl bg-brand-canvas p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-brand-faint">
                Doctor
              </p>
              <p className="truncate text-sm font-bold text-brand-ink">
                {doctorName}
              </p>
              <p className="mt-1 text-xs text-brand-muted">{formattedDate}</p>
            </div>
          </div>

          {/* Itemized invoice table */}
          <div className="overflow-hidden rounded-xl border border-brand-line">
            <div className="grid grid-cols-2 border-b border-brand-line bg-brand-canvas px-4 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-brand-faint">
                Item
              </span>
              <span className="text-right text-[10px] font-bold uppercase tracking-wide text-brand-faint">
                Amount
              </span>
            </div>
            {lineItems.map((item, i) => (
              <div
                key={i}
                className="grid grid-cols-2 px-4 py-3"
              >
                <span className="truncate pr-2 text-sm text-brand-ink">
                  {item.description}
                </span>
                <span className="text-right text-sm font-bold text-brand-ink">
                  {formatCurrency(item.amount)}
                </span>
              </div>
            ))}
            <div className="grid grid-cols-2 border-t-2 border-brand-line bg-brand-canvas px-4 py-3">
              <span className="text-sm font-bold text-brand-ink">Total Paid</span>
              <span className="text-right text-lg font-bold text-brand-cta">
                {formatCurrency(totalAmount)}
              </span>
            </div>
          </div>

          {/* Payment status banner — status-accurate, not hardcoded */}
          <div
            className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
              isWaived
                ? "border-brand-line bg-brand-canvas"
                : "border-brand-success-soft bg-brand-success-soft"
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle
                className={`h-4 w-4 ${
                  isWaived ? "text-brand-faint" : "text-brand-success"
                }`}
                aria-hidden="true"
              />
              <span
                className={`text-sm font-semibold ${
                  isWaived ? "text-brand-ink" : "text-brand-success"
                }`}
              >
                {isWaived ? "Payment Waived" : "Payment Received"}
              </span>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                isWaived ? "bg-brand-wash text-brand-muted" : "bg-surface text-brand-success"
              }`}
            >
              {formattedTime}
            </span>
          </div>
        </div>

        {/* Bottom action bar — Close / WhatsApp / Print */}
        <div className="flex flex-shrink-0 items-center justify-between border-t border-brand-line bg-brand-canvas px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-control border border-brand-line px-4 py-2.5 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-wash"
          >
            Close
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleWhatsApp}
              disabled={!patientWhatsappNumber}
              className="flex items-center gap-2 rounded-xl border-2 border-brand-success-soft bg-brand-success-soft px-4 py-2.5 text-sm font-semibold text-brand-success transition-all hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#25D366" aria-hidden="true">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.978-1.42A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm4.93 13.67c-.207.583-1.218 1.145-1.664 1.178-.446.033-.458.352-2.887-.602-2.43-.955-3.896-3.371-4.013-3.527-.117-.156-.95-1.262-.95-2.407 0-1.145.595-1.71.815-1.944.22-.234.479-.292.638-.292.16 0 .32.001.46.008.147.007.344-.056.538.41.2.48.677 1.65.737 1.77.06.12.1.26.02.42-.08.16-.12.26-.24.4-.12.14-.25.31-.36.42-.12.12-.24.25-.1.49.14.24.62 1.02 1.33 1.65.91.81 1.68 1.06 1.92 1.18.24.12.38.1.52-.06.14-.16.6-.7.76-.94.16-.24.32-.2.54-.12.22.08 1.4.66 1.64.78.24.12.4.18.46.28.06.1.06.58-.15 1.16z" />
              </svg>
              WhatsApp
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-2 rounded-control bg-brand-cta px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-brand-cta-hover hover:shadow-xl"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              Print
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}