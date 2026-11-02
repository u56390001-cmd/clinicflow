/**
 * AM/PM routine split driven by STRUCTURED frequencies — no keyword
 * guessing. Only the daily slots (morning/noon/night numbers) place a drug
 * into Subah/Raat; every other cadence (weekly, alternate day, SOS,
 * weekdays) lands in "Other schedule" so nothing is silently mis-filed.
 */

import type { RxItem } from "../schema/rx-item";

export type OtherScheduleRow = {
  item: RxItem;
  /** Short reason, e.g. "Weekly", "Alternate day", "Mon/Thu", "SOS". */
  reason: string;
};

export type RoutineSplit = {
  am: RxItem[];
  pm: RxItem[];
  other: OtherScheduleRow[];
};

export function splitBySchedule(items: RxItem[]): RoutineSplit {
  const am: RxItem[] = [];
  const pm: RxItem[] = [];
  const other: OtherScheduleRow[] = [];

  for (const item of items) {
    if (item.frequency.kind === "daily") {
      if (item.frequency.morning > 0) am.push(item);
      if (item.frequency.night > 0) pm.push(item);
      if (
        item.frequency.morning === 0 &&
        item.frequency.night === 0 &&
        item.frequency.noon > 0
      ) {
        other.push({ item, reason: "Afternoon only" });
      }
      continue;
    }
    other.push({
      item,
      reason: otherReason(item),
    });
  }
  return { am, pm, other };
}

function otherReason(item: RxItem): string {
  switch (item.frequency.kind) {
    case "everyNDays":
      return `Every ${item.frequency.n} days`;
    case "weekdays": {
      const names = item.frequency.days
        .map((d) =>
          ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d] ?? "",
        )
        .filter(Boolean)
        .join("/");
      return names || "Weekdays";
    }
    case "timesPerWeek":
      return item.frequency.n === 1 ? "Weekly" : `${item.frequency.n}×/week`;
    case "sos":
      return "SOS";
    case "custom":
      return item.frequency.text;
  }
  return "Daily";
}
