"use server";

import { redirect } from "next/navigation";

import { APP_ROUTES, slugify } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { clinicSchema } from "@/lib/validation/schemas";
import type { ActionResult } from "@/types";

export async function createClinicAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = clinicSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    doctorName: formData.get("doctorName"),
    timezone: formData.get("timezone"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    address: formData.get("address"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      message: issue?.message ?? "Check your details and try again.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "You must be signed in to create a clinic." };
  }

  const slug = parsed.data.slug.length > 0 ? parsed.data.slug : slugify(parsed.data.name);

  const { data: clinic, error: clinicError } = await supabase
    .from("clinics")
    .insert({
      name: parsed.data.name,
      slug,
      doctor_name: parsed.data.doctorName || null,
      timezone: parsed.data.timezone,
      phone: parsed.data.phone || null,
      email: parsed.data.email,
      address: parsed.data.address || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (clinicError) {
    console.error("[createClinicAction] clinics insert failed", {
      code: clinicError.code,
      message: clinicError.message,
      details: clinicError.details,
      hint: clinicError.hint,
      slug,
    });
    if (clinicError.code === "23505") {
      return {
        ok: false,
        message: "That clinic URL is already taken. Try a different slug.",
      };
    }
    return { ok: false, message: "We couldn't create your clinic. Please try again." };
  }

  // Second half of the bootstrap: link the creator as owner. Authorized by the
  // `clinic_members_insert_founder` RLS policy (creator + owner + self).
  const { error: memberError } = await supabase
    .from("clinic_members")
    .insert({
      clinic_id: clinic.id,
      user_id: user.id,
      role: "owner",
      // Denormalized for the roster UI; falls back to the clinic contact.
      email: user.email ?? parsed.data.email,
    });

  if (memberError) {
    console.error("[createClinicAction] clinic_members insert failed", {
      clinicId: clinic.id,
      code: memberError.code,
      message: memberError.message,
      details: memberError.details,
      hint: memberError.hint,
    });
    // Best-effort rollback so a failed bootstrap cannot leave orphan clinics.
    const { error: rollbackError } = await supabase
      .from("clinics")
      .delete()
      .eq("id", clinic.id);
    if (rollbackError) {
      console.error("[createClinicAction] rollback delete failed", {
        clinicId: clinic.id,
        code: rollbackError.code,
        message: rollbackError.message,
      });
    }
    return {
      ok: false,
      message: "We couldn't link you to your clinic. Please try again.",
    };
  }

  redirect(APP_ROUTES.app.dashboard);
}
