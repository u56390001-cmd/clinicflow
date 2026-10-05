"use client";

import { useId } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Form primitives for the website builder.
 *
 * The app's own form components (`Input`, `Textarea`, `Switch`) are reused
 * directly; what lives here is only the label + hint + error wrapper the
 * builder repeats ~60 times, plus the two composite controls the design calls
 * for and no stock component covers: a segmented picker and a removable chip
 * list. Every field renders a real `<label for>` and describes itself with
 * `aria-describedby`, so the inspector is navigable by keyboard and read
 * correctly by a screen reader.
 */

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: (props: { id: string; describedBy?: string }) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-xs font-medium text-text-secondary">
        {label}
      </label>
      {children({ id, describedBy: hintId })}
      {hint ? (
        <p id={hintId} className="text-[11px] leading-snug text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Multi-line variant with an optional character budget readout. */
export function LongTextField({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  maxLength,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  hint?: string;
}) {
  const over = maxLength ? value.length > maxLength * 0.95 : false;
  return (
    <Field label={label} hint={hint}>
      {({ id, describedBy }) => (
        <div className="flex flex-col gap-1">
          <Textarea
            id={id}
            aria-describedby={describedBy}
            value={value}
            rows={rows}
            maxLength={maxLength}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
          />
          {maxLength ? (
            <p
              className={cn(
                "self-end text-[11px] tabular-nums",
                over ? "text-status-warning" : "text-text-muted",
              )}
            >
              {value.length}/{maxLength}
            </p>
          ) : null}
        </div>
      )}
    </Field>
  );
}

export function TextField({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  maxLength,
  hint,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  hint?: string;
  type?: "text" | "url" | "number";
}) {
  return (
    <Field label={label} hint={hint}>
      {({ id, describedBy }) => (
        <Input
          id={id}
          type={type}
          aria-describedby={describedBy}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onBlurCapture={(event) => {
            if (onBlur) onBlur((event.target as HTMLInputElement).value);
          }}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

/**
 * A labelled on/off row.
 *
 * Uses the project's `Switch` rather than a checkbox so the inspector matches
 * every other settings surface in the app.
 */
export function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-0.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {description ? (
          <p className="mt-0.5 text-[11px] leading-snug text-text-muted">
            {description}
          </p>
        ) : null}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
        className="mt-0.5"
      />
    </div>
  );
}

/**
 * Segmented single-choice control.
 *
 * Used wherever the options are 2–5 short labels (corner style, alignment,
 * language). A row of buttons beats a `<select>` here because every option stays
 * visible, and it beats a radio group because it takes a third of the height in
 * a panel the doctor is scrolling through.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      {({ id, describedBy }) => (
        <div
          id={id}
          role="radiogroup"
          aria-label={label}
          aria-describedby={describedBy}
          className="flex gap-1 rounded-control bg-app p-1"
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange(option.value)}
                className={cn(
                  "flex-1 rounded-control px-2 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-surface text-text-primary shadow-card"
                    : "text-text-muted hover:text-text-secondary",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </Field>
  );
}

/** Colour swatch plus the hex value, both editable. */
export function ColorField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  hint?: string;
}) {
  const valid = /^#[0-9A-Fa-f]{6}$/.test(value);

  return (
    <Field label={label} hint={hint}>
      {({ id, describedBy }) => (
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={`${label} swatch`}
            value={valid ? value : "#0D9488"}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            className="size-9 shrink-0 cursor-pointer rounded-control border border-text-muted/40 bg-surface p-0.5"
          />
          <Input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={!valid}
            value={value}
            maxLength={7}
            spellCheck={false}
            onChange={(event) => onChange(event.target.value)}
            className="font-mono text-xs uppercase"
          />
        </div>
      )}
    </Field>
  );
}

/**
 * Removable chip list with an add field.
 *
 * Backs certifications, facilities and stat rows. Enter adds, so the whole list
 * can be typed without leaving the keyboard; the remove button is a real
 * button with an accessible name rather than a bare "×".
 */
export function ChipList({
  label,
  values,
  onChange,
  placeholder,
  hint,
  max = 20,
  maxLength = 120,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  hint?: string;
  max?: number;
  maxLength?: number;
}) {
  const id = useId();
  const full = values.length >= max;

  return (
    <Field
      label={label}
      hint={
        hint
          ? full
            ? `Maximum ${max} reached. Remove one to add another.`
            : hint
          : full
            ? `Maximum ${max} reached. Remove one to add another.`
            : "Press Enter to add."
      }
    >
      {({ describedBy }) => (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              id={id}
              aria-describedby={describedBy}
              disabled={full}
              maxLength={maxLength}
              placeholder={placeholder}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                const value = event.currentTarget.value.trim();
                if (!value) return;
                if (values.some((entry) => entry.toLowerCase() === value.toLowerCase())) {
                  event.currentTarget.select();
                  return;
                }
                onChange([...values, value]);
                event.currentTarget.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={full}
              onClick={() => {
                const input = document.getElementById(id) as HTMLInputElement | null;
                const value = input?.value.trim() ?? "";
                if (!value) return;
                if (values.some((entry) => entry.toLowerCase() === value.toLowerCase())) return;
                onChange([...values, value]);
                if (input) input.value = "";
              }}
            >
              Add
            </Button>
          </div>
          {values.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {values.map((value, index) => (
                <li
                  key={`${value}-${index}`}
                  className="flex items-center gap-1 rounded-pill border border-text-muted/25 bg-app py-0.5 pe-1 ps-2.5 text-xs text-text-secondary"
                >
                  {value}
                  <button
                    type="button"
                    onClick={() => onChange(values.filter((_, i) => i !== index))}
                    aria-label={`Remove ${value}`}
                    className="flex size-4 items-center justify-center rounded-pill text-text-muted transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </Field>
  );
}

/** Group heading inside the inspector. */
export function InspectorGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-b border-text-muted/20 px-4 py-4 last:border-b-0">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-[11px] leading-snug text-text-muted">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/**
 * Notice for a section whose content comes from ClinicFlow rather than free
 * text. Naming the page that edits it is the whole point — otherwise a doctor
 * hunts through the builder for a field that was never there.
 */
export function LiveDataNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-control border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-text-secondary">
      <span className="font-medium text-primary">Comes from ClinicFlow. </span>
      {children}
    </div>
  );
}
