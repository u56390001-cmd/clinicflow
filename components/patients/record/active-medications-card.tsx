"use client";

import Link from "next/link";
import { CalendarDays, ChevronRight, Pill, ScanLine } from "lucide-react";

import { MedicationReviewActions } from "@/components/patients/record/medication-review-actions";
import { Badge } from "@/components/ui/badge";
import { formatShortDate } from "@/lib/utils/datetime";
import { cn } from "@/lib/utils";

/** Where the medicine was recorded — shown as a small source badge. */
export type ActiveMedicationSource = "prescribed" | "registration" | "ai_ocr";

/** A medicine the Overview "Active Medications" list shows. */
export type ActiveMedication = {
  id: string;
  name: string;
  /** Strength / dose text (e.g. "500 mg"). Registration-time entries have none. */
  strength: string | null;
  /** e.g. "1-0-1", "3x daily", "SOS". */
  frequency: string | null;
  source: ActiveMedicationSource;
  /** `active_pending` = AI-scanned, awaiting doctor approval. */
  status: "active" | "discontinued" | "active_pending";
  /** Source scan file name, shown as provenance on pending rows. */
  reportName?: string | null;
  /**
   * Date printed on the source document (0052). A medicine prescribed in 2018
   * reads very differently from one prescribed last month, so a clinician
   * reviewing a scanned list needs it next to the drug.
   */
  reportDate?: string | null;
};

/** The card lists the most recent four active drugs and points at the rest. */
const MAX_DISPLAY = 4;

const SOURCE_LABEL: Record<ActiveMedicationSource, string> = {
  prescribed: "Prescribed",
  registration: "Pre-Intake",
  ai_ocr: "AI OCR",
};

const SOURCE_BADGE_CLASS: Record<ActiveMedicationSource, string> = {
  prescribed: "bg-teal-50 text-teal-700 border-teal-200",
  registration: "bg-blue-50 text-blue-700 border-blue-200",
  ai_ocr: "bg-amber-50 text-amber-700 border-amber-200",
};

function SourceBadge({ source }: { source: ActiveMedicationSource }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill border px-2 py-px text-[10px] font-semibold leading-tight",
        SOURCE_BADGE_CLASS[source],
      )}
    >
      {SOURCE_LABEL[source]}
    </span>
  );
}

function doseLine(medicine: ActiveMedication): string {
  return [medicine.strength, medicine.frequency].filter(Boolean).join(" • ");
}

/** "Doc 15 Mar 2018 · prescription.pdf" — the scan a row was read from. */
function provenanceLine(medicine: ActiveMedication): string | null {
  const date = formatShortDate(medicine.reportDate);
  return [date, medicine.reportName].filter(Boolean).join(" · ") || null;
}

/**
 * Active Medications — the current medicines at a glance.
 *
 * AI-scanned rows land first in an amber "Scanned from documents" block with a
 * per-row approve/discard control, because they are real clinical decisions
 * waiting on the doctor. Approved rows join the stand-in `active` list read
 * from the most recent prescription, each row carrying a source badge
 * (Prescribed / Pre-Intake / AI OCR) so provenance is visible at a glance.
 */
export function ActiveMedicationsCard({
  medications,
  viewAllHref,
  canManage = false,
  className,
}: {
  medications: ActiveMedication[];
  /** Where "View full history" jumps — the Medications tab of this record. */
  viewAllHref: string;
  /** Render the approve/discard controls on pending scanned rows. */
  canManage?: boolean;
  className?: string;
}) {
  const pending = medications.filter((m) => m.status === "active_pending");
  const active = medications.filter((m) => m.status === "active");
  const shown = active.slice(0, MAX_DISPLAY);
  const hidden = active.length - shown.length;

  return (
    <section
      className={cn(
        "rounded-card border border-hairline bg-white p-4",
        className,
      )}
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Pill
            aria-hidden="true"
            className="size-4 text-teal-600"
            strokeWidth={2.25}
          />
          Active Medications
        </h3>
        {active.length > 0 && <Badge variant="default">{active.length} Active</Badge>}
      </header>

      {pending.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
              <ScanLine aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
              Scanned from documents
            </p>
            <Badge variant="warning">{pending.length} pending review</Badge>
          </div>

          <ul className="mt-2 flex flex-col gap-1.5">
            {pending.map((medicine) => (
              <li
                key={medicine.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-amber-200/70 bg-white px-2.5 py-2"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-ink">
                    {medicine.name}
                    <SourceBadge source={medicine.source} />
                  </span>
                  {doseLine(medicine) && (
                    <span className="truncate text-[11px] font-medium text-slate-500">
                      {doseLine(medicine)}
                    </span>
                  )}
                  {provenanceLine(medicine) && (
                    <span className="flex items-center gap-1 truncate text-[11px] font-medium text-amber-700/90">
                      <CalendarDays
                        aria-hidden="true"
                        className="size-3 shrink-0"
                        strokeWidth={2.25}
                      />
                      {provenanceLine(medicine)}
                    </span>
                  )}
                </div>
                {canManage && (
                  <MedicationReviewActions medicationId={medicine.id} />
                )}
              </li>
            ))}
          </ul>

          <p className="mt-2 text-[11px] leading-relaxed text-amber-700/90">
            AI extracted these from scanned documents. Approve to add to the
            active list, or discard anything you don&apos;t recognise.
          </p>
        </div>
      )}

      {shown.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {shown.map((medicine) => (
            <li
              key={medicine.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-slate-200/80 bg-slate-50/70 px-2.5 py-2"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-bold text-ink">
                  {medicine.name}
                  <SourceBadge source={medicine.source} />
                </span>
                {provenanceLine(medicine) && (
                  <span className="flex items-center gap-1 truncate text-[11px] font-medium text-slate-500">
                    <CalendarDays
                      aria-hidden="true"
                      className="size-3 shrink-0"
                      strokeWidth={2.25}
                    />
                    {provenanceLine(medicine)}
                  </span>
                )}
              </div>
              {doseLine(medicine) && (
                <span className="mt-px shrink-0 rounded border border-teal-100 bg-white px-2 py-0.5 text-[11px] font-semibold text-teal-700 shadow-sm">
                  {doseLine(medicine)}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-1 text-xs text-slate-400">
          No active medications on file
        </p>
      )}

      {hidden > 0 && (
        <p className="mt-2 text-[11px] font-medium text-slate-500">
          + {hidden} more active drugs
        </p>
      )}

      <Link
        href={viewAllHref}
        scroll={false}
        className="mt-3 flex cursor-pointer items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700 hover:underline"
      >
        View full history in Medications Tab
        <ChevronRight
          aria-hidden="true"
          className="size-3.5"
          strokeWidth={2.5}
        />
      </Link>
    </section>
  );
}