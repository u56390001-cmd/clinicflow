"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  Droplet,
  HeartPulse,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Thermometer,
  Wind,
} from "lucide-react";

import { AiSummaryCard } from "@/components/patients/record/ai-summary-card";
import {
  ActiveMedicationsCard,
  type ActiveMedication,
} from "@/components/patients/record/active-medications-card";
import {
  ScannedAlertsCard,
  type ScannedAlert,
} from "@/components/patients/record/scanned-alerts-card";
import { RecordSection } from "@/components/patients/record/record-primitives";
import {
  VitalCard,
  type VitalReading,
} from "@/components/patients/record/vital-card";
import { Button } from "@/components/ui/button";
import {
  calculateBMI,
  formatBloodPressure,
  type PatientRecordData,
} from "@/lib/patient-record";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import { cn } from "@/lib/utils";
import { formatNaiveDate } from "@/lib/utils/datetime";
import {
  bloodSugarTag,
  bpTag,
  pulseTag,
  spo2Tag,
  tempTag,
} from "@/lib/vitals-status";
import type { PatientDirectoryRow } from "@/types/database";

/**
 * One key-value row in the Basic information card. Label sits in a fixed left
 * column, value fills the rest and is left-aligned. Renders a muted dash when
 * nothing is on file — the same empty voice as `RecordFact`.
 */
function FactRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode | null;
}) {
  const empty =
    value === null || value === undefined || value === "";
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2.5 last:border-0">
      <dt className="w-36 flex-shrink-0 text-sm font-medium text-slate-500">
        {label}
      </dt>
      <dd
        className={cn(
          "flex-1 text-left text-sm font-medium",
          empty ? "text-slate-400" : "text-slate-900",
        )}
      >
        {empty ? "—" : value}
      </dd>
    </div>
  );
}

/**
 * Overview — the record's landing tab, in two columns and four cards.
 *
 * The left rail is the patient's standing baseline: what can hurt you if you
 * miss it (allergies and conditions), what they are built like (blood group,
 * height, weight, BMI) and what they are already taking. The right column is
 * this visit: the AI's read of the record, then the readings the receptionist
 * took at the door.
 *
 * What is deliberately absent is as much of the design as what is present. There
 * is no encounter feed, no next-appointment card and no visit timeline here —
 * each of those has a tab that owns it, and a second copy here was the thing
 * this tab was previously cluttered with. Every value shown is real data the
 * server already fetched; a section with nothing on file says so rather than
 * inventing an example.
 */
export function OverviewTab({
  patient,
  record,
  timezone,
  canManage,
  aiSummaryEnabled,
  vitalsTabHref,
  medicationsTabHref,
}: {
  patient: PatientDirectoryRow;
  record: PatientRecordData;
  timezone: string;
  canManage: boolean;
  /** `PATIENT_AI_SUMMARY_ENABLED` resolved on the server. */
  aiSummaryEnabled: boolean;
  vitalsTabHref: string;
  medicationsTabHref: string;
}) {
  const latestVitals = record.vitals[0] ?? null;

  const allergies = splitEntries(patient.known_allergies);
  const conditions = splitEntries(patient.medical_conditions);

  const bmi = calculateBMI(patient.height, patient.weight);
  const height = patient.height ? `${patient.height} cm` : null;
  const weight = patient.weight ? `${patient.weight} kg` : null;

  // "Active" medications come from the most recent prescription, which is real
  // clinical data. `prescriptions` carries no active/discontinued column, so
  // "most recent" is the closest honest reading of "currently prescribed" —
  // and a clinic that only ever records registration-time free text still has
  // something to show, so that is the fallback rather than an empty card.
  // Strength maps onto the medicine's `unit`; there is no stronger field in the
  // schema, and new entries routinely carry the dose inside the name itself.
  const latestPrescription = record.prescriptions[0] ?? null;
  const prescriptionMeds: ActiveMedication[] = (
    latestPrescription?.medicines ?? []
  )
    .filter((medicine) => medicine.name.trim().length > 0)
    .map((medicine, index) => ({
      id: `${latestPrescription.id}-${index}`,
      name: medicine.name.trim(),
      strength: medicine.unit.trim() || null,
      frequency: medicine.frequency.trim() || null,
      source: "prescribed" as const,
      status: "active" as const,
    }));
  const registrationMeds: ActiveMedication[] = splitEntries(
    patient.current_medications,
  ).map((name, index) => ({
    id: `registration-${index}`,
    name,
    strength: null,
    frequency: null,
    source: "registration" as const,
    status: "active" as const,
  }));

  // Medicines extracted from scanned documents (AI OCR, migration 0050). They
  // land `active_pending` so the card can flag them for doctor review; approved
  // rows carry `active` and join the list with an "AI OCR" source badge.
  const scannedMedications: ActiveMedication[] = record.medications
    .filter((medication) => medication.source === "ai_ocr")
    .map((medication) => ({
      id: medication.id,
      name: medication.medicine_name,
      strength: medication.strength,
      frequency: medication.frequency,
      source: "ai_ocr" as const,
      status: medication.status,
      reportName: medication.report_name,
      reportDate: medication.report_date,
    }));

  const medications: ActiveMedication[] =
    prescriptionMeds.length > 0
      ? [...prescriptionMeds, ...scannedMedications]
      : [...registrationMeds, ...scannedMedications];

  // Allergies / known conditions the AI read off a scan (migration 0051). Only
  // the pending ones are shown, above the active list, and approving one merges
  // it into the Critical Safety Alerts block below.
  const pendingScannedAlerts: ScannedAlert[] = record.alerts
    .filter((alert) => alert.status === "active_pending")
    .map((alert) => ({
      id: alert.id,
      type: alert.alert_type,
      text: alert.text,
      reportName: alert.report_name,
      reportDate: alert.report_date,
    }));

  const readings: VitalReading[] = [
    {
      key: "blood-pressure",
      label: "Blood pressure",
      icon: Activity,
      value: latestVitals ? formatBloodPressure(latestVitals) : null,
      unit: "mmHg",
      tag: latestVitals ? bpTag(latestVitals) : null,
    },
    {
      key: "temperature",
      label: "Temperature",
      icon: Thermometer,
      value:
        latestVitals?.temperature != null
          ? String(latestVitals.temperature)
          : null,
      unit: "°F",
      tag: tempTag(latestVitals?.temperature ?? null),
    },
    {
      key: "pulse",
      label: "Pulse",
      icon: HeartPulse,
      value: latestVitals?.pulse != null ? String(latestVitals.pulse) : null,
      unit: "bpm",
      tag: pulseTag(latestVitals?.pulse ?? null),
    },
    {
      key: "spo2",
      label: "SpO₂",
      icon: Wind,
      value: latestVitals?.spo2 != null ? String(latestVitals.spo2) : null,
      unit: "%",
      tag: spo2Tag(latestVitals?.spo2 ?? null),
    },
    {
      key: "blood-sugar",
      label: "Blood sugar",
      icon: Droplet,
      value:
        latestVitals?.blood_sugar != null
          ? String(latestVitals.blood_sugar)
          : null,
      unit: "mg/dL",
      tag: bloodSugarTag(latestVitals?.blood_sugar ?? null),
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,13fr)] lg:items-start">
      {/* The patient's standing baseline. Identity — name, UHID, age, gender,
          phone — is not repeated here; the banner above owns it. */}
      <div className="flex flex-col gap-4">
        <RecordSection title="Basic information">
          <div className="flex flex-col gap-4">
            {/* Allergies and conditions are the one block on a patient record
              that can change what happens in the next five minutes, so they sit
              at the top of the card, above the numbers, in the loudest treatment
              the tab has. The empty state is explicit: a blank space reads as
              "not yet asked", and "none recorded" reads as "asked, nothing
              found". */}
            {allergies.length > 0 || conditions.length > 0 ? (
              <div className="rounded-xl border border-red-200/60 bg-red-50/40 p-3">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red-700">
                  <ShieldAlert
                    aria-hidden="true"
                    className="size-4 text-red-600"
                    strokeWidth={2.25}
                  />
                  Critical Safety Alerts
                </p>
                <dl className="mt-2">
                  {allergies.length > 0 && (
                    <div
                      className={cn(
                        "flex items-start gap-x-3 py-1.5",
                        conditions.length > 0 && "border-b border-red-100/60",
                      )}
                    >
                      <dt className="w-24 flex-shrink-0 pt-[3px] text-xs font-semibold text-slate-600">
                        Allergies
                      </dt>
                      <dd className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                        {allergies.map((entry) => (
                          <span
                            key={`allergy-${entry}`}
                            className="rounded-md bg-rose-100/80 px-1.5 py-[3px] text-[11px] font-semibold leading-tight text-rose-900 ring-1 ring-inset ring-rose-200/50"
                          >
                            {entry}
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                  {conditions.length > 0 && (
                    <div className="flex items-start gap-x-3 py-1.5">
                      <dt className="w-24 flex-shrink-0 pt-[3px] text-xs font-semibold text-slate-600">
                        Known Case
                      </dt>
                      <dd className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                        {conditions.map((entry) => (
                          <span
                            key={`condition-${entry}`}
                            className="rounded-md bg-amber-100/70 px-1.5 py-[3px] text-[11px] font-semibold leading-tight text-amber-900 ring-1 ring-inset ring-amber-200/60"
                          >
                            {entry}
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            ) : (
              <p className="flex items-center gap-1.5 rounded-control border border-hairline bg-chip px-3.5 py-2.5 text-xs text-text-secondary">
                <ShieldCheck
                  aria-hidden="true"
                  className="size-4 text-status-success"
                  strokeWidth={2}
                />
                No known allergies or medical conditions on file
              </p>
            )}

            <dl>
              <FactRow label="Blood group" value={patient.blood_group || null} />
              <FactRow
                label="BMI"
                value={
                  bmi.bmi !== null
                    ? `${bmi.bmi} · ${bmi.category}`
                    : height || weight
                      ? "Needs height & weight"
                      : null
                }
              />
              <FactRow
                label="Height / weight"
                value={
                  height || weight
                    ? [height, weight].filter(Boolean).join(" · ")
                    : null
                }
              />
            </dl>
          </div>
        </RecordSection>

        {/* Allergies and conditions extracted from a scan sit right under the
            Critical Safety Alerts block they will eventually merge into. */}
        <ScannedAlertsCard
          alerts={pendingScannedAlerts}
          canManage={canManage}
        />

        {/* The card itself decides what fits on the Overview (four drugs, then a
            counter) and hands the full history to the Medications tab. */}
        <ActiveMedicationsCard
          medications={medications}
          viewAllHref={medicationsTabHref}
          canManage={canManage}
        />
      </div>

      <div className="flex flex-col gap-4">
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

        <RecordSection
          title="Today's vitals"
          meta={
            latestVitals ? (
              <span className="text-xs tabular-nums text-text-muted">
                {formatNaiveDate(
                  utcIsoToClinicLocalInput(latestVitals.recorded_at, timezone),
                )}
              </span>
            ) : null
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            {readings.map((reading) => (
              <VitalCard key={reading.key} reading={reading} />
            ))}
          </div>

          {/* Recording vitals is a form, not a popover, so this is a jump to
              the tab that owns it rather than a button that opens nothing. */}
          <Button asChild variant="outline" size="sm" className="mt-3 w-full">
            <Link href={vitalsTabHref} scroll={false}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
              Log vitals
            </Link>
          </Button>
        </RecordSection>
      </div>
    </div>
  );
}

/**
 * `known_allergies`, `medical_conditions` and `current_medications` are free
 * text a clerk typed. Comma and newline are both accepted as separators because
 * that is how each of them gets entered in practice.
 */
function splitEntries(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}
