/**
 * Server-side aggregation for the dashboard overview (right-side content).
 *
 * One loader owns every query the overview needs — today's schedule, the live
 * reception queue, recent threads and the event log — so the page pays for them
 * once, in parallel, and every presentational component below is a pure render
 * of this result. All "today" boundaries are resolved in the clinic's own
 * timezone (never the host clock) and every tenant-scoped read is filtered by
 * `clinic_id`, so nothing here can leak across clinics.
 *
 * The trailing-30-day rates and the "appointments today" count are reused from
 * the existing `getClinicAnalytics` service rather than recomputed: those
 * definitions are documented and already power the rest of the product.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { getClinicAnalytics, type ClinicAnalytics } from "@/lib/analytics";
import { buildAppointmentViews } from "@/lib/appointments-view";
import type { InboxThread } from "@/lib/header-activity";
import { fetchInboxFeed } from "@/lib/inbox-query";
import { clinicDayRangeUtc, clinicToday } from "@/lib/time";
import type {
  AppEventCategory,
  Appointment,
  Database,
  Doctor,
  Patient,
  Service,
  Visit,
} from "@/types/database";

/** Display status a schedule row can carry, mapped from appointment + visit. */
export type TodayScheduleStatus =
  | "waiting"
  | "progress"
  | "upcoming"
  | "complete"
  | "cancelled";

export type TodayScheduleRow = {
  id: string;
  /** Clinic-local time, e.g. "12:30 PM". */
  timeLabel: string;
  patientName: string;
  serviceName: string;
  doctorName: string | null;
  status: TodayScheduleStatus;
};

export type QueueSnapshot = {
  waitingCount: number;
  inConsultationCount: number;
  completedCount: number;
  /** Lowest token still with a doctor, or null when nobody is in a room. */
  nowServingToken: number | null;
  /** Lowest token waiting, or null when the queue is empty. */
  upNextToken: number | null;
};

export type DashboardActivityKind =
  | "booking"
  | "queue"
  | "integration"
  | "billing"
  | "email"
  | "auth";

export type DashboardActivityItem = {
  id: string;
  kind: DashboardActivityKind;
  title: string;
  /** Short provenance label, e.g. "Reception" or "AI provider". */
  source: string;
  at: string;
  tone: "green" | "orange" | "neutral";
  /** How many raw log rows collapsed into this one row (>= 1). */
  repeated: number;
};

export type DashboardOverviewData = {
  analytics: ClinicAnalytics;
  kpis: {
    appointmentsToday: number;
    patientsWaiting: number;
    inConsultation: number;
    completedVisits: number;
  };
  schedule: TodayScheduleRow[];
  queue: QueueSnapshot;
  messages: InboxThread[];
  unreadMessages: number;
  activity: DashboardActivityItem[];
};

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

/** Clinic-local clock formatter, e.g. "12:30 PM". Cached per timezone. */
function clinicTimeFormatter(tz: string): Intl.DateTimeFormat {
  const cached = timeFormatters.get(tz);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });
  timeFormatters.set(tz, formatter);
  return formatter;
}

function toToken(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Combine the appointment lifecycle with the live visit status. */
function resolveScheduleStatus(
  appointmentStatus: string,
  visitStatus: string | null,
): TodayScheduleStatus {
  if (visitStatus === "in_consultation") return "progress";
  if (visitStatus === "waiting" || visitStatus === "checked_in") return "waiting";
  if (visitStatus === "completed") return "complete";
  if (appointmentStatus === "cancelled") return "cancelled";
  if (appointmentStatus === "completed") return "complete";
  return "upcoming";
}

// ---------------------------------------------------------------------------
// Recent activity — the event log, deduplicated for a glanceable feed
// ---------------------------------------------------------------------------

type EventRow = {
  id: string;
  category: AppEventCategory;
  event: string;
  severity: string;
  created_at: string;
};

const ACTIVITY_TITLES: Record<string, string> = {
  booking_created: "New online appointment",
  booking_cancelled: "Booking cancelled",
  booking_completed: "Visit completed",
  email_send_failed: "Email delivery failed",
  auth_login_failed: "Sign-in failed",
  slot_conflict: "Slot conflict detected",
  bill_waived: "Bill waived",
  bill_cancelled: "Bill cancelled",
  patient_checked_in: "Patient checked in",
};

const ACTIVITY_SOURCES: Record<AppEventCategory, string> = {
  booking: "Booking",
  email: "Email",
  auth: "Security",
  api: "System",
  billing: "Billing",
};

const ACTIVITY_ICON_KIND: Record<AppEventCategory, DashboardActivityKind> = {
  booking: "booking",
  email: "email",
  auth: "auth",
  api: "integration",
  billing: "billing",
};

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function mapEvent(row: EventRow): DashboardActivityItem {
  return {
    id: row.id,
    kind: ACTIVITY_ICON_KIND[row.category] ?? "integration",
    title: ACTIVITY_TITLES[row.event] ?? titleCase(row.event),
    source: ACTIVITY_SOURCES[row.category] ?? "System",
    at: row.created_at,
    tone: row.severity === "error" ? "orange" : "green",
    repeated: 1,
  };
}

/**
 * Turn raw `app_event_logs` rows into a short, useful feed.
 *
 * - Repeated identical events inside the same hour collapse to one row (`seen`
 *   key) so a burst of the same log line cannot flood the card.
 * - Error-level integration failures (provider/webhook/email) are collapsed
 *   into a single "Integration needs attention" row regardless of how many
 *   times they fired, matching the design's intent.
 */
function buildDashboardActivity(rows: EventRow[]): DashboardActivityItem[] {
  const integrationErrors: EventRow[] = [];
  const others: EventRow[] = [];

  for (const row of rows) {
    const isIntegrationError =
      row.severity === "error" &&
      (row.category === "api" || row.category === "email");
    if (isIntegrationError) integrationErrors.push(row);
    else others.push(row);
  }

  const items: DashboardActivityItem[] = [];
  const seen = new Set<string>();
  for (const row of others) {
    const bucket = Math.floor(new Date(row.created_at).getTime() / 3_600_000);
    const key = `${row.event}:${bucket}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(mapEvent(row));
  }

  if (integrationErrors.length > 0) {
    const newest = integrationErrors[0];
    items.push({
      id: `integration:${newest.id}`,
      kind: "integration",
      title: "Integration needs attention",
      source: "AI provider",
      at: newest.created_at,
      tone: "orange",
      repeated: integrationErrors.length,
    });
  }

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loadDashboardOverview(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  timezone: string,
): Promise<DashboardOverviewData> {
  const { startIso, endIso } = clinicDayRangeUtc(clinicToday(timezone), timezone);

  const [
    analytics,
    appointmentsResult,
    patientsResult,
    servicesResult,
    doctorsResult,
    visitsResult,
    inboxFeed,
    eventsResult,
  ] = await Promise.all([
    getClinicAnalytics(supabase, clinicId, timezone),
    supabase
      .from("appointments")
      .select("*")
      .eq("clinic_id", clinicId)
      .gte("start_time", startIso)
      .lt("start_time", endIso)
      .order("start_time", { ascending: true }),
    supabase.from("patients").select("*").eq("clinic_id", clinicId),
    supabase.from("services").select("*").eq("clinic_id", clinicId),
    supabase.from("doctors").select("*").eq("clinic_id", clinicId),
    supabase
      .from("visits")
      .select("*")
      .eq("clinic_id", clinicId)
      .gte("checked_in_at", startIso)
      .lt("checked_in_at", endIso)
      .order("queue_position", { ascending: true }),
    fetchInboxFeed(supabase, clinicId),
    supabase
      .from("app_event_logs")
      .select("id, category, event, severity, created_at")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .limit(16),
  ]);

  const appointments = (appointmentsResult.data ?? []) as Appointment[];
  const patients = (patientsResult.data ?? []) as Patient[];
  const services = (servicesResult.data ?? []) as Service[];
  const doctors = (doctorsResult.data ?? []) as Doctor[];
  const visits = (visitsResult.data ?? []) as Visit[];

  const visitsByAppointment = new Map<string, Visit>();
  for (const visit of visits) {
    if (visit.appointment_id && !visitsByAppointment.has(visit.appointment_id)) {
      visitsByAppointment.set(visit.appointment_id, visit);
    }
  }

  const formatter = clinicTimeFormatter(timezone);
  const schedule: TodayScheduleRow[] = buildAppointmentViews(
    appointments,
    patients,
    services,
    doctors,
  ).map((view) => ({
    id: view.id,
    timeLabel: formatter.format(new Date(view.start_time)),
    patientName: view.patientName,
    serviceName: view.serviceName,
    doctorName: view.doctorName,
    status: resolveScheduleStatus(
      view.status,
      visitsByAppointment.get(view.id)?.status ?? null,
    ),
  }));

  let patientsWaiting = 0;
  let inConsultation = 0;
  let completedVisits = 0;
  const servingTokens: number[] = [];
  const waitingTokens: number[] = [];

  for (const visit of visits) {
    if (visit.status === "waiting" || visit.status === "checked_in") {
      patientsWaiting += 1;
      const token = toToken(visit.token_number);
      if (token !== null) waitingTokens.push(token);
    } else if (visit.status === "in_consultation") {
      inConsultation += 1;
      const token = toToken(visit.token_number);
      if (token !== null) servingTokens.push(token);
    } else if (visit.status === "completed") {
      completedVisits += 1;
    }
  }

  const queue: QueueSnapshot = {
    waitingCount: patientsWaiting,
    inConsultationCount: inConsultation,
    completedCount: completedVisits,
    nowServingToken: servingTokens.length ? Math.min(...servingTokens) : null,
    upNextToken: waitingTokens.length ? Math.min(...waitingTokens) : null,
  };

  return {
    analytics,
    kpis: {
      appointmentsToday: analytics.appointmentsToday,
      patientsWaiting,
      inConsultation,
      completedVisits,
    },
    schedule,
    queue,
    messages: inboxFeed.threads.slice(0, 3),
    unreadMessages: inboxFeed.unreadCount,
    activity: buildDashboardActivity((eventsResult.data ?? []) as EventRow[]),
  };
}
