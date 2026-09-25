"use server";

import { z } from "zod";

import { getCurrentClinic, canWriteClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import { clinicLocalToUtcIso } from "@/lib/time";
import { availabilityPayloadSchema, blockedTimeSchema } from "@/lib/validation/schemas";
import type { ActionResult } from "@/types";

const blockedTimeIdSchema = z.object({ blockedTimeId: z.uuid() });

const scopeSchema = z.object({
  doctorId: z.preprocess(
    (value) => (value == null || value === "" ? null : value),
    z.uuid().nullable(),
  ),
});

/**
 * Save weekly working hours for one scope: the clinic-wide defaults when no
 * `doctorId` is submitted, or that specific doctor's own hours otherwise.
 * The write goes through the SECURITY INVOKER `upsert_availability_rules` RPC
 * because PostgREST upserts cannot target the per-scope partial unique
 * indexes; the RPC resolves the correct conflict target per scope. RLS still
 * applies inside the function (owner/admin write policies).
 */
export async function saveAvailabilityRulesAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const raw = formData.get("rules");
  if (typeof raw !== "string") {
    return { ok: false, message: "Missing availability data." };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, message: "Invalid availability data." };
  }
  const parsed = availabilityPayloadSchema.safeParse(json);
  if (!parsed.success) {
    console.error("[saveAvailabilityRulesAction] validation failed", {
      issues: parsed.error.flatten(),
    });
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the working hours and try again.",
    };
  }

  const scope = scopeSchema.safeParse({ doctorId: formData.get("doctorId") });
  if (!scope.success) {
    return { ok: false, message: "Invalid availability scope." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to set availability." };
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can edit availability." };
  }

  const rules = parsed.data.rules.map((rule) => ({
    dayOfWeek: rule.dayOfWeek,
    // Disabled days are allowed to have blank times in the payload; the
    // columns are NOT NULL `time`, so fall back to safe defaults.
    startTime: rule.enabled && rule.startTime ? rule.startTime : "09:00",
    endTime: rule.enabled && rule.endTime ? rule.endTime : "17:00",
    enabled: rule.enabled,
  }));

  const { error } = await supabase.rpc("upsert_availability_rules", {
    p_clinic_id: access.clinic.id,
    p_doctor_id: scope.data.doctorId,
    p_rules: rules,
  });

  if (error) {
    console.error("[saveAvailabilityRulesAction] upsert_availability_rules failed", {
      clinicId: access.clinic.id,
      doctorId: scope.data.doctorId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    const isDoctorMissing = String(error.message).includes("DOCTOR_NOT_FOUND");
    return {
      ok: false,
      message: isDoctorMissing
        ? "That doctor is no longer available. Refresh and try again."
        : "We couldn't save your working hours. Please try again.",
    };
  }

  return { ok: true, data: undefined };
}

/**
 * Add a blocked time (holiday, time off). Naive clinic-local datetimes are
 * converted to UTC for `timestamptz` storage. An optional `doctorId` scopes
 * the block to one doctor's schedule; absent means clinic-wide.
 */
export async function addBlockedTimeAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = blockedTimeSchema.safeParse({
    start: formData.get("start"),
    end: formData.get("end"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the blocked time and try again.",
    };
  }

  const scope = scopeSchema.safeParse({ doctorId: formData.get("doctorId") });
  if (!scope.success) {
    return { ok: false, message: "Invalid blocked-time scope." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to add blocked times." };
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can edit blocked times." };
  }

  const { error } = await supabase.from("blocked_times").insert({
    clinic_id: access.clinic.id,
    start_time: clinicLocalToUtcIso(parsed.data.start, access.clinic.timezone),
    end_time: clinicLocalToUtcIso(parsed.data.end, access.clinic.timezone),
    reason: parsed.data.reason || null,
    doctor_id: scope.data.doctorId,
  });

  if (error) {
    console.error("[addBlockedTimeAction] blocked_times insert failed", {
      clinicId: access.clinic.id,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, message: "We couldn't add this blocked time. Please try again." };
  }

  return { ok: true, data: undefined };
}

/**
 * Delete a blocked time, scoped to the caller's clinic.
 */
export async function deleteBlockedTimeAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = blockedTimeIdSchema.safeParse({ blockedTimeId: formData.get("blockedTimeId") });
  if (!parsed.success) {
    return { ok: false, message: "Missing blocked time id." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to manage blocked times." };
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can edit blocked times." };
  }

  const { error } = await supabase
    .from("blocked_times")
    .delete()
    .eq("id", parsed.data.blockedTimeId)
    .eq("clinic_id", access.clinic.id);

  if (error) {
    console.error("[deleteBlockedTimeAction] blocked_times delete failed", {
      blockedTimeId: parsed.data.blockedTimeId,
      clinicId: access.clinic.id,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, message: "We couldn't remove this blocked time. Please try again." };
  }

  return { ok: true, data: undefined };
}
