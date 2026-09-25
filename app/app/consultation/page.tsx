import type { Metadata } from "next";

import { ClinicEmptyState } from "@/components/app/clinic-empty-state";
import { DoctorWaitingList } from "@/components/consultation/doctor-waiting-list";
import { ConsultationView } from "@/components/consultation/consultation-view";
import { getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import { APP_ROUTES } from "@/lib/constants";
import {
  fetchDoctorWaitingList,
  fetchConsultationData,
  fetchPrescriptionTemplates,
  findDoctorForUser,
} from "@/lib/consultation-queries";
import {
  fetchVitalsConfigs,
  type DoctorVitalsConfigMap,
} from "@/lib/vitals-config";

export const metadata: Metadata = { title: "Consultation" };

export default async function ConsultationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  const params = await searchParams;
  const deepVisitId =
    typeof params.visit === "string" && params.visit ? params.visit : null;
  const backPatientId =
    typeof params.pid === "string" && params.pid ? params.pid : null;

  if (!access) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-secondary">
            Consultation
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage patient consultations and prescriptions.
          </p>
        </div>
        <ClinicEmptyState />
      </div>
    );
  }

  // find the logged-in user's doctor record
  const doctor = await findDoctorForUser(supabase, access.clinic.id);

  // fetch the waiting list (scoped to this doctor if multi-doctor)
  const waitingList = await fetchDoctorWaitingList(
    supabase,
    access.clinic.id,
    doctor?.id ?? null,
  );

  // When deep-linked with `?visit=`, open the Write Prescription screen for
  // that specific visit (e.g. from a patient record) instead of the waiting
  // list. Back returns to the patient's split-pane.
  const deepVisit = deepVisitId ? waitingList.find((e) => e.id === deepVisitId) : null;

  // find the active in_consultation visit
  const activeVisit = deepVisit ?? waitingList.find((e) => e.status === "in_consultation");

  // if there's an active consultation, fetch full consultation data
  let consultationData = null;
  let templates: Awaited<ReturnType<typeof fetchPrescriptionTemplates>> = [];
  let vitalsConfigs: DoctorVitalsConfigMap | undefined;

  if (activeVisit) {
    consultationData = await fetchConsultationData(
      supabase,
      access.clinic.id,
      activeVisit.id,
    );
    if (doctor) {
      templates = await fetchPrescriptionTemplates(
        supabase,
        access.clinic.id,
        doctor.id,
      );
    }
    if (consultationData?.doctor) {
      vitalsConfigs = await fetchVitalsConfigs(supabase, access.clinic.id, [
        consultationData.doctor.id,
      ]);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-secondary">
          Consultation
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {access.clinic.name}
          {doctor ? ` · Dr. ${doctor.name}` : ""}
        </p>
      </div>

      {consultationData ? (
        <ConsultationView
          data={consultationData}
          templates={templates}
          timezone={access.clinic.timezone}
          clinic={{
            name: access.clinic.name,
            address: access.clinic.address,
            phone: access.clinic.phone,
          }}
          backHref={
            params.from === "patients"
              ? `${APP_ROUTES.app.patients}?id=${backPatientId ?? ""}`
              : undefined
          }
          allowAdvance={!deepVisit}
          vitalsConfigs={vitalsConfigs}
        />
      ) : (
        <DoctorWaitingList
          entries={waitingList}
          activeVisitId={null}
        />
      )}
    </div>
  );
}
