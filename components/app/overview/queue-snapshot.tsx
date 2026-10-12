import Link from "next/link";
import { Monitor, Users } from "lucide-react";

import { OverviewPanel, PanelHeader } from "@/components/app/overview/overview-ui";
import { APP_ROUTES } from "@/lib/constants";
import type { QueueSnapshot } from "@/lib/dashboard-overview";
import { AnimatedNumber } from "./animated-number";

/**
 * Queue snapshot built from today's live `visits` rows. "View queue" and
 * "Check in patient" both route into the existing Appointment workspace, which
 * owns the live queue and the reception check-in flow — no new route or
 * permission model is introduced here.
 */
export function QueueSnapshotPanel({ queue }: { queue: QueueSnapshot }) {
  const activeCount =
    queue.completedCount + queue.inConsultationCount + queue.waitingCount;
  const total = Math.max(1, activeCount);
  const completedPct = Math.round((queue.completedCount / total) * 100);
  const progressPct = Math.round((queue.inConsultationCount / total) * 100);
  const waitingPct = Math.max(0, 100 - completedPct - progressPct);

  return (
    <OverviewPanel id="queuePanel">
      <PanelHeader
        icon={Users}
        title="Queue snapshot"
        subtitle="Reception and consultation flow"
        action={
          <span className="flex items-center gap-[7px]">
            <span className="inline-flex items-center gap-[5px] rounded-full border border-[color:var(--line)] bg-[var(--paper)] px-[8px] py-[6px] text-[10px] font-extrabold text-[var(--sage)]">
              <span
                aria-hidden="true"
                className="medbook-live-dot h-[6px] w-[6px] rounded-full bg-[var(--accent)]"
              />
              Live
            </span>
            <span className="rounded-full bg-[var(--pale)] px-[9px] py-[6px] text-[10px] font-extrabold text-[var(--accent)]">
              <AnimatedNumber value={queue.waitingCount} /> waiting
            </span>
          </span>
        }
      />

      <div className="mb-[15px] grid grid-cols-2 gap-[10px]">
        <div className="rounded-[12px] border border-[color:var(--line)] bg-[var(--surface)] px-[14px] py-[17px]">
          <small className="text-[10.5px] font-bold text-[var(--muted)]">
            Now serving
          </small>
          <strong className="mt-[7px] block text-[25px] font-extrabold leading-none tracking-[-0.06em] text-[var(--forest)]">
            <AnimatedNumber value={queue.nowServingToken} prefix="#" />
          </strong>
          <div className="mt-[3px] text-[11px] font-bold text-[var(--sage)]">
            In consultation
          </div>
        </div>
        <div className="rounded-[12px] border border-[color:var(--line)] bg-[var(--surface)] px-[14px] py-[17px]">
          <small className="text-[10.5px] font-bold text-[var(--muted)]">
            Up next
          </small>
          <strong className="mt-[7px] block text-[25px] font-extrabold leading-none tracking-[-0.06em] text-[var(--forest)]">
            <AnimatedNumber value={queue.upNextToken} prefix="#" />
          </strong>
          <div className="mt-[3px] text-[11px] font-bold text-[var(--sage)]">
            Waiting room
          </div>
        </div>
      </div>

      {activeCount === 0 ? (
        <div className="mb-[6px] rounded-[12px] border border-dashed border-[color:var(--line)] bg-[var(--surface)] px-[14px] py-[16px] text-center">
          <p className="text-[11.5px] font-extrabold text-[var(--forest)]">
            No patients in the queue yet
          </p>
          <p className="mt-[3px] text-[10.5px] text-[var(--muted)]">
            Checked-in patients will appear here in real time.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-[9px] mt-4 text-[10px] font-extrabold uppercase tracking-[0.09em] text-[var(--muted)]">
            Patient flow · Today
          </div>
          <div className="flex h-[7px] overflow-hidden rounded-full bg-[var(--wash)]">
            <span
              className="medbook-bar-seg bg-[var(--sage)]"
              style={{ width: `${completedPct}%`, animationDelay: "0ms" }}
            />
            <span
              className="medbook-bar-seg bg-[var(--overview-mint)]"
              style={{ width: `${progressPct}%`, animationDelay: "90ms" }}
            />
            <span
              className="medbook-bar-seg bg-[var(--overview-sand)]"
              style={{ width: `${waitingPct}%`, animationDelay: "180ms" }}
            />
          </div>
          <div className="mt-[10px] flex flex-wrap justify-between gap-[7px] text-[10px] text-[var(--muted)]">
            <span className="inline-flex items-center">
              <b className="mr-[5px] inline-block h-[7px] w-[7px] rounded-full bg-[var(--sage)]" />
              Completed
            </span>
            <span className="inline-flex items-center">
              <b className="mr-[5px] inline-block h-[7px] w-[7px] rounded-full bg-[var(--overview-mint)]" />
              In progress
            </span>
            <span className="inline-flex items-center">
              <b className="mr-[5px] inline-block h-[7px] w-[7px] rounded-full bg-[var(--overview-sand)]" />
              Waiting
            </span>
          </div>
        </>
      )}

      <div className="mt-6 flex flex-wrap gap-[9px]">
        <Link
          href={APP_ROUTES.app.appointments}
          className="medbook-btn-lift group inline-flex min-h-[38px] items-center justify-center gap-2 rounded-[9px] bg-[var(--accent)] px-[15px] py-[9px] text-[12px] font-extrabold text-white shadow-[0_3px_8px_rgba(36,74,54,0.13)] transition-colors hover:bg-[var(--forest)] active:scale-[0.98]"
        >
          <Monitor
            aria-hidden="true"
            className="h-4 w-4 transition-transform duration-200 group-hover:scale-110"
          />
          View queue
        </Link>
        <Link
          href={APP_ROUTES.app.appointments}
          className="medbook-btn-lift inline-flex min-h-[38px] items-center justify-center gap-2 rounded-[9px] border border-[color:var(--line)] bg-[var(--paper)] px-[15px] py-[9px] text-[12px] font-extrabold text-[var(--forest)] transition-colors hover:bg-[var(--wash)] active:scale-[0.98]"
        >
          Check in patient
        </Link>
      </div>
    </OverviewPanel>
  );
}
