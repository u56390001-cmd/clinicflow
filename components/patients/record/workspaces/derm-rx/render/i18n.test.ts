import { describe, expect, it } from "vitest";

import type { RxItem } from "../schema/rx-item";
import { itemText } from "./i18n";

const topical = (): RxItem => ({
  id: "t1",
  brand: "Acretin",
  generic: "Tretinoin",
  isCustom: false,
  route: "topical",
  form: "cream",
  amount: "1 FTU",
  sites: ["Face"],
  frequency: { kind: "daily", morning: 0, noon: 0, night: 1 },
  duration: { kind: "fixed", value: 6, unit: "week" },
  instruction: { mode: "auto", text: "" },
  substitutionAllowed: false,
});

const oral = (): RxItem => ({
  id: "o1",
  brand: "Isotretinoin",
  isCustom: false,
  route: "oral",
  strength: { value: 20, unit: "mg" },
  frequency: { kind: "custom", text: "Jab khana kha liya ho" },
  duration: { kind: "fixed", value: 30, unit: "day" },
  instruction: { mode: "auto", text: "" },
  substitutionAllowed: false,
});

describe("itemText (one source, 3 locales)", () => {
  it("English topical sentence", () => {
    expect(itemText(topical(), "en")).toBe(
      'Apply "1 FTU" on Face — at night — for 6 weeks',
    );
  });

  it("Roman Urdu topical sentence", () => {
    expect(itemText(topical(), "roman")).toBe(
      'Lagayen "1 FTU" par Face — raat — 6 hafte ke liye',
    );
  });

  it("Urdu script sentence is RTL heavy", () => {
    const text = itemText(topical(), "urdu");
    expect(text).toContain("لگائیں");
    expect(text).toContain("رات");
  });

  it("custom instruction passes through untouched", () => {
    const custom: RxItem = {
      ...topical(),
      instruction: { mode: "custom", text: "Pat se pehle chhota patch test" },
    };
    for (const locale of ["en", "roman", "urdu"] as const) {
      expect(itemText(custom, locale)).toBe("Pat se pehle chhota patch test");
    }
  });

  it("oral custom frequency stays as typed in the lead", () => {
    expect(itemText(oral(), "en")).toBe(
      "20 mg — Jab khana kha liya ho — for 30 days",
    );
  });
});
