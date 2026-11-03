/**
 * i18n for the Rx render pipeline. The structured RxItem turns into text
 * through this one module — editor preview, the share text and the A4 print
 * all consume it, so nothing drifts.
 *
 * Locales:
 *   en     English (LTR)
 *   roman  Roman Urdu (LTR)
 *   urdu   Urdu script (RTL — the document carries direction for print)
 */

import type { Frequency, Duration, RxItem, RxStrength } from "../schema/rx-item";

export type RxLocale = "en" | "roman" | "urdu";

export type TextDirection = "ltr" | "rtl";

export const RX_LOCALES: { key: RxLocale; label: string; ui: string }[] = [
  { key: "en", label: "English", ui: "🇬🇧 English" },
  { key: "roman", label: "Roman Urdu", ui: "🗣️ Roman Urdu" },
  { key: "urdu", label: "اردو", ui: "🌐 اردو (RTL)" },
];

export function localeDirection(locale: RxLocale): TextDirection {
  return locale === "urdu" ? "rtl" : "ltr";
}

/* ----------------------------------------------------------------------------
 * Single-dictionary phrases
 * ------------------------------------------------------------------------- */

type Phrase = Record<RxLocale, string>;

const TIMING: Record<string, Phrase> = {
  morning: { en: "in the morning", roman: "subah", urdu: "صبح" },
  noon: { en: "at midday", roman: "dopahar", urdu: "دوپہر" },
  night: { en: "at night", roman: "raat", urdu: "رات" },
  morningAndNight: {
    en: "morning and night",
    roman: "subah aur raat",
    urdu: "صبح اور رات",
  },
  morningAndNoon: { en: "morning and noon", roman: "subah aur dopahar", urdu: "صبح اور دوپہر" },
  noonAndNight: { en: "noon and night", roman: "dopahar aur raat", urdu: "دوپہر اور رات" },
};

const WEEKDAY_NAMES: { en: string[]; roman: string[]; urdu: string[] } = {
  // 0 = Sunday … 6 = Saturday (matches the weekday schema in rx-item.ts)
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  roman: ["Itwar", "Peer", "Mangal", "Budh", "Jumerat", "Jumma", "Hafta"],
  urdu: ["اتوار", "پیر", "منگل", "بدھ", "جمعرات", "جمعہ", "ہفتہ"],
};

const DURATION_UNIT: Record<"day" | "week" | "month", Phrase> = {
  day: { en: "days", roman: "din", urdu: "دن" },
  week: { en: "weeks", roman: "hafte", urdu: "ہفتے" },
  month: { en: "months", roman: "mahine", urdu: "مہینے" },
};

const T = {
  apply: {
    en: "Apply",
    roman: "Lagayen",
    urdu: "لگائیں",
  } as Phrase,
  on: {
    en: "on",
    roman: "par",
    urdu: "پر",
  } as Phrase,
  continueAction: {
    en: "Continue until this clinic stops it",
    roman: "Consultation update tak continue rakhen",
    urdu: "کلینک اپ ڈیٹ تک جاری رکھیں",
  } as Phrase,
  untilNextVisit: {
    en: "until the next visit",
    roman: "agle visit tak",
    urdu: "اگلے وِزِٹ تک",
  } as Phrase,
  sos: {
    en: "as needed (SOS)",
    roman: "jab zarurat ho (SOS)",
    urdu: "جب ضرورت ہو (SOS)",
  } as Phrase,
  every: {
    en: "every",
    roman: "har",
    urdu: "ہر",
  } as Phrase,
  daysWord: {
    en: "days",
    roman: "din",
    urdu: "دن",
  } as Phrase,
  timesPerWeek: {
    en: "a week",
    roman: "hafte me",
    urdu: "ہفتے میں",
  } as Phrase,
  washOff: {
    en: "Wash off after",
    roman: "Wash off",
    urdu: "دھو لیں",
  } as Phrase,
  minutes: {
    en: "min",
    roman: "min",
    urdu: "منٹ",
  } as Phrase,
};

function phrase(value: Phrase, locale: RxLocale): string {
  return value[locale];
}

/** Number list "1, 2 aur 3" style joiner per locale. */
function joinList(parts: string[], locale: RxLocale): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  const last = parts[parts.length - 1]!;
  const head = parts.slice(0, -1).join(locale === "urdu" ? "، " : ", ");
  const and = locale === "en" ? " and " : locale === "urdu" ? " اور " : " aur ";
  return `${head}${and}${last}`;
}

/* ----------------------------------------------------------------------------
 * Field renderers
 * ------------------------------------------------------------------------- */

export function frequencyLabel(freq: Frequency, locale: RxLocale): string {
  switch (freq.kind) {
    case "daily": {
      const slots: string[] = [];
      if (freq.morning > 0) slots.push(phrase(TIMING.morning, locale));
      if (freq.noon > 0) slots.push(phrase(TIMING.noon, locale));
      if (freq.night > 0) slots.push(phrase(TIMING.night, locale));
      if (slots.length === 0) return "Daily";
      if (slots.length === 1) return slots[0]!;
      if (slots.includes(phrase(TIMING.morning, locale)) && slots.includes(phrase(TIMING.night, locale))) {
        return phrase(TIMING.morningAndNight, locale);
      }
      if (slots.includes(phrase(TIMING.morning, locale)) && slots.includes(phrase(TIMING.noon, locale))) {
        return phrase(TIMING.morningAndNoon, locale);
      }
      return phrase(TIMING.noonAndNight, locale);
    }
    case "weekdays":
      return joinList(freq.days.map((d) => WEEKDAY_NAMES[locale][d]!), locale);
    case "timesPerWeek":
      return `${freq.n} ${phrase(T.timesPerWeek, locale)}`;
    case "everyNDays":
      return `${phrase(T.every, locale)} ${freq.n} ${phrase(T.daysWord, locale)}`;
    case "sos":
      return phrase(T.sos, locale);
    case "custom":
      return freq.text;
  }
}

export function durationLabel(duration: Duration, locale: RxLocale): string {
  switch (duration.kind) {
    case "fixed": {
      const word = phrase(DURATION_UNIT[duration.unit], locale);
      if (locale === "en") return `for ${duration.value} ${word}`;
      if (locale === "urdu") return `${duration.value} ${word} کے لیے`;
      return `${duration.value} ${word} ke liye`;
    }
    case "continue":
      return phrase(T.continueAction, locale);
    case "untilNextVisit":
      return phrase(T.untilNextVisit, locale);
    case "custom":
      return duration.text;
  }
}

export function strengthLabel(strength: RxStrength): string {
  return strength.unit === "%" ? `${strength.value}%` : `${strength.value} ${strength.unit}`;
}

/** Structural sentence for a single line item (auto mode only). */
export function itemText(item: RxItem, locale: RxLocale): string {
  if (item.instruction.mode === "custom") {
    // Custom text travels as the doctor wrote it — never auto-translated.
    return item.instruction.text;
  }
  const parts = [] as string[];

  let action = "";
  if (item.route === "topical") {
    action = phrase(T.apply, locale);
    action += ` "${item.amount}"`;
    const sites = item.sites ?? [];
    if (sites.length > 0) {
      action += ` ${phrase(T.on, locale)} ${joinList(sites, locale)}`;
    }
    if ("strength" in item && item.strength) {
      action += ` (${strengthLabel(item.strength)})`;
    }
    parts.push(action);
    if (item.washOffMin) {
      parts.push(
        `${phrase(T.washOff, locale)} ${item.washOffMin} ${phrase(
          T.minutes,
          locale,
        )}`,
      );
    }
  } else if (item.route === "intralesional") {
    let lesion = "";
    if (item.concentration) lesion = item.concentration;
    if (item.volumeMl) lesion += `${lesion ? " · " : ""}${item.volumeMl} ml`;
    const sites = item.sites ?? [];
    if (sites.length > 0) {
      lesion += `${lesion ? " · " : ""}${phrase(T.on, locale)} ${joinList(
        sites,
        locale,
      )}`;
    }
    if (lesion.trim()) parts.push(lesion);
  } else if ("strength" in item && item.strength) {
    parts.push(strengthLabel(item.strength));
  }

  parts.push(frequencyLabel(item.frequency, locale));
  parts.push(durationLabel(item.duration, locale));
  return parts.filter(Boolean).join(" — ");
}
