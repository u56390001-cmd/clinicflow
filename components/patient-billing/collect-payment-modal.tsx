"use client";

import { useState, useCallback, useTransition } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, FileText, Percent, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { collectPatientPaymentAction } from "@/lib/actions/patient-billing";
import { PATIENT_PAYMENT_METHOD_META } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils/currency";
import {
  PATIENT_PAYMENT_METHODS_UI,
  type PatientPaymentMethod,
  type PatientPaymentMethodUI,
} from "@/types/database";

interface CollectPaymentModalProps {
  billId: string;
  patientName?: string;
  billNumber?: string;
  /** Outstanding amount this modal is collecting. */
  amount?: number;
  currency?: string;
  doctorName?: string;
  /** Naive clinic-tz date (`YYYY-MM-DD`) for the confirmation card. */
  billDate?: string;
  tokenNumber?: number | null;
  patientPhone?: string | null;
  onClose: () => void;
  /**
   * Fired after a payment (not a waiver) is recorded, with the facts the
   * receipt popup needs: the receipt number returned by the RPC, the amount
   * actually taken, and the rail that took it.
   */
  onCollected?: (info: {
    receiptNumber: string;
    amount: number;
    paymentMethod: PatientPaymentMethodUI;
  }) => void;
}

/**
 * Collect Payment popup — mirrors `docs/collect_payment_modal.html` on the
 * app's teal design system.
 *
 * Three columns: Patient Confirmation (initials avatar, doctor, bill number,
 * token/date), Collect Payment (total, amount-paid input, live due indicator
 * and Paid/Partial badge, Pakistani rail picker), and Additional Charges +
 * Apply Discount accordions. Wired to `collectPatientPaymentAction`, whose
 * RPC applies the charges/discount and issues the receipt.
 */
export function CollectPaymentModal({
  billId,
  patientName,
  billNumber,
  amount: defaultAmount,
  currency = "PKR",
  doctorName,
  billDate,
  tokenNumber,
  patientPhone,
  onClose,
  onCollected,
}: CollectPaymentModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<PatientPaymentMethodUI>(
    "cash",
  );
  const [amount, setAmount] = useState(defaultAmount?.toString() ?? "");
  const [isPending, startTransition] = useTransition();
  const [additionalCharges, setAdditionalCharges] = useState<
    { description: string; quantity: number; unit_price: number }[]
  >([]);
  const [chargeDescription, setChargeDescription] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [discountType, setDiscountType] = useState<"amount" | "percent">(
    "amount",
  );
  const [discountValue, setDiscountValue] = useState("");

  const isWaive = paymentMethod === "waive";
  const numAmount = isWaive ? 0 : Number(amount) || 0;
  const chargesTotal = additionalCharges.reduce(
    (sum, c) => sum + c.quantity * c.unit_price,
    0,
  );

  const numDiscount = (
    baseTotal: number,
    extraCharges: number,
    type: "amount" | "percent",
    value: string,
  ): number => {
    if (type === "percent") {
      return ((baseTotal + extraCharges) * (Number(value) || 0)) / 100;
    }
    return Number(value) || 0;
  };

  // Like the reference total: base bill due, then + charges − discount.
  const currentTotal = Math.max(
    0,
    (defaultAmount ?? 0) + chargesTotal - numDiscount(defaultAmount ?? 0, chargesTotal, discountType, discountValue),
  );
  const due = Math.max(0, currentTotal - numAmount);
  const paidInFull = due === 0;

  const discountPercent =
    discountType === "percent" ? Math.min(Number(discountValue) || 0, 100) : 0;
  const discountAmount =
    discountType === "amount"
      ? Math.min(numDiscount(defaultAmount ?? 0, chargesTotal, discountType, discountValue), currentTotal)
      : 0;

  const handleAddCharge = () => {
    const desc = chargeDescription.trim();
    const price = Number(chargeAmount) || 0;
    if (!desc || price <= 0) {
      toast.error("Enter a charge description and a positive amount.");
      return;
    }
    setAdditionalCharges((prev) => [
      ...prev,
      { description: desc, quantity: 1, unit_price: price },
    ]);
    setChargeDescription("");
    setChargeAmount("");
  };

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!paymentMethod) {
        toast.error("Select a payment method.");
        return;
      }
      if (!isWaive && currentTotal <= 0) {
        toast.error("Enter a valid amount.");
        return;
      }

      const fd = new FormData();
      fd.set("billId", billId);
      fd.set("paymentMethod", paymentMethod);
      fd.set("amount", currentTotal.toString());
      fd.set("additionalCharges", JSON.stringify(additionalCharges));
      fd.set("discountAmount", discountAmount.toString());
      fd.set("discountPercent", discountPercent.toString());

      startTransition(async () => {
        const res = await collectPatientPaymentAction(null, fd);
        if (res.ok) {
          toast.success(
            res.data === "waived"
              ? "Bill waived."
              : res.data === "paid"
                ? "Payment collected."
                : `Payment collected! Receipt #${res.data}`,
          );
          if (!isWaive) {
            onCollected?.({
              receiptNumber: res.data,
              amount: currentTotal,
              paymentMethod,
            });
          }
          onClose();
        } else {
          toast.error(res.message);
        }
      });
    },
    [
      billId,
      paymentMethod,
      isWaive,
      currentTotal,
      additionalCharges,
      discountAmount,
      discountPercent,
      onClose,
      onCollected,
    ],
  );

  const initials = (patientName ?? "P")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-[920px] flex-col overflow-hidden rounded-[20px] bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between bg-gradient-to-br from-primary to-teal-600 px-6 py-[18px] text-white">
          <div className="flex items-center gap-3.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-white/20">
              <FileText className="size-5" aria-hidden="true" />
            </div>
            <div>
              <div className="text-base font-bold">Collect Payment</div>
              <div className="mt-0.5 text-xs opacity-80">
                {patientName ?? "—"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/20 p-[7px] text-white transition-colors hover:bg-white/30"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <form
          id="collect-payment-form"
          onSubmit={handleSubmit}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-app px-6 py-5"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Column 1 — Patient Confirmation */}
            <div className="flex flex-col rounded-xl border border-text-muted/15 bg-surface p-[18px]">
              <div className="mb-3.5 flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="size-3.5 text-primary" aria-hidden="true" />
                </span>
                <span className="text-xs font-bold text-text-primary">
                  Patient Confirmation
                </span>
              </div>

              <div className="mb-3.5 flex items-center gap-2.5">
                <div className="flex size-[42px] shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-teal-600 text-sm font-extrabold text-white">
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-bold text-text-primary">
                    {patientName ?? "—"}
                  </div>
                  <div className="truncate text-[11.5px] text-text-muted">
                    {doctorName ?? "—"}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                    Bill #
                  </span>
                  <span className="text-xs font-semibold text-text-primary">
                    {billNumber ?? "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                    Token
                  </span>
                  <span className="text-xs font-semibold text-text-primary">
                    {tokenNumber != null ? `#${tokenNumber}` : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                    Date
                  </span>
                  <span className="text-xs font-semibold text-text-primary">
                    {billDate ?? "—"}
                  </span>
                </div>
                {patientPhone && (
                  <div className="flex items-center gap-2">
                    <span className="w-10 shrink-0 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                      Phone
                    </span>
                    <span className="text-xs font-semibold text-text-primary">
                      {patientPhone}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Column 2 — Collect Payment */}
            <div className="flex flex-col rounded-xl border border-text-muted/15 bg-surface p-[18px]">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
                  <span className="text-[11px] font-bold text-primary">
                    {currency === "PKR" ? "Rs" : currency}
                  </span>
                </span>
                <span className="text-xs font-bold text-text-primary">
                  Collect Payment
                </span>
              </div>

              {/* Total Payment */}
              <div className="mb-3.5">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-text-muted">
                  Total Payment
                </div>
                <div className="flex items-center justify-between rounded-[10px] border-2 border-text-muted/15 bg-app px-3.5 py-2.5">
                  <span className="text-[22px] font-extrabold tracking-tight text-text-primary">
                    {formatCurrency(currentTotal, currency)}
                  </span>
                </div>
              </div>

              {/* Amount Paid + due + badge */}
              {isWaive ? (
                <div className="mb-3.5 rounded-lg border border-status-warning/40 bg-status-warning/15 p-3 text-xs font-medium text-status-warning">
                  This bill will be closed with zero charge.
                </div>
              ) : (
                <div className="mb-3.5">
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-text-muted">
                    Amount Paid
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-text-secondary">
                      {currency === "PKR" ? "Rs" : currency}
                    </span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
                      className="h-10 pl-10 text-base font-bold"
                      aria-label="Amount paid"
                    />
                  </div>

                  {/* Due indicator */}
                  <div
                    className={`mt-2.5 flex items-center justify-between rounded-lg border px-3 py-2 ${
                      paidInFull
                        ? "border-status-success/30 bg-status-success/10"
                        : "border-status-warning/40 bg-status-warning/15"
                    }`}
                  >
                    <span
                      className={`text-[13px] font-semibold ${
                        paidInFull ? "text-status-success" : "text-status-warning"
                      }`}
                    >
                      Due Amount
                    </span>
                    <span
                      className={`text-[15px] font-extrabold ${
                        paidInFull ? "text-status-success" : "text-status-warning"
                      }`}
                    >
                      {formatCurrency(due, currency)}
                    </span>
                  </div>

                  {/* Status badge */}
                  <div className="mt-2 flex justify-end">
                    <span
                      className={`inline-flex items-center gap-1 rounded-pill px-3 py-1 text-[11.5px] font-bold ${
                        paidInFull
                          ? "bg-status-success/15 text-status-success"
                          : "bg-status-warning/15 text-status-warning"
                      }`}
                    >
                      {paidInFull && <Check className="size-3" aria-hidden="true" />}
                      {paidInFull ? "Paid" : "Partial"}
                    </span>
                  </div>
                </div>
              )}

              {/* Payment Mode grid — Pakistani rails only */}
              <div>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-text-muted">
                  Payment Mode
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {PATIENT_PAYMENT_METHODS_UI.map((method) => {
                    const meta = PATIENT_PAYMENT_METHOD_META[method];
                    const active = paymentMethod === method;
                    return (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`flex items-center gap-2 rounded-[10px] border-[1.5px] px-2.5 py-2 text-left transition-colors ${
                          active
                            ? "border-primary bg-primary/10"
                            : "border-text-muted/20 bg-surface hover:border-primary/50"
                        }`}
                      >
                        <span
                          className={`size-2 shrink-0 rounded-pill ${
                            active
                              ? "bg-primary"
                              : PAYMENT_MODE_DOT[method]
                          }`}
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          <span
                            className={`block truncate text-[11.5px] font-bold ${
                              active ? "text-text-primary" : "text-text-secondary"
                            }`}
                          >
                            {meta.label}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Column 3 — Additional Charges + Discount accordions */}
            <div className="flex flex-col gap-3.5">
              {/* Additional Charges */}
              <Collapsible className="overflow-hidden rounded-xl border border-primary/30 bg-surface">
                <CollapsibleTrigger className="flex w-full items-center justify-between px-3.5 py-2.5">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-text-primary">
                    <Plus className="size-3.5 text-primary" aria-hidden="true" />
                    Additional Charges
                  </span>
                  <ChevronDown
                    className="size-3.5 text-text-muted data-[state=open]:rotate-180"
                    aria-hidden="true"
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t border-primary/30 bg-app px-3.5 pb-3.5 pt-3">
                  {additionalCharges.length > 0 && (
                    <ul className="mb-2.5 space-y-1">
                      {additionalCharges.map((c, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="truncate text-text-primary">
                            {c.description}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="tabular-nums text-text-secondary">
                              {formatCurrency(c.quantity * c.unit_price, currency)}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setAdditionalCharges((prev) =>
                                  prev.filter((_, j) => j !== i),
                                )
                              }
                              className="text-text-muted hover:text-status-destructive"
                              aria-label={`Remove ${c.description}`}
                            >
                              ✕
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <Input
                      value={chargeDescription}
                      onChange={(e) => setChargeDescription(e.target.value)}
                      placeholder="Registration / Service Fee"
                      className="h-9 text-xs"
                    />
                    <div className="flex gap-1.5">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={chargeAmount}
                        onChange={(e) => setChargeAmount(e.target.value)}
                        placeholder="Amount"
                        className="h-9 flex-1 text-xs"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddCharge}
                        className="h-9 shrink-0"
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Apply Discount */}
              <Collapsible className="overflow-hidden rounded-xl border border-status-warning/40 bg-surface">
                <CollapsibleTrigger className="flex w-full items-center justify-between px-3.5 py-2.5">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-text-primary">
                    <Percent
                      className="size-3.5 text-status-warning"
                      aria-hidden="true"
                    />
                    Apply Discount
                  </span>
                  <ChevronDown
                    className="size-3.5 text-text-muted data-[state=open]:rotate-180"
                    aria-hidden="true"
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t border-status-warning/40 bg-app px-3.5 pb-3.5 pt-3">
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setDiscountType("amount");
                        setDiscountValue("");
                      }}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                        discountType === "amount"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-text-muted/20 text-text-secondary"
                      }`}
                    >
                      Rs. Fixed
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDiscountType("percent");
                        setDiscountValue("");
                      }}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                        discountType === "percent"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-text-muted/20 text-text-secondary"
                      }`}
                    >
                      % Percent
                    </button>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountType === "percent" ? "e.g. 10" : "0.00"}
                    className="mt-1.5 h-9 text-xs"
                  />
                  {(discountAmount > 0 || discountPercent > 0) && (
                    <p className="mt-1.5 text-xs font-medium text-status-warning">
                      Applied: -{formatCurrency(discountAmount || Math.min(((defaultAmount ?? 0) + chargesTotal) * discountPercent / 100, currentTotal), currency)}
                    </p>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-text-muted/15 bg-surface px-6 py-3.5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-text-primary">
              Total:
            </span>
            <span className="text-xl font-extrabold tracking-tight text-primary">
              {formatCurrency(currentTotal, currency)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="collect-payment-form"
              disabled={isPending}
              className="bg-status-success text-white hover:bg-status-success/90"
            >
              <Check className="mr-1.5 size-4" aria-hidden="true" />
              {isPending ? "Processing..." : "Collect & Send Receipt"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Dot colour per payment rail — the same mapping the transactions table uses,
 * so mode is scannable without reading the label.
 */
const PAYMENT_MODE_DOT: Record<PatientPaymentMethod, string> = {
  cash: "bg-status-success",
  card: "bg-status-info",
  jazzcash: "bg-orange-500",
  easypaisa: "bg-emerald-500",
  bank_transfer: "bg-violet-500",
  upi: "bg-slate-400",
  waive: "bg-text-muted",
};