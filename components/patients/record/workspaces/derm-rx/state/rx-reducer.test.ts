import { describe, expect, it } from "vitest";

import type { RxItem } from "../schema/rx-item";
import {
  convertItemRoute,
  fieldsDropped,
  newItemId,
  rxReducer,
} from "./rx-reducer";
import type { RxAction, RxState } from "./rx-reducer";

const topical: RxItem = {
  id: "t-1",
  brand: "Tacto Cream",
  isCustom: false,
  route: "topical",
  form: "Cream",
  amount: "1 FTU",
  sites: ["Pin #1 - Face"],
  strength: { value: 0.05, unit: "%" },
  frequency: { kind: "daily", morning: 0, noon: 0, night: 1 },
  duration: { kind: "fixed", value: 6, unit: "week" },
  instruction: { mode: "custom", text: "thin layer at night" },
  substitutionAllowed: false,
};

const oral: RxItem = {
  id: "o-1",
  brand: "Isotretinoin",
  isCustom: false,
  route: "oral",
  strength: { value: 20, unit: "mg" },
  foodTiming: "after",
  frequency: { kind: "daily", morning: 1, noon: 0, night: 1 },
  duration: { kind: "fixed", value: 30, unit: "day" },
  instruction: { mode: "custom", text: "After meals" },
  substitutionAllowed: false,
};

const initial: RxState = { items: [topical, oral], activeId: null, notice: null };

describe("CHANGE_ROUTE preserves frequency and duration", () => {
  it("topical → oral keeps freq/dur, keeps strength, drops site/vehicle with notice", () => {
    const state = rxReducer(initial, {
      type: "CHANGE_ROUTE",
      id: "t-1",
      route: "oral",
    });
    const item = state.items[0]! as RxItem;
    expect(item.route).toBe("oral");
    expect(item.id).toBe("t-1");
    expect(item.frequency).toEqual({
      kind: "daily",
      morning: 0,
      noon: 0,
      night: 1,
    });
    expect(item.duration).toEqual({ kind: "fixed", value: 6, unit: "week" });
    expect(item.strength).toEqual({ value: 0.05, unit: "%" });
    expect(state.notice).toContain("site");
    expect(state.notice).toContain("vehicle");
  });

  it("oral → topical keeps freq/dur and carries quantity as amount", () => {
    const withQuantity: RxState = {
      ...initial,
      items: [
        { ...oral, id: "o-2", quantity: "30 tablets" },
      ],
    };
    const state = rxReducer(withQuantity, {
      type: "CHANGE_ROUTE",
      id: "o-2",
      route: "topical",
    });
    const item = state.items[0] as RxItem;
    if (item.route !== "topical") throw new Error("expected topical");
    expect(item.frequency.kind).toBe("daily");
    expect(item.duration).toEqual({ kind: "fixed", value: 30, unit: "day" });
    expect(item.amount).toBe("30 tablets");
    expect(item.quantity).toBeUndefined();
  });

  it("oral → intralesional derives concentration from strength", () => {
    const state = rxReducer(initial, {
      type: "CHANGE_ROUTE",
      id: "o-1",
      route: "intralesional",
    });
    const item = state.items[1] as RxItem;
    if (item.route !== "intralesional") throw new Error("expected intralesional");
    expect(item.frequency).toEqual(oral.frequency);
    expect(item.duration).toEqual(oral.duration);
    expect(item.concentration).toBe("20 mg");
    expect(state.notice).toContain("food timing");
  });

  it("REPORTS the exact dropped fields", () => {
    expect(fieldsDropped(topical, "oral")).toEqual([
      "form",
      "amount",
      "sites",
    ]);
    expect(fieldsDropped(oral, "topical")).toEqual(["foodTiming"]);
    expect(fieldsDropped(oral, "oral")).toEqual([]);
  });
});

describe("UPDATE_ITEM", () => {
  it("merges typed patches and validates route invariants", () => {
    const state = rxReducer(initial, {
      type: "UPDATE_ITEM",
      id: "t-1",
      patch: { washOffMin: 10 },
    });
    const item = state.items[0] as RxItem;
    if (item.route !== "topical") throw new Error("expected topical");
    expect(item.washOffMin).toBe(10);
    expect(state.notice).toBeNull();
  });

  it("rejects a foreign route field with a notice, keeps the row intact", () => {
    const state = rxReducer(initial, {
      type: "UPDATE_ITEM",
      id: "t-1",
      patch: (badPatch()) as { foodTiming: "after" },
    });
    const item = state.items[0]! as RxItem;
    if (item.route !== "topical") throw new Error("expected topical");
    expect(item).toEqual(topical);
    expect(state.notice).toContain("not allowed");
  });

  function badPatch(): { foodTiming: "after" } {
    return { foodTiming: "after" };
  }
});

describe("list operations", () => {
  it("reorders by index, never through identity confusion", () => {
    let state = initial;
    const actions: RxAction[] = [{ type: "REORDER", from: 0, to: 1 }];
    for (const action of actions) state = rxReducer(state, action);
    expect(state.items[0]!.id).toBe("o-1");
    expect(state.items[1]!.id).toBe("t-1");
  });

  it("duplicates with a fresh id and keeps the original", () => {
    const state = rxReducer(initial, { type: "DUPLICATE_ITEM", id: "o-1" });
    expect(state.items).toHaveLength(3);
    expect(state.items[2]!.brand).toBe("Isotretinoin (copy)");
    expect(state.items[2]!.id).not.toBe("o-1");
    expect(state.items[1]!.id).toBe("o-1");
  });

  it("removes by id and collapses the active card", () => {
    let state = rxReducer(initial, { type: "SET_ACTIVE", id: "t-1" });
    state = rxReducer(state, { type: "REMOVE_ITEM", id: "t-1" });
    expect(state.items.map((i) => i.id)).toEqual(["o-1"]);
    expect(state.activeId).toBeNull();
  });

  it("generates distinct ids", () => {
    expect(newItemId()).not.toBe(newItemId());
  });
});

describe("convertItemRoute (pure)", () => {
  it("same route returns the item untouched", () => {
    expect(convertItemRoute(topical, "topical")).toBe(topical);
  });

  it("route switch keeps identity", () => {
    const next = convertItemRoute(oral, "intralesional");
    expect(next.id).toBe(oral.id);
    expect(next.frequency).toEqual(oral.frequency);
    expect(next.duration).toEqual(oral.duration);
  });
});
