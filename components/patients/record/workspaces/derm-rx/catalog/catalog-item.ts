/**
 * Catalog contract for the global medicine search. Legacy data is a plain
 * `string[]` of names (from `useMedicineCatalogueNames`); the adapter lifts
 * it into typed items with empty defaults so the combobox keeps working.
 */

import type { Duration, Frequency, RxRoute } from "../schema/rx-item";

export type CatalogDefaults = {
  frequency?: Frequency;
  duration?: Duration;
  sites?: string[];
  amount?: string;
  instruction?: string;
};

export type CatalogItem = {
  id: string;
  brand: string;
  generic?: string;
  form?: string;
  strengths: string[];
  route: RxRoute | "any";
  defaults: CatalogDefaults;
  tags: string[];
};

/** Lifts legacy `string[]` names into CatalogItems (defaults empty). */
export function catalogFromNames(names: string[]): CatalogItem[] {
  return names.map((name, index) => ({
    id: `catalog-s${index}`,
    brand: name,
    strengths: [],
    route: inferRouteFromName(name),
    defaults: {},
    tags: [],
  }));
}

const TOPICAL_HINT = /cream|ointment|gel|lotion|foam|solution|shampoo|spray|salve|balm|wash/i;

/** Route hint from the name so new rows open in a sensible route. */
export function inferRouteFromName(name: string): RxRoute | "any" {
  if (/\binj|intralesional\b/i.test(name)) return "intralesional";
  if (/\btab(?:s|\.|\b)|\bcap(?:s|\.|\b)|syrup|tablet|capsule|ISOTRET|ANTHI|'\bmouthwash'?/i.test(name))
    return "oral";
  if (TOPICAL_HINT.test(name)) return "topical";
  return "any";
}
