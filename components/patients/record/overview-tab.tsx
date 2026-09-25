"use client";

import { CalendarClock } from "lucide-react";

import { AiSummaryCard } from "@/components/patients/record/ai-summary-card";
import {
  RecordFact,
  RecordSection,
} from "@/components/patients/record/record-primitives";
import { Badge } from "@/components/ui/badge";
import { APPOINTMENT_STATUS_META } from "@/lib/constants";
import { formatClinicLocalRange, utcIsoToClinicLocalInput } from "@/lib/time";
import { cn } from "@/lib/utils";
import { formatNaiveDate } from "@/lib/utils/datetime";
import { formatBloodPressure } from "@/lib/patient-record";
import type { PatientRecordData } from "@/lib/patient-record";
import type { AppointmentView } from "@/lib/appointments-view";
import type { PatientDirectoryRow } from "@/types/database";

/**
 * Overview — the tab a doctor lands on.
 *
 * It is not a summary *of* the record (the History and Clinical tabs are the
 * record; this just points at them). Three things earn a place here: the AI
 * patient summary, the last set of vitals, and the next booking. Everything
 * else is one click away in the tab strip, and repeating it here would only
 * make the first screen noisier.
 */
export function OverviewTab({
  patient,
  record,
  upcoming,
  timezone,
  canManage,
  aiSummaryEnabled,
}: {
  patient: PatientDirectoryRow;
  record: PatientRecordData;
  upcoming: AppointmentView[];
  timezone: string;
  canManage: boolean;
  /** `PATIENT_AI_SUMMARY_ENABLED` resolved on the server. */
  aiSummaryEnabled: boolean;
}) {
  const latestVitals = record.vitals[0] ?? null;
  const next = upcoming[0] ?? null;
  const nextStatus = next ? APPOINTMENT_STATUS_META[next.status] : null;

  return (
    <div className="space-y-4">
      <AiSummaryCard
        patientId={patient.id}
        summary={patient.ai_summary}
        generatedAt={patient.ai_summary_generated_at}
        generatedFromVisitCount={patient.ai_summary_visit_count}
        visitCount={patient.visit_count}
        timezone={timezone}
        canManage={canManage}
        enabled={aiSummaryEnabled}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <RecordSection
          title="Latest vitals"
          meta={
            latestVitals && (
              <span className="text-xs tabular-nums text-text-muted">
                {formatNaiveDate(
                  utcIsoToClinicLocalInput(latestVitals.recorded_at, timezone),
                )}
              </span>
            )
          }
        >
          {latestVitals ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <RecordFact label="Blood pressure">
                {formatBloodPressure(latestVitals)}
              </RecordFact>
              <RecordFact label="Pulse">
                {latestVitals.pulse !== null && (
                  <span className="tabular-nums">
                    {latestVitals.pulse} bpm
                  </span>
                )}
              </RecordFact>
              <RecordFact label="Temperature">
                {latestVitals.temperature !== null && (
                  <span className="tabular-nums">
                    {latestVitals.temperature} °C
                  </span>
                )}
              </RecordFact>
              <RecordFact label="SpO₂">
                {latestVitals.spo2 !== null && (
                  <span className="tabular-nums">{latestVitals.spo2} %</span>
                )}
              </RecordFact>
            </dl>
          ) : (
            <p className="text-sm text-text-muted">
              No readings recorded yet.
            </p>
          )}
        </RecordSection>

        <RecordSection
          title="Next appointment"
          meta={
            <CalendarClock
              aria-hidden="true"
              className="size-4 text-text-muted"
            />
          }
        >
          {next ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-text-primary">
                {formatClinicLocalRange(
                  next.start_time,
                  next.end_time,
                  timezone,
                )}
              </p>
              <p className="text-sm text-text-secondary">
                {[
                  next.serviceName,
                  next.doctorName ? `Dr. ${next.doctorName}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {nextStatus && (
                <Badge
                  variant="outline"
                  className={cn("ring-1 ring-inset", nextStatus.badge)}
                >
                  {nextStatus.label}
                </Badge>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-muted">Nothing booked.</p>
          )}
        </RecordSection>
      </div>
    </div>
  );
}
