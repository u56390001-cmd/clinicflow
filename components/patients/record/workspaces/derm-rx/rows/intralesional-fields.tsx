"use client";

/** Intralesional surface: drug concentration, volume per lesion, site, repeat interval. */

import { Field, FieldGrid, INPUT_CLASS } from "./field-grid";
import { DurationPicker } from "../fields/duration-picker";
import { FrequencyPicker } from "../fields/frequency-picker";
import { SitePicker } from "../fields/site-picker";
import type { RxItemIntralesional } from "./rx-item-view";

export function IntralesionalFields({
  item,
  lesionSites,
  onChange,
}: {
  item: RxItemIntralesional;
  lesionSites: string[];
  onChange: (patch: Partial<RxItemIntralesional>) => void;
}) {
  return (
    <FieldGrid>
      <Field label="Concentration" hint="e.g. 10 mg/mL">
        <input
          type="text"
          value={item.concentration ?? ""}
          onChange={(event) =>
            onChange({ concentration: event.target.value || undefined })
          }
          placeholder="10 mg/mL"
          className={INPUT_CLASS}
        />
      </Field>
      <Field label="Volume per lesion (mL)">
        <input
          type="number"
          min={0}
          step={0.05}
          value={item.volumeMl ?? ""}
          onChange={(event) =>
            onChange({
              volumeMl: event.target.value ? Number(event.target.value) : undefined,
            })
          }
          className={INPUT_CLASS}
        />
      </Field>
      <Field label="Site (Pin)">
        <SitePicker
          value={item.sites}
          options={lesionSites}
          onChange={(sites) => onChange({ sites })}
        />
      </Field>
      <Field label="Repeat interval (days)">
        <input
          type="number"
          min={1}
          max={180}
          value={item.repeatIntervalDays ?? ""}
          onChange={(event) =>
            onChange({
              repeatIntervalDays: event.target.value
                ? Number(event.target.value)
                : undefined,
            })
          }
          className={INPUT_CLASS}
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
    </FieldGrid>
  );
}
