"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Percent, Plus, Search, UserPlus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { createPatientBillAction, collectPatientPaymentAction } from "@/lib/actions/patient-billing";
import { searchPatientsAction } from "@/lib/actions/patient-search";
import { createPatientAndGetIdAction } from "@/lib/actions/patients";
import {
  listClinicDoctorsAction,
  type ClinicDoctorOption,
} from "@/lib/actions/doctors";
import { currencySymbol, formatCurrency } from "@/lib/utils/currency";
import type { PatientPaymentMethodUI } from "@/types/database";

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  custom: boolean;
}

interface PatientResult {
  id: string;
  name: string;
  phone: string | null;
}

interface AddBillService {
  id: string;
  name: string;
  price: number;
}

interface CreateBillModalProps {
  /** Today as a naive `YYYY-MM-DD` in the clinic timezone — default bill date. */
  today: string;
  currency?: string;
  services: AddBillService[];
  onClose: () => void;
}

const BILL_TYPES = ["consultation", "procedure", "other"] as const;
type BillType = (typeof BILL_TYPES)[number];

const CUSTOM_SENTINEL = "__custom_item__";

const PAYMENT_METHODS: {
  id: PatientPaymentMethodUI;
  label: string;
  icon: string;
}[] = [
  { id: "cash", label: "Cash", icon: "💵" },
  { id: "card", label: "Card", icon: "💳" },
  { id: "bank_transfer", label: "Bank Transfer", icon: "🏦" },
  { id: "jazzcash", label: "JazzCash", icon: "📱" },
];

/**
 * "Create New Bill" modal — a manual bill, not linked to an appointment.
 * Mirrors the reference layout in docs/create new bill.html but on the app's
 * teal design system, wired to createPatientBillAction + collectPaymentAction.
 */
export function CreateBillModal({
  today,
  currency = "PKR",
  services,
  onClose,
}: CreateBillModalProps) {
  const [selectedPatient, setSelectedPatient] = useState<PatientResult | null>(null);
  const [phoneQuery, setPhoneQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PatientResult[]>([]);
  const [isSearching, startSearch] = useTransition();

  const [showAddPatient, setShowAddPatient] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [isAdding, startAdd] = useTransition();

  const [doctors, setDoctors] = useState<ClinicDoctorOption[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [billDate, setBillDate] = useState(today);
  const [billType, setBillType] = useState<BillType>("consultation");

  const [items, setItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unit_price: 0, custom: services.length === 0 },
  ]);
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const amountTouched = useRef(false);
  const [paymentMethod, setPaymentMethod] = useState<PatientPaymentMethodUI>("cash");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listClinicDoctorsAction().then((res) => {
      if (!cancelled && res.ok) setDoctors(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const subtotal = useMemo(
    () =>
      items.reduce((sum, i) => sum + i.quantity * Math.max(0, i.unit_price), 0),
    [items],
  );

  const discountPercent =
    discountType === "percent" ? Math.min(Number(discountValue) || 0, 100) : 0;
  const discountAmount =
    discountType === "amount" ? Math.min(Number(discountValue) || 0, subtotal) : 0;
  const numDiscount =
    discountType === "percent"
      ? (subtotal * discountPercent) / 100
      : discountAmount;
  const finalTotal = Math.max(0, Math.round((subtotal - numDiscount) * 100) / 100);

  // Keep "Amount Paid" in sync with the total until the user edits it by hand.
  useEffect(() => {
    if (!amountTouched.current) setAmountPaid(String(finalTotal));
  }, [finalTotal]);

  const amountPaidNum = Math.min(Math.max(Number(amountPaid) || 0, 0), finalTotal);
  const due = Math.max(0, Math.round((finalTotal - amountPaidNum) * 100) / 100);

  const payStatus: "paid" | "partial" | "unpaid" =
    finalTotal === 0 || amountPaidNum >= finalTotal
      ? "paid"
      : amountPaidNum > 0
        ? "partial"
        : "unpaid";

  const shouldCollect = finalTotal > 0 && amountPaidNum >= finalTotal;

  const handleSearch = useCallback(() => {
    if (phoneQuery.length < 2) {
      toast.error("Enter at least 2 characters to search.");
      return;
    }
    startSearch(async () => {
      const results = await searchPatientsAction(phoneQuery);
      setSearchResults(
        results.map((r) => ({ id: r.id, name: r.name, phone: r.phone })),
      );
    });
  }, [phoneQuery]);

  const handleAddPatient = useCallback(() => {
    if (!newName.trim()) {
      toast.error("Enter the patient's name.");
      return;
    }
    startAdd(async () => {
      const fd = new FormData();
      fd.set("name", newName.trim());
      fd.set("phone", newPhone.trim());
      fd.set("email", "");
      fd.set("notes", "");
      fd.set("dateOfBirth", "");
      const res = await createPatientAndGetIdAction(fd);
      if (res.ok && res.data) {
        setSelectedPatient({ id: res.data, name: newName.trim(), phone: newPhone.trim() || null });
        setShowAddPatient(false);
        setNewName("");
        setNewPhone("");
      } else {
        toast.error(res.ok ? "Could not find the new patient." : res.message);
      }
    });
  }, [newName, newPhone]);

  const updateItem = useCallback((idx: number, patch: Partial<LineItem>) => {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  }, []);

  const addItem = useCallback(
    (service?: AddBillService) => {
      setItems((prev) => [
        ...prev,
        service
          ? { description: service.name, quantity: 1, unit_price: service.price, custom: false }
          : { description: "", quantity: 1, unit_price: 0, custom: services.length === 0 },
      ]);
    },
    [services.length],
  );

  const removeItem = useCallback((idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedPatient?.id) {
        toast.error("Select a patient first.");
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(billDate)) {
        toast.error("Enter a valid bill date.");
        return;
      }
      const validItems = items
        .filter((i) => i.description.trim())
        .map((i) => ({
          description: i.description.trim(),
          quantity: Math.max(1, Math.trunc(i.quantity) || 1),
          unit_price: Math.max(0, Number(i.unit_price) || 0),
        }));
      if (validItems.length === 0) {
        toast.error("Add at least one line item.");
        return;
      }

      const fd = new FormData();
      fd.set("patientId", selectedPatient.id);
      fd.set("items", JSON.stringify(validItems));
      fd.set("bill_type", billType);
      fd.set("bill_date", billDate);
      if (doctorId) fd.set("doctorId", doctorId);
      if (notes.trim()) fd.set("notes", notes.trim());

      startTransition(async () => {
        const res = await createPatientBillAction(null, fd);
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        const billId = res.data;

        if (shouldCollect) {
          const payFd = new FormData();
          payFd.set("billId", billId);
          payFd.set("paymentMethod", paymentMethod);
          payFd.set("amount", finalTotal.toString());
          payFd.set("additionalCharges", "[]");
          payFd.set("discountAmount", discountAmount.toString());
          payFd.set("discountPercent", discountPercent.toString());
          const paid = await collectPatientPaymentAction(null, payFd);
          if (paid.ok) {
            toast.success(
              paid.data === "paid"
                ? "Bill created and payment collected."
                : `Payment collected. Receipt #${paid.data}`,
            );
          } else {
            toast.warning(`Bill created, but payment failed: ${paid.message}`);
          }
        } else if (finalTotal === 0) {
          toast.success("Bill created.");
        } else {
          toast.success("Bill created. Collect payment from Patient Billing.");
        }

        onClose();
      });
    },
    [
      selectedPatient,
      items,
      billType,
      billDate,
      doctorId,
      notes,
      shouldCollect,
      finalTotal,
      paymentMethod,
      discountAmount,
      discountPercent,
      onClose,
    ],
  );

  const serviceNames = useMemo(() => new Set(services.map((s) => s.name)), [services]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-[820px] flex-col overflow-hidden rounded-[20px] bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between bg-gradient-to-br from-primary to-teal-600 px-6 py-4 text-white">
          <div>
            <p className="text-base font-bold">Create New Bill</p>
            <p className="mt-0.5 text-xs opacity-75">
              Manual bill — not linked to an appointment.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/20 p-1.5 text-white transition-colors hover:bg-white/30"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <form
          id="create-bill-form"
          onSubmit={handleSubmit}
          className="min-h-0 flex-1 overflow-y-auto space-y-5 p-6"
        >
          {/* Top grid: Patient & Bill details */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Patient Details */}
            <div className="rounded-card bg-app p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
                Patient Details
              </p>

              {selectedPatient ? (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-control bg-surface p-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {selectedPatient.name}
                    </p>
                    {selectedPatient.phone && (
                      <p className="text-xs text-text-muted">{selectedPatient.phone}</p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedPatient(null);
                      setPhoneQuery("");
                      setSearchResults([]);
                    }}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <>
                  <div className="mt-3 space-y-2">
                    <Label className="text-xs">Search by phone or name</Label>
                    <div className="relative">
                      <Search
                        className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
                        aria-hidden="true"
                      />
                      <Input
                        placeholder="10-digit mobile or name"
                        value={phoneQuery}
                        onChange={(e) => setPhoneQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                        className="pl-8"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={handleSearch}
                        disabled={isSearching}
                      >
                        {isSearching ? "Searching..." : "Search"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setShowAddPatient(true);
                          setPhoneQuery("");
                          setSearchResults([]);
                        }}
                      >
                        <UserPlus className="mr-1.5 size-3.5" />
                        New patient
                      </Button>
                    </div>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {searchResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedPatient(p)}
                          className="flex w-full items-center gap-2 rounded-control border border-text-muted/30 bg-surface p-2 text-left text-sm transition-colors hover:bg-app"
                        >
                          <span className="font-medium text-text-primary">{p.name}</span>
                          {p.phone && <span className="text-text-muted">{p.phone}</span>}
                        </button>
                      ))}
                    </div>
                  )}

                  {phoneQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
                    <p className="mt-3 rounded-control border border-text-muted/20 bg-surface p-2 text-xs text-text-muted">
                      No patients found. Add a new patient to continue.
                    </p>
                  )}

                  {showAddPatient && (
                    <div className="mt-3 space-y-2 rounded-control border border-primary/30 bg-primary/5 p-3">
                      <p className="text-xs font-medium text-primary">Add new patient</p>
                      <Input
                        placeholder="Full name *"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                      />
                      <Input
                        placeholder="Phone"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="w-full"
                        onClick={handleAddPatient}
                        disabled={isAdding || !newName.trim()}
                      >
                        {isAdding ? "Adding..." : "Add & select"}
                      </Button>
                      <button
                        type="button"
                        onClick={() => setShowAddPatient(false)}
                        className="w-full text-center text-xs text-text-muted hover:text-text-primary"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Bill Details */}
            <div className="rounded-card bg-app p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
                Bill Details
              </p>
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Doctor (Optional)</Label>
                  <NativeSelect
                    value={doctorId}
                    onChange={(e) => setDoctorId(e.target.value)}
                  >
                    <option value="">No Doctor</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                        {d.specialty ? ` — ${d.specialty}` : ""}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Bill Date</Label>
                  <Input
                    type="date"
                    value={billDate}
                    onChange={(e) => setBillDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Bill Type</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {BILL_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setBillType(type)}
                        className={`rounded-pill border px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors ${
                          billType === type
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-text-muted/30 bg-surface text-text-secondary hover:bg-app"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
              Line Items
            </p>
            <div className="overflow-hidden rounded-card border border-text-muted/20">
              <div className="grid grid-cols-[minmax(0,1fr)_64px_96px_72px_28px] gap-1.5 bg-app px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-text-muted">
                <span className="text-left">Description</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit Price</span>
                <span className="text-right">Total</span>
                <span />
              </div>

              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[minmax(0,1fr)_64px_96px_72px_28px] items-center gap-1.5 border-t border-text-muted/10 px-3 py-2"
                >
                  {item.custom || services.length === 0 ? (
                    <Input
                      placeholder="Item description"
                      value={item.description}
                      onChange={(e) => updateItem(idx, { description: e.target.value })}
                    />
                  ) : (
                    <NativeSelect
                      value={
                        serviceNames.has(item.description)
                          ? item.description
                          : CUSTOM_SENTINEL
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === CUSTOM_SENTINEL) {
                          updateItem(idx, { custom: true });
                        } else {
                          const service = services.find((s) => s.name === v);
                          updateItem(idx, {
                            description: v,
                            unit_price: service ? service.price : item.unit_price,
                          });
                        }
                      }}
                    >
                      <option value={CUSTOM_SENTINEL}>Custom item...</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name} — {formatCurrency(s.price, currency)}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(idx, { quantity: Number(e.target.value) || 1 })
                    }
                    className="text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <div className="relative">
                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-text-muted">
                      {currencySymbol(currency)}
                    </span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unit_price || ""}
                      onChange={(e) =>
                        updateItem(idx, { unit_price: Number(e.target.value) || 0 })
                      }
                      className="pl-6 text-right"
                      placeholder="0"
                    />
                  </div>
                  <span className="text-right text-[13px] font-bold tabular-nums text-text-primary">
                    {formatCurrency(item.quantity * item.unit_price, currency)}
                  </span>
                  <div className="flex justify-end">
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="flex size-7 items-center justify-center rounded-lg border border-text-muted/15 text-text-muted transition-colors hover:text-status-destructive"
                        aria-label="Remove item"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <div className="border-t border-text-muted/10 px-3 py-2">
                <button
                  type="button"
                  onClick={() => addItem()}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary"
                >
                  <Plus className="size-3.5" />
                  Add Row
                </button>
              </div>
            </div>
          </div>

          {/* Discount */}
          <Collapsible className="overflow-hidden rounded-card border border-text-muted/20">
            <CollapsibleTrigger className="px-4 py-3">
              <Percent className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
              Apply Discount
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t border-text-muted/10 px-4 py-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDiscountType("amount");
                    setDiscountValue("");
                  }}
                  className={`rounded-control border px-2 py-1.5 text-xs font-medium transition-colors ${
                    discountType === "amount"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-text-muted/20 bg-surface text-text-secondary"
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
                  className={`rounded-control border px-2 py-1.5 text-xs font-medium transition-colors ${
                    discountType === "percent"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-text-muted/20 bg-surface text-text-secondary"
                  }`}
                >
                  % Percent
                </button>
              </div>
              <div className="mt-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={discountType === "percent" ? "e.g. 10" : "0.00"}
                />
              </div>
              {numDiscount > 0 && (
                <p className="mt-1.5 text-xs text-status-warning">
                  Discount: -{formatCurrency(numDiscount, currency)}
                </p>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Payment Amount */}
          <div className="rounded-card bg-app p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
              Payment Details
            </p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[13px] text-text-secondary">Total Amount</span>
              <span className="text-[15px] font-bold tabular-nums text-text-primary">
                {formatCurrency(subtotal, currency)}
              </span>
            </div>
            <div className="mt-3 space-y-1.5">
              <Label className="text-xs">Amount Paid</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-text-muted">
                  {currencySymbol(currency)}
                </span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountPaid}
                  onChange={(e) => {
                    amountTouched.current = true;
                    setAmountPaid(e.target.value);
                  }}
                  placeholder="0"
                  className="pl-8 text-sm font-bold"
                />
              </div>
              <p className="text-[11px] text-text-muted">
                Leave at 0 to save the bill unpaid and collect later.
              </p>
            </div>
          </div>

          {/* Summary Breakdown */}
          <div className="rounded-card bg-app p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary">Subtotal</span>
              <span className="text-xs font-medium tabular-nums text-text-primary">
                {formatCurrency(subtotal, currency)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-text-muted/15 pt-3">
              <span className="text-sm font-bold text-text-primary">Final Total</span>
              <span className="text-2xl font-extrabold tracking-tight tabular-nums text-text-primary">
                {formatCurrency(finalTotal, currency)}
              </span>
            </div>
            <div className="mt-3 flex flex-col gap-2.5 border-t border-dashed border-text-muted/30 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">Amount Paid</span>
                <span className="text-[13px] font-bold tabular-nums text-status-success">
                  {formatCurrency(amountPaidNum, currency)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-status-success/30 bg-status-success/10 px-3 py-2">
                <span className="text-[13px] font-semibold text-status-success">
                  Due Amount
                </span>
                <span className="text-[15px] font-extrabold tabular-nums text-status-success">
                  {formatCurrency(due, currency)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">Payment Status</span>
                <Badge
                  variant={
                    payStatus === "paid" ? "success" : payStatus === "partial" ? "warning" : "default"
                  }
                  className={`rounded-pill ${
                    payStatus === "unpaid" ? "bg-orange-50 text-orange-700" : ""
                  }`}
                >
                  {payStatus === "paid" ? "Paid" : payStatus === "partial" ? "Partial" : "Unpaid"}
                </Badge>
              </div>
            </div>
          </div>

          {/* Payment Mode */}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
              Payment Mode
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PAYMENT_METHODS.map((method) => {
                const isSelected = paymentMethod === method.id;
                return (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setPaymentMethod(method.id)}
                    className={`flex flex-col items-center gap-1 rounded-control border-2 px-2 py-2.5 text-xs font-semibold transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-text-muted/20 bg-surface text-text-secondary hover:border-text-muted/40"
                    }`}
                  >
                    <span className="text-lg leading-none" aria-hidden="true">
                      {method.icon}
                    </span>
                    {method.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional billing notes"
              maxLength={500}
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex shrink-0 gap-2 border-t border-text-muted/15 bg-surface px-6 py-4">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-bill-form"
            className="flex-[2]"
            disabled={isPending}
          >
            <Check className="mr-1.5 size-4" aria-hidden="true" />
            {isPending ? "Creating..." : "Create Bill"}
          </Button>
        </div>
      </div>
    </div>
  );
}