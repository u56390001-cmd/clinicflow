import { GROWTH_POST_STATUS_META } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { GrowthPostStatus } from "@/types/database";

/**
 * Post status pill. One vocabulary, shared by the queue rows and the editor
 * modal, so a status never means two different colours depending on where you
 * are looking at it — the same rule the visit-status tone map follows.
 */
export function GrowthStatusBadge({
  status,
  className,
}: {
  status: GrowthPostStatus;
  className?: string;
}) {
  const meta = GROWTH_POST_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        meta.badge,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-pill", meta.dot)} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
