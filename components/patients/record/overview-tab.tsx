"use client";

import { CalendarClock, Plus } from "lucide-react";

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
import { formatBloodPressure, calculateBMI } from "@/lib/patient-record";
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
  const bmiInfo = calculateBMI(patient.height, patient.weight);

  const getVitalStatus = (
    value: number | null,
    normalRange: number,
    highThreshold: number,
    isNormal: boolean,
  ): { text: string; className: string } => {
    if (value === null) {
      return { text: "N/A", className: "text-slate-400" };
    }
    if (isNormal) {
      return { text: "Normal", className: "text-green-600 font-semibold" };
    }
    return { text: "High", className: "text-red-600 font-semibold" };
  };

  const getSpO2Status = (value: number | null): { text: string; className: string } => {
    if (value === null) {
      return { text: "N/A", className: "text-slate-400" };
    }
    if (value >= 95) {
      return { text: "Normal", className: "text-green-600 font-semibold" };
    }
    return { text: "Borderline", className: "text-amber-600 font-semibold" };
  };

  const getTempStatus = (value: number | null): { text: string; className: string } => {
    if (value === null) {
      return { text: "N/A", className: "text-slate-400" };
    }
    if (value >= 36.1 && value <= 37.2) {
      return { text: "Normal", className: "text-green-600 font-semibold" };
    }
    return { text: "High", className: "text-red-600 font-semibold" };
  };

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
          title="Basic Health Info"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-teal-600">
                UHID: {patient.patient_code}
              </span>
              <span className="inline-flex items-center rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-700">
                {patient.blood_group}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="flex items-center gap-1">
                <span className="font-semibold">Height:</span>
                {patient.height ? `${patient.height} cm` : "N/A"}
              </span>
              <span className="flex items-center gap-1">
                <span className="font-semibold">Weight:</span>
                {patient.weight ? `${patient.weight} kg` : "N/A"}
              </span>
              {bmiInfo.bmi && (
                <span className="inline-flex items-center rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-700">
                  BMI: {bmiInfo.bmi}
                </span>
              )}
            </div>
            {patient.known_allergies && (
              <div className="inline-flex items-center gap-2 rounded-full bg-red-50 border border-red-200 px-3 py-1">
                <span className="text-xs font-semibold text-red-700">⚠️ Allergy</span>
                <span className="text-xs text-red-600">{patient.known_allergies}</span>
              </div>
            )}
            {patient.medical_conditions && (
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-3 py-1">
                <span className="text-xs font-semibold text-amber-700">🩸 Condition</span>
                <span className="text-xs text-amber-600">{patient.medical_conditions}</span>
              </div>
            )}
            {patient.current_medications && (
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">Current Medications</span>
                <p className="text-xs text-slate-600">{patient.current_medications}</p>
              </div>
            )}
          </div>
        </RecordSection>

        <RecordSection
          title="Last Encounter"
        >
          <div className="space-y-3">
            {latestVitals ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Blood Pressure</span>
                  <span className={cn(
                    "font-semibold",
                    getVitalStatus(
                      latestVitals.systolic_bp || latestVitals.blood_pressure ? (latestVitals.systolic_bp ?? 0) : 120,
                      120,
                      130,
                      (latestVitals.systolic_bp ?? 120) < 130 && (latestVitals.diastolic_bp ?? 80) < 85,
                    ).className,
                  )}>
                    {formatBloodPressure(latestVitals)} mmHg
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Pulse</span>
                  <span className="font-semibold text-green-600">
                    {latestVitals.pulse} bpm
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">SpO₂</span>
                  <span className={cn(
                    "font-semibold",
                    getSpO2Status(latestVitals.spo2).className,
                  )}>
                    {latestVitals.spo2} %
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Temperature</span>
                  <span className={cn(
                    "font-semibold",
                    getTempStatus(latestVitals.temperature).className,
                  )}>
                    {latestVitals.temperature} °C
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">No vitals recorded yet.</p>
            )}
          </div>
        </RecordSection>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <RecordSection
          title="Vitals Grid"
        >
          {latestVitals ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <dt className="text-xs text-slate-500">Blood Pressure</dt>
                <dd className="text-sm font-semibold text-slate-800">
                  {formatBloodPressure(latestVitals)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Pulse</dt>
                <dd className="text-sm font-semibold text-slate-800">
                  {latestVitals.pulse || "N/A"} bpm
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">SpO₂</dt>
                <dd className="text-sm font-semibold text-slate-800">
                  {latestVitals.spo2 || "N/A"} %
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Temperature</dt>
                <dd className="text-sm font-semibold text-slate-800">
                  {latestVitals.temperature || "N/A"} °C
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">
              No readings recorded yet.
            </p>
          )}
        </RecordSection>

        <RecordSection
          title="Next Appointment"
        >
          {next ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-800">
                {formatClinicLocalRange(
                  next.start_time,
                  next.end_time,
                  timezone,
                )}
              </p>
              <p className="text-sm text-slate-600">
                {next.serviceName}
              </p>
              {next.doctorName && (
                <p className="text-sm text-slate-600">
                  Dr. {next.doctorName}
                </p>
              )}
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
            <p className="text-sm text-slate-500">Nothing booked.</p>
          )}
        </RecordSection>
      </div>
    </div>
  );
}
