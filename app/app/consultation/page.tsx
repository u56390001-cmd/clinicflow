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

  // The waiting list and this user's doctor record are independent reads, so
  // they run together — each round trip to Supabase costs ~250ms from here,
  // and the old sequential chain paid for it six times over. The list comes
  // back unscoped and is filtered on the raw `doctor_id` column below, which
  // is exactly what `eq("doctor_id", …)` did server-side.
  const [doctor, unscopedWaitingList] = await Promise.all([
    findDoctorForUser(supabase, access.clinic.id),
    fetchDoctorWaitingList(supabase, access.clinic.id, null),
  ]);
  const waitingList = doctor
    ? unscopedWaitingList.filter((e) => e.doctor_id === doctor.id)
    : unscopedWaitingList;

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
    // Templates key off the doctor id and vitals config off the visit's own
    // `doctor_id` column — both already known from the waiting list — so all
    // three reads go out in one round instead of chaining three.
    [consultationData, templates, vitalsConfigs] = await Promise.all([
      fetchConsultationData(supabase, access.clinic.id, activeVisit.id),
      doctor
        ? fetchPrescriptionTemplates(supabase, access.clinic.id, doctor.id)
        : Promise.resolve([]),
      activeVisit.doctor_id
        ? fetchVitalsConfigs(supabase, access.clinic.id, [activeVisit.doctor_id])
        : Promise.resolve(undefined),
    ]);
    // Same guard the sequential chain had: the config is only meaningful once
    // the consultation payload resolved its doctor row.
    if (!consultationData?.doctor) vitalsConfigs = undefined;
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
