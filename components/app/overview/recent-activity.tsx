import {
  Activity as ActivityIcon,
  CalendarCheck,
  Check,
  Info,
  Mail,
  Receipt,
  ShieldAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { OverviewPanel, PanelHeader } from "@/components/app/overview/overview-ui";
import type {
  DashboardActivityItem,
  DashboardActivityKind,
} from "@/lib/dashboard-overview";
import { relativeTimeShort } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<DashboardActivityKind, LucideIcon> = {
  booking: CalendarCheck,
  queue: Check,
  integration: Info,
  billing: Receipt,
  email: Mail,
  auth: ShieldAlert,
};

const TONE_CLASS = {
  green: "bg-[var(--pale)] text-[var(--accent)]",
  orange: "bg-[var(--orange-wash)] text-[var(--orange)]",
  neutral: "bg-[var(--surface)] text-[var(--muted)]",
} as const;

/**
 * Recent activity from `app_event_logs`, already deduplicated and with
 * repeated integration errors collapsed server-side. There is no standalone
 * activity-log page in the app, so no "View log" action is rendered (per the
 * brief: wire real actions only).
 */
export function RecentActivity({ items }: { items: DashboardActivityItem[] }) {
  return (
    <OverviewPanel>
      <PanelHeader
        icon={ActivityIcon}
        title="Recent activity"
        subtitle="Useful events, not repeated error logs"
      />

      {items.length === 0 ? (
        <p className="py-12 text-center text-[13px] text-[var(--muted)]">
          Events will appear here as they happen.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind];
            const isIntegration = item.kind === "integration";
            return (
              <div
                key={item.id}
                className="group flex items-start gap-3 border-b border-[color:var(--line)] pb-3.5 last:border-b-0 last:pb-0"
              >
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-[10px] transition-transform duration-200 group-hover:scale-105",
                    TONE_CLASS[item.tone],
                  )}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <strong className="block text-[14px] font-medium text-[var(--forest)]">
                    {item.title}
                  </strong>
                  <small className="mt-1 block text-[12px] text-[var(--muted)]">
                    {isIntegration
                      ? `${item.source} · Review in settings`
                      : `${item.source} · ${relativeTimeShort(item.at)}`}
                  </small>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </OverviewPanel>
  );
}
