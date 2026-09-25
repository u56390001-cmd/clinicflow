"use server";

import { getCurrentClinic, canWriteClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import {
  clinicSettingsSchema,
  googleReviewUrlSchema,
} from "@/lib/validation/schemas";
import type { ActionResult } from "@/types";

/**
 * Save clinic profile (Clinic Settings). The clinic is resolved from the
 * signed-in user's membership — the client never supplies a clinic id. Only
 * owner/admin may edit; RLS on `clinics` enforces the same rule.
 * A blank slug keeps the clinic's current slug.
 */
export async function updateClinicAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = clinicSettingsSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    doctorName: formData.get("doctorName"),
    timezone: formData.get("timezone"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    address: formData.get("address"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check your details and try again.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to edit settings." };
  }
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can edit clinic settings.",
    };
  }

  const slug = parsed.data.slug.length > 0 ? parsed.data.slug : access.clinic.slug;

  const { error } = await supabase
    .from("clinics")
    .update({
      name: parsed.data.name,
      slug,
      doctor_name: parsed.data.doctorName || null,
      timezone: parsed.data.timezone,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      address: parsed.data.address || null,
    })
    .eq("id", access.clinic.id);

  if (error) {
    console.error("[updateClinicAction] clinics update failed", {
      clinicId: access.clinic.id,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    if (error.code === "23505") {
      return {
        ok: false,
        message: "That clinic URL is already taken. Try a different slug.",
      };
    }
    return {
      ok: false,
      message: "We couldn't save your clinic settings. Please try again.",
    };
  }

  return { ok: true, data: undefined };
}

/**
 * Save the Google review link used by the QR engagement tool (Phase 16).
 * A blank value clears the saved link. Owner/admin only — same rule the
 * `clinics` RLS policies enforce.
 */
export async function saveGoogleReviewUrlAction(
  url: string,
): Promise<ActionResult> {
  const parsed = googleReviewUrlSchema.safeParse({ url });
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Enter a valid review link and try again.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to edit settings." };
  }
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can edit clinic settings.",
    };
  }

  const { error } = await supabase
    .from("clinics")
    .update({ google_review_url: parsed.data.url || null })
    .eq("id", access.clinic.id);

  if (error) {
    console.error("[saveGoogleReviewUrlAction] clinics update failed", {
      clinicId: access.clinic.id,
      code: error.code,
      message: error.message,
    });
    return {
      ok: false,
      message: "We couldn't save the review link. Please try again.",
    };
  }

  return { ok: true, data: undefined };
}
