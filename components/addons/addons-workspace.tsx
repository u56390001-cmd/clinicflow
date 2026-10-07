"use client";

import { useState, useTransition } from "react";
import {
  Check,
  Info,
  ListChecks,
  MessageSquareText,
  Minus,
  MonitorPlay,
  Plus,
  Rabbit,
  Sparkles,
  Ticket,
  UserPlus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import {
  cancelAddonAction,
  subscribeAddonAction,
  updateAddonQuantityAction,
  type AddonView,
  type AddonsSnapshot,
} from "@/lib/actions/addons";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import type { AddonCategory } from "@/types/database";

type Filter = "All" | AddonCategory;

type Toast = { message: string; tone: "success" | "info" } | null;

/** Slugs are the joins between the seeded catalog and the icon library. */
const ADDON_ICONS: Record<string, LucideIcon> = {
  "whatsapp-ai-receptionist": MessageSquareText,
  "ai-review-assistant": ListChecks,
  "growth-agent": Sparkles,
  "extra-doctor-seat": UserPlus,
  "extra-tv-display": MonitorPlay,
  "queue-management-system": Ticket,
};

const FALLBACK_ICON: LucideIcon = Rabbit;
const MAX_QUANTITY = 50;

/**
 * Add-ons marketplace storefront.
 *
 * A single client component fed a server-snapshot of the catalog plus the
 * clinic's subscriptions. All screen state is either the active filter or the
 * dialog that is open; each card's status is derived from the snapshot, and
 * every mutation returns through `revalidatePath` — the same contract as the
 * integrations dashboard, so a failed write leaves the card showing what the
 * database actually stored rather than an optimistic guess.
 *
 * Staff get the same storefront with interactive controls disabled: the pill
 * says so at the top and the buttons refuse to submit.
 */
export function AddonsWorkspace({
  snapshot,
}: {
  snapshot: AddonsSnapshot;
}) {
  const { catalog, canManage, activeCount, monthlySpendPkr } = snapshot;

  const [filter, setFilter] = useState<Filter>("All");
  const [activating, setActivating] = useState<AddonView | null>(null);
  const [dialogQuantity, setDialogQuantity] = useState(1);
  const [cancelling, setCancelling] = useState<AddonView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();

  const tabs: Filter[] = [
    "All",
    ...Array.from(new Set(catalog.map((a) => a.category))),
  ];
  const visible = filter === "All" ? catalog : catalog.filter((a) => a.category === filter);

  function flash(message: string, tone: "success" | "info" = "success") {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3000);
  }

  function openActivation(addon: AddonView) {
    setError(null);
    setActivating(addon);
    setDialogQuantity(addon.subscription?.status === "active" ? addon.subscription.quantity : 1);
  }

  function run(key: string, work: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(key);
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) setError(result.message ?? "Something went wrong.");
      setBusy(null);
    });
  }

  function handleActivate() {
    if (!activating) return;
    run("activate", async () => {
      const result = await subscribeAddonAction({
        slug: activating.slug,
        quantity: activating.is_quantity_based ? dialogQuantity : 1,
      });
      if (result.ok) {
        flash(`${activating.name} activated`);
        setActivating(null);
      }
      return result;
    });
  }

  function handleCancel() {
    const target = cancelling;
    const subscriptionId = target?.subscription?.id;
    if (!subscriptionId) return;
    const name = target.name;
    run("cancel", async () => {
      const result = await cancelAddonAction({ addonId: subscriptionId });
      if (result.ok) {
        flash(`${name} turned off`);
        setCancelling(null);
      }
      return result;
    });
  }

  function handleQuantity(addon: AddonView, quantity: number) {
    const subscription = addon.subscription;
    if (!subscription || quantity < 1 || quantity > MAX_QUANTITY) return;
    run(`qty:${addon.id}`, async () => {
      const result = await updateAddonQuantityAction({
        addonId: subscription.id,
        quantity,
      });
      if (result.ok) flash(`${addon.name} set to ${quantity}`);
      return result;
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Add-ons
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Extend your clinic with extra capabilities, billed separately from
            your plan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!canManage && (
            <span className="rounded-pill border border-text-muted/30 bg-surface px-3 py-1.5 text-xs text-text-secondary">
              Read-only — owners and admins can subscribe
            </span>
          )}
          <span className="flex items-center gap-2 rounded-pill border border-text-muted/30 bg-surface px-3 py-1.5">
            <span className="size-2 rounded-pill bg-status-success" aria-hidden="true" />
            <span className="text-xs font-semibold text-text-primary">
              {activeCount} Active
            </span>
          </span>
          <span className="rounded-pill border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
            {formatCurrency(monthlySpendPkr)} / month
          </span>
        </div>
      </header>

      <nav
        aria-label="Filter add-ons by category"
        className="flex flex-wrap items-center gap-2"
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setFilter(tab)}
            aria-pressed={filter === tab}
            className={cn(
              "h-8 rounded-pill px-3 text-xs font-medium transition-colors",
              filter === tab
                ? "bg-primary text-white shadow-sm"
                : "border border-text-muted/30 bg-surface text-text-secondary hover:text-text-primary",
            )}
          >
            {tab}
          </button>
        ))}
      </nav>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-card border border-status-destructive/30 bg-red-50 p-3 text-sm text-red-700"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <div className="rounded-card border border-dashed border-text-muted/40 py-14 text-center">
          <Sparkles className="mx-auto size-7 text-text-muted/60" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-text-primary">
            No add-ons in this category
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Pick another filter or ask us about new capabilities.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((addon) => (
            <AddonCard
              key={addon.id}
              addon={addon}
              canManage={canManage}
              busy={busy === `qty:${addon.id}` || isPending}
              onActivate={() => openActivation(addon)}
              onCancel={() => setCancelling(addon)}
              onQuantity={(q) => handleQuantity(addon, q)}
            />
          ))}
        </div>
      )}

      <Dialog
        open={activating !== null}
        onOpenChange={(open) => {
          if (!open && busy !== "activate") setActivating(null);
        }}
      >
        <DialogContent>
          {activating && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base font-bold text-text-primary">
                  Turn on {activating.name}?
                </DialogTitle>
                <DialogDescription>
                  {activating.description}
                </DialogDescription>
              </DialogHeader>

              <ActivationSummary addon={activating} quantity={dialogQuantity} />

              {activating.is_quantity_based && (
                <label className="flex items-center justify-between gap-4 border-t border-hairline pt-3">
                  <span className="text-sm font-medium text-text-primary">
                    How many?
                  </span>
                  <QuantityStepper
                    quantity={dialogQuantity}
                    disabled={busy === "activate"}
                    onDecrease={() =>
                      setDialogQuantity((q) => Math.max(1, q - 1))
                    }
                    onIncrease={() =>
                      setDialogQuantity((q) => Math.min(MAX_QUANTITY, q + 1))
                    }
                  />
                </label>
              )}

              <DialogFooter className="border-t border-hairline pt-3">
                <Button
                  variant="secondary"
                  onClick={() => setActivating(null)}
                  disabled={busy === "activate"}
                >
                  Cancel
                </Button>
                <Button onClick={handleActivate} disabled={busy === "activate"}>
                  {busy === "activate" && <Spinner size="sm" />}
                  Activate — {formatCurrency(activating.price_pkr * dialogQuantity)} / month
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open && busy !== "cancel") setCancelling(null);
        }}
      >
        <DialogContent>
          {cancelling && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base font-bold text-text-primary">
                  Turn off {cancelling.name}?
                </DialogTitle>
                <DialogDescription>
                  It stops at the end of the current billing cycle. You can
                  turn it back on from this store any time — no setup is lost
                  and nothing is charged until it runs again.
                </DialogDescription>
              </DialogHeader>

              <DialogFooter className="border-t border-hairline pt-3">
                <Button
                  variant="secondary"
                  onClick={() => setCancelling(null)}
                  disabled={busy === "cancel"}
                >
                  Keep add-on
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleCancel}
                  disabled={busy === "cancel"}
                >
                  {busy === "cancel" && <Spinner size="sm" />}
                  Turn off
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {toast && (
        <div
          role="status"
          className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-card bg-slate-900 px-3.5 py-2.5 text-sm font-medium text-white shadow-lg"
        >
          {toast.tone === "success" ? (
            <Check className="size-4 text-emerald-400" aria-hidden="true" />
          ) : (
            <Info className="size-4 text-blue-400" aria-hidden="true" />
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function AddonCard({
  addon,
  canManage,
  busy,
  onActivate,
  onCancel,
  onQuantity,
}: {
  addon: AddonView;
  canManage: boolean;
  busy: boolean;
  onActivate: () => void;
  onCancel: () => void;
  onQuantity: (quantity: number) => void;
}) {
  const Icon = ADDON_ICONS[addon.slug] ?? FALLBACK_ICON;
  const active = addon.subscription?.status === "active";
  const quantity = addon.subscription?.quantity ?? 1;
  const canControl = canManage && !busy;

  return (
    <article className="relative flex h-full flex-col gap-2.5 rounded-card border border-hairline bg-surface p-4 shadow-[0_1px_0_rgba(15,23,42,0.02)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-card sm:p-5">
      <div className="absolute right-3 top-3">
        {active ? (
          <Badge variant="success">Active</Badge>
        ) : addon.badge_text ? (
          <Badge variant="warning">{addon.badge_text}</Badge>
        ) : null}
      </div>

      <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[#0F766E] text-white shadow-[0_6px_16px_-8px_rgba(13,148,136,0.55)]">
        <Icon className="size-5" aria-hidden="true" />
      </div>

      <div>
        <Badge variant="default" className="mb-1.5 px-2 py-0.5 text-[11px]">
          {addon.category}
        </Badge>
        <h3 className="text-[15px] font-semibold leading-snug text-ink">
          {addon.name}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-text-secondary">
          {addon.description}
        </p>
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
        <p className="text-[15px] font-semibold text-ink">
          {formatCurrency(active && addon.is_quantity_based ? addon.price_pkr * quantity : addon.price_pkr)}
          <span className="ml-1 text-xs font-normal text-text-muted">/ month</span>
        </p>

        {active && addon.is_quantity_based ? (
          <div className="flex items-center gap-2">
            <QuantityStepper
              quantity={quantity}
              disabled={!canControl}
              onDecrease={() => onQuantity(quantity - 1)}
              onIncrease={() => onQuantity(quantity + 1)}
            />
            <Button variant="outline" size="sm" disabled={!canControl} onClick={onCancel}>
              Cancel
            </Button>
          </div>
        ) : active ? (
          <Button variant="outline" size="sm" disabled={!canControl} onClick={onCancel}>
            Cancel
          </Button>
        ) : addon.badge_text ? (
          <Button size="sm" disabled>
            {addon.badge_text}
          </Button>
        ) : (
          <Button size="sm" disabled={!canControl} onClick={onActivate}>
            Subscribe
          </Button>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Activation dialog summary
// ---------------------------------------------------------------------------

function ActivationSummary({
  addon,
  quantity,
}: {
  addon: AddonView;
  quantity: number;
}) {
  const Icon = ADDON_ICONS[addon.slug] ?? FALLBACK_ICON;
  const total = addon.is_quantity_based ? addon.price_pkr * quantity : addon.price_pkr;

  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-hairline bg-app p-3">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[#0F766E] text-white">
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">{addon.name}</p>
          <p className="text-xs text-text-muted">
            {addon.category} · {formatCurrency(addon.price_pkr)} / unit / month
          </p>
        </div>
      </div>
      <p className="text-sm font-semibold text-ink">
        {formatCurrency(total)}
        <span className="ml-1 text-xs font-normal text-text-muted">/ month</span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quantity stepper
// ---------------------------------------------------------------------------

function QuantityStepper({
  quantity,
  disabled,
  onDecrease,
  onIncrease,
}: {
  quantity: number;
  disabled?: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  const atMin = quantity <= 1;
  const atMax = quantity >= MAX_QUANTITY;

  return (
    <div className="flex items-center rounded-pill border border-text-muted/30 bg-surface p-0.5">
      <button
        type="button"
        onClick={onDecrease}
        disabled={disabled || atMin}
        aria-label="Decrease quantity"
        className="flex size-6 items-center justify-center rounded-pill text-text-secondary transition-colors hover:bg-app hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Minus className="size-3.5" aria-hidden="true" />
      </button>
      <span
        aria-live="polite"
        className="min-w-7 text-center text-sm font-semibold text-ink"
      >
        {quantity}
      </span>
      <button
        type="button"
        onClick={onIncrease}
        disabled={disabled || atMax}
        aria-label="Increase quantity"
        className="flex size-6 items-center justify-center rounded-pill text-text-secondary transition-colors hover:bg-app hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}