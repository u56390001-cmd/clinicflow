/**
 * Small presentational primitives shared by the patient-record tab panels, so
 * every panel reads the same: a headed card, labelled facts, and one empty-state
 * voice instead of five slightly different ones.
 */

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** A titled block inside a tab panel. */
export function RecordSection({
  title,
  meta,
  children,
  className,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-card border border-text-muted/20 bg-surface p-4",
        className,
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-secondary">{title}</h3>
        {meta}
      </div>
      {children}
    </section>
  );
}

/** `LABEL` above a value. Renders an em dash when there is nothing on file. */
export function RecordFact({
  label,
  children,
  className,
}: {
  label: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const empty =
    children === null ||
    children === undefined ||
    children === "" ||
    children === false;
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-sm",
          empty ? "text-text-muted" : "text-text-primary",
        )}
      >
        {empty ? "—" : children}
      </dd>
    </div>
  );
}

/**
 * In-panel empty state. Lighter than `components/ui/empty-state` (no card of
 * its own) because tab panels are already inside the record surface.
 */
export function RecordEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-card border border-dashed border-text-muted/30 px-6 py-8 text-center">
      <span className="mx-auto mb-3 flex size-9 items-center justify-center rounded-pill bg-app">
        <Icon
          aria-hidden="true"
          className="size-[18px] text-text-secondary"
          strokeWidth={2}
        />
      </span>
      <p className="text-sm font-medium text-text-primary">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
        {description}
      </p>
    </div>
  );
}

/** Free-text clinical note. Preserves the line breaks the doctor typed. */
export function RecordNote({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value?.trim()) return null;
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-text-primary">
        {value}
      </p>
    </div>
  );
}
