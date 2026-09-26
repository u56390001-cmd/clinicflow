"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Eye, MapPin, Phone, ShieldCheck } from "lucide-react";

import { GROWTH_METRIC_RANGES, type GrowthMetricRangeId } from "@/lib/constants";
import type { GrowthRangeSummary } from "@/lib/growth-agent-queries";
import { cn } from "@/lib/utils";

/**
 * Metric row.
 *
 * Three of these are counts and one is a grade, so they are not given the same
 * shape. A count is a big number with a comparison under it; a score out of 100
 * is a ring, because "92" and "1,420" are not the same kind of fact and giving
 * them identical boxes would flatten that.
 *
 * Every percentage is computed in `summariseGrowthRanges` from real rows. When
 * the comparison window has no data — or the base is zero, where growth is
 * undefined rather than infinite — the line says so instead of printing a
 * number. This is the difference between a dashboard and a decoration.
 */
export function GrowthMetricGrid({
  summaries,
  activeRange,
  onRangeChange,
}: {
  summaries: GrowthRangeSummary[];
  activeRange: GrowthMetricRangeId;
  onRangeChange: (id: GrowthMetricRangeId) => void;
}) {
  const active =
    summaries.find((summary) => summary.rangeId === activeRange) ?? summaries[0];

  if (!active) return null;

  // No rows at all: say so once, rather than four times.
  if (!active.totals) {
    return (
      <section aria-label="Profile metrics" className="space-y-4">
        <RangePicker
          summaries={summaries}
          activeRange={activeRange}
          onRangeChange={onRangeChange}
        />
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
    <section aria-label="Profile metrics" className="space-y-4">
      <RangePicker
        summaries={summaries}
        activeRange={activeRange}
        onRangeChange={onRangeChange}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CountTile
          icon={Eye}
          label="Profile views"
          value={totals.views}
          delta={active.delta.views}
          comparison={`vs previous ${rangeLabel}`}
        />
        <CountTile
          icon={Phone}
          label="Calls from your listing"
          value={totals.calls}
          delta={active.delta.calls}
          comparison={`vs previous ${rangeLabel}`}
        />
        <CountTile
          icon={MapPin}
          label="Direction requests"
          value={totals.directionRequests}
          delta={active.delta.directionRequests}
          comparison={`vs previous ${rangeLabel}`}
        />
        <ScoreTile
          score={active.healthScore}
          daysWithData={active.daysWithData}
        />
      </div>
    </section>
  );
}

/** Range selector. Only ranges that have data enable themselves. */
function RangePicker({
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
      className="inline-flex flex-wrap gap-1 rounded-control bg-surface p-1 ring-1 ring-inset ring-text-muted/30"
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
              hasData
                ? undefined
                : "No metrics recorded for this period yet."
            }
            className={cn(
              "rounded-[6px] px-3 py-1.5 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              isActive
                ? "bg-primary text-white"
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

/** One count, its change, and the window the change is measured against. */
function CountTile({
  icon: Icon,
  label,
  value,
  delta,
  comparison,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  delta: number | null;
  comparison: string;
}) {
  return (
    <div className="rounded-card border border-text-muted/30 bg-surface p-5">
      <div className="flex items-center gap-2 text-text-secondary">
        <Icon className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-2 text-3xl font-semibold leading-none tracking-tight tabular-nums text-text-primary">
        {value.toLocaleString()}
      </p>
      <DeltaLine delta={delta} comparison={comparison} />
    </div>
  );
}

/**
 * Profile health as a ring rather than a number in the same box as the counts.
 *
 * The three bands are the ones Google itself uses for its own profile
 * completeness guidance, so the colours mean what a clinic owner already
 * expects them to mean.
 */
function ScoreTile({
  score,
  daysWithData,
}: {
  score: number | null;
  daysWithData: number;
}) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const clamped = score === null ? null : Math.max(0, Math.min(100, score));
  const dash = clamped === null ? 0 : (clamped / 100) * circumference;

  const tone =
    clamped === null
      ? { ring: "text-text-muted", stroke: "text-text-muted/25" }
      : clamped >= 80
        ? { ring: "text-primary", stroke: "text-primary" }
        : clamped >= 50
          ? { ring: "text-status-warning", stroke: "text-status-warning" }
          : { ring: "text-status-destructive", stroke: "text-status-destructive" };

  return (
    <div className="rounded-card border border-text-muted/30 bg-surface p-5">
      <div className="flex items-center gap-2 text-text-secondary">
        <ShieldCheck className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
        <span className="text-sm">Profile health</span>
      </div>

      <div className="mt-2 flex items-center gap-4">
        <div className="relative size-[68px] shrink-0">
          <svg
            viewBox="0 0 64 64"
            className="size-full -rotate-90"
            role="img"
            aria-label={
              clamped === null
                ? "Profile health not scored yet"
                : `Profile health ${clamped} out of 100`
            }
          >
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              strokeWidth="6"
              className="stroke-text-muted/15"
            />
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              className={cn("transition-[stroke-dasharray] duration-500", tone.stroke)}
            />
          </svg>
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums",
              tone.ring,
            )}
          >
            {clamped === null ? "—" : clamped}
          </span>
        </div>

        <p className="text-xs leading-relaxed text-text-secondary">
          {clamped === null
            ? "Not scored yet. A score appears once Google has enough profile data."
            : clamped >= 80
              ? "Your listing is well filled in. Keep the photos and details current."
              : clamped >= 50
                ? "Some profile details are missing. Filling them in usually lifts this."
                : "Important details are missing from your listing."}
        </p>
      </div>

      {daysWithData > 0 ? (
        <p className="mt-3 text-xs text-text-muted">
          Based on {daysWithData} {daysWithData === 1 ? "day" : "days"} of data
        </p>
      ) : null}
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
    <p className="mt-3 flex items-center gap-1 text-xs">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-medium tabular-nums",
          flat
            ? "text-text-secondary"
            : up
              ? "text-status-success"
              : "text-status-destructive",
        )}
      >
        {!flat ? (
          up ? (
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          ) : (
            <ArrowDownRight className="size-3.5" aria-hidden="true" />
          )
        ) : null}
        {flat ? "No change" : `${up ? "+" : ""}${rounded}%`}
      </span>
      <span className="text-text-muted">{comparison}</span>
    </p>
  );
}
