import { DASS21_TRANSLATIONS } from "@/lib/assessments/translations/dass21";
import { GAD7_TRANSLATIONS } from "@/lib/assessments/translations/gad7";
import { PHQ9_TRANSLATIONS } from "@/lib/assessments/translations/phq9";

/**
 * 3-way patient-localisation registry (English / Urdu Nastaliq / Roman Urdu).
 *
 * STRICTLY a presentation layer: every lookup is keyed by the *numeric* option
 * value and the engine item id, so scoring payloads, the answers JSONB and the
 * deterministic engine stay language-agnostic. Anything missing — including
 * every custom clinic template — falls back to the English stored text.
 */

export type AssessmentLanguage = "en" | "ur" | "roman_ur";

export const LANG_ORDER: AssessmentLanguage[] = ["en", "ur", "roman_ur"];

export type LocalizedText = { en: string; ur?: string; roman_ur?: string };

export type InstrumentTranslationPack = {
  /** Engine/legacy instrument code this pack translates. */
  code: string;
  instructions?: LocalizedText;
  /** Item text keyed by the engine item id (`phq9_1`, `dass21_7`, ...). */
  items: Record<string, LocalizedText>;
  /** Option labels keyed by the numeric option VALUE (never re-keyed). */
  options: Record<number, LocalizedText>;
};

const PACKS: Record<string, InstrumentTranslationPack> = {
  [PHQ9_TRANSLATIONS.code]: PHQ9_TRANSLATIONS,
  [GAD7_TRANSLATIONS.code]: GAD7_TRANSLATIONS,
  [DASS21_TRANSLATIONS.code]: DASS21_TRANSLATIONS,
};

/** Resolve a pack by instrument code; custom templates get null (English only). */
export function getInstrumentTranslation(
  instrumentCode: string | null | undefined,
): InstrumentTranslationPack | null {
  if (!instrumentCode) return null;
  return PACKS[instrumentCode] ?? null;
}

/** Fallback rule: prefer the requested language, then English. */
export function resolveLocalized(
  text: LocalizedText | undefined,
  lang: AssessmentLanguage,
): string | undefined {
  if (!text) return undefined;
  return text[lang] ?? text.en;
}

/** Browser-locale detection for the toggle default (server or client). */
export function detectLanguage(acceptLanguage: string | null | undefined): AssessmentLanguage {
  const first = acceptLanguage?.split(",")?.[0]?.trim().toLowerCase() ?? "";
  const base = first.split(";")[0]?.slice(0, 2) ?? "";
  // Pakistani / Arab script locales default to Urdu; everything else English.
  if (["ur", "ar", "ps", "pa", "sd"].includes(base)) return "ur";
  return "en";
}

export function languageFromClient(): AssessmentLanguage {
  if (typeof navigator === "undefined") return "en";
  return detectLanguage(navigator.language ?? "");
}

export function dirForLanguage(lang: AssessmentLanguage): "ltr" | "rtl" {
  return lang === "ur" ? "rtl" : "ltr";
}

/** Urdu mode gets the Nastaliq face with a comfortable line-height. */
export function urduTypographyClass(lang: AssessmentLanguage): string {
  return lang === "ur" ? "font-urdu leading-relaxed" : "";
}

const LANAGUAGE_LABELS: Record<AssessmentLanguage, string> = {
  en: "English",
  ur: "اردو",
  roman_ur: "Roman Urdu",
};

export function languageLabel(lang: AssessmentLanguage): string {
  return LANAGUAGE_LABELS[lang];
}

/* --------------------------- UI chrome strings ---------------------------- */

type UiKey =
  | "submit"
  | "submitting"
  | "back"
  | "next"
  | "answeredOf"
  | "questionOf"
  | "errorIncomplete"
  | "errorSubmitFailed"
  | "submittedTitle"
  | "thankYouBody"
  | "thankYouBand"
  | "thankYouBodyPlain"
  | "closeNote"
  | "emptyTitle"
  | "emptyBody"
  | "footnote"
  | "noQuestionsNote";

const UI_STRINGS: Record<UiKey, LocalizedText> = {
  submit: {
    en: "Submit answers",
    ur: "جوابات جمع کروائیں",
    roman_ur: "Jawabat jama karwayen",
  },
  submitting: {
    en: "Submitting…",
    ur: "جمع کروایا جا رہا ہے…",
    roman_ur: "Jama kiya ja raha hai…",
  },
  back: { en: "Back", ur: "واپس", roman_ur: "Peechay" },
  next: { en: "Next", ur: "اگلا", roman_ur: "Agla" },
  answeredOf: {
    en: "{answered} of {total} answered",
    ur: "{total} میں سے {answered} کے جواب دیے",
    roman_ur: "{total} mein se {answered} ke jawab diye",
  },
  questionOf: {
    en: "Question {current} of {total}",
    ur: "سوال {current} از {total}",
    roman_ur: "Sawal {current} az {total}",
  },
  errorIncomplete: {
    en: "Please answer every question before submitting.",
    ur: "جمع کروانے سے پہلے ہر سوال کا جواب دیں۔",
    roman_ur: "Jama karwanay se pehle har sawal ka jawab dein.",
  },
  errorSubmitFailed: {
    en: "We couldn't save your answers. Please try again.",
    ur: "آپ کے جوابات محفوظ نہیں ہو سکے۔ براہِ کرم دوبارہ کوشش کریں۔",
    roman_ur: "Aapke jawabat mehfooz nahi ho sake. Barah-e-karam dobara koshish karein.",
  },
  submittedTitle: {
    en: "Submitted",
    ur: "جمع کروا دیا گیا",
    roman_ur: "Jama karwa diya gaya",
  },
  thankYouBody: {
    en: "Thank you. Your {instrument} answers were shared with {clinic}.",
    ur: "شکریہ۔ آپ کے {instrument} کے جوابات {clinic} کے ساتھ شیئر کر دیے گئے۔",
    roman_ur:
      "Shukriya. Aapke {instrument} ke jawabat {clinic} ke sath share kar diye gaye.",
  },
  thankYouBand: {
    en: " The result falls in the \"{band}\" range — your clinician will review it with you.",
    ur: " نتیجہ \"{band}\" کے دائرے میں آتا ہے — آپ کے ڈاکٹر اس کا جائزہ آپ کے ساتھ لیں گے۔",
    roman_ur:
      " Nateeja \"{band}\" ke dairay mein aata hai — aapke doctor ise aapke sath jaiza lainge.",
  },
  thankYouBodyPlain: {
    en: " Your clinician will review it with you.",
    ur: " آپ کے ڈاکٹر اس کا جائزہ آپ کے ساتھ لیں گے۔",
    roman_ur: " Aapke doctor ise aapke sath jaiza lein.",
  },
  closeNote: {
    en: "You can close this page now.",
    ur: "اب آپ یہ صفحہ بند کر سکتے ہیں۔",
    roman_ur: "Ab aap ye page band kar sakte hain.",
  },
  emptyTitle: {
    en: "This questionnaire has no questions",
    ur: "اس سوالنامے میں کوئی سوال نہیں",
    roman_ur: "Is sawal-namay mein koi sawal nahi hai",
  },
  emptyBody: {
    en: "Please ask {clinic} for a fresh link.",
    ur: "براہِ کرم {clinic} سے نیا لنک طلب کریں۔",
    roman_ur: "Barah-e-karam {clinic} se naya link talab karein.",
  },
  footnote: {
    en: "Shared securely & privately with {clinic}. This is an evaluation tool — your clinician will review and interpret your responses.",
    ur: "آپ کے جوابات صرف {clinic} کے ساتھ محفوظ رہتے ہیں۔ یہ ایک جائیزہ ٹول ہے — حتمی تشریح آپ کے ڈاکٹر کریں گے۔",
    roman_ur:
      "Aapke jawabat sirf {clinic} ke sath mehfooz rehte hain. Ye ek jaiza tool hai — batami tabeer aapke doctor karenge.",
  },
  noQuestionsNote: {
    en: "\"{text}\" is answered with your clinician.",
    ur: "\"{text}\" کا جواب آپ کے ڈاکٹر کے ساتھ دیا جائے گا۔",
    roman_ur: "\"{text}\" ka jawab aapke doctor ke sath diya jayega.",
  },
};

/** English-first template strings for the patient-facing chrome. */
export function uiString(
  key: UiKey,
  lang: AssessmentLanguage,
  params: Record<string, string | number> = {},
): string {
  const text = UI_STRINGS[key][lang] ?? UI_STRINGS[key].en;
  return Object.entries(params).reduce(
    (acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)),
    text,
  );
}
