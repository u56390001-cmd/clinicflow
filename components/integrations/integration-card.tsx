"use client";

import { ArrowUpRight, Lock } from "lucide-react";

import { IntegrationIcon } from "@/components/integrations/integration-icon";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { IntegrationCatalogEntry } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { IntegrationStatus } from "@/types/database";

/**
 * One integration card.
 *
 * ## The whole card is the click target
 *
 * The catalogue is a scanning surface, so a clinic should not have to aim at a
 * small "Details" button in the corner to open a card. An absolutely-positioned
 * overlay button carries the click; the visible content sits above it with
 * `pointer-events-none`, and only genuinely interactive children (the queue
 * switch, the upgrade button) opt back in.
 *
 * This is a `<button>`, not a click handler on a `<div>`, so it is reachable by
 * keyboard and announced as a button — and because it is a sibling of the
 * content rather than an ancestor, the upgrade button and switch inside it are
 * not nested interactive elements.
 *
 * ## The badge vocabulary is deliberately not "Active"
 *
 * The design document showed a green "Active" badge on Zoom and Queue. Seven of
 * the eight catalogue entries need vendor OAuth credentials this deployment does
 * not have, so "Active" would be a claim the backend cannot honour — it would
 * tell a clinic that meeting links are being generated when no code path
 * generates them. So the badge describes what is actually true:
 *
 *   * **On** — the clinic turned it on here, and for `queue` that really does
 *     change the appointments page.
 *   * **Configured** — credentials are saved, integration is off.
 *   * **Not connected** — nothing saved yet.
 *   * **Needs attention** — the last attempt failed.
 *
 * A `vendorPending` line then says plainly that the vendor's own authorisation
 * step has not been completed, so "On" is never mistaken for "sending now".
 */
export function IntegrationCard({
  entry,
  status,
  hasCredentials,
  unlocked,
  availableOn,
  configuredAt,
  lastError,
  canManage,
  busy,
  onOpenConfig,
  onRequestUpgrade,
  onToggleQueue,
}: {
  entry: IntegrationCatalogEntry;
  status: IntegrationStatus;
  hasCredentials: boolean;
  unlocked: boolean;
  availableOn: string[];
  configuredAt: string | null;
  lastError: string | null;
  canManage: boolean;
  busy: boolean;
  onOpenConfig: () => void;
  onRequestUpgrade: () => void;
  onToggleQueue: (next: boolean) => void;
}) {
  const badge = resolveBadge(entry, status, hasCredentials);
  const isQueue = entry.backedBy === "clinic_setting";

  return (
    <div
      className={cn(
        "relative flex flex-col justify-between rounded-card border bg-surface p-4 transition-colors",
        unlocked
          ? "border-text-muted/30 hover:border-primary/50 hover:shadow-card"
          : "border-text-muted/20 bg-app/40",
      )}
    >
      {/* The click target for the whole card. */}
      {unlocked ? (
        <button
          type="button"
          onClick={onOpenConfig}
          disabled={busy}
          className="absolute inset-0 z-0 rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-default"
        >
          <span className="sr-only">
            {isQueue
              ? `Open ${entry.name} options`
              : hasCredentials
                ? `Manage ${entry.name} connection`
                : `Connect ${entry.name}`}
          </span>
        </button>
      ) : null}

      <div
        className={cn(
          "pointer-events-none relative z-10",
          unlocked && "cursor-pointer",
        )}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-snug text-text-primary">
              {entry.name}
            </h3>
            {entry.host && (
              <div className="mt-0.5 flex items-center gap-1">
                <span className="truncate text-xs text-text-muted">
                  {entry.host}
                </span>
                <ArrowUpRight
                  className="size-2.5 shrink-0 text-text-muted/60"
                  aria-hidden="true"
                />
              </div>
            )}
          </div>
          <IntegrationIcon integrationKey={entry.key} />
        </div>

        <p className="my-3 line-clamp-3 text-xs leading-relaxed text-text-secondary">
          {entry.description}
        </p>
      </div>

      <div className="relative z-10 mt-auto flex items-center justify-between gap-2 border-t border-text-muted/20 pt-2.5">
        {!unlocked ? (
          <>
            <span className="pointer-events-none flex items-center gap-1.5 text-xs font-medium text-text-secondary">
              <Lock
                className="size-3 text-text-muted"
                aria-hidden="true"
              />
              Not on your plan
            </span>
            <Button
              size="sm"
              variant="primary"
              onClick={onRequestUpgrade}
              className="pointer-events-auto"
            >
              Upgrade
              <ArrowUpRight aria-hidden="true" />
            </Button>
          </>
        ) : (
          <>
            <StatusPill label={badge.label} dotClass={badge.dot} />
            {isQueue ? (
              /* Queue Management is the one entry whose switch is the whole
                 feature, so it gets a real toggle in the footer rather than a
                 button that opens a drawer containing one switch. It opts back
                 into pointer events so the switch is reachable. */
              <Switch
                checked={status === "activated"}
                disabled={!canManage || busy}
                onCheckedChange={onToggleQueue}
                className="pointer-events-auto"
                aria-label={`Live waiting queue on the appointments page`}
              />
            ) : (
              <span
                className={cn(
                  "pointer-events-none text-xs font-semibold text-primary",
                  busy && "opacity-60",
                )}
              >
                {hasCredentials ? "Manage" : "Connect"}
                <ArrowUpRight
                  className="ml-0.5 inline size-2.5 align-[-1px]"
                  aria-hidden="true"
                />
              </span>
            )}
          </>
        )}
      </div>

      {/* Footnotes sit above the overlay so they never swallow a click. */}
      {unlocked && !canManage && (
        <p className="pointer-events-none relative z-10 mt-2 text-xs text-text-muted">
          Only owners and admins can change this.
        </p>
      )}

      {unlocked && lastError && (
        <p className="pointer-events-none relative z-10 mt-2 text-xs text-red-600">
          {lastError}
        </p>
      )}

      {unlocked && entry.needsVendorSetup && status === "activated" && (
        <p className="pointer-events-none relative z-10 mt-2 text-xs text-text-muted">
          On. The vendor authorisation step is still pending for this
          deployment, so nothing is being sent to {entry.host ?? "the vendor"}{" "}
          yet.
        </p>
      )}

      {unlocked && !entry.needsVendorSetup && configuredAt === null && (
        <p className="pointer-events-none relative z-10 mt-2 text-xs text-text-muted">
          Available now — no setup needed.
        </p>
      )}

      {!unlocked && availableOn.length > 0 && (
        <p className="pointer-events-none relative z-10 mt-2 text-xs text-text-muted">
          Included with {availableOn.join(" and ")}.
        </p>
      )}
    </div>
  );
}

function StatusPill({
  label,
  dotClass,
}: {
  label: string;
  dotClass: string;
}) {
  return (
    <span className="pointer-events-none flex items-center gap-1.5">
      <span className={cn("size-2 rounded-pill", dotClass)} aria-hidden="true" />
      <span className="text-xs font-medium text-text-muted">{label}</span>
    </span>
  );
}

/**
 * The one place the four states are named. Keeping it in a function rather than
 * inline in the JSX means the card, the header counter and the detail drawer can
 * never disagree about what "configured" means.
 */
function resolveBadge(
  entry: IntegrationCatalogEntry,
  status: IntegrationStatus,
  hasCredentials: boolean,
): { label: string; dot: string } {
  if (status === "error") {
    return { label: "Needs attention", dot: "bg-red-500" };
  }
  if (status === "activated") {
    return { label: "On", dot: "bg-status-success" };
  }
  if (entry.backedBy === "clinic_setting") {
    return { label: "Off", dot: "bg-text-muted/40" };
  }
  if (hasCredentials) {
    return { label: "Configured", dot: "bg-text-muted/40" };
  }
  return { label: "Not connected", dot: "bg-text-muted/40" };
}
