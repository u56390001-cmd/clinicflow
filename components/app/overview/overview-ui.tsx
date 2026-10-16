import type { LucideIcon } from "lucide-react";

import type { TodayScheduleStatus } from "@/lib/dashboard-overview";
import { cn } from "@/lib/utils";

/**
 * Presentational primitives for the dashboard overview. They are deliberately
 * dumb (no data, no client state) so both server cards and the one interactive
 * schedule card can share the exact same panel/pill anatomy.
 */

export function OverviewPanel({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "min-w-0 overflow-hidden rounded-[14px] border border-[color:var(--line)] bg-[var(--paper)] p-6 shadow-[var(--overview-shadow)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--pale)] text-[var(--accent)]">
          <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--forest)]">
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-0.5 text-[13px] text-[var(--muted)]">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {action}
    </div>
  );
}

const STATUS_META: Record<
  TodayScheduleStatus,
  { label: string; className: string }
> = {
  waiting: {
    label: "Waiting",
    className: "bg-[var(--orange-wash)] text-[var(--orange)]",
  },
  progress: {
    label: "In consultation",
    className: "bg-[var(--pale)] text-[var(--accent)]",
  },
  upcoming: {
    label: "Upcoming",
    className: "bg-[var(--blue-wash)] text-[var(--blue)]",
  },
  complete: {
    label: "Completed",
    className: "bg-[var(--surface)] text-[var(--muted)]",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-[var(--red-wash)] text-[var(--red)]",
  },
};

export function StatusPill({ status }: { status: TodayScheduleStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}
