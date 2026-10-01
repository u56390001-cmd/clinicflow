"use client";

import { CalendarDays, ScanLine } from "lucide-react";

import { AlertReviewActions } from "@/components/patients/record/alert-review-actions";
import { Badge } from "@/components/ui/badge";
import { formatShortDate } from "@/lib/utils/datetime";
import { cn } from "@/lib/utils";

/** One safety alert staged from a scan, waiting on the doctor's decision. */
export type ScannedAlert = {
  id: string;
  type: "allergy" | "known_case";
  text: string;
  reportName: string | null;
  /** Date printed on the source document (0052) — "Doc 15 Mar 2018". */
  reportDate: string | null;
};

const TYPE_LABEL: Record<ScannedAlert["type"], string> = {
  allergy: "Allergy",
  known_case: "Known Case",
};

/** Tinted to match where the entry lands once approved: rose for allergies, amber for conditions. */
const TYPE_CHIP_CLASS: Record<ScannedAlert["type"], string> = {
  allergy: "border-rose-200 bg-rose-100/80 text-rose-800",
  known_case: "border-amber-200 bg-amber-100/80 text-amber-800",
};

/**
 * Allergies and known conditions the AI pulled out of a scanned document, held
 * back from the Overview's Critical Safety Alerts block until a clinician
 * approves them. Deliberately amber rather than red: an unverified extraction
 * must not read as a confirmed allergy. Approving merges the entry into the
 * patient's record, dismissing drops it.
 *
 * Renders nothing when there are no pending alerts, so the Overview only grows
 * this block when there is something to review.
 */
export function ScannedAlertsCard({
  alerts,
  canManage = false,
  className,
}: {
  alerts: ScannedAlert[];
  canManage?: boolean;
  className?: string;
}) {
  if (alerts.length === 0) {
    return null;
  }

  return (
    <section
      className={cn(
        "rounded-card border border-amber-200 bg-white p-4",
        className,
      )}
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <ScanLine
            aria-hidden="true"
            className="size-4 text-amber-600"
            strokeWidth={2.25}
          />
          Safety alerts from documents
        </h3>
        <Badge variant="warning">{alerts.length} pending review</Badge>
      </header>

      <ul className="flex flex-col gap-1.5">
        {alerts.map((alert) => (
          <li
            key={alert.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-amber-200/70 bg-amber-50/50 px-2.5 py-2"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-ink">
                <span
                  className={cn(
                    "inline-flex items-center rounded-pill border px-1.5 py-px text-[10px] font-semibold leading-tight",
                    TYPE_CHIP_CLASS[alert.type],
                  )}
                >
                  {TYPE_LABEL[alert.type]}
                </span>
                {alert.text}
              </span>
              {alert.reportName && (
                <span className="truncate text-[11px] font-medium text-slate-500">
                  From {alert.reportName}
                </span>
              )}
              {formatShortDate(alert.reportDate) && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                  <CalendarDays
                    aria-hidden="true"
                    className="size-3 shrink-0"
                    strokeWidth={2.25}
                  />
                  Document dated {formatShortDate(alert.reportDate)}
                </span>
              )}
            </div>
            {canManage && <AlertReviewActions alertId={alert.id} />}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[11px] leading-relaxed text-amber-700/90">
        AI extracted these from scanned documents. Approve to add them to the
        patient&apos;s safety alerts, or dismiss anything you don&apos;t
        recognise.
      </p>
    </section>
  );
}