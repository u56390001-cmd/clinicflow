"use client";

import { BasicHealthInfo } from "@/components/patients/record/basic-health-info";
import { DocumentsWidget } from "@/components/patients/record/documents-widget";
import { VISIT_STATUS_META, visitStatusTone } from "@/lib/constants";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import { cn } from "@/lib/utils";
import { formatNaiveDate } from "@/lib/utils/datetime";
import type { PatientVisitRow } from "@/lib/patient-record";
import type { PatientDocumentView } from "@/lib/patient-documents-queries";
import type { PatientDirectoryRow } from "@/types/database";

/**
 * How many visits the context panel shows. Three is one more than you need to
 * recognise "seen before" and one fewer than a list you have to scroll.
 */
const RECENT_VISIT_COUNT = 3;

/**
 * The record's standing reference — the facts that are true whichever tab is
 * open. This is spec §5's left column: Basic Health Info, the last few visits,
 * and documents. It never scrolls with the work area because the record pane
 * scrolls as a whole; what matters is that it sits *beside* the work area
 * rather than above it, so the doctor reads history and writes notes at the
 * same time.
 *
 * Below `xl` there isn't room for a 272px column, so it drops underneath. That
 * is a deliberate concession to width, not a second layout: same order, same
 * cards, just stacked.
 */
export function RecordContextPanel({
  patient,
  visits,
  documents,
  documentsTabHref,
  canManage,
  timezone,
  showUploader,
  className,
}: {
  patient: PatientDirectoryRow;
  /** Newest first — the record's full visit list. */
  visits: PatientVisitRow[];
  documents: PatientDocumentView[];
  /** `?tab=documents` — the Documents widget's "View all" target. */
  documentsTabHref: string;
  canManage: boolean;
  timezone: string;
  /** False while the Documents tab is open, which uploads its own. */
  showUploader: boolean;
  className?: string;
}) {
  const recent = visits.slice(0, RECENT_VISIT_COUNT);

  return (
    <aside className={cn("space-y-4", className)}>
      <BasicHealthInfo patient={patient} visits={visits} />

      <section className="rounded-card border border-text-muted/15 bg-surface">
        <header className="flex items-center justify-between gap-2 border-b border-text-muted/15 px-4 py-3">
          <h3 className="text-[13px] font-bold text-secondary">
            Previous visits
          </h3>
          <span className="rounded-pill bg-app px-1.5 py-0.5 text-[10px] tabular-nums text-text-muted">
            {visits.length}
          </span>
        </header>

        {recent.length === 0 ? (
          <p className="px-4 py-3 text-sm text-text-muted">
            No visits recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-text-muted/10">
            {recent.map((visit) => {
              const meta = VISIT_STATUS_META[visit.status];
              const tone = visitStatusTone(visit.status);
              return (
                <li
                  key={visit.id}
                  className="flex items-center gap-2 px-4 py-2.5"
                >
                  <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-text-secondary">
                    #{visit.token_number}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-text-primary">
                    {formatNaiveDate(
                      utcIsoToClinicLocalInput(visit.checked_in_at, timezone),
                    )}
                  </span>
                  {meta && (
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center whitespace-nowrap rounded-pill border px-1.5 py-px text-[10px] font-semibold",
                        tone.pill,
                      )}
                    >
                      {meta.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <DocumentsWidget
        patientId={patient.id}
        documents={documents}
        documentsTabHref={documentsTabHref}
        canManage={canManage}
        showUploader={showUploader}
      />
    </aside>
  );
}
