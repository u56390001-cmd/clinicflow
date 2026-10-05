"use server";

import { headers } from "next/headers";
import { LOGO_BUCKET, readClinicLogoPath } from "@/lib/clinic-logo";
import { getCurrentClinic, canWriteClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import {
  BILL_TERMS_MAX_WORDS,
  billingSettingsSchema,
  clinicSettingsSchema,
  countWords,
  googleReviewUrlSchema,
  patientCodeSettingsSchema,
  prescriptionSettingsSchema,
} from "@/lib/validation/schemas";
import type { ActionResult } from "@/types";

/** 2 MiB. Matches the bucket's `file_size_limit` and the on-screen hint. */
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Only the two raster types the UI advertises. SVG is deliberately excluded —
 * it is a script-bearing document format and this bucket is world-readable, so
 * an uploaded SVG would be stored XSS on every page that renders the logo.
 */
const LOGO_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
};

/**
 * Save clinic profile (Clinic Settings). The clinic is resolved from the
 * signed-in user's membership — the client never supplies a clinic id. Only
 * owner/admin may edit; RLS on `clinics` enforces the same rule.
 * A blank slug keeps the clinic's current slug.
 *
 * `timezone` is intentionally NOT part of this form any more — it moved to the
 * "Timezone & Working Hours" card, which saves it through
 * `saveTimezoneWorkingHoursAction`. A submitted value still wins so the old
 * markup keeps working, but the field resolves to the clinic's stored timezone
 * rather than `null`, which `clinicSettingsSchema` would reject.
 */
export async function updateClinicAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
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

  const submittedTimezone = formData.get("timezone");
  const parsed = clinicSettingsSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    doctorName: formData.get("doctorName"),
    timezone:
      typeof submittedTimezone === "string" && submittedTimezone.length > 0
        ? submittedTimezone
        : access.clinic.timezone,
    phone: formData.get("phone"),
    email: formData.get("email"),
    address: formData.get("address"),
  });
  if (!parsed.success) {
    // One message per field, keyed by the form's own input name, so the form can
    // paint the message on the control that caused it. The first issue is kept
    // as the summary because it is the one worth reading in the banner.
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check your details and try again.",
      fieldErrors,
    };
  }

  const slug =
    parsed.data.slug.length > 0 ? parsed.data.slug : access.clinic.slug;

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
 * Upload a clinic logo and point `clinics.logo_url` at it.
 *
 * The object key is generated here, never taken from the client, so a caller
 * cannot make the row reference an arbitrary bucket or another clinic's asset.
 * Keys are `{clinic_id}/{uuid}.{ext}` — segment 1 is the tenant boundary the
 * storage RLS policies in 0054 re-derive. Uploading replaces the previous
 * logo, and the old object is removed only after the new row has committed so a
 * failed write never leaves the clinic with no image.
 */
export async function uploadClinicLogoAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to upload a logo." };
  }
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can change the clinic logo.",
    };
  }

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a logo file to upload." };
  }

  const extension = LOGO_EXTENSIONS[file.type];
  if (!extension) {
    return {
      ok: false,
      message: "Logo must be a PNG or JPG image.",
    };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { ok: false, message: "Logo must be 2MB or smaller." };
  }

  const previousPath = await readClinicLogoPath(access.clinic.id);
  const objectPath = `${access.clinic.id}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(objectPath, file, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });

  if (uploadError) {
    console.error("[uploadClinicLogoAction] storage upload failed", {
      clinicId: access.clinic.id,
      code: uploadError.status,
      message: uploadError.message,
    });
    return {
      ok: false,
      message: "We couldn't upload that logo. Please try again.",
    };
  }

  const { error: updateError } = await supabase
    .from("clinics")
    .update({ logo_url: objectPath })
    .eq("id", access.clinic.id);

  if (updateError) {
    // Roll the object back so an orphaned file cannot accumulate in the bucket.
    await supabase.storage.from(LOGO_BUCKET).remove([objectPath]);
    console.error("[uploadClinicLogoAction] clinics update failed", {
      clinicId: access.clinic.id,
      code: updateError.code,
      message: updateError.message,
    });
    return {
      ok: false,
      message: "We couldn't save your logo. Please try again.",
    };
  }

  // The new logo is live; only now discard the old object.
  if (previousPath && previousPath !== objectPath) {
    await supabase.storage.from(LOGO_BUCKET).remove([previousPath]);
  }

  return { ok: true, data: undefined };
}

/**
 * Clear the clinic logo and delete the stored object. The row is cleared first
 * so a storage failure can only ever leave an unreferenced file behind, never a
 * row pointing at a deleted object.
 */
export async function removeClinicLogoAction(
  _prevState: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to remove the logo." };
  }
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can change the clinic logo.",
    };
  }

  // Read the object path BEFORE clearing the row — afterwards it is already
  // null and the stored object would be orphaned in the bucket forever.
  const removedPath = await readClinicLogoPath(access.clinic.id);

  const { error: updateError } = await supabase
    .from("clinics")
    .update({ logo_url: null })
    .eq("id", access.clinic.id);

  if (updateError) {
    console.error("[removeClinicLogoAction] clinics update failed", {
      clinicId: access.clinic.id,
      code: updateError.code,
      message: updateError.message,
    });
    return {
      ok: false,
      message: "We couldn't remove your logo. Please try again.",
    };
  }

  if (removedPath) {
    await supabase.storage.from(LOGO_BUCKET).remove([removedPath]);
  }

  return { ok: true, data: undefined };
}

/**
 * Save the Patient ID prefix and format for new patients (Organization
 * settings → Patient ID).
 *
 * Only `clinics.patient_code_prefix` and `clinics.patient_code_format` are
 * written. No existing `patients.patient_code` is touched: the values already
 * issued stay exactly as they are, which is what the card's warning promises
 * and what keeps printed prescriptions and referral letters from silently
 * disagreeing with the directory after a change.
 */
export async function updatePatientCodeSettingsAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = patientCodeSettingsSchema.safeParse({
    prefix: formData.get("prefix"),
    format: formData.get("format"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Check the patient ID settings and try again.",
      fieldErrors,
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      ok: false,
      message: "You must have a clinic to edit patient IDs.",
    };
  }
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can edit patient ID settings.",
    };
  }

  const { error } = await supabase
    .from("clinics")
    .update({
      patient_code_prefix: parsed.data.prefix,
      patient_code_format: parsed.data.format,
    })
    .eq("id", access.clinic.id);

  if (error) {
    console.error("[updatePatientCodeSettingsAction] clinics update failed", {
      clinicId: access.clinic.id,
      code: error.code,
      message: error.message,
    });
    // 23514 is a check_violation — the prefix or format column rejected the
    // value. Zod should have caught both first, so reaching here means the
    // database constraint disagrees with the schema and wants a developer.
    if (error.code === "23514") {
      return {
        ok: false,
        message:
          "The database rejected that value. Please contact support if it keeps happening.",
      };
    }
    return {
      ok: false,
      message: "We couldn't save your patient ID settings. Please try again.",
    };
  }

  return { ok: true, data: undefined };
}

/**
 * Save every Organization settings → Billing field: numbering prefixes, receipt
 * preferences, GST and bill terms.
 *
 * The prefixes are saved through the same `clinics` columns the numbering
 * triggers read (migration 0056), so a change here genuinely alters what the
 * next bill and receipt are numbered — it is not a display preference. Bills
 * and receipts already issued keep their existing numbers, exactly as the
 * triggers only ever assign a value when the column is empty.
 */
export async function updateBillingSettingsAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // `formData.get` returns null for a field the browser did not submit. The GST
  // inputs are `disabled` while `show_gst_on_receipt` is off, and a disabled
  // control is never submitted — so nulls are normalised to "" here rather than
  // being allowed to fail the string/number schemas.
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };

  const raw = {
    billNumberPrefix: text("billNumberPrefix"),
    receiptPrefix: text("receiptPrefix"),
    autoSendWhatsappReceipt: text("autoSendWhatsappReceipt"),
    receiptFooterMessage: text("receiptFooterMessage"),
    showGstOnReceipt: text("showGstOnReceipt"),
    gstNumber: text("gstNumber"),
    gstRate: text("gstRate"),
    billTerms: text("billTerms"),
  };

  // The word cap is a limit the markup states on screen, so it is enforced here
  // too — a limit that only exists in the UI is not a limit.
  const terms = raw.billTerms;
  if (countWords(terms) > BILL_TERMS_MAX_WORDS) {
    return {
      ok: false,
      message: `Bill terms are limited to ${BILL_TERMS_MAX_WORDS} words.`,
      fieldErrors: {
        billTerms: `Keep terms under ${BILL_TERMS_MAX_WORDS} words.`,
      },
    };
  }

  const parsed = billingSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Check the billing settings and try again.",
      fieldErrors,
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      ok: false,
      message: "You must have a clinic to edit billing settings.",
    };
  }
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can edit billing settings.",
    };
  }

  const { error } = await supabase
    .from("clinics")
    .update({
      bill_number_prefix: parsed.data.billNumberPrefix,
      receipt_prefix: parsed.data.receiptPrefix,
      auto_send_whatsapp_receipt: parsed.data.autoSendWhatsappReceipt,
      receipt_footer_message: parsed.data.receiptFooterMessage || null,
      show_gst_on_receipt: parsed.data.showGstOnReceipt,
      // Keep the GST values even while GST is off, so switching it back on
      // does not make the owner retype them.
      gst_number: parsed.data.gstNumber || null,
      gst_rate: parsed.data.showGstOnReceipt ? parsed.data.gstRate : null,
      bill_terms: parsed.data.billTerms || null,
    })
    .eq("id", access.clinic.id);

  if (error) {
    console.error("[updateBillingSettingsAction] clinics update failed", {
      clinicId: access.clinic.id,
      code: error.code,
      message: error.message,
    });
    if (error.code === "23514") {
      return {
        ok: false,
        message:
          "The database rejected that value. Please contact support if it keeps happening.",
      };
    }
    return {
      ok: false,
      message: "We couldn't save your billing settings. Please try again.",
    };
  }

  return { ok: true, data: undefined };
}

/**
 * Save the Organization settings → Prescription print preference.
 *
 * The column is read by both print paths rather than being applied at print
 * time, so this is the only place the answer changes. Turning the header off
 * hides the clinic name, address, phone, the `PRESCRIPTION` title and the
 * patient QR together — the QR is part of that block, so leaving it behind would
 * print a QR on letterhead that already carries the clinic's identity.
 *
 * Guarded exactly like the Patient ID and Billing actions above: Zod first, then
 * the clinic resolved from membership, then the owner/admin check.
 */
export async function updatePrescriptionSettingsAction(
  _: ActionResult | null,
): Promise<ActionResult> {
  const parsed = prescriptionSettingsSchema.safeParse({
    showPrescriptionHeader: undefined as unknown as boolean, // placeholder
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Check the prescription settings and try again.",
      fieldErrors,
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      ok: false,
      message: "You must have a clinic to edit prescription settings.",
    };
  }
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can edit prescription settings.",
    };
  }

  const { error } = await supabase
    .from("clinics")
    .update({ show_prescription_header: parsed.data.showPrescriptionHeader })
    .eq("id", access.clinic.id);

  if (error) {
    console.error("[updatePrescriptionSettingsAction] clinics update failed", {
      clinicId: access.clinic.id,
      code: error.code,
      message: error.message,
    });
    return {
      ok: false,
      message: "We couldn't save your prescription settings. Please try again.",
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

/**
 * Connect a TV display to the clinic queue.
 * Generates a display token and returns a URL that can be opened on a TV to show the live queue.
 */
export async function connectTvDisplayAction(
  _prevState: ActionResult<{ deviceToken: string; displayUrl: string }> | null,
  _formData: FormData,
): Promise<ActionResult<{ deviceToken: string; displayUrl: string }>> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to connect a TV display." };
  }
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can connect a TV display.",
    };
  }

  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") || headersList.get("host") || "localhost:3000";
  const proto = headersList.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${proto}://${host}`;
  const displayUrl = `${baseUrl}/display/queue/${access.clinic.slug}`;

  return {
    ok: true,
    data: {
      deviceToken: access.clinic.slug,
      displayUrl,
    },
  };
}
