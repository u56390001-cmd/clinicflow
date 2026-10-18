"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Receipt, CalendarClock, X } from "lucide-react";
import { toast } from "sonner";

import type {
  DermDiagnosis,
  DermExam,
  DermLesion,
  DermProcedure,
} from "@/types/database";
import {
  PATIENT_PAYMENT_METHODS_UI,
  type PatientBillStatus,
} from "@/types/database";
import {
  RecordEmpty,
  RecordSection,
} from "@/components/patients/record/record-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  collectPatientPaymentAction,
  createPatientBillAction,
} from "@/lib/actions/patient-billing";
import { saveDermExamAction } from "@/lib/actions/specialty-workspaces";
import type { DermBillingBundle } from "@/lib/patient-record";
import { formatCurrency } from "@/lib/utils/currency";

type Props = {
  patientId: string;
  exam: DermExam | null;
  diagnoses: DermDiagnosis[];
  lesions: DermLesion[];
  procedures: DermProcedure[];
  prescriptions: Array<{ id: string }>;
  billing: DermBillingBundle;
  canManage: boolean;
};

function SummaryFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-hairline bg-surface px-3 py-2">
      <span className="text-[12px] font-medium text-text-secondary">
        {label}
      </span>
      <span className="text-[13px] text-text-primary">{value ?? "—"}</span>
    </div>
  );
}

export function DermSummary({
  patientId,
  exam,
  diagnoses,
  lesions,
  procedures,
  prescriptions,
  billing,
  canManage,
}: Props) {
  const [followUpDate, setFollowUpDate] = useState(exam?.follow_up_date ?? "");
  const [followUpNotes, setFollowUpNotes] = useState(
    exam?.follow_up_notes ?? "",
  );
  const [isPending, startTransition] = useTransition();
  const hasTodayExam = exam !== null;
  const encounterDate =
    exam?.exam_date || new Date().toLocaleDateString("en-CA");
  const encounterProcedures = procedures.filter(
    (procedure) => procedure.procedure_date === encounterDate,
  );

  const primaryDiagnoses = diagnoses
    .filter((d) => d.status === "primary")
    .slice(0, 5);

  async function saveFollowUp() {
    if (!hasTodayExam) {
      toast.error("Create or load today's exam before saving follow-up");
      return;
    }
    startTransition(async () => {
      const result = await saveDermExamAction(patientId, {
        id: exam.id,
        follow_up_date: followUpDate.trim() ? followUpDate.trim() : null,
        follow_up_notes: followUpNotes.trim() ? followUpNotes.trim() : null,
      });
      if (result.ok) {
        toast.success("Follow-up saved");
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <RecordSection title="Encounter recap">
        {hasTodayExam ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryFact label="Exam date" value={exam.exam_date || "—"} />
            <SummaryFact
              label="Diagnoses (primary)"
              value={primaryDiagnoses.length}
            />
            <SummaryFact label="Lesions" value={lesions.length} />
            <SummaryFact label="Procedures" value={procedures.length} />
            <SummaryFact label="Prescriptions" value={prescriptions.length} />
          </div>
        ) : (
          <RecordEmpty
            icon={ClipboardList}
            title="No exam for today"
            description="Complete other tabs first; the summary will populate automatically."
          />
        )}
        {primaryDiagnoses.length > 0 && (
          <div className="mt-3 space-y-1 text-[13px] text-text-secondary">
            {primaryDiagnoses.map((d) => (
              <div key={d.id}>
                {d.label}
                {d.icd_code ? ` (${d.icd_code})` : ""}
              </div>
            ))}
          </div>
        )}
      </RecordSection>

      <BillingSection
        patientId={patientId}
        encounterDate={encounterDate}
        encounterProcedures={encounterProcedures}
        examDoctorId={exam?.doctor_id ?? null}
        billing={billing}
        canManage={canManage}
      />

      <RecordSection title="Follow-up">
        {!hasTodayExam && (
          <RecordEmpty
            icon={CalendarClock}
            title="Today's exam not found"
            description="Save exam details on other tabs before setting follow-up."
          />
        )}
        {hasTodayExam && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-text-secondary">
                  Follow-up date
                </label>
                <Input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  disabled={!canManage}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-text-secondary">
                Follow-up notes
              </label>
              <Textarea
                rows={3}
                value={followUpNotes}
                onChange={(e) => setFollowUpNotes(e.target.value)}
                placeholder="Instructions, timing, red flags"
                disabled={!canManage}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={saveFollowUp} disabled={!canManage || isPending}>
                {isPending ? "Saving..." : "Save follow-up"}
              </Button>
            </div>
          </div>
        )}
      </RecordSection>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Billing (spec 10.3)                                                        */
/* -------------------------------------------------------------------------- */

type DraftLine = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  serviceId: string | null;
};

type EncounterDoctor = {
  id: string | null;
  name: string | null;
  fee: number | null;
};

const BILL_STATUS_META: Record<
  PatientBillStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "Pending",
    className: "bg-status-warning/15 text-status-warning",
  },
  paid: {
    label: "Paid",
    className: "bg-status-success/15 text-status-success",
  },
  partially_paid: {
    label: "Partially paid",
    className: "bg-status-info/15 text-status-info",
  },
  waived: { label: "Waived", className: "bg-app text-text-muted" },
  cancelled: { label: "Cancelled", className: "bg-app text-text-muted" },
};

/**
 * The rails this screen offers. `waive` is deliberately absent: waiving a bill
 * is an owner/admin decision with a reason, recorded in the Billing workspace.
 */
const PAYMENT_METHODS = PATIENT_PAYMENT_METHODS_UI.filter(
  (method) => method !== "waive",
);

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  bank_transfer: "Bank transfer",
  waive: "Waive",
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Match a recorded procedure against the clinic's active services catalogue.
 * Both directions of containment, so "Cryotherapy - face" finds "Cryotherapy"
 * and a service named "Laser (full face)" still matches "Laser". When nothing
 * matches, the procedure is reported as unpriced rather than given a guess.
 */
function matchCatalogueService(
  procedureName: string,
  services: DermBillingBundle["services"],
) {
  const target = normalizeName(procedureName);
  if (!target) return null;
  return (
    services.find((service) => {
      const name = normalizeName(service.name);
      return (
        name.length > 0 && (target.includes(name) || name.includes(target))
      );
    }) ?? null
  );
}

/**
 * The consultation fee source: the encounter's doctor (exam first, then any
 * procedure's doctor), falling back to the clinic's single fee-configured
 * doctor. No doctor and no unambiguous fee means no consultation line - the
 * invoice never invents a price.
 */
function findEncounterDoctor(
  billing: DermBillingBundle,
  examDoctorId: string | null,
  encounterProcedures: DermProcedure[],
): EncounterDoctor {
  const doctorId =
    examDoctorId ??
    encounterProcedures.find((procedure) => procedure.doctor_id)?.doctor_id ??
    null;
  if (doctorId) {
    const doctor = billing.doctors.find((row) => row.id === doctorId);
    if (doctor) {
      return { id: doctor.id, name: doctor.name, fee: doctor.consultation_fee };
    }
    return { id: doctorId, name: null, fee: null };
  }
  const withFee = billing.doctors.filter(
    (row) => (row.consultation_fee ?? 0) > 0,
  );
  if (withFee.length === 1) {
    return {
      id: withFee[0].id,
      name: withFee[0].name,
      fee: withFee[0].consultation_fee,
    };
  }
  return { id: null, name: null, fee: null };
}

function buildDraftLines(
  billing: DermBillingBundle,
  doctor: EncounterDoctor,
  encounterProcedures: DermProcedure[],
): DraftLine[] {
  const lines: DraftLine[] = [];
  if (doctor.fee !== null && doctor.fee > 0) {
    lines.push({
      id: "consultation",
      description: doctor.name
        ? `Consultation - ${doctor.name}`
        : "Consultation",
      quantity: 1,
      unit_price: doctor.fee,
      serviceId: null,
    });
  }
  for (const procedure of encounterProcedures) {
    const service = matchCatalogueService(
      procedure.procedure_name,
      billing.services,
    );
    if (service) {
      lines.push({
        id: procedure.id,
        description: procedure.procedure_name,
        quantity: 1,
        unit_price: service.price,
        serviceId: service.id,
      });
    }
  }
  return lines;
}

function BillStatusBadge({ status }: { status: PatientBillStatus }) {
  const meta = BILL_STATUS_META[status];
  return <Badge className={meta.className}>{meta.label}</Badge>;
}

function BillingSection({
  patientId,
  encounterDate,
  encounterProcedures,
  examDoctorId,
  billing,
  canManage,
}: {
  patientId: string;
  encounterDate: string;
  encounterProcedures: DermProcedure[];
  examDoctorId: string | null;
  billing: DermBillingBundle;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"create" | "collect" | null>(null);
  const [method, setMethod] = useState<string>("cash");
  const [discountFlat, setDiscountFlat] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");

  const doctor = findEncounterDoctor(
    billing,
    examDoctorId,
    encounterProcedures,
  );
  const [lines, setLines] = useState<DraftLine[]>(() =>
    buildDraftLines(billing, doctor, encounterProcedures),
  );

  const openBill =
    billing.bills.find(
      (bill) => bill.status === "pending" || bill.status === "partially_paid",
    ) ?? null;
  const otherBills = billing.bills.filter((bill) => bill.id !== openBill?.id);
  const sameDayBill =
    billing.bills.find(
      (bill) => bill.bill_date === encounterDate && bill.status !== "cancelled",
    ) ?? null;

  const pricedProcedureIds = new Set(
    encounterProcedures
      .filter(
        (procedure) =>
          matchCatalogueService(procedure.procedure_name, billing.services) !==
          null,
      )
      .map((procedure) => procedure.id),
  );
  const unpriced = encounterProcedures.filter(
    (procedure) => !pricedProcedureIds.has(procedure.id),
  );

  const usedServiceIds = new Set(
    lines
      .map((line) => line.serviceId)
      .filter((serviceId): serviceId is string => serviceId !== null),
  );
  const availableServices = billing.services.filter(
    (service) => !usedServiceIds.has(service.id),
  );

  const subtotal = round2(
    lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0),
  );

  // Settlement preview. Mirrors `collect_patient_payment_with_adjustments`
  // (0031): a flat discount wins over a percentage, both are clamped to the
  // items subtotal, and the RPC settles whatever is net in one move.
  const itemsSubtotal = openBill
    ? round2(
        openBill.patient_bill_items.reduce(
          (sum, item) => sum + item.line_total,
          0,
        ),
      )
    : 0;
  const flat = Number(discountFlat) || 0;
  const pct = Number(discountPercent) || 0;
  let discountValue = 0;
  if (flat > 0) {
    discountValue = Math.min(flat, itemsSubtotal);
  } else if (pct > 0) {
    discountValue = round2((itemsSubtotal * Math.min(pct, 100)) / 100);
  }
  const netDue = Math.max(0, round2(itemsSubtotal - discountValue));

  function addServiceLine(serviceId: string) {
    const service = billing.services.find((row) => row.id === serviceId);
    if (!service) return;
    setLines((current) => [
      ...current,
      {
        id: `service-${service.id}`,
        description: service.name,
        quantity: 1,
        unit_price: service.price,
        serviceId: service.id,
      },
    ]);
  }

  function removeLine(id: string) {
    setLines((current) => current.filter((line) => line.id !== id));
  }

  async function createBill() {
    if (!canManage || lines.length === 0 || busy) return;
    setBusy("create");
    const formData = new FormData();
    formData.set("patientId", patientId);
    formData.set(
      "items",
      JSON.stringify(
        lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unit_price: line.unit_price,
        })),
      ),
    );
    formData.set(
      "bill_type",
      lines.some((line) => line.id !== "consultation")
        ? "procedure"
        : "consultation",
    );
    if (doctor.id) formData.set("doctorId", doctor.id);
    formData.set("bill_date", encounterDate);
    const result = await createPatientBillAction(null, formData);
    setBusy(null);
    if (result.ok) {
      toast.success("Bill created");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function collectPayment() {
    if (!canManage || !openBill || busy) return;
    if (itemsSubtotal <= 0) return;
    setBusy("collect");
    const formData = new FormData();
    formData.set("billId", openBill.id);
    formData.set("paymentMethod", method);
    formData.set("amount", String(netDue));
    formData.set("additionalCharges", "[]");
    formData.set("discountAmount", String(flat));
    formData.set("discountPercent", String(pct));
    const result = await collectPatientPaymentAction(null, formData);
    setBusy(null);
    if (result.ok) {
      toast.success(
        result.data
          ? `Payment recorded - receipt ${result.data}`
          : "Payment recorded",
      );
      setDiscountFlat("");
      setDiscountPercent("");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  const draftEmpty =
    lines.length === 0 &&
    unpriced.length === 0 &&
    billing.services.length === 0;

  return (
    <RecordSection title="Billing">
      {openBill ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Receipt className="size-4 text-text-muted" aria-hidden="true" />
            <span className="text-ink text-[13px] font-semibold">
              {openBill.bill_number ?? "Bill"}
            </span>
            <BillStatusBadge status={openBill.status} />
            <span className="text-[12px] text-text-muted">
              {openBill.bill_date} - {openBill.bill_type}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-hairline text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  <th className="py-1.5 pr-2">Item</th>
                  <th className="px-2 py-1.5 text-right">Qty</th>
                  <th className="px-2 py-1.5 text-right">Unit price</th>
                  <th className="py-1.5 pl-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {openBill.patient_bill_items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-hairline last:border-0"
                  >
                    <td className="text-ink py-2 pr-2">{item.description}</td>
                    <td className="px-2 py-2 text-right text-text-secondary">
                      {item.quantity}
                    </td>
                    <td className="px-2 py-2 text-right text-text-secondary">
                      {formatCurrency(item.unit_price, openBill.currency, {
                        alwaysShowDecimals: true,
                      })}
                    </td>
                    <td className="text-ink py-2 pl-2 text-right font-semibold">
                      {formatCurrency(item.line_total, openBill.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-surface-muted flex flex-wrap items-center justify-between gap-2 rounded-control border border-hairline px-3 py-2">
            <span className="text-[12px] text-text-secondary">Amount due</span>
            <span className="text-ink text-[14px] font-bold">
              {formatCurrency(netDue, openBill.currency)}
            </span>
          </div>

          {canManage ? (
            <div className="space-y-2.5 rounded-control border border-hairline p-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="derm-bill-method"
                    className="text-[12px] font-medium text-text-secondary"
                  >
                    Payment method
                  </label>
                  <NativeSelect
                    id="derm-bill-method"
                    value={method}
                    onChange={(event) => setMethod(event.target.value)}
                  >
                    {PAYMENT_METHODS.map((paymentMethod) => (
                      <option key={paymentMethod} value={paymentMethod}>
                        {PAYMENT_METHOD_LABELS[paymentMethod] ?? paymentMethod}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="derm-bill-discount-flat"
                    className="text-[12px] font-medium text-text-secondary"
                  >
                    Discount (flat)
                  </label>
                  <Input
                    id="derm-bill-discount-flat"
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={discountFlat}
                    onChange={(event) => setDiscountFlat(event.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="derm-bill-discount-percent"
                    className="text-[12px] font-medium text-text-secondary"
                  >
                    Discount (%)
                  </label>
                  <Input
                    id="derm-bill-discount-percent"
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    inputMode="decimal"
                    value={discountPercent}
                    onChange={(event) => setDiscountPercent(event.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11.5px] text-text-muted">
                  Subtotal {formatCurrency(itemsSubtotal, openBill.currency)}
                  {discountValue > 0
                    ? ` - discount ${formatCurrency(discountValue, openBill.currency)}`
                    : ""}{" "}
                  = {formatCurrency(netDue, openBill.currency)}
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={collectPayment}
                  disabled={busy !== null || itemsSubtotal <= 0}
                >
                  {busy === "collect"
                    ? "Collecting..."
                    : `Collect ${formatCurrency(netDue, openBill.currency)}`}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-[12px] text-text-muted">
              Your role can view this bill but not collect payments.
            </p>
          )}
        </div>
      ) : draftEmpty ? (
        <RecordEmpty
          icon={Receipt}
          title="No charges to bill"
          description="No consultation fee or catalogue prices are configured, and no procedures were recorded for this encounter. Set fees in Services / Doctors settings first."
        />
      ) : (
        <div className="space-y-3">
          {sameDayBill && (
            <p className="bg-surface-muted rounded-control border border-hairline px-3 py-2 text-[12px] text-text-secondary">
              A bill already exists for {sameDayBill.bill_date} (
              {sameDayBill.bill_number ?? "bill"}, {sameDayBill.status}).
              Creating another will raise a second bill for this encounter.
            </p>
          )}

          {lines.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-hairline text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                    <th className="py-1.5 pr-2">Item</th>
                    <th className="px-2 py-1.5 text-right">Qty</th>
                    <th className="px-2 py-1.5 text-right">Unit price</th>
                    <th className="px-2 py-1.5 text-right">Amount</th>
                    <th className="w-8 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr
                      key={line.id}
                      className="border-b border-hairline last:border-0"
                    >
                      <td className="text-ink py-2 pr-2">{line.description}</td>
                      <td className="px-2 py-2 text-right text-text-secondary">
                        {line.quantity}
                      </td>
                      <td className="px-2 py-2 text-right text-text-secondary">
                        {formatCurrency(line.unit_price)}
                      </td>
                      <td className="text-ink px-2 py-2 text-right font-semibold">
                        {formatCurrency(line.quantity * line.unit_price)}
                      </td>
                      <td className="py-2 text-right">
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => removeLine(line.id)}
                            aria-label={`Remove ${line.description}`}
                            className="flex size-6 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-app hover:text-status-destructive"
                          >
                            <X className="size-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {unpriced.length > 0 && (
            <div className="bg-surface-muted rounded-control border border-hairline px-3 py-2">
              <p className="text-ink text-[12px] font-semibold">
                No catalogue price for {unpriced.length} procedure
                {unpriced.length === 1 ? "" : "s"}
              </p>
              <ul className="mt-1 space-y-0.5 text-[12px] text-text-secondary">
                {unpriced.map((procedure) => (
                  <li key={procedure.id}>
                    {procedure.procedure_name} - add a matching service or pick
                    a charge below.
                  </li>
                ))}
              </ul>
            </div>
          )}

          {billing.services.length > 0 && (
            <NativeSelect
              value=""
              aria-label="Add charge from services catalogue"
              disabled={!canManage || availableServices.length === 0}
              onChange={(event) => {
                const serviceId = event.target.value;
                if (serviceId) addServiceLine(serviceId);
              }}
            >
              <option value="">
                {availableServices.length === 0
                  ? "All catalogue services already added"
                  : "Add charge from services catalogue..."}
              </option>
              {availableServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} - {formatCurrency(service.price)}
                </option>
              ))}
            </NativeSelect>
          )}

          <div className="bg-surface-muted flex flex-wrap items-center justify-between gap-2 rounded-control border border-hairline px-3 py-2">
            <span className="text-[12px] text-text-secondary">
              Draft subtotal - {lines.length} item
              {lines.length === 1 ? "" : "s"}
            </span>
            <span className="text-ink text-[14px] font-bold">
              {formatCurrency(subtotal)}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11.5px] text-text-muted">
              Prices come from your Services catalogue and doctor fees. Nothing
              is charged until payment is collected.
            </p>
            <Button
              type="button"
              size="sm"
              onClick={createBill}
              disabled={!canManage || lines.length === 0 || busy !== null}
            >
              {busy === "create"
                ? "Creating..."
                : lines.length > 0
                  ? `Create bill (${formatCurrency(subtotal)})`
                  : "Create bill"}
            </Button>
          </div>
        </div>
      )}

      {otherBills.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Recent bills
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {otherBills.map((bill) => {
              const receipt = bill.receipts[0];
              return (
                <li
                  key={bill.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-hairline bg-surface px-3 py-2 text-[12.5px]"
                >
                  <span className="text-ink font-medium">
                    {bill.bill_number ?? "Bill"}
                  </span>
                  <span className="text-text-muted">{bill.bill_date}</span>
                  <span className="text-ink font-semibold">
                    {formatCurrency(bill.total_amount, bill.currency)}
                  </span>
                  <BillStatusBadge status={bill.status} />
                  {receipt && (
                    <span className="text-[11.5px] text-text-muted">
                      Receipt {receipt.receipt_code}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11.5px] text-text-muted">
          Waivers, cancellations and receipt printing live in the billing
          workspace.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/app/patient-billing">Open billing workspace</Link>
        </Button>
      </div>
    </RecordSection>
  );
}
