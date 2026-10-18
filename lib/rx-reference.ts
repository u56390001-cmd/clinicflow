"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { DrugInteractionRule } from "@/types/database";

/**
 * Shared, module-cached reference fetches behind the prescription surfaces
 * (GP RxBuilder, GP consultation form, dermatology Tab 4):
 *
 *   * `useMedicineCatalogueNames` — the clinic's own medicine catalogue
 *     (migration 0057, Organization settings → Prescription → Manage
 *     Medicines) as `name strength` labels for the name-field datalist.
 *     The catalogue is referenced data, not a formulary gate: the input
 *     stays free text, this only offers what the clinic actually stocks.
 *   * `useInteractionRules` — the active `drug_interaction_rules` rows
 *     (migration 0103; global + this clinic's) for the safety panel.
 *
 * Both promises are cached for the lifetime of the page module so every
 * medicine row and every safety panel on a screen costs one query, not one
 * each. A failed fetch clears its cache entry so the next mount retries —
 * an offline first paint shows the empty state rather than erroring, and a
 * later render recovers. `null` from `useInteractionRules` means "still
 * loading", which the panel renders as a loading line rather than a false
 * "no warnings".
 */

const CATALOGUE_LIMIT = 500;
const RULES_LIMIT = 500;

let cataloguePromise: Promise<string[]> | null = null;

async function fetchCatalogueNames(): Promise<string[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("medicines")
      .select("name, strength")
      .eq("is_active", true)
      .order("name")
      .limit(CATALOGUE_LIMIT);
    if (error) return [];
    const labels = (data ?? []).map((row) =>
      `${row.name}${row.strength ? ` ${row.strength}` : ""}`.trim(),
    );
    return labels.filter((label, index) => labels.indexOf(label) === index);
  } catch {
    return [];
  }
}

/** Catalogue labels, cached; a failed load clears the cache to retry later. */
export function medicineSuggestionNames(): Promise<string[]> {
  if (!cataloguePromise) {
    cataloguePromise = fetchCatalogueNames().catch(() => {
      cataloguePromise = null;
      return [];
    });
  }
  return cataloguePromise;
}

let rulesPromise: Promise<DrugInteractionRule[]> | null = null;

async function fetchInteractionRules(): Promise<DrugInteractionRule[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("drug_interaction_rules")
      .select("*")
      .eq("is_active", true)
      .order("created_at")
      .limit(RULES_LIMIT);
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

/** Active interaction rules, cached the same way as the catalogue. */
export function interactionRules(): Promise<DrugInteractionRule[]> {
  if (!rulesPromise) {
    rulesPromise = fetchInteractionRules().catch(() => {
      rulesPromise = null;
      return [];
    });
  }
  return rulesPromise;
}

/** Catalogue labels for a datalist; `[]` until the fetch resolves. */
export function useMedicineCatalogueNames(): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    medicineSuggestionNames().then((next) => {
      if (alive) setNames(next);
    });
    return () => {
      alive = false;
    };
  }, []);
  return names;
}

/**
 * Active interaction rules; `null` while still loading (the safety panel
 * distinguishes "loading" from "loaded and clean" so it never flashes a
 * false all-clear).
 */
export function useInteractionRules(): DrugInteractionRule[] | null {
  const [rules, setRules] = useState<DrugInteractionRule[] | null>(null);
  useEffect(() => {
    let alive = true;
    interactionRules().then((next) => {
      if (alive) setRules(next);
    });
    return () => {
      alive = false;
    };
  }, []);
  return rules;
}
