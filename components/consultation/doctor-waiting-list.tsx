"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  Stethoscope,
  Play,
  Activity,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { startConsultationAction } from "@/lib/actions/consultation";
import { VISIT_STATUS_META } from "@/lib/constants";
import type { ActionResult } from "@/types";
import type { WaitingListEntry } from "@/lib/consultation-queries";

/**
 * Doctor-facing waiting list — shows only checked-in, waiting/in-consultation
 * patients. Start Consultation is enabled only for the single first-eligible
 * patient (lowest queue_position with status = 'waiting').
 */
export function DoctorWaitingList({
  entries,
  activeVisitId,
}: {
  entries: WaitingListEntry[];
  activeVisitId: string | null;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<
    ActionResult<string> | null,
    FormData
  >(startConsultationAction, null);

  if (state?.ok) {
    router.refresh();
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Stethoscope}
        title="No patients in queue"
        description="Checked-in patients will appear here when they are waiting for consultation."
      />
    );
  }

  const firstWaiting = !activeVisitId
    ? entries.find((e) => e.status === "waiting")
    : null;

  return (
    <div className="space-y-3" role="list" aria-label="Doctor waiting list">
      {entries.map((entry) => {
        const isActive = entry.status === "in_consultation";
        const isEligible = firstWaiting?.id === entry.id;
        const statusMeta = VISIT_STATUS_META[entry.status];

        return (
          <div
            key={entry.id}
            role="listitem"
            className={cn(
              "flex items-center gap-4 rounded-card border px-4 py-3 shadow-card transition-all",
              isActive
                ? "border-primary/30 bg-primary/5"
                : "border-text-muted/30 bg-surface hover:bg-app",
            )}
          >
            {/* Queue position */}
            <div className="flex w-10 shrink-0 flex-col items-center">
              <span className={cn(
                "text-lg font-bold",
                isActive ? "text-primary" : "text-text-secondary",
              )}>
                {entry.queue_position}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-text-muted">
                #{entry.token_number}
              </span>
            </div>

            {/* Patient info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-text-primary">
                  {entry.patientName}
                </p>
                {isActive && (
                  <Badge variant="success" className="shrink-0 text-[10px]">
                    ACTIVE
                  </Badge>
                )}
                {isEligible && (
                  <Badge variant="default" className="shrink-0 text-[10px]">
                    NEXT
                  </Badge>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-3 text-xs text-text-secondary">
                <span>{entry.serviceName}</span>
                {entry.doctorName && (
                  <span className="flex items-center gap-1">
                    <Stethoscope className="h-3 w-3" aria-hidden="true" />
                    {entry.doctorName}
                  </span>
                )}
              </div>
            </div>

            {/* Vitals indicator */}
            {entry.vitals ? (
              <Badge variant="success" className="shrink-0 text-[10px]">
                <Activity className="mr-1 h-3 w-3" aria-hidden="true" />
                Vitals
              </Badge>
            ) : null}

            {/* Status badge */}
            <Badge variant="outline" className="shrink-0">
              {statusMeta?.label ?? entry.status}
            </Badge>

            {/* Action button */}
            {isActive ? (
              <Badge variant="info" className="shrink-0">
                In Consultation
              </Badge>
            ) : isEligible ? (
              <form action={formAction}>
                <input type="hidden" name="visitId" value={entry.id} />
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending}
                  className="shrink-0"
                >
                  <Play className="h-4 w-4" aria-hidden="true" />
                  {isPending ? "Starting..." : "Start"}
                </Button>
              </form>
            ) : (
              <Badge variant="outline" className="shrink-0 text-text-muted">
                #{entry.queue_position}
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}
