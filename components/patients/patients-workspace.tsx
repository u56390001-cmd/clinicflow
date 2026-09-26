"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { UserRound } from "lucide-react";

import { PatientFormModal } from "@/components/patients/patient-form-modal";
import { MergePatientModal } from "@/components/patients/merge-patient-modal";
import {
  PatientListPane,
  type PatientDirectoryStats,
} from "@/components/patients/patient-list-pane";
import {
  PatientRecordPaneActionsContext,
  type PatientRecordPaneActions,
} from "@/components/patients/patient-record-pane";
import { WritePrescriptionOverlay } from "@/components/consultation/write-prescription-overlay";
import {
  type PatientDirectoryParams,
  type PatientTodayQueue,
} from "@/lib/patient-directory";
import { usePersistedBoolean } from "@/hooks/use-persisted-boolean";
import { cn } from "@/lib/utils";
import type { Patient, PatientDirectoryRow } from "@/types/database";

/**
 * Master-detail shell for the patients EMR workspace.
 *
 * From `lg` up it is a two-column grid: the queue at a fixed working width
 * (300px, 344px from `xl`, or 76px when collapsed) and the record taking
 * whatever is left. Below `lg` there is only room for one, so the pane the user
 * is *not* looking at is hidden — list when nothing is selected, record when
 * something is.
 *
 * Both panes are sticky and scroll themselves rather than riding the page. That
 * is what lets the record's own header pin in place without the rest of the
 * layout sliding out from under it.
 */
export function PatientsWorkspace({
  patients,
  total,
  stats,
  todayQueue,
  params,
  selectedPatient,
  recordPane,
  canManage,
  canMerge,
  timezone,
  clinic,
}: {
  patients: PatientDirectoryRow[];
  total: number;
  stats: PatientDirectoryStats;
  /** Today's token + status per patient id, for the queue list and token rail. */
  todayQueue: PatientTodayQueue;
  params: PatientDirectoryParams;
  /** `null` when `?id=` is absent, or points at a record this clinic cannot see. */
  selectedPatient: PatientDirectoryRow | null;
  /** The streamed record pane, or `null` when no record is open. */
  recordPane: ReactNode;
  canManage: boolean;
  /** Owner/admin (`canWriteClinic`) — gates the banner's Merge Duplicate control. */
  canMerge: boolean;
  timezone: string;
  /** The signed-in clinic — carried from the server page for the prescription overlay. */
  clinic: { id: string; name: string; address: string | null; phone: string | null };
}) {
  // `null` = closed. `{ patient: null }` = blank add form.
  const [form, setForm] = useState<{ patient: Patient | null } | null>(null);
  const openAddPatient = useCallback(() => setForm({ patient: null }), []);
  const openEditPatient = useCallback(
    (patient: Patient) => setForm({ patient }),
    [],
  );
  const closeForm = useCallback(() => setForm(null), []);

  // Full-screen Write Prescription overlay. `null` = closed.
  const [rxVisit, setRxVisit] = useState<{ visitId: string } | null>(null);
  const openWritePrescription = useCallback(
    (visitId: string) => setRxVisit({ visitId }),
    [],
  );
  const closeWritePrescription = useCallback(() => setRxVisit(null), []);

  // Merge-duplicate overlay; the open record is always the primary.
  const [mergeOpen, setMergeOpen] = useState(false);
  const openMergeDuplicate = useCallback(() => setMergeOpen(true), []);
  const closeMergeDuplicate = useCallback(() => setMergeOpen(false), []);

  const hasSelection = selectedPatient !== null;

  // The record pane is rendered by the server and streamed in behind a Suspense
  // boundary, so its two callbacks travel through context rather than props — a
  // server component cannot be handed a function.
  const recordPaneActions = useMemo<PatientRecordPaneActions>(
    () =>
      selectedPatient
        ? {
            onEdit: () => openEditPatient(selectedPatient),
            onWritePrescription: openWritePrescription,
            onMergeDuplicate: openMergeDuplicate,
            canMerge,
          }
        : {
            onEdit: () => {},
            onWritePrescription: () => {},
            onMergeDuplicate: () => {},
            canMerge: false,
          },
    [
      selectedPatient,
      openEditPatient,
      openWritePrescription,
      openMergeDuplicate,
      canMerge,
    ],
  );

  // The queue is the second thing to make room, after the nav rail: collapse it
  // and the record gets ~300px back. Remembered, because a doctor who works
  // with it collapsed will want it collapsed tomorrow too.
  const [queueCollapsed, setQueueCollapsed] = usePersistedBoolean(
    "medbook-patients-queue-collapsed",
    false,
  );
  const toggleQueue = useCallback(
    () => setQueueCollapsed((value) => !value),
    [setQueueCollapsed],
  );

  /**
   * Both panes become their own scroll region from `lg` up — sticky, capped to
   * the viewport below the app header. That is what lets the patient header pin
   * *inside* the record without the page scrolling out from under it. Below `lg`
   * only one pane is on screen and the page scrolls normally, which is what the
   * fixed header there anchors to.
   */
  const paneFrame =
    "lg:sticky lg:top-[calc(var(--app-header-h)_+_1rem)] lg:max-h-[calc(100svh_-_var(--app-header-h)_-_2rem)] lg:overflow-y-auto";

  return (
    <PatientRecordPaneActionsContext.Provider value={recordPaneActions}>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start">
        <div
          className={cn(
            "min-w-0",
            paneFrame,
            hasSelection && "hidden lg:block",
            queueCollapsed ? "lg:w-[76px]" : "lg:w-[300px] xl:w-[344px]",
          )}
        >
          <PatientListPane
            patients={patients}
            total={total}
            stats={stats}
            params={params}
            selectedPatientId={selectedPatient?.id ?? null}
            canManage={canManage}
            timezone={timezone}
            todayQueue={todayQueue}
            collapsed={queueCollapsed}
            onToggleCollapsed={toggleQueue}
            onAddPatient={openAddPatient}
          />
        </div>

        <div
          className={cn(
            "min-w-0",
            !hasSelection && "hidden lg:block",
            hasSelection &&
              cn(
                "flex flex-col rounded-card border border-text-muted/15 bg-surface",
                paneFrame,
              ),
          )}
        >
          {recordPane ?? (
            <NoSelection
              notFound={params.selectedId !== ""}
              searchTerm={params.selectedId}
            />
          )}
        </div>
      </div>

      {form && <PatientFormModal patient={form.patient} onClose={closeForm} />}

      {mergeOpen && selectedPatient && (
        <MergePatientModal primary={selectedPatient} onClose={closeMergeDuplicate} />
      )}

      {rxVisit && selectedPatient && (
        <WritePrescriptionOverlay
          visitId={rxVisit.visitId}
          patientId={selectedPatient.id}
          clinic={clinic}
          timezone={timezone}
          onClose={closeWritePrescription}
        />
      )}
    </PatientRecordPaneActionsContext.Provider>
  );
}

/**
 * Detail-pane placeholder. Nothing is auto-selected on load: opening a medical
 * record should be a deliberate act, not a side effect of visiting the page.
 */
function NoSelection({
  notFound,
  searchTerm,
}: {
  notFound: boolean;
  searchTerm: string;
}) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-card border border-dashed border-text-muted/30 bg-surface px-6 py-16 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-pill bg-app">
        <UserRound aria-hidden="true" className="size-7 text-text-muted" />
      </div>
      <p className="text-base font-medium text-text-primary">
        {notFound ? "Record not found" : "Select a patient"}
      </p>
      <p className="mt-1 max-w-sm text-sm text-text-secondary">
        {notFound
          ? `No patient matching “${searchTerm}” in this clinic. It may have been deleted, or the link belongs to another clinic.`
          : "Pick someone from the list to open their medical record, visit history and billing."}
      </p>
    </div>
  );
}
