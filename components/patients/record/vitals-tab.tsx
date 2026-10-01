"use client";

import { useState } from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Droplet,
  HeartPulse,
  Pencil,
  Thermometer,
  Wind,
} from "lucide-react";

import { utcIsoToClinicLocalInput } from "@/lib/time";
import { formatNaiveDate, formatNaiveTime } from "@/lib/utils/datetime";
import {
  formatBloodPressure,
  type PatientVitalsRow,
} from "@/lib/patient-record";
import {
  VitalCard,
  type VitalReading,
} from "@/components/patients/record/vital-card";
import { VitalsEditModal } from "@/components/patients/record/vitals-edit-modal";
import { cn } from "@/lib/utils";
import {
  bloodSugarTag,
  bpTag,
  pulseTag,
  spo2Tag,
  tempTag,
} from "@/lib/vitals-status";

/** Readings per page in the Previous Vitals list. */
const PAGE_SIZE = 5;

/**
 * The record's outlined secondary action — teal border, white fill. The one
 * button each card is allowed (see `RecordBanner`).
 */
const OUTLINE_BUTTON =
  "inline-flex items-center gap-1.5 rounded-control border-[1.5px] border-primary bg-surface px-4 py-2 text-[12.5px] font-semibold text-primary transition-colors hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";

const PAGE_BUTTON =
  "inline-flex size-8 items-center justify-center rounded-control border text-xs font-semibold tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-40";

/**
 * Vitals — the newest reading as the Overview's cardiac-style cards, then every
 * older reading as a paginated row list, newest first.
 *
 * The card grid answers "what should I do right now": five measurements with
 * their status tag beside the number. The list answers "what changed":
 * each row reads like the appointments list, one visit per line, so a clinician
 * sweeps down a column instead of opening reading after reading. Five readings
 * per page keeps a page skimmable; page numbers sit at the top-right (where the
 * eye looks for where it is) and at the bottom-right (where the thumb goes to
 * move on).
 */
export function VitalsTab({
  vitals,
  timezone,
  canManage,
  latestVisitId,
}: {
  vitals: PatientVitalsRow[];
  timezone: string;
  canManage: boolean;
  latestVisitId: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [page, setPage] = useState(0);

  const latest = vitals[0] ?? null;
  const pageCount = Math.max(1, Math.ceil(vitals.length / PAGE_SIZE));
  const pageIndex = Math.min(page, pageCount - 1);
  const pageStart = pageIndex * PAGE_SIZE;
  const pageRows = vitals.slice(pageStart, pageStart + PAGE_SIZE);

  const readings: VitalReading[] = latest
    ? [
        {
          key: "blood-pressure",
          label: "Blood pressure",
          icon: Activity,
          value: formatBloodPressure(latest),
          unit: "mmHg",
          tag: bpTag(latest),
        },
        {
          key: "temperature",
          label: "Temperature",
          icon: Thermometer,
          value:
            latest.temperature != null ? String(latest.temperature) : null,
          unit: "°F",
          tag: tempTag(latest.temperature ?? null),
        },
        {
          key: "pulse",
          label: "Pulse",
          icon: HeartPulse,
          value: latest.pulse != null ? String(latest.pulse) : null,
          unit: "bpm",
          tag: pulseTag(latest.pulse ?? null),
        },
        {
          key: "spo2",
          label: "SpO₂",
          icon: Wind,
          value: latest.spo2 != null ? String(latest.spo2) : null,
          unit: "%",
          tag: spo2Tag(latest.spo2 ?? null),
        },
        {
          key: "blood-sugar",
          label: "Blood sugar",
          icon: Droplet,
          value:
            latest.blood_sugar != null ? String(latest.blood_sugar) : null,
          unit: "mg/dL",
          tag: bloodSugarTag(latest.blood_sugar ?? null),
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      {/* Latest Vitals — the overview-style cardiac cards and the one action
          that edits them. */}
      <section className="rounded-panel border border-hairline bg-surface px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-ink">Latest Vitals</h3>
            <p className="mt-0.5 text-[11px] text-ink-faint">
              {latest
                ? describeReadingDate(latest, timezone)
                : "No vitals recorded yet"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={!canManage || !latestVisitId}
            title={
              !canManage
                ? "You don't have permission to edit vitals."
                : !latestVisitId
                  ? "Vitals are recorded when the patient checks in."
                  : undefined
            }
            className={OUTLINE_BUTTON}
          >
            <Pencil aria-hidden="true" className="size-3.5" />
            Edit Vitals
          </button>
        </div>

        {readings.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {readings.map((reading) => (
              <VitalCard key={reading.key} reading={reading} />
            ))}
          </div>
        ) : (
          <p className="mt-4 text-center text-[12.5px] text-ink-faint">
            No vitals configured for this doctor yet.
          </p>
        )}
      </section>

      {/* Previous Vitals — one reading per row, five per page, like the
          appointments list. */}
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-secondary">
              Previous Vitals
            </h3>
            <span className="text-xs text-text-muted tabular-nums">
              {vitals.length}
            </span>
          </div>
          {pageCount > 1 && (
            <span className="text-xs tabular-nums text-text-muted">
              Page {pageIndex + 1} of {pageCount}
            </span>
          )}
        </div>

        {vitals.length === 0 ? (
          <div className="flex flex-col items-center rounded-panel border border-hairline bg-surface px-6 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-canvas">
              <HeartPulse
                aria-hidden="true"
                className="size-6 text-slate-300"
              />
            </span>
            <h4 className="mt-3 text-sm font-medium text-ink">
              No vitals recorded yet
            </h4>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-faint">
              Vitals will appear here after they are recorded during a
              consultation.
            </p>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {pageRows.map((reading) => (
                <li
                  key={reading.id}
                  className="rounded-card border border-text-muted/20 bg-surface p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary">
                        {describeReadingDate(reading, timezone)}
                      </p>
                      <p className="mt-0.5 text-xs text-text-secondary">
                        {describeReadingSummary(reading)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {pageCount > 1 && (
              <nav
                aria-label="Vitals pages"
                className="mt-3 flex items-center justify-end gap-1"
              >
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={pageIndex === 0}
                  onClick={() => setPage(pageIndex - 1)}
                  className={PAGE_BUTTON}
                >
                  <ChevronLeft aria-hidden="true" className="size-4" />
                </button>
                {Array.from({ length: pageCount }, (_, index) => (
                  <button
                    key={index}
                    type="button"
                    aria-label={`Page ${index + 1}`}
                    aria-current={index === pageIndex ? "page" : undefined}
                    onClick={() => setPage(index)}
                    className={cn(
                      PAGE_BUTTON,
                      index === pageIndex
                        ? "border-primary bg-primary text-white"
                        : "border-text-muted/30 bg-surface text-text-secondary hover:bg-app",
                    )}
                  >
                    {index + 1}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={pageIndex === pageCount - 1}
                  onClick={() => setPage(pageIndex + 1)}
                  className={PAGE_BUTTON}
                >
                  <ChevronRight aria-hidden="true" className="size-4" />
                </button>
              </nav>
            )}
          </>
        )}
      </section>

      {editing && latestVisitId && (
        <VitalsEditModal
          visitId={latestVisitId}
          existingVitals={latest}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

/**
 * One-line summary of a reading for the list row, echoing how the appointments
 * list joins its services: the measurements that were actually taken, separated
 * by interpuncts, in the order the clinic reads them.
 */
function describeReadingSummary(reading: PatientVitalsRow): string {
  const parts = [
    formatBloodPressure(reading) ? `BP ${formatBloodPressure(reading)}` : null,
    reading.temperature != null ? `${reading.temperature}°F` : null,
    reading.pulse != null ? `${reading.pulse} bpm` : null,
    reading.spo2 != null ? `SpO₂ ${reading.spo2}%` : null,
    reading.respiratory_rate != null
      ? `Resp ${reading.respiratory_rate}`
      : null,
    reading.weight != null ? `${reading.weight} kg` : null,
    reading.height != null ? `${reading.height} cm` : null,
    reading.bmi != null ? `BMI ${reading.bmi}` : null,
    reading.blood_sugar != null ? `Sugar ${reading.blood_sugar}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "No measurements recorded";
}

/**
 * Label the reading by the date it was taken. `recorded_at` is when the nurse
 * saved it, which is what a clinician cares about; `visitDate` is a fallback for
 * rows whose visit was back-dated.
 */
function describeReadingDate(
  reading: PatientVitalsRow,
  timezone: string,
): string {
  const source = reading.recorded_at || reading.visitDate;
  if (!source) return "—";
  const local = utcIsoToClinicLocalInput(source, timezone);
  const date = formatNaiveDate(local);
  const time = formatNaiveTime(local);
  return time ? `${date} · ${time}` : date;
}