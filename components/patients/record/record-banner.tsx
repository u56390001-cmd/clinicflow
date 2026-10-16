"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Cake,
  CalendarDays,
  ClipboardList,
  GitMerge,
  PenLine,
  Phone,
  Play,
  ShieldAlert,
  SquarePen,
  Stethoscope,
  Timer,
  User,
  Wallet,
} from "lucide-react";

import {
  completeAndAdvanceAction,
  startConsultationAction,
} from "@/lib/actions/consultation";
import { VISIT_STATUS_META, visitStatusTone } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TelehealthLauncher } from "@/components/telehealth/telehealth-launcher";
import { avatarColorFor, initialsOf } from "@/lib/utils/avatar";
import { ageFromDob } from "@/lib/utils/datetime";
import { cn } from "@/lib/utils";
import type {
  PatientBillStatus,
  PatientDirectoryRow,
  VisitStatus,
} from "@/types/database";

const GENDER_LABELS: Record<"male" | "female" | "other" | "unknown", string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  unknown: "Unknown",
};

/**
 * A compact psychology context strip for the header, shown only in the
 * psychology workspace. The record's tabs carry the full detail; this is the
 * one-line "who is this and how are they doing" a therapist wants before the
 * record even opens — current risk, the presenting concern, the working
 * diagnosis and when they were last seen.
 */
export type PsychHeaderContext = {
  riskLevel?: string | null;
  concern?: string | null;
  diagnosis?: string | null;
  lastSession?: string | null;
};

const PSYCH_RISK_TONE: Record<string, string> = {
  low: "border-primary/30 bg-primary/10 text-primary",
  moderate: "border-status-warning/30 bg-status-warning/10 text-status-warning",
  high: "border-orange-300 bg-orange-100 text-orange-700",
  crisis: "border-status-destructive/40 bg-status-destructive/10 text-status-destructive",
};

export type ActiveVisitInfo = {
  id: string;
  status: VisitStatus;
  tokenNumber: number;
  startedAt: string | null;
  /** Non-null when the doctor returned this visit to the queue with a saved draft (migration 0076). */
  pausedAt: string | null;
  billing: {
    status: PatientBillStatus;
    pendingAmount: number;
  } | null;
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function useConsultationTimer(startedAt: string | null, running: boolean) {
  const [elapsed, setElapsed] = useState<number | null>(null);

  useEffect(() => {
    if (!running || !startedAt) {
      setElapsed(null);
      return;
    }
    const startedMs = new Date(startedAt).getTime();
    if (Number.isNaN(startedMs)) {
      setElapsed(null);
      return;
    }
    const tick = () => setElapsed(Date.now() - startedMs);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, running]);

  return elapsed;
}

/**
 * One fact, one capsule. Every chip in the record header is the same 24px
 * shape, the same radius, the same 11.5px weight, and the same 14px icon, so
 * the row reads as a single register instead of a bag of mismatched badges.
 * Height is fixed rather than padding-driven because a phone number and a
 * status word must sit on one line together.
 */
const CAPSULE =
  "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border-[0.5px] border-hairline bg-chip px-2.5 text-[11.5px] font-semibold leading-none text-text-secondary";

/** The icon inside a capsule, one step quieter than the value it labels. */
const CAPSULE_ICON = "size-3.5 shrink-0 text-text-muted";

/**
 * The record's one solid action. Teal, and the only such button. h-8 keeps it
 * exactly as tall as the identity row's avatar, so the header stays two rows.
 */
const ACTION_BUTTON =
  "inline-flex h-8 items-center gap-1.5 rounded-control bg-primary px-3.5 text-[12.5px] font-bold text-white shadow-action transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";

/** Outlined secondary action. */
const OUTLINE_BUTTON =
  "inline-flex h-8 items-center gap-1.5 rounded-control border-[1.5px] border-primary bg-surface px-3 text-[12.5px] font-semibold text-primary transition-colors hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** Tertiary action. Quiet until hovered so the solid button keeps the eye. */
const GHOST_BUTTON =
  "inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:bg-app hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/**
 * Patient Record header, read top to bottom in the order a clinician needs it:
 * who this is, what state today's visit is in, the demographics, and finally the
 * one action that moves the visit forward.
 *
 * Two structural rules. Every fact about the person — name, UHID, age, gender,
 * phone — is rendered here and nowhere else in the record, so there is exactly
 * one place to read it. And the action hierarchy is one solid button, one
 * outlined, two quiet: the solid one is the reason this pane is open, and a
 * second one would make the choice ambiguous.
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
  writePrescriptionLabel = "Write Prescription",
  onCompleteAndNext,
  psychContext,
}: {
  patient: PatientDirectoryRow;
  canManage: boolean;
  canMerge: boolean;
  activeVisit: ActiveVisitInfo | null;
  canStart: boolean;
  onEdit: () => void;
  onMergeDuplicate: () => void;
  /**
   * Opens the Prescriptions tab (or the workspace's own write tab — Session
   * Notes for psychology, Dermatology Rx for dermatology), where the
   * consultation and prescription builder live. This used to mount a
   * full-screen Write Prescription overlay.
   */
  onWritePrescription: () => void;
  /** Label for that CTA, scoped to the active workspace. */
  writePrescriptionLabel?: string;
  onCompleteAndNext?: (nextPatientId: string) => void;
  /** Psychology-only context strip; omitted in the general and derm workspaces. */
  psychContext?: PsychHeaderContext | null;
}) {
  const router = useRouter();
  const [isBusy, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);

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

  const isConsulting = activeVisit?.status === "in_consultation";
  const isPaused =
    activeVisit?.status === "waiting" && Boolean(activeVisit.pausedAt);
  const elapsedMs = useConsultationTimer(
    activeVisit?.startedAt ?? null,
    isConsulting,
  );

  const genderLabel = patient.gender ? GENDER_LABELS[patient.gender] : null;
  const statusMeta = activeVisit ? VISIT_STATUS_META[activeVisit.status] : null;
  const statusTone = activeVisit ? visitStatusTone(activeVisit.status) : null;
  const visitCount = patient.visit_count ?? 0;
  const isFirstVisit = visitCount <= 1;

  // The DOB wins over the stored `age` column: a hand-entered age is wrong
  // within a year, and the fallback only applies to pre-DOB rows.
  const age = ageFromDob(patient.date_of_birth) ?? patient.age;

  const billing = activeVisit?.billing ?? null;
  const billingUnpaid = billing ? billing.pendingAmount > 0 : false;

  return (
    // The hairline is the divider the old action bar drew below itself: header
    // and tab strip are both on bg-surface, so without it they read as one
    // undifferentiated block.
    <div className="border-b-[0.5px] border-hairline bg-surface">
      {/* Row 1 of 2. Who this is on the left, the actions that move today's
          visit forward on the right. The name is the only thing here at display
          weight, so the eye lands on the person before the interface. */}
      <div className="flex flex-col gap-3 px-4 pt-3.5 sm:px-[26px] lg:flex-row lg:items-center lg:gap-4">
        <div className="flex min-w-0 items-center gap-3 lg:flex-1">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold",
            avatarColorFor(patient.id),
          )}
        >
          {initialsOf(patient.name)}
        </div>

        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h1 className="min-w-0 truncate text-[22px] font-bold leading-tight text-ink">
            {patient.name}
          </h1>
          {patient.patient_code && (
            <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-control border-[0.5px] border-hairline bg-app px-1.5 py-[2px] font-mono text-[11px] font-semibold tracking-tight text-text-secondary">
              {patient.patient_code}
            </span>
          )}
        </div>
        </div>

        {/* One solid, one outlined, two quiet. On phones and tablets the actions
            wrap onto their own row beneath the identity, so the name is never
            squeezed; from `lg` up they sit inline on the right. */}
        <div className="flex flex-wrap items-center gap-1.5 lg:shrink-0 lg:justify-end">
          {canManage &&
            (isConsulting ? (
              <button
                type="button"
                onClick={() => setConfirmCompleteOpen(true)}
                disabled={isBusy}
                className={ACTION_BUTTON}
              >
                <Play aria-hidden="true" className="size-4 fill-current" strokeWidth={2} />
                {isBusy ? "Completing…" : "Complete & Next"}
              </button>
            ) : (
              activeVisit &&
              canStart && (
                <form action={handleStart}>
                  <input type="hidden" name="visitId" value={activeVisit.id} />
                  <button type="submit" disabled={isBusy} className={ACTION_BUTTON}>
                    <Play aria-hidden="true" className="size-4 fill-current" strokeWidth={2} />
                    {isBusy ? "Starting…" : isPaused ? "Resume Consultation" : "Start Consultation"}
                  </button>
                </form>
              )
            ))}

          {activeVisit && (
            <button
              type="button"
              onClick={onWritePrescription}
              className={OUTLINE_BUTTON}
            >
              <PenLine aria-hidden="true" className="size-4" strokeWidth={2} />
              {writePrescriptionLabel}
            </button>
          )}

          <TelehealthLauncher
            patientId={patient.id}
            whatsappNumber={patient.whatsapp_number}
            canManage={canManage}
          />

          {canMerge && (
            <button
              type="button"
              onClick={onMergeDuplicate}
              className={GHOST_BUTTON}
              aria-label="Merge duplicate"
            >
              <GitMerge aria-hidden="true" className="size-4" strokeWidth={2} />
              <span className="hidden sm:inline">Merge Duplicate</span>
            </button>
          )}

          <button
            type="button"
            onClick={onEdit}
            className={GHOST_BUTTON}
            aria-label="Edit profile"
          >
            <SquarePen aria-hidden="true" className="size-4" strokeWidth={2} />
            <span className="hidden sm:inline">Edit Profile</span>
          </button>
        </div>
      </div>

      {/* Row 2 of 2. Every fact about this visit and this person, as one row of
          identical capsules: the visit's state, then the demographics. This
          is the only place on the record where they appear — the tabs below
          never repeat them. Colour is spent once, on the status capsule,
          because that is the one fact that changes what you do next. */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-4 pt-2.5 sm:px-[26px]">
        {isFirstVisit && (
          <span className={CAPSULE}>
            <span className="inline-block size-1.5 shrink-0 rounded-full bg-blue-500" />
            First Visit
          </span>
        )}

        {activeVisit && (
          <span className={CAPSULE}>
            <CalendarDays aria-hidden="true" className={CAPSULE_ICON} strokeWidth={2} />
            Today · Token #{activeVisit.tokenNumber}
          </span>
        )}

        {activeVisit && statusMeta && statusTone && (
          <span className={cn(CAPSULE, statusTone.pill)}>
            <span
              className={cn(
                "inline-block size-1.5 shrink-0 rounded-full",
                statusTone.dot,
                activeVisit.status === "waiting" && !isPaused && "animate-pulse",
              )}
            />
            {isPaused ? "Paused · Draft Saved" : statusMeta.label}
          </span>
        )}

        {elapsedMs !== null && (
          <span className={cn(CAPSULE, "font-bold tabular-nums")}>
            <Timer aria-hidden="true" className={CAPSULE_ICON} strokeWidth={2} />
            {formatElapsed(elapsedMs)}
          </span>
        )}

        {billing && (
          <span
            className={cn(
              CAPSULE,
              "font-bold",
              billingUnpaid
                ? "border-status-warning/30 bg-status-warning/10 text-status-warning"
                : "border-status-success/30 bg-status-success/10 text-status-success",
            )}
          >
            <Wallet aria-hidden="true" className="size-3.5 shrink-0 opacity-80" strokeWidth={2} />
            {billingUnpaid
              ? `Pending ₨${billing.pendingAmount.toLocaleString()}`
              : "Bill Paid"}
          </span>
        )}

        {age !== null && age !== undefined && (
          <span className={CAPSULE}>
            <Cake aria-hidden="true" className={CAPSULE_ICON} strokeWidth={2} />
            {age} yrs
          </span>
        )}

        {genderLabel && (
          <span className={CAPSULE}>
            <User aria-hidden="true" className={CAPSULE_ICON} strokeWidth={2} />
            {genderLabel}
          </span>
        )}

        {patient.phone && (
          <span className={CAPSULE}>
            <Phone aria-hidden="true" className={CAPSULE_ICON} strokeWidth={2} />
            {patient.phone}
          </span>
        )}
      </div>

      {/* Psychology context, when this is a therapy record: the four facts a
          therapist re-orients with before reading the chart. A quiet third row
          so it never dilutes the identity capsules above, and only ever in the
          psychology workspace. */}
      {psychContext &&
        (psychContext.riskLevel ||
          psychContext.concern ||
          psychContext.diagnosis ||
          psychContext.lastSession) && (
          <div className="-mt-1 flex flex-wrap items-center gap-1.5 px-4 pb-3 sm:px-[26px]">
            {psychContext.riskLevel && (
              <span
                className={cn(
                  CAPSULE,
                  "font-bold",
                  PSYCH_RISK_TONE[psychContext.riskLevel] ?? "",
                )}
              >
                <ShieldAlert aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2} />
                {psychContext.riskLevel.replace(/_/g, " ")} risk
              </span>
            )}
            {psychContext.concern && (
              <span className={CAPSULE}>
                <ClipboardList aria-hidden="true" className={CAPSULE_ICON} strokeWidth={2} />
                {psychContext.concern}
              </span>
            )}
            {psychContext.diagnosis && (
              <span className={CAPSULE}>
                <Stethoscope aria-hidden="true" className={CAPSULE_ICON} strokeWidth={2} />
                {psychContext.diagnosis}
              </span>
            )}
            {psychContext.lastSession && (
              <span className={CAPSULE}>
                <CalendarDays aria-hidden="true" className={CAPSULE_ICON} strokeWidth={2} />
                Last session {psychContext.lastSession}
              </span>
            )}
          </div>
        )}

      {actionError && (
        <p role="alert" className="px-4 pb-3 text-xs text-status-destructive sm:px-[26px]">
          {actionError}
        </p>
      )}

      <Dialog
        open={confirmCompleteOpen}
        onOpenChange={setConfirmCompleteOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete this consultation?</DialogTitle>
            <DialogDescription>
              This finalizes the visit, marks it completed, and moves the next
              waiting patient into consultation.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmCompleteOpen(false)}
              disabled={isBusy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                setConfirmCompleteOpen(false);
                if (!activeVisit) return;
                const formData = new FormData();
                formData.set("visitId", activeVisit.id);
                handleComplete(formData);
              }}
              disabled={isBusy}
            >
              {isBusy ? "Completing…" : "Yes, Complete & Next"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

