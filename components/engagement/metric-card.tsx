import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type MetricCardProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  /** Right-aligned action (e.g. the "log review" button). */
  action?: React.ReactNode;
};

/**
 * The four stat tiles above the Engagement tabs. Numbers are server-computed
 * from the engagement/review tables — never mocked — so the circles the design
 * drew as decorative value pills are real readouts here.
 */
export function MetricCard({ icon: Icon, label, value, sub, action }: MetricCardProps) {
  return (
    <div className="rounded-card border border-hairline bg-surface p-4 shadow-card transition-shadow hover:shadow-dropdown">
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-control bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </div>
        {action}
      </div>
      <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p className={cn("mt-1 text-[26px] font-bold leading-none tracking-tight text-text-primary")}>
        {value}
      </p>
      <p className="mt-1.5 text-xs text-text-secondary">{sub}</p>
    </div>
  );
}