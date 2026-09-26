"use client";

import { createContext, useContext } from "react";

import { PatientRecord } from "@/components/patients/patient-record";
import type { ActiveVisitInfo } from "@/components/patients/record/record-banner";
import type { PrescriptionTabBundle } from "@/components/patients/record/prescription-tab";
import type { AppointmentView } from "@/lib/appointments-view";
import type { PatientDirectoryParams } from "@/lib/patient-directory";
import type { PatientDocumentView } from "@/lib/patient-documents-queries";
import type { PatientRecordData } from "@/lib/patient-record";
import type { PatientDirectoryRow } from "@/types/database";

export type PatientRecordPaneActions = {
  onEdit: () => void;
  onWritePrescription: (visitId: string) => void;
  /** Opens the merge-duplicate modal for the open record. */
  onMergeDuplicate: () => void;
  /**
   * Whether this member may merge duplicate records (`canMergePatients`) — the
   * same predicate the server action and the 0041 RPC enforce, so the merge
   * control never renders for a role whose action would fail closed.
   */
  canMerge: boolean;
};

const NO_ACTIONS: PatientRecordPaneActions = {
  onEdit: () => {},
  onWritePrescription: () => {},
  onMergeDuplicate: () => {},
  canMerge: false,
};

export const PatientRecordPaneActionsContext =
  createContext<PatientRecordPaneActions>(NO_ACTIONS);

export function PatientRecordPane({
  patient,
  record,
  documents,
  params,
  upcoming,
  past,
  timezone,
  canManage,
  aiSummaryEnabled,
  activeVisitInfo,
  backHref,
  clinic,
}: {
  patient: PatientDirectoryRow;
  record: PatientRecordData;
  documents: PatientDocumentView[];
  params: PatientDirectoryParams;
  upcoming: AppointmentView[];
  past: AppointmentView[];
  timezone: string;
  canManage: boolean;
  aiSummaryEnabled: boolean;
  activeVisitInfo: {
    activeVisit: ActiveVisitInfo | null;
    canStart: boolean;
    rxBundle: PrescriptionTabBundle | null;
  };
  backHref: string;
  /** Clinic branding the Prescription tab prints onto the Rx sheet. */
  clinic: { name: string; address: string | null; phone: string | null };
}) {
  const actions = useContext(PatientRecordPaneActionsContext);

  return (
    <PatientRecord
      key={patient.id}
      patient={patient}
      record={record}
      documents={documents}
      params={params}
      upcoming={upcoming}
      past={past}
      timezone={timezone}
      canManage={canManage}
      aiSummaryEnabled={aiSummaryEnabled}
      activeVisitInfo={activeVisitInfo}
      backHref={backHref}
      clinic={clinic}
      canMerge={actions.canMerge}
      onMergeDuplicate={actions.onMergeDuplicate}
      onEdit={actions.onEdit}
      onWritePrescription={actions.onWritePrescription}
    />
  );
}
