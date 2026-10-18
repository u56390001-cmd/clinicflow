"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Video } from "lucide-react";

import type { TelehealthPatientContext } from "./telehealth-context";
import {
  useTelehealth,
  type TelehealthResumeRecord,
} from "./telehealth-provider";

export type TelehealthLauncherProps = {
  patientId: string;
  whatsappNumber: string | null;
  canManage: boolean;
  context?: TelehealthPatientContext | null;
  activeVisitId?: string | null;
};

const resumeKeyFor = (patientId: string) =>
  `clinicflow:telehealth:${patientId}`;

/**
 * The trigger, not the workspace.
 *
 * Everything the call *does* — the ZEGO UIKit instance, the floating panel, the
 * chat, the captured-frame flow — lives in `TelehealthProvider` at the app
 * shell, so it survives navigation between records and tabs. All this button
 * adds is the per-patient knowledge the shell cannot have: which patient is
 * being called, their clinical context, the encounter to link it to, and the
 * resume record left behind by a refresh.
 */
export function TelehealthLauncher({
  patientId,
  whatsappNumber,
  canManage,
  context = null,
  activeVisitId = null,
}: TelehealthLauncherProps) {
  const { start, rejoin, pending, activePatientId, active } = useTelehealth();
  const [resumable, setResumable] = useState<TelehealthResumeRecord | null>(
    null,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(resumeKeyFor(patientId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<TelehealthResumeRecord>;
      if (
        typeof parsed?.sessionId === "string" &&
        typeof parsed?.roomId === "string" &&
        typeof parsed?.doctorName === "string"
      ) {
        setResumable({
          sessionId: parsed.sessionId,
          roomId: parsed.roomId,
          joinUrl: typeof parsed.joinUrl === "string" ? parsed.joinUrl : "",
          doctorName: parsed.doctorName,
          patientId,
        });
      }
    } catch {
      /* a corrupt record is simply not resumable */
    }
  }, [patientId]);

  const launch = useCallback(async () => {
    await start({ patientId, whatsappNumber, context, activeVisitId });
    setResumable(null);
  }, [start, patientId, whatsappNumber, context, activeVisitId]);

  const resume = useCallback(async () => {
    if (!resumable) return;
    await rejoin(resumable, {
      patientId,
      whatsappNumber,
      context,
      activeVisitId,
    });
  }, [rejoin, resumable, patientId, whatsappNumber, context, activeVisitId]);

  if (!canManage) return null;

  const inThisCall = active && activePatientId === patientId;

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => void launch()}
        disabled={pending || inThisCall}
        className="inline-flex h-8 items-center gap-1.5 rounded-control border-[1.5px] border-primary bg-surface px-3 text-[12.5px] font-semibold text-primary transition-colors hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Video className="size-4" aria-hidden="true" strokeWidth={2} />
        )}
        {pending ? "Starting…" : inThisCall ? "In call" : "Video Call"}
      </button>
      {!inThisCall && resumable && (
        <button
          type="button"
          onClick={() => void resume()}
          disabled={pending}
          className="inline-flex h-8 items-center gap-1.5 rounded-control border-[0.5px] border-status-warning/40 bg-status-warning/10 px-2.5 text-[12.5px] font-semibold text-status-warning transition-colors hover:bg-status-warning/20 disabled:opacity-50"
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Rejoin {resumable.doctorName}
        </button>
      )}
      {active && !inThisCall && (
        <span className="inline-flex h-8 items-center rounded-control border-[0.5px] border-hairline bg-app px-2.5 text-[12.5px] text-text-secondary">
          Call active
        </span>
      )}
    </div>
  );
}
