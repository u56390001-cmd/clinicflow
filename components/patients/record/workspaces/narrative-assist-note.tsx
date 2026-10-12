"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlignLeft, Check, Loader2, Sparkles, TriangleAlert, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { Button } from "@/components/ui/button";
import { VoiceInputButton } from "@/components/patients/record/workspaces/voice-input-button";
import {
  assistPsychIntakeAction,
  type IntakeAssistKind,
} from "@/lib/actions/specialty-workspaces";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved" | "error";

const ASSIST_ACTIONS: Array<{
  kind: IntakeAssistKind;
  label: string;
  icon: typeof Sparkles;
}> = [
  { kind: "draft", label: "AI draft", icon: Sparkles },
  { kind: "improve", label: "Improve", icon: Wand2 },
  { kind: "summarize", label: "Summarise", icon: AlignLeft },
];

/**
 * A narrative intake field that saves on blur and carries a clinical writing
 * toolbar: dictate, or let the assistant draft, improve or summarise the text.
 * The assistant rides on the shared Gemini provider; the note itself persists
 * through the caller's `onSave`, exactly like `AutosaveNote`.
 */
export function NarrativeAssistNote({
  label,
  name,
  value,
  onSave,
  fieldLabel,
  placeholder,
  helper,
  rows = 4,
  disabled = false,
}: {
  label: string;
  name: string;
  value?: string | null;
  onSave: (next: string) => Promise<boolean>;
  fieldLabel: string;
  placeholder?: string;
  helper?: string;
  rows?: number;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value ?? "");
  const [state, setState] = useState<SaveState>("idle");
  const [assistBusy, setAssistBusy] = useState<IntakeAssistKind | null>(null);
  const persisted = useRef(value ?? "");

  useEffect(() => {
    setText(value ?? "");
    persisted.current = value ?? "";
  }, [value]);

  const persist = useCallback(
    async (next: string) => {
      const trimmed = next.trim();
      if (persisted.current === trimmed) return;
      setState("saving");
      const ok = await onSave(trimmed);
      if (ok) {
        persisted.current = trimmed;
        setState("saved");
      } else {
        setState("error");
      }
    },
    [onSave],
  );

  function handleBlur() {
    void persist(text);
  }

  function handleDictate(recognised: string) {
    const next = text.trim() ? `${text.trim()} ${recognised}` : recognised;
    setText(next);
    void persist(next);
  }

  async function runAssist(kind: IntakeAssistKind) {
    if (disabled) return;
    setAssistBusy(kind);
    const result = await assistPsychIntakeAction({ kind, fieldLabel, text });
    setAssistBusy(null);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setText(result.data);
    void persist(result.data);
  }

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={name} className="text-ink text-[12.5px] font-bold">
          {label}
        </label>
        <div className="flex items-center gap-2">
          {state === "saving" && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-text-muted">
              <Loader2 aria-hidden="true" className="size-3 animate-spin" />
              Saving
            </span>
          )}
          {state === "error" && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-status-destructive">
              <TriangleAlert aria-hidden="true" className="size-3" />
              Not saved
            </span>
          )}
          {state === "saved" && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
              <Check aria-hidden="true" className="size-3" />
              Saved
            </span>
          )}
          {!disabled && (
            <VoiceInputButton
              onTranscript={handleDictate}
              label="Voice to note"
            />
          )}
        </div>
      </div>

      <AutoGrowTextarea
        id={name}
        name={name}
        rows={rows}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onBlur={handleBlur}
        className={cn(
          "w-full resize-none rounded-control border border-text-muted/25 bg-surface p-2.5 text-[12.5px] leading-relaxed text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-primary/60 focus:ring-2 focus:ring-primary/15",
          state === "error" && "border-status-destructive",
          disabled && "cursor-default opacity-80",
        )}
      />

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {ASSIST_ACTIONS.map(({ kind, label: actionLabel, icon: Icon }) => (
          <Button
            key={kind}
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || assistBusy !== null}
            onClick={() => void runAssist(kind)}
            className="h-7 gap-1.5 px-2 text-[11.5px] text-text-secondary hover:text-primary"
          >
            {assistBusy === kind ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <Icon aria-hidden="true" className="size-3.5" />
            )}
            {actionLabel}
          </Button>
        ))}
      </div>

      {helper && state === "idle" && (
        <p className="mt-1 text-[11px] text-ink-faint">{helper}</p>
      )}
    </div>
  );
}
