"use server";

import { revalidatePath } from "next/cache";

import { canManageClinical, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; message: string };

/** PGRST205 means the table isn't in the database yet — a missing migration. */
const MISSING_TABLE_MESSAGE =
  "Medications are not set up on this database yet. Apply supabase/migrations/0050_patient_medications.sql.";

function describeWriteError(
  error: { code?: string; message: string },
  operation: string,
  fallback: string,
): string {
  if (error.code === "PGRST205") {
    return MISSING_TABLE_MESSAGE;
  }

  console.error(`[patient-medications] ${operation} failed`, {
    code: error.code,
    message: error.message,
  });
  return fallback;
}

/**
 * Approve an AI-OCR medication. Scanned rows land as `active_pending` so they
 * never show in the Overview active list until a clinician signs off; this flips
 * them to `active`.
 */
export async function approveScannedMedicationAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return { ok: false, message: "Not authenticated" };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't approve medications." };
  }

  const medicationId = formData.get("medicationId") as string;
  if (!medicationId) {
    return { ok: false, message: "Missing medication id" };
  }

  const { error } = await supabase
    .from("patient_medications")
    .update({
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", medicationId)
    .eq("clinic_id", access.clinic.id);

  if (error) {
    return {
      ok: false,
      message: describeWriteError(
        error,
        "approve",
        "Failed to approve this medication",
      ),
    };
  }

  revalidatePath("/app/patients");
  return { ok: true, data: undefined };
}

/**
 * Discard an AI-OCR medication the doctor does not recognise. Removing the row
 * keeps the pending list clean and stops it ever reaching the active list.
 */
export async function discardScannedMedicationAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return { ok: false, message: "Not authenticated" };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't remove medications." };
  }

  const medicationId = formData.get("medicationId") as string;
  if (!medicationId) {
    return { ok: false, message: "Missing medication id" };
  }

  const { error } = await supabase
    .from("patient_medications")
    .delete()
    .eq("id", medicationId)
    .eq("clinic_id", access.clinic.id);

  if (error) {
    return {
      ok: false,
      message: describeWriteError(
        error,
        "discard",
        "Failed to remove this medication",
      ),
    };
  }

  revalidatePath("/app/patients");
  return { ok: true, data: undefined };
}