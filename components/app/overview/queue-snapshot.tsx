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
  const completedPct =
    activeCount === 0 ? 0 : Math.round((queue.completedCount / activeCount) * 100);
  const progressPct =
    activeCount === 0
      ? 0
      : Math.round((queue.inConsultationCount / activeCount) * 100);
  const waitingPct = activeCount === 0 ? 0 : 100 - completedPct - progressPct;

  return (
    <OverviewPanel>
      <PanelHeader
        icon={Users}
        title="Queue snapshot"
        subtitle="Live patient flow"
        action={
          <span className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--line)] bg-[var(--paper)] px-3 py-1.5 text-[12px] font-semibold text-[var(--muted)]">
              <span
                className="medbook-live-dot h-2 w-2 rounded-full bg-[var(--accent)]"
                aria-hidden="true"
              />
              Live
            </span>
            <span className="rounded-full bg-[var(--pale)] px-3 py-1.5 text-[12px] font-semibold text-[var(--accent)]">
              <AnimatedNumber value={queue.waitingCount} /> waiting
            </span>
          </span>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-[12px] border border-[color:var(--line)] bg-[var(--surface)] px-4 py-4">
          <p className="text-[13px] font-medium text-[var(--muted)]">
            Now serving
          </p>
          <strong className="mt-2 block text-[26px] font-bold leading-none tracking-[-0.03em] text-[var(--forest)]">
            <AnimatedNumber value={queue.nowServingToken} prefix="#" />
          </strong>
          <p className="mt-1.5 text-[12px] font-medium text-[var(--accent)]">
            In consultation
          </p>
        </div>
        <div className="rounded-[12px] border border-[color:var(--line)] bg-[var(--surface)] px-4 py-4">
          <p className="text-[13px] font-medium text-[var(--muted)]">
            Up next
          </p>
          <strong className="mt-2 block text-[26px] font-bold leading-none tracking-[-0.03em] text-[var(--forest)]">
            <AnimatedNumber value={queue.upNextToken} prefix="#" />
          </strong>
          <p className="mt-1.5 text-[12px] font-medium text-[var(--accent)]">
            Waiting room
          </p>
        </div>
      </div>

      {activeCount === 0 ? (
        <div className="mb-1.5 rounded-[12px] border border-dashed border-[color:var(--line)] bg-[var(--surface)] px-4 py-6 text-center">
          <p className="text-[15px] font-semibold text-[var(--forest)]">
            No patients in the queue yet
          </p>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            Checked-in patients will appear here in real time.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-2.5 mt-4 text-[12px] font-medium uppercase tracking-[0.06em] text-[var(--muted)]">
            Patient flow · Today
          </p>
          <div className="flex h-2 overflow-hidden rounded-full bg-[var(--wash)]">
            <span
              className="medbook-bar-seg bg-[var(--accent)]"
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
          <div className="mt-3 flex flex-wrap justify-between gap-2 text-[12px] text-[var(--muted)]">
            <span className="inline-flex items-center">
              <b className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />
              Completed
            </span>
            <span className="inline-flex items-center">
              <b className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--overview-mint)]" />
              In progress
            </span>
            <span className="inline-flex items-center">
              <b className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--overview-sand)]" />
              Waiting
            </span>
          </div>
        </>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={APP_ROUTES.app.appointments}
          className="medbook-btn-lift group inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_3px_10px_rgba(63,111,93,0.18)] transition-colors hover:bg-[var(--accent-hover)] active:scale-[0.98]"
        >
          <Monitor
            aria-hidden="true"
            className="h-4 w-4 transition-transform duration-200 group-hover:scale-105"
          />
          View queue
        </Link>
        <Link
          href={APP_ROUTES.app.appointments}
          className="medbook-btn-lift inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-[color:var(--line)] bg-[var(--paper)] px-4 py-2.5 text-sm font-semibold text-[var(--forest)] transition-colors hover:bg-[var(--wash)] active:scale-[0.98]"
        >
          Check in patient
        </Link>
      </div>
    </OverviewPanel>
  );
}
