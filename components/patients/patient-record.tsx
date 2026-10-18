"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AppointmentsTab } from "@/components/patients/record/appointments-tab";
import { DocumentsTab } from "@/components/patients/record/documents-tab";
import { HealthInfoTab } from "@/components/patients/record/health-info-tab";
import { PrescriptionsTab } from "@/components/patients/record/prescriptions-tab";
import { PrescriptionDraftProvider } from "@/components/patients/record/prescription-draft-context";
import {
  RecordBanner,
  type ActiveVisitInfo,
} from "@/components/patients/record/record-banner";
import { PatientTabNavigation } from "@/components/patients/record/patient-tab-navigation";
import { OverviewTab } from "@/components/patients/record/overview-tab";
import { VitalsTab } from "@/components/patients/record/vitals-tab";
import { DermWorkspace } from "@/components/patients/record/workspaces/derm-workspace";
import { PsychWorkspace } from "@/components/patients/record/workspaces/psych-workspace";
import { Button } from "@/components/ui/button";
import {
  patientDirectoryHref,
  type PatientDirectoryParams,
} from "@/lib/patient-directory";
import type { AppointmentView } from "@/lib/appointments-view";
import type { PatientDocumentView } from "@/lib/patient-documents-queries";
import type { PatientRecordData } from "@/lib/patient-record";
import {
  GENERAL_TAB_IDS,
  isSpecialtyTabId,
  type DermTabId,
  type GeneralTabId,
  type PatientTabId,
  type PsychTabId,
  type SpecialtyTabId,
  type WorkspaceConfig,
} from "@/lib/specialty-workspaces";
import type { ConsultationPreAnswer } from "@/lib/consultation-queries";
import type { PatientDirectoryRow } from "@/types/database";

/**
 * The patient record: a fixed identity header over a tab strip, then the
 * workspace those tabs switch between.
 *
 * Tabs are `<Link>`s driving `?tab=`, not local state. That costs a server
 * round trip on switch but buys three things local state cannot: a colleague can
 * be sent a link straight to someone's medications, the browser Back button
 * steps back through tabs, and a refresh keeps you where you were. All of the
 * record's data is fetched in one pass on the server, so the round trip
 * re-renders from cache rather than re-querying per tab.
 *
 * The header + tabs block is sticky: on `lg` and up the record is its own
 * scroll region, so it pins to the top of that region; below `lg` it pins to
 * the top of the app scroll area. The app header sits outside that area, so
 * nothing needs to offset below it.
 */

/** First token of a persisted comma list, trimmed and length-capped for a capsule. */
function firstListToken(value?: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  if (!first) return null;
  return first.length > 28 ? `${first.slice(0, 27)}…` : first;
}

export function PatientRecord({
  clinicId,
  clinic,
  patient,
  record,
  documents,
  params,
  upcoming,
  past,
  timezone,
  canManage,
  canManageClinic,
  canMerge,
  aiSummaryEnabled,
  activeVisitInfo,
  backHref,
  workspace,
  onEdit,
  onMergeDuplicate,
  preAnswers,
}: {
  /** The signed-in clinic — templates and the print header for the Rx workspace. */
  clinicId: string;
  clinic: { name: string; address: string | null; phone: string | null };
  patient: PatientDirectoryRow;
  record: PatientRecordData;
  documents: PatientDocumentView[];
  params: PatientDirectoryParams;
  upcoming: AppointmentView[];
  past: AppointmentView[];
  timezone: string;
  canManage: boolean;
  /** Owner/admin/clinic_admin — clinic-level config surfaces (machine registry). */
  canManageClinic?: boolean;
  /** Owner/admin — renders the banner's "Merge Duplicate" control. */
  canMerge: boolean;
  /** `PATIENT_AI_SUMMARY_ENABLED` on the server — gates the summary refresh control. */
  aiSummaryEnabled: boolean;
  /** Today's active visit + queue eligibility. */
  activeVisitInfo: {
    activeVisit: ActiveVisitInfo | null;
    canStart: boolean;
  };
  /** Href that clears the selection — the mobile "back to list" target. */
  backHref: string;
  /**
   * The workspace derived from the signed-in doctor's specialty (general /
   * psychology / dermatology). It owns the tab set, the default tab, the
   * write CTA, and the route the record opens when a `?tab=` is absent or
   * belongs to another workspace.
   */
  workspace: WorkspaceConfig;
  onEdit: () => void;
  /** Opens the merge-duplicate modal, primary = this record. */
  onMergeDuplicate: () => void;
  /** Pre-consultation answers for the active visit's booking, if any. */
  preAnswers: ConsultationPreAnswer[];
}) {
  const router = useRouter();

  /**
   * Which tab the record actually shows. The URL can carry any `PatientTabId`
   * (shared links, hand-edited URLs, cross-workspace bookmarks), so the active
   * workspace decides: a general id in a psychology record falls back to that
   * workspace's default rather than rendering a blank pane.
   */
  const isGeneral = workspace.kind === "general";
  const generalTab: GeneralTabId = (
    GENERAL_TAB_IDS as readonly string[]
  ).includes(params.tab)
    ? (params.tab as GeneralTabId)
    : "overview";
  const specialtyActive: SpecialtyTabId | null =
    workspace.tabs &&
    isSpecialtyTabId(params.tab) &&
    (workspace.tabs as readonly string[]).includes(params.tab)
      ? (params.tab as SpecialtyTabId)
      : null;
  const activeTab: PatientTabId = isGeneral
    ? generalTab
    : (specialtyActive ?? workspace.defaultTab);

  /**
   * Write Prescription is a tab, not a modal.
   *
   * The record already had a full consultation screen — it lived in a
   * full-screen overlay that covered the record it was launched from, and every
   * fact on screen (vitals, prescription, history) had to be re-fetched behind
   * it. The Prescriptions tab is the same workspace, embedded: no second fetch,
   * no second Escape handler, and the patient's history stays visible underneath
   * the form while it is being written.
   *
   * Each workspace owns its writing surface: General → Prescriptions, Psychology
   * → Session Notes, Dermatology → Dermatology Rx.
   */
  const openPrescriptionWorkspace = useCallback(
    () =>
      router.push(patientDirectoryHref({ ...params, tab: workspace.writeTab })),
    [router, params, workspace.writeTab],
  );

  // The workspace works on today's live visit, so it needs that visit's own
  // vitals, prescription and doctor — all of which the record read already has.
  const activeVisitId = activeVisitInfo.activeVisit?.id ?? null;
  const activeVisitRow = activeVisitId
    ? (record.visits.find((visit) => visit.id === activeVisitId) ?? null)
    : null;

  return (
    // The provider wraps the whole record (not just the tab) so a half-typed
    // prescription survives `?tab=` navigation: the tab unmounts, the draft
    // mounted here does not. `key`ed above by patient, so switching records
    // starts a fresh draft.
    <PrescriptionDraftProvider>
      <div className="min-w-0">
        {/* The list is already on screen from `lg` up, so this only earns its
          keep on mobile, where the record replaces it. */}
        <div className="px-2 pt-2 lg:hidden">
          <Button asChild variant="ghost" size="sm">
            <Link href={backHref} scroll={false}>
              <ArrowLeft aria-hidden="true" />
              Back to patients
            </Link>
          </Button>
        </div>

        <div className="sticky top-0 z-20 bg-surface">
          <RecordBanner
            patient={patient}
            canManage={canManage}
            canMerge={canMerge}
            activeVisit={activeVisitInfo.activeVisit}
            canStart={activeVisitInfo.canStart}
            onEdit={onEdit}
            onMergeDuplicate={onMergeDuplicate}
            onWritePrescription={openPrescriptionWorkspace}
            writePrescriptionLabel={workspace.writeTabLabel}
            onCompleteAndNext={(nextPatientId) =>
              router.push(
                patientDirectoryHref({ ...params, selectedId: nextPatientId }),
              )
            }
            psychContext={
              workspace.kind === "psychology"
                ? {
                    riskLevel: record.psych.safety?.risk_level ?? null,
                    concern: firstListToken(
                      record.psych.safety?.current_concerns,
                    ),
                    diagnosis: firstListToken(
                      record.psych.intake?.previous_diagnosis,
                    ),
                    lastSession: record.psych.sessions[0]?.session_date ?? null,
                  }
                : null
            }
          />

          <PatientTabNavigation
            workspace={workspace}
            params={params}
            activeTab={activeTab}
          />
        </div>

        {/* There is no left rail here, and that is deliberate. A 272px sidebar
            used to sit beside the work area repeating Patient ID, blood group,
            age, height/weight, BMI, allergies, current medications, the last
            three visits and a document uploader — every one of which the banner
            above or the tab content already shows, so the same facts had to be
            read twice and kept in sync in two files.

            Now the record is one column: the banner owns identity, each tab owns
            its own subject, and the tab body sits on the slate canvas so the
            white cards read as cards. Documents and their uploader live in the
            Documents tab only. */}
        <div className="min-w-0 bg-canvas px-4 py-4 sm:px-5 lg:px-6">
          <div>
            {isGeneral ? (
              <>
                {generalTab === "overview" && (
                  <OverviewTab
                    patient={patient}
                    record={record}
                    timezone={timezone}
                    canManage={canManage}
                    aiSummaryEnabled={aiSummaryEnabled}
                    vitalsTabHref={patientDirectoryHref({
                      ...params,
                      tab: "vitals",
                    })}
                    medicationsTabHref={patientDirectoryHref({
                      ...params,
                      tab: "medications",
                    })}
                  />
                )}

                {generalTab === "health_info" && (
                  <HealthInfoTab
                    patient={patient}
                    medicalHistory={record.medicalHistory}
                    canManage={canManage}
                  />
                )}

                {generalTab === "vitals" && (
                  <VitalsTab
                    vitals={record.vitals}
                    timezone={timezone}
                    canManage={canManage}
                    latestVisitId={record.visits[0]?.id ?? null}
                  />
                )}

                {generalTab === "medications" && (
                  <PrescriptionsTab
                    clinicId={clinicId}
                    clinic={clinic}
                    patient={patient}
                    prescriptions={record.prescriptions}
                    medications={record.medications}
                    documents={documents}
                    labResults={record.labResults}
                    timezone={timezone}
                    canManage={canManage}
                    params={params}
                    activeVisit={activeVisitInfo.activeVisit}
                    visitVitals={activeVisitRow?.vitals ?? null}
                    visitPrescription={activeVisitRow?.prescription ?? null}
                    visitDoctor={
                      activeVisitRow
                        ? {
                            id: activeVisitRow.doctor_id,
                            name: activeVisitRow.doctorName,
                            specialty: activeVisitRow.doctorSpecialty,
                          }
                        : null
                    }
                    preAnswers={preAnswers}
                  />
                )}

                {generalTab === "appointments" && (
                  <AppointmentsTab
                    upcoming={upcoming}
                    past={past}
                    timezone={timezone}
                    canManage={canManage}
                  />
                )}

                {generalTab === "documents" && (
                  <DocumentsTab
                    patientId={patient.id}
                    documents={documents}
                    timezone={timezone}
                    canManage={canManage}
                  />
                )}
              </>
            ) : workspace.kind === "psychology" ? (
              <PsychWorkspace
                patient={patient}
                psych={record.psych}
                documents={documents}
                activeTab={activeTab as PsychTabId}
                canManage={canManage}
                timezone={timezone}
                aiSummaryEnabled={aiSummaryEnabled}
                assessmentsHref={patientDirectoryHref({
                  ...params,
                  tab: "psy_psychometrics",
                })}
                documentsHref={patientDirectoryHref({
                  ...params,
                  tab: "psy_documents",
                })}
              />
            ) : (
              <DermWorkspace
                patient={patient}
                derm={record.derm}
                documents={documents}
                activeTab={activeTab as DermTabId}
                canManage={canManage}
                canManageClinic={canManageClinic}
                params={params}
                timezone={timezone}
              />
            )}
          </div>
        </div>
      </div>
    </PrescriptionDraftProvider>
  );
}
