"use client";

/** Topical field surface: site, vehicle, amount (FTU), frequency, duration, wash-off. */

import { Field, FieldGrid, INPUT_CLASS } from "./field-grid";
import { DurationPicker } from "../fields/duration-picker";
import { FrequencyPicker } from "../fields/frequency-picker";
import { SitePicker } from "../fields/site-picker";
import { DoseInput } from "../fields/dose-input";
import type { RxStrength } from "../schema/rx-item";
import type { RxItemTopical } from "./rx-item-view";

const VEHICLES = ["Cream", "Ointment", "Gel", "Lotion", "Foam", "Solution", "Shampoo", "Lotion/Spray"] as const;

export function TopicalFields({
  item,
  lesionSites,
  onChange,
  strengthPresets,
}: {
  item: RxItemTopical;
  lesionSites: string[];
  onChange: (patch: Partial<RxItemTopical>) => void;
  strengthPresets?: string[];
}) {
  return (
    <FieldGrid>
      <Field label="Site (Pin / body area)">
        <SitePicker
          value={item.sites}
          options={lesionSites}
          onChange={(sites) => onChange({ sites })}
        />
      </Field>
      <Field label="Vehicle">
        <select
          value={item.form ?? ""}
          onChange={(event) => onChange({ form: event.target.value || undefined })}
          className={INPUT_CLASS}
        >
          <option value="">Select</option>
          {VEHICLES.map((vehicle) => (
            <option key={vehicle} value={vehicle}>
              {vehicle}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Amount (FTU / g)" hint="pay-in free text">
        <input
          type="text"
          value={item.amount ?? ""}
          onChange={(event) =>
            onChange({ amount: event.target.value || undefined })
          }
          placeholder="1 FTU"
          className={INPUT_CLASS}
        />
      </Field>
      <Field label="Strength" hint="e.g. 0.05%">
        <DoseInput
          value={item.strength}
          presets={strengthPresets}
          onChange={(strength: RxStrength | undefined) => onChange({ strength })}
        />
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
      <Field label="Wash-off (minutes)" hint="AC/retinoids">
        <input
          type="number"
          min={0}
          max={240}
          value={item.washOffMin ?? ""}
          onChange={(event) =>
            onChange({
              washOffMin: event.target.value ? Number(event.target.value) : undefined,
            })
          }
          className={INPUT_CLASS}
        />
      </Field>
    </FieldGrid>
  );
}
