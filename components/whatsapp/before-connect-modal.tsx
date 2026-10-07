"use client";

import { useEffect, useState } from "react";
import { Info, MessageSquare, Phone, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type WhatsappMode = "app_and_ai" | "ai_only";

const MODES: {
  value: WhatsappMode;
  icon: typeof Phone;
  title: string;
  description: string;
  helper?: string;
}[] = [
  {
    value: "app_and_ai",
    icon: Phone,
    title: "Use this number on WhatsApp App + AI agent",
    description:
      "Continue using WhatsApp on your phone while the AI agent manages patient conversations, appointment bookings, and replies in the background.",
  },
  {
    value: "ai_only",
    icon: Zap,
    title: "Use this number only with the AI agent",
    description:
      "This number will be used exclusively by the AI agent and will not work on the WhatsApp mobile app.",
    helper: "Suitable for a new or dedicated clinic number.",
  },
];

/**
 * "Before we connect" — choose how the number will be used before handing off
 * to Meta's Embedded Signup. Pure gating UI: the actual OAuth flow is launched
 * by the parent via `onContinue(mode)`, so this modal owns only selection and
 * its enabled/disabled footer state.
 */
export function BeforeConnectModal({
  open,
  onOpenChange,
  busy = false,
  onContinue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy?: boolean;
  onContinue: () => void;
}) {
  const [selectedMode, setSelectedMode] = useState<WhatsappMode | null>(null);

  // Each open starts from a clean selection.
  useEffect(() => {
    if (open) setSelectedMode(null);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="wide"
        showCloseButton
        className="max-w-xl gap-0 overflow-y-auto rounded-t-2xl p-0 shadow-2xl md:rounded-2xl"
      >
        {/* iOS-style drag handle, mobile only — matches the design reference. */}
        <div className="flex justify-center pt-3 pb-1 md:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-pill bg-text-muted/40" />
        </div>

        <DialogHeader className="px-4 pt-3 pb-3 pr-4 md:px-8 md:pt-7 md:pb-5">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-card bg-primary/10 text-primary">
              <MessageSquare className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold leading-none text-ink">
                Before we connect
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm leading-relaxed">
                Choose how your clinic will use WhatsApp with the AI agent.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mx-4 h-px bg-text-muted/15 md:mx-8" />

        <div className="flex flex-col gap-3 p-4 md:gap-4 md:p-8" role="radiogroup" aria-label="WhatsApp usage mode">
          {MODES.map((mode) => {
            const Icon = mode.icon;
            const selected = selectedMode === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setSelectedMode(mode.value)}
                className={cn(
                  "w-full overflow-hidden rounded-card border-2 text-left transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-hairline bg-surface hover:border-primary/40",
                )}
              >
                <span className="flex items-start gap-3 p-3 md:gap-4 md:p-5">
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-card transition-colors md:size-11",
                      selected
                        ? "bg-primary/15 text-primary"
                        : "bg-skeleton text-text-secondary",
                    )}
                  >
                    <Icon className="size-[18px]" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text-primary">
                      {mode.title}
                    </span>
                    <span className="mt-1.5 block text-xs leading-relaxed text-text-secondary">
                      {mode.description}
                    </span>
                    {mode.helper ? (
                      <span className="mt-2 block text-[11px] text-text-muted">
                        {mode.helper}
                      </span>
                    ) : null}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                      selected ? "border-primary" : "border-text-muted/50",
                    )}
                  >
                    {selected ? (
                      <span className="size-2.5 rounded-full bg-primary" />
                    ) : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-start gap-2 px-4 pb-4 md:px-9 md:pb-2">
          <Info
            className="mt-0.5 size-3.5 shrink-0 text-text-muted"
            aria-hidden="true"
          />
          <p className="text-xs leading-relaxed text-text-muted">
            You can change this setup later, but it may require reconnecting
            your number.
          </p>
        </div>

        <DialogFooter className="flex gap-3 px-4 pb-5 sm:flex-row md:px-8 md:pb-7">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!selectedMode || busy}
            className="flex-1"
            onClick={onContinue}
          >
            {busy ? (
              <Spinner className="size-4" aria-hidden="true" />
            ) : null}
            Continue →
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}