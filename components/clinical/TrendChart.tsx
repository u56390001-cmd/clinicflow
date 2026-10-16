"use client";

/**
 * Phase 4 §2 — longitudinal psychometric trend chart.
 *
 * A dependency-free SVG engine (no Recharts/Chart.js in this app) that renders
 * one line per instrument across the patient's scored assessments, per-instrument
 * severity-zone overlays, and an interactive hover readout. It reads the same
 * `psych_assessments` rows the workspace already fetched, so it costs no query.
 *
 * Instrument metadata (ceiling + bands) resolves in this order, matching how the
 * workspace resolves an assessment type for scoring:
 *   1. the linked Assessment-Library template's stored scoring (0085), else
 *   2. a validated Phase-1 instrument definition (PHQ-9, GAD-7, C-SSRS, …), else
 *   3. the code-side standard-instrument catalog (BDI-II, BAI, OCI-R, …).
 *
 * Severity bands are instrument-specific, so they are only drawn when a single
 * series is visible; overlaying two different instruments would put incompatible
 * scales on one set of zones. Multi-instrument comparison plots raw scores on a
 * shared axis instead, and each series keeps its own ceiling in the legend.
 */

import { useMemo, useState } from "react";

import { catalogEntryByKey, templateMaxScore } from "@/lib/assessment-library";
import { getInstrument } from "@/lib/scoring/registry";
import { formatShortDate, parseDateSafe } from "@/lib/utils/datetime";
import { cn } from "@/lib/utils";
import type { AssessmentTemplate, PsychAssessment } from "@/types/database";

export interface TrendChartProps {
  /** Newest-first administrations from the patient record bundle. */
  assessments: PsychAssessment[];
  /** Active Assessment-Library templates, for template-linked scoring bands. */
  templates?: AssessmentTemplate[];
  className?: string;
}

type Band = { min: number; max: number; label: string };

type InstrumentMeta = {
  /** Stable series key: template id, validated code, or a name fallback. */
  key: string;
  label: string;
  /** Instrument ceiling (0 when unknown — inferred from the data). */
  max: number;
  bands: Band[];
};

type Point = {
  t: number;
  score: number;
  assessment: PsychAssessment;
};

type Series = InstrumentMeta & {
  color: string;
  points: Point[];
};

/* ------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* ------------------------------------------------------------------------- */

const W = 720;
const H = 260;
const M = { top: 16, right: 18, bottom: 30, left: 42 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;
const DAY_MS = 86_400_000;

/** Distinct hues drawn from the product palette — teal first. */
const SERIES_COLORS = ["#4f806c", "#0EA5E9", "#F59E0B", "#7C3AED", "#E11D48", "#65A30D"];

/** Severity zones grade from reassuring (green) to alarming (red) by band order. */
const BAND_FILLS = [
  "rgba(16, 185, 129, 0.10)",
  "rgba(132, 204, 22, 0.10)",
  "rgba(245, 158, 11, 0.12)",
  "rgba(249, 115, 22, 0.12)",
  "rgba(239, 68, 68, 0.12)",
  "rgba(190, 18, 60, 0.14)",
];

const COMPLETED_BY_LABEL: Record<PsychAssessment["completed_by"], string> = {
  patient_online: "Patient online",
  reception: "Reception",
  psychologist: "Psychologist",
};

/* ------------------------------------------------------------------------- */
/* Metadata resolution                                                        */
/* ------------------------------------------------------------------------- */

function resolveMeta(
  assessment: PsychAssessment,
  templates: AssessmentTemplate[],
): InstrumentMeta {
  if (assessment.template_id) {
    const template = templates.find((t) => t.id === assessment.template_id);
    if (template) {
      return {
        key: `tmpl:${template.id}`,
        label: template.name,
        max: templateMaxScore(template.scoring),
        bands: template.scoring.bands,
      };
    }
  }

  const code = assessment.instrument_code ?? assessment.assessment_type;
  const instrument = getInstrument(code);
  if (instrument) {
    return {
      key: instrument.code,
      label: instrument.shortName || instrument.name,
      max: instrument.scoring.maxScore,
      bands: instrument.scoring.bands,
    };
  }

  const catalog = catalogEntryByKey(code);
  if (catalog) {
    return {
      key: catalog.key,
      label: catalog.key,
      max: catalog.scoring.max_score,
      bands: catalog.scoring.bands,
    };
  }

  return { key: `type:${code}`, label: code, max: 0, bands: [] };
}

function buildSeries(
  assessments: PsychAssessment[],
  templates: AssessmentTemplate[],
): Series[] {
  const groups = new Map<string, Series>();

  for (const assessment of assessments) {
    if (assessment.score === null || !Number.isFinite(assessment.score)) continue;
    const date = parseDateSafe(assessment.conducted_at);
    if (!date) continue;

    const meta = resolveMeta(assessment, templates);
    let series = groups.get(meta.key);
    if (!series) {
      series = { ...meta, color: SERIES_COLORS[groups.size % SERIES_COLORS.length], points: [] };
      groups.set(meta.key, series);
    }
    series.points.push({ t: date.getTime(), score: assessment.score, assessment });
  }

  for (const series of groups.values()) {
    series.points.sort((a, b) => a.t - b.t);
    if (series.max <= 0) {
      series.max = Math.max(...series.points.map((p) => p.score), 1);
    }
  }

  return [...groups.values()].sort((a, b) => b.points.length - a.points.length);
}

/** "28 Sep" — a compact x-axis label derived from the naive date string. */
function shortTick(dateStr: string): string {
  return formatShortDate(dateStr).replace(/ \d{4}$/, "");
}

/** Up to `max` evenly-spaced entries from a list. */
function sampleEvenly<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = (items.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i += 1) out.push(items[Math.round(i * step)]);
  return out;
}

/* ------------------------------------------------------------------------- */
/* Component                                                                  */
/* ------------------------------------------------------------------------- */

export function TrendChart({ assessments, templates = [], className }: TrendChartProps) {
  const series = useMemo(() => buildSeries(assessments, templates), [assessments, templates]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<{ key: string; index: number } | null>(null);

  if (series.length === 0) {
    return (
      <div
        className={cn(
          "rounded-control border border-dashed border-text-muted/25 bg-app px-3 py-6 text-center text-[12px] text-text-muted",
          className,
        )}
      >
        No scored assessments to plot yet. Record a score to start the trend.
      </div>
    );
  }

  const visible = series.filter((s) => !hidden.has(s.key));
  const plotted = visible.length > 0 ? visible : series;
  const single = plotted.length === 1;

  // Domain across every plotted point.
  const allPoints = plotted.flatMap((s) => s.points);
  let tMin = Math.min(...allPoints.map((p) => p.t));
  let tMax = Math.max(...allPoints.map((p) => p.t));
  if (tMax === tMin) {
    tMin -= DAY_MS;
    tMax += DAY_MS;
  }

  const observedMax = Math.max(...allPoints.map((p) => p.score));
  const axisMax = Math.max(
    single ? plotted[0].max : Math.max(...plotted.map((s) => s.max)),
    observedMax,
    1,
  );

  const x = (t: number) => M.left + ((t - tMin) / (tMax - tMin)) * PLOT_W;
  const y = (value: number) =>
    M.top + PLOT_H - (Math.max(0, Math.min(axisMax, value)) / axisMax) * PLOT_H;

  // Y gridlines / labels (5 steps, de-duplicated).
  const yTicks = Array.from({ length: 5 }, (_, i) => Math.round((axisMax * i) / 4));
  const uniqueYTicks = [...new Set(yTicks)];

  // X ticks sampled from the distinct dates in the plotted set.
  const distinctDates = [...new Set(allPoints.map((p) => p.assessment.conducted_at))].sort();
  const xTicks = sampleEvenly(distinctDates, 5);

  const hoveredPoint =
    hover &&
    (() => {
      const s = plotted.find((ser) => ser.key === hover.key);
      return s ? s.points[hover.index] : undefined;
    })();

  return (
    <div className={cn("space-y-2", className)}>
      {/* Legend / series toggle — the multi-instrument comparison control. */}
      {series.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {series.map((s) => {
            const isHidden = hidden.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={!isHidden}
                onClick={() =>
                  setHidden((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.key)) next.delete(s.key);
                    else next.add(s.key);
                    return next;
                  })
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                  isHidden
                    ? "border-hairline bg-surface text-text-muted line-through"
                    : "border-hairline bg-surface text-text-secondary hover:border-primary/40",
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-pill"
                  style={{ backgroundColor: isHidden ? "#CBD5E1" : s.color }}
                />
                {s.label}
                <span className="text-ink-faint">/{s.max}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="relative rounded-control bg-app">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Score trend across ${allPoints.length} assessment${allPoints.length === 1 ? "" : "s"}`}
          onMouseLeave={() => setHover(null)}
        >
          {/* Severity zones — single series only (bands are instrument-specific). */}
          {single &&
            plotted[0].bands.map((band, index) => {
              if (band.min >= axisMax) return null;
              const top = y(Math.min(band.max, axisMax));
              const bottom = y(band.min);
              return (
                <g key={`band-${index}`}>
                  <rect
                    x={M.left}
                    y={top}
                    width={PLOT_W}
                    height={Math.max(0, bottom - top)}
                    fill={BAND_FILLS[index % BAND_FILLS.length]}
                  />
                  {bottom - top > 12 && (
                    <text
                      x={W - M.right - 2}
                      y={top + 9}
                      textAnchor="end"
                      fontSize={8.5}
                      fill="#94A3B8"
                    >
                      {band.label}
                    </text>
                  )}
                </g>
              );
            })}

          {/* Y gridlines + labels. */}
          {uniqueYTicks.map((tick) => (
            <g key={`y-${tick}`}>
              <line
                x1={M.left}
                x2={W - M.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="#E2E8F0"
                strokeWidth={1}
              />
              <text x={M.left - 6} y={y(tick) + 3} textAnchor="end" fontSize={9} fill="#94A3B8">
                {tick}
              </text>
            </g>
          ))}

          {/* X labels. */}
          {xTicks.map((dateStr) => {
            const point = allPoints.find((p) => p.assessment.conducted_at === dateStr);
            if (!point) return null;
            return (
              <text
                key={`x-${dateStr}`}
                x={x(point.t)}
                y={H - M.bottom + 16}
                textAnchor="middle"
                fontSize={9}
                fill="#94A3B8"
              >
                {shortTick(dateStr)}
              </text>
            );
          })}

          {/* Hover guide line. */}
          {hoveredPoint && (
            <line
              x1={x(hoveredPoint.t)}
              x2={x(hoveredPoint.t)}
              y1={M.top}
              y2={M.top + PLOT_H}
              stroke="#94A3B8"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}

          {/* Series lines + points. */}
          {plotted.map((s) => (
            <g key={s.key}>
              {s.points.length > 1 && (
                <polyline
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={s.points.map((p) => `${x(p.t)},${y(p.score)}`).join(" ")}
                />
              )}
              {s.points.map((p, index) => {
                const active = hover?.key === s.key && hover.index === index;
                return (
                  <g key={`${s.key}-${p.assessment.id}`}>
                    <circle
                      cx={x(p.t)}
                      cy={y(p.score)}
                      r={active ? 5 : 3.5}
                      fill="#FFFFFF"
                      stroke={s.color}
                      strokeWidth={2}
                    />
                    <circle
                      cx={x(p.t)}
                      cy={y(p.score)}
                      r={11}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHover({ key: s.key, index })}
                    />
                  </g>
                );
              })}
            </g>
          ))}
        </svg>

        {hoveredPoint && (
          <TrendTooltip
            point={hoveredPoint}
            label={plotted.find((s) => s.key === hover?.key)?.label ?? ""}
            color={plotted.find((s) => s.key === hover?.key)?.color ?? "#4f806c"}
            x={x(hoveredPoint.t)}
            y={y(hoveredPoint.score)}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Tooltip                                                                    */
/* ------------------------------------------------------------------------- */

function TrendTooltip({
  point,
  label,
  color,
  x,
  y,
}: {
  point: Point;
  label: string;
  color: string;
  x: number;
  y: number;
}) {
  const a = point.assessment;
  return (
    <div
      className="pointer-events-none absolute z-10 w-52 -translate-x-1/2 -translate-y-[115%] rounded-control border border-hairline bg-surface p-2.5 text-left shadow-dropdown"
      style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }}
      role="tooltip"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-text-primary">
          <span aria-hidden="true" className="size-2 rounded-pill" style={{ backgroundColor: color }} />
          {label}
        </span>
        <span className="text-[11px] text-text-muted">{formatShortDate(a.conducted_at)}</span>
      </div>

      <p className="mt-1 text-[12.5px] text-text-primary">
        Score <span className="font-semibold tabular-nums">{point.score}</span>
        {a.severity ? ` · ${a.severity}` : ""}
      </p>

      <p className="mt-0.5 text-[10.5px] text-ink-faint">
        {COMPLETED_BY_LABEL[a.completed_by]}
      </p>

      {a.answers && Object.keys(a.answers).length > 0 && (
        <p className="mt-0.5 text-[10.5px] text-ink-faint">
          {Object.keys(a.answers).length} items answered
        </p>
      )}

      {a.safety_flag_raised && (
        <p className="mt-1 rounded-control bg-red-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-red-700">
          Safety flag raised
        </p>
      )}

      {a.notes && (
        <p className="mt-1 line-clamp-3 border-t border-hairline pt-1 text-[11px] leading-snug text-text-secondary">
          {a.notes}
        </p>
      )}
    </div>
  );
}
