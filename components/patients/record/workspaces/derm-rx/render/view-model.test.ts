import { describe, expect, it } from "vitest";

import type { RxItem } from "../schema/rx-item";
import type { RxLocale } from "./i18n";
import { buildRxViewModel, documentToShareText } from "./view-model";

const item = (): RxItem => ({
  id: "t1",
  brand: "Acretin",
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

describe("buildRxViewModel", () => {
  it("renders the same structured item into 3 locales (1 source)", () => {
    const build = (locale: RxLocale) =>
      buildRxViewModel({
        locale,
        items: [item()],
        patient: { name: "Ali" },
        clinician: "Dr. Test",
      });
    const en = build("en");
    const roman = build("roman");
    const urdu = build("urdu");
    expect(en.lines[0]!.detail).toBe(
      'Apply "1 FTU" on Face — at night — for 6 weeks',
    );
    expect(roman.lines[0]!.detail).toContain("Lagayen");
    expect(urdu.lines[0]!.detail).toContain("لگائیں");
    expect(urdu.direction).toBe("rtl");
    expect(en.direction).toBe("ltr");
  });

  it("includes labs + advice + follow-up sections once", () => {
    const doc = buildRxViewModel({
      locale: "en",
      items: [item()],
      patient: { name: "Ali" },
      clinician: "Dr. Test",
      meta: {
        application: "Thin layer",
        education: "Avoid harsh soaps",
        skincareAm: ["Sunscreen SPF 50"],
        skincarePm: ["Moisturiser"],
      },
      labs: [{ test_name: "LFTs (ALT, AST, bilirubin)", notes: "Baseline" }],
      followUp: "2 Weeks",
    });
    const headings = doc.sections.map((s) => s.heading);
    expect(headings).toContain("AM / PM routine");
    expect(headings).toContain("Investigations");
    expect(headings).toContain("Application");
    expect(doc.sections.some((s) => s.columns?.[0]?.lines[0] === "Sunscreen SPF 50")).toBe(true);
    expect(doc.followUp).toBe("2 Weeks");
  });

  it("share text mirrors the print lines", () => {
    const doc = buildRxViewModel({
      locale: "roman",
      items: [item()],
      patient: { name: "Ali" },
      clinician: "Dr. Test",
      followUp: " bele faith ",
    });
    const text = documentToShareText(doc);
    expect(text.startsWith("Ali —")).toBe(true);
    expect(text).toContain("1. Acretin: Lagayen");
    expect(text.endsWith("— Dr. Test")).toBe(true);
  });

  it("empty items still produce a valid document", () => {
    const doc = buildRxViewModel({
      locale: "en",
      items: [],
      patient: { name: "X" },
      clinician: "Dr. Y",
    });
    expect(doc.lines).toHaveLength(0);
    expect(doc.sections).toHaveLength(0);
  });
});
