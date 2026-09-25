"use client";

import { startTransition, useActionState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronUp,
  ChevronDown,
  User,
  Stethoscope,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { reorderQueueAction } from "@/lib/actions/queue";
import {
  VISIT_STATUS_META,
  VISIT_PAYMENT_STATUS_META,
} from "@/lib/constants";
import type { ActionResult } from "@/types";
import type { Visit, Vitals } from "@/types/database";

type QueueItem = Visit & {
  patientName: string;
  patientPhone: string | null;
  doctorName: string | null;
  tokenNumber: number;
  vitals: Vitals | null;
};

/**
 * Waiting queue list with reorder controls (move up/down buttons —
 * single-pointer alternative per WCAG 2.2 AA).
 */
export function WaitingQueueList({
  queue,
}: {
  queue: QueueItem[];
}) {
  const router = useRouter();
  const [reorderState, reorderAction, isReordering] = useActionState<
    ActionResult | null,
    FormData
  >(reorderQueueAction, null);

  // Refresh after successful reorder
  if (reorderState?.ok) {
    router.refresh();
  }

  const moveUp = useCallback(
    (visitId: string, currentPosition: number) => {
      if (currentPosition <= 1) return;
      const formData = new FormData();
      formData.set("visitId", visitId);
      formData.set("newPosition", String(currentPosition - 1));
      startTransition(() => reorderAction(formData));
    },
    [reorderAction],
  );

  const moveDown = useCallback(
    (visitId: string, currentPosition: number) => {
      const formData = new FormData();
      formData.set("visitId", visitId);
      formData.set("newPosition", String(currentPosition + 1));
      startTransition(() => reorderAction(formData));
    },
    [reorderAction],
  );

  if (queue.length === 0) {
    return (
      <EmptyState
        icon={User}
        title="No patients in queue"
        description="Patients will appear here after check-in."
      />
    );
  }

  const firstWaitingId = queue.find((v) => v.status === "waiting")?.id;

  return (
    <div className="space-y-2" role="list" aria-label="Waiting queue">
      {queue.map((item) => {
        const isFirst = item.id === firstWaitingId;
        const statusMeta = VISIT_STATUS_META[item.status];
        return (
          <div
            key={item.id}
            role="listitem"
            className="flex items-center gap-3 rounded-card border border-text-muted/30 bg-surface px-4 py-3 shadow-card transition-colors hover:bg-app"
          >
            {/* Queue position */}
            <div className="flex w-8 shrink-0 flex-col items-center">
              <span className="text-lg font-bold text-primary">
                {item.queue_position}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-text-muted">
                #{item.token_number}
              </span>
            </div>

            {/* Patient info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-text-primary">
                  {item.patientName}
                </p>
                {isFirst && (
                  <Badge variant="success" className="shrink-0 text-[10px]">
                    NEXT
                  </Badge>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-text-secondary">
                {item.doctorName && (
                  <span className="flex items-center gap-1">
                    <Stethoscope className="h-3 w-3" aria-hidden="true" />
                    {item.doctorName}
                  </span>
                )}
              </div>
            </div>

            {/* Status badge */}
            <Badge variant="outline" className="shrink-0">
              {statusMeta?.label ?? item.status}
            </Badge>

            {/* Payment status badge */}
            {item.payment_status && item.payment_status !== "pending" ? (
              <Badge
                variant={
                  item.payment_status === "not_required" ? "outline" : "success"
                }
                className="shrink-0 text-[10px]"
                title="Payment status"
              >
                {VISIT_PAYMENT_STATUS_META[item.payment_status]?.label ??
                  item.payment_status}
              </Badge>
            ) : null}

            {/* Vitals indicator */}
            {item.vitals ? (
              <Badge variant="success" className="shrink-0 text-[10px]">
                Vitals Done
              </Badge>
            ) : null}

            {/* Reorder controls (single-pointer, accessible) */}
            <div className="flex shrink-0 flex-col gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={isReordering || item.queue_position <= 1}
                onClick={() => moveUp(item.id, item.queue_position)}
                aria-label={`Move ${item.patientName} up`}
              >
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={isReordering || item.queue_position >= queue.length}
                onClick={() => moveDown(item.id, item.queue_position)}
                aria-label={`Move ${item.patientName} down`}
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
