"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle, CreditCard, Receipt, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { collectPatientPaymentAction } from "@/lib/actions/patient-billing";
import { PATIENT_PAYMENT_METHOD_META } from "@/lib/constants";
import { DEFAULT_CURRENCY, formatCurrency } from "@/lib/utils/currency";
import {
  PATIENT_PAYMENT_METHODS_UI,
  type PatientPaymentMethodUI,
} from "@/types/database";

interface BillLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface BillingSheetProps {
  billId: string;
  patientName: string;
  lineItems: BillLineItem[];
  totalAmount: number;
  discountAmount?: number;
  discountPercent?: number;
  currency?: string;
  isPaid?: boolean;
  onClose: () => void;
}

/** Pakistani payment rails (decision D8). Keys match `PATIENT_PAYMENT_METHODS_UI`. */
const PAYMENT_ICONS: Record<PatientPaymentMethodUI, React.ReactNode> = {
  cash: "💵",
  card: "💳",
  jazzcash: "📱",
  easypaisa: "📲",
  bank_transfer: "🏦",
  waive: "🚫",
};

/**
 * Billing / Transaction Sheet — slide-over panel from the right edge.
 * Shows itemized line items, discount summary, total, and a prominent
 * "Collect & Send Receipt" action button.
 */
export function BillingSheet({
  billId,
  patientName,
  lineItems,
  totalAmount,
  discountAmount = 0,
  discountPercent = 0,
  currency = DEFAULT_CURRENCY,
  isPaid = false,
  onClose,
}: BillingSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [paymentMethod, setPaymentMethod] =
    useState<PatientPaymentMethodUI>("cash");
  const [amount, setAmount] = useState(totalAmount.toString());
  const [isPending, setIsPending] = useState(false);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!paymentMethod) {
        toast.error("Select a payment method.");
        return;
      }

      setIsPending(true);
      try {
        const fd = new FormData();
        fd.set("billId", billId);
        fd.set("paymentMethod", paymentMethod);
        fd.set("amount", amount);

        const res = await collectPatientPaymentAction(null, fd);
        if (res.ok) {
          toast.success(`Payment collected! Receipt #${res.data}`);
          onClose();
        } else {
          toast.error(res.message);
        }
      } finally {
        setIsPending(false);
      }
    },
    [billId, paymentMethod, amount, onClose],
  );

  const netTotal = totalAmount - discountAmount;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/30 backdrop-blur-sm">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative flex h-full w-full max-w-md flex-col border-l border-text-muted/20 bg-surface shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={`Billing for ${patientName}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-text-muted/20 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Receipt className="h-5 w-5 text-primary" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-text-primary">
                Billing &amp; Transaction
              </h2>
              <p className="text-xs text-text-muted">{patientName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-control p-1 text-text-muted transition-colors hover:bg-app hover:text-text-primary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Line Items */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-1">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_60px_80px_80px] gap-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              <span>Item</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Unit Price</span>
              <span className="text-right">Total</span>
            </div>

            {/* Line items */}
            {lineItems.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[1fr_60px_80px_80px] gap-2 border-t border-text-muted/10 py-2 text-sm"
              >
                <span className="truncate text-text-primary">
                  {item.description}
                </span>
                <span className="text-right text-text-secondary">
                  {item.quantity}
                </span>
                <span className="text-right text-text-secondary">
                  {formatCurrency(item.unit_price, currency)}
                </span>
                <span className="text-right font-medium text-text-primary">
                  {formatCurrency(item.line_total, currency)}
                </span>
              </div>
            ))}

            {lineItems.length === 0 && (
              <p className="py-6 text-center text-xs text-text-muted">
                No line items.
              </p>
            )}
          </div>

          {/* Discount row */}
          {(discountAmount > 0 || discountPercent > 0) && (
            <div className="mt-4 space-y-1 rounded-control bg-app p-3">
              <div className="flex justify-between text-xs text-text-secondary">
                <span>Subtotal</span>
                <span>{formatCurrency(totalAmount, currency)}</span>
              </div>
              {discountPercent > 0 && (
                <div className="flex justify-between text-xs text-status-success">
                  <span>Discount ({discountPercent}%)</span>
                  <span>- {formatCurrency(discountAmount, currency)}</span>
                </div>
              )}
              {discountAmount > 0 && discountPercent === 0 && (
                <div className="flex justify-between text-xs text-status-success">
                  <span>Discount</span>
                  <span>- {formatCurrency(discountAmount, currency)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-text-muted/20 px-5 py-4">
          {/* Total */}
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-text-primary">
              Total Amount
            </span>
            <span className="text-lg font-bold text-primary">
              {formatCurrency(netTotal, currency)}
            </span>
          </div>

          {isPaid ? (
            <div className="flex items-center justify-center gap-2 rounded-control bg-status-success/10 py-3">
              <CheckCircle className="h-4 w-4 text-status-success" />
              <span className="text-sm font-medium text-status-success">
                Payment Collected
              </span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Payment method */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-text-muted">
                  Payment Method
                </Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {PATIENT_PAYMENT_METHODS_UI.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setPaymentMethod(key);
                        if (key === "waive") setAmount("0");
                        else setAmount(netTotal.toString());
                      }}
                      className={`flex flex-col items-center gap-0.5 rounded-control border px-2 py-1.5 text-[10px] font-medium transition-colors ${
                        paymentMethod === key
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-text-muted/30 text-text-secondary hover:bg-app"
                      }`}
                    >
                      <span>{PAYMENT_ICONS[key]}</span>
                      {PATIENT_PAYMENT_METHOD_META[key].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount (hidden for waive) */}
              {paymentMethod !== "waive" && (
                <div className="space-y-1.5">
                  <Label htmlFor="bs-amount" className="text-xs font-medium text-text-muted">
                    Amount
                  </Label>
                  <Input
                    id="bs-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              )}

              {paymentMethod === "waive" && (
                <p className="rounded-control bg-app px-3 py-2 text-xs text-text-muted">
                  This bill will be marked as paid with zero charge.
                </p>
              )}

              <Button
                type="submit"
                className="w-full gap-2"
                size="lg"
                disabled={isPending}
              >
                <CreditCard className="h-4 w-4" aria-hidden="true" />
                {isPending
                  ? "Processing..."
                  : paymentMethod === "waive"
                    ? "Waive & Confirm"
                    : "Collect & Send Receipt"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
