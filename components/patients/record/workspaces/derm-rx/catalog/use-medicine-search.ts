"use client";

/**
 * Medicine search state — filters the local catalogue, and keeps per-browser
 * "Recent" and "My favourites" lists in localStorage.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CatalogItem } from "./catalog-item";

const RECENTS_KEY = "derm-rx-recents";
const FAVES_KEY = "derm-rx-favorites";
const MAX_RECENTS = 6;

function readNames(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeNames(key: string, names: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(names));
  } catch {
    // Storage may be unavailable (private mode); search still works.
  }
}

export type SearchResults = {
  query: string;
  favourites: CatalogItem[];
  recent: CatalogItem[];
  catalogue: CatalogItem[];
  /** `Add "{query}" as custom drug` when nothing matches. */
  customCandidate: string | null;
};

export function useMedicineSearch(options: { items: CatalogItem[] }) {
  const { items } = options;
  const [rawQuery, setRawQuery] = useState("");
  const query = rawQuery.trim();

  // 120 ms debounce keeps typing cheap on big catalogues.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 120);
    return () => clearTimeout(timer);
  }, [query]);

  const [recents, setRecents] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    setRecents(readNames(RECENTS_KEY));
    setFavorites(readNames(FAVES_KEY));
  }, []);

  const byId = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  const results: SearchResults = useMemo(() => {
    const q = debounced.toLowerCase();
    const match = (item: CatalogItem) =>
      item.brand.toLowerCase().includes(q) ||
      (item.generic ?? "").toLowerCase().includes(q) ||
      item.tags.some((tag) => tag.toLowerCase().includes(q));
    const filtered =
      debounced === "" ? items : items.filter(match);
    return {
      query: debounced,
      favourites: items.filter((item) => favorites.includes(item.brand)),
      recent: recents
        .slice(0, MAX_RECENTS)
        .map((id) => byId.get(id))
        .filter((item): item is CatalogItem => item !== undefined),
      catalogue: filtered.slice(0, 30),
      customCandidate:
        debounced !== "" && filtered.length === 0 ? debounced : null,
    };
  }, [debounced, items, favorites, recents, byId]);

  const rememberRecent = useCallback((item: CatalogItem) => {
    setRecents((current) => {
      const next = [item.id, ...current.filter((id) => id !== item.id)].slice(
        0,
        MAX_RECENTS,
      );
      writeNames(RECENTS_KEY, next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((item: CatalogItem) => {
    setFavorites((current) => {
      const next = current.includes(item.brand)
        ? current.filter((b) => b !== item.brand)
        : [...current, item.brand];
      writeNames(FAVES_KEY, next);
      return next;
    });
  }, []);

  return {
    query: rawQuery,
    setQuery: setRawQuery,
    results,
    isFavorite: (item: CatalogItem) => favorites.includes(item.brand),
    toggleFavorite,
    rememberRecent,
  };
}
