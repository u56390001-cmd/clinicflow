"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Link2, Loader2, MapPinOff } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setGrowthLocationName } from "@/lib/actions/growth-agent";
import { cn } from "@/lib/utils";
import type { GrowthConnectionState } from "@/types/database";

/**
 * Google Business Profile connection.
 *
 * The reference prototype shipped a permanent green "Connected · Google
 * Business Live" banner over a dashboard with no Google integration behind it.
 * That is the single most misleading thing in that design, so this component
 * exists to be the opposite: it reports the real state, it explains what each
 * state means for the clinic's posts, and it never shows a green tick that
 * isn't backed by a live connection.
 *
 * All four states are handled because a real OAuth handshake needs all four:
 * not_connected, connecting, connected, error.
 */

const STATE_COPY: Record<
  GrowthConnectionState,
  { label: string; badge: "default" | "success" | "warning" | "destructive" } | null
> = {
  not_connected: null,
  connecting: { label: "Connecting", badge: "warning" },
  connected: { label: "Connected", badge: "success" },
  error: { label: "Needs attention", badge: "destructive" },
};

export function GrowthConnectionCard({
  connectionState,
  locationName,
  lastSyncedAt,
  lastError,
  clinicName,
  canEdit,
}: {
  connectionState: GrowthConnectionState;
  locationName: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  clinicName: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(locationName ?? "");
  const [isPending, startTransition] = useTransition();

  const stateCopy = STATE_COPY[connectionState];
  const isError = connectionState === "error";

  const save = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("locationName", name);
      const result = await setGrowthLocationName(null, formData);
      if (result.ok) {
        toast.success("Profile name saved.");
        setEditing(false);
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <section
      aria-label="Google Business Profile connection"
      className={cn(
        "rounded-card border bg-surface px-5 py-4",
        isError ? "border-status-destructive/40" : "border-text-muted/30",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-control",
              isError
                ? "bg-status-destructive/10 text-status-destructive"
                : connectionState === "connected"
                  ? "bg-primary/10 text-primary"
                  : "bg-app text-text-muted",
            )}
            aria-hidden="true"
          >
            {connectionState === "connected" ? (
              <CheckCircle2 className="size-5" />
            ) : connectionState === "connecting" ? (
              <Loader2 className="size-5 animate-spin" />
            ) : isError ? (
              <AlertCircle className="size-5" />
            ) : (
              <MapPinOff className="size-5" />
            )}
          </span>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-text-primary">
                {locationName ?? "No Google Business Profile linked"}
              </h2>
              {stateCopy ? (
                <Badge variant={stateCopy.badge}>{stateCopy.label}</Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-text-secondary">
              {describeState(connectionState, lastSyncedAt, lastError)}
            </p>
          </div>
        </div>

        {canEdit && !editing ? (
          <Button
            type="button"
            variant={connectionState === "connected" ? "outline" : "primary"}
            onClick={() => setEditing(true)}
            className="shrink-0"
          >
            <Link2 aria-hidden="true" />
            {connectionState === "connected" ? "Change profile" : "Set up profile"}
          </Button>
        ) : null}
      </div>

      {editing && canEdit ? (
        <div className="mt-4 border-t border-text-muted/20 pt-4">
          <Label htmlFor="growth-location-name" className="text-sm">
            Google Business Profile name
          </Label>
          <p className="mt-1 text-xs text-text-secondary">
            This is the listing your posts appear on — the name patients see on
            Google Maps, not your clinic name inside {clinicName}. Copy it exactly
            as Google lists it.
          </p>
          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
            <Input
              id="growth-location-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Dental Care Center — Downtown"
              maxLength={120}
              className="sm:max-w-sm"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={save}
                disabled={isPending || name.trim().length === 0}
              >
                {isPending ? <Spinner /> : null}
                Save profile name
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setName(locationName ?? "");
                  setEditing(false);
                }}
                disabled={isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Spinner sized to sit inside a Button next to its label. */
function Spinner() {
  return <Loader2 className="size-4 animate-spin" aria-hidden="true" />;
}

/**
 * One honest sentence per state. Each says what it means for the clinic's
 * posts, not just what the system is doing internally.
 */
function describeState(
  state: GrowthConnectionState,
  lastSyncedAt: string | null,
  lastError: string | null,
): string {
  switch (state) {
    case "connected":
      return lastSyncedAt
        ? `Publishing to Google. Last synced ${formatRelative(lastSyncedAt)}.`
        : "Publishing to Google.";
    case "connecting":
      return "Finishing the connection with Google. This takes a few seconds.";
    case "error":
      return (
        lastError ??
        "The last connection attempt failed. Check the Google account you used and try again."
      );
    case "not_connected":
    default:
      return "Posts are written and queued here, but they cannot reach Google until a profile is linked.";
  }
}

/** "5 minutes ago" style stamp, falling back to a plain date past a week. */
function formatRelative(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "recently";

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days <= 7) return `${days} day${days === 1 ? "" : "s"} ago`;

  return new Date(then).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
