"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MedicineEntry as MedicineEntryType } from "@/types/database";

/**
 * A single medicine row in the prescription form. Uses the design system's
 * prescriptionGrid: 3fr 2fr 2fr 1.5fr 2fr auto.
 */
export function MedicineEntry({
  index,
  medicine,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  medicine: MedicineEntryType;
  onChange: (index: number, field: keyof MedicineEntryType, value: string) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}) {
  const id = `medicine-${index}`;

  return (
    <div className="grid grid-cols-[3fr_2fr_2fr_1.5fr_2fr_auto] items-end gap-2">
      <div className="space-y-1">
        {index === 0 && (
          <Label htmlFor={`${id}-name`} className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Medicine
          </Label>
        )}
        <Input
          id={`${id}-name`}
          value={medicine.name}
          onChange={(e) => onChange(index, "name", e.target.value)}
          placeholder="e.g. Amoxicillin"
        />
      </div>

      <div className="space-y-1">
        {index === 0 && (
          <Label htmlFor={`${id}-route`} className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Route / Form
          </Label>
        )}
        <Input
          id={`${id}-route`}
          value={`${medicine.route}${medicine.form ? ` / ${medicine.form}` : ""}`}
          onChange={(e) => {
            const parts = e.target.value.split("/");
            onChange(index, "route", parts[0]?.trim() ?? "");
            onChange(index, "form", parts[1]?.trim() ?? "");
          }}
          placeholder="e.g. Oral / Tablet"
        />
      </div>

      <div className="space-y-1">
        {index === 0 && (
          <Label htmlFor={`${id}-frequency`} className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Frequency
          </Label>
        )}
        <Input
          id={`${id}-frequency`}
          value={medicine.frequency}
          onChange={(e) => onChange(index, "frequency", e.target.value)}
          placeholder="e.g. 3x daily"
        />
      </div>

      <div className="space-y-1">
        {index === 0 && (
          <Label htmlFor={`${id}-duration`} className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Duration
          </Label>
        )}
        <Input
          id={`${id}-duration`}
          value={medicine.duration}
          onChange={(e) => onChange(index, "duration", e.target.value)}
          placeholder="e.g. 7 days"
        />
      </div>

      <div className="space-y-1">
        {index === 0 && (
          <Label htmlFor={`${id}-instructions`} className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Instructions
          </Label>
        )}
        <Input
          id={`${id}-instructions`}
          value={medicine.instructions}
          onChange={(e) => onChange(index, "instructions", e.target.value)}
          placeholder="e.g. After meals"
        />
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 text-text-muted hover:text-status-destructive"
        disabled={!canRemove}
        onClick={() => onRemove(index)}
        aria-label={`Remove medicine ${index + 1}`}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
