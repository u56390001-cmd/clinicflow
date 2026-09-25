import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Shared empty-state block for list screens (appointments, patients,
 * services, team). One visual language everywhere: icon, title, description
 * and an optional call-to-action.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center py-10 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-pill bg-primary/10">
          <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="mt-1 max-w-sm text-sm text-text-secondary">{description}</p>
        {actionLabel && onAction ? (
          <Button className="mt-4" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
