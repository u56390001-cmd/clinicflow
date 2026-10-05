"use client";

import { useState } from "react";
import { useActionState } from "react";
import {
  Tv,
  Copy,
  Check,
  ExternalLink,
  MonitorCheck,
  Cast,
  Info,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { connectTvDisplayAction } from "@/lib/actions/settings";
import type { ActionResult } from "@/types";

function IconChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-9 flex-shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
      {children}
    </span>
  );
}

type Props = {
  clinicSlug?: string;
  initialDisplayUrl?: string | null;
};

export function TvDisplaySettingsCard({
  clinicSlug,
  initialDisplayUrl,
}: Props) {
  const [state, formAction, isPending] = useActionState<
    ActionResult<{ deviceToken: string; displayUrl: string }> | null,
    FormData
  >(connectTvDisplayAction, null);

  const [copied, setCopied] = useState(false);

  // Active display URL is either the freshly generated one from action or initial URL from server
  const activeUrl = state?.ok
    ? state.data?.displayUrl
    : initialDisplayUrl || null;

  const handleCopy = async () => {
    if (!activeUrl) return;
    try {
      await navigator.clipboard.writeText(activeUrl);
      setCopied(true);
      toast.success("Display URL copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b border-hairline">
        <div className="flex min-w-0 items-center gap-3">
          <IconChip>
            <Tv className="size-[18px]" aria-hidden="true" />
          </IconChip>
          <div className="min-w-0">
            <CardTitle>TV Display</CardTitle>
            <CardDescription className="mt-0.5">
              Connect and manage Smart TVs showing your live waiting queue.
            </CardDescription>
          </div>
        </div>

        <form action={formAction}>
          <Button type="submit" disabled={isPending}>
            <Tv data-icon="inline-start" aria-hidden="true" />
            {activeUrl ? "Refresh Link" : "Connect TV Display"}
          </Button>
        </form>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        {activeUrl ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-hairline bg-primary/5 p-6 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
                <MonitorCheck className="size-6" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-text-primary">
                  Live Queue TV Display Active
                </h3>
                <p className="max-w-md text-sm text-text-secondary">
                  Open this link on any Smart TV browser, monitor, or tablet in your
                  waiting area to show real-time patient tokens.
                </p>
              </div>

              {/* Display URL Box & Actions */}
              <div className="flex w-full max-w-xl flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex-1 overflow-hidden rounded-lg border border-hairline bg-surface px-3.5 py-2 text-left">
                  <code className="break-all font-mono text-xs text-text-secondary sm:text-sm">
                    {activeUrl}
                  </code>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    className="flex-1 sm:flex-initial"
                  >
                    {copied ? (
                      <Check className="size-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    {copied ? "Copied" : "Copy Link"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    asChild
                    className="flex-1 sm:flex-initial"
                  >
                    <a
                      href={activeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="size-3.5" />
                      Open Display
                    </a>
                  </Button>
                </div>
              </div>
            </div>

            {/* Smart TV Setup Guide */}
            <div className="rounded-xl border border-hairline bg-surface-raised p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <Cast className="size-4 text-primary" />
                How to set up your Smart TV in 3 easy steps
              </div>
              <ol className="mt-3 grid gap-3 text-sm text-text-secondary sm:grid-cols-3">
                <li className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface p-3">
                  <span className="font-semibold text-text-primary">
                    1. Open TV Browser
                  </span>
                  <span>
                    Open the built-in Internet / Web browser on your Smart TV (Samsung, LG, Sony, Android TV, or Fire Stick).
                  </span>
                </li>
                <li className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface p-3">
                  <span className="font-semibold text-text-primary">
                    2. Navigate to Link
                  </span>
                  <span>
                    Enter your clinic&apos;s queue display URL (or bookmark it for instant access whenever the TV powers on).
                  </span>
                </li>
                <li className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface p-3">
                  <span className="font-semibold text-text-primary">
                    3. Enable Fullscreen
                  </span>
                  <span>
                    Press the Fullscreen button on the top right for a distraction-free, live-updating waiting room screen.
                  </span>
                </li>
              </ol>
            </div>
          </div>
        ) : state?.ok === false ? (
          <div className="rounded-lg bg-destructive/10 p-4 text-center">
            <p className="text-sm text-destructive">{state.message}</p>
          </div>
        ) : (
          <div className="text-center">
            <EmptyState
              icon={Tv}
              title="No Smart TV display linked yet."
              description="Click “Connect TV Display” to generate your clinic's waiting room screen URL."
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}