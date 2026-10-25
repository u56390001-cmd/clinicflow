"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VoiceInputButton } from "@/components/patients/record/workspaces/voice-input-button";
import { assistPsychIntakeAction } from "@/lib/actions/specialty-workspaces";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/types";

type SaveState = "idle" | "saving" | "saved" | "error";
type AssistKind = "draft" | "improve" | "summarize";

/**
 * The writer the note's AI toolbar calls. Defaults to the intake assistant;
 * other tabs (the MSE observation notes) pass their own prompt via `assist`.
 */
export type NoteAssistFn = (input: {
  kind: AssistKind;
  fieldLabel: string;
  text: string;
}) => Promise<ActionResult<string>>;

const ASSIST_ACTIONS: Array<{
  kind: AssistKind;
  label: string;
}> = [
  { kind: "draft", label: "AI draft" },
  { kind: "improve", label: "Improve" },
  { kind: "summarize", label: "Summarise" },
];

/**
 * A narrative intake field that saves on blur and carries a clinical writing
 * toolbar: dictate, or let the assistant draft, improve or summarise the text.
 *
 * The toolbar is compact by design: voice (mic icon) and the AI-assist dropdown
 * sit together in the textarea's bottom-right corner instead of bulky buttons
 * stacked under every field. The assistant rides on the shared Gemini provider;
 * the note itself persists through the caller's `onSave`.
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
  assist,
  badge,
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
  /** Overrides the AI toolbar's prompt (per-tab writers). */
  assist?: NoteAssistFn;
  /** Rendered next to the field label (e.g. a provenance pill). */
  badge?: React.ReactNode;
}) {
  const [text, setText] = useState(value ?? "");
  const [state, setState] = useState<SaveState>("idle");
  const [assistBusy, setAssistBusy] = useState<AssistKind | null>(null);
  const persisted = useRef(value ?? "");
  const runAssist = assist ?? assistPsychIntakeAction;

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

  async function handleAssist(kind: AssistKind) {
    if (disabled) return;
    setAssistBusy(kind);
    const result = await runAssist({ kind, fieldLabel, text });
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
        {badge}
        <div className="flex items-center gap-2">
          {state === "saving" && (
            <span className="text-[11px] font-medium text-text-muted">Saving…</span>
          )}
          {state === "saved" && (
            <span className="text-[11px] font-medium text-primary">Saved</span>
          )}
          {state === "error" && (
            <span className="pointer-events-auto flex items-center gap-1 text-[11px] font-semibold text-status-destructive">
              <TriangleAlert aria-hidden="true" className="size-3" />
              Not saved
            </span>
          )}
        </div>
      </div>

      <div className="relative">
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
            !disabled && "pb-8",
            state === "error" && "border-status-destructive",
            disabled && "cursor-default opacity-80",
          )}
        />
        {!disabled && (
          <div className="absolute bottom-1.5 right-1.5 z-10 flex items-center gap-1 rounded-control border border-hairline bg-surface/90 p-0.5 shadow-sm">
            <VoiceInputButton
              onTranscript={handleDictate}
              label="Voice to note"
              compact
              className="border-0 bg-transparent hover:bg-app"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={assistBusy !== null}
                  aria-label="AI assist"
                  title="AI assist"
                  className="flex h-7 items-center gap-1 rounded-control px-1.5 text-[11.5px] font-medium text-text-secondary transition-colors hover:bg-app hover:text-primary disabled:opacity-60"
                >
                  <Sparkles
                    aria-hidden="true"
                    className={cn("size-3.5", assistBusy && "animate-pulse")}
                  />
                  {assistBusy ? "AI…" : "AI"}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-36">
                {ASSIST_ACTIONS.map((action) => (
                  <DropdownMenuItem
                    key={action.kind}
                    disabled={assistBusy !== null}
                    onSelect={() => void handleAssist(action.kind)}
                  >
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {helper && state === "idle" && (
        <p className="mt-1 text-[11px] text-ink-faint">{helper}</p>
      )}
    </div>
  );
}
