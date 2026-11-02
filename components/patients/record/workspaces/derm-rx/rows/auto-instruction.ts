/**
 * Auto-instruction sentences (Phase 3, English) — pure function of the item
 * fields for `instruction.mode === "auto"`. render/i18n.ts supersedes the
 * wording per language in Phase 5; the data flow (auto vs custom) stays.
 */

import type { RxItem } from "../schema/rx-item";

function frequencyPhrase(item: RxItem): string {
  if (item.frequency.kind === "daily") {
    const slots: string[] = [];
    if (item.frequency.morning > 0) slots.push("in the morning");
    if (item.frequency.noon > 0) slots.push("in the afternoon");
    if (item.frequency.night > 0) slots.push("at night");
    return slots.length > 0
      ? slots.join(" and ")
      : "daily";
  }
  if (item.frequency.kind === "everyNDays")
    return `every ${item.frequency.n} days`;
  if (item.frequency.kind === "weekdays") {
    const names = item.frequency.days.length
      ? item.frequency.days
          .map((d) =>
            ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d] ?? "",
          )
          .filter(Boolean)
          .join(", ")
      : "chosen weekdays";
    return `on ${names}`;
  }
  if (item.frequency.kind === "timesPerWeek")
    return item.frequency.n === 1 ? "once a week" : `${item.frequency.n} times a week`;
  if (item.frequency.kind === "sos") return "as needed";
  return "";
}

function durationPhrase(item: RxItem): string {
  switch (item.duration.kind) {
    case "fixed": {
      const plural = item.duration.value === 1 ? "" : "s";
      return `for ${item.duration.value} ${item.duration.unit}${plural}`;
    }
    case "continue":
      return "until the doctor advises a stop date";
    case "untilNextVisit":
      return "until the next visit";
    case "custom":
      return "";
  }
}

export function autoInstructionText(item: RxItem): string {
  if (item.route === "topical") {
    const site = item.sites?.length
      ? ` to ${item.sites.join(", ")}`
      : " to the affected area";
    const base = item.form ? `${item.form} ` : "";
    const text = `Apply ${item.amount ?? "a thin layer of"} ${base}${site.charAt(0).toLowerCase()}${site.slice(1)} ${frequencyPhrase(item)} ${durationPhrase(item)}`.trim();
    const wash = item.washOffMin
      ? `. Wash off after ${item.washOffMin} minutes`
      : "";
    return `${text}${wash}`.replace(/\s+([.,])/g, "$1").replace(/\.\./g, ".");
  }

  if (item.route === "oral") {
    const strength = item.strength
      ? `${item.strength.value} ${item.strength.unit}`
      : "";
    const food =
      item.foodTiming === "after"
        ? " after meals"
        : item.foodTiming === "before"
          ? " before meals"
          : item.foodTiming === "with"
            ? " with meals"
            : "";
    return `Take ${strength} ${frequencyPhrase(item)}${food} ${durationPhrase(item)}`.trim();
  }

  // Intralesional
  const site = item.sites?.length ? ` into ${item.sites.join(", ")}` : "";
  const volume = item.volumeMl ? `${item.volumeMl} mL` : "";
  return `Inject ${volume}${site} every ${item.repeatIntervalDays ?? 30} days ${durationPhrase(item)}`.trim();
}
