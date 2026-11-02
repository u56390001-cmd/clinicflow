"use client";

/**
 * Derm Rx editor shell (Phase 3): 2/3 left editor + 1/3 sticky live preview.
 * Below `lg` the preview becomes a bottom sticky bar with a drawer.
 * Sections (AM/PM routine, investigations, advice, notes/follow-up, safety)
 * mount in Phase 4; this file owns layout, search, and the medicine list.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, ServerCrash } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { saveDermRxAction } from "@/lib/actions/specialty-workspaces";

import { MedicineCombobox } from "./catalog/medicine-combobox";
import type { CatalogItem } from "./catalog/catalog-item";
import { catalogFromNames, inferRouteFromName } from "./catalog/catalog-item";
import { readRxItems, type RxItem, type RxRoute } from "./schema/rx-item";
import { parseStrengthOrAmount } from "./schema/rx-item";
import { newItemId } from "./state/rx-reducer";
import { useRxDraft } from "./state/use-rx-draft";
import { MedicineCard, summarizeItem } from "./rows/medicine-card";

export type DermRxEditorProps = {
  patientId: string;
  /** Draft row id the editor edits in place (null = first save inserts). */
  prescriptionId: string | null;
  /** Raw medicines jsonb value (v1 array or v2 envelope). */
  medicinesValue: unknown;
  /** Medicine catalogue brand names (legacy string[] adapter). */
  catalogNames: string[];
  /** Lesion pin labels for site pickers. */
  lesionSites: string[];
  allergies: string[];
  canManage: boolean;
  visitId?: string | null;
};

/** Catalogue row → starter RxItem with route-appropriate defaults. */
function itemFromSelection(
  selection: { item?: CatalogItem; customName?: string },
  itemCount: number,
): RxItem {
  const base = {
    id: newItemId(),
    isCustom: false,
    frequency: { kind: "daily" as const, morning: 1, noon: 0, night: 0 },
    duration: { kind: "fixed" as const, value: 2, unit: "week" as const },
    instruction: { mode: "auto" as const, text: "" },
    substitutionAllowed: false,
  };
  if (selection.item) {
    const c = selection.item;
    const route: RxRoute =
      c.route === "any" ? "oral" : (c.route as RxRoute);
    const firstStrength = c.strengths[0]
      ? parseStrengthOrAmount(c.strengths[0]).strength
      : undefined;
    if (route === "topical") {
      return {
        ...base,
        brand: c.brand,
        generic: c.generic,
        route: "topical",
        form: c.form,
        amount: c.defaults.amount ?? "1 FTU",
        strength: firstStrength,
        sites: c.defaults.sites,
        frequency: c.defaults.frequency ?? base.frequency,
        duration: c.defaults.duration ?? base.duration,
        instruction: { mode: "auto", text: "" },
      };
    }
    if (route === "intralesional") {
      return {
        ...base,
        brand: c.brand,
        generic: c.generic,
        route: "intralesional",
        concentration: c.strengths[0],
        strength: firstStrength,
        frequency: c.defaults.frequency ?? base.frequency,
        duration: c.defaults.duration ?? base.duration,
        instruction: { mode: "auto", text: "" },
      };
    }
    return {
      ...base,
      brand: c.brand,
      generic: c.generic,
      route: "oral",
      strength: firstStrength,
      frequency: c.defaults.frequency ?? base.frequency,
      duration: c.defaults.duration ?? base.duration,
      instruction: { mode: "auto", text: "" },
    };
  }

  // Custom drug: name is whatever the doctor typed.
  const name = (selection.customName ?? "").trim() || `Item ${itemCount + 1}`;
  const hinted = inferRouteFromName(name);
  const route: RxRoute = hinted === "any" ? "oral" : (hinted as RxRoute);
  if (route === "topical") {
    return { ...base, brand: name, isCustom: true, route: "topical" };
  }
  return { ...base, brand: name, isCustom: true, route };
}

export function DermRxEditor(props: DermRxEditorProps) {
  const {
    patientId,
    prescriptionId,
    medicinesValue,
    catalogNames,
    lesionSites,
    allergies,
    canManage,
    visitId,
  } = props;

  const initialItems = useMemo(
    () => readRxItems(medicinesValue),
    [medicinesValue],
  );

  const save = async (snapshot: { schema_version: 2; items: RxItem[] }) => {
    try {
      const result = await saveDermRxAction(
        patientId,
        {
          id: prescriptionId ?? undefined,
          medicines: snapshot,
        },
        visitId,
      );
      if (result.ok) {
        return { ok: true as const };
      }
      return { ok: false as const, message: result.message };
    } catch {
      return { ok: false as const, message: "Network error while saving." };
    }
  };

  const draft = useRxDraft({
    initialItems,
    save,
  });
  const { state, dispatch } = draft;

  const catalogItems = useMemo(
    () => catalogFromNames(catalogNames),
    [catalogNames],
  );
  const searchRef = useRef<React.ComponentRef<typeof MedicineCombobox>>(null);

  // "/" focuses the search from anywhere in the tab.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.altKey || event.ctrlKey || event.metaKey)
        return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const onSelect = (
    selection: { item?: CatalogItem; customName?: string },
  ) => {
    if (!canManage) return;
    dispatch({
      type: "ADD_ITEM",
      item: itemFromSelection(selection, state.items.length),
    });
  };

  const handleRemove = (id: string) => {
    const index = state.items.findIndex((i) => i.id === id);
    if (index === -1) return;
    const removed = state.items[index]!;
    dispatch({ type: "REMOVE_ITEM", id });
    toast.error(`${removed.brand} removed`, {
      action: {
        label: "Undo",
        onClick: () =>
          dispatch({ type: "INSERT_ITEM", item: removed, at: index }),
      },
    });
  };

  const strengthPresetsFor = (route: RxRoute | string): string[] => {
    if (route !== "oral" && route !== "topical") return [];
    return ["0.05%", "2.5%", "1%", "5 mg", "10 mg", "20 mg", "40 mg"];
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Left: editor column */}
      <div className="space-y-3 lg:col-span-2">
        {/* Diagnosis / allergy / safety strip */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-card-line bg-surface px-3 py-2">
          {allergies.length > 0 ? (
            <Badge
              variant="outline"
              className="border-[#f0c9c1] bg-[#fdf1ee] text-[#a33b2a]"
            >
              Allergy: {allergies.slice(0, 2).join(", ")}
              {allergies.length > 2 ? ` +${allergies.length - 2}` : ""}
            </Badge>
          ) : null}
          <Badge variant="outline" className="border-hairline text-text-muted">
            {state.items.length} medicines
          </Badge>
          {draft.dirty && draft.status !== "saving" ? (
            <span className="text-xs text-text-muted">Unsaved</span>
          ) : null}
          {draft.status === "saving" ? (
            <span className="text-xs text-text-muted">Saving…</span>
          ) : null}
          {draft.savedAt && !draft.dirty ? (
            <span className="text-xs text-status-success">
              Saved {draft.savedAt}
            </span>
          ) : null}
          {draft.status === "error" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={draft.retry}
            >
              <ServerCrash className="h-3.5 w-3.5 text-status-destructive" />
              Save failed — Retry
            </Button>
          ) : null}
        </div>

        {draft.notice ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-[#e8dcc2] bg-[#fbf7ee] px-3 py-2 text-xs text-[#8a6d1f]">
            <span>{draft.notice}</span>
            <button
              type="button"
              className="text-[#8a6d1f] hover:underline"
              onClick={draft.clearNotice}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <MedicineCombobox
          ref={searchRef}
          items={catalogItems}
          onSelect={onSelect}
          disabled={!canManage}
        />

        {state.items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline bg-surface px-4 py-8 text-center">
            <p className="text-sm text-text-muted">
              Medicine search mein type karein aur{" "}
              <kbd className="rounded border border-hairline px-1 text-[10px]">Enter</kbd>{" "}
              dabayen — naya card bana jayega.{" "}
              <kbd className="rounded border border-hairline px-1 text-[10px]">/</kbd>{" "}
              se search focus hoti hai.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {state.items.map((item, index) => (
              <MedicineCard
                key={item.id}
                item={item}
                index={index}
                active={state.activeId === item.id}
                isLast={index === state.items.length - 1}
                lesionSites={lesionSites}
                strengthPresets={strengthPresetsFor(item.route)}
                isFavorite={catalogItems.some(
                  (c) => c.brand === item.brand,
                ) /* Phase 3 keeps it simple */}
                onActivate={(id) => dispatch({ type: "SET_ACTIVE", id })}
                onUpdate={(id, patch) =>
                  dispatch({ type: "UPDATE_ITEM", id, patch })
                }
                onChangeRoute={(id, route) =>
                  dispatch({ type: "CHANGE_ROUTE", id, route })
                }
                onRemove={handleRemove}
                onDuplicate={(id) => dispatch({ type: "DUPLICATE_ITEM", id })}
                onToggleFavorite={() => {}}
                onReorder={(from, to) =>
                  dispatch({ type: "REORDER", from, to })
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Right: live preview (desktop sticky) */}
      <div className="hidden lg:block">
        <div className="sticky top-4 rounded-xl border border-card-line bg-surface p-3.5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Live Preview
          </p>
          <div className="space-y-1.5">
            {state.items.map((item, index) => (
              <p
                key={item.id}
                className="flex items-baseline gap-2 text-sm"
              >
                <span className="w-4 text-xs text-text-muted">
                  {index + 1}.
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
                  {item.brand}
                </span>
                <span className="text-xs text-text-muted">
                  {summarizeItem(item)}
                </span>
              </p>
            ))}
            {state.items.length === 0 ? (
              <p className="text-xs text-text-muted">
                Medicines yahan live dikhein gi.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Mobile sticky bottom bar → preview drawer (Dialog-based) */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-surface/95 px-3 py-2 backdrop-blur lg:hidden">
        <MobilePreviewButton items={state.items} />
      </div>
      <BottomActionsSpacer />
    </div>
  );
}

function MobilePreviewButton({ items }: { items: RxItem[] }) {
  const [sheetOpen, setSheetOpenInner] = useState(false);
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-text-muted">
          {items.length} medicines
        </span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setSheetOpenInner(true)}
        >
          <Eye className="h-4 w-4" />
          Live Preview
        </Button>
      </div>
      {sheetOpen ? (
        <div
          role="dialog"
          aria-label="Live preview"
          className="fixed inset-0 z-30 bg-[#0d1512]/40"
          onClick={() => setSheetOpenInner(false)}
        >
          <div
            className="absolute inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-surface p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-text-primary">
                Live Preview
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSheetOpenInner(false)}
              >
                Close
              </Button>
            </div>
            <div className="space-y-1.5">
              {items.map((item, index) => (
                <p key={item.id} className="flex gap-2 text-sm">
                  <span className="w-4 text-xs text-text-muted">
                    {index + 1}.
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {item.brand}
                  </span>
                  <span className="text-xs text-text-muted">
                    {summarizeItem(item)}
                  </span>
                </p>
              ))}
              {items.length === 0 ? (
                <p className="text-xs text-text-muted">Koi medicine nahi.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function BottomActionsSpacer() {
  return <div className="h-14 lg:hidden" aria-hidden />;
}
