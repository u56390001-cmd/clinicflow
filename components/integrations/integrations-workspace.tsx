"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Info, Puzzle, Search } from "lucide-react";

import { IntegrationCard } from "@/components/integrations/integration-card";
import { IntegrationDetailDrawer } from "@/components/integrations/integration-detail-drawer";
import { IntegrationUpgradeModal } from "@/components/integrations/integration-upgrade-modal";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import {
  disconnectIntegrationAction,
  saveIntegrationConfigAction,
  setAppointmentsViewModeAction,
  setIntegrationStatusAction,
  type IntegrationView,
  type IntegrationsSnapshot,
} from "@/lib/actions/integrations";
import {
  getIntegrationEntry,
  INTEGRATION_CATALOG,
  INTEGRATION_CATEGORIES,
  type IntegrationCatalogEntry,
  type IntegrationCategory,
} from "@/lib/constants";
import type { IntegrationKey } from "@/types/database";

type Filter = "all" | IntegrationCategory;

type Toast = { message: string; tone: "success" | "info" } | null;

/**
 * Integrations dashboard.
 *
 * Holds exactly three pieces of state: the search term, the category filter, and
 * which modal is open. Everything else — whether an integration is unlocked,
 * what its badge says — is derived from the snapshot the server sent, so there
 * is no second copy of the truth to drift.
 *
 * Every mutation goes through a server action and comes back via
 * `revalidatePath`, so this component never writes an optimistic status. A
 * failed write therefore leaves the card showing what is actually stored rather
 * than a state the database rejected.
 */
export function IntegrationsWorkspace({
  snapshot,
}: {
  snapshot: IntegrationsSnapshot;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openKey, setOpenKey] = useState<IntegrationKey | null>(null);
  const [upgradeKey, setUpgradeKey] = useState<IntegrationKey | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();

  const viewsByKey = useMemo(() => {
    const map = new Map<string, IntegrationView>();
    for (const view of snapshot.integrations) map.set(view.key, view);
    return map;
  }, [snapshot.integrations]);

  /**
   * Queue Management is not in `snapshot.integrations` because it lives in a
   * column on `clinics`. It is given a synthetic view here so it can be rendered
   * by the same card component as everything else.
   */
  const queueView: IntegrationView = useMemo(
    () => ({
      key: "queue",
      status: snapshot.appointmentsViewMode === "queue" ? "activated" : "disabled",
      config: {},
      configuredAt: null,
      lastError: null,
      hasCredentials: false,
      unlocked: true,
      availableOn: [],
    }),
    [snapshot.appointmentsViewMode],
  );

  const allViews: IntegrationView[] = useMemo(
    () => [...snapshot.integrations, queueView],
    [snapshot.integrations, queueView],
  );

  const activeCount = allViews.filter(
    (v) => v.status === "activated" && v.unlocked,
  ).length;

  const term = search.trim().toLowerCase();
  const visibleCategories = useMemo(() => {
    return INTEGRATION_CATEGORIES.map((category) => ({
      ...category,
      entries: INTEGRATION_CATALOG.filter((entry) => {
        if (entry.category !== category.id) return false;
        if (filter !== "all" && filter !== category.id) return false;
        if (!term) return true;
        return (
          entry.name.toLowerCase().includes(term) ||
          entry.description.toLowerCase().includes(term) ||
          (entry.host ?? "").toLowerCase().includes(term)
        );
      }),
    })).filter((c) => c.entries.length > 0);
  }, [filter, term]);

  const noResults = visibleCategories.length === 0;

  function flash(message: string, tone: Toast extends null ? never : "success" | "info" = "success") {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3000);
  }

  function run(key: string, work: () => Promise<{ ok: boolean; message?: string }>) {
    setBusyKey(key);
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) setError(result.message ?? "Something went wrong.");
      setBusyKey(null);
    });
  }

  const openEntry = openKey ? getIntegrationEntry(openKey) : undefined;
  const upgradeEntry = upgradeKey ? getIntegrationEntry(upgradeKey) : undefined;

  function handleToggle(key: IntegrationKey, next: boolean) {
    const entry = getIntegrationEntry(key);
    if (!entry) return;
    setError(null);
    startTransition(async () => {
      const result =
        entry.backedBy === "clinic_setting"
          ? await setAppointmentsViewModeAction({
              mode: next ? "queue" : "list",
            })
          : await setIntegrationStatusAction({
              key,
              status: next ? "activated" : "disabled",
            });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      flash(
        next ? `${entry.name} turned on` : `${entry.name} turned off`,
        "success",
      );
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Integrations
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Connect your clinic with the tools you already use.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-pill border border-text-muted/30 bg-surface px-3 py-1.5">
          <span className="size-2 rounded-pill bg-status-success" aria-hidden="true" />
          <span className="text-xs font-semibold text-text-primary">
            {activeCount} Active
          </span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search integrations…"
            className="pl-9"
            aria-label="Search integrations"
          />
        </div>

        <NativeSelect
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="w-auto min-w-[180px]"
          aria-label="Filter by category"
        >
          <option value="all">All categories</option>
          {INTEGRATION_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </NativeSelect>
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-card border border-status-destructive/30 bg-red-50 p-3 text-sm text-red-700"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {noResults ? (
        <div className="rounded-card border border-dashed border-text-muted/40 py-14 text-center">
          <Puzzle
            className="mx-auto size-7 text-text-muted/60"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm font-medium text-text-primary">
            No integrations match
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Try a different search term or filter.
          </p>
        </div>
      ) : (
        visibleCategories.map((category) => (
          <section key={category.id}>
            <div className="mb-3">
              <h2 className="text-base font-bold tracking-tight text-text-primary">
                {category.title}
              </h2>
              <p className="mt-0.5 text-sm text-text-secondary">
                {category.subtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {category.entries.map((entry) => {
                const view =
                  entry.backedBy === "clinic_setting"
                    ? queueView
                    : (viewsByKey.get(entry.key) as IntegrationView | undefined) ??
                      fallbackView(entry);

                return (
                  <IntegrationCard
                    key={entry.key}
                    entry={entry}
                    status={view.status}
                    hasCredentials={view.hasCredentials}
                    unlocked={view.unlocked}
                    availableOn={view.availableOn}
                    configuredAt={view.configuredAt}
                    lastError={view.lastError}
                    canManage={snapshot.canManage}
                    busy={busyKey === entry.key || isPending}
                    onOpenConfig={() => setOpenKey(entry.key)}
                    onRequestUpgrade={() => setUpgradeKey(entry.key)}
                    onToggleQueue={(next) => handleToggle(entry.key, next)}
                  />
                );
              })}
            </div>
          </section>
        ))
      )}

      {openEntry && (
        <IntegrationDetailDrawer
          key={openEntry.key}
          entry={openEntry}
          status={statusOf(openEntry, allViews)}
          hasCredentials={hasCredentialsOf(openEntry, allViews)}
          config={configOf(openEntry, allViews)}
          canManage={snapshot.canManage}
          saving={busyKey === openEntry.key}
          error={error}
          onClose={() => {
            setOpenKey(null);
            setError(null);
          }}
          onSave={({ config, credentials }) =>
            run(openEntry.key, async () => {
              const result = await saveIntegrationConfigAction({
                key: openEntry.key,
                config,
                credentials,
              });
              if (result.ok) {
                flash(`Saved ${openEntry.name} settings`);
                setOpenKey(null);
              }
              return result;
            })
          }
          onToggle={(next) => {
            handleToggle(openEntry.key, next);
          }}
          onDisconnect={() =>
            run(openEntry.key, async () => {
              const result = await disconnectIntegrationAction({
                key: openEntry.key,
              });
              if (result.ok) {
                flash(`Disconnected ${openEntry.name}`);
                setOpenKey(null);
              }
              return result;
            })
          }
        />
      )}

      {upgradeEntry && (
        <IntegrationUpgradeModal
          integrationName={upgradeEntry.name}
          availableOn={
            viewsByKey.get(upgradeEntry.key)?.availableOn ?? []
          }
          currentPlanName={snapshot.planName}
          onClose={() => setUpgradeKey(null)}
        />
      )}

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

function fallbackView(entry: IntegrationCatalogEntry): IntegrationView {
  return {
    key: entry.key,
    status: "disabled",
    config: {},
    configuredAt: null,
    lastError: null,
    hasCredentials: false,
    unlocked: true,
    availableOn: [],
  };
}

function statusOf(
  entry: IntegrationCatalogEntry,
  views: IntegrationView[],
): "activated" | "disabled" | "error" {
  return views.find((v) => v.key === entry.key)?.status ?? "disabled";
}

function hasCredentialsOf(
  entry: IntegrationCatalogEntry,
  views: IntegrationView[],
): boolean {
  return views.find((v) => v.key === entry.key)?.hasCredentials ?? false;
}

function configOf(
  entry: IntegrationCatalogEntry,
  views: IntegrationView[],
): Record<string, unknown> {
  return views.find((v) => v.key === entry.key)?.config ?? {};
}
