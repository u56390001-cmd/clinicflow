"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronDown, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The card the prescription builder is written in.
 *
 * One card language for every section, so the page reads as a single document:
 * a 14px radius, a hairline border, and a 13.5px bold title with a 15px accent
 * icon. The shadow is `shadow-sm` rather than the design dump's
 * `0 1px 4px rgba(0,0,0,.05)` — one hairline softer, and it keeps the depth
 * cue without the stack-of-papers effect a visible card shadow gives a form.
 */
export function RxCard({
  icon: Icon,
  title,
  count,
  action,
  className,
  children,
}: {
  icon?: LucideIcon;
  /** Omit for a panel whose fields name themselves — no redundant heading. */
  title?: string;
  /** Rendered as the pill beside the title — the running item count. */
  count?: number;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const hasHeader = Boolean(title) || count !== undefined || Boolean(action);

  return (
    <section className={cn("rounded-[14px] border border-hairline bg-surface px-[22px] py-5 shadow-sm", className)}>
      {hasHeader && (
        <header className="mb-3.5 flex items-center justify-between gap-3">
          <h3 className="flex min-w-0 items-center gap-[7px] text-[14px] font-bold leading-tight text-ink">
            {Icon && (
              <Icon aria-hidden="true" className="size-[15px] shrink-0 text-primary" strokeWidth={1.8} />
            )}
            {title && <span className="truncate">{title}</span>}
            {count !== undefined && (
              <span className="shrink-0 rounded-pill bg-primary/10 px-2 py-[3px] text-[11px] font-semibold leading-none text-primary">
                {count}
              </span>
            )}
          </h3>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * The micro-label above every value in a card: bold, uppercase, wide tracking.
 * Deliberately heavier and wider than the section title's own text — the label is
 * a category, the title is a sentence, and they must not compete.
 *
 * Whole pixels and a pinned line-height, both deliberate. This surface leans on
 * small type, and at fractional sizes (10.5px, 11.5px) the browser rasterises
 * glyphs from a scaled outline: letters round up unevenly and the short ones —
 * a lowercase "i" and its dot most of all — read as visibly larger than their
 * neighbours in the same word. A 1px ladder plus an explicit line box is the
 * only way the label set looks identical in every word.
 */
export const RX_LABEL =
  "text-[12px] font-bold uppercase leading-tight tracking-[0.04em] text-text-secondary";

/**
 * A full-width field on a card: the design's 1.5px border, 10px radius, 10/14
 * padding, 13px type. Borders are hairline at full strength rather than 1.5px
 * because this app's `--border-hairline` already reads as a 1.5px line at this
 * scale, and a second hard-coded width on top of it reads as heavier.
 */
const RX_FIELD =
  "w-full rounded-[10px] border-[1.5px] border-hairline bg-surface px-3.5 py-2.5 text-[13px] text-ink transition-colors placeholder:text-text-muted/70 focus:border-primary focus:outline-none disabled:cursor-default disabled:bg-app disabled:text-text-muted";

/** A labelled field — the card-level input, used by the prescription header. */
export function RxField({
  label,
  required,
  className,
  id,
  ...props
}: {
  label: string;
  required?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={cn("mb-1.5 block", RX_LABEL)}>
        {label}
        {required && (
          <span aria-hidden="true" className="text-status-destructive">
            {" "}
            *
          </span>
        )}
      </label>
      <input id={id} className={cn(RX_FIELD, className)} {...props} />
    </div>
  );
}

/**
 * A cell in the medicines grid. 8px radius, 1px border, 8/10 padding, 12.5px
 * type — the same geometry at every column, so a row of six reads as one
 * continuous strip of inputs.
 */
export const RX_CELL =
  "h-8 w-full min-w-0 rounded-[8px] border border-hairline bg-surface px-2.5 text-[13px] text-ink transition-colors placeholder:text-text-muted/70 focus:border-primary focus:outline-none";

/**
 * A cell that is a choice rather than free text.
 *
 * A native `<select>`, not a custom listbox: the closed state is what the design
 * specifies and is matched exactly here, while the open state stays keyboard
 * navigable, screen-reader labelled and touch-native for free. The one rule that
 * matters is that **the current value is always in the list** — a select that
 * silently omits the value it holds is how a prescription loses a dose, and an
 * OCR-imported strength ("500 mg") will never be in a catalogue of forms.
 */
export function CellSelect({
  value,
  options,
  onValueChange,
  ariaLabel,
  placeholder = "",
  className,
}: {
  value: string;
  options: string[];
  onValueChange: (next: string) => void;
  ariaLabel: string;
  /** A blank leading option — an unset cell must be visibly unset. */
  placeholder?: string;
  /** Wrapper, for sizing. Height and type scale reach the `<select>` by selector. */
  className?: string;
}) {
  const list =
    value && !options.some((option) => option === value) ? [value, ...options] : options;

  return (
    <div className={cn("relative min-w-0", className)}>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(
          RX_CELL,
          "cursor-pointer appearance-none truncate pr-6",
          !value && "text-text-muted",
        )}
      >
        {placeholder && (
          <option value="">{placeholder}</option>
        )}
        {list.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-text-muted"
        strokeWidth={2}
      />
    </div>
  );
}

/**
 * A chosen value, as a chip: accent tint, accent text, 20px radius, with the
 * remove control inside the pill rather than beside it — the pill is one object
 * and its affordances should be inside it.
 */
export function RxTag({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill border border-primary/30 bg-primary/10 py-[5px] pl-3 pr-[6px] text-[13px] font-semibold leading-none text-primary">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="grid size-4 shrink-0 place-items-center rounded-full transition-colors hover:bg-primary/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
      >
        <X className="size-3" strokeWidth={2.5} />
      </button>
    </span>
  );
}

/** The value sets the medicine cells offer. Order is the printed-page order. */
export const MEDICINE_FORMS = [
  "Tablet",
  "Capsule",
  "Syrup",
  "Suspension",
  "Sachet",
  "Injection",
  "IV",
  "IM",
  "SC",
  "Cream",
  "Gel",
  "Ointment",
  "Drops",
  "Nasal Spray",
  "Inhaler",
  "Suppository",
  "Patch",
  "Sublingual",
];

/**
 * Frequencies carry their schedule in the label — "TDS (1-1-1)" is unambiguous
 * on a printed page where a bare "TDS" is not, and it saves the doctor a
 * translation step while writing.
 */
export const MEDICINE_FREQUENCIES = [
  "OD (1-0-0)",
  "BD (1-0-1)",
  "TDS (1-1-1)",
  "QID (1-1-1-1)",
  "Q4H",
  "HS (0-0-0-1)",
  "SOS / PRN",
  "Immediately",
];

export const MEDICINE_INSTRUCTIONS = [
  "After Food",
  "Before Food",
  "With Milk",
  "Empty Stomach",
  "At Bedtime",
  "With Water",
  "As Needed",
];

/** Days, weeks, months — the only three a prescription actually uses. */
export const DURATION_UNITS = ["Days", "Weeks", "Months"];
