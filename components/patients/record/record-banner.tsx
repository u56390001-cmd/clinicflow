"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronsRight,
  GitMerge,
  PenLine,
  Play,
  TriangleAlert,
  UserRoundPen,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  completeAndAdvanceAction,
  startConsultationAction,
} from "@/lib/actions/consultation";
import { VISIT_STATUS_META, visitStatusTone } from "@/lib/constants";
import { avatarColorFor, initialsOf } from "@/lib/utils/avatar";
import { ageFromDob } from "@/lib/utils/datetime";
import { cn } from "@/lib/utils";
import type { PatientDirectoryRow, VisitStatus } from "@/types/database";

const GENDER_LABELS: Record<"male" | "female" | "other", string> = {
  male: "Male",
  female: "Female",
  other: "Other",
};

/** A visit this patient has today that is still in progress. */
export type ActiveVisitInfo = {
  id: string;
  status: VisitStatus;
  tokenNumber: number;
};

/**
 * The fixed header of the patient workspace. It stays pinned while the record
 * scrolls, so the four things a doctor must never have to go looking for — who
 * this is, what they are allergic to, what they already have, and what to press
 * next — are on screen for the whole consultation.
 *
 * Deliberately a band, not a card: no radius, no shadow, a hairline under the
 * tab strip. It is chrome for the workspace, and chrome should read as part of
 * the frame rather than as one more piece of content inside it.
 */
export function RecordBanner({
  patient,
  canManage,
  canMerge,
  activeVisit,
  canStart,
  onEdit,
  onMergeDuplicate,
  onWritePrescription,
  onCompleteAndNext,
}: {
  patient: PatientDirectoryRow;
  canManage: boolean;
  /**
   * Whether this member may merge duplicate records (`canMergePatients`) —
   * currently every clinic member, matching the 0041 RPC's own
   * `is_clinic_member` gate, so this boolean renders the Merge Duplicate control
   * for exactly the roles whose action would succeed.
   */
  canMerge: boolean;
  /** This patient's in-progress visit today, if any. */
  activeVisit: ActiveVisitInfo | null;
  /**
   * True when the patient is the currently-eligible next patient — the first
   * `waiting` visit in their doctor's queue with nobody else already in
   * consultation. Computed on the server from the same queue-position logic
   * the doctor waiting list uses.
   */
  canStart: boolean;
  onEdit: () => void;
  /** Opens the merge-duplicate modal with this record as the primary. */
  onMergeDuplicate: () => void;
  /** Opens the full-screen Write Prescription overlay for the active visit. */
  onWritePrescription: (visitId: string) => void;
  /**
   * Called after "Complete and Next" succeeds with the id of the patient the
   * queue advanced to. Falls back to a plain refresh when omitted or when the
   * queue is empty for this doctor.
   */
  onCompleteAndNext?: (nextPatientId: string) => void;
}) {
  const router = useRouter();
  const [isBusy, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const handleStart = (formData: FormData) => {
    setActionError(null);
    startTransition(async () => {
      const res = await startConsultationAction(null, formData);
      if (!res.ok) {
        setActionError(res.message);
        return;
      }
      router.refresh();
    });
  };

  const handleComplete = (formData: FormData) => {
    setActionError(null);
    startTransition(async () => {
      const res = await completeAndAdvanceAction(null, formData);
      if (!res.ok) {
        setActionError(res.message);
        return;
      }
      const nextPatientId = res.data;
      if (nextPatientId && onCompleteAndNext) {
        onCompleteAndNext(nextPatientId);
      } else {
        router.refresh();
      }
    });
  };

  const isReturning = (patient.visit_count ?? 0) > 1;
  const genderLabel = patient.gender ? GENDER_LABELS[patient.gender] : null;
  const age = ageFromDob(patient.date_of_birth) ?? patient.age;
  const statusMeta = activeVisit ? VISIT_STATUS_META[activeVisit.status] : null;
  const statusTone = activeVisit ? visitStatusTone(activeVisit.status) : null;
  const allergies = patient.known_allergies?.trim() || null;
  const conditions = patient.medical_conditions?.trim() || null;

  const metaNodes: React.ReactNode[] = [];
  if (age !== null) {
    metaNodes.push(
      <span key="age" className="tabular-nums">
        {age} yrs
      </span>,
    );
  }
  if (genderLabel) {
    metaNodes.push(<span key="gender">{genderLabel}</span>);
  }
  if (patient.phone) {
    metaNodes.push(<span key="phone">{patient.phone}</span>);
  }
  if (patient.patient_code) {
    metaNodes.push(
      <span key="uhid" className="font-mono font-semibold text-primary">
        UHID {patient.patient_code}
      </span>,
    );
  }

  return (
    <div className="bg-surface">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 pb-3 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-pill text-base font-bold",
              avatarColorFor(patient.id),
            )}
          >
            {initialsOf(patient.name)}
          </span>

          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="min-w-0 truncate text-lg font-bold tracking-tight text-secondary">
                {patient.name}
              </h2>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 py-1 text-[11px] font-bold leading-none",
                  isReturning
                    ? "border-text-muted/20 bg-app text-text-secondary"
                    : "border-primary/25 bg-primary/10 text-primary",
                )}
              >
                {isReturning ? "Returning" : "First visit"}
              </span>
              {activeVisit && statusMeta && statusTone && (
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 py-1 text-[11px] font-bold leading-none",
                    statusTone.pill,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-[5px] shrink-0 rounded-pill",
                      statusTone.dot,
                      activeVisit.status === "waiting" && "animate-pulse",
                    )}
                  />
                  <span className="tabular-nums">
                    Token #{activeVisit.tokenNumber}
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-px bg-current opacity-40"
                  />
                  {statusMeta.label}
                </span>
              )}
            </div>

            {metaNodes.length > 0 && (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-text-muted">
                {metaNodes.map((node, index) => (
                  <Fragment key={index}>
                    {index > 0 && (
                      <span
                        aria-hidden="true"
                        className="h-3 w-px bg-text-muted/30"
                      />
                    )}
                    {node}
                  </Fragment>
                ))}
              </p>
            )}
          </div>
        </div>

        {canManage && (
          <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
            {/* The queue-moving action leads, because it is the one that
                changes state. Its colour names the state you are moving into:
                teal for "in consultation", green for "completed" — the same
                three words the pills use, so nothing here means two things. */}
            {activeVisit && activeVisit.status === "in_consultation" ? (
              <form action={handleComplete}>
                <input type="hidden" name="visitId" value={activeVisit.id} />
                <Button
                  type="submit"
                  size="sm"
                  disabled={isBusy}
                  className="h-9 bg-status-success px-4 text-[12.5px] font-bold text-white hover:bg-status-success/90"
                >
                  <ChevronsRight aria-hidden="true" className="size-4" />
                  {isBusy ? "Advancing…" : "Complete and Next"}
                </Button>
              </form>
            ) : (
              activeVisit &&
              canStart && (
                <form action={handleStart}>
                  <input type="hidden" name="visitId" value={activeVisit.id} />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isBusy}
                    className="h-9 px-4 text-[12.5px] font-bold"
                  >
                    <Play aria-hidden="true" className="size-3.5 fill-current" />
                    {isBusy ? "Starting…" : "Start Consultation"}
                  </Button>
                </form>
              )
            )}

            {activeVisit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onWritePrescription(activeVisit.id)}
                className="h-9 border-primary/40 px-3.5 text-[12.5px] font-semibold text-primary hover:bg-primary/5"
              >
                <PenLine aria-hidden="true" className="size-3.5" />
                Write Prescription
              </Button>
            )}

            {/* Identity-rewriting and owner/admin-only — sits after the
                per-visit actions and before Edit, styled neutral so the teal
                queue controls stay the loudest thing in the cluster. */}
            {canMerge && (
              <Button
                variant="outline"
                size="sm"
                onClick={onMergeDuplicate}
                className="h-9 px-3.5 text-[12.5px] font-semibold"
              >
                <GitMerge aria-hidden="true" className="size-3.5" />
                Merge Duplicate
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={onEdit}
              className="h-9 px-3.5 text-[12.5px] font-semibold"
            >
              <UserRoundPen aria-hidden="true" className="size-3.5" />
              Edit
            </Button>
          </div>
        )}
      </div>

      {actionError && (
        <p className="px-5 pb-2 text-xs text-status-destructive">{actionError}</p>
      )}

      {/* The alert band only earns its height when there is something to say.
          Amber is reserved for allergies — the one fact that changes what you
          are allowed to prescribe — so a patient with conditions alone gets a
          quiet band instead of an alarm. */}
      {(allergies || conditions) && (
        <div
          className={cn(
            "flex flex-wrap items-start gap-x-4 gap-y-1.5 border-t px-5 py-2.5",
            allergies
              ? "border-status-warning/30 bg-status-warning/[0.07]"
              : "border-text-muted/20 bg-app",
          )}
        >
          <TriangleAlert
            aria-hidden="true"
            className={cn(
              "mt-0.5 size-3.5 shrink-0",
              allergies ? "text-status-warning" : "text-text-muted",
            )}
          />
          {allergies && (
            <span className="min-w-0 text-[12.5px] leading-relaxed">
              <span className="font-semibold text-status-warning">Allergies</span>
              <span className="ml-1.5 text-text-primary">{allergies}</span>
            </span>
          )}
          {allergies && conditions && (
            <span
              aria-hidden="true"
              className="mt-1 h-3 w-px shrink-0 bg-status-warning/40"
            />
          )}
          {conditions && (
            <span className="min-w-0 text-[12.5px] leading-relaxed">
              <span className="font-semibold text-text-secondary">
                Conditions
              </span>
              <span className="ml-1.5 text-text-primary">{conditions}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
