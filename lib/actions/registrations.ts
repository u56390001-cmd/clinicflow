"use server";

/**
 * Registration funnel (migration 0109).
 *
 * There is no payment gateway, so a clinic joins in four steps:
 *
 *   1. the visitor picks a plan,
 *   2. picks a payment method (bank transfer / JazzCash / Easypaisa),
 *   3. fills in their details and uploads the payment receipt,
 *   4. a platform admin verifies the payment and approves.
 *
 * Only step 4 creates anything: the auth user, the clinic, the owner
 * membership and the active subscription are provisioned by the approving
 * admin, and the credentials are emailed to the applicant. Until then the
 * applicant has no account and therefore no access to the app.
 *
 * Every privileged write here goes through the service-role key (the
 * applicant is not a clinic member yet, so the tenant policies do not apply)
 * and is gated on the caller being a platform admin.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { RESERVED_CLINIC_SLUGS, slugify } from "@/lib/constants";
import { sendAccountCredentialsEmail, sendRegistrationRejectedEmail } from "@/lib/email/send";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service-scoped";
import {
  registrationRejectionSchema,
  registrationRequestSchema,
} from "@/lib/validation/schemas";
import type { ActionResult } from "@/types";
import type {
  Database,
  PaymentMethod,
  RegistrationRequest,
  SubscriptionPlan,
} from "@/types/database";

type TypedClient = SupabaseClient<Database>;

const ALLOWED_FILE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "pdf", "heic", "heif"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_SLUG_ATTEMPTS = 6;
const REFERENCE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TEMP_PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Days granted per billing interval. */
const PERIOD_DAYS: Record<string, number> = {
  monthly: 30,
  quarterly: 90,
  annual: 365,
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function randomString(length: number, alphabet: string): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(
    bytes,
    (byte) => alphabet[byte % alphabet.length],
  ).join("");
}

/**
 * A short, human-quotable code the applicant can use to check on their
 * request. Ambiguous characters (0/O, 1/I) are excluded.
 */
function generateReferenceCode(): string {
  return `MED-${randomString(6, REFERENCE_CODE_ALPHABET)}`;
}

/**
 * A temporary password that is easy enough to retype from an email: 12
 * characters drawn from an unambiguous alphabet, with at least one lowercase,
 * one uppercase and one digit guaranteed.
 */
function generateTemporaryPassword(): string {
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const rest = TEMP_PASSWORD_ALPHABET;
  return [
    lower[crypto.getRandomValues(new Uint32Array(1))[0] % lower.length],
    upper[crypto.getRandomValues(new Uint32Array(1))[0] % upper.length],
    digits[crypto.getRandomValues(new Uint32Array(1))[0] % digits.length],
    randomString(9, rest),
  ].join("");
}

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

/** Resolve the calling platform admin, or return an error message. */
async function requirePlatformAdmin(
  supabase: TypedClient,
): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You must be signed in." };
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return { ok: false, message: "You don't have admin access." };
  }
  return { ok: true, userId: user.id };
}

/**
 * Find an existing auth user by email. The Admin API has no email filter, so
 * the list is paged through. Returns null when the address is unknown.
 */
async function findAuthUserByEmail(
  service: TypedClient,
  email: string,
): Promise<{ id: string } | null> {
  const perPage = 100;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users?.length) return null;
    const match = data.users.find(
      (candidate) =>
        candidate.email?.toLowerCase() === email.toLowerCase(),
    );
    if (match) return { id: match.id };
    if (data.users.length < perPage) return null;
  }
  return null;
}

/** Create the clinic for a newly provisioned user, retrying slug collisions. */
async function createClinicForUser(
  service: TypedClient,
  params: {
    ownerUserId: string;
    clinicName: string;
    email: string;
    phone: string;
    address: string | null;
  },
): Promise<{ ok: true; clinicId: string } | { ok: false; message: string }> {
  const baseSlug = slugify(params.clinicName) || "clinic";
  const safeBase = RESERVED_CLINIC_SLUGS.has(baseSlug) ? `${baseSlug}-clinic` : baseSlug;

  let lastError: { code?: string; message?: string } | null = null;
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = attempt === 0 ? safeBase : `${safeBase}-${attempt + 1}`;
    const { data, error } = await service
      .from("clinics")
      .insert({
        name: params.clinicName,
        slug,
        email: params.email,
        phone: params.phone,
        address: params.address,
        timezone: "Asia/Karachi",
        created_by: params.ownerUserId,
      })
      .select("id")
      .single();

    if (!error && data) return { ok: true, clinicId: data.id };
    lastError = error;
    if (error?.code !== "23505") break;
  }

  console.error("[registrations] clinic insert failed", lastError);
  return {
    ok: false,
    message: "We couldn't create the clinic for this request. Please try again.",
  };
}

/* -------------------------------------------------------------------------- */
/*  1. Public: the plan + payment method catalogue                           */
/* -------------------------------------------------------------------------- */

export async function getRegistrationOptionsAction(): Promise<
  ActionResult<{ plans: SubscriptionPlan[]; paymentMethods: PaymentMethod[] }>
> {
  const supabase = await createClient();

  const { data: plans, error: plansError } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("active", true)
    .order("price", { ascending: true });

  if (plansError) {
    return { ok: false, message: "Failed to load subscription plans." };
  }

  const { data: paymentMethods, error: methodsError } = await supabase
    .from("payment_methods")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (methodsError) {
    return { ok: false, message: "Failed to load payment methods." };
  }

  return {
    ok: true,
    data: { plans: plans ?? [], paymentMethods: paymentMethods ?? [] },
  };
}

/* -------------------------------------------------------------------------- */
/*  2. Public: file the registration request                                  */
/* -------------------------------------------------------------------------- */

export async function submitRegistrationAction(
  formData: FormData,
): Promise<ActionResult<{ referenceCode: string }>> {
  const parsed = registrationRequestSchema.safeParse({
    fullName: formData.get("fullName") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    clinicName: formData.get("clinicName") ?? "",
    clinicAddress: formData.get("clinicAddress") ?? "",
    planId: formData.get("planId") ?? "",
    paymentMethodId: formData.get("paymentMethodId") ?? "",
    senderName: formData.get("senderName") ?? "",
    senderPhone: formData.get("senderPhone") ?? "",
    transactionReference: formData.get("transactionReference") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check your details and try again.",
    };
  }

  const proof = formData.get("proof") as File | null;
  if (!proof || proof.size === 0) {
    return { ok: false, message: "Please upload your payment receipt." };
  }
  // Any image or a PDF is accepted. The extension is the fallback for the
  // files the browser reports without a MIME type.
  const proofType = proof.type ?? "";
  const proofExtension = proof.name.split(".").pop()?.toLowerCase() ?? "";
  const proofSupported =
    proofType.startsWith("image/") ||
    proofType === "application/pdf" ||
    ALLOWED_FILE_EXTENSIONS.includes(proofExtension);
  if (!proofSupported) {
    return { ok: false, message: "The receipt must be an image or a PDF file." };
  }
  if (proof.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      message: "The receipt file must be under 10 MB — try a smaller screenshot.",
    };
  }

  const service = createServiceClient();
  const data = parsed.data;

  // The plan is the single source of truth for the amount — resolve it here so
  // the row we write already carries the right price, and so an inactive plan
  // can never be ordered.
  const { data: plan } = await service
    .from("subscription_plans")
    .select("*")
    .eq("id", data.planId)
    .eq("active", true)
    .maybeSingle();

  if (!plan) {
    return { ok: false, message: "That plan is no longer available. Please pick another." };
  }

  const { data: method } = await service
    .from("payment_methods")
    .select("*")
    .eq("id", data.paymentMethodId)
    .eq("active", true)
    .maybeSingle();

  if (!method) {
    return { ok: false, message: "That payment method is no longer available." };
  }

  // One open request per email address — otherwise a double submit creates two
  // requests that race for the same account.
  const { data: openRequest } = await service
    .from("registration_requests")
    .select("reference_code, status")
    .eq("email", data.email)
    .eq("status", "pending")
    .maybeSingle();

  if (openRequest) {
    return {
      ok: false,
      message: `You already have a request in review (reference ${openRequest.reference_code}). We'll email you once it's approved.`,
    };
  }

  // Allocate a reference code (unique, so retry on the rare collision).
  let referenceCode = generateReferenceCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: clash } = await service
      .from("registration_requests")
      .select("id")
      .eq("reference_code", referenceCode)
      .maybeSingle();
    if (!clash) break;
    referenceCode = generateReferenceCode();
  }

  const fileExt = proof.name.split(".").pop()?.toLowerCase() ?? "bin";
  const storagePath = `${referenceCode}/${crypto.randomUUID()}.${fileExt}`;

  const { error: uploadError } = await service.storage
    .from("registration-proofs")
    .upload(storagePath, proof, { upsert: false, contentType: proof.type });

  if (uploadError) {
    console.error("[registrations] proof upload failed", uploadError);
    return {
      ok: false,
      message: "We couldn't upload your receipt. Please try again.",
    };
  }

  const { error: insertError } = await service.from("registration_requests").insert({
    reference_code: referenceCode,
    full_name: data.fullName,
    email: data.email,
    phone: data.phone,
    clinic_name: data.clinicName,
    clinic_address: data.clinicAddress || null,
    plan_id: data.planId,
    payment_method_id: data.paymentMethodId,
    amount: plan.price,
    currency: plan.currency,
    sender_name: data.senderName,
    sender_phone: data.senderPhone,
    transaction_reference: data.transactionReference,
    notes: data.notes || null,
    proof_file_path: storagePath,
    status: "pending",
  });

  if (insertError) {
    console.error("[registrations] insert failed", insertError);
    await service.storage.from("registration-proofs").remove([storagePath]);
    return {
      ok: false,
      message: "We couldn't submit your request. Please try again.",
    };
  }

  return { ok: true, data: { referenceCode } };
}

/* -------------------------------------------------------------------------- */
/*  3. Public: status lookup by reference code                                */
/* -------------------------------------------------------------------------- */

export type RegistrationStatusView = {
  referenceCode: string;
  status: "pending" | "approved" | "rejected";
  clinicName: string;
  planName: string;
  amount: number;
  currency: string;
  createdAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
};

export async function getRegistrationStatusAction(
  referenceCode: string,
): Promise<ActionResult<RegistrationStatusView>> {
  const code = (referenceCode ?? "").trim().toUpperCase();
  if (!code) {
    return { ok: false, message: "Enter the reference code from your request." };
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc("get_registration_status", {
    p_reference_code: code,
  });

  if (error) {
    console.error("[registrations] status lookup failed", error);
    return { ok: false, message: "We couldn't look up that reference code." };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { ok: false, message: "We couldn't find a request with that reference code." };
  }

  return {
    ok: true,
    data: {
      referenceCode: row.reference_code,
      status: row.status,
      clinicName: row.clinic_name,
      planName: row.plan_name,
      amount: Number(row.amount),
      currency: row.currency,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
      rejectionReason: row.rejection_reason,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  4. Admin: the approval queue                                              */
/* -------------------------------------------------------------------------- */

export async function getAdminRegistrationsAction(
  formData?: FormData,
): Promise<ActionResult<RegistrationRequest[]>> {
  const supabase = await createClient();
  const admin = await requirePlatformAdmin(supabase);
  if (!admin.ok) return { ok: false, message: admin.message };

  const statusFilter = (formData?.get("status") as string) || "";

  let query = supabase
    .from("registration_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (statusFilter) {
    query = query.eq("status", statusFilter as RegistrationRequest["status"]);
  }

  const { data, error } = await query;
  if (error) {
    return { ok: false, message: "Failed to load registration requests." };
  }
  return { ok: true, data: (data ?? []) as RegistrationRequest[] };
}

/* -------------------------------------------------------------------------- */
/*  5. Admin: approve — provision the account, clinic and subscription        */
/* -------------------------------------------------------------------------- */

export async function approveRegistrationAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const registrationId = (formData.get("registrationId") as string) || "";
  if (!registrationId) {
    return { ok: false, message: "Missing registration id." };
  }

  const supabase = await createClient();
  const admin = await requirePlatformAdmin(supabase);
  if (!admin.ok) return { ok: false, message: admin.message };

  const { data: registration, error: fetchError } = await supabase
    .from("registration_requests")
    .select("*")
    .eq("id", registrationId)
    .single();

  if (fetchError || !registration) {
    return { ok: false, message: "Registration request not found." };
  }
  if (registration.status !== "pending") {
    return { ok: false, message: "This request has already been reviewed." };
  }

  const service = createServiceClient();
  const temporaryPassword = generateTemporaryPassword();

  // 1. The account. If the address is already known (e.g. the applicant
  //    signed up before this flow existed) we re-key the existing account
  //    instead of failing the approval.
  let userId: string;
  const existingUser = await findAuthUserByEmail(service, registration.email);
  if (existingUser) {
    const { error } = await service.auth.admin.updateUserById(existingUser.id, {
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: registration.full_name,
        clinic_name: registration.clinic_name,
        must_change_password: true,
      },
    });
    if (error) {
      console.error("[registrations] password reset failed", error);
      return { ok: false, message: "We couldn't set the account password." };
    }
    userId = existingUser.id;
  } else {
    const { data, error } = await service.auth.admin.createUser({
      email: registration.email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: registration.full_name,
        clinic_name: registration.clinic_name,
        must_change_password: true,
      },
    });
    if (error || !data?.user) {
      console.error("[registrations] account creation failed", error);
      return {
        ok: false,
        message: "We couldn't create the account for this request.",
      };
    }
    userId = data.user.id;
  }

  // 2. The clinic.
  const clinic = await createClinicForUser(service, {
    ownerUserId: userId,
    clinicName: registration.clinic_name,
    email: registration.email,
    phone: registration.phone,
    address: registration.clinic_address,
  });
  if (!clinic.ok) {
    return { ok: false, message: clinic.message };
  }

  // 3. The owner membership.
  const { error: memberError } = await service.from("clinic_members").insert({
    clinic_id: clinic.clinicId,
    user_id: userId,
    role: "owner",
    email: registration.email,
    permissions: {},
  });

  if (memberError) {
    console.error("[registrations] owner membership failed", memberError);
    return {
      ok: false,
      message: "We couldn't link the account to the clinic. Please try again.",
    };
  }

  // 4. The subscription — active from the moment of approval.
  const { data: plan } = await service
    .from("subscription_plans")
    .select("*")
    .eq("id", registration.plan_id)
    .single();

  const durationDays = PERIOD_DAYS[plan?.billing_interval ?? "monthly"] ?? 30;
  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  periodEnd.setDate(periodEnd.getDate() + durationDays);

  const { data: subscription, error: subscriptionError } = await service
    .from("subscriptions")
    .insert({
      clinic_id: clinic.clinicId,
      plan_id: registration.plan_id,
      status: "active",
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
    })
    .select("id")
    .single();

  if (subscriptionError || !subscription) {
    console.error("[registrations] subscription failed", subscriptionError);
    return {
      ok: false,
      message: "We couldn't start the subscription. Please try again.",
    };
  }

  // 5. Close the request.
  const { error: updateError } = await service
    .from("registration_requests")
    .update({
      status: "approved",
      reviewed_by: admin.userId,
      reviewed_at: new Date().toISOString(),
      user_id: userId,
      clinic_id: clinic.clinicId,
      subscription_id: subscription.id,
      provisioned_at: new Date().toISOString(),
    })
    .eq("id", registrationId);

  if (updateError) {
    console.error("[registrations] approval update failed", updateError);
    return { ok: false, message: "We couldn't record the approval." };
  }

  await service.from("billing_events").insert({
    subscription_id: subscription.id,
    event_type: "registration_approved",
    actor_user_id: admin.userId,
    metadata: {
      registration_id: registrationId,
      reference_code: registration.reference_code,
      plan_id: registration.plan_id,
      amount: registration.amount,
    },
  });

  // 6. The credentials. The password is never stored — if this email fails,
  //    the admin can issue a fresh one with `resendCredentialsAction`.
  const emailResult = await sendAccountCredentialsEmail({
    to: registration.email,
    fullName: registration.full_name,
    clinicName: registration.clinic_name,
    temporaryPassword,
    planName: plan?.name ?? "Subscription",
    amount: Number(registration.amount),
    currency: registration.currency,
    periodEnd,
  });

  if (!emailResult.ok) {
    return {
      ok: false,
      message:
        "The account is ready but we couldn't email the credentials. Use 'Resend credentials' to send them again.",
    };
  }

  return { ok: true, data: registrationId };
}

/* -------------------------------------------------------------------------- */
/*  6. Admin: reject                                                          */
/* -------------------------------------------------------------------------- */

export async function rejectRegistrationAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const parsed = registrationRejectionSchema.safeParse({
    registrationId: formData.get("registrationId") ?? "",
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
  const admin = await requirePlatformAdmin(supabase);
  if (!admin.ok) return { ok: false, message: admin.message };

  const { data: registration } = await supabase
    .from("registration_requests")
    .select("*")
    .eq("id", parsed.data.registrationId)
    .single();

  if (!registration) {
    return { ok: false, message: "Registration request not found." };
  }
  if (registration.status !== "pending") {
    return { ok: false, message: "This request has already been reviewed." };
  }

  const { error } = await supabase
    .from("registration_requests")
    .update({
      status: "rejected",
      rejection_reason: parsed.data.reason,
      reviewed_by: admin.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.registrationId);

  if (error) {
    return { ok: false, message: "Failed to reject this request." };
  }

  const { data: plan } = await supabase
    .from("subscription_plans")
    .select("name")
    .eq("id", registration.plan_id)
    .maybeSingle();

  await sendRegistrationRejectedEmail({
    to: registration.email,
    fullName: registration.full_name,
    clinicName: registration.clinic_name,
    planName: plan?.name ?? "Subscription",
    reason: parsed.data.reason,
  });

  return { ok: true, data: parsed.data.registrationId };
}

/* -------------------------------------------------------------------------- */
/*  7. Admin: re-issue the credentials                                        */
/* -------------------------------------------------------------------------- */

export async function resendCredentialsAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const registrationId = (formData.get("registrationId") as string) || "";
  if (!registrationId) {
    return { ok: false, message: "Missing registration id." };
  }

  const supabase = await createClient();
  const admin = await requirePlatformAdmin(supabase);
  if (!admin.ok) return { ok: false, message: admin.message };

  const { data: registration } = await supabase
    .from("registration_requests")
    .select("*")
    .eq("id", registrationId)
    .single();

  if (!registration) {
    return { ok: false, message: "Registration request not found." };
  }
  if (registration.status !== "approved" || !registration.user_id) {
    return { ok: false, message: "This request has no account yet." };
  }

  const service = createServiceClient();
  const temporaryPassword = generateTemporaryPassword();

  const { error } = await service.auth.admin.updateUserById(registration.user_id, {
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      must_change_password: true,
    },
  });

  if (error) {
    console.error("[registrations] credential re-issue failed", error);
    return { ok: false, message: "We couldn't set a new password." };
  }

  const { data: plan } = await service
    .from("subscription_plans")
    .select("*")
    .eq("id", registration.plan_id)
    .maybeSingle();

  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + (PERIOD_DAYS[plan?.billing_interval ?? "monthly"] ?? 30));

  const emailResult = await sendAccountCredentialsEmail({
    to: registration.email,
    fullName: registration.full_name,
    clinicName: registration.clinic_name,
    temporaryPassword,
    planName: plan?.name ?? "Subscription",
    amount: Number(registration.amount),
    currency: registration.currency,
    periodEnd,
  });

  if (!emailResult.ok) {
    return { ok: false, message: "We couldn't email the new credentials." };
  }

  return { ok: true, data: registrationId };
}
