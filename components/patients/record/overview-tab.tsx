"use client";

import { CalendarClock, Plus } from "lucide-react";

import { AiSummaryCard } from "@/components/patients/record/ai-summary-card";
import { Badge } from "@/components/ui/badge";
import { APPOINTMENT_STATUS_META } from "@/lib/constants";
import { formatClinicLocalRange, utcIsoToClinicLocalInput } from "@/lib/time";
import { cn } from "@/lib/utils";
import { formatNaiveDate } from "@/lib/utils/datetime";
import { formatBloodPressure } from "@/lib/patient-record";
import type { PatientRecordData } from "@/lib/patient-record";
import type { AppointmentView } from "@/lib/appointments-view";
import type { PatientDirectoryRow } from "@/types/database";

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
  aiSummaryEnabled: boolean;
}) {
  const latestVitals = record.vitals[0] ?? null;
  const next = upcoming[0] ?? null;
  const nextStatus = next ? APPOINTMENT_STATUS_META[next.status] : null;

  const getVitalStatus = (value: number | null, normal: boolean): { text: string; className: string } => {
    if (value === null) {
      return { text: "N/A", className: "text-slate-400" };
    }
    if (normal) {
      return { text: "Normal", className: "text-emerald-600 font-semibold" };
    }
    return { text: "High", className: "text-red-600 font-semibold" };
  };

  const getSpO2Status = (value: number | null): { text: string; className: string } => {
    if (value === null) {
      return { text: "N/A", className: "text-slate-400" };
    }
    if (value >= 95) {
      return { text: "Normal", className: "text-emerald-600 font-semibold" };
    }
    return { text: "Borderline", className: "text-amber-600 font-semibold" };
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
        <div className="space-y-4">
          <div className="rounded-xl bg-white border border-slate-200/80 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Vitals Summary
            </h3>
            {latestVitals ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <dt className="text-xs text-slate-500">Blood Pressure</dt>
                  <dd className="text-sm font-semibold text-slate-800">
                    {formatBloodPressure(latestVitals)}
                    <span className={cn(
                      "ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold",
                      getVitalStatus(
                        latestVitals.systolic_bp || latestVitals.blood_pressure ? (latestVitals.systolic_bp ?? 0) : 120,
                        (latestVitals.systolic_bp ?? 120) < 130 && (latestVitals.diastolic_bp ?? 80) < 85,
                      ).className,
                    )}>
                      {getVitalStatus(
                        latestVitals.systolic_bp || latestVitals.blood_pressure ? (latestVitals.systolic_bp ?? 0) : 120,
                        (latestVitals.systolic_bp ?? 120) < 130 && (latestVitals.diastolic_bp ?? 80) < 85,
                      ).text}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Pulse</dt>
                  <dd className="text-sm font-semibold text-slate-800">
                    {latestVitals.pulse || "N/A"}
                    <span className={cn(
                      "ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold",
                      getVitalStatus(latestVitals.pulse !== null, true).className,
                    )}>
                      {getVitalStatus(latestVitals.pulse !== null, true).text}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">SpO₂</dt>
                  <dd className="text-sm font-semibold text-slate-800">
                    {latestVitals.spo2 || "N/A"}
                    <span className={cn(
                      "ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold",
                      getSpO2Status(latestVitals.spo2).className,
                    )}>
                      {getSpO2Status(latestVitals.spo2).text}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Temperature</dt>
                  <dd className="text-sm font-semibold text-slate-800">
                    {latestVitals.temperature || "N/A"} °C
                    <span className={cn(
                      "ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold",
                      getVitalStatus(latestVitals.temperature !== null, true).className,
                    )}>
                      {getVitalStatus(latestVitals.temperature !== null, true).text}
                    </span>
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-slate-500">No readings recorded yet.</p>
            )}
            <button className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition-colors">
              <Plus className="size-4" />
              Log Vitals
            </button>
          </div>

          <div className="rounded-xl bg-white border border-slate-200/80 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Chronic Conditions & Allergies
            </h3>
            <div className="flex flex-wrap gap-2">
              {patient.known_allergies && (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-red-50 border border-red-200 px-3 py-1">
                  <span className="text-[10px] font-bold text-red-700">⚠️ Allergy</span>
                  <span className="text-xs text-red-600">{patient.known_allergies}</span>
                </div>
              )}
              {patient.medical_conditions && (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1">
                  <span className="text-[10px] font-bold text-amber-700">🩸 Condition</span>
                  <span className="text-xs text-amber-600">{patient.medical_conditions}</span>
                </div>
              )}
              {!patient.known_allergies && !patient.medical_conditions && (
                <span className="text-xs text-slate-400">No conditions recorded</span>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-white border border-slate-200/80 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Active Medications
            </h3>
            {patient.current_medications ? (
              <p className="text-sm text-slate-600 leading-relaxed">
                {patient.current_medications}
              </p>
            ) : (
              <p className="text-sm text-slate-400">No active medications recorded</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {patient.ai_summary && (
            <div className="rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-200/80 p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">
                AI Health Summary
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed">
                {patient.ai_summary}
              </p>
            </div>
          )}

          <div className="rounded-xl bg-white border border-slate-200/80 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Last Encounter
            </h3>
            <div className="space-y-2">
              <div>
                <dt className="text-xs text-slate-500">Diagnosis</dt>
                <dd className="text-sm font-semibold text-slate-800">
                  Acute Bronchitis
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Chief Complaint</dt>
                <dd className="text-sm text-slate-600">
                  Dry Cough x 3 days
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Attending Doctor</dt>
                <dd className="text-sm text-slate-600">
                  Dr. Sarah Johnson
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Date</dt>
                <dd className="text-sm text-slate-600">
                  September 27, 2026
                </dd>
              </div>
              <button className="w-full mt-3 inline-flex items-center justify-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition-colors">
                <span>Repeat Last Prescription</span>
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-white border border-slate-200/80 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Previous Visits
            </h3>
            <div className="space-y-3 max-h-40 overflow-y-auto">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700">Visit #3</span>
                <span className="text-slate-500">Sep 20, 2026</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700">Visit #2</span>
                <span className="text-slate-500">Aug 15, 2026</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700">Visit #1</span>
                <span className="text-slate-500">July 22, 2026</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
