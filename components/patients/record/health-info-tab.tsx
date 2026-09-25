import { HeartPulse, TriangleAlert } from "lucide-react";

import {
  RecordFact,
  RecordSection,
} from "@/components/patients/record/record-primitives";
import { ageFromDob, formatNaiveDate } from "@/lib/utils/datetime";
import type { PatientDirectoryRow } from "@/types/database";

const GENDER_LABELS: Record<"male" | "female" | "other", string> = {
  male: "Male",
  female: "Female",
  other: "Other",
};

const NOTIFICATION_LABELS: Record<string, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  sms: "SMS",
  none: "No reminders",
};

/**
 * Health Info — everything on file about the person, as opposed to a specific
 * visit. Demographics, contact, and the two clinical fields that matter before
 * anyone prescribes anything: allergies and current conditions.
 *
 * Allergies get their own warning-coloured block rather than sitting in the
 * grid. They are the one field where a missed glance has consequences.
 */
export function HealthInfoTab({ patient }: { patient: PatientDirectoryRow }) {
  const derivedAge = ageFromDob(patient.date_of_birth) ?? patient.age;
  const allergies = patient.known_allergies?.trim();
  const conditions = patient.medical_conditions?.trim();

  return (
    <div className="space-y-4">
      <div
        className={
          allergies
            ? "flex gap-3 rounded-card border border-status-warning/30 bg-status-warning/5 p-4"
            : "flex gap-3 rounded-card border border-text-muted/20 bg-app p-4"
        }
      >
        <TriangleAlert
          aria-hidden="true"
          className={
            allergies
              ? "mt-0.5 size-4 shrink-0 text-status-warning"
              : "mt-0.5 size-4 shrink-0 text-text-muted"
          }
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-secondary">Known allergies</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-text-primary">
            {allergies || "None recorded. Confirm with the patient before prescribing."}
          </p>
        </div>
      </div>

      <RecordSection title="Demographics">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <RecordFact label="Patient ID">
            {patient.patient_code ? (
              <span className="font-mono text-xs">{patient.patient_code}</span>
            ) : null}
          </RecordFact>
          <RecordFact label="Gender">
            {patient.gender ? GENDER_LABELS[patient.gender] : null}
          </RecordFact>
          <RecordFact label="Age">
            {derivedAge !== null ? `${derivedAge} yrs` : null}
          </RecordFact>
          <RecordFact label="Date of birth">
            {formatNaiveDate(patient.date_of_birth) || null}
          </RecordFact>
          <RecordFact label="Blood group">{patient.blood_group}</RecordFact>
          <RecordFact label="City">{patient.city}</RecordFact>
        </dl>
      </RecordSection>

      <RecordSection title="Contact">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <RecordFact label="Phone">{patient.phone}</RecordFact>
          <RecordFact label="WhatsApp">{patient.whatsapp_number}</RecordFact>
          <RecordFact label="Email">
            {patient.email ? (
              <span className="break-all">{patient.email}</span>
            ) : null}
          </RecordFact>
          <RecordFact label="Reminders via">
            {NOTIFICATION_LABELS[patient.notification_preference] ??
              patient.notification_preference}
          </RecordFact>
          <RecordFact label="Registered branch">
            {patient.registered_branch}
          </RecordFact>
          <RecordFact label="Registered on">
            {formatNaiveDate(patient.created_at.slice(0, 10)) || null}
          </RecordFact>
        </dl>
      </RecordSection>

      <RecordSection
        title="Medical conditions"
        meta={
          <HeartPulse aria-hidden="true" className="size-4 text-text-muted" />
        }
      >
        <p className="whitespace-pre-wrap text-sm text-text-primary">
          {conditions || (
            <span className="text-text-muted">
              No ongoing conditions recorded.
            </span>
          )}
        </p>
      </RecordSection>

      {patient.notes?.trim() && (
        <RecordSection title="Reception notes">
          <p className="whitespace-pre-wrap text-sm text-text-primary">
            {patient.notes}
          </p>
        </RecordSection>
      )}
    </div>
  );
}
