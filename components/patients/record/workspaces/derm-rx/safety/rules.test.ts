import { describe, expect, it } from "vitest";

import type { RxItem } from "../schema/rx-item";
import { runSafetyChecks, safetySummary } from "./rules";

const topical = (
  brand: string,
  weeks: number,
): RxItem => ({
  id: `t-${brand}`,
  brand,
  isCustom: false,
  route: "topical",
  sites: ["Face"],
  frequency: { kind: "daily", morning: 0, noon: 0, night: 1 },
  duration: { kind: "fixed", value: weeks * 7, unit: "day" },
  instruction: { mode: "auto", text: "" },
  substitutionAllowed: false,
});

const oral = (brand: string, generic?: string): RxItem => ({
  id: `o-${brand}`,
  brand,
  generic,
  isCustom: false,
  route: "oral",
  frequency: { kind: "daily", morning: 1, noon: 0, night: 1 },
  duration: { kind: "fixed", value: 30, unit: "day" },
  instruction: { mode: "auto", text: "" },
  substitutionAllowed: false,
});

describe("allergy conflict (block)", () => {
  it("flags an isotretinoin style allergy hit", () => {
    const findings = runSafetyChecks({
      items: [oral("Isotretinoin 20")],
      allergies: ["isotretinoin"],
    });
    expect(findings.some((f) => f.severity === "block" && f.message.includes("Isotretinoin"))).toBe(true);
  });

  it("passes when no overlap", () => {
    const findings = runSafetyChecks({
      items: [oral("Neuber", "methotrexate")],
      allergies: ["penicillin"],
    });
    expect(findings.filter((f) => f.severity === "block")).toHaveLength(0);
  });
});

describe("duplicate drug (warn)", () => {
  it("catches same brand twice", () => {
    const findings = runSafetyChecks({
      items: [oral("Tacro 0.1%"), topical("TACRO 0.1%", 2)],
      allergies: [],
    });
    expect(findings.some((f) => f.id.startsWith("duplicate:"))).toBe(true);
    expect(safetySummary(findings).warns).toBeGreaterThan(0);
  });
});

describe("topical steroid > 2 weeks (warn)", () => {
  it("flags a 6-week clobetasol course", () => {
    const findings = runSafetyChecks({
      items: [topical("Clobetasol gel", 6)],
      allergies: [],
    });
    expect(
      findings.some((f) => f.message.includes("Clobetasol")),
    ).toBe(true);
  });

  it("does not flag a 2-week course", () => {
    const findings = runSafetyChecks({
      items: [topical("Clobetasol gel", 2)],
      allergies: [],
    });
    expect(findings).toHaveLength(0);
  });
});

describe("isotretinoin checklist", () => {
  const item = () => [oral("Isotretinoin 20")];

  it("blocks when pregnant", () => {
    const findings = runSafetyChecks({
      items: item(),
      allergies: [],
      answers: { pregnancyStatus: "pregnant" },
    });
    expect(
      findings.some((f) => f.severity === "block"),
    ).toBe(true);
  });

  it("warns until pregnancy status is answered", () => {
    const findings = runSafetyChecks({
      items: item(),
      allergies: [],
      answers: { pregnancyStatus: "unknown" },
    });
    const finding = findings.find((f) => f.checklistId === "pregnancy_status");
    expect(finding?.severity).toBe("warn");
  });

  it("goes to info after status confirmation", () => {
    const findings = runSafetyChecks({
      items: item(),
      allergies: [],
      answers: { pregnancyStatus: "not_pregnant" },
    });
    expect(
      findings.some(
        (f) => f.severity === "info" && f.checklistId === "labs_planned",
      ),
    ).toBe(true);
  });
});

describe("methotrexate", () => {
  it("requires lab monitoring", () => {
    const findings = runSafetyChecks({
      items: [oral("Numeta", "methotrexate")],
      allergies: [],
    });
    expect(
      findings.some((f) => f.message.includes("Methotrexate") && f.severity === "warn"),
    ).toBe(true);
  });
});
