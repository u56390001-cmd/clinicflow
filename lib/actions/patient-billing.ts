"use server";

import {
  canManageClinical,
  canWriteClinic,
  getCurrentClinic,
} from "@/lib/clinic-access";
import { logAppEvent } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import {
  billStatusChangeSchema,
  collectPaymentSchema,
  createPatientBillSchema,
} from "@/lib/validation/schemas";
import type { ActionResult } from "@/types";
import type { PatientBillStatus } from "@/types/database";

/**
 * Create a patient bill with line items. Optionally links to a visit.
 * Idempotent — if a bill already exists for the given visit, returns it.
 */
export async function createPatientBillAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const parsed = createPatientBillSchema.safeParse({
    patientId: formData.get("patientId") ?? "",
    visitId: formData.get("visitId") || undefined,
    items: formData.get("items") ?? "[]",
    currency: formData.get("currency") || undefined,
    billType: formData.get("bill_type") || undefined,
    doctorId: formData.get("doctorId") || undefined,
    billDate: formData.get("bill_date") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the bill details and try again.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to create bills." };
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't manage billing." };
  }

  const { data, error } = await supabase.rpc(
    "create_patient_bill",
    {
      p_clinic_id: access.clinic.id,
      p_patient_id: parsed.data.patientId,
      p_visit_id: parsed.data.visitId || null,
      p_items: parsed.data.items,
      p_currency: parsed.data.currency || "PKR",
      p_bill_type: parsed.data.billType || "consultation",
      p_doctor_id: parsed.data.doctorId || null,
      p_bill_date: parsed.data.billDate || null,
      p_notes: parsed.data.notes || null,
    },
  );

  // Fallback for databases where migration 0036 (p_notes) isn't applied yet —
  // retry without the notes param so bill creation still works.
  if (
    error &&
    (error.code === "PGRST202" || /create_patient_bill/i.test(error.message ?? ""))
  ) {
    const legacy = await supabase.rpc("create_patient_bill", {
      p_clinic_id: access.clinic.id,
      p_patient_id: parsed.data.patientId,
      p_visit_id: parsed.data.visitId || null,
      p_items: parsed.data.items,
      p_currency: parsed.data.currency || "PKR",
      p_bill_type: parsed.data.billType || "consultation",
      p_doctor_id: parsed.data.doctorId || null,
      p_bill_date: parsed.data.billDate || null,
    });
    return legacy.error
      ? { ok: false, message: legacy.error.message || "Failed to create bill." }
      : { ok: true, data: legacy.data?.id ?? "" };
  }

  if (error) {
    return { ok: false, message: error.message || "Failed to create bill." };
  }

  return { ok: true, data: data?.id ?? "" };
}

/**
 * Collect payment for a patient bill. Idempotent — if the bill is already
 * paid, returns the existing receipt without creating a duplicate charge.
 * Advisory-locked at the DB level to prevent concurrent double-charges.
 */
export async function collectPatientPaymentAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const amountVal = formData.get("amount");
  const method = formData.get("paymentMethod") ?? "";
  let additionalCharges: unknown = [];
  try {
    additionalCharges = JSON.parse(formData.get("additionalCharges")?.toString() ?? "[]");
  } catch {
    additionalCharges = [];
  }
  const parsed = collectPaymentSchema.safeParse({
    billId: formData.get("billId") ?? "",
    paymentMethod: method,
    amount: amountVal ? Number(amountVal) : 0,
    additionalCharges,
    discountAmount: Number(formData.get("discountAmount")) || 0,
    discountPercent: Number(formData.get("discountPercent")) || 0,
  });
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the payment details and try again.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to collect payments." };
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't collect payments." };
  }

  const { data, error } = await supabase.rpc(
    "collect_patient_payment_with_adjustments",
    {
      p_clinic_id: access.clinic.id,
      p_bill_id: parsed.data.billId,
      p_payment_method: parsed.data.paymentMethod,
      p_additional_charges: parsed.data.additionalCharges,
      p_discount_amount: parsed.data.discountAmount,
      p_discount_percent: parsed.data.discountPercent,
    },
  );

  if (error) {
    return { ok: false, message: error.message || "Failed to collect payment." };
  }

  return {
    ok: true,
    data: data?.receipt_number?.toString() ?? (parsed.data.paymentMethod === "waive" ? "waived" : "paid"),
  };
}

/**
 * Statuses a bill may be moved *out of*, per target status.
 *
 * Waiving forgives what is still owed, so a partially paid bill qualifies — the
 * clinic keeps what was collected and writes off the balance. Cancelling voids
 * the bill outright, which is only honest while no money has changed hands;
 * `partially_paid` implies a receipt exists, and voiding the bill it belongs to
 * would leave that receipt pointing at nothing. Neither action is a refund
 * path, so `paid` is excluded from both.
 */
const BILL_STATUS_CHANGE_SOURCES: Record<
  "waived" | "cancelled",
  readonly PatientBillStatus[]
> = {
  waived: ["pending", "partially_paid"],
  cancelled: ["pending"],
};

const BILL_STATUS_CHANGE_REFUSAL: Record<"waived" | "cancelled", string> = {
  waived: "Only a pending or partially paid bill can be waived.",
  cancelled:
    "Only a pending bill can be cancelled. Waive it instead if a payment has already been collected.",
};

/**
 * Shared implementation for Waive and Cancel — the two differ only in the
 * target status, which statuses they may move out of, and the audit event name.
 *
 * Both are gated on `canWriteClinic` (owner/admin), not `canManageClinical`.
 * The latter admits `staff`, and RLS's `patient_bills_update_member` policy
 * admits any clinic member — so this check is the only thing standing between a
 * receptionist and writing off a bill. That is deliberate: it is a financial
 * decision, not a floor operation.
 */
async function changeBillStatus(
  formData: FormData,
  target: "waived" | "cancelled",
  auditEvent: string,
): Promise<ActionResult<string>> {
  const parsed = billStatusChangeSchema.safeParse({
    billId: formData.get("billId") ?? "",
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the details and try again.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to change a bill." };
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only a clinic owner or admin can waive or cancel a bill.",
    };
  }

  const allowed = BILL_STATUS_CHANGE_SOURCES[target];

  // Read first, for the guard message and the audit metadata. A missing row
  // here is either a wrong id or another clinic's bill — the clinic filter
  // means we cannot tell the two apart, and should not try to.
  const { data: bill, error: readError } = await supabase
    .from("patient_bills")
    .select("id, patient_id, bill_number, status, total_amount, currency")
    .eq("clinic_id", access.clinic.id)
    .eq("id", parsed.data.billId)
    .maybeSingle();

  if (readError) {
    return { ok: false, message: readError.message || "Couldn't load that bill." };
  }
  if (!bill) return { ok: false, message: "That bill no longer exists." };
  if (bill.status === target) {
    return {
      ok: false,
      message: `This bill is already ${target}.`,
    };
  }
  if (!allowed.includes(bill.status)) {
    return { ok: false, message: BILL_STATUS_CHANGE_REFUSAL[target] };
  }

  // The status filter is repeated in the UPDATE on purpose. `collect_patient_payment`
  // holds a per-clinic advisory lock, which does nothing to stop a plain UPDATE
  // from this side — so between the read above and this write, a colleague at
  // the front desk could have taken payment. Filtering on the permitted statuses
  // makes the write itself the check: it either matches a still-eligible row or
  // it matches nothing.
  const { data: updated, error: updateError } = await supabase
    .from("patient_bills")
    .update({ status: target })
    .eq("clinic_id", access.clinic.id)
    .eq("id", parsed.data.billId)
    .in("status", allowed as readonly PatientBillStatus[])
    .select("id")
    .maybeSingle();

  if (updateError) {
    return { ok: false, message: updateError.message || "Couldn't update that bill." };
  }
  if (!updated) {
    return {
      ok: false,
      message: "This bill changed while you were looking at it. Refresh and try again.",
    };
  }

  // Audit last, and best-effort: `logAppEvent` swallows its own failures, so a
  // log problem can never undo a status change the user was already told about.
  // Reads are admin-only within the clinic (`app_event_logs_select_admin`).
  const { data: auth } = await supabase.auth.getUser();

  await logAppEvent(supabase, {
    clinicId: access.clinic.id,
    category: "billing",
    event: auditEvent,
    severity: "warning",
    actorUserId: auth.user?.id ?? null,
    metadata: {
      bill_id: bill.id,
      patient_id: bill.patient_id,
      bill_number: bill.bill_number,
      previous_status: bill.status,
      new_status: target,
      total_amount: bill.total_amount,
      currency: bill.currency,
      reason: parsed.data.reason,
      actor_role: access.role,
    },
  });

  return { ok: true, data: bill.bill_number ?? bill.id };
}

/**
 * Waive a bill — the clinic writes off what is owed. Irreversible from the UI
 * and excluded from revenue. Owner/admin only; a reason is recorded.
 */
export async function waivePatientBillAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  return changeBillStatus(formData, "waived", "bill_waived");
}

/**
 * Cancel a bill — voids it entirely. Only permitted while nothing has been
 * collected. Owner/admin only; a reason is recorded.
 */
export async function cancelPatientBillAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  return changeBillStatus(formData, "cancelled", "bill_cancelled");
}
