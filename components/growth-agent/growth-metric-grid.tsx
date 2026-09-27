"use client";

import type { LucideIcon } from "lucide-react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  MapPin,
  Minus,
  Phone,
  ShieldCheck,
} from "lucide-react";

import { GROWTH_METRIC_RANGES, type GrowthMetricRangeId } from "@/lib/constants";
import type { GrowthRangeSummary } from "@/lib/growth-agent-queries";
import { cn } from "@/lib/utils";

/**
 * Metric row.
 *
 * Four tiles of one shape, because the point of this row is to be scanned
 * across rather than read. The health score is a percentage where the other
 * three are counts, but they are all "one number, and how it is moving", so
 * they get the same box — the difference between them is carried by the
 * footnote line, not by an inconsistent card.
 *
 * Every percentage is computed in `summariseGrowthRanges` from real rows. When
 * the comparison window has no data — or the base is zero, where growth is
 * undefined rather than infinite — the line says so instead of printing a
 * number. This is the difference between a dashboard and a decoration.
 *
 * The range selector is not here. It belongs to the page header, opposite the
 * title, because it governs the whole page's numbers rather than this row.
 */
export function GrowthMetricGrid({
  summaries,
  activeRange,
}: {
  summaries: GrowthRangeSummary[];
  activeRange: GrowthMetricRangeId;
}) {
  const active =
    summaries.find((summary) => summary.rangeId === activeRange) ?? summaries[0];

  if (!active) return null;

  // No rows at all: say so once, rather than four times.
  if (!active.totals) {
    return (
      <section aria-label="Profile metrics">
        <div className="rounded-card border border-dashed border-text-muted/40 bg-surface px-6 py-8 text-center">
          <p className="text-sm font-medium text-text-primary">
            No metrics recorded yet
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-text-secondary">
            Views, calls and direction requests arrive from Google once your
            business profile is linked. Nothing is shown here until then, because
            a zero would read as &ldquo;nobody found you&rdquo; rather than
            &ldquo;we have not looked&rdquo;.
          </p>
        </div>
      </section>
    );
  }

  const totals = active.totals;
  const rangeLabel = active.label.toLowerCase();

  return (
    <section aria-label="Profile metrics">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          icon={Eye}
          label="Profile views"
          value={totals.views.toLocaleString()}
          footer={
            <DeltaLine
              delta={active.delta.views}
              comparison={`vs previous ${rangeLabel}`}
            />
          }
        />
        <MetricTile
          icon={Phone}
          label="Calls from your listing"
          value={totals.calls.toLocaleString()}
          footer={
            <DeltaLine
              delta={active.delta.calls}
              comparison={`vs previous ${rangeLabel}`}
            />
          }
        />
        <MetricTile
          icon={MapPin}
          label="Direction requests"
          value={totals.directionRequests.toLocaleString()}
          footer={
            <DeltaLine
              delta={active.delta.directionRequests}
              comparison={`vs previous ${rangeLabel}`}
            />
          }
        />
        <MetricTile
          icon={ShieldCheck}
          label="Profile health"
          value={active.healthScore === null ? "—" : `${active.healthScore}%`}
          footer={
            <HealthLine
              score={active.healthScore}
              daysWithData={active.daysWithData}
            />
          }
        />
      </div>
    </section>
  );
}

/** Range selector. Only ranges that have data enable themselves. */
export function RangePicker({
  summaries,
  activeRange,
  onRangeChange,
}: {
  summaries: GrowthRangeSummary[];
  activeRange: GrowthMetricRangeId;
  onRangeChange: (id: GrowthMetricRangeId) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Date range"
      className="inline-flex flex-wrap gap-1 rounded-control border border-text-muted/30 bg-surface p-1"
    >
      {GROWTH_METRIC_RANGES.map((range) => {
        const summary = summaries.find((item) => item.rangeId === range.id);
        const hasData = Boolean(summary?.totals);
        const isActive = range.id === activeRange;

        return (
          <button
            key={range.id}
            type="button"
            onClick={() => onRangeChange(range.id)}
            aria-pressed={isActive}
            title={
              hasData ? undefined : "No metrics recorded for this period yet."
            }
            className={cn(
              "rounded-[6px] px-3 py-1.5 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              isActive
                ? "bg-primary font-semibold text-white"
                : hasData
                  ? "text-text-secondary hover:bg-app hover:text-text-primary"
                  : "text-text-muted/50 hover:text-text-muted",
            )}
          >
            {range.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One number, its label above it, and an accent square holding the icon.
 *
 * `footer` is a slot rather than a fixed delta, because three of these tiles
 * report a change over time and the fourth reports a grade. Forcing the fourth
 * into a "vs previous period" line would have meant inventing a delta for a
 * score that has no meaningful comparison.
 */
function MetricTile({
  icon: Icon,
  label,
  value,
  footer,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  footer: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-text-muted/30 bg-surface p-5 transition-colors hover:border-text-muted/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-sm text-text-secondary">{label}</span>
          <p className="mt-1.5 text-2xl font-bold leading-none tracking-tight tabular-nums text-text-primary">
            {value}
          </p>
        </div>
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary text-white"
          aria-hidden="true"
        >
          <Icon className="size-5" />
        </span>
      </div>
      {footer}
    </div>
  );
}

/** Change indicator. Falls back to an explanation, never to a fake number. */
function DeltaLine({
  delta,
  comparison,
}: {
  delta: number | null;
  comparison: string;
}) {
  if (delta === null) {
    return (
      <p className="mt-3 text-xs text-text-muted">
        No earlier period to compare against
      </p>
    );
  }

  const rounded = Math.round(delta);
  const flat = rounded === 0;
  const up = rounded > 0;

  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-1.5 text-xs">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-semibold tabular-nums",
          flat
            ? "text-text-secondary"
            : up
              ? "text-status-success"
              : "text-status-destructive",
        )}
      >
        {flat ? (
          <Minus className="size-3.5" aria-hidden="true" />
        ) : up ? (
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        ) : (
          <ArrowDownRight className="size-3.5" aria-hidden="true" />
        )}
        {flat ? "No change" : `${up ? "+" : ""}${rounded}%`}
      </span>
      <span className="text-text-muted">{comparison}</span>
    </p>
  );
}

/**
 * Health, as a band rather than a delta.
 *
 * The bands are the ones Google uses in its own profile-completeness guidance,
 * so the colours mean what a clinic owner already expects. The grade is derived
 * from the score rather than stored, and the number of days behind it is stated
 * so a score built on two days of data is not read as a score built on ninety.
 */
function HealthLine({
  score,
  daysWithData,
}: {
  score: number | null;
  daysWithData: number;
}) {
  if (score === null) {
    return (
      <p className="mt-3 text-xs text-text-muted">
        Not scored yet — Google needs more profile data
      </p>
    );
  }

  const band =
    score >= 80
      ? { label: "Optimal", tone: "text-status-success" }
      : score >= 50
        ? { label: "Could be better", tone: "text-status-warning" }
        : { label: "Needs attention", tone: "text-status-destructive" };

  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-1.5 text-xs">
      <span className={cn("inline-flex items-center gap-1 font-semibold", band.tone)}>
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        {band.label}
      </span>
      <span className="text-text-muted">
        {daysWithData > 0
          ? `${gradeFor(score)} · ${daysWithData} ${daysWithData === 1 ? "day" : "days"} of data`
          : gradeFor(score)}
      </span>
    </p>
  );
}

/** Letter grade for a 0–100 score. */
function gradeFor(score: number): string {
  if (score >= 90) return "Grade A";
  if (score >= 80) return "Grade B";
  if (score >= 70) return "Grade C";
  if (score >= 60) return "Grade D";
  return "Grade F";
}