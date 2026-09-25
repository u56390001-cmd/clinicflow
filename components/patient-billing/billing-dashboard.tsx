"use client";

import { useState, useMemo } from "react";
import { Banknote, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { CollectPaymentModal } from "@/components/patient-billing/collect-payment-modal";
import { NewBillModal } from "@/components/patient-billing/new-bill-modal";
import {
  PATIENT_BILL_STATUS_META,
} from "@/lib/constants";
import { formatCurrency } from "@/lib/utils/currency";
import type {
  PatientBill,
} from "@/types/database";

type BillRow = PatientBill & {
  patients: { name: string; phone: string | null } | null;
  patient_bill_items: { id: string }[];
  receipts: { id: string; receipt_number: number }[];
};

interface BillingDashboardProps {
  bills: BillRow[];
}

export function BillingDashboard({ bills }: BillingDashboardProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [collectModalBillId, setCollectModalBillId] = useState<string | null>(null);
  const [showNewBill, setShowNewBill] = useState(false);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return bills.filter((bill) => {
      const patientName = bill.patients?.name?.toLowerCase() ?? "";
      const matchesSearch =
        !needle ||
        patientName.includes(needle) ||
        (bill.bill_number?.toLowerCase().includes(needle) ?? false) ||
        (bill.patients?.phone?.includes(needle) ?? false);
      const matchesStatus =
        statusFilter === "all" || bill.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [bills, search, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Patient Billing</h1>
          <p className="text-sm text-text-muted">
            Manage patient bills and payment collection.
          </p>
        </div>
        <Button onClick={() => setShowNewBill(true)}>
          <Plus className="mr-2 size-4" />
          New Bill
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <Input
            placeholder="Search patient, phone, or bill number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <NativeSelect
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-40"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="partially_paid">Partial</option>
          <option value="waived">Waived</option>
          <option value="cancelled">Cancelled</option>
        </NativeSelect>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="No bills found"
          description={
            search || statusFilter !== "all"
              ? "Try adjusting your search or filter."
              : "Create a patient bill to get started."
          }
        />
      ) : (
        <div className="grid gap-4">
          {filtered.map((bill) => {
            const meta = PATIENT_BILL_STATUS_META[bill.status];
            return (
              <Card key={bill.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">
                        {bill.patients?.name ?? "Unknown Patient"}
                      </p>
                      <Badge className={meta?.badge ?? ""}>
                        {meta?.label ?? bill.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-text-muted">
                      {bill.bill_number ? `${bill.bill_number} · ` : ""}
                      {bill.patient_bill_items.length} item
                      {bill.patient_bill_items.length !== 1 ? "s" : ""}
                      {bill.receipts.length > 0
                        ? ` · Receipt #${bill.receipts[0].receipt_number}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-lg font-semibold tabular-nums">
                      {formatCurrency(bill.total_amount, bill.currency)}
                    </p>
                    {bill.status === "pending" && (
                      <Button
                        size="sm"
                        onClick={() => setCollectModalBillId(bill.id)}
                      >
                        Collect Payment
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {collectModalBillId && (
        <CollectPaymentModal
          billId={collectModalBillId}
          onClose={() => setCollectModalBillId(null)}
        />
      )}
      {showNewBill && (
        <NewBillModal onClose={() => setShowNewBill(false)} />
      )}
    </div>
  );
}
