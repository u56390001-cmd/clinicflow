"use client";

import { useId } from "react";
import { Settings2 } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { labPanelParameters } from "@/lib/lab-panels";
import { cn } from "@/lib/utils";

/**
 * The gear on a panel chip: pick which parameters of a panel are actually
 * being ordered.
 *
 * The chip's label alone cannot say this. "CBC" and "CBC, platelets and ESR
 * only" are different investigations and the patient is billed per parameter,
 * so the narrowest version of the panel has to be recordable without renaming
 * the test.
 *
 * Rendered as a bare gear rather than a shadcn `Button` because it lives inside
 * a pill-sized chip, and the checkbox rows below match the native
 * `accent-primary` checkboxes of the Past Medicines list above — the doctor
 * ticks rows in two lists a few centimetres apart and they should look like one
 * control.
 */
export function LabSubParameterPopover({
  testName,
  selected,
  onChange,
}: {
  testName: string;
  /** The order's current narrowing; empty or absent means the whole panel. */
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const parameters = labPanelParameters(testName);
  const groupId = useId();

  // A test with no standard breakdown (TSH, Dengue NS1, an ultrasound) has
  // nothing to narrow, so the trigger is never rendered. Inventing a checklist
  // for it would imply a structure the lab does not bill against.
  if (!parameters) return null;

  // An absent/empty list is how a whole-panel order is stored, so it has to
  // open as a fully ticked checklist. Reading `[]` as "nothing ticked" would
  // show a CBC the doctor ordered in full as an empty list of tests, and the
  // only way back would be to re-tick five rows.
  const chosen = new Set(selected.length > 0 ? selected : parameters);
  const allSelected = parameters.every((name) => chosen.has(name));

  const toggle = (parameter: string, checked: boolean) => {
    if (checked) {
      // Re-added in the panel's own order, so the same set of ticks always
      // serialises to the same string and the chip label does not reorder
      // itself between saves.
      onChange(
        parameters.filter((name) => name === parameter || chosen.has(name)),
      );
      return;
    }
    const next = parameters.filter(
      (name) => name !== parameter && chosen.has(name),
    );
    // The last remaining tick is not removable. "CBC with nothing selected" is
    // not an order, and clearing the array would silently widen the order back
    // to the full panel — the chip would read "CBC" and mean something the
    // doctor never chose. "Select All" is the way back to the full panel.
    if (next.length > 0) onChange(next);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Choose which ${testName} parameters to order`}
          className="rounded-pill p-0.5 text-text-muted transition-colors hover:bg-hairline hover:text-primary focus-visible:shadow-focus-ring"
        >
          <Settings2 className="size-3" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="flex flex-col">
          <p className="border-b border-hairline px-3 py-2 text-[11px] font-semibold text-text-secondary">
            {testName} parameters
          </p>

          <label
            htmlFor={`${groupId}-all`}
            className="flex cursor-pointer items-center gap-2.5 border-b border-hairline-soft px-3 py-2 transition-colors hover:bg-app"
          >
            <input
              type="checkbox"
              id={`${groupId}-all`}
              checked={allSelected}
              onChange={(event) =>
                // Unticking cannot clear the list, because an empty list *is*
                // the full panel — it would tick itself straight back on. It
                // narrows to the panel's first parameter instead, which is the
                // narrowest order the checklist allows.
                onChange(
                  event.target.checked
                    ? [...parameters]
                    : parameters.slice(0, 1),
                )
              }
              className="size-3.5 shrink-0 accent-primary"
            />
            <span className="text-ink min-w-0 flex-1 text-[13px] font-semibold">
              Select All
            </span>
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted">
              Full
            </span>
          </label>

          <div className="flex flex-col py-1">
            {parameters.map((parameter) => {
              const id = `${groupId}-${parameter}`;
              return (
                <label
                  key={parameter}
                  htmlFor={id}
                  className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 transition-colors hover:bg-app"
                >
                  <input
                    type="checkbox"
                    id={id}
                    checked={chosen.has(parameter)}
                    onChange={(event) =>
                      toggle(parameter, event.target.checked)
                    }
                    className="size-3.5 shrink-0 accent-primary"
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[12px]",
                      chosen.has(parameter)
                        ? "text-ink font-medium"
                        : "text-text-muted",
                    )}
                  >
                    {parameter}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
