"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LabOrder as LabOrderType } from "@/types/database";

/**
 * A single lab order row in the prescription form.
 */
export function LabOrderEntry({
  index,
  order,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  order: LabOrderType;
  onChange: (index: number, field: keyof LabOrderType, value: string) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}) {
  const id = `lab-${index}`;

  return (
    <div className="grid grid-cols-[2fr_3fr_auto] items-end gap-2">
      <div className="space-y-1">
        {index === 0 && (
          <Label htmlFor={`${id}-name`} className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Test Name
          </Label>
        )}
        <Input
          id={`${id}-name`}
          value={order.test_name}
          onChange={(e) => onChange(index, "test_name", e.target.value)}
          placeholder="e.g. CBC, Blood Sugar"
        />
      </div>

      <div className="space-y-1">
        {index === 0 && (
          <Label htmlFor={`${id}-notes`} className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Notes
          </Label>
        )}
        <Input
          id={`${id}-notes`}
          value={order.notes}
          onChange={(e) => onChange(index, "notes", e.target.value)}
          placeholder="e.g. Fasting required"
        />
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 text-text-muted hover:text-status-destructive"
        disabled={!canRemove}
        onClick={() => onRemove(index)}
        aria-label={`Remove lab order ${index + 1}`}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
