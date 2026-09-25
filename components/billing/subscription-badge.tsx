import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SUBSCRIPTION_STATUS_META } from "@/lib/constants";
import type { SubscriptionStatus } from "@/types/database";

interface SubscriptionBadgeProps {
  status: SubscriptionStatus;
  planName?: string;
}

export function SubscriptionBadge({ status, planName }: SubscriptionBadgeProps) {
  const meta = SUBSCRIPTION_STATUS_META[status] ?? {
    label: status,
    badge: "bg-slate-100 text-slate-700 ring-slate-500/20",
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge className={cn("text-xs", meta.badge)}>{meta.label}</Badge>
      {planName && (
        <span className="text-xs text-text-muted">{planName}</span>
      )}
    </span>
  );
}
