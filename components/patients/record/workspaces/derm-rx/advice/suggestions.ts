/**
 * Advice auto-suggestions from the diagnosis + the drugs on the Rx. Pure
 * functions — the card marks suggestions with a `Suggested` badge until the
 * doctor edits the note text.
 */

import type { RxItem } from "../schema/rx-item";

const STEROIDS =
  /\b(clobetasol|halobetasol|betamethasone|mometasone|triamcinolone|hydrocortisone|fluticasone|steroid)\b/i;
const ISOTRETINOIN = /\bisotretinoin|roaccutane|accutane\b/i;
const METHOTREXATE = /\bmethotrexate\b/i;
const ANTIBIOTIC_TOPICAL = /\b(clindamycin|erythromycin|fusidic acid|mupirocin)\b/i;
const RETINOID = /\b(tretinoin|adapalene|tazarotene|retinol|tacto|retino)\b/i;
const BP = /\b(benzoyl peroxide|benzoyl)\b/i;
const ANTIFUNGAL = /\b(ketoconazole|clotrimazole|terbinafine|ciclopirox|itraconazole|fluconazole|antifungal)\b/i;
const SUNSCREEN = /\b(sunscreen|spf)\b/i;

export type AdviceSuggestion = {
  id: string;
  text: string;
  /** Which trigger matched — displayed in the Suggested badge. */
  source: string;
};

export function suggestNotes(
  items: RxItem[],
  diagnosis?: string | null,
): AdviceSuggestion[] {
  const text = (item: RxItem) =>
    `${item.brand} ${"generic" in item ? item.generic ?? "" : ""}`;
  const hay = items.map(text).join(" | ");
  const diagnosisHay = diagnosis ?? "";
  const suggestions: AdviceSuggestion[] = [];

  if (STEROIDS.test(hay) || STEROIDS.test(diagnosisHay)) {
    suggestions.push({
      id: "steroid-duration",
      text: "Do not use beyond 2 weeks without review. Skin thinning se bachne ke liye sirf din ke waqt doctor ki di taraf tak.",
      source: "topical steroid",
    });
  }
  if (ISOTRETINOIN.test(hay)) {
    suggestions.push({
      id: "isotretinoin",
      text: "Pregnancy test + lipids/LFT follow-up labs zaroori hain. Severe dryness par moisturizer lip balm roz istemal karen.",
      source: "isotretinoin",
    });
  }
  if (METHOTREXATE.test(hay)) {
    suggestions.push({
      id: "methotrexate",
      text: "CBC/LFT monitoring schedule ho. Alcohol avoid karen.",
      source: "methotrexate",
    });
  }
  if (BP.test(hay) || RETINOID.test(hay)) {
    suggestions.push({
      id: "acne-routine",
      text: "Subah cleanser + sunscreen; raat ko sirf ek active lagayen (retinoid ya BP — dono ek sath nahi). Peeling ho to do din gap dein.",
      source: "acne actives",
    });
  }
  if (ANTIBIOTIC_TOPICAL.test(hay)) {
    suggestions.push({
      id: "topical-antibiotic",
      text: "Complete the full course; resistance se bachne ke liye self stop na karen.",
      source: "antibiotic",
    });
  }
  if (ANTIFUNGAL.test(hay) || /fungal|tenia|tinea|ringworm/i.test(diagnosisHay)) {
    suggestions.push({
      id: "fungal-hygiene",
      text: "Kaprain roz badlein, jism sukha rakhen; doosre sath towel comb share na karen.",
      source: "antifungal",
    });
  }
  if (SUNSCREEN.test(hay) || /pigment|melasma|photo/i.test(diagnosisHay)) {
    suggestions.push({
      id: "sunscreen",
      text: "Sunscreen 2 ghante baad dobara lagayen; dhoop ke hour ۱۰am–۴pm talak chhatr/faur cover rakhen.",
      source: "sun protection",
    });
  }
  return suggestions;
}
