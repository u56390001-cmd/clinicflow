/**
 * Dashboard analytics (Phase 9, Scope A).
 *
 * Computes the PRD's required "Dashboard metrics" from real appointment and
 * patient rows — no mocks. All windows are resolved in the clinic's own
 * timezone so "today" means the clinic's today.
 *
 * Metric definitions (documented in the UI):
 * - Appointments today / this week: start_time inside the window (clinic tz),
 *   excluding cancelled appointments.
 * - New patients this week / this month: patients.created_at >= window start.
 * - Cancellation / no-show rate: trailing 30 days by start_time,
 *   cancelled-or-no-show count over all appointments in the window.
 * - AI / website booking rate: trailing 30 days, share of appointments whose
 *   booking_source is 'ai_agent' or ('widget' | 'website') respectively.
 * - Trend: non-cancelled appointments per local day over the last 30 days.
 */

import { clinicLocalToUtcIso, utcIsoToClinicLocalInput } from "@/lib/time";

export type AnalyticsTrendPoint = {
  /** Clinic-local date, `YYYY-MM-DD`. */
  date: string;
  count: number;
};

export type ClinicAnalytics = {
  appointmentsToday: number;
  appointmentsThisWeek: number;
  newPatientsThisWeek: number;
  newPatientsThisMonth: number;
  cancellationRate: number | null;
  noShowRate: number | null;
  aiBookingRate: number | null;
  websiteBookingRate: number | null;
  trend: AnalyticsTrendPoint[];
};

/** Add `n` days to a `YYYY-MM-DD` string via UTC arithmetic. */
function shiftDate(dateStr: string, n: number): string {
  const ms = Date.parse(`${dateStr}T00:00:00Z`) + n * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Weekday index (0 = Monday … 6 = Sunday) for a `YYYY-MM-DD` string. */
function mondayIndex(dateStr: string): number {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

type AppointmentSlice = {
  start_time: string;
  status: string;
  booking_source: string;
};

export async function getClinicAnalytics(
  supabase:
    | import("@supabase/supabase-js").SupabaseClient<import("@/types/database").Database>,
  clinicId: string,
  timezone: string,
): Promise<ClinicAnalytics> {
  // ── Resolve all window boundaries in the clinic's timezone ──────────────
  const nowIso = new Date().toISOString();
  const todayLocal = utcIsoToClinicLocalInput(nowIso, timezone).slice(0, 10);
  const weekStartLocal = shiftDate(todayLocal, -mondayIndex(todayLocal));
  const monthStartLocal = `${todayLocal.slice(0, 7)}-01`;
  const trendStartLocal = shiftDate(todayLocal, -29); // 30 days incl. today
  const trendStartUtc = clinicLocalToUtcIso(`${trendStartLocal}T00:00`, timezone);
  const monthStartUtc = clinicLocalToUtcIso(`${monthStartLocal}T00:00`, timezone);

  // ── Fetch the minimal data for every metric ─────────────────────────────
  // One appointment query covers today/this-week/rates/trend; its lower bound
  // is the trend window start and its upper bound the end of the current
  // week (later appointments are irrelevant to every listed metric).
  const weekEndExclusiveLocal = shiftDate(weekStartLocal, 7);
  const weekEndUtc = clinicLocalToUtcIso(`${weekEndExclusiveLocal}T00:00`, timezone);

  const [appointmentsResult, patientsResult] = await Promise.all([
    supabase
      .from("appointments")
      .select("start_time, status, booking_source")
      .eq("clinic_id", clinicId)
      .gte("start_time", trendStartUtc)
      .lt("start_time", weekEndUtc),
    supabase
      .from("patients")
      .select("created_at")
      .eq("clinic_id", clinicId)
      .gte("created_at", monthStartUtc),
  ]);

  const appointments = (appointmentsResult.data ?? []) as AppointmentSlice[];
  const patientsCreated = patientsResult.data ?? [];

  // ── Volume metrics ───────────────────────────────────────────────────────
  let appointmentsToday = 0;
  let appointmentsThisWeek = 0;
  const perDay = new Map<string, number>();
  for (const point of Array.from({ length: 30 }, (_, i) =>
    shiftDate(trendStartLocal, i),
  )) {
    perDay.set(point, 0);
  }

  for (const appointment of appointments) {
    if (appointment.status === "cancelled") continue;
    const localDate = utcIsoToClinicLocalInput(appointment.start_time, timezone).slice(0, 10);
    if (localDate === todayLocal) appointmentsToday += 1;
    if (localDate >= weekStartLocal && localDate < weekEndExclusiveLocal) {
      appointmentsThisWeek += 1;
    }
    if (perDay.has(localDate)) {
      perDay.set(localDate, (perDay.get(localDate) ?? 0) + 1);
    }
  }

  // ── New patients ─────────────────────────────────────────────────────────
  let newPatientsThisWeek = 0;
  let newPatientsThisMonth = 0;
  for (const row of patientsCreated) {
    const createdAt = typeof row.created_at === "string" ? row.created_at : "";
    if (!createdAt) continue;
    newPatientsThisMonth += 1;
    const localCreatedAt = utcIsoToClinicLocalInput(createdAt, timezone).slice(0, 10);
    if (localCreatedAt >= weekStartLocal) newPatientsThisWeek += 1;
  }

  // ── Trailing-30-day rates (denominator includes every status) ────────────
  let total30 = 0;
  let cancelled30 = 0;
  let noShow30 = 0;
  let aiBooked30 = 0;
  let websiteBooked30 = 0;
  for (const appointment of appointments) {
    const localDate = utcIsoToClinicLocalInput(appointment.start_time, timezone).slice(0, 10);
    if (localDate < trendStartLocal || localDate > todayLocal) continue;
    total30 += 1;
    if (appointment.status === "cancelled") cancelled30 += 1;
    if (appointment.status === "no_show") noShow30 += 1;
    if (appointment.booking_source === "ai_agent") aiBooked30 += 1;
    if (
      appointment.booking_source === "widget" ||
      appointment.booking_source === "website"
    ) {
      websiteBooked30 += 1;
    }
  }

  const pct = (numerator: number): number | null =>
    total30 === 0 ? null : Math.round((numerator / total30) * 100);

  return {
    appointmentsToday,
    appointmentsThisWeek,
    newPatientsThisWeek,
    newPatientsThisMonth,
    cancellationRate: pct(cancelled30),
    noShowRate: pct(noShow30),
    aiBookingRate: pct(aiBooked30),
    websiteBookingRate: pct(websiteBooked30),
    trend: Array.from(perDay.entries()).map(([date, count]) => ({ date, count })),
  };
}

// ---------------------------------------------------------------------------
// AI receptionist metrics (Phase 9, Scope C) — aggregates ai_conversation_logs
// ---------------------------------------------------------------------------

export type AiMetrics = {
  sessions30d: number;
  bookingAttempts30d: number;
  successful30d: number;
  failed30d: number;
  escalated30d: number;
  avgMessagesPerSession: number | null;
};

type ConversationSlice = {
  outcome: string;
  message_count: number;
  booking_attempted: boolean;
};

/**
 * AI receptionist usage over the trailing 30 days (UTC day windows —
 * conversation logs carry no clinic-local semantics). Returns `null` rates via
 * the UI when there are no sessions yet.
 */
export async function getAiMetrics(
  supabase:
    | import("@supabase/supabase-js").SupabaseClient<import("@/types/database").Database>,
  clinicId: string,
): Promise<AiMetrics> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("ai_conversation_logs")
    .select("outcome, message_count, booking_attempted")
    .eq("clinic_id", clinicId)
    .gte("created_at", since);

  if (error) throw new Error(`AI metrics query failed: ${error.message}`);

  const sessions = (data ?? []) as ConversationSlice[];
  let bookingAttempts = 0;
  let successful = 0;
  let failed = 0;
  let escalated = 0;
  let messageSum = 0;

  for (const session of sessions) {
    bookingAttempts += session.booking_attempted ? 1 : 0;
    messageSum += session.message_count ?? 0;
    if (session.outcome === "success") successful += 1;
    else if (session.outcome === "failed") failed += 1;
    else if (session.outcome === "escalated") escalated += 1;
  }

  return {
    sessions30d: sessions.length,
    bookingAttempts30d: bookingAttempts,
    successful30d: successful,
    failed30d: failed,
    escalated30d: escalated,
    avgMessagesPerSession:
      sessions.length === 0
        ? null
        : Math.round((messageSum / sessions.length) * 10) / 10,
  };
}
