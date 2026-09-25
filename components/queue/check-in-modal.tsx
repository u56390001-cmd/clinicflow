"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  ChevronDown,
  CircleUser,
  FileText,
  Pencil,
  Phone,
  Plus,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkInPatientAction, type CheckInResult } from "@/lib/actions/queue";
import { VitalsForm } from "@/components/queue/vitals-form";
import { ReceiptGeneratedModal } from "@/components/queue/receipt-generated-modal";
import { useDoctorVitalsConfig } from "@/hooks/use-doctor-vitals-config";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import type { ActionResult } from "@/types";
import type { QueueAppointment } from "@/lib/visits-queries";
import type { DoctorVitalsConfigMap } from "@/lib/vitals-config";

/**
 * Payment Mode tiles (2×2 grid, Pakistani rails only — UPI is out of market).
 * Reference markup style: coloured dot + label + subtitle + check-on-active.
 */
const PAYMENT_TILES = [
  { key: "cash", label: "Cash", subtitle: "Physical cash" },
  { key: "card", label: "Card", subtitle: "Debit / Credit" },
  { key: "waive", label: "Waive", subtitle: "No charge" },
] as const;

/**
 * Check-in modal — 3-column layout matching the reference structure:
 * 1. Patient Confirmation (left)
 * 2. Collect Payment (middle) — Cash/Card/Waive tiles
 * 3. Billing Add-ons (right) — Additional Charges + Apply Discount accordions
 *
 * Bottom bar: Total (left), Collect Payment (outline) + Check In (solid green).
 * After successful Collect Payment: Receipt Generated modal (real bill data).
 */
export function CheckInModal({
  appointment,
  onClose,
  vitalsConfigs,
}: {
  appointment: QueueAppointment;
  onClose: () => void;
  /** Server-fetched doctor → vitals config map; skips the client fetch. */
  vitalsConfigs?: DoctorVitalsConfigMap | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const paymentStatusRef = useRef<HTMLInputElement>(null);
  const [state, formAction, isPending] = useActionState<
    ActionResult<CheckInResult> | null,
    FormData
  >(checkInPatientAction, null);

  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [consultationFee, setConsultationFee] = useState<string>(
    appointment.servicePrice > 0 ? String(appointment.servicePrice) : "",
  );
  const [feeEditing, setFeeEditing] = useState(false);

  // Additional charges state
  const [chargeDesc, setChargeDesc] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [additionalCharges, setAdditionalCharges] = useState<
    { description: string; amount: number }[]
  >([]);

  // Discount state
  const [discountType, setDiscountType] = useState<"amount" | "percent">(
    "amount",
  );
  const [discountValue, setDiscountValue] = useState("");

  // Payment intent: when true, a payment (cash/card) will be persisted on
  // check-in. Waive marks the visit as no-payment.
  const [collectingPayment, setCollectingPayment] = useState(false);

  // Receipt modal state — populated from the persisted payment result.
  const [showReceipt, setShowReceipt] = useState(false);

  const hasExistingVisit = !!appointment.visit;
  const vitalsConfig = useDoctorVitalsConfig(
    appointment.doctor_id,
    vitalsConfigs,
  );

  // After successful check-in, refresh once and (when a payment was collected)
  // open the persisted receipt. `handledRef` keeps the effect single-shot —
  // the parent re-renders after `router.refresh()`, which would otherwise
  // re-run this effect (and any toast it fired) on every render.
  const handledRef = useRef(false);
  useEffect(() => {
    if (!state?.ok || handledRef.current) return;
    handledRef.current = true;
    router.refresh();
    const wantReceipt =
      collectingPayment && paymentMethod !== "waive" && !!state.data?.receiptNumber;
    if (wantReceipt) {
      // Show the persisted receipt before closing; it closes on its own button.
      setShowReceipt(true);
    } else {
      onClose();
    }
  }, [state, router, onClose, collectingPayment, paymentMethod]);

  const fee = Number(consultationFee) || 0;
  const chargesTotal = additionalCharges.reduce((s, c) => s + c.amount, 0);
  const subtotal = fee + chargesTotal;
  const discVal = Number(discountValue) || 0;
  const discountAmount =
    discountType === "percent" ? (subtotal * discVal) / 100 : discVal;
  const totalAmount = Math.max(0, subtotal - discountAmount);

  const handleAddCharge = () => {
    if (!chargeDesc.trim() || !chargeAmount) return;
    setAdditionalCharges((prev) => [
      ...prev,
      { description: chargeDesc.trim(), amount: Number(chargeAmount) },
    ]);
    setChargeDesc("");
    setChargeAmount("");
  };

  const handleCollectPayment = () => {
    // Submit with the payment collected so the server persists the bill +
    // payment and we can show the persisted receipt. Waive still check-in but
    // marks the visit as no-payment.
    setCollectingPayment(true);
    setShowReceipt(false);
    if (paymentStatusRef.current) {
      paymentStatusRef.current.value =
        paymentMethod === "waive" ? "not_required" : "collected_pre";
    }
    formRef.current?.requestSubmit();
  };

  const handleCheckIn = () => {
    // Submit without collecting payment now — the visit is created with a
    // pending payment status.
    setCollectingPayment(false);
    if (paymentStatusRef.current) {
      paymentStatusRef.current.value =
        paymentMethod === "waive" ? "not_required" : "pending";
    }
    formRef.current?.requestSubmit();
  };

  const timeRange = `${new Date(appointment.start_time).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })} - ${new Date(appointment.end_time).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-secondary/50 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-label={`Check in ${appointment.patientName}`}
    >
      <div className="relative flex max-h-[95vh] w-full max-w-5xl animate-scale-in flex-col overflow-hidden rounded-2xl bg-white shadow-2xl md:max-h-[90vh]">
        {/* Header — teal gradient (substitutes reference #4E5DB5/#5B6BC5) */}
        <div className="relative flex-shrink-0 bg-gradient-to-r from-primary to-primary-light p-6 text-white">
          <div className="absolute inset-0 bg-black/5" aria-hidden="true" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center space-x-4">
              <div className="flex-shrink-0 rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <CircleUser className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold">
                  {hasExistingVisit ? "Patient Already Checked In" : "Check In Patient"}
                </h2>
                <p className="mt-0.5 text-sm text-white/80">
                  {appointment.patientName}
                  <span className="ml-1 opacity-80">
                    ·{" "}
                    {hasExistingVisit
                      ? `Token #${appointment.visit!.token_number} assigned`
                      : `${appointment.serviceName} · Token will be assigned`}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/20 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
                {hasExistingVisit ? "Returning Patient" : "First Visit"}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-2 transition-all duration-200 hover:bg-white/20 group"
                aria-label="Close"
              >
                <X className="h-5 w-5 transition-transform duration-200 group-hover:rotate-90" />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-app">
          <div className="space-y-4 p-6 pb-2">
            {hasExistingVisit ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-xl bg-status-success/10 p-3">
                  <CheckCircle
                    className="h-5 w-5 shrink-0 text-status-success"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-text-primary">
                    This patient is already checked in. Token #
                    {appointment.visit!.token_number} &mdash; Queue position{" "}
                    {appointment.visit!.queue_position}.
                  </p>
                </div>
                {appointment.visit && (
                  <VitalsForm
                    visitId={appointment.visit.id}
                    existingVitals={appointment.vitals}
                    config={
                      vitalsConfig.status === "ready" ? vitalsConfig.config : undefined
                    }
                    configLoading={vitalsConfig.status === "loading"}
                  />
                )}
              </div>
            ) : (
              <form ref={formRef} action={formAction} className="space-y-5">
                <input
                  type="hidden"
                  name="appointmentId"
                  value={appointment.id}
                />
                <input
                  type="hidden"
                  name="paymentMethod"
                  value={paymentMethod}
                />
                <input
                  ref={paymentStatusRef}
                  type="hidden"
                  name="paymentStatus"
                  value={
                    collectingPayment && paymentMethod !== "waive"
                      ? "collected_pre"
                      : paymentMethod === "waive"
                        ? "not_required"
                        : "pending"
                  }
                />
                <input
                  type="hidden"
                  name="consultationFee"
                  value={String(fee)}
                />
                <input
                  type="hidden"
                  name="selectedAddOns"
                  value={JSON.stringify(additionalCharges)}
                />
                <input
                  type="hidden"
                  name="discountAmount"
                  value={String(discountAmount)}
                />

                {/* 3-column grid */}
                <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
                  {/* ─── Column 1: Patient Confirmation ─── */}
                  <div className="h-full rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <span className="rounded-lg bg-primary/10 p-1.5">
                        <CircleUser className="h-4 w-4 text-primary" aria-hidden="true" />
                      </span>
                      Patient Confirmation
                    </h3>

                    <div className="space-y-4">
                      {/* Avatar + name */}
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-light text-base font-bold text-white">
                          {appointment.patientName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-gray-900">
                            {appointment.patientName}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-400">
                            {appointment.patientAge != null
                              ? `Age ${appointment.patientAge}`
                              : ""}
                            {appointment.patientAge != null && appointment.patientCity
                              ? " · "
                              : ""}
                            {appointment.patientCity ?? ""}
                          </p>
                        </div>
                      </div>

                      {/* Phone */}
                      {appointment.patientPhone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" aria-hidden="true" />
                          <span className="text-sm font-semibold text-gray-700">
                            {appointment.patientPhone}
                          </span>
                        </div>
                      )}

                      {/* Patient ID */}
                      <div className="flex items-center gap-2">
                        <span className="w-14 flex-shrink-0 text-xs font-medium uppercase tracking-wide text-gray-400">
                          ID
                        </span>
                        <span className="text-xs font-semibold text-primary">
                          {appointment.patientCode ?? "—"}
                        </span>
                      </div>

                      {/* Source / Doctor / Service / Time */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="w-14 flex-shrink-0 text-xs font-medium uppercase tracking-wide text-gray-400">
                            Source
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                            <CircleUser className="h-3 w-3" aria-hidden="true" />
                            {appointment.booking_source ?? "Walk-in"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-14 flex-shrink-0 text-xs font-medium uppercase tracking-wide text-gray-400">
                            Doctor
                          </span>
                          <span className="text-xs font-semibold text-gray-700">
                            {appointment.doctorName ?? "Clinic Default"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-14 flex-shrink-0 text-xs font-medium uppercase tracking-wide text-gray-400">
                            Service
                          </span>
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                            {appointment.serviceName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-14 flex-shrink-0 text-xs font-medium uppercase tracking-wide text-gray-400">
                            Time
                          </span>
                          <span className="text-xs font-semibold text-gray-700">
                            {timeRange}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ─── Column 2: Collect Payment ─── */}
                  <div className="h-full rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <span className="rounded-lg bg-primary/10 p-1.5">
                        <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
                      </span>
                      Collect Payment
                    </h3>

                    <div className="space-y-4">
                      {/* Consultation fee */}
                      <div>
                        <Label
                          htmlFor="consultationFee"
                          className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500"
                        >
                          Consultation Fee
                        </Label>
                        {feeEditing ? (
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                              Rs.
                            </span>
                            <Input
                              id="consultationFee"
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              value={consultationFee}
                              onChange={(e) => setConsultationFee(e.target.value)}
                              className="h-12 rounded-xl border-2 border-primary pl-10 text-lg font-bold"
                            />
                            <button
                              type="button"
                              onClick={() => setFeeEditing(false)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-primary"
                            >
                              Done
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setFeeEditing(true)}
                            title="Click to edit"
                            className="group flex w-full cursor-pointer items-center justify-between rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-3 transition-all duration-200 hover:border-primary"
                          >
                            <span className="text-2xl font-bold text-gray-900">
                              Rs. {fee > 0 ? fee.toLocaleString() : "0.00"}
                            </span>
                            <span className="flex items-center gap-1.5 text-gray-400 transition-colors group-hover:text-primary">
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              <span className="text-xs font-medium">Edit</span>
                            </span>
                          </button>
                        )}
                        <p className="mt-1.5 text-xs text-gray-400">
                          Default fee for {appointment.doctorName ?? appointment.serviceName}
                        </p>
                      </div>

                      {/* Payment Mode — 2×2 tiles (Pakistani rails only) */}
                      <div>
                        <Label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Payment Mode
                        </Label>
                        <div className="grid grid-cols-2 gap-2">
                          {PAYMENT_TILES.map((tile) => {
                            const active = paymentMethod === tile.key;
                            return (
                              <button
                                key={tile.key}
                                type="button"
                                onClick={() => setPaymentMethod(tile.key)}
                                className={`flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left transition-all duration-150 ${
                                  active
                                    ? "border-primary bg-primary/10"
                                    : "border-gray-200 bg-white hover:border-gray-300"
                                }`}
                              >
                                <span
                                  className={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${
                                    active ? "bg-primary" : "bg-gray-300"
                                  }`}
                                  aria-hidden="true"
                                />
                                <div className="min-w-0">
                                  <p
                                    className={`text-xs font-bold leading-none ${
                                      active ? "text-primary" : "text-gray-600"
                                    }`}
                                  >
                                    {tile.label}
                                  </p>
                                  <p className="mt-0.5 text-[10px] leading-none text-gray-400">
                                    {tile.subtitle}
                                  </p>
                                </div>
                                {active && (
                                  <span className="ml-auto flex-shrink-0">
                                    <svg
                                      className="h-3.5 w-3.5 text-primary"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                      aria-hidden="true"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={3}
                                        d="M5 13l4 4L19 7"
                                      />
                                    </svg>
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ─── Column 3: Billing Add-ons ─── */}
                  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    {/* Accordion 1: Additional Charges */}
                    <Collapsible>
                      <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between text-sm font-semibold text-gray-900">
                        <span className="flex items-center gap-2">
                          <span className="rounded-lg bg-primary/10 p-1.5">
                            <Plus className="h-4 w-4 text-primary" aria-hidden="true" />
                          </span>
                          Additional Charges
                        </span>
                        <ChevronDown
                          className="h-4 w-4 text-gray-400 transition-transform duration-200 data-[state=open]:rotate-180"
                          aria-hidden="true"
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3">
                        <div className="space-y-2">
                          {/* Existing charges */}
                          {additionalCharges.map((c, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5 text-xs"
                            >
                              <span className="truncate text-gray-700">
                                {c.description}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  Rs. {c.amount.toLocaleString()}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setAdditionalCharges((prev) =>
                                      prev.filter((_, j) => j !== i),
                                    )
                                  }
                                  className="text-gray-400 hover:text-status-destructive"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                          {/* Add charge form */}
                          <div className="flex gap-1.5">
                            <Input
                              placeholder="Description"
                              value={chargeDesc}
                              onChange={(e) => setChargeDesc(e.target.value)}
                              className="h-8 flex-1 text-xs"
                            />
                            <Input
                              type="number"
                              min="0"
                              placeholder="Amount"
                              value={chargeAmount}
                              onChange={(e) => setChargeAmount(e.target.value)}
                              className="h-8 w-20 text-xs"
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={handleAddCharge}
                              className="h-8 px-2"
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {/* Accordion 2: Apply Discount (nested bordered box) */}
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <div className="overflow-hidden rounded-xl border border-gray-100">
                        <Collapsible>
                          <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-amber-50">
                            <span className="flex items-center gap-1.5">
                              <span className="text-base text-amber-500">%</span>
                              Apply Discount
                            </span>
                            <ChevronDown
                              className="h-4 w-4 text-gray-400 transition-transform duration-200 data-[state=open]:rotate-180"
                              aria-hidden="true"
                            />
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-2 px-4 pb-3 pt-2">
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => setDiscountType("amount")}
                                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                  discountType === "amount"
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-gray-200 text-gray-500"
                                }`}
                              >
                                Rs. Fixed
                              </button>
                              <button
                                type="button"
                                onClick={() => setDiscountType("percent")}
                                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                  discountType === "percent"
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-gray-200 text-gray-500"
                                }`}
                              >
                                % Percent
                              </button>
                            </div>
                            <Input
                              type="number"
                              min="0"
                              placeholder={
                                discountType === "percent"
                                  ? "e.g. 10"
                                  : "e.g. 500"
                              }
                              value={discountValue}
                              onChange={(e) => setDiscountValue(e.target.value)}
                              className="h-8 text-xs"
                            />
                            {discountAmount > 0 && (
                              <p className="text-xs text-status-success">
                                Discount: - Rs. {discountAmount.toLocaleString()}
                              </p>
                            )}
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Error */}
                {state && !state.ok && (
                  <p className="text-xs text-status-destructive">{state.message}</p>
                )}
              </form>
            )}
          </div>
        </div>

        {/* Bottom Action Bar — Total (left) + Collect Payment / Check In (right) */}
        {!hasExistingVisit && (
          <div className="flex-shrink-0 border-t border-gray-200 bg-white px-6 py-4">
            <div className="flex items-center justify-between">
              {/* Left: Total Amount */}
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-700">
                    Total Amount:
                  </span>
                  <span className="text-xl font-bold text-primary">
                    Rs. {totalAmount.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Right: Action buttons */}
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCollectPayment}
                  disabled={isPending}
                  className="gap-2 rounded-xl border-2 border-primary bg-white px-5 py-2.5 font-semibold text-primary hover:bg-primary/5"
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  {isPending
                    ? "Processing..."
                    : paymentMethod === "waive"
                      ? "Waive & Check In"
                      : "Collect Payment"}
                </Button>
                <Button
                  type="button"
                  onClick={handleCheckIn}
                  disabled={isPending}
                  className="gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 px-6 py-2.5 font-semibold text-white shadow-lg hover:from-emerald-600 hover:to-green-600 hover:shadow-xl"
                >
                  <CircleUser className="h-4 w-4" aria-hidden="true" />
                  {isPending ? "Checking in..." : "Check In"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Receipt Generated Modal — shows the persisted payment after check-in */}
      <ReceiptGeneratedModal
        open={showReceipt}
        onClose={() => {
          setShowReceipt(false);
          onClose();
        }}
        patientName={appointment.patientName}
        tokenNumber={state?.ok ? state.data.tokenNumber : appointment.visit?.token_number ?? 0}
        doctorName={appointment.doctorName ?? "Clinic Default"}
        appointmentDate={appointment.start_time}
        clinicName={state?.ok ? state.data.clinicName ?? "" : ""}
        clinicAddress={state?.ok ? state.data.clinicAddress : null}
        billId={
          state?.ok && state.data.billNumber
            ? state.data.billNumber
            : `bill-${Date.now()}`
        }
        lineItems={[
          { description: "Consultation Fee", amount: fee },
          ...additionalCharges.map((c) => ({
            description: c.description,
            amount: c.amount,
          })),
          ...(discountAmount > 0
            ? [{ description: "Discount", amount: -discountAmount }]
            : []),
        ]}
        totalAmount={totalAmount}
        paymentMethod={paymentMethod}
        paidAt={state?.ok && state.data.paidAt ? state.data.paidAt : new Date().toISOString()}
        patientWhatsappNumber={appointment.patientPhone}
      />
    </div>
  );
}
