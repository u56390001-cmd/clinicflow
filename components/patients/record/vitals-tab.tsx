import { Activity } from "lucide-react";

import { RecordEmpty } from "@/components/patients/record/record-primitives";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import { formatNaiveDate, formatNaiveTime } from "@/lib/utils/datetime";
import {
  formatBloodPressure,
  type PatientVitalsRow,
} from "@/lib/patient-record";

/**
 * Every measurement the clinic tracks, with its unit. Kept as data so the table
 * head, the mobile cards and the trend arrows all read the same list.
 */
const VITAL_COLUMNS = [
  { key: "bp", label: "BP", unit: "mmHg" },
  { key: "temperature", label: "Temp", unit: "°F" },
  { key: "pulse", label: "Pulse", unit: "bpm" },
  { key: "spo2", label: "SpO₂", unit: "%" },
  { key: "respiratory_rate", label: "Resp", unit: "breaths/min" },
  { key: "weight", label: "Weight", unit: "kg" },
  { key: "height", label: "Height", unit: "cm" },
  { key: "bmi", label: "BMI", unit: "kg/m²" },
] as const;

/**
 * Vitals — one row per reading, newest first, so a trend is visible by reading
 * down a column.
 *
 * A table (rather than a card per reading) is deliberate: comparing today's
 * blood pressure against last month's is the entire point of this tab, and that
 * only works when the numbers line up vertically. Below `sm` it falls back to
 * stacked cards, where a 8-column table would be unreadable.
 */
export function VitalsTab({
  vitals,
  timezone,
}: {
  vitals: PatientVitalsRow[];
  timezone: string;
}) {
  if (vitals.length === 0) {
    return (
      <RecordEmpty
        icon={Activity}
        title="No vitals recorded yet"
        description="Vitals are captured at check-in. Once a nurse records a reading it appears here, newest first."
      />
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-card border border-text-muted/20 sm:block">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-text-muted/20 bg-app text-left">
              <th
                scope="col"
                className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted"
              >
                Date
              </th>
              {VITAL_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted"
                >
                  {column.label}
                  <span className="ml-1 font-normal normal-case">
                    ({column.unit})
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-text-muted/15">
            {vitals.map((reading) => {
              const values = readingValues(reading);
              return (
                <tr key={reading.id} className="bg-surface">
                  <td className="whitespace-nowrap px-3 py-2 text-text-primary">
                    {describeReadingDate(reading, timezone)}
                  </td>
                  {VITAL_COLUMNS.map((column) => (
                    <td
                      key={column.key}
                      className="whitespace-nowrap px-3 py-2 tabular-nums"
                    >
                      {values[column.key] ?? (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 sm:hidden">
        {vitals.map((reading) => {
          const values = readingValues(reading);
          return (
            <li
              key={reading.id}
              className="rounded-card border border-text-muted/20 bg-surface p-3"
            >
              <p className="text-sm font-medium text-text-primary">
                {describeReadingDate(reading, timezone)}
              </p>
              <dl className="mt-2 grid grid-cols-3 gap-2">
                {VITAL_COLUMNS.filter(
                  (column) => values[column.key] !== null,
                ).map((column) => (
                  <div key={column.key}>
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                      {column.label}
                    </dt>
                    <dd className="text-sm tabular-nums text-text-primary">
                      {values[column.key]}
                      <span className="ml-0.5 text-[10px] text-text-muted">
                        {column.unit}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>
    </>
  );
}

type VitalKey = (typeof VITAL_COLUMNS)[number]["key"];

function readingValues(
  reading: PatientVitalsRow,
): Record<VitalKey, string | null> {
  const num = (value: number | null) =>
    value === null ? null : String(value);
  return {
    bp: formatBloodPressure(reading),
    temperature: num(reading.temperature),
    pulse: num(reading.pulse),
    spo2: num(reading.spo2),
    respiratory_rate: num(reading.respiratory_rate),
    weight: num(reading.weight),
    height: num(reading.height),
    bmi: num(reading.bmi),
  };
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
