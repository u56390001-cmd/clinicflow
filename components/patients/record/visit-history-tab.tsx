"use client";

import { useState } from "react";
import {
  CalendarClock,
  ChevronDown,
  Pill,
  Stethoscope,
  Activity,
} from "lucide-react";

import {
  RecordEmpty,
  RecordFact,
  RecordNote,
} from "@/components/patients/record/record-primitives";
import { Badge } from "@/components/ui/badge";
import { VISIT_STATUS_META } from "@/lib/constants";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import { cn } from "@/lib/utils";
import { formatNaiveDate, formatNaiveTime } from "@/lib/utils/datetime";
import { formatBloodPressure, type PatientVisitRow } from "@/lib/patient-record";

/**
 * Visit History — the clinical spine of the record. One accordion row per
 * check-in, newest first, with the vitals and prescription captured that day
 * folded inside.
 *
 * The most recent visit starts open: it is what staff are almost always looking
 * for, and everything older stays one click away.
 */
export function VisitHistoryTab({
  visits,
  timezone,
}: {
  visits: PatientVisitRow[];
  timezone: string;
}) {
  const [openId, setOpenId] = useState<string | null>(visits[0]?.id ?? null);

  if (visits.length === 0) {
    return (
      <RecordEmpty
        icon={Stethoscope}
        title="No visits recorded yet"
        description="Visit history builds up as this patient is checked in at reception. Booked appointments appear under All Appointments."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {visits.map((visit) => (
        <VisitRow
          key={visit.id}
          visit={visit}
          timezone={timezone}
          open={openId === visit.id}
          onToggle={() =>
            setOpenId((current) => (current === visit.id ? null : visit.id))
          }
        />
      ))}
    </ul>
  );
}

function VisitRow({
  visit,
  timezone,
  open,
  onToggle,
}: {
  visit: PatientVisitRow;
  timezone: string;
  open: boolean;
  onToggle: () => void;
}) {
  const local = utcIsoToClinicLocalInput(visit.checked_in_at, timezone);
  const status = VISIT_STATUS_META[visit.status];
  const { prescription, vitals } = visit;
  const diagnosis =
    prescription?.custom_diagnosis?.trim() || prescription?.diagnosis?.trim() || "";

  return (
    <li className="overflow-hidden rounded-card border border-text-muted/20">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 bg-surface px-4 py-3 text-left transition-colors hover:bg-app"
      >
        <span className="flex size-9 shrink-0 flex-col items-center justify-center rounded-control bg-app text-[10px] font-medium leading-none text-text-muted">
          <span className="text-xs font-semibold text-secondary tabular-nums">
            #{visit.token_number}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-text-primary">
              {formatNaiveDate(local)}
            </span>
            <span className="text-xs text-text-muted">
              {formatNaiveTime(local)}
            </span>
            {status && (
              <Badge
                variant="outline"
                className={cn("ring-1 ring-inset", status.badge)}
              >
                {status.label}
              </Badge>
            )}
          </span>
          <span className="mt-0.5 block truncate text-xs text-text-secondary">
            {[
              visit.doctorName ? `Dr. ${visit.doctorName}` : "Doctor unassigned",
              diagnosis || null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {vitals && (
            <Activity
              aria-label="Vitals recorded"
              className="size-3.5 text-text-muted"
            />
          )}
          {prescription && (
            <Pill
              aria-label="Prescription issued"
              className="size-3.5 text-text-muted"
            />
          )}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4 text-text-muted transition-transform",
              open && "rotate-180",
            )}
          />
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-text-muted/15 bg-app px-4 py-4">
          {vitals ? (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <RecordFact label="BP (mmHg)">
                {formatBloodPressure(vitals)}
              </RecordFact>
              <RecordFact label="Temp (°F)">
                {vitals.temperature ?? null}
              </RecordFact>
              <RecordFact label="Pulse (bpm)">{vitals.pulse ?? null}</RecordFact>
              <RecordFact label="SpO₂ (%)">{vitals.spo2 ?? null}</RecordFact>
            </dl>
          ) : (
            <p className="text-sm text-text-muted">
              No vitals were recorded for this visit.
            </p>
          )}

          {prescription ? (
            <div className="space-y-3">
              <RecordNote label="Chief complaint" value={prescription.chief_complaint} />
              <RecordNote label="Findings" value={prescription.findings} />
              {diagnosis && <RecordNote label="Diagnosis" value={diagnosis} />}
              {prescription.medicines.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                    Medicines
                  </p>
                  <ul className="mt-1 space-y-1">
                    {prescription.medicines.map((medicine, index) => (
                      <li
                        key={`${medicine.name}-${index}`}
                        className="text-sm text-text-primary"
                      >
                        <span className="font-medium">{medicine.name}</span>
                        {describeMedicine(medicine) && (
                          <span className="text-text-secondary">
                            {" — "}
                            {describeMedicine(medicine)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {prescription.lab_orders.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                    Lab orders
                  </p>
                  <ul className="mt-1 space-y-1">
                    {prescription.lab_orders.map((order, index) => (
                      <li
                        key={`${order.test_name}-${index}`}
                        className="text-sm text-text-primary"
                      >
                        {order.test_name}
                        {order.notes && (
                          <span className="text-text-secondary">
                            {" — "}
                            {order.notes}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <RecordNote label="Doctor notes" value={prescription.doctor_notes} />
              {prescription.follow_up_date && (
                <p className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
                  <CalendarClock aria-hidden="true" className="size-3.5" />
                  Follow-up {formatNaiveDate(prescription.follow_up_date)}
                  {prescription.follow_up_notes
                    ? ` · ${prescription.follow_up_notes}`
                    : ""}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-muted">
              No prescription was issued for this visit.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/** "1 tab · Twice daily · 5 days · After meals" from the parts that exist. */
function describeMedicine(medicine: {
  form: string;
  unit: string;
  frequency: string;
  duration: string;
  instructions: string;
  route: string;
}): string {
  return [
    [medicine.unit, medicine.form].filter(Boolean).join(" ").trim(),
    medicine.route,
    medicine.frequency,
    medicine.duration,
    medicine.instructions,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" · ");
}
