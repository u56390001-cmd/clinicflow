"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentClinic } from "@/lib/clinic-access";
import type {
  ClinicalStatus,
  HistoryCategory,
  HistorySource,
} from "@/types/history";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; message: string };

/**
 * PGRST205 means the `medical_history` table isn't in the database yet, which is
 * a missing-migration state rather than a bad request. Surface the fix instead
 * of a generic "failed" message; log everything else as a real error.
 */
const MISSING_TABLE_MESSAGE =
  "Medical history is not set up on this database yet. Apply supabase/migrations/0045_medical_history.sql.";

function describeWriteError(
  error: { code?: string; message: string },
  operation: string,
  fallback: string,
): string {
  if (error.code === "PGRST205") {
    return MISSING_TABLE_MESSAGE;
  }

  console.error(`[medical-history] ${operation} failed`, {
    code: error.code,
    message: error.message,
  });
  return fallback;
}

/** Resolve the human-readable author name from the signed-in user. */
function authorName(user: { email?: string; user_metadata?: Record<string, unknown> } | null): string | null {
  if (!user) {
    return null;
  }
  const meta = user.user_metadata;
  const name =
    (typeof meta?.name === "string" && meta.name) ||
    (typeof meta?.full_name === "string" && meta.full_name) ||
    user.email;
  return name || null;
}

export async function addMedicalHistoryAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return { ok: false, message: "Not authenticated" };
  }

  const patientId = formData.get("patientId") as string;
  const category = formData.get("category") as HistoryCategory;
  const condition = formData.get("condition") as string;
  const date = formData.get("date") as string | null;
  const notes = formData.get("notes") as string | null;
  const relationship = formData.get("relationship") as string | null;
  const source = (formData.get("source") as HistorySource | null) ?? "doctor_entry";
  const clinicalStatus = (formData.get("clinicalStatus") as ClinicalStatus | null) ?? "active";
  const verificationStatus =
    (formData.get("verificationStatus") as
      | "verified"
      | "pending_approval"
      | null) ?? "verified";

  if (!patientId || !category || !condition) {
    return { ok: false, message: "Missing required fields" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const createdByName = authorName(user);

  const { data, error } = await supabase
    .from("medical_history")
    .insert({
      clinic_id: access.clinic.id,
      patient_id: patientId,
      category,
      condition: condition.trim(),
      date: date || null,
      notes: notes?.trim() || null,
      relationship: relationship?.trim() || null,
      source,
      verification_status: verificationStatus,
      clinical_status: clinicalStatus,
      created_by_name: createdByName,
    })
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      message: describeWriteError(
        error,
        "insert",
        "Failed to add medical history entry",
      ),
    };
  }

  revalidatePath("/app/patients");
  return { ok: true, data: data.id };
}

/**
 * One-click clinician approval. AI-OCR and patient-intake entries land as
 * `pending_approval`; this flips them to `verified` so they stop surfacing as
 * "needs review" in the History tab and the doctor can move on. Unscoped to
 * `patient_id` on purpose — the clinic filter already bounds the row guaranteed
 * to exist, and the caller is the detail pane for a specific patient anyway.
 */
export async function verifyMedicalHistoryAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return { ok: false, message: "Not authenticated" };
  }

  const entryId = formData.get("entryId") as string;

  if (!entryId) {
    return { ok: false, message: "Missing entry ID" };
  }

  const { error } = await supabase
    .from("medical_history")
    .update({
      verification_status: "verified",
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId)
    .eq("clinic_id", access.clinic.id);

  if (error) {
    return {
      ok: false,
      message: describeWriteError(
        error,
        "verify",
        "Failed to verify medical history entry",
      ),
    };
  }

  revalidatePath("/app/patients");
  return { ok: true, data: undefined };
}

export async function updateMedicalHistoryAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return { ok: false, message: "Not authenticated" };
  }

  const entryId = formData.get("entryId") as string;
  const condition = formData.get("condition") as string;
  const date = formData.get("date") as string | null;
  const notes = formData.get("notes") as string | null;
  const relationship = formData.get("relationship") as string | null;
  const clinicalStatus = formData.get("clinicalStatus") as ClinicalStatus | null;

  if (!entryId || !condition) {
    return { ok: false, message: "Missing required fields" };
  }

  const { error } = await supabase
    .from("medical_history")
    .update({
      condition: condition.trim(),
      date: date || null,
      notes: notes?.trim() || null,
      relationship: relationship?.trim() || null,
      ...(clinicalStatus ? { clinical_status: clinicalStatus } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId)
    .eq("clinic_id", access.clinic.id);

  if (error) {
    return {
      ok: false,
      message: describeWriteError(
        error,
        "update",
        "Failed to update medical history entry",
      ),
    };
  }

  revalidatePath("/app/patients");
  return { ok: true, data: undefined };
}

export async function deleteMedicalHistoryAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return { ok: false, message: "Not authenticated" };
  }

  const entryId = formData.get("entryId") as string;

  if (!entryId) {
    return { ok: false, message: "Missing entry ID" };
  }

  const { error } = await supabase
    .from("medical_history")
    .delete()
    .eq("id", entryId)
    .eq("clinic_id", access.clinic.id);

  if (error) {
    return {
      ok: false,
      message: describeWriteError(
        error,
        "delete",
        "Failed to delete medical history entry",
      ),
    };
  }

  revalidatePath("/app/patients");
  return { ok: true, data: undefined };
}
