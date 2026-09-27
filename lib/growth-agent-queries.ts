/**
 * Growth Agent — scoped reads (Phase 24).
 *
 * Every query here is pinned to a `clinicId` that the caller resolved from the
 * signed-in user's own membership, and every one of them runs through the
 * user's Supabase client so RLS applies as a second, independent check. The
 * explicit `.eq("clinic_id", …)` is therefore not redundant with the policies —
 * it is what keeps a bug in this file from becoming a cross-tenant read.
 *
 * The metric aggregation lives here rather than in the component because the
 * range selector has to be *real*: switching "Last 7 days" to "Year to date"
 * re-adds the same rows differently, and the comparison percentage under each
 * number is derived from the preceding window of equal length — never asserted.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { GROWTH_METRIC_RANGES, type GrowthMetricRangeId } from "@/lib/constants";
import { clinicToday } from "@/lib/time";
import type { Database, GrowthAgentSettings, GrowthPost } from "@/types/database";

/**
 * Default settings for a clinic that has never opened this page. Returned
 * rather than written on read: creating a row as a side effect of a page view
 * makes "has this clinic configured the Growth Agent?" unanswerable.
 */
export const DEFAULT_GROWTH_SETTINGS: Omit<
  GrowthAgentSettings,
  "id" | "clinic_id" | "created_at" | "updated_at"
> = {
  connection_state: "not_connected",
  google_location_name: null,
  google_location_id: null,
  google_account_email: null,
  connected_at: null,
  last_synced_at: null,
  last_error: null,
  auto_post_enabled: false,
  posting_frequency: "weekly",
  preferred_day: 3,
  preferred_time: "10:00:00",
  require_approval: true,
};

/** The clinic's Growth Agent settings, or defaults when never configured. */
export async function fetchGrowthSettings(
  supabase: SupabaseClient<Database>,
  clinicId: string,
): Promise<GrowthAgentSettings | null> {
  const { data, error } = await supabase
    .from("growth_agent_settings")
    .select("*")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (error) {
    console.error("[growth-agent] settings read failed", error.message);
    return null;
  }
  return data;
}

/** Names of the clinic's active services — the topical grounding for the model. */
export async function fetchGrowthServiceNames(
  supabase: SupabaseClient<Database>,
  clinicId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("services")
    .select("name")
    .eq("clinic_id", clinicId)
    .eq("status", "active")
    .order("name", { ascending: true })
    .limit(25);

  if (error) {
    console.error("[growth-agent] services read failed", error.message);
    return [];
  }
  return (data ?? []).map((row) => row.name).filter(Boolean);
}

/** The content queue, newest first. */
export async function fetchGrowthPosts(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  limit = 100,
): Promise<GrowthPost[]> {
  const { data, error } = await supabase
    .from("growth_posts")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[growth-agent] posts read failed", error.message);
    return [];
  }
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Metric aggregation
// ---------------------------------------------------------------------------

/** How many days of history the read will consider. Covers year-to-date plus
 *  its same-period-last-year comparison for any realistic clinic. */
const METRIC_HISTORY_DAYS = 730;

export type GrowthMetricTotals = {
  views: number;
  calls: number;
  directionRequests: number;
};

export type GrowthRangeSummary = {
  rangeId: GrowthMetricRangeId;
  label: string;
  /** Clamped to today. The day in progress is a partial count, so it is
   *  labelled and the UI can say so rather than implying a full day. */
  windowStart: string;
  windowEnd: string;
  /**
   * Null when the clinic has no rows at all in this window. Distinct from zero:
   * "we have no data" and "nobody looked" are different facts, and four zeros
   * on a dashboard reads as the second when it is the first.
   */
  totals: GrowthMetricTotals | null;
  /** Most recent non-null health score in the window, if any. */
  healthScore: number | null;
  /** Percentage change against the immediately preceding window of equal
   *  length. Null when either window is missing data or the base is zero —
   *  growth from zero is undefined, not infinite. */
  delta: {
    views: number | null;
    calls: number | null;
    directionRequests: number | null;
  };
  /** Days in the window that have a row. Shown so a sparse history is visible. */
  daysWithData: number;
};

type MetricRow = Pick<
  Database["public"]["Tables"]["growth_metrics"]["Row"],
  "metric_date" | "views" | "calls" | "direction_requests" | "health_score"
>;

const ZERO_TOTALS: GrowthMetricTotals = {
  views: 0,
  calls: 0,
  directionRequests: 0,
};

/** Inclusive-start, exclusive-end ISO date arithmetic on `YYYY-MM-DD`. */
function shiftDate(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function daysInclusive(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * Sum one half-open window `[from, to)`.
 *
 * `metric_date` is a clinic-local calendar date, so this is plain string
 * comparison — no timezone conversion, and therefore no DST boundary that could
 * silently drop or duplicate a day.
 */
function sumWindow(rows: MetricRow[], from: string, to: string) {
  let views = 0;
  let calls = 0;
  let directionRequests = 0;
  let healthScore: number | null = null;
  let daysWithData = 0;
  let latestScoreDate = "";

  for (const row of rows) {
    if (row.metric_date < from || row.metric_date >= to) continue;
    views += row.views;
    calls += row.calls;
    directionRequests += row.direction_requests;
    daysWithData += 1;

    // "Health score" is a state, not a total: take the most recent reading in
    // the window rather than averaging, since averaging a grade is meaningless.
    if (row.health_score !== null && row.metric_date >= latestScoreDate) {
      healthScore = row.health_score;
      latestScoreDate = row.metric_date;
    }
  }

  return {
    totals: { views, calls, directionRequests },
    healthScore,
    daysWithData,
  };
}

/** Percentage change, or null when the base is zero or the base window is
 *  empty. Never returns Infinity or NaN. */
function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  const change = ((current - previous) / previous) * 100;
  return Number.isFinite(change) ? change : null;
}

/**
 * Pre-compute every range the selector offers.
 *
 * Aggregating all four on the server costs one query and means the client
 * switches range with no round trip and no loading state — while the numbers
 * stay honest, because each is a real sum over real rows.
 */
export function summariseGrowthRanges(
  rows: MetricRow[],
  timezone: string,
  todayOverride?: string,
): GrowthRangeSummary[] {
  const today = todayOverride ?? clinicToday(timezone);
  const yearStart = `${today.slice(0, 4)}-01-01`;

  return GROWTH_METRIC_RANGES.map((range) => {
    const isYtd = range.id === "ytd";

    const windowStart = isYtd ? yearStart : shiftDate(today, -(range.window - 1));
    // Exclusive end: tomorrow, so today is included.
    const windowEnd = shiftDate(today, 1);

    const windowLength = daysInclusive(windowStart, today);

    // The comparison is the equal-length window immediately before this one.
    // For year-to-date that is the same span one year earlier, which is what a
    // clinic owner means by "compared to last year".
    const compareEnd = windowStart;
    const compareStart = isYtd
      ? shiftDate(yearStart, -365)
      : shiftDate(windowStart, -windowLength);

    const current = sumWindow(rows, windowStart, windowEnd);
    const previous = sumWindow(rows, compareStart, compareEnd);

    const hasCurrentData = current.daysWithData > 0;

    return {
      rangeId: range.id,
      label: range.label,
      windowStart,
      windowEnd: today,
      totals: hasCurrentData ? current.totals : null,
      healthScore: current.healthScore,
      delta: {
        views: hasCurrentData
          ? percentChange(current.totals.views, previous.totals.views)
          : null,
        calls: hasCurrentData
          ? percentChange(current.totals.calls, previous.totals.calls)
          : null,
        directionRequests: hasCurrentData
          ? percentChange(current.totals.directionRequests, previous.totals.directionRequests)
          : null,
      },
      daysWithData: current.daysWithData,
    };
  });
}

/**
 * Read the clinic's daily metric series and reduce it to the four range
 * summaries. Returns an empty summary set (all `totals: null`) when there is no
 * data at all, which is what the dashboard's empty state renders.
 */
export async function fetchGrowthMetricSummaries(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  timezone: string,
): Promise<{ summaries: GrowthRangeSummary[]; hasAnyData: boolean }> {
  const today = clinicToday(timezone);
  const from = shiftDate(today, -METRIC_HISTORY_DAYS);

  const { data, error } = await supabase
    .from("growth_metrics")
    .select("metric_date, views, calls, direction_requests, health_score")
    .eq("clinic_id", clinicId)
    .gte("metric_date", from)
    .lte("metric_date", today)
    .order("metric_date", { ascending: true });

  if (error) {
    console.error("[growth-agent] metrics read failed", error.message);
    return {
      summaries: summariseGrowthRanges([], timezone, today),
      hasAnyData: false,
    };
  }

  const rows = data ?? [];
  return {
    summaries: summariseGrowthRanges(rows, timezone, today),
    hasAnyData: rows.length > 0,
  };
}

/** True when the clinic has at least one post in the queue, used for the
 *  "queue is empty, generate your first post" empty state. */
export function countByStatus(posts: GrowthPost[]) {
  const counts: Record<GrowthPost["status"], number> = {
    draft: 0,
    scheduled: 0,
    published: 0,
    failed: 0,
  };
  for (const post of posts) {
    counts[post.status] += 1;
  }
  return counts;
}

export { ZERO_TOTALS, shiftDate };
