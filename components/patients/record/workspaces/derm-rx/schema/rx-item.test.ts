import { describe, expect, it } from "vitest";

import {
  itemToLegacyEntry,
  legacyDurationChip,
  legacyFrequencyChip,
  parseDuration,
  parseFrequency,
  parseLegacyItem,
  parseLegacyMedicines,
  parseStrengthOrAmount,
  readRxItems,
  rxEnvelopeSchema,
} from "./rx-item";
import type { LegacyMedicineEntry } from "./rx-item";

const legacy = (
  partial: Partial<LegacyMedicineEntry>,
): LegacyMedicineEntry => ({
  name: "Test drug",
  route: "Topical",
  form: "Cream",
  frequency: "0-0-1 (Night)",
  duration: "14 Days",
  unit: "1 FTU",
  instructions: "",
  ...partial,
});

describe("parseFrequency", () => {
  it("parses the four saved chip strings", () => {
    expect(parseFrequency("1-0-0 (Morning)")).toEqual({
      kind: "daily",
      morning: 1,
      noon: 0,
      night: 0,
    });
    expect(parseFrequency("0-0-1 (Night)")).toEqual({
      kind: "daily",
      morning: 0,
      noon: 0,
      night: 1,
    });
    expect(parseFrequency("1-0-1 (BD)")).toEqual({
      kind: "daily",
      morning: 1,
      noon: 0,
      night: 1,
    });
    expect(parseFrequency("Once Weekly")).toEqual({
      kind: "timesPerWeek",
      n: 1,
    });
  });

  it("parses common free-text variants", () => {
    expect(parseFrequency("1-1-1 (TDS)")).toEqual({
      kind: "daily",
      morning: 1,
      noon: 1,
      night: 1,
    });
    expect(parseFrequency("2-0-2")).toEqual({
      kind: "daily",
      morning: 2,
      noon: 0,
      night: 2,
    });
    expect(parseFrequency("Twice a Week")).toEqual({
      kind: "timesPerWeek",
      n: 2,
    });
    expect(parseFrequency("5 Days a Week")).toEqual({
      kind: "timesPerWeek",
      n: 5,
    });
    expect(parseFrequency("Alternate day")).toEqual({
      kind: "everyNDays",
      n: 2,
    });
    expect(parseFrequency("Every 3 days")).toEqual({
      kind: "everyNDays",
      n: 3,
    });
    expect(parseFrequency("SOS")).toEqual({ kind: "sos" });
    expect(parseFrequency("Mon/Thu")).toEqual({
      kind: "weekdays",
      days: [1, 4],
    });
    expect(parseFrequency("Once daily")).toEqual({
      kind: "daily",
      morning: 1,
      noon: 0,
      night: 0,
    });
    expect(parseFrequency("At night")).toEqual({
      kind: "daily",
      morning: 0,
      noon: 0,
      night: 1,
    });
  });

  it("falls back to custom for unmappable text (never drops)", () => {
    expect(parseFrequency("QID")).toEqual({ kind: "custom", text: "QID" });
    expect(parseFrequency("1-1-1-1")).toEqual({
      kind: "custom",
      text: "1-1-1-1",
    });
    expect(parseFrequency("Jab khujli ho")).toEqual({
      kind: "custom",
      text: "Jab khujli ho",
    });
  });
});

describe("parseDuration", () => {
  const chipCases: Array<[string, number, "day" | "week" | "month"]> = [
    ["7 Days", 7, "day"],
    ["14 Days", 14, "day"],
    ["30 Days", 30, "day"],
    ["45 Days", 45, "day"],
    ["90 Days", 90, "day"],
  ];
  it.each(chipCases)("parses chip %s", (raw, value, unit) => {
    expect(parseDuration(raw)).toEqual({ kind: "fixed", value, unit });
  });

  it("parses weeks / months / until next visit / continue", () => {
    expect(parseDuration("6 Weeks")).toEqual({
      kind: "fixed",
      value: 6,
      unit: "week",
    });
    expect(parseDuration("3 months")).toEqual({
      kind: "fixed",
      value: 3,
      unit: "month",
    });
    expect(parseDuration("Apply for 2 weeks")).toEqual({
      kind: "fixed",
      value: 2,
      unit: "week",
    });
    expect(parseDuration("Until Next Visit")).toEqual({
      kind: "untilNextVisit",
    });
    expect(parseDuration("Continue x2 months")).toEqual({
      kind: "fixed",
      value: 2,
      unit: "month",
    });
    expect(parseDuration("Till review")).toEqual({ kind: "continue" });
  });

  it("falls back to custom (never drops)", () => {
    expect(parseDuration("Jab tak theek na ho")).toEqual({
      kind: "custom",
      text: "Jab tak theek na ho",
    });
  });
});

describe("parseStrengthOrAmount", () => {
  it("maps strength units", () => {
    expect(parseStrengthOrAmount("2.5%")).toEqual({
      strength: { value: 2.5, unit: "%" },
    });
    expect(parseStrengthOrAmount("20 mg")).toEqual({
      strength: { value: 20, unit: "mg" },
    });
    expect(parseStrengthOrAmount("400 IU")).toEqual({
      strength: { value: 400, unit: "IU" },
    });
  });
  it("keeps FTU and free amounts as amount strings", () => {
    expect(parseStrengthOrAmount("1 FTU")).toEqual({ amount: "1 FTU" });
    expect(parseStrengthOrAmount("0.5 FTU")).toEqual({ amount: "0.5 FTU" });
    expect(parseStrengthOrAmount("15 g")).toEqual({ amount: "15 g" });
  });
});

describe("parseLegacyItem", () => {
  it("converts a real world topical row", () => {
    const item = parseLegacyItem(
      legacy({
        name: "Tacto   Cream",
        unit: "0.05%",
        frequency: "0-0-1 (Night)",
        duration: "6 Weeks",
        instructions: "Apply to Pin #1 - Face - thin layer only",
      }),
      "id-1",
    );
    if (item.route !== "topical") throw new Error("expected topical");
    expect(item.brand).toBe("Tacto   Cream");
    expect(item.strength).toEqual({ value: 0.05, unit: "%" });
    expect(item.form).toBe("Cream");
    expect(item.amount).toBeUndefined();
    expect(item.sites).toEqual(["Pin #1 - Face"]);
    expect(item.duration).toEqual({ kind: "fixed", value: 6, unit: "week" });
    expect(item.instruction).toEqual({
      mode: "custom",
      text: "thin layer only",
    });

    const ftuRow = parseLegacyItem(
      legacy({ name: "Moisturiser", unit: "1 FTU" }),
      "id-1b",
    );
    if (ftuRow.route !== "topical") throw new Error("expected topical");
    expect(ftuRow.amount).toBe("1 FTU");
    expect(ftuRow.strength).toBeUndefined();
  });

  it("converts an oral row with strength + food timing", () => {
    const item = parseLegacyItem(
      legacy({
        name: "Isotretinoin",
        route: "Oral",
        form: "",
        unit: "20 mg",
        frequency: "1-0-1 (BD)",
        duration: "30 Days",
        instructions: "After meals - swallow whole with water",
      }),
      "id-2",
    );
    if (item.route !== "oral") throw new Error("expected oral");
    expect(item.strength).toEqual({ value: 20, unit: "mg" });
    expect(item.foodTiming).toBe("after");
    expect(item.instruction.text).toBe("swallow whole with water");
  });

  it("never drops data: odd strings survive in custom slots", () => {
    const item = parseLegacyItem(
      legacy({
        name: "Compound med",
        frequency: "Jab zaroorat ho",
        duration: "Doctor ki hidayat par",
        unit: "custom 15 g pinch",
        instructions: "Pehle garam paani se dho lein",
      }),
      "id-3",
    );
    expect(item.frequency).toEqual({
      kind: "custom",
      text: "Jab zaroorat ho",
    });
    expect(item.duration).toEqual({
      kind: "custom",
      text: "Doctor ki hidayat par",
    });
    expect(item.instruction.text).toContain("garam paani");
  });

  it("marks unknown-route rows custom (oral) but keeps content", () => {
    const item = parseLegacyItem(
      legacy({
        name: "Amox 500",
        route: "",
        form: "",
      }),
      "id-4",
    );
    if (item.route !== "oral") throw new Error("expected oral");
    expect(item.isCustom).toBe(true);
    expect(item.brand).toBe("Amox 500");
  });
});

describe("payload round-trip", () => {
  it("parses a full legacy array through readRxItems", () => {
    const items = parseLegacyMedicines([
      legacy({ name: "A", route: "Topical", form: "Gel" }),
      legacy({ name: "B", route: "Oral", form: "", unit: "10 mg" }),
      legacy({ name: "C", route: "Intralesional", form: "" }),
    ]);
    expect(items).toHaveLength(3);
    expect(items[0].route).toBe("topical");
    expect(items[1].route).toBe("oral");
    expect(items[2].route).toBe("intralesional");
  });

  it("readRxItems handles v1 arrays and v2 envelopes", () => {
    expect(readRxItems([legacy({ name: "A" })])).toHaveLength(1);

    const envelope = rxEnvelopeSchema.parse({
      schema_version: 2,
      items: [
        parseLegacyItem(legacy({ name: "A" }), "envelope-1"),
      ],
    });
    expect(readRxItems(envelope)).toHaveLength(1);
    expect(readRxItems(envelope)[0].id).toBe("envelope-1");

    expect(readRxItems(null)).toEqual([]);
    expect(readRxItems({ junk: true })).toEqual([]);
  });
});

describe("itemToLegacyEntry (template-save bridge)", () => {
  const oral: Parameters<typeof itemToLegacyEntry>[0] = {
    id: "t-1",
    brand: "Isotretinoin",
    generic: "isotretinoin",
    isCustom: false,
    route: "oral",
    strength: { value: 20, unit: "mg" },
    frequency: { kind: "daily", morning: 1, noon: 0, night: 1 },
    duration: { kind: "fixed", value: 4, unit: "week" },
    instruction: { mode: "custom", text: "Do not stop abruptly" },
    substitutionAllowed: false,
  };

  it("renders an oral item into painless legacy chips", () => {
    expect(itemToLegacyEntry(oral)).toMatchObject({
      name: "Isotretinoin",
      route: "Oral",
      form: "",
      frequency: "1-0-1 (BD)",
      duration: "4 Weeks",
      unit: "20 mg",
      instructions: "Do not stop abruptly",
    });
  });

  it("food-timing text is reconstructed from the structured field", () => {
    const withTiming = {
      ...oral,
      instruction: { mode: "custom" as const, text: "After meals" },
    };
    const items = parseLegacyMedicines([itemToLegacyEntry(withTiming)]);
    expect(items[0].route).toBe("oral");
    if (items[0].route === "oral") {
      expect(items[0].foodTiming).toBe("after");
    }
  });

  it("renders a topical item with amount + titled form", () => {
    const topical: Parameters<typeof itemToLegacyEntry>[0] = {
      ...oral,
      route: "topical",
      brand: "Tretinoin",
      form: "gel",
      amount: "1 FTU",
      sites: ["Face"],
    };
    const entry = itemToLegacyEntry(topical);
    expect(entry.route).toBe("Topical");
    expect(entry.form).toBe("Gel");
    expect(entry.unit).toBe("1 FTU");
  });

  it("topical sites fold back into the Apply-to phrase", () => {
    const single: Parameters<typeof itemToLegacyEntry>[0] = {
      ...oral,
      route: "topical",
      form: "cream",
      amount: "2 FTU",
      sites: ["Pin #2 - Face"],
      instruction: { mode: "custom", text: "thin layer only" },
    };
    expect(itemToLegacyEntry(single).instructions).toBe(
      "Apply to Pin #2 - Face — thin layer only",
    );

    const siteless: Parameters<typeof itemToLegacyEntry>[0] = {
      ...single,
      sites: undefined,
    };
    expect(itemToLegacyEntry(siteless).instructions).toBe("thin layer only");
  });

  it("emits chips the parser reads straight back", () => {
    const items = parseLegacyMedicines([itemToLegacyEntry(oral)]);
    expect(items).toHaveLength(1);
    expect(items[0].brand).toBe("Isotretinoin");
    expect(items[0].frequency).toEqual(oral.frequency);
    expect(items[0].duration).toEqual(oral.duration);
    expect(items[0].instruction.mode).toBe("custom");
    expect(items[0].instruction.text).toBe("Do not stop abruptly");
  });

  it("duration chip covers 1 / many and the exotic kinds", () => {
    expect(
      legacyDurationChip({ kind: "fixed", value: 1, unit: "week" }),
    ).toBe("1 Week");
    expect(
      legacyDurationChip({ kind: "fixed", value: 6, unit: "month" }),
    ).toBe("6 Months");
    expect(legacyDurationChip({ kind: "continue" })).toBe("Continue");
    expect(legacyDurationChip({ kind: "untilNextVisit" })).toBe(
      "Until Next Visit",
    );
  });

  it("frequency chip covers the non-daily kinds", () => {
    expect(legacyFrequencyChip({ kind: "sos" })).toBe("SOS (PRN)");
    expect(legacyFrequencyChip({ kind: "timesPerWeek", n: 3 })).toBe("3×/Week");
    expect(legacyFrequencyChip({ kind: "everyNDays", n: 3 })).toBe(
      "Every 3 Days",
    );
    expect(legacyFrequencyChip({ kind: "custom", text: "Ich mita hoon" })).toBe(
      "Ich mita hoon",
    );
  });
});
