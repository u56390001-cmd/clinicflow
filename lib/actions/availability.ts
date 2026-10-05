"use server";

import { z } from "zod";

import { getCurrentClinic, canWriteClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import { clinicLocalToUtcIso } from "@/lib/time";
import {
  availabilityPayloadSchema,
  blockedTimeSchema,
  timezoneWorkingHoursSchema,
} from "@/lib/validation/schemas";
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
      message:
        parsed.error.issues[0]?.message ??
        "Check the working hours and try again.",
    };
  }

  const scope = scopeSchema.safeParse({ doctorId: formData.get("doctorId") });
  if (!scope.success) {
    return { ok: false, message: "Invalid availability scope." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access)
    return {
      ok: false,
      message: "You must have a clinic to set availability.",
    };
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can edit availability.",
    };
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
    console.error(
      "[saveAvailabilityRulesAction] upsert_availability_rules failed",
      {
        clinicId: access.clinic.id,
        doctorId: scope.data.doctorId,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      },
    );
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
 * Save the Organization settings card: one timezone for the clinic plus the
 * set of weekdays it opens, all sharing a single opening/closing range.
 *
 * Both halves are written because the card presents them as one unit, but they
 * live in two different tables (`clinics.timezone` and
 * `availability_rules`). There is no cross-table transaction available through
 * PostgREST, so the timezone is committed first and a working-hours failure is
 * reported as such rather than rolled back — the timezone the owner picked is a
 * valid setting on its own, and silently discarding it would be worse than
 * asking them to press save again.
 *
 * Days the owner turned off are written as `enabled = false` with the submitted
 * range rather than deleted. The RPC upserts exactly one row per weekday, so
 * keeping the row means a previously-closed day cannot silently resurrect
 * yesterday's hours from a stale row.
 */
export async function saveTimezoneWorkingHoursAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const raw = formData.get("settings");
  if (typeof raw !== "string") {
    return { ok: false, message: "Missing timezone or working hours." };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, message: "Invalid timezone or working hours." };
  }

  const parsed = timezoneWorkingHoursSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const key = issue?.path[0];
    const fieldErrors: Record<string, string> = {};
    if (typeof key === "string" && issue) fieldErrors[key] = issue.message;
    return {
      ok: false,
      message: issue?.message ?? "Check the timezone and working hours.",
      fieldErrors,
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      ok: false,
      message: "You must have a clinic to set working hours.",
    };
  }
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can edit working hours.",
    };
  }

  const { timezone, days, startTime, endTime } = parsed.data;
  const selected = new Set(days);

  const timezoneChanged = timezone !== access.clinic.timezone;
  if (timezoneChanged) {
    const { error } = await supabase
      .from("clinics")
      .update({ timezone })
      .eq("id", access.clinic.id);

    if (error) {
      console.error("[saveTimezoneWorkingHoursAction] clinics update failed", {
        clinicId: access.clinic.id,
        code: error.code,
        message: error.message,
      });
      return {
        ok: false,
        message: "We couldn't save the timezone. Please try again.",
      };
    }
  }

  const rules = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    startTime,
    endTime,
    enabled: selected.has(dayOfWeek),
  }));

  const { error } = await supabase.rpc("upsert_availability_rules", {
    p_clinic_id: access.clinic.id,
    p_doctor_id: null,
    p_rules: rules,
  });

  if (error) {
    console.error(
      "[saveTimezoneWorkingHoursAction] upsert_availability_rules failed",
      {
        clinicId: access.clinic.id,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      },
    );
    return {
      ok: false,
      message: timezoneChanged
        ? "Timezone saved, but we couldn't save your working hours. Please try again."
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
      message:
        parsed.error.issues[0]?.message ??
        "Check the blocked time and try again.",
    };
  }

  const scope = scopeSchema.safeParse({ doctorId: formData.get("doctorId") });
  if (!scope.success) {
    return { ok: false, message: "Invalid blocked-time scope." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access)
    return {
      ok: false,
      message: "You must have a clinic to add blocked times.",
    };
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can edit blocked times.",
    };
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
    return {
      ok: false,
      message: "We couldn't add this blocked time. Please try again.",
    };
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
  const parsed = blockedTimeIdSchema.safeParse({
    blockedTimeId: formData.get("blockedTimeId"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Missing blocked time id." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access)
    return {
      ok: false,
      message: "You must have a clinic to manage blocked times.",
    };
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can edit blocked times.",
    };
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
    return {
      ok: false,
      message: "We couldn't remove this blocked time. Please try again.",
    };
  }

  return { ok: true, data: undefined };
}
