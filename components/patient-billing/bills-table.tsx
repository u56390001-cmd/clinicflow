"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Clock,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { BillRowActions } from "@/components/patient-billing/bill-row-actions";
import { BillDetailsModal } from "@/components/patient-billing/bill-details-modal";
import { CollectPaymentModal } from "@/components/patient-billing/collect-payment-modal";
import { CreateBillModal } from "@/components/patient-billing/create-bill-modal";
import {
  ReceiptPreview,
  type ReceiptOverride,
} from "@/components/patient-billing/receipt-preview";
import {
  PATIENT_BILL_STATUS_META,
  PATIENT_BILL_TYPE_META,
  PATIENT_PAYMENT_METHOD_META,
} from "@/lib/constants";
import type { PatientBillListRow } from "@/lib/patient-billing-queries";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import { DEFAULT_CURRENCY, formatCurrency } from "@/lib/utils/currency";
import { formatNaiveDate, formatNaiveTime, addDaysToNaive } from "@/lib/utils/datetime";
import type {
  PatientBillStatus,
  PatientPayment,
  PatientPaymentMethod,
} from "@/types/database";

/**
 * Billing transactions table (Phase 6).
 *
 * Replaces the card list: eight columns, so a receptionist scanning for one
 * unpaid bill reads down a single column instead of across twenty cards. Below
 * `md` it falls back to cards rather than a horizontally scrolling table —
 * an eight-column table on a phone is a table nobody can read.
 *
 * Every filter is client-side. `fetchPatientBills` already returns the clinic's
 * most recent `BILL_LIST_LIMIT` bills in one query, so narrowing by scope,
 * status or search is a pure array operation with no round trip. `truncated`
 * carries the fact that a cap was hit — without it "All Bills" would quietly
 * look like the clinic's whole history.
 */

/** Which slice of the list the pills expose. Intersected with `statusFilter`. */
type BillScope = "today" | "all" | "pending";

const SCOPE_LABELS: Record<BillScope, string> = {
  today: "Today",
  all: "All Bills",
  pending: "Pending",
};

const SCOPE_ORDER: readonly BillScope[] = ["today", "all", "pending"];

/**
 * Dot colour per payment rail, so MODE is scannable without reading the label.
 *
 * Keyed on the full DB enum rather than `PATIENT_PAYMENT_METHODS_UI` because
 * this renders *historical* rows: a bill collected before decision D8 may carry
 * `upi`, and a row that cannot resolve a colour would render a bare label.
 * Offering `upi` in a picker is the thing that is forbidden — displaying one
 * that already exists is not.
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

export interface BillsTableProps {
  bills: PatientBillListRow[];
  /** True when the clinic has more bills than `BILL_LIST_LIMIT`. */
  truncated: boolean;
  /** Clinic IANA timezone — `timestamptz` columns render on the clinic's clock. */
  timezone: string;
  /**
   * Today as a naive `YYYY-MM-DD` in the clinic's timezone, resolved on the
   * server. Deliberately a prop and not `clinicToday()` called here: computing
   * it in the browser would read the *viewer's* clock during hydration and
   * disagree with the server render across a midnight boundary.
   */
  today: string;
  /** Active clinic services for the Create Bill modal's line-item picker. */
  services: { id: string; name: string; price: number }[];
  clinic: { name: string; address: string | null; phone: string | null };
}

export function BillsTable({
  bills,
  truncated,
  timezone,
  today,
  services,
  clinic,
}: BillsTableProps) {
  const router = useRouter();
  const [scope, setScope] = useState<BillScope>("today");
  const [statusFilter, setStatusFilter] = useState<PatientBillStatus | "all">(
    "all",
  );
  const [search, setSearch] = useState("");
  const [detailsBillId, setDetailsBillId] = useState<string | null>(null);
  const [receiptBillId, setReceiptBillId] = useState<string | null>(null);
  const [collectBillId, setCollectBillId] = useState<string | null>(null);
  const [showNewBill, setShowNewBill] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  /**
   * Facts about a payment that was collected a moment ago, keyed to the bill it
   * was taken against. The list rows arrive from the server, so a fresh payment
   * is not in `bills` until the refresh lands — this carries the receipt number,
   * amount and rail straight into the receipt popup that opens on success.
   */
  const [pendingReceipt, setPendingReceipt] = useState<{
    billId: string;
    override: ReceiptOverride;
  } | null>(null);

  /**
   * Search and status applied, scope not yet. The pill counts are computed from
   * this set so a badge always states how many rows that pill would actually
   * show under the current query — a count that ignored the search box would
   * promise rows the click cannot deliver.
   */
  const queryMatched = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return bills.filter((bill) => {
      if (statusFilter !== "all" && bill.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        (bill.patients?.name?.toLowerCase().includes(needle) ?? false) ||
        (bill.patients?.phone?.toLowerCase().includes(needle) ?? false) ||
        (bill.bill_number?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [bills, search, statusFilter]);

  const counts = useMemo(
    () => ({
      today: queryMatched.filter((bill) => billLocalDate(bill) === today).length,
      all: queryMatched.length,
      pending: queryMatched.filter(isPendingBill).length,
    }),
    [queryMatched, today],
  );

  const visible = useMemo(
    () => queryMatched.filter((bill) => inScope(bill, scope, today)),
    [queryMatched, scope, today],
  );

  /**
   * Bottom-of-dashboard summary across ALL loaded bills (not the scoped
   * `visible` slice): how many bills exist, what they total, how much has been
   * collected, and what is still owed. Currency is taken from the first bill so
   * a mixed bag still renders totals under one symbol.
   */
  const summary = useMemo(() => {
    const currency = bills[0]?.currency ?? DEFAULT_CURRENCY;
    const totalAmount = bills.reduce(
      (sum, bill) => sum + (Number(bill.total_amount) || 0),
      0,
    );
    const paid = bills.reduce(
      (sum, bill) =>
        sum + bill.patient_payments.reduce((s, p) => s + (Number(p.amount) || 0), 0),
      0,
    );
    return {
      totalBills: bills.length,
      totalAmount,
      paid,
      pending: Math.max(0, totalAmount - paid),
      currency,
    };
  }, [bills]);

  /**
   * The four KPI cards under the heading. Everything derives client-side from
   * the loaded `bills`, so the numbers share the same "all loaded bills" scope
   * as the Summary bar (a clinic past `BILL_LIST_LIMIT` sees the most recent
   * 500, not its full history).
   *
   * Payments are attributed by their `collected_at` instant converted to the
   * clinic's clock — the same rule the table uses to label TIME, so "today"
   * and "this month" mean the clinic's day and month, not the viewer's.
   */
  const kpis = useMemo(() => {
    const currency = bills[0]?.currency ?? DEFAULT_CURRENCY;
    const yesterday = addDaysToNaive(today, -1);
    const monthPrefix = today.slice(0, 7);
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const monthLabel =
      `${months[Number(today.slice(5, 7)) - 1] ?? ""} ${today.slice(0, 4)}`.trim();

    let collectedToday = 0;
    let collectedYesterday = 0;
    let collectedThisMonth = 0;
    let billsToday = 0;

    for (const bill of bills) {
      if (billLocalDate(bill) === today) billsToday += 1;
      for (const payment of bill.patient_payments) {
        const collected = utcIsoToClinicLocalInput(
          payment.collected_at,
          timezone,
        ).slice(0, 10);
        const amount = Number(payment.amount) || 0;
        if (collected === today) collectedToday += amount;
        if (collected === yesterday) collectedYesterday += amount;
        if (collected.startsWith(monthPrefix)) collectedThisMonth += amount;
      }
    }

    const pending = bills.reduce(
      (sum, bill) =>
        sum +
        Math.max(
          0,
          (Number(bill.total_amount) || 0) -
            bill.patient_payments.reduce(
              (s, p) => s + (Number(p.amount) || 0),
              0,
            ),
        ),
      0,
    );

    return {
      collectedToday,
      collectedYesterday,
      collectedThisMonth,
      billsToday,
      pending,
      currency,
      monthLabel,
    };
  }, [bills, today, timezone]);

  const detailsBill = detailsBillId
    ? (bills.find((bill) => bill.id === detailsBillId) ?? null)
    : null;
  const receiptBill = receiptBillId
    ? (bills.find((bill) => bill.id === receiptBillId) ?? null)
    : null;
  const collectBill = collectBillId
    ? (bills.find((bill) => bill.id === collectBillId) ?? null)
    : null;

  /**
   * The amount still owed on a bill — what the Collect Payment modal starts
   * with. For a pending bill that is the full total; a partially paid bill
   * has already collected some of it.
   */
  const outstandingFor = (bill: PatientBillListRow): number => {
    const paid = bill.patient_payments.reduce(
      (sum, payment) => sum + (Number(payment.amount) || 0),
      0,
    );
    return Math.max(0, (Number(bill.total_amount) || 0) - paid);
  };

  const filtersApplied = search.trim() !== "" || statusFilter !== "all";

  return (
    <div className="space-y-5">
      {/* KPI cards — today's collection, pending, bills created today,
          and the month's revenue at a glance. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Today's Collection"
          icon={Banknote}
          iconClassName="text-status-success"
          iconBgClassName="bg-status-success/15"
          value={formatCurrency(kpis.collectedToday, kpis.currency)}
          footer={
            <span
              className={`mt-2 flex items-center gap-0.5 text-[11px] font-medium ${
                kpis.collectedToday >= kpis.collectedYesterday
                  ? "text-status-success"
                  : "text-status-destructive"
              }`}
            >
              {kpis.collectedToday >= kpis.collectedYesterday ? (
                <ArrowUpRight className="size-3" aria-hidden="true" />
              ) : (
                <ArrowDownRight className="size-3" aria-hidden="true" />
              )}
              vs yesterday
            </span>
          }
        />
        <KpiCard
          label="Pending Amount"
          icon={Clock}
          iconClassName="text-status-warning"
          iconBgClassName="bg-status-warning/15"
          value={formatCurrency(kpis.pending, kpis.currency)}
        />
        <KpiCard
          label="Bills Today"
          icon={Receipt}
          iconClassName="text-primary"
          iconBgClassName="bg-primary/15"
          value={String(kpis.billsToday)}
          footer={
            <span className="mt-2 block text-[11px] font-medium text-text-muted">
              Total bills created
            </span>
          }
        />
        <KpiCard
          label="This Month's Revenue"
          icon={Wallet}
          iconClassName="text-violet-600"
          iconBgClassName="bg-violet-600/15"
          value={formatCurrency(kpis.collectedThisMonth, kpis.currency)}
          footer={
            <span className="mt-2 block text-[11px] font-medium text-text-muted">
              {kpis.monthLabel}
            </span>
          }
        />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Patient Billing
          </h1>
          <p className="text-sm text-text-muted">
            Manage patient bills and payment collection.
          </p>
        </div>
      </div>

      {/* Scope pills + right-aligned controls */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {SCOPE_ORDER.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={scope === key}
                  onClick={() => setScope(key)}
                  className={`inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-sm font-medium transition-colors ${
                    scope === key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-text-muted/30 text-text-secondary hover:bg-app"
                  }`}
                >
                  {SCOPE_LABELS[key]}
                  <span className="rounded-pill bg-text-muted/20 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-text-secondary">
                    {counts[key]}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <NativeSelect
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as PatientBillStatus | "all",
                  )
                }
                className="h-9 w-full sm:w-36"
              >
                <option value="all">All Status</option>
                {(
                  Object.keys(PATIENT_BILL_STATUS_META) as PatientBillStatus[]
                ).map((status) => (
                  <option key={status} value={status}>
                    {PATIENT_BILL_STATUS_META[status].label}
                  </option>
                ))}
              </NativeSelect>
              <Button
                variant="outline"
                size="icon"
                className="size-9 rounded-pill"
                onClick={() => startRefresh(() => router.refresh())}
                disabled={refreshing}
                aria-busy={refreshing}
                title="Refresh bills"
              >
                <RefreshCw
                  className={refreshing ? "animate-spin" : undefined}
                  aria-hidden="true"
                />
                <span className="sr-only">Refresh bills</span>
              </Button>
              <Button size="sm" onClick={() => setShowNewBill(true)}>
                <Plus aria-hidden="true" />
                Add Bill
              </Button>
            </div>
          </div>

          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Search bills"
              placeholder="Search patient, phone, or bill number…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title="No bills found"
              description={
                filtersApplied
                  ? "Nothing matches that search or status. Clear the filters to see every bill."
                  : scope === "today"
                    ? "No bills raised today yet. Switch to All Bills to see earlier transactions."
                    : "Create a patient bill to get started."
              }
            />
          ) : (
            <>
              {/* md and up: the table */}
              <div className="hidden overflow-hidden rounded-card border border-text-muted/20 md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-text-muted/20 bg-app text-left">
                      {[
                        "Patient",
                        "Service",
                        "Bill No",
                        "Time",
                        "Amount",
                        "Mode",
                        "Status",
                      ].map((label) => (
                        <th
                          key={label}
                          scope="col"
                          className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted"
                        >
                          {label}
                        </th>
                      ))}
                      <th
                        scope="col"
                        className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide text-text-muted"
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-text-muted/15">
                    {visible.map((bill) => {
                      const service = describeService(bill);
                      const when = describeTime(bill, timezone, today);
                      const payment = latestPayment(bill);
                      const status = PATIENT_BILL_STATUS_META[bill.status];
                      return (
                        <tr key={bill.id} className="bg-surface hover:bg-app/60">
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-text-primary">
                              {bill.patients?.name ?? "Unknown patient"}
                            </p>
                            {bill.patients?.phone && (
                              <p className="text-xs text-text-muted">
                                {bill.patients.phone}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="text-text-primary">
                              {service.primary}
                            </p>
                            {service.extra > 0 && (
                              <p className="text-xs text-text-muted">
                                +{service.extra} more
                              </p>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-text-secondary">
                            {bill.bill_number ?? (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <p className="tabular-nums text-text-primary">
                              {when.time}
                            </p>
                            {when.date && (
                              <p className="text-xs text-text-muted">
                                {when.date}
                              </p>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-semibold tabular-nums text-text-primary">
                            {formatCurrency(bill.total_amount, bill.currency)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <PaymentMode payment={payment} />
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge className={`ring-1 ${status.badge}`}>
                              {status.label}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5">
                            <BillRowActions
                              bill={bill}
                              onViewDetails={() => setDetailsBillId(bill.id)}
                              onPrintReceipt={() => setReceiptBillId(bill.id)}
                              onCollectPayment={() => setCollectBillId(bill.id)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* below md: cards */}
              <ul className="space-y-2 md:hidden">
                {visible.map((bill) => {
                  const service = describeService(bill);
                  const when = describeTime(bill, timezone, today);
                  const payment = latestPayment(bill);
                  const status = PATIENT_BILL_STATUS_META[bill.status];
                  return (
                    <li
                      key={bill.id}
                      className="rounded-card border border-text-muted/20 bg-surface p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-text-primary">
                            {bill.patients?.name ?? "Unknown patient"}
                          </p>
                          <p className="truncate text-xs text-text-muted">
                            {[bill.bill_number, bill.patients?.phone]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </p>
                        </div>
                        <Badge className={`shrink-0 ring-1 ${status.badge}`}>
                          {status.label}
                        </Badge>
                      </div>

                      <p className="mt-2 text-sm text-text-secondary">
                        {service.primary}
                        {service.extra > 0 ? ` +${service.extra} more` : ""}
                      </p>

                      <div className="mt-2 flex items-end justify-between gap-2">
                        <div>
                          <p className="text-base font-semibold tabular-nums text-text-primary">
                            {formatCurrency(bill.total_amount, bill.currency)}
                          </p>
                          <p className="mt-0.5 text-xs text-text-muted">
                            {[when.date, when.time].filter(Boolean).join(" · ")}
                          </p>
                          <div className="mt-1">
                            <PaymentMode payment={payment} />
                          </div>
                        </div>
                        <BillRowActions
                          bill={bill}
                          onViewDetails={() => setDetailsBillId(bill.id)}
                          onPrintReceipt={() => setReceiptBillId(bill.id)}
                          onCollectPayment={() => setCollectBillId(bill.id)}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>

              <p className="text-xs text-text-muted">
                Showing {visible.length} of {bills.length} loaded bill
                {bills.length === 1 ? "" : "s"}.
                {truncated
                  ? " Only the most recent bills are loaded — search narrows what is on this page, not the clinic's full history."
                  : ""}
              </p>

              {/* Bills summary — totals across every loaded bill. Only on the
                All Bills scope: on Today/Pending the same numbers would repeat
                under a different heading. */}

              {scope === "all" && (
                <div className="flex flex-wrap items-center gap-7 rounded-card border border-text-muted/20 bg-surface px-[18px] py-3">
                  <span className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-text-muted">
                    Summary
                  </span>
                  <SummaryCell
                    label="Total Bills"
                    value={String(summary.totalBills)}
                    valueClassName="text-text-primary"
                  />
                  <span
                    className="hidden h-4 w-px bg-text-muted/20 sm:block"
                    aria-hidden="true"
                  />
                  <SummaryCell
                    label="Total Amount"
                    value={formatCurrency(
                      summary.totalAmount,
                      summary.currency,
                    )}
                    valueClassName="text-text-primary"
                  />
                  <span
                    className="hidden h-4 w-px bg-text-muted/20 sm:block"
                    aria-hidden="true"
                  />
                  <SummaryCell
                    label="Paid"
                    value={formatCurrency(summary.paid, summary.currency)}
                    valueClassName="text-status-success"
                  />
                  <span
                    className="hidden h-4 w-px bg-text-muted/20 sm:block"
                    aria-hidden="true"
                  />
                  <SummaryCell
                    label="Pending"
                    value={formatCurrency(summary.pending, summary.currency)}
                    valueClassName="text-status-warning"
                  />
                </div>
              )}
            </>
          )}

      {detailsBill && (
        <BillDetailsModal
          bill={detailsBill}
          clinicName={clinic.name}
          timezone={timezone}
          onClose={() => {
            setDetailsBillId(null);
            router.refresh();
          }}
          onCollectPayment={() => {
            setDetailsBillId(null);
            setCollectBillId(detailsBill.id);
          }}
          onPrintReceipt={() => {
            setDetailsBillId(null);
            setReceiptBillId(detailsBill.id);
          }}
        />
      )}

      {receiptBill && (
        <ReceiptPreview
          bill={receiptBill}
          clinicName={clinic.name}
          clinicAddress={clinic.address}
          clinicPhone={clinic.phone}
          timezone={timezone}
          override={
            pendingReceipt && pendingReceipt.billId === receiptBill.id
              ? pendingReceipt.override
              : null
          }
          onClose={() => {
            setReceiptBillId(null);
            setPendingReceipt(null);
          }}
        />
      )}

      {collectBill && (
        <CollectPaymentModal
          billId={collectBill.id}
          patientName={collectBill.patients?.name}
          billNumber={collectBill.bill_number ?? undefined}
          amount={outstandingFor(collectBill)}
          currency={collectBill.currency}
          doctorName={collectBill.doctors?.name ?? undefined}
          billDate={collectBill.bill_date}
          tokenNumber={collectBill.visits?.token_number ?? undefined}
          patientPhone={collectBill.patients?.phone ?? null}
          onClose={() => {
            setCollectBillId(null);
            router.refresh();
          }}
          onCollected={({ receiptNumber, amount, paymentMethod }) => {
            const parsedNumber = Number(receiptNumber);
            setPendingReceipt({
              billId: collectBill.id,
              override: {
                receiptNumber: Number.isFinite(parsedNumber)
                  ? parsedNumber
                  : null,
                paidAmount: amount,
                paymentMethod,
              },
            });
            setReceiptBillId(collectBill.id);
          }}
        />
      )}

      {showNewBill && (
        <CreateBillModal
          today={today}
          services={services}
          onClose={() => {
            setShowNewBill(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/**
 * One KPI card under the Patient Billing heading. Label on top, an icon chip in
 * the corner, a bold value beneath, and an optional footer line (delta, month
 * name, etc). Colours are passed in per card because each stat gets its own.
 */
function KpiCard({
  label,
  value,
  icon: Icon,
  iconClassName,
  iconBgClassName,
  footer,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  iconClassName: string;
  iconBgClassName: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-text-muted/20 bg-surface px-4 py-3 shadow-card transition-[box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-dropdown">
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <span className="text-[11.5px] font-semibold leading-tight text-text-muted">
          {label}
        </span>
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${iconBgClassName}`}
        >
          <Icon
            className={`size-3.5 ${iconClassName}`}
            aria-hidden="true"
          />
        </span>
      </div>
      <div className="text-xl font-extrabold leading-none tracking-tight tabular-nums text-text-primary">
        {value}
      </div>
      {footer}
    </div>
  );
}

/**
 * One stat in the Summary bar — label and value on the same line, matching the
 * reference row. The parent flex row owns the gaps and the hairline dividers.
 */
function SummaryCell({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-text-secondary">{label}</span>
      <span
        className={`text-[13px] font-extrabold tabular-nums ${
          valueClassName ?? "text-text-primary"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** MODE cell: `—` until money has actually been recorded against the bill. */
function PaymentMode({ payment }: { payment: PatientPayment | null }) {
  if (!payment) {
    return <span className="text-text-muted">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-text-secondary">
      <span
        className={`size-2 shrink-0 rounded-pill ${PAYMENT_MODE_DOT[payment.payment_method]}`}
        aria-hidden="true"
      />
      {PATIENT_PAYMENT_METHOD_META[payment.payment_method].label}
    </span>
  );
}

function inScope(
  bill: PatientBillListRow,
  scope: BillScope,
  today: string,
): boolean {
  if (scope === "today") return billLocalDate(bill) === today;
  if (scope === "pending") return isPendingBill(bill);
  return true;
}

/**
 * The bill's date as a plain `YYYY-MM-DD` — `bill_date` is a DATE column so
 * PostgREST may hand it back either as `2026-09-22` or a full ISO stamp
 * depending on transport, and the Today pill compares it against the naive
 * clinic-today string. Normalising both sides keeps the comparison honest.
 */
function billLocalDate(bill: PatientBillListRow): string {
  return (bill.bill_date ?? "").slice(0, 10);
}

/**
 * Money is still owed — `pending` plus `partially_paid`. The Pending pill and
 * its live count mean "bills that still owe the clinic money", which a
 * partially settled bill clearly does. `paid` / `waived` / `cancelled` are not
 * owed.
 */
function isPendingBill(bill: PatientBillListRow): boolean {
  return bill.status === "pending" || bill.status === "partially_paid";
}

/**
 * SERVICE label — the first line item, with a count of the rest.
 *
 * Falls back to the bill type because a bill can legitimately have no items
 * yet (created against a visit before the charges were entered), and an empty
 * cell reads as a data error rather than as "nothing itemised".
 */
function describeService(bill: PatientBillListRow): {
  primary: string;
  extra: number;
} {
  const [first, ...rest] = bill.patient_bill_items;
  if (!first) {
    return { primary: PATIENT_BILL_TYPE_META[bill.bill_type].label, extra: 0 };
  }
  return { primary: first.description, extra: rest.length };
}

/**
 * TIME cell — the clinical moment where there is one, else when the bill was
 * raised.
 *
 * `visits.checked_in_at` is preferred because that is the time the patient was
 * actually seen. Manual bills have `visit_id = null` and therefore no check-in,
 * so they fall back to `created_at`; both are `timestamptz`, so both render on
 * the clinic's clock rather than the viewer's.
 *
 * The date line is suppressed for today's bills — on the Today pill every row
 * would otherwise repeat the same date.
 */
function describeTime(
  bill: PatientBillListRow,
  timezone: string,
  today: string,
): { time: string; date: string } {
  const source = bill.visits?.checked_in_at ?? bill.created_at;
  const local = source ? utcIsoToClinicLocalInput(source, timezone) : "";
  const time = formatNaiveTime(local);
  return {
    time: time || "—",
    date: billLocalDate(bill) === today ? "" : formatNaiveDate(bill.bill_date),
  };
}

/**
 * The most recent payment on the bill, or null if none was ever collected.
 *
 * Sorted rather than trusting array order: the embed comes back in whatever
 * order PostgREST chose, and a partially paid bill has more than one row.
 */
function latestPayment(bill: PatientBillListRow): PatientPayment | null {
  if (bill.patient_payments.length === 0) return null;
  return [...bill.patient_payments].sort((a, b) =>
    b.collected_at.localeCompare(a.collected_at),
  )[0];
}
