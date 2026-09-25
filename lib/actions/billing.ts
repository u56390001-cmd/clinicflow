"use server";

import { getCurrentClinic, canWriteClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import {
  paymentSubmissionSchema,
  paymentMethodSchema,
  rejectionSchema,
} from "@/lib/validation/schemas";
import type { ActionResult } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PaymentSubmission, Subscription, SubscriptionPlan, PaymentMethod } from "@/types/database";

type TypedClient = SupabaseClient<Database>;

const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

async function isPlatformAdmin(
  supabase: TypedClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

// ---------------------------------------------------------------------------
// 1. getPlansAction – public, no auth required
// ---------------------------------------------------------------------------

export async function getPlansAction(): Promise<
  ActionResult<SubscriptionPlan[]>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("active", true)
    .order("price", { ascending: true });

  if (error) {
    return { ok: false, message: "Failed to load subscription plans." };
  }
  return { ok: true, data: data ?? [] };
}

// ---------------------------------------------------------------------------
// 2. getCheckoutDataAction – auth + clinic
// ---------------------------------------------------------------------------

export async function getCheckoutDataAction(): Promise<
  ActionResult<{
    subscription: Subscription | null;
    plan: SubscriptionPlan | null;
    paymentMethods: PaymentMethod[];
  }>
> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to view billing." };

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*, plan:subscription_plans(*)")
    .eq("clinic_id", access.clinic.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const plan = subscription && typeof subscription === "object" && "plan" in subscription
    ? (subscription as Record<string, unknown>).plan as SubscriptionPlan | null
    : null;

  const { data: paymentMethods } = await supabase
    .from("payment_methods")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  return {
    ok: true,
    data: {
      subscription: (subscription as Subscription) ?? null,
      plan,
      paymentMethods: paymentMethods ?? [],
    },
  };
}

// ---------------------------------------------------------------------------
// 3. submitPaymentAction – auth + clinic + canWrite
// ---------------------------------------------------------------------------

export async function submitPaymentAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const proofFile = formData.get("proof") as File | null;

  const parsed = paymentSubmissionSchema.safeParse({
    amount: formData.get("amount") !== null ? Number(formData.get("amount")) : NaN,
    senderName: formData.get("senderName") ?? "",
    senderPhone: formData.get("senderPhone") ?? "",
    transactionReference: formData.get("transactionReference") ?? "",
    paymentMethodId: formData.get("paymentMethodId") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the payment details and try again.",
    };
  }

  if (!proofFile || proofFile.size === 0) {
    return { ok: false, message: "Please upload a payment proof." };
  }
  if (!ALLOWED_FILE_TYPES.includes(proofFile.type)) {
    return { ok: false, message: "Proof must be a JPG, PNG, WebP, or PDF file." };
  }
  if (proofFile.size > MAX_FILE_SIZE) {
    return { ok: false, message: "Proof file must be under 10 MB." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to submit payments." };
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Your role can't submit payments." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  // Get or create subscription
  const { data: existingSub } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("clinic_id", access.clinic.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let subscriptionId = existingSub?.id;
  if (!subscriptionId) {
    // Get the cheapest plan as default
    const { data: defaultPlan } = await supabase
      .from("subscription_plans")
      .select("id")
      .eq("active", true)
      .order("price", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!defaultPlan) {
      return { ok: false, message: "No subscription plans available." };
    }

    const { data: newSub, error: subError } = await supabase
      .from("subscriptions")
      .insert({
        clinic_id: access.clinic.id,
        plan_id: defaultPlan.id,
        status: "pending_payment",
      })
      .select("id")
      .single();

    if (subError || !newSub) {
      return { ok: false, message: "Failed to create subscription." };
    }
    subscriptionId = newSub.id;
  }

  // Generate a unique id for this submission (used in storage path & record)
  const submissionId = crypto.randomUUID();
  const fileExt = proofFile.name.split(".").pop() ?? "bin";
  const storagePath = `${access.clinic.id}/${submissionId}/${submissionId}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from("payment-proofs")
    .upload(storagePath, proofFile, { upsert: false });

  if (uploadError) {
    return { ok: false, message: "Failed to upload proof file. Please try again." };
  }

  const { data: submission, error: insertError } = await supabase
    .from("payment_submissions")
    .insert({
      id: submissionId,
      clinic_id: access.clinic.id,
      subscription_id: subscriptionId,
      payment_method_id: parsed.data.paymentMethodId,
      amount: parsed.data.amount,
      sender_name: parsed.data.senderName,
      sender_phone: parsed.data.senderPhone,
      transaction_reference: parsed.data.transactionReference,
      notes: parsed.data.notes || null,
      proof_file_path: storagePath,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError) {
    return { ok: false, message: "Failed to record payment submission." };
  }

  // Update subscription status
  await supabase
    .from("subscriptions")
    .update({ status: "payment_submitted" })
    .eq("id", subscriptionId);

  // Log billing event
  await supabase.from("billing_events").insert({
    subscription_id: subscriptionId,
    payment_submission_id: submission.id,
    event_type: "payment_submitted",
    actor_user_id: user.id,
    metadata: {
      amount: parsed.data.amount,
      sender_name: parsed.data.senderName,
      payment_method_id: parsed.data.paymentMethodId,
    },
  });

  // Fire-and-forget notification; don't block the action on failure
  try {
    const { notifyPatient } = await import("@/lib/notifications");
    await notifyPatient({
      clinicId: access.clinic.id,
      channel: "email",
      type: "payment_submitted",
      payload: {
        clinicId: access.clinic.id,
        clinicName: access.clinic.name,
        submissionId: submission.id,
        amount: parsed.data.amount,
      },
    });
  } catch {
    // Email service may not exist yet; ignore
  }

  return { ok: true, data: submission.id };
}

// ---------------------------------------------------------------------------
// 4. getSubmissionsAction – auth + clinic
// ---------------------------------------------------------------------------

export async function getSubmissionsAction(): Promise<
  ActionResult<PaymentSubmission[]>
> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to view submissions." };

  const { data, error } = await supabase
    .from("payment_submissions")
    .select("*")
    .eq("clinic_id", access.clinic.id)
    .order("created_at", { ascending: false });

  if (error) {
    return { ok: false, message: "Failed to load submissions." };
  }
  return { ok: true, data: data ?? [] };
}

// ---------------------------------------------------------------------------
// 5. getSubscriptionAction – auth + clinic
// ---------------------------------------------------------------------------

export async function getSubscriptionAction(): Promise<
  ActionResult<{ subscription: Subscription | null; plan: SubscriptionPlan | null }>
> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to view your subscription." };

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*, plan:subscription_plans(*)")
    .eq("clinic_id", access.clinic.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const plan = subscription && typeof subscription === "object" && "plan" in subscription
    ? (subscription as Record<string, unknown>).plan as SubscriptionPlan | null
    : null;

  return {
    ok: true,
    data: {
      subscription: (subscription as Subscription) ?? null,
      plan,
    },
  };
}

// ---------------------------------------------------------------------------
// 6. getAdminSubmissionsAction – auth + platform admin
// ---------------------------------------------------------------------------

export async function getAdminSubmissionsAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult<PaymentSubmission[]>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  const admin = await isPlatformAdmin(supabase, user.id);
  if (!admin) return { ok: false, message: "You don't have admin access." };

  const statusFilter = (formData.get("status") as string) || "";

  let query = supabase
    .from("payment_submissions")
    .select("*")
    .order("created_at", { ascending: false });

  if (statusFilter) {
    query = query.eq("status", statusFilter as PaymentSubmission["status"]);
  }

  const { data, error } = await query;

  if (error) {
    return { ok: false, message: "Failed to load submissions." };
  }
  return { ok: true, data: data ?? [] };
}

// ---------------------------------------------------------------------------
// 7. approvePaymentAction – auth + platform admin
// ---------------------------------------------------------------------------

export async function approvePaymentAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const submissionId = (formData.get("submissionId") as string) || "";
  if (!submissionId) {
    return { ok: false, message: "Missing submission id." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  const admin = await isPlatformAdmin(supabase, user.id);
  if (!admin) return { ok: false, message: "You don't have admin access." };

  const { data: submission, error: fetchError } = await supabase
    .from("payment_submissions")
    .select("*")
    .eq("id", submissionId)
    .single();

  if (fetchError || !submission) {
    return { ok: false, message: "Submission not found." };
  }

  const { error: updateError } = await supabase
    .from("payment_submissions")
    .update({
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", submissionId);

  if (updateError) {
    return { ok: false, message: "Failed to update submission status." };
  }

  // Activate subscription
  try {
    await supabase.rpc("activate_subscription", {
      p_subscription_id: submission.subscription_id,
      p_duration_days: 30,
    });
  } catch {
    // Function may not exist yet; subscription activation is best-effort
  }

  // Log billing event
  await supabase.from("billing_events").insert({
    subscription_id: submission.subscription_id,
    payment_submission_id: submissionId,
    event_type: "payment_approved",
    actor_user_id: user.id,
    metadata: { amount: submission.amount },
  });

  try {
    const { notifyPatient } = await import("@/lib/notifications");
    await notifyPatient({
      clinicId: submission.clinic_id,
      channel: "email",
      type: "payment_approved",
      payload: {
        clinicId: submission.clinic_id,
        submissionId,
        amount: submission.amount,
      },
    });
  } catch {
    // Email service may not exist yet; ignore
  }

  return { ok: true, data: submissionId };
}

// ---------------------------------------------------------------------------
// 8. rejectPaymentAction – auth + platform admin
// ---------------------------------------------------------------------------

export async function rejectPaymentAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const parsed = rejectionSchema.safeParse({
    submissionId: formData.get("submissionId") ?? "",
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the rejection details and try again.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  const admin = await isPlatformAdmin(supabase, user.id);
  if (!admin) return { ok: false, message: "You don't have admin access." };

  const { data: submission, error: fetchError } = await supabase
    .from("payment_submissions")
    .select("*")
    .eq("id", parsed.data.submissionId)
    .single();

  if (fetchError || !submission) {
    return { ok: false, message: "Submission not found." };
  }

  const { error: updateError } = await supabase
    .from("payment_submissions")
    .update({
      status: "rejected",
      rejection_reason: parsed.data.reason,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.submissionId);

  if (updateError) {
    return { ok: false, message: "Failed to update submission status." };
  }

  // Log billing event
  await supabase.from("billing_events").insert({
    subscription_id: submission.subscription_id,
    payment_submission_id: parsed.data.submissionId,
    event_type: "payment_rejected",
    actor_user_id: user.id,
    metadata: {
      amount: submission.amount,
      reason: parsed.data.reason,
    },
  });

  try {
    const { notifyPatient } = await import("@/lib/notifications");
    await notifyPatient({
      clinicId: submission.clinic_id,
      channel: "email",
      type: "payment_rejected",
      payload: {
        clinicId: submission.clinic_id,
        submissionId: parsed.data.submissionId,
        reason: parsed.data.reason,
      },
    });
  } catch {
    // Email service may not exist yet; ignore
  }

  return { ok: true, data: parsed.data.submissionId };
}

// ---------------------------------------------------------------------------
// 9. getAdminPaymentMethodsAction – auth + platform admin
// ---------------------------------------------------------------------------

export async function getAdminPaymentMethodsAction(): Promise<
  ActionResult<PaymentMethod[]>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  const admin = await isPlatformAdmin(supabase, user.id);
  if (!admin) return { ok: false, message: "You don't have admin access." };

  const { data, error } = await supabase
    .from("payment_methods")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    return { ok: false, message: "Failed to load payment methods." };
  }
  return { ok: true, data: data ?? [] };
}

// ---------------------------------------------------------------------------
// 10. savePaymentMethodAction – auth + platform admin
// ---------------------------------------------------------------------------

export async function savePaymentMethodAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const parsed = paymentMethodSchema.safeParse({
    id: formData.get("id") ?? "",
    type: formData.get("type") ?? "",
    name: formData.get("name") ?? "",
    accountTitle: formData.get("accountTitle") ?? "",
    accountNumber: formData.get("accountNumber") ?? "",
    iban: formData.get("iban") ?? "",
    instructions: formData.get("instructions") ?? "",
    active: formData.get("active") === "true" || formData.get("active") === "on",
    sortOrder: formData.get("sortOrder") !== null
      ? Number(formData.get("sortOrder"))
      : 0,
  });
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the payment method details and try again.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  const admin = await isPlatformAdmin(supabase, user.id);
  if (!admin) return { ok: false, message: "You don't have admin access." };

  const existingId = parsed.data.id || undefined;

  const upsertPayload = {
    type: parsed.data.type as PaymentMethod["type"],
    name: parsed.data.name,
    account_title: parsed.data.accountTitle || null,
    account_number: parsed.data.accountNumber || null,
    iban: parsed.data.iban || null,
    instructions: parsed.data.instructions || null,
    active: parsed.data.active,
    sort_order: parsed.data.sortOrder,
  };

  if (existingId) {
    const { error } = await supabase
      .from("payment_methods")
      .update(upsertPayload)
      .eq("id", existingId);
    if (error) {
      return { ok: false, message: "Failed to update payment method." };
    }
    return { ok: true, data: existingId };
  }

  const { data: inserted, error } = await supabase
    .from("payment_methods")
    .insert(upsertPayload)
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, message: "Failed to create payment method." };
  }
  return { ok: true, data: inserted.id };
}

// ---------------------------------------------------------------------------
// 11. deletePaymentMethodAction – auth + platform admin (soft delete)
// ---------------------------------------------------------------------------

export async function deletePaymentMethodAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const methodId = (formData.get("methodId") as string) || "";
  if (!methodId) {
    return { ok: false, message: "Missing payment method id." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  const admin = await isPlatformAdmin(supabase, user.id);
  if (!admin) return { ok: false, message: "You don't have admin access." };

  const { error } = await supabase
    .from("payment_methods")
    .update({ active: false })
    .eq("id", methodId);

  if (error) {
    return { ok: false, message: "Failed to delete payment method." };
  }
  return { ok: true, data: methodId };
}
