import type { SupabaseClient } from "@supabase/supabase-js";

import { WEEKDAY_ORDER } from "@/lib/constants";
import {
  clinicLocalDayOfWeek,
  timeOfDayToMinutes,
  utcIsoToClinicLocalInput,
} from "@/lib/time";
import type { Database } from "@/types/database";

export type SlotCheckResult =
  | { ok: true }
  | {
      ok: false;
      reason: "overlap" | "closed" | "blocked" | "span" | "full";
      message: string;
    };

export type DoctorDayWindow = {
  startMinutes: number;
  endMinutes: number;
  /** Phase 21 per-slot capacity. Absent/null = parent's global cap (doctors)
   * or a single patient (services). */
  patientLimit?: number | null;
};

/**
 * A doctor's brain-dead list of slot windows for one weekday, if they are
 * slot-template driven (Phase 20). `null` means the doctor has NO templates
 * for that day and the caller should fall back to `availability_rules`
 * range-based working hours. Templates take precedence whenever present.
 */
export async function getDoctorDayWindows(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  doctorId: string,
  dayOfWeek: number,
): Promise<DoctorDayWindow[] | null> {
  const { data: templates, error } = await supabase
    .from("doctor_slot_templates")
    .select("start_time, end_time, patient_limit")
    .eq("clinic_id", clinicId)
    .eq("doctor_id", doctorId)
    .eq("day_of_week", dayOfWeek)
    .order("start_time", { ascending: true });

  if (error) {
    console.error("[booking] slot-template read failed", {
      clinicId,
      doctorId,
      dayOfWeek,
      code: error.code,
      message: error.message,
    });
    return null;
  }
  if (templates.length === 0) return null;
  return templates.map((template) => ({
    startMinutes: timeOfDayToMinutes(template.start_time),
    endMinutes: timeOfDayToMinutes(template.end_time),
    patientLimit: template.patient_limit ?? null,
  }));
}

/**
 * A service's list of slot windows for one weekday (Phase 21). Mirrors
 * `getDoctorDayWindows` against `service_slot_templates`. `null` means the
 * service has NO templates for that day; the caller falls back to range-based
 * `availability_rules` (clinic-wide defaults), exactly like the no-template
 * doctor path.
 */
export async function getServiceDayWindows(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  serviceId: string,
  dayOfWeek: number,
): Promise<DoctorDayWindow[] | null> {
  const { data: templates, error } = await supabase
    .from("service_slot_templates")
    .select("start_time, end_time, patient_limit")
    .eq("clinic_id", clinicId)
    .eq("service_id", serviceId)
    .eq("day_of_week", dayOfWeek)
    .order("start_time", { ascending: true });

  if (error) {
    console.error("[booking] service slot-template read failed", {
      clinicId,
      serviceId,
      dayOfWeek,
      code: error.code,
      message: error.message,
    });
    return null;
  }
  if (templates.length === 0) return null;
  return templates.map((template) => ({
    startMinutes: timeOfDayToMinutes(template.start_time),
    endMinutes: timeOfDayToMinutes(template.end_time),
    patientLimit: template.patient_limit ?? null,
  }));
}

/**
 * Server-side slot availability check, run before every appointment create or
 * reschedule. Verified in order:
 *
 *  1. overlap   — any non-cancelled appointment overlapping the slot.
 *                 Without `doctorId`: ANY appointment conflicts (Phase ≤9
 *                 behavior, unchanged). With `doctorId`: only that doctor's
 *                 appointments and unassigned (`doctor_id IS NULL`) ones
 *                 conflict — two different named doctors can share a time,
 *                 the same doctor cannot be double-booked, and unassigned
 *                 appointments conservatively block everyone. For a doctor in
 *                 `shared_window` mode, the same doctor MAY host multiple
 *                 patients in the same start-time anchor up to the capacity of
 *                 that slot's own `patient_limit` (Phase 21), falling back to
 *                 `maxPatientsPerWindow` (capacity, `full` when reached); an
 *                 overlapping appointment at a different anchor still blocks,
 *                 and unassigned appointments still block. A service in
 *                 `shared_window` mode (no doctor) may host multiple patients
 *                 of the SAME service at the SAME anchor up to its service
 *                 slot's `patient_limit`; every other overlap blocks.
 *  2. closed    — the slot must fit inside working hours (same clinic-local
 *                 day; the v1 calendar books one day at a time). With
 *                 `doctorId`, that doctor's slot templates/rules win; if the
 *                 doctor has none, the clinic-wide defaults apply. Without
 *                 `doctorId` but with `serviceId`, the service's own slot
 *                 templates win, then clinic-wide defaults. Otherwise only
 *                 clinic-wide default rules are considered.
 *  3. blocked   — no blocked time overlaps the slot. With `doctorId`, both
 *                 clinic-wide and that doctor's blocked times apply.
 *
 * The check runs before the atomic `book_appointment` /
 * `reschedule_appointment` RPCs, which re-verify the overlap under an
 * advisory lock so two simultaneous submissions cannot both win the race.
 *
 * `startIso`/`endIso` are `timestamptz` values (UTC). `timezone` is the
 * clinic's IANA zone used only to interpret working hours and day boundaries.
 * `doctorMode`/`maxPatientsPerWindow` come from the doctor's booking profile
 * (single-slot doctors omit them and keep today's exact behavior).
 * `serviceMode` comes from the service's `consultation_mode`.
 */
export async function checkSlotAvailability(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  timezone: string,
  startIso: string,
  endIso: string,
  excludeAppointmentId?: string,
  doctorId?: string | null,
  doctorMode?: "single_slot" | "shared_window" | null,
  maxPatientsPerWindow?: number | null,
  serviceId?: string | null,
  serviceMode?: "single_slot" | "shared_window" | null,
): Promise<SlotCheckResult> {
  if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
    return {
      ok: false,
      reason: "span",
      message: "The appointment end must be after its start.",
    };
  }

  // Clinic-local interpretation. A shared-window group is anchored to a single
  // start time, so slot resolution needs the local weekday + wall-clock time.
  const startLocal = utcIsoToClinicLocalInput(startIso, timezone);
  const endLocal = utcIsoToClinicLocalInput(endIso, timezone);
  if (startLocal.slice(0, 10) !== endLocal.slice(0, 10)) {
    return {
      ok: false,
      reason: "span",
      message: "An appointment must fit within a single clinic day.",
    };
  }
  const dayOfWeek = clinicLocalDayOfWeek(startLocal);
  const startMinutes = timeOfDayToMinutes(startLocal.slice(11));
  const endMinutes = timeOfDayToMinutes(endLocal.slice(11));

  const doctorShared = Boolean(doctorId && doctorMode === "shared_window");
  const serviceShared = Boolean(
    !doctorId && serviceId && serviceMode === "shared_window",
  );

  // 1. Overlap with an existing (non-cancelled) appointment. Per-slot capacity
  // (Phase 21): a shared window's capacity comes from the owning slot's
  // `patient_limit` when present, otherwise the doctor's global cap (services
  // default to 1). Service-driven windows (no doctor) let appointments of the
  // SAME service anchored at the SAME start time share the slot; every other
  // overlap still blocks, matching the conservative legacy posture.
  if (doctorShared || serviceShared) {
    // Resolve the matching slot's per-window capacity.
    const parentWindows = doctorShared
      ? await getDoctorDayWindows(supabase, clinicId, doctorId as string, dayOfWeek)
      : await getServiceDayWindows(supabase, clinicId, serviceId as string, dayOfWeek);
    let windowCapacity: number;
    if (parentWindows) {
      const slot = parentWindows.find(
        (window) => startMinutes >= window.startMinutes && startMinutes < window.endMinutes,
      );
      if (slot?.patientLimit != null) {
        windowCapacity = slot.patientLimit;
      } else {
        windowCapacity =
          doctorShared && maxPatientsPerWindow && maxPatientsPerWindow > 0
            ? maxPatientsPerWindow
            : 1;
      }
    } else {
      windowCapacity =
        doctorShared && maxPatientsPerWindow && maxPatientsPerWindow > 0
          ? maxPatientsPerWindow
          : 1;
    }

    if (serviceShared) {
      // Service-driven window: any overlap that is NOT the same service at the
      // same start anchor blocks (other services, unassigned, drifting starts).
      let overlapQuery = supabase
        .from("appointments")
        .select("service_id, start_time")
        .eq("clinic_id", clinicId)
        .neq("status", "cancelled")
        .lt("start_time", endIso)
        .gt("end_time", startIso);
      if (excludeAppointmentId) {
        overlapQuery = overlapQuery.neq("id", excludeAppointmentId);
      }
      const { data: overlapping, error: overlapError } = await overlapQuery.limit(500);
      if (overlapError) {
        console.error("[booking] service-window overlap check failed", overlapError);
        return {
          ok: false,
          reason: "overlap",
          message: "We couldn't check the schedule right now. Please try again.",
        };
      }
      if (
        overlapping.some(
          (appointment) =>
            !(appointment.service_id === serviceId && appointment.start_time === startIso),
        )
      ) {
        return {
          ok: false,
          reason: "overlap",
          message: "This slot overlaps an existing appointment. Pick another time.",
        };
      }

      // Capacity at the same start anchor for THIS service.
      let countQuery = supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .eq("service_id", serviceId as string)
        .eq("start_time", startIso)
        .neq("status", "cancelled");
      if (excludeAppointmentId) {
        countQuery = countQuery.neq("id", excludeAppointmentId);
      }
      const { count, error: countError } = await countQuery;
      if (countError) {
        console.error("[booking] service-window capacity check failed", countError);
        return {
          ok: false,
          reason: "full",
          message: "We couldn't check the schedule right now. Please try again.",
        };
      }
      if ((count ?? 0) >= windowCapacity) {
        return {
          ok: false,
          reason: "full",
          message: `This time window is full (${windowCapacity} patient${windowCapacity === 1 ? "" : "s"}). Pick another time.`,
        };
      }
    } else {
      // 1a. Unassigned appointments conservatively block every doctor window.
      let unassignedQuery = supabase
        .from("appointments")
        .select("id")
        .eq("clinic_id", clinicId)
        .is("doctor_id", null)
        .neq("status", "cancelled")
        .lt("start_time", endIso)
        .gt("end_time", startIso)
        .limit(1);
      if (excludeAppointmentId) {
        unassignedQuery = unassignedQuery.neq("id", excludeAppointmentId);
      }
      const { data: unassigned, error: unassignedError } = await unassignedQuery;
      if (unassignedError) {
        console.error("[booking] shared-window unassigned check failed", unassignedError);
        return {
          ok: false,
          reason: "overlap",
          message: "We couldn't check the schedule right now. Please try again.",
        };
      }
      if (unassigned.length > 0) {
        return {
          ok: false,
          reason: "overlap",
          message: "This slot overlaps an existing appointment. Pick another time.",
        };
      }

      // 1b. Capacity at the same start anchor, per this slot's own patient
      // limit (Phase 21) rather than a single global number.
      let countQuery = supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .eq("doctor_id", doctorId as string)
        .eq("start_time", startIso)
        .neq("status", "cancelled");
      if (excludeAppointmentId) {
        countQuery = countQuery.neq("id", excludeAppointmentId);
      }
      const { count, error: countError } = await countQuery;
      if (countError) {
        console.error("[booking] shared-window capacity check failed", countError);
        return {
          ok: false,
          reason: "full",
          message: "We couldn't check the schedule right now. Please try again.",
        };
      }
      if ((count ?? 0) >= windowCapacity) {
        return {
          ok: false,
          reason: "full",
          message: `This time window is full (${windowCapacity} patient${windowCapacity === 1 ? "" : "s"}). Pick another time.`,
        };
      }

      // 1c. Same doctor overlapping but anchored at a DIFFERENT start time is
      // still a single-slot conflict — windows don't fuse together.
      let driftQuery = supabase
        .from("appointments")
        .select("id")
        .eq("clinic_id", clinicId)
        .eq("doctor_id", doctorId as string)
        .neq("status", "cancelled")
        .lt("start_time", endIso)
        .gt("end_time", startIso)
        .neq("start_time", startIso)
        .limit(1);
      if (excludeAppointmentId) {
        driftQuery = driftQuery.neq("id", excludeAppointmentId);
      }
      const { data: drift, error: driftError } = await driftQuery;
      if (driftError) {
        console.error("[booking] shared-window drift check failed", driftError);
        return {
          ok: false,
          reason: "overlap",
          message: "We couldn't check the schedule right now. Please try again.",
        };
      }
      if (drift.length > 0) {
        return {
          ok: false,
          reason: "overlap",
          message: "This slot overlaps an existing appointment. Pick another time.",
        };
      }
    }
  } else {
    let overlapQuery = supabase
      .from("appointments")
      .select("id")
      .eq("clinic_id", clinicId)
      .neq("status", "cancelled")
      .lt("start_time", endIso)
      .gt("end_time", startIso)
      .limit(1);
    if (excludeAppointmentId) {
      overlapQuery = overlapQuery.neq("id", excludeAppointmentId);
    }
    if (doctorId) {
      overlapQuery = overlapQuery.or(`doctor_id.is.null,doctor_id.eq.${doctorId}`);
    }
    const { data: overlap, error: overlapError } = await overlapQuery;
    if (overlapError) {
      console.error("[booking] overlap check failed", overlapError);
      return {
        ok: false,
        reason: "overlap",
        message: "We couldn't check the schedule right now. Please try again.",
      };
    }
    if (overlap.length > 0) {
      return {
        ok: false,
        reason: "overlap",
        message: "This slot overlaps an existing appointment. Pick another time.",
      };
    }
  }

  // 2. Working hours (single clinic-local day in v1). `startLocal`/`dayOfWeek`
  // were hoisted above so shared-window slot resolution could reuse them.

  // 2a. Slot-template driven parents (Phase 20/21): a template window exists
  // for this weekday when `getDoctorDayWindows`/`getServiceDayWindows` returns
  // non-null, and it takes precedence over range-based `availability_rules`.
  // The slot must fit inside at least one full template window.
  const dayWindows = doctorId
    ? await getDoctorDayWindows(supabase, clinicId, doctorId, dayOfWeek)
    : serviceId
      ? await getServiceDayWindows(supabase, clinicId, serviceId, dayOfWeek)
      : null;
  if (dayWindows) {
    const fits = dayWindows.some(
      (window) => startMinutes >= window.startMinutes && endMinutes <= window.endMinutes,
    );
    if (!fits) {
      return {
        ok: false,
        reason: "closed",
        message: doctorId
          ? `This time is outside ${WEEKDAY_ORDER[dayOfWeek]}'s booked slots for this doctor.`
          : `This time is outside ${WEEKDAY_ORDER[dayOfWeek]}'s booked slots for this service.`,
      };
    }
  } else {
    // 2b. Range-based working hours. Doctor-specific rules win over
    // clinic-wide defaults for the same weekday (`ascending + nullsLast` puts
    // the doctor's non-null row first when both exist; if the doctor has
    // none, only the default row is returned). The no-doctor path reads ONLY
    // default rows so it can never pick up a doctor's private row — exactly
    // the pre-Phase-10 behavior.
    let rulesQuery = supabase
      .from("availability_rules")
      .select("start_time, end_time")
      .eq("clinic_id", clinicId)
      .eq("day_of_week", dayOfWeek)
      .eq("enabled", true);
    if (doctorId) {
      rulesQuery = rulesQuery
        .or(`doctor_id.is.null,doctor_id.eq.${doctorId}`)
        .order("doctor_id", { ascending: true, nullsFirst: false });
    } else {
      rulesQuery = rulesQuery.is("doctor_id", null);
    }
    const { data: rules, error: rulesError } = await rulesQuery.limit(1);
    if (rulesError) {
      console.error("[booking] working-hours check failed", rulesError);
      return {
        ok: false,
        reason: "closed",
        message: "We couldn't check working hours right now. Please try again.",
      };
    }

    const rule = rules[0];
    if (!rule) {
      return {
        ok: false,
        reason: "closed",
        message: `${WEEKDAY_ORDER[dayOfWeek]} is outside your working hours.`,
      };
    }

    const ruleStart = timeOfDayToMinutes(rule.start_time);
    const ruleEnd = timeOfDayToMinutes(rule.end_time);
    if (startMinutes < ruleStart || endMinutes > ruleEnd) {
      return {
        ok: false,
        reason: "closed",
        message: `The clinic is closed at this time on ${WEEKDAY_ORDER[dayOfWeek]}. Working hours are ${rule.start_time.slice(0, 5)}–${rule.end_time.slice(0, 5)}.`,
      };
    }
  }

  // 3. Blocked time (holidays, time off). A doctor's own blocks apply on top
  // of clinic-wide ones; without a doctor only clinic-wide blocks apply
  // (unchanged legacy behavior).
  let blockedQuery = supabase
    .from("blocked_times")
    .select("id")
    .eq("clinic_id", clinicId)
    .lt("start_time", endIso)
    .gt("end_time", startIso)
    .limit(1);
  if (doctorId) {
    blockedQuery = blockedQuery.or(`doctor_id.is.null,doctor_id.eq.${doctorId}`);
  } else {
    blockedQuery = blockedQuery.is("doctor_id", null);
  }
  const { data: blocked, error: blockedError } = await blockedQuery;
  if (blockedError) {
    console.error("[booking] blocked-time check failed", blockedError);
    return {
      ok: false,
      reason: "blocked",
      message: "We couldn't check blocked times right now. Please try again.",
    };
  }
  if (blocked.length > 0) {
    return {
      ok: false,
      reason: "blocked",
      message: "This time falls inside a blocked period (holiday or time off).",
    };
  }

  return { ok: true };
}
