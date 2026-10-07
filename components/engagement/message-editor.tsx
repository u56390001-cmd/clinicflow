"use client";

import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const ENGAGEMENT_VARIABLES = [
  "patient_name",
  "doctor_name",
  "clinic_name",
  "clinic_location",
  "appointment_date",
  "appointment_time",
] as const;

type MessageEditorProps = {
  value: string;
  baseValue: string;
  onValueChange: (value: string) => void;
  onSave: () => void;
  saving?: boolean;
  /** Variable tokens offered as one-tap insert chips. */
  variables?: readonly string[];
  maxLength?: number;
  disabled?: boolean;
  placeholder?: string;
};

const DEFAULT_MAX = 2000;

/**
 * The shared WhatsApp message composer used by every template card. Keeps a
 * focused draft textarea plus the design's variable chips; the parent owns the
 * draft so it can live-preview the phone bubble while the user types.
 */
export function MessageEditor({
  value,
  baseValue,
  onValueChange,
  onSave,
  saving = false,
  variables = ENGAGEMENT_VARIABLES,
  maxLength = DEFAULT_MAX,
  disabled = false,
  placeholder = "Type your message…",
}: MessageEditorProps) {
  const length = value.length;
  const overLimit = length > maxLength;
  const unchanged = value === baseValue;
  const canSave = !disabled && !saving && !overLimit && value.trim().length > 0 && !unchanged;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-control border bg-surface transition-colors",
        "focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30",
        overLimit ? "border-status-destructive" : "border-hairline",
      )}
    >
      <Textarea
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        maxLength={maxLength + 200}
        placeholder={placeholder}
        disabled={disabled || saving}
        rows={6}
        className="resize-y rounded-none border-0 bg-transparent text-sm leading-relaxed shadow-none focus-visible:ring-0 disabled:opacity-100"
      />

      {variables.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-hairline px-3 py-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Insert variable
          </span>
          {variables.map((variable) => (
            <button
              key={variable}
              type="button"
              disabled={disabled}
              onClick={() => onValueChange(`${value}{${variable}}`)}
              className="inline-flex items-center rounded-pill bg-skeleton px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {"{"}
              {variable}
              {"}"}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-hairline bg-skeleton/40 px-3 py-2">
        <span
          className={cn(
            "text-xs tabular-nums",
            overLimit ? "font-semibold text-status-destructive" : "text-text-muted",
          )}
        >
          {length}/{maxLength}
        </span>
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={!canSave}
          onClick={onSave}
          className="min-w-[96px]"
        >
          {saving ? (
            "Saving…"
          ) : overLimit ? (
            "Over limit"
          ) : canSave ? (
            <>
              <Check className="size-4" aria-hidden="true" />
              Save Changes
            </>
          ) : (
            "Saved"
          )}
        </Button>
      </div>
    </div>
  );
}