"use client";

/** Oral field surface: strength, food timing, frequency, duration. */

import { Field, FieldGrid, INPUT_CLASS } from "./field-grid";
import { DoseInput } from "../fields/dose-input";
import { DurationPicker } from "../fields/duration-picker";
import { FrequencyPicker } from "../fields/frequency-picker";
import type { RxStrength } from "../schema/rx-item";
import type { RxItemOral } from "./rx-item-view";

const FOOD_OPTIONS = [
  { value: "", label: "No food rule" },
  { value: "before", label: "Before meals" },
  { value: "after", label: "After meals" },
  { value: "with", label: "With meals" },
] as const;

export function OralFields({
  item,
  onChange,
  strengthPresets,
}: {
  item: RxItemOral;
  onChange: (patch: Partial<RxItemOral>) => void;
  strengthPresets?: string[];
}) {
  return (
    <FieldGrid>
      <Field label="Strength" hint="e.g. 2.5 mg">
        <DoseInput
          value={item.strength}
          presets={strengthPresets}
          onChange={(strength: RxStrength | undefined) => onChange({ strength })}
        />
      </Field>
      <Field label="Food timing">
        <select
          value={item.foodTiming ?? ""}
          onChange={(event) =>
            onChange({
              foodTiming:
                (event.target.value as "" | "before" | "after" | "with") ||
                undefined,
            })
          }
          className={INPUT_CLASS}
        >
          {FOOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Frequency">
        <FrequencyPicker
          value={item.frequency}
          onChange={(frequency) => onChange({ frequency })}
        />
      </Field>
      <Field label="Duration">
        <DurationPicker
          value={item.duration}
          onChange={(duration) => onChange({ duration })}
        />
      </Field>
    </FieldGrid>
  );
}
