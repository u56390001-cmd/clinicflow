/**
 * Derm Rx draft reducer — the single source of truth for the medicine list
 * while a prescription is being written. Identity is always `id`; array
 * position is presentation order only. Any update that would make a row
 * invalid for its route is rejected with a notice instead of corrupting it.
 */

import type { RxItem, RxRoute } from "../schema/rx-item";
import { rxItemSchema } from "../schema/rx-item";

export type RxState = {
  items: RxItem[];
  /** The one expanded card (accordion rows, Phase 3). */
  activeId: string | null;
  /** One-line user notice, e.g. "food timing not used for Intralesional". */
  notice: string | null;
};

export type RxAction =
  | { type: "ADD_ITEM"; item: RxItem }
  | { type: "UPDATE_ITEM"; id: string; patch: Partial<RxItem> }
  | { type: "CHANGE_ROUTE"; id: string; route: RxRoute }
  | { type: "REMOVE_ITEM"; id: string }
  | { type: "DUPLICATE_ITEM"; id: string }
  | { type: "REORDER"; from: number; to: number }
  | { type: "SET_ACTIVE"; id: string | null }
  | { type: "CLEAR_NOTICE" }
  | { type: "RESET"; items: RxItem[] };

let idSeq = 0;
/** Id generator for new/duplicated rows (uuid when available). */
export function newItemId(): string {
  idSeq += 1;
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `rx-${Date.now().toString(36)}-${idSeq}`;
}

/* ------------------------------ route change ------------------------------ */

/** Route-specific keys each route can hold. */
const ROUTE_KEYS: Record<RxRoute, string[]> = {
  topical: ["form", "amount", "sites", "washOffMin", "strength"],
  oral: ["strength", "foodTiming"],
  intralesional: ["concentration", "volumeMl", "repeatIntervalDays", "strength"],
};

const FIELD_LABELS: Record<string, string> = {
  form: "vehicle",
  amount: "amount (FTU)",
  sites: "site",
  washOffMin: "wash-off",
  strength: "strength",
  foodTiming: "food timing",
  concentration: "concentration",
  volumeMl: "volume per lesion",
  repeatIntervalDays: "repeat interval",
};

/** Route-specific keys of `item` that carry a value. */
function activeKeys(item: RxItem): string[] {
  return ROUTE_KEYS[item.route].filter(
    (key) => (item as unknown as Record<string, unknown>)[key] !== undefined,
  );
}

/** Keys lost when this item switches to `route` (before conversion). */
export function fieldsDropped(item: RxItem, route: RxRoute): string[] {
  if (item.route === route) return [];
  return activeKeys(item).filter((key) => !ROUTE_KEYS[route].includes(key));
}

function dropNotice(item: RxItem, route: RxRoute): string | null {
  const dropped = fieldsDropped(item, route);
  if (dropped.length === 0) return null;
  const fields = dropped
    .map((key) => FIELD_LABELS[key] ?? key)
    .join(", ");
  return `${item.brand}: ${fields} not used for ${route} — adjust the fields.`;
}

/**
 * Route change keeps frequency and duration, carries over whichever fields
 * the new route can hold, and `rxReducer` reports everything it dropped.
 */
export function convertItemRoute(item: RxItem, route: RxRoute): RxItem {
  if (item.route === route) return item;

  const base = {
    id: item.id,
    catalogId: item.catalogId,
    brand: item.brand,
    generic: item.generic,
    isCustom: item.isCustom,
    frequency: item.frequency,
    duration: item.duration,
    quantity: item.quantity,
    taper: item.taper,
    instruction: item.instruction,
    substitutionAllowed: item.substitutionAllowed,
  };
  const at = (key: string): unknown =>
    (item as unknown as Record<string, unknown>)[key];
  const maybe = <T,>(key: string): T | undefined =>
    (at(key) === undefined ? undefined : (at(key) as T));

  if (route === "topical") {
    return {
      ...base,
      route: "topical",
      form: undefined,
      // Digital quantity ("15 g") survives as a free amount.
      amount: base.quantity,
      quantity: undefined,
      strength: maybe("strength"),
      sites: undefined,
      washOffMin: undefined,
    };
  }
  if (route === "intralesional") {
    return {
      ...base,
      route: "intralesional",
      concentration:
        maybe<string>("concentration") ??
        ("strength" in item && item.strength
          ? `${item.strength.value} ${item.strength.unit}`
          : undefined),
      volumeMl: undefined,
      repeatIntervalDays: undefined,
      strength: maybe("strength"),
    };
  }
  return {
    ...base,
    route: "oral",
    strength: maybe("strength"),
    foodTiming: undefined,
    // FTU amounts degrade to a quantity note rather than vanishing.
    quantity: base.quantity ?? maybe<string>("amount"),
  };
}

/* --------------------------------- reducer -------------------------------- */

export function rxReducer(state: RxState, action: RxAction): RxState {
  switch (action.type) {
    case "ADD_ITEM":
      return {
        items: [...state.items, action.item],
        activeId: action.item.id,
        notice: null,
      };

    case "UPDATE_ITEM": {
      let invalid = false;
      const items = state.items.map((item) => {
        if (item.id !== action.id) return item;
        // Route invariant: the merged row must still validate for its route.
        const merged = rxItemSchema.safeParse({ ...item, ...action.patch });
        if (!merged.success) {
          invalid = true;
          return item;
        }
        return merged.data;
      });
      if (invalid) {
        return { ...state, items, notice: "That field is not allowed for this route." };
      }
      return { ...state, items, notice: null };
    }

    case "CHANGE_ROUTE": {
      let notice: string | null = null;
      const items = state.items.map((item) => {
        if (item.id !== action.id) return item;
        notice = dropNotice(item, action.route);
        return convertItemRoute(item, action.route);
      });
      return { ...state, items, notice: notice ?? state.notice };
    }

    case "REMOVE_ITEM":
      return {
        items: state.items.filter((item) => item.id !== action.id),
        activeId: state.activeId === action.id ? null : state.activeId,
        notice: null,
      };

    case "DUPLICATE_ITEM": {
      const index = state.items.findIndex((item) => item.id === action.id);
      if (index === -1) return state;
      const copy: RxItem = {
        ...state.items[index],
        id: newItemId(),
        brand: `${state.items[index].brand} (copy)`,
      };
      const items = [...state.items];
      items.splice(index + 1, 0, copy);
      return { ...state, items, activeId: copy.id, notice: null };
    }

    case "REORDER": {
      const { from, to } = action;
      if (
        from < 0 ||
        to < 0 ||
        from >= state.items.length ||
        to >= state.items.length ||
        from === to
      ) {
        return state;
      }
      const items = [...state.items];
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      return { ...state, items, notice: null };
    }

    case "SET_ACTIVE":
      return { ...state, activeId: action.id, notice: null };

    case "CLEAR_NOTICE":
      return { ...state, notice: null };

    case "RESET":
      return { items: action.items, activeId: null, notice: null };

    default:
      return state;
  }
}
