"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Link2,
  Loader2,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  disconnectGoogleProfile,
  startGoogleConnect,
} from "@/lib/actions/growth-google";
import { cn } from "@/lib/utils";
import type { GrowthConnectionState } from "@/types/database";

/**
 * Google Business Profile connection.
 *
 * The card has two faces, and which one shows is decided by `connectionState`,
 * not by whether a button was clicked:
 *
 *   • Not connected / error → the centered invitation: an icon, what connecting
 *     unlocks, and one button. This is the face from the reference design.
 *
 *   • Connected → the compact "which profile am I publishing to" strip, because
 *     once the work is done the button is no longer the point; the identity of
 *     the linked listing is.
 *
 * ## What this deliberately does not do
 *
 * It does not claim success optimistically. `startGoogleConnect` returns a URL
 * and the browser navigates to Google; everything after that happens in the
 * OAuth callback, and the page is re-rendered from the database when it comes
 * back. There is no local "connected" flag that could disagree with what was
 * actually stored — which matters here more than anywhere else on the page,
 * because a false green tick on this card means a clinic believes it is
 * publishing to Google when it is not.
 */
export function GoogleConnectCard({
  connectionState,
  locationName,
  accountEmail,
  lastError,
  canEdit,
  callbackReason,
}: {
  connectionState: GrowthConnectionState;
  locationName: string | null;
  accountEmail: string | null;
  lastError: string | null;
  canEdit: boolean;
  /** Slug from the OAuth callback's `?google=` param, read on the server. */
  callbackReason: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isConnected = connectionState === "connected";
  const isBusy = isPending;

  const callbackMessage = describeCallback(callbackReason);

  const connect = () => {
    setLocalError(null);
    startTransition(async () => {
      const result = await startGoogleConnect();
      if (!result.ok) {
        setLocalError(result.message);
        return;
      }
      // Full navigation, not a router push: this is leaving the app for
      // Google's consent screen and coming back through a route handler.
      window.location.assign(result.data.url);
    });
  };

  const disconnect = () => {
    setLocalError(null);
    startTransition(async () => {
      const result = await disconnectGoogleProfile();
      setConfirmingDisconnect(false);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Google Business Profile disconnected.");
      router.refresh();
    });
  };

  // ---------------------------------------------------------------------------
  // Connected
  // ---------------------------------------------------------------------------
  if (isConnected) {
    return (
      <section
        aria-label="Google Business Profile connection"
        className="rounded-card border border-text-muted/30 bg-surface px-5 py-4"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <Building2 className="size-5" />
            </span>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-text-primary">
                  {locationName ?? "Google Business Profile connected"}
                </h2>
                <span className="inline-flex items-center gap-1.5 rounded-pill border border-status-success/30 bg-status-success/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  <span
                    className="size-1.5 rounded-pill bg-status-success motion-safe:animate-pulse"
                    aria-hidden="true"
                  />
                  Connected
                </span>
              </div>
              <p className="mt-0.5 text-sm text-text-secondary">
                {accountEmail
                  ? `Publishing as ${accountEmail}.`
                  : "Publishing to your Google Business Profile."}
              </p>
            </div>
          </div>

          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmingDisconnect(true)}
              disabled={isBusy}
              className="shrink-0"
            >
              <Unlink aria-hidden="true" />
              Disconnect
            </Button>
          ) : null}
        </div>

        {confirmingDisconnect ? (
          <ConfirmDialog
            title="Disconnect Google Business Profile?"
            description="Posts already published stay on Google. Until you reconnect, new posts are written and queued here but cannot be published."
            confirmText="Disconnect"
            cancelText="Keep connected"
            variant="destructive"
            loading={isBusy}
            onConfirm={disconnect}
            onCancel={() => setConfirmingDisconnect(false)}
          />
        ) : null}
      </section>
    );
  }

  // ---------------------------------------------------------------------------
  // Not connected / connecting / error
  // ---------------------------------------------------------------------------
  return (
    <section
      aria-label="Google Business Profile connection"
      className="overflow-hidden rounded-card border border-text-muted/30 bg-surface"
    >
      <div className="flex flex-col items-center p-6 text-center sm:p-8">
        <span
          className="mb-4 flex size-16 items-center justify-center rounded-card bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <Building2 className="size-[30px]" />
        </span>

        <h2 className="text-lg font-bold text-text-primary">
          Connect Google Business Profile
        </h2>

        <p className="mb-5 mt-1.5 max-w-md text-sm text-text-secondary">
          Connect your Google Business Profile to unlock AI-powered posts, review
          replies, profile health insights, and performance analytics.
        </p>

        {/* A previous attempt left an error on the row. Shown above the button
            rather than below it, so the reason is read before the retry. */}
        {connectionState === "error" && lastError ? (
          <p className="mb-4 flex max-w-md items-start gap-2 rounded-control border border-status-destructive/30 bg-status-destructive/5 px-3 py-2 text-left text-sm text-status-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{lastError}</span>
          </p>
        ) : null}

        {/* Something failed just now, on this visit. */}
        {callbackMessage ? (
          <p
            className={cn(
              "mb-4 flex max-w-md items-start gap-2 rounded-control border px-3 py-2 text-left text-sm",
              callbackReason === "connected"
                ? "border-status-success/30 bg-status-success/5 text-emerald-700"
                : "border-status-destructive/30 bg-status-destructive/5 text-status-destructive",
            )}
          >
            {callbackReason === "connected" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            )}
            <span>{callbackMessage}</span>
          </p>
        ) : null}

        {localError ? (
          <p className="mb-4 flex max-w-md items-start gap-2 rounded-control border border-status-destructive/30 bg-status-destructive/5 px-3 py-2 text-left text-sm text-status-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{localError}</span>
          </p>
        ) : null}

        <Button
          type="button"
          size="lg"
          onClick={connect}
          disabled={!canEdit || isBusy}
          className="gap-2 px-6 shadow-sm"
        >
          {isBusy ? (
            <Loader2 className="size-[18px] animate-spin" aria-hidden="true" />
          ) : (
            <Building2 className="size-[18px]" aria-hidden="true" />
          )}
          {isBusy ? "Opening Google..." : "Connect Google Business Profile"}
        </Button>

        {!canEdit ? (
          <p className="mt-3 max-w-md text-xs text-text-muted">
            Only owners and admins can connect the clinic&rsquo;s Google profile.
          </p>
        ) : (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-text-muted">
            <Link2 className="size-3.5" aria-hidden="true" />
            You&rsquo;ll be asked to sign in to Google. MedBookAi never sees your
            password.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Turns the callback's reason code into a sentence.
 *
 * The route handler can only hand back a short slug, so the wording lives here
 * where it can be read alongside the rest of the card's copy. `null` means
 * there was no callback in this visit at all, which is not a state worth
 * showing anything for.
 */
function describeCallback(reason: string | null): string | null {
  switch (reason) {
    case "connected":
      return "Google Business Profile connected.";
    case "cancelled":
      return "You cancelled the Google sign-in. Nothing was changed.";
    case "state_mismatch":
      return "That connection attempt expired or was already used. Please try again.";
    case "clinic_mismatch":
      return "That connection attempt was started for a different clinic. Please start it from this page.";
    case "forbidden":
      return "Only owners and admins can connect the clinic's Google profile.";
    case "no_clinic":
      return "You need a clinic before you can connect Google.";
    case "not_configured":
      return "Google sign-in isn't configured on this deployment yet.";
    case "missing_code":
      return "Google didn't return an authorization code. Please try again.";
    case "exchange_failed":
      return "Google rejected the sign-in. Please try connecting again.";
    case "no_refresh_token":
      return "Google didn't grant long-lived access. Remove MedBookAi from your Google account permissions and connect again.";
    case "api_not_enabled":
      return "Connected to Google, but the Business Profile API isn't enabled for this app yet. Your MedBookAi administrator needs to request access from Google.";
    case "no_location":
      return "Connected to Google, but no Business Profile location was found on that account.";
    case "store_failed":
      return "We couldn't save the connection securely. Nothing was linked — please try again.";
    default:
      return null;
  }
}