import type { LucideIcon } from "lucide-react";
import { Activity, Scissors, ShieldAlert, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * One feedable count: the number that drives a cell's metric ("2 Active") and the
 * names that go with it. `tags` is empty when there is nothing on file, and the
 * cell then says so in a muted voice rather than inventing an example.
 */
export type HistorySummaryCount = {
  count: number;
  tags: string[];
};

/**
 * Everything the ribbon needs. The History tab decides what each number means
 * (chronic conditions, past surgeries, family risk factors, unverified entries)
 * and passes the cell its real count and the real names.
 */
export type HistorySummaryProps = {
  chronicConditions: HistorySummaryCount;
  pastSurgeries: HistorySummaryCount;
  criticalRisks: HistorySummaryCount;
  pendingApproval: HistorySummaryCount;
};

/** The four cells are the same shape — only the accent colour differs. */
type RibbonCell = HistorySummaryCount & {
  key: string;
  icon: LucideIcon;
  iconBox: string;
  title: string;
  metricLabel: string;
  /** Accent for a non-zero count. A zero count is always muted. */
  metricClass: string;
};

const NO_ENTRIES = "Nothing on file";

/**
 * HistorySummaryRibbon — the four-figure summary that opens the History tab.
 *
 * One panel with four figures divided by hairlines, rather than four separate
 * cards. This used to be four `rounded-xl p-5` tiles that lifted on hover, and
 * between them they spent more vertical space than the first two real history
 * entries did. A number that is read, not browsed, does not need a hover state
 * and does not need to be a surface of its own: the figures belong to one
 * sentence ("what is on file about this person"), so they share one container and
 * the border between them does the separating. Density is the whole point of a
 * ribbon.
 */
export function HistorySummaryRibbon({
  chronicConditions,
  pastSurgeries,
  criticalRisks,
  pendingApproval,
}: HistorySummaryProps) {
  const cells: RibbonCell[] = [
    {
      ...chronicConditions,
      key: "conditions",
      icon: Activity,
      iconBox: "bg-primary-tint text-primary",
      title: "Chronic Conditions",
      metricLabel: "Active",
      metricClass: "text-ink",
    },
    {
      ...pastSurgeries,
      key: "surgeries",
      icon: Scissors,
      iconBox: "bg-hairline-soft text-text-secondary",
      title: "Past Surgeries",
      metricLabel: "Major",
      metricClass: "text-ink",
    },
    {
      ...criticalRisks,
      key: "risks",
      icon: ShieldAlert,
      iconBox: "bg-status-destructive/10 text-status-destructive",
      title: "Family Risk Factors",
      metricLabel: "Factors",
      metricClass: "text-status-destructive",
    },
    {
      ...pendingApproval,
      key: "pending",
      icon: Sparkles,
      iconBox: "bg-status-warning/10 text-status-warning",
      title: "Pending Approval",
      metricLabel: "Items",
      metricClass: "text-status-warning",
    },
  ];

  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-panel border border-hairline bg-chip md:grid-cols-4">
      {cells.map((cell, index) => {
        const Icon = cell.icon;
        const zero = cell.count === 0;
        return (
          <div
            key={cell.key}
            // Divided rather than individually bordered: a hairline on the left
            // of every cell but the first, dropping to a hairline on top once
            // the grid stacks to two columns.
            className={cn(
              "flex flex-col gap-1.5 p-3",
              index % 2 === 1 && "border-l border-hairline",
              index >= 2 && "border-t border-hairline md:border-t-0",
              index === 2 && "md:border-l-0",
              index === 3 && "md:border-l",
            )}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-[5px]",
                  cell.iconBox,
                )}
              >
                <Icon
                  aria-hidden="true"
                  className="size-3"
                  strokeWidth={2.25}
                />
              </span>
              <p className="text-[11px] font-medium leading-tight text-text-muted">
                {cell.title}
              </p>
            </div>

            <p
              className={cn(
                "text-[15px] font-bold leading-none",
                zero ? "text-ink-faint" : cell.metricClass,
              )}
            >
              {cell.count}
              <span className="ml-1 text-[11px] font-medium text-text-muted">
                {cell.metricLabel}
              </span>
            </p>

            {cell.tags.length > 0 ? (
              /* Names wrap instead of truncating: a doctor deciding whether the
                 figure is trustworthy needs to see the conditions, and
                 "Diabetic, COPD, Hyp…" answers nothing. Two lines is the cap
                 before it stops being a summary. */
              <p className="line-clamp-2 text-[11px] leading-snug text-text-muted">
                {cell.tags.join(", ")}
              </p>
            ) : (
              <p className="text-ink-faint text-[11px] leading-snug">
                {NO_ENTRIES}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
