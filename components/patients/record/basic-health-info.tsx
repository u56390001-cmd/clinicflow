import { Droplet, Ruler, TriangleAlert, Pill, IdCard } from "lucide-react";

import { ageFromDob } from "@/lib/utils/datetime";
import type { PatientVisitRow } from "@/lib/patient-record";
import type { PatientDirectoryRow } from "@/types/database";

/**
 * Basic Health Info — the always-visible sidebar summary. Whichever tab is open,
 * these facts stay on screen, because they are the ones you must not have to go
 * looking for: who this is, their blood group, their build, what they are
 * allergic to and what they are already taking. Ongoing conditions live in the
 * fixed header above, which is where the eye already goes.
 *
 * Allergies get the amber icon and nothing else does — it is the single field
 * that changes what you are allowed to prescribe, and colour that means one
 * thing everywhere is worth more than colour that means "important-ish".
 *
 * Height/weight come from the most recent vitals reading rather than the patient
 * row, since that is where the clinic actually measures them. Current meds are
 * derived from the latest prescription — the closest thing to a live medication
 * list the schema holds.
 */
export function BasicHealthInfo({
  patient,
  visits,
}: {
  patient: PatientDirectoryRow;
  visits: PatientVisitRow[];
}) {
  const latestVitals = visits.find((visit) => visit.vitals !== null)?.vitals ?? null;
  const latestPrescription =
    visits.find((visit) => (visit.prescription?.medicines.length ?? 0) > 0)
      ?.prescription ?? null;
  const currentMeds = latestPrescription?.medicines ?? [];
  const derivedAge = ageFromDob(patient.date_of_birth) ?? patient.age;

  const build = [
    latestVitals?.height !== null && latestVitals?.height !== undefined
      ? `${latestVitals.height} cm`
      : null,
    latestVitals?.weight !== null && latestVitals?.weight !== undefined
      ? `${latestVitals.weight} kg`
      : null,
  ].filter(Boolean);

  return (
    <section className="rounded-card border border-text-muted/15 bg-surface">
      <header className="border-b border-text-muted/15 px-4 py-3">
        <h3 className="text-[13px] font-bold text-secondary">
          Basic Health Info
        </h3>
      </header>

      <dl className="divide-y divide-text-muted/10">
        <SidebarFact icon={IdCard} label="Patient ID">
          {patient.patient_code ? (
            <span className="font-mono text-xs">{patient.patient_code}</span>
          ) : (
            <Missing>Not assigned</Missing>
          )}
        </SidebarFact>

        <SidebarFact icon={Droplet} label="Blood group">
          {patient.blood_group ?? <Missing>Not on file</Missing>}
          {derivedAge !== null && (
            <span className="text-text-muted"> · {derivedAge} yrs</span>
          )}
        </SidebarFact>

        <SidebarFact icon={Ruler} label="Height / Weight">
          {build.length > 0 ? (
            <>
              {build.join(" · ")}
              {latestVitals?.bmi !== null && latestVitals?.bmi !== undefined && (
                <span className="text-text-muted">
                  {" "}
                  · BMI {latestVitals.bmi}
                </span>
              )}
            </>
          ) : (
            <Missing>Not measured yet</Missing>
          )}
        </SidebarFact>

        <SidebarFact
          icon={TriangleAlert}
          label="Allergies"
          tone={patient.known_allergies?.trim() ? "warning" : "muted"}
        >
          {patient.known_allergies?.trim() ?? <Missing>None recorded</Missing>}
        </SidebarFact>

        <SidebarFact icon={Pill} label="Current medications">
          {currentMeds.length > 0 ? (
            <ul className="space-y-0.5">
              {currentMeds.map((medicine, index) => (
                <li key={`${medicine.name}-${index}`}>
                  {medicine.name}
                  {medicine.frequency && (
                    <span className="text-text-muted"> · {medicine.frequency}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Missing>No active prescription</Missing>
          )}
        </SidebarFact>
      </dl>
    </section>
  );
}

function SidebarFact({
  icon: Icon,
  label,
  tone = "muted",
  children,
}: {
  icon: typeof Droplet;
  label: string;
  tone?: "muted" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2.5 px-4 py-3">
      <Icon
        aria-hidden="true"
        className={
          tone === "warning"
            ? "mt-0.5 size-4 shrink-0 text-status-warning"
            : "mt-0.5 size-4 shrink-0 text-text-muted"
        }
      />
      <div className="min-w-0 flex-1">
        <dt className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
          {label}
        </dt>
        <dd className="mt-0.5 break-words text-sm text-text-primary">
          {children}
        </dd>
      </div>
    </div>
  );
}

function Missing({ children }: { children: React.ReactNode }) {
  return <span className="text-text-muted">{children}</span>;
}
