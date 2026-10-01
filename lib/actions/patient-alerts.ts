"use server";

import { revalidatePath } from "next/cache";

import { canManageClinical, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; message: string };

/** PGRST205 means the table isn't in the database yet — a missing migration. */
const MISSING_TABLE_MESSAGE =
  "Safety alerts are not set up on this database yet. Apply supabase/migrations/0051_patient_alerts.sql.";

function describeWriteError(
  error: { code?: string; message: string },
  operation: string,
  fallback: string,
): string {
  if (error.code === "PGRST205") {
    return MISSING_TABLE_MESSAGE;
  }

  console.error(`[patient-alerts] ${operation} failed`, {
    code: error.code,
    message: error.message,
  });
  return fallback;
}

/**
 * Normalize and merge comma/newline separated strings, preserving the
 * first occurrence of each distinct trimmed value.
 */
function mergeValues(existing: string | null | undefined, toAdd: string): string {
  const entries = (existing ?? "")
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const candidate = toAdd.trim();
  if (!candidate) return existing ?? "";
  if (entries.some((entry) => entry.toLowerCase() === candidate.toLowerCase())) {
    return existing ?? "";
  }
  return existing && existing.trim().length > 0
    ? `${existing.trim()}, ${candidate}`
    : candidate;
}

/**
 * Approve an AI-OCR safety alert. Scanned alerts land `active_pending` so
 * they never appear on the Overview's Critical Safety Alerts block until a
 * clinician signs off. Approving merges the alert's text into the matching
 * `patients` column (`known_allergies` for allergy, `medical_conditions` for
 * known_case) and marks the staged row as `approved`.
 */
export async function approveScannedAlertAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return { ok: false, message: "Not authenticated" };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't approve safety alerts." };
  }

  const alertId = formData.get("alertId") as string;
  if (!alertId) {
    return { ok: false, message: "Missing alert id" };
  }

  const {
    data: alert,
    error: alertError,
  } = await supabase
    .from("patient_alerts")
    .select("id, clinic_id, patient_id, alert_type, text")
    .eq("id", alertId)
    .eq("clinic_id", access.clinic.id)
    .single();

  if (alertError) {
    return {
      ok: false,
      message: describeWriteError(
        alertError as { code?: string; message: string },
        "fetch",
        "Failed to load this alert",
      ),
    };
  }
  if (!alert) {
    return { ok: false, message: "Alert not found" };
  }

  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("known_allergies, medical_conditions")
    .eq("id", alert.patient_id)
    .eq("clinic_id", access.clinic.id)
    .single();

  if (patientError) {
    return {
      ok: false,
      message: describeWriteError(
        patientError as { code?: string; message: string },
        "patient-fetch",
        "Failed to load this patient",
      ),
    };
  }

  const merged =
    alert.alert_type === "allergy"
      ? mergeValues(patient.known_allergies, alert.text)
      : mergeValues(patient.medical_conditions, alert.text);
  const updatePayload =
    alert.alert_type === "allergy"
      ? { known_allergies: merged }
      : { medical_conditions: merged };

  const { error: updatePatientError } = await supabase
    .from("patients")
    .update(updatePayload)
    .eq("id", alert.patient_id)
    .eq("clinic_id", access.clinic.id);

  if (updatePatientError) {
    return {
      ok: false,
      message: describeWriteError(
        updatePatientError as { code?: string; message: string },
        "merge",
        "Failed to add this alert to the patient's record",
      ),
    };
  }

  const { error: updateAlertError } = await supabase
    .from("patient_alerts")
    .update({
      status: "approved",
      updated_at: new Date().toISOString(),
    })
    .eq("id", alert.id)
    .eq("clinic_id", access.clinic.id);

  if (updateAlertError) {
    return {
      ok: false,
      message: describeWriteError(
        updateAlertError as { code?: string; message: string },
        "approve",
        "Failed to approve this alert",
      ),
    };
  }

  revalidatePath("/app/patients");
  return { ok: true, data: undefined };
}

/**
 * Dismiss an AI-OCR safety alert the doctor does not wish to add to the
 * permanent record. Marking it `dismissed` hides it from the pending block and
 * leaves the patient's free-text columns unchanged.
 */
export async function dismissScannedAlertAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return { ok: false, message: "Not authenticated" };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't dismiss safety alerts." };
  }

  const alertId = formData.get("alertId") as string;
  if (!alertId) {
    return { ok: false, message: "Missing alert id" };
  }

  const { error } = await supabase
    .from("patient_alerts")
    .update({
      status: "dismissed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", alertId)
    .eq("clinic_id", access.clinic.id);

  if (error) {
    return {
      ok: false,
      message: describeWriteError(
        error as { code?: string; message: string },
        "dismiss",
        "Failed to dismiss this alert",
      ),
    };
  }

  revalidatePath("/app/patients");
  return { ok: true, data: undefined };
}