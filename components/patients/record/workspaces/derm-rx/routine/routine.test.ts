import { describe, expect, it } from "vitest";

import type { RxItem } from "../schema/rx-item";
import { splitBySchedule } from "./routine";

const daily = (id: string, slots: "am" | "pm" | "both" | "noon"): RxItem => ({
  id,
  brand: `D-${id}`,
  isCustom: false,
  route: "topical",
  frequency:
    slots === "both"
      ? { kind: "daily", morning: 1, noon: 0, night: 1 }
      : slots === "am"
        ? { kind: "daily", morning: 1, noon: 0, night: 0 }
        : slots === "pm"
          ? { kind: "daily", morning: 0, noon: 0, night: 1 }
          : { kind: "daily", morning: 0, noon: 1, night: 0 },
  duration: { kind: "fixed", value: 14, unit: "day" },
  instruction: { mode: "auto", text: "" },
  substitutionAllowed: false,
});

const cadence = (id: string, freq: RxItem["frequency"]): RxItem => ({
  id,
  brand: `C-${id}`,
  isCustom: false,
  route: "oral",
  frequency: freq,
  duration: { kind: "fixed", value: 30, unit: "day" },
  instruction: { mode: "auto", text: "" },
  substitutionAllowed: false,
});

describe("splitBySchedule (structured, no keyword matching)", () => {
  it("places daily slots into am and pm", () => {
    const split = splitBySchedule([
      daily("m1", "am"),
      daily("n1", "pm"),
      daily("bd", "both"),
    ]);
    expect(split.am.map((i) => i.id).sort()).toEqual(["bd", "m1"]);
    expect(split.pm.map((i) => i.id).sort()).toEqual(["bd", "n1"]);
    expect(split.other).toHaveLength(0);
  });

  it("files weekly / weekdays / SOS / noon-only under Other schedule", () => {
    const split = splitBySchedule([
      cadence("w1", { kind: "timesPerWeek", n: 1 }),
      cadence("wd", { kind: "weekdays", days: [1, 4] }),
      cadence("s1", { kind: "sos" }),
      cadence("alt", { kind: "everyNDays", n: 2 }),
      daily("noon", "noon"),
    ]);
    expect(split.am).toHaveLength(0);
    expect(split.pm).toHaveLength(0);
    const reasons = split.other.map((o) => o.reason);
    expect(reasons).toContain("Weekly");
    expect(reasons).toContain("Mon/Thu");
    expect(reasons).toContain("SOS");
    expect(reasons).toContain("Every 2 days");
    expect(reasons).toContain("Afternoon only");
  });

  it("never invents an AM/PM entry from customs", () => {
    const split = splitBySchedule([
      cadence("c", { kind: "custom", text: "Jab khujli ho" }),
    ]);
    expect(split.other[0]!.reason).toBe("Jab khujli ho");
  });
});
