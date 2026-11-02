"use client";

/** Shared row-field scaffolding for the three route surfaces. */

import type { ReactNode } from "react";

const GRID =
  "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 items-start";

export const ROW_GRID = GRID;

export function FieldGrid({
  children,
}: {
  children: ReactNode;
}) {
  return <div className={GRID}>{children}</div>;
}

export function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label
      className="block space-y-1.5"
      htmlFor={htmlFor ?? undefined}
    >
      <span className="block text-xs font-medium text-text-muted">
        {label}
        {hint ? (
          <span className="ml-1 font-normal text-text-muted/70">({hint})</span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

export const INPUT_CLASS =
  "h-9 w-full rounded-lg border border-input-border bg-surface px-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus-visible:outline-2 focus-visible:outline-primary/50";
