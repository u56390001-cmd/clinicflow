"use client";

/** Lab test combobox — app menu + clinic custom registry + in-place registration. */

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";

import { COMMON_LAB_TESTS } from "./lab-data";

export function LabTestCombobox({
  id,
  value,
  existingNames,
  customTests,
  onAddCustom,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  /** Test names already on this Rx — re-selecting them is blocked. */
  existingNames: string[];
  customTests: string[];
  onAddCustom: (name: string) => Promise<boolean>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const query = value.trim();
  const lowerQuery = query.toLowerCase();
  const all = [
    ...COMMON_LAB_TESTS.map((t) => ({ name: t.name, group: t.group })),
    ...customTests.map((name) => ({ name, group: "Custom" })),
  ];
  const matches = lowerQuery
    ? all.filter((test) => test.name.toLowerCase().includes(lowerQuery))
    : all;
  const alreadyOrdered = existingNames.some(
    (name) => name.trim().toLowerCase() === lowerQuery,
  );
  const noExactMenuMatch =
    query.length > 0 &&
    !all.some((test) => test.name.toLowerCase() === lowerQuery) &&
    !alreadyOrdered;

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        autoComplete="off"
        disabled={disabled}
        placeholder="Search or type a test…"
        className="border-input-border"
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-[min(26rem,100%)] overflow-y-auto rounded-xl border border-hairline bg-surface py-1 shadow-lg"
        >
          {matches.map((test) => (
            <li key={test.name} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  if (
                    existingNames.some(
                      (n) => n.toLowerCase() === test.name.toLowerCase(),
                    )
                  ) {
                    toast.info(`"${test.name}" is already ordered.`);
                    setOpen(false);
                    return;
                  }
                  onChange(test.name);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-text-muted transition-colors hover:bg-app hover:text-primary"
              >
                <span className="truncate">{test.name}</span>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-text-muted/70">
                  {test.group}
                </span>
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-3 py-1.5 text-xs text-text-muted">
              No saved test matches “{query}”.
            </li>
          )}
          {noExactMenuMatch && (
            <li className="border-t border-hairline">
              <button
                type="button"
                disabled={adding || disabled}
                onMouseDown={async (event) => {
                  event.preventDefault();
                  setAdding(true);
                  const okFlag = await onAddCustom(query);
                  setAdding(false);
                  if (okFlag) setOpen(false);
                }}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-primary hover:bg-primary/10"
              >
                <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                {adding
                  ? `Saving "${query}"…`
                  : `Add “${query}” as a custom test (clinic registry)`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
