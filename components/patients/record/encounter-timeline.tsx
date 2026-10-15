import { CalendarDays, History } from "lucide-react";

import {
  RecordEmpty,
  RecordSection,
} from "@/components/patients/record/record-primitives";
import {
  formatBloodPressure,
  type PatientVisitRow,
} from "@/lib/patient-record";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import { formatNaiveDate } from "@/lib/utils/datetime";
import { cn } from "@/lib/utils";

/**
 * The patient's encounter timeline: every visit newest-first with the doctor,
 * the recorded diagnosis and the vitals taken at the door.
 *
 * This is the "full visit timeline below" the directory contract describes
 * (`lib/patient-directory.ts`): the Overview tab opens on current state and
 * continues into the encounter history here. It reads entirely from the record
 * bundle already fetched for the tab (`record.visits`), so it costs no query.
 *
 * Diagnoses live on the visit's prescription (there is no diagnosis column on
 * `visits`); a visit without a finished prescription simply shows no diagnosis
 * rather than an empty one.
 */
export function EncounterTimeline({
  visits,
  timezone,
  className,
}: {
  /** Newest first, each with its own vitals + prescription. */
  visits: PatientVisitRow[];
  timezone: string;
  className?: string;
}) {
  return (
    <RecordSection
      title="Visit timeline"
      meta={
        visits.length > 0 ? (
          <span className="text-xs tabular-nums text-text-muted">
            {visits.length} {visits.length === 1 ? "visit" : "visits"}
          </span>
        ) : null
      }
      className={className}
    >
      {visits.length === 0 ? (
        <RecordEmpty
          icon={CalendarDays}
          title="No visits yet"
          description="Check this patient in from the queue and their visits, diagnoses and vitals will collect here."
        />
      ) : (
        <ol className="relative space-y-4 border-l border-hairline pl-5">
          {visits.map((visit) => {
            const diagnosis =
              visit.prescription?.diagnosis?.trim() ||
              visit.prescription?.custom_diagnosis?.trim() ||
              null;
            const vitals = vitalsSummary(visit.vitals);
            const when = formatNaiveDate(
              utcIsoToClinicLocalInput(visit.checked_in_at, timezone),
            );

            return (
              <li key={visit.id} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[26px] top-1.5 size-2.5 rounded-pill border-2 border-surface bg-primary"
                />
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
                    <History
                      aria-hidden="true"
                      className="size-3.5 text-text-muted"
                      strokeWidth={2}
                    />
                    {when}
                    <span className="text-text-muted">
                      · Token {visit.token_number}
                    </span>
                  </p>
                  {visit.doctorName && (
                    <p className="text-xs text-text-secondary">
                      {visit.doctorName}
                      {visit.doctorSpecialty ? ` · ${visit.doctorSpecialty}` : ""}
                    </p>
                  )}
                </div>

                <p
                  className={cn(
                    "mt-1 text-[12.5px]",
                    diagnosis ? "text-text-primary" : "text-text-muted",
                  )}
                >
                  <span className="font-medium text-text-secondary">
                    Diagnosis:
                  </span>{" "}
                  {diagnosis ?? "Not recorded"}
                </p>

                {vitals.length > 0 && (
                  <p className="mt-0.5 text-[11.5px] text-text-muted">
                    {vitals.join(" · ")}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </RecordSection>
  );
}

/** Compact one-line vitals summary: only the readings actually captured. */
function vitalsSummary(vitals: PatientVisitRow["vitals"]): string[] {
  if (!vitals) return [];
  const parts: string[] = [];
  const bp = formatBloodPressure(vitals);
  if (bp) parts.push(`BP ${bp}`);
  if (vitals.temperature != null) parts.push(`Temp ${vitals.temperature}°F`);
  if (vitals.pulse != null) parts.push(`Pulse ${vitals.pulse} bpm`);
  if (vitals.spo2 != null) parts.push(`SpO₂ ${vitals.spo2}%`);
  return parts;
}
