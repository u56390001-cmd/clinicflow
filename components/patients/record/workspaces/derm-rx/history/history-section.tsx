"use client";

/**
 * Previous-prescriptions timeline — identical feature set to the legacy
 * builder (deduped by id, View Details modal, Re-print, Repeat Rx), rendered
 * from the typed model. Repeat Rx hands the parent a parsed RxItem[]; Re-print
 * hands the raw row to the parent to mount the print sheet.
 */

import { useState } from "react";
import { Clock, Eye, Printer, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DermPrescription } from "@/types/database";

import type { RxItem } from "../schema/rx-item";
import { itemText } from "../render/i18n";
import { newItemId } from "../state/rx-reducer";

export function HistorySection({
  rows,
  currentId,
  canManage,
  titleFor,
  itemsFor,
  onRepeat,
  onPrint,
}: {
  rows: DermPrescription[];
  /** The draft row currently being edited — hidden from the list. */
  currentId: string | null;
  canManage: boolean;
  /** Fuzzy protocol name for the card title. */
  titleFor: (rx: DermPrescription) => string;
  /** Row → typed items (same source the editor/preview uses). */
  itemsFor: (rx: DermPrescription) => RxItem[];
  /** Repeat Rx — parent agents the parsed items into the draft. */
  onRepeat: (items: RxItem[], from: DermPrescription) => void;
  /** Re-print — parent mounts the print sheet for this row. */
  onPrint: (rx: DermPrescription) => void;
}) {
  const [viewRx, setViewRx] = useState<DermPrescription | null>(null);
  const deduped = Object.values(
    rows.reduce<Record<string, DermPrescription>>((acc, rx) => {
      if (rx.id && !acc[rx.id]) acc[rx.id] = rx;
      return acc;
    }, {}),
  )
    .filter((rx) => rx.id !== currentId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  if (deduped.length === 0) return null;

  return (
    <>
      <div className="rounded-xl border border-card-line bg-surface">
        <div className="flex items-center justify-between border-b border-card-line px-3.5 py-2">
          <p className="text-sm font-semibold text-text-primary">
            Previous prescriptions
          </p>
          <span className="text-xs text-text-muted">
            {deduped.length} earlier
          </span>
        </div>
        <div className="space-y-2 p-3.5">
          {deduped.map((rx) => {
            const items = itemsFor(rx);
            return (
              <div
                key={rx.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline p-3"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-text-primary">
                    {rx.created_at.slice(0, 10)} · {titleFor(rx)}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {items.slice(0, 3).map((item, i) => (
                      <Badge
                        key={`${rx.id}-m-${i}`}
                        className="bg-app text-[10.5px] text-text-secondary"
                      >
                        {item.brand}
                      </Badge>
                    ))}
                    {items.length > 3 ? (
                      <span className="text-[10.5px] text-text-muted">
                        +{items.length - 3} more
                      </span>
                    ) : null}
                    {rx.follow_up ? (
                      <Badge className="border-status-info/30 bg-status-info/10 text-status-info">
                        <Clock className="h-3 w-3" />
                        Revisit: {rx.follow_up}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setViewRx(rx)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Details
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canManage}
                    onClick={() => {
                      if (items.length === 0) {
                        return;
                      }
                      onRepeat(
                        items.map((item) => ({ ...item, id: newItemId() })),
                        rx,
                      );
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Repeat Rx
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Historical Rx full detail (+ re-print). */}
      <Dialog
        open={viewRx !== null}
        onOpenChange={(open) => {
          if (!open) setViewRx(null);
        }}
      >
        <DialogContent size="wide" className="max-h-[85vh] overflow-y-auto">
          {viewRx ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {viewRx.created_at.slice(0, 10)} · {titleFor(viewRx)}
                </DialogTitle>
                <DialogDescription>
                  Full prescription as recorded on that visit.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-[12.5px]">
                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-primary">
                    Medicines ({itemsFor(viewRx).length})
                  </p>
                  <div className="space-y-1.5">
                    {itemsFor(viewRx).map((item, i) => (
                      <p
                        key={`v-${item.id}`}
                        className="leading-snug text-text-secondary"
                      >
                        <span className="font-bold text-text-primary">
                          {i + 1}. {item.brand}
                        </span>
                        {` — ${itemText(item, "en")}`}
                      </p>
                    ))}
                  </div>
                </div>
                {(viewRx.lab_orders ?? [])
                  .filter((l) => l.test_name.trim())
                  .length > 0 ? (
                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-primary">
                      Advised tests
                    </p>
                    {(viewRx.lab_orders ?? [])
                      .filter((l) => l.test_name.trim())
                      .map((l, i) => (
                        <p key={`vl-${i}`} className="text-text-secondary">
                          • {l.test_name}
                          {l.notes ? ` — ${l.notes}` : ""}
                        </p>
                      ))}
                  </div>
                ) : null}
                {[
                  {
                    label: "Application instructions",
                    value: viewRx.application_instructions,
                  },
                  { label: "Patient advice", value: viewRx.patient_education },
                  { label: "AM routine", value: viewRx.skincare_routine_am },
                  { label: "PM routine", value: viewRx.skincare_routine_pm },
                  { label: "Follow-up", value: viewRx.follow_up },
                ]
                  .filter((row) => row.value?.trim())
                  .map((row) => (
                    <div key={row.label}>
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-primary">
                        {row.label}
                      </p>
                      <p className="whitespace-pre-wrap leading-relaxed text-text-secondary">
                        {row.value}
                      </p>
                    </div>
                  ))}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setViewRx(null)}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onPrint(viewRx);
                    setViewRx(null);
                  }}
                >
                  <Printer className="h-3.5 w-3.5" />
                  Re-print
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
