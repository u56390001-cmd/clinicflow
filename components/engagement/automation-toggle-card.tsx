import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

type AutomationToggleCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Small print under the switch, e.g. "Writes the clinic's auto-receipt column". */
  footnote?: string;
};

/**
 * The compact one-row toggle cards (Prescription / Receipt / Check-in): an
 * icon tile, a one-line description, and the persisted on/off switch.
 */
export function AutomationToggleCard({
  icon: Icon,
  title,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  footnote,
}: AutomationToggleCardProps) {
  return (
    <div className="rounded-card border border-hairline bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
            <Icon className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
            <p className="mt-0.5 text-xs text-text-secondary">{description}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <Badge variant={checked ? "success" : "default"}>{checked ? "Active" : "Inactive"}</Badge>
          <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
        </div>
      </div>
      {footnote && (
        <p className="mt-3 border-t border-hairline pt-3 text-xs text-text-muted">{footnote}</p>
      )}
    </div>
  );
}