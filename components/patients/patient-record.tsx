"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AppointmentsTab } from "@/components/patients/record/appointments-tab";
import { DocumentsTab } from "@/components/patients/record/documents-tab";
import { HealthInfoTab } from "@/components/patients/record/health-info-tab";
import { OverviewTab } from "@/components/patients/record/overview-tab";
import { PrescriptionsTab } from "@/components/patients/record/prescriptions-tab";
import { RecordContextPanel } from "@/components/patients/record/record-context-panel";
import {
  RecordBanner,
  type ActiveVisitInfo,
} from "@/components/patients/record/record-banner";
import { VisitHistoryTab } from "@/components/patients/record/visit-history-tab";
import { VitalsTab } from "@/components/patients/record/vitals-tab";
import { Button } from "@/components/ui/button";
import {
  PATIENT_TAB_LABELS,
  PATIENT_TABS,
  patientDirectoryHref,
  type PatientDirectoryParams,
  type PatientTab,
} from "@/lib/patient-directory";
import { cn } from "@/lib/utils";
import type { AppointmentView } from "@/lib/appointments-view";
import type { PatientDocumentView } from "@/lib/patient-documents-queries";
import type { PatientRecordData } from "@/lib/patient-record";
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
 * scroll region, so it pins to the top of that region; below `lg` the page
 * scrolls and it pins under the app header instead. Same block, two anchors —
 * `--app-header-h` is what makes the second one safe.
 */
export function PatientRecord({
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
  onEdit,
  onWritePrescription,
}: {
  patient: PatientDirectoryRow;
  record: PatientRecordData;
  documents: PatientDocumentView[];
  params: PatientDirectoryParams;
  upcoming: AppointmentView[];
  past: AppointmentView[];
  timezone: string;
  canManage: boolean;
  /** `PATIENT_AI_SUMMARY_ENABLED` on the server — gates the summary refresh control. */
  aiSummaryEnabled: boolean;
  /** Today's active visit + queue eligibility for this patient. */
  activeVisitInfo: { activeVisit: ActiveVisitInfo | null; canStart: boolean };
  /** Href that clears the selection — the mobile "back to list" target. */
  backHref: string;
  onEdit: () => void;
  /** Opens the full-screen Write Prescription overlay for a visit. */
  onWritePrescription: (visitId: string) => void;
}) {
  const counts: Record<PatientTab, number | null> = {
    overview: null,
    history: record.visits.length,
    clinical: record.vitals.length,
    medications: record.prescriptions.length,
    documents: documents.length,
    appointments: upcoming.length + past.length,
  };

  const router = useRouter();

  return (
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

      <div className="sticky top-[var(--app-header-h)] z-20 bg-surface lg:top-0">
        <RecordBanner
          patient={patient}
          canManage={canManage}
          activeVisit={activeVisitInfo.activeVisit}
          canStart={activeVisitInfo.canStart}
          onEdit={onEdit}
          onWritePrescription={onWritePrescription}
          onCompleteAndNext={(nextPatientId) =>
            router.push(
              patientDirectoryHref({ ...params, selectedId: nextPatientId }),
            )
          }
        />

        <div
          role="tablist"
          aria-label="Patient record sections"
          className="scrollbar-none flex gap-1 overflow-x-auto border-b border-text-muted/15 px-5"
        >
          {PATIENT_TABS.map((tab) => {
            const active = params.tab === tab;
            const count = counts[tab];
            return (
              <Link
                key={tab}
                href={patientDirectoryHref({ ...params, tab })}
                scroll={false}
                role="tab"
                aria-selected={active}
                className={cn(
                  "-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-[2px] px-3.5 py-2.5 text-[13px] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-inset",
                  active
                    ? "border-primary font-semibold text-primary"
                    : "border-transparent text-text-secondary hover:text-text-primary",
                )}
              >
                {PATIENT_TAB_LABELS[tab]}
                {count !== null && count > 0 && (
                  <span
                    className={cn(
                      "rounded-pill px-1.5 py-0.5 text-[10px] tabular-nums",
                      active ? "bg-primary/10 text-primary" : "bg-app text-text-muted",
                    )}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* The context panel is the chart's standing reference — who this is,
          what they react to, what they are on, what happened last time. It sits
          to the left once there is room for it (xl+); below that it follows the
          work area rather than pushing it down the screen. */}
      {/* `px-5` matches the header and tab strip above it — content that starts
          a few pixels in from the name reads as a mistake, not as a margin. */}
      <div className="grid min-w-0 gap-4 px-5 py-4 xl:grid-cols-[minmax(0,272px)_minmax(0,1fr)] xl:items-start">
        <div className="order-1 min-w-0 xl:order-2">
          {params.tab === "overview" && (
            <OverviewTab
              patient={patient}
              record={record}
              upcoming={upcoming}
              timezone={timezone}
              canManage={canManage}
              aiSummaryEnabled={aiSummaryEnabled}
            />
          )}

          {params.tab === "history" && (
            <VisitHistoryTab visits={record.visits} timezone={timezone} />
          )}

          {params.tab === "clinical" && (
            <div className="space-y-4">
              <HealthInfoTab patient={patient} />
              <VitalsTab vitals={record.vitals} timezone={timezone} />
            </div>
          )}

          {params.tab === "medications" && (
            <PrescriptionsTab
              prescriptions={record.prescriptions}
              timezone={timezone}
            />
          )}

          {params.tab === "appointments" && (
            <AppointmentsTab
              upcoming={upcoming}
              past={past}
              timezone={timezone}
              canManage={canManage}
            />
          )}

          {params.tab === "documents" && (
            <DocumentsTab
              patientId={patient.id}
              documents={documents}
              timezone={timezone}
              canManage={canManage}
            />
          )}
        </div>

        <RecordContextPanel
          patient={patient}
          visits={record.visits}
          documents={documents}
          documentsTabHref={patientDirectoryHref({
            ...params,
            tab: "documents",
          })}
          canManage={canManage}
          timezone={timezone}
          showUploader={params.tab !== "documents"}
          className="order-2 min-w-0 xl:order-1"
        />
      </div>
    </div>
  );
}
