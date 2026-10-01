"use client";

import { RotateCcw, Stethoscope } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LabOrder } from "@/types/database";
import { labTestLabel } from "@/lib/lab-panels";
import { formatNaiveDate } from "@/lib/utils/datetime";

/**
 * One past visit's lab orders, newest visit first.
 *
 * Grouped per visit rather than flattened into "every test this patient has
 * ever been sent": the common reason to open this is to repeat what the last
 * visit did, and a flat list hands that back as a row of unrelated single tests
 * with no idea which ones went together.
 */
export type PastLabHistoryEntry = {
  /** Sort key only: the visit date, falling back to the row's creation time. */
  lastUsed: string;
  visitDate: string | null;
  doctorName: string | null;
  orders: LabOrder[];
};

/**
 * Date-wise history of lab tests ordered on this patient's earlier visits, with
 * a one-click repeat.
 *
 * Reads the orders off past prescriptions rather than a results table on
 * purpose. A results table answers "what did this number come out as", which is
 * the left rail's job; this answers "what am I about to send them for", which is
 * a different question and one the previous visit already answers exactly.
 */
export function PastLabHistoryModal({
  open,
  onOpenChange,
  entries,
  onReorder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: PastLabHistoryEntry[];
  /** Re-adds a whole visit's orders at once. */
  onReorder: (orders: LabOrder[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide">
        <DialogHeader>
          <DialogTitle>Previous Lab History</DialogTitle>
          <DialogDescription>
            Tests ordered on this patient&apos;s earlier visits, most recent
            first.
          </DialogDescription>
        </DialogHeader>

        {entries.length === 0 ? (
          <div className="flex flex-col items-start gap-1 rounded-[8px] border border-hairline bg-app px-3 py-4">
            <p className="text-ink text-[13px] font-semibold">
              No earlier lab orders
            </p>
            <p className="text-[12px] leading-snug text-text-muted">
              Nothing has been ordered on a previous visit. Tests added below
              will show up here for the next consultation.
            </p>
          </div>
        ) : (
          <ul className="scrollbar-thin -mr-1 flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
            {entries.map((entry) => (
              <li
                key={`${entry.lastUsed}-${entry.doctorName ?? ""}`}
                className="flex min-w-0 flex-col gap-1.5 rounded-[8px] border border-hairline bg-surface px-2.5 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Stethoscope
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-text-muted"
                  />
                  <span className="text-ink min-w-0 flex-1 truncate text-[12px] font-semibold">
                    {entry.visitDate
                      ? formatNaiveDate(entry.visitDate)
                      : "Date not recorded"}
                  </span>
                  {entry.doctorName && (
                    <span className="truncate text-[11px] text-text-muted">
                      {entry.doctorName}
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onReorder(entry.orders)}
                    className="h-6 shrink-0 gap-1 rounded-[6px] px-2 text-[11px] font-semibold text-primary hover:bg-primary-tint hover:text-primary"
                  >
                    <RotateCcw aria-hidden="true" className="size-3.5" />
                    Order Again
                  </Button>
                </div>

                <ul className="flex flex-wrap gap-1.5 pl-6">
                  {entry.orders.map((order, index) => (
                    <li
                      key={`${order.test_name}-${index}`}
                      className="rounded-pill border border-hairline bg-app px-2 py-0.5 text-[11px] font-medium text-text-primary"
                    >
                      {labTestLabel(order.test_name, order.sub_parameters)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
