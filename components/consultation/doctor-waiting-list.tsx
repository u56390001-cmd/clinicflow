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
import { DoctorSelector } from "@/components/consultation/doctor-selector";
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
  // TEMPORARY WORKAROUND props — remove when doctor login is live
  allDoctors = [],
  selectedDoctorId = null,
  showDoctorSelector = false,
}: {
  entries: WaitingListEntry[];
  activeVisitId: string | null;
  /** TEMPORARY: all clinic doctors for the selector dropdown */
  allDoctors?: { id: string; name: string; specialty: string | null }[];
  /** TEMPORARY: currently selected doctor id from ?doc= param */
  selectedDoctorId?: string | null;
  /** TEMPORARY: show the selector only when no doctor is linked to the user */
  showDoctorSelector?: boolean;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<
    ActionResult<string> | null,
    FormData
  >(startConsultationAction, null);

  if (state?.ok) {
    router.refresh();
  }

  const firstWaiting = !activeVisitId
    ? entries.find((e) => e.status === "waiting")
    : null;

  return (
    <div className="space-y-4">
      {/* TEMPORARY WORKAROUND: Doctor selector shown when admin has no linked doctor */}
      {showDoctorSelector && (
        <div className="flex items-center justify-between rounded-card border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary">
              Select a Doctor
            </p>
            <p className="text-xs text-text-secondary">
              Choose which doctor&apos;s queue to view
            </p>
          </div>
          <DoctorSelector doctors={allDoctors} />
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title={selectedDoctorId ? "No patients in this doctor's queue" : "No patients in queue"}
          description={
            selectedDoctorId
              ? "This doctor has no checked-in patients waiting for consultation."
              : showDoctorSelector
              ? "Select a doctor above to see their waiting patients, or add patients to the queue."
              : "Checked-in patients will appear here when they are waiting for consultation."
          }
        />
      ) : (
        <div className="space-y-3" role="list" aria-label="Doctor waiting list">
          {state && !state.ok && (
            <p
              role="alert"
              className="mb-2 rounded-control border border-status-destructive/30 bg-status-destructive/10 px-3 py-2 text-xs text-status-destructive"
            >
              {state.message}
            </p>
          )}
          {entries.map((entry) => {
            const isActive = entry.status === "in_consultation";
            const isPaused = Boolean(entry.paused_at);
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
                    {isPaused && (
                      <Badge variant="warning" className="shrink-0 text-[10px]">
                        PAUSED
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
                  {isPaused ? "Paused · Draft Saved" : (statusMeta?.label ?? entry.status)}
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
                      {isPending
                        ? "Starting…"
                        : isPaused
                          ? "Resume"
                          : "Start"}
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
      )}
    </div>
  );
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}
