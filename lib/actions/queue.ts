"use server";

import {
  canManageClinical,
  getCurrentClinic,
} from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import { clinicToday } from "@/lib/time";
import {
  checkInSchema,
  vitalsSchema,
  reorderQueueSchema,
} from "@/lib/validation/schemas";
import type { ActionResult } from "@/types";
import type { CustomVitalValue, PatientPaymentMethod } from "@/types/database";

export interface CheckInResult {
  visitId: string;
  tokenNumber: number;
  receiptNumber: number | null;
  billTotal: number | null;
  billNumber: string | null;
  clinicName: string | null;
  clinicAddress: string | null;
  paidAt: string | null;
}

interface BillLineItemInput {
  description: string;
  quantity: number;
  unit_price: number;
}

/**
 * Check in a patient for their appointment. Idempotent — calling twice
 * for the same appointment returns the existing visit without creating a
 * duplicate. Creates a waiting visit with token and queue position.
 *
 * When `paymentStatus` is `collected_pre` (a non-waive payment method with a
 * positive total was chosen), this also persists the payment: it creates a
 * patient bill linked to the visit, collects it (creating a real receipt), and
 * marks the visit as paid-before-consultation. This keeps the "Payment
 * Collected" status visible in the queue, billing module, and receipts.
 */
export async function checkInPatientAction(
  _prevState: ActionResult<CheckInResult> | null,
  formData: FormData,
): Promise<ActionResult<CheckInResult>> {
  const parsed = checkInSchema.safeParse({
    appointmentId: formData.get("appointmentId") ?? "",
    paymentStatus: formData.get("paymentStatus") ?? "pending",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the details and try again.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to check in patients." };
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't manage check-ins." };
  }

  // If a visit already exists for this appointment (e.g. the patient was
  // checked in earlier, or the deployed RPC isn't the idempotent version),
  // reuse it instead of letting the unique (clinic_id, appointment_id)
  // constraint reject a second insert. Ensures the payment can still be
  // collected for the existing visit.
  const { data: existingVisit, error: existingError } = await supabase
    .from("visits")
    .select("id, patient_id, token_number, payment_status")
    .eq("clinic_id", access.clinic.id)
    .eq("appointment_id", parsed.data.appointmentId)
    .maybeSingle();

  if (existingError && existingError.code !== "PGRST116") {
    return { ok: false, message: existingError.message || "We couldn't verify this appointment. Try again." };
  }

  let visit: { id: string; patient_id: string; token_number: number | null } | null = existingVisit ?? null;

  if (!visit) {
    const rpcResult = await supabase.rpc("check_in_patient", {
      p_clinic_id: access.clinic.id,
      p_appointment_id: parsed.data.appointmentId,
      p_payment_status: parsed.data.paymentStatus,
    });

    if (rpcResult.error) {
      // A concurrent submit or a deployed RPC without the idempotency guard
      // can hit the (clinic_id, appointment_id) unique constraint. Treat that
      // as "already checked in" and reuse the existing visit.
      if (rpcResult.error.code === "23505") {
        const { data: recovered, error: recoverError } = await supabase
          .from("visits")
          .select("id, patient_id, token_number")
          .eq("clinic_id", access.clinic.id)
          .eq("appointment_id", parsed.data.appointmentId)
          .maybeSingle();
        if (recoverError || !recovered) {
          return { ok: false, message: "This patient is already checked in. Refresh the list and try again." };
        }
        visit = recovered;
      } else {
        return { ok: false, message: rpcResult.error.message || "Failed to check in patient." };
      }
    } else {
      visit = rpcResult.data ?? null;
    }
  }

  if (!visit?.id) {
    return { ok: false, message: "We couldn't confirm this check-in. Try again." };
  }

  const result: CheckInResult = {
    visitId: visit.id,
    tokenNumber: visit.token_number ?? 0,
    receiptNumber: null,
    billTotal: null,
    billNumber: null,
    clinicName: access.clinic.name,
    clinicAddress: access.clinic.address,
    paidAt: null,
  };

  // Persist the payment when payment was collected at check-in. Waive and
  // no-payment cases only mark the visit status (done above) and skip billing.
  if (parsed.data.paymentStatus === "collected_pre") {
    const method = formData.get("paymentMethod")?.toString() ?? "";
    const collectPayment = method !== "waive";
    if (collectPayment) {
      const billResult = await persistCheckInPayment(
        supabase,
        access.clinic.id,
        visit.patient_id,
        visit.id,
        formData,
        clinicToday(access.clinic.timezone),
      );
      if (!billResult.ok) {
        return { ok: false, message: billResult.message };
      }
      result.receiptNumber = billResult.receiptNumber;
      result.billTotal = billResult.billTotal;
      result.billNumber = billResult.billNumber;
      result.paidAt = billResult.paidAt;
    }
  }

  return { ok: true, data: result };
}

/**
 * Create a bill + collect the payment for a check-in. Builds line items from
 * the form (consultation fee + additional charges, discount folded into the
 * fee line so the bill total matches the collected amount). Returns the real
 * receipt number and bill total so the UI can render an accurate receipt.
 */
async function persistCheckInPayment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
  patientId: string,
  visitId: string,
  formData: FormData,
  billDate: string,
): Promise<
  | {
      ok: true;
      receiptNumber: number;
      billTotal: number;
      billNumber: string | null;
      paidAt: string | null;
    }
  | { ok: false; message: string }
> {
  const fee = Number(formData.get("consultationFee")) || 0;
  const discount = Number(formData.get("discountAmount")) || 0;

  let addOns: { description: string; amount: number }[] = [];
  try {
    const raw = formData.get("selectedAddOns")?.toString() ?? "[]";
    addOns = JSON.parse(raw);
  } catch {
    addOns = [];
  }

  const addOnsTotal = (addOns as { amount: number }[]).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const subtotal = fee + addOnsTotal;
  const discountCapped = Math.min(discount, subtotal);
  const consultationFeeLine = Math.max(0, fee - discountCapped);

  const items: BillLineItemInput[] = [
    { description: "Consultation Fee", quantity: 1, unit_price: Math.round(consultationFeeLine * 100) / 100 },
    ...addOns.map((c) => ({
      description: c.description,
      quantity: 1,
      unit_price: Math.round((Number(c.amount) || 0) * 100) / 100,
    })),
  ].filter((i) => i.unit_price > 0);

  let bill: { id: string; total_amount: number; bill_number: string | null } | null = null;

  // Pass the clinic-local bill date so check-in bills land on the right "Today";
  // fall back to the pre-0032 RPC (which stamps UTC current_date) if the linked
  // Supabase project hasn't applied migration 0032 yet.
  //
  // PGRST203: the pre-0037 DB exposes BOTH the 8-arg (0032) and 9-arg (0036)
  // overloads, so a call with p_bill_date is ambiguous. Retry the pre-0032
  // (5-arg, no bill_date) signature to keep older projects working.
  const rpcResult = await supabase.rpc("create_patient_bill", {
    p_clinic_id: clinicId,
    p_patient_id: patientId,
    p_visit_id: visitId,
    p_items: items,
    p_currency: "PKR",
    p_bill_date: billDate,
  });

  if (
    rpcResult.error &&
    (rpcResult.error.code === "PGRST202" || rpcResult.error.code === "PGRST203")
  ) {
    const legacy = await supabase.rpc("create_patient_bill", {
      p_clinic_id: clinicId,
      p_patient_id: patientId,
      p_visit_id: visitId,
      p_items: items,
      p_currency: "PKR",
    });
    if (legacy.error) {
      return {
        ok: false,
        message:
          legacy.error.message || "Couldn't save the bill.",
      };
    }
    bill = legacy.data;
  } else if (rpcResult.error) {
    return {
      ok: false,
      message: rpcResult.error.message || "Couldn't save the bill.",
    };
  } else {
    bill = rpcResult.data;
  }

  const billTotal = Number(bill?.total_amount) || 0;

  // A zero-amount bill needs no payment (bill is already 'paid' with total 0).
  if (billTotal <= 0) {
    return {
      ok: true,
      receiptNumber: 0,
      billTotal,
      billNumber: bill?.bill_number ?? null,
      paidAt: null,
    };
  }

  const { data: payment, error: payError } = await supabase.rpc("collect_patient_payment", {
    p_clinic_id: clinicId,
    p_bill_id: bill.id,
    p_payment_method: (formData.get("paymentMethod")?.toString() ?? "cash") as PatientPaymentMethod,
    p_amount: billTotal,
  });

  if (payError) {
    return { ok: false, message: payError.message || "Couldn't record the payment." };
  }

  // collect_patient_payment sets the visit's status to collected_post; a
  // payment taken in the check-in flow is pre-consultation, so refine it.
  const { error: statusError } = await supabase
    .from("visits")
    .update({ payment_status: "collected_pre" })
    .eq("clinic_id", clinicId)
    .eq("id", visitId);

  if (statusError) {
    return { ok: false, message: statusError.message || "Couldn't update payment status." };
  }

  return {
    ok: true,
    receiptNumber: Number(payment?.receipt_number) || 0,
    billTotal,
    billNumber: bill?.bill_number ?? null,
    paidAt: payment?.generated_at ?? null,
  };
}

/**
 * Record vitals for a visit. Upserts — one vitals record per visit.
 * Supports structured BP (systolic/diastolic), SpO2, respiratory rate.
 * BMI is auto-computed server-side from height + weight.
 */
export async function recordVitalsAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const tempVal = formData.get("temperature");
  const pulseVal = formData.get("pulse");
  const weightVal = formData.get("weight");
  const heightVal = formData.get("height");
  const bpVal =
    formData.get("blood_pressure") ?? formData.get("bloodPressure");
  const systolicVal = formData.get("systolic_bp") ?? formData.get("systolicBp");
  const diastolicVal = formData.get("diastolic_bp") ?? formData.get("diastolicBp");
  const spo2Val = formData.get("spo2");
  const respRateVal =
    formData.get("respiratory_rate") ?? formData.get("respiratoryRate");

  const parsed = vitalsSchema.safeParse({
    visitId: formData.get("visitId") ?? "",
    bloodPressure: typeof bpVal === "string" ? bpVal : "",
    temperature: tempVal ? Number(tempVal) : undefined,
    pulse: pulseVal ? Number(pulseVal) : undefined,
    weight: weightVal ? Number(weightVal) : undefined,
    height: heightVal ? Number(heightVal) : undefined,
    systolicBp: systolicVal ? Number(systolicVal) : undefined,
    diastolicBp: diastolicVal ? Number(diastolicVal) : undefined,
    spo2: spo2Val ? Number(spo2Val) : undefined,
    respiratoryRate: respRateVal ? Number(respRateVal) : undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the vitals and try again.",
    };
  }

  // Custom vitals arrive as a JSON string of { key, label, value, unit } rows;
  // blank values are dropped so the RPC stores only filled fields.
  const customRaw = formData.get("customVitalsJson");
  let customVitals: CustomVitalValue[] = [];
  if (typeof customRaw === "string" && customRaw.trim()) {
    try {
      const parsed = JSON.parse(customRaw);
      if (Array.isArray(parsed)) {
        customVitals = parsed
          .filter(
            (item): item is Record<string, unknown> =>
              !!item &&
              typeof item === "object" &&
              typeof (item as { value?: unknown }).value === "string" &&
              (item as { value: string }).value.trim() !== "",
          )
          .map((item) => ({
            key: typeof item.key === "string" ? item.key : "",
            label: typeof item.label === "string" ? item.label : "",
            value: (item.value as string).trim(),
            unit:
              typeof item.unit === "string" && item.unit.trim() ? item.unit.trim() : null,
          }))
          .filter((item) => item.key && item.label);
      }
    } catch {
      customVitals = [];
    }
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to record vitals." };
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't record vitals." };
  }

  const { data, error } = await supabase.rpc("record_vitals", {
    p_visit_id: parsed.data.visitId,
    p_blood_pressure: parsed.data.bloodPressure || null,
    p_temperature: parsed.data.temperature || null,
    p_pulse: parsed.data.pulse || null,
    p_weight: parsed.data.weight || null,
    p_height: parsed.data.height || null,
    p_systolic_bp: parsed.data.systolicBp || null,
    p_diastolic_bp: parsed.data.diastolicBp || null,
    p_spo2: parsed.data.spo2 || null,
    p_respiratory_rate: parsed.data.respiratoryRate || null,
    p_custom_vitals: customVitals.length > 0 ? customVitals : null,
  });

  if (error) {
    return { ok: false, message: error.message || "Failed to record vitals." };
  }

  return { ok: true, data: data?.id ?? "" };
}

/**
 * Reorder the waiting queue. Moves a patient to a new position.
 * Atomic — all affected positions are recalculated in one transaction.
 */
export async function reorderQueueAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = reorderQueueSchema.safeParse({
    visitId: formData.get("visitId") ?? "",
    newPosition: formData.get("newPosition") ? Number(formData.get("newPosition")) : 1,
  });
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Failed to reorder queue.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to reorder the queue." };
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't manage the queue." };
  }

  const { error } = await supabase.rpc("reorder_queue", {
    p_clinic_id: access.clinic.id,
    p_visit_id: parsed.data.visitId,
    p_new_position: parsed.data.newPosition,
  });

  if (error) {
    return { ok: false, message: error.message || "Failed to reorder queue." };
  }

  // Tokens follow the serving order: after a reorder, renumber the active
  // queue visits so the dragged patient keeps a token that matches their new
  // position (emergency moved to the top becomes the lowest-numbered token).
  // Only 'waiting'/'in_consultation' rows participate, so completed visits
  // keep their receipt token.
  const { data: activeRows, error: activeError } = await supabase
    .from("visits")
    .select("id, queue_position")
    .eq("clinic_id", access.clinic.id)
    .in("status", ["waiting", "in_consultation"])
    .order("queue_position", { ascending: true });

  if (activeError) {
    return {
      ok: false,
      message: activeError.message || "Failed to renumber queue tokens.",
    };
  }

  const renumberResults = await Promise.all(
    (activeRows ?? []).map((row) =>
      supabase
        .from("visits")
        .update({ token_number: row.queue_position })
        .eq("clinic_id", access.clinic.id)
        .eq("id", row.id),
    ),
  );
  const renumberFailure = renumberResults.find((r) => r.error);
  if (renumberFailure?.error) {
    return {
      ok: false,
      message: renumberFailure.error.message || "Failed to renumber queue tokens.",
    };
  }

  return { ok: true, data: undefined };
}
