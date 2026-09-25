"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Receipt, ScanLine, User, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  PATIENT_BILL_STATUS_META,
  PATIENT_PAYMENT_METHOD_META,
} from "@/lib/constants";
import { waivePatientBillAction } from "@/lib/actions/patient-billing";
import type { PatientBillListRow } from "@/lib/patient-billing-queries";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import { formatCurrency } from "@/lib/utils/currency";
import { formatNaiveDate, formatNaiveTime } from "@/lib/utils/datetime";

interface BillDetailsModalProps {
  bill: PatientBillListRow;
  /** Clinic name shown in the subhead under the header. */
  clinicName: string;
  /** Clinic IANA timezone — visit timestamps render on the clinic's clock. */
  timezone: string;
  onClose: () => void;
  /** Opens the collect-payment popup for this bill. */
  onCollectPayment: () => void;
  /** Opens the printable receipt popup (only surfaced when a receipt exists). */
  onPrintReceipt: () => void;
}

/**
 * Bill Details popup — a read-only view of one bill.
 *
 * Mirrors `docs/bill_details_modal.html` on the app's teal design system:
 * gradient header with a status pill, clinic subhead, patient/schedule info
 * cards, an itemised line-items table with subtotal/final-total footer, a
 * payment-information block with amount paid/due, and a footer whose actions
 * (Waive / Collect) are real, calling the same server actions as the row menu.
 */
export function BillDetailsModal({
  bill,
  clinicName,
  timezone,
  onClose,
  onCollectPayment,
  onPrintReceipt,
}: BillDetailsModalProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmAction, setConfirmAction] = useState<"waive" | null>(null);
  const [reason, setReason] = useState("");

  const status = PATIENT_BILL_STATUS_META[bill.status];
  const hasReceipt = bill.receipts.length > 0;

  const canWaive =
    bill.status === "pending" || bill.status === "partially_paid";
  const canCollect =
    bill.status === "pending" || bill.status === "partially_paid";

  // Money derived from the row's embedded collections (never trusting array
  // order — the latest payment is the sorted head).
  const subtotal = bill.total_amount + bill.discount_amount;
  const paid = bill.patient_payments.reduce((sum, p) => sum + p.amount, 0);
  const due = Math.max(0, bill.total_amount - paid);
  const latestPayment = [...bill.patient_payments].sort((a, b) =>
    b.collected_at.localeCompare(a.collected_at),
  )[0];

  // Check-in is a timestamptz (UTC); the bill date is a naive clinic-tz date.
  const checkInLocal = bill.visits?.checked_in_at
    ? utcIsoToClinicLocalInput(bill.visits.checked_in_at, timezone)
    : "";

  const handleWaive = async () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("billId", bill.id);
      formData.append("reason", reason);

      const result = await waivePatientBillAction(null, formData);
      if (result.ok) {
        toast.success("Bill waived");
        setConfirmAction(null);
        setReason("");
        onClose();
        router.refresh();
      } else {
        toast.error(result.message || "Failed to waive bill.");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-[680px] flex-col overflow-hidden rounded-[20px] bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between bg-gradient-to-br from-primary to-teal-600 px-6 py-[18px] text-white">
          <div className="flex items-center gap-3.5">
            <div className="flex size-[42px] shrink-0 items-center justify-center rounded-xl bg-white/20">
              <Receipt className="size-5" aria-hidden="true" />
            </div>
            <div>
              <div className="text-base font-bold">Bill Details</div>
              <div className="mt-0.5 text-xs opacity-80">
                {bill.bill_number ?? "—"} · {formatNaiveDate(bill.bill_date)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="rounded-pill bg-white/25 px-3.5 py-[5px] text-[11.5px] font-bold uppercase tracking-[0.03em] text-white">
              {status.label}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-white/20 p-[7px] text-white transition-colors hover:bg-white/30"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {/* Clinic subhead */}
          <div className="flex items-center justify-between rounded-[10px] bg-primary/10 px-3.5 py-2.5">
            <div>
              <div className="text-xs font-bold text-primary">Clinic</div>
              <div className="mt-0.5 text-[11px] text-text-muted">
                {clinicName}
              </div>
            </div>
            <div className="text-[11px] font-extrabold tracking-[0.02em] text-primary">
              {bill.bill_number ?? "—"}
            </div>
          </div>

          {/* Info grid: patient + schedule */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Patient info */}
            <div className="rounded-xl bg-app p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
                  <User className="size-3.5 text-primary" aria-hidden="true" />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-muted">
                  Patient Information
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <div>
                  <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                    Full Name
                  </div>
                  <div className="text-sm font-bold text-text-primary">
                    {bill.patients?.name ?? "Unknown patient"}
                  </div>
                </div>
                <div>
                  <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                    Phone Number
                  </div>
                  <div className="text-[13px] font-medium text-text-secondary">
                    {bill.patients?.phone ?? "—"}
                  </div>
                </div>
                {bill.patients?.email && (
                  <div>
                    <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                      Email
                    </div>
                    <div className="text-[13px] font-medium text-text-secondary">
                      {bill.patients.email}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Schedule info */}
            <div className="rounded-xl bg-app p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
                  <ScanLine className="size-3.5 text-primary" aria-hidden="true" />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-muted">
                  Schedule Details
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <div>
                  <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                    Doctor
                  </div>
                  <div className="text-sm font-bold text-text-primary">
                    {bill.doctors?.name ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                    Date
                  </div>
                  <div className="text-[13px] font-medium text-text-secondary">
                    {formatNaiveDate(bill.bill_date)}
                  </div>
                </div>
                <div>
                  <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                    Time
                  </div>
                  <div className="text-[13px] font-medium text-text-secondary">
                    {formatNaiveTime(checkInLocal) || "—"}
                  </div>
                </div>
                <div>
                  <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                    Token
                  </div>
                  <div className="text-[13px] font-medium text-text-secondary">
                    {bill.visits?.token_number != null ? `#${bill.visits.token_number}` : "—"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
              Line Items
            </div>
            <div className="overflow-hidden rounded-[10px] border border-text-muted/15">
              <div className="grid grid-cols-[minmax(0,1fr)_56px_84px_84px] bg-app px-3.5 py-[7px] text-[11px] font-bold uppercase text-text-muted">
                <span>Item</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Unit Price</span>
                <span className="text-right">Total</span>
              </div>
              {bill.patient_bill_items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[minmax(0,1fr)_56px_84px_84px] items-center border-t border-text-muted/10 px-3.5 py-2.5"
                >
                  <span className="truncate text-[13px] font-medium text-text-secondary">
                    {item.description}
                  </span>
                  <span className="text-center text-[13px] font-medium text-text-secondary">
                    {item.quantity}
                  </span>
                  <span className="text-right text-[13px] font-semibold text-text-secondary">
                    {formatCurrency(item.unit_price, bill.currency)}
                  </span>
                  <span className="text-right text-[13px] font-bold text-text-primary">
                    {formatCurrency(item.line_total, bill.currency)}
                  </span>
                </div>
              ))}
              {bill.patient_bill_items.length === 0 && (
                <div className="border-t border-text-muted/10 px-3.5 py-4 text-center text-xs text-text-muted">
                  No line items on this bill.
                </div>
              )}
            </div>

            {/* Totals footer */}
            <div className="flex flex-col gap-1.5 rounded-b-[10px] bg-app px-4 py-3">
              <div className="flex justify-between">
                <span className="text-xs text-text-secondary">Subtotal</span>
                <span className="text-xs font-medium text-text-secondary">
                  {formatCurrency(subtotal, bill.currency)}
                </span>
              </div>
              {bill.discount_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-xs text-text-secondary">
                    Discount
                    {bill.discount_percent > 0
                      ? ` (${bill.discount_percent}%)`
                      : ""}
                  </span>
                  <span className="text-xs font-medium text-status-success">
                    - {formatCurrency(bill.discount_amount, bill.currency)}
                  </span>
                </div>
              )}
              <div className="mt-1 flex items-center justify-between border-t border-text-muted/20 pt-2.5">
                <span className="text-sm font-bold text-text-primary">
                  Final Total
                </span>
                <span className="text-[22px] font-extrabold tracking-tight text-text-primary">
                  {formatCurrency(bill.total_amount, bill.currency)}
                </span>
              </div>
            </div>
          </div>

          {/* Payment information */}
          <div className="overflow-hidden rounded-xl border border-text-muted/15">
            <div className="border-b border-text-muted/15 bg-app px-4 py-2.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
                Payment Information
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 px-4 py-3.5 sm:grid-cols-3">
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                  Method
                </div>
                {latestPayment ? (
                  <span className="inline-flex rounded-pill bg-status-success/15 px-2.5 py-1 text-xs font-bold uppercase text-status-success">
                    {PATIENT_PAYMENT_METHOD_META[latestPayment.payment_method].label}
                  </span>
                ) : (
                  <div className="text-xs font-semibold text-text-secondary">—</div>
                )}
              </div>
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                  Reference
                </div>
                <div className="font-mono text-xs font-semibold text-text-secondary">
                  {latestPayment?.payment_reference ?? "—"}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                  Paid On
                </div>
                <div className="text-xs font-semibold text-status-success">
                  {latestPayment
                    ? formatNaiveDate(latestPayment.collected_at)
                    : "—"}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-text-muted/10 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-status-success">
                  Amount Paid
                </span>
                <span className="text-[16px] font-extrabold text-status-success">
                  {formatCurrency(paid, bill.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-status-warning">
                  Amount Due
                </span>
                <span className="text-[16px] font-extrabold text-status-warning">
                  {formatCurrency(due, bill.currency)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-text-muted/15 px-6 py-3.5">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <div className="flex items-center gap-2">
            {hasReceipt && (
              <Button variant="outline" size="sm" onClick={onPrintReceipt}>
                <Receipt className="mr-1.5 size-3.5" aria-hidden="true" />
                Print Receipt
              </Button>
            )}
            {canWaive && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmAction("waive")}
                className="border-status-destructive/40 bg-status-destructive/5 text-status-destructive hover:bg-status-destructive/10"
              >
                Waive bill
              </Button>
            )}
            {canCollect && (
              <Button
                size="sm"
                onClick={onCollectPayment}
                className="bg-status-success text-white hover:bg-status-success/90"
              >
                <Check className="mr-1.5 size-4" aria-hidden="true" />
                Collect payment
              </Button>
            )}
          </div>
        </div>
      </div>

      {confirmAction === "waive" && (
        <ConfirmDialog
          title="Waive Bill"
          description={`Write off bill ${bill.bill_number ?? "this bill"}? The clinic keeps any payments already collected, and the balance is forgiven. This action is permanent and will be audited.`}
          confirmText="Waive"
          cancelText="Keep Bill"
          variant="warning"
          reason={reason}
          onReasonChange={setReason}
          onConfirm={handleWaive}
          onCancel={() => {
            setConfirmAction(null);
            setReason("");
          }}
          loading={pending}
        />
      )}
    </div>
  );
}