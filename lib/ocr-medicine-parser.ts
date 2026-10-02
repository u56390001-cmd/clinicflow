/**
 * Reading a dosage out of an OCR'd medicine line.
 *
 * A scan gives you a string, not a form. "Tab. Rivotril 0.5 mg", "Azithral
 * 500mg", "Pan 40 mg" — the name, the strength and the dosage form are all
 * interleaved, in whatever order the prescriber happened to write them and
 * however badly the scanner mangled the punctuation. Ticking such a row should
 * put something usable in the prescription grid, because the alternative is the
 * doctor retyping a line that is already legible on screen.
 *
 * Everything here is deliberately *suggestive*. Every field it produces is
 * editable, and a wrong guess that the doctor can see and correct is a far
 * smaller problem than a blank row. Where a value is genuinely ambiguous the
 * guess is the most common reading rather than the most literal one — a scan
 * saying "Cap" is a capsule far more often than it is a capital letter.
 */

/**
 * Dosage forms, in the order they are tested.
 *
 * Order matters more than it looks: `capsule` and `cap` are listed before
 * `cap` is allowed to match inside another word, and every entry is matched on
 * word boundaries so "Nasal Spray" is never read as "Sal". Each alias maps to
 * the exact string `MEDICINE_FORMS` holds, so the suggestion is always something
 * the dropdown can actually be set to — a form the select does not offer is a
 * suggestion that cannot be applied.
 */
const FORM_ALIASES: { pattern: RegExp; form: string }[] = [
  { pattern: /\bcapsules?\b/i, form: "Capsule" },
  { pattern: /\bcap\b/i, form: "Capsule" },
  { pattern: /\btablets?\b/i, form: "Tablet" },
  { pattern: /\btab\b/i, form: "Tablet" },
  { pattern: /\bsyrups?\b/i, form: "Syrup" },
  { pattern: /\bsyr\b/i, form: "Syrup" },
  { pattern: /\bsuspensions?\b/i, form: "Suspension" },
  { pattern: /\bsusp\b/i, form: "Suspension" },
  { pattern: /\bsachets?\b/i, form: "Sachet" },
  { pattern: /\bsach\b/i, form: "Sachet" },
  { pattern: /\bcreams?\b/i, form: "Cream" },
  { pattern: /\bcreme\b/i, form: "Cream" },
  { pattern: /\bgels?\b/i, form: "Gel" },
  { pattern: /\bointments?\b/i, form: "Ointment" },
  { pattern: /\boint\b/i, form: "Ointment" },
  { pattern: /\bsuppositories\b/i, form: "Suppository" },
  { pattern: /\bsupp\b/i, form: "Suppository" },
  { pattern: /\bsublingual\b/i, form: "Sublingual" },
  { pattern: /\bpatches?\b/i, form: "Patch" },
  { pattern: /\binhalers?\b/i, form: "Inhaler" },
  { pattern: /\bnebulisers?\b/i, form: "Inhaler" },
  { pattern: /\binjections?\b/i, form: "Injection" },
  { pattern: /\binj\b/i, form: "Injection" },
  { pattern: /\bdrop(s)?\b/i, form: "Drops" },
  { pattern: /\b(nasal\s+)?sprays?\b/i, form: "Nasal Spray" },
  // Routes are written with and without the slash ("S/C", "SC"), and both are
  // common on a strip. They are checked before the dosage forms because the
  // bare `\bsc\b` would otherwise be swallowed by nothing and left in the name.
  { pattern: /\bs\s*\/\s*c\b/i, form: "SC" },
  { pattern: /\bi\s*\/\s*v\b/i, form: "IV" },
  { pattern: /\bi\s*\/\s*m\b/i, form: "IM" },
];

/**
 * Units a strength can be written in.
 *
 * Two shapes, and both are needed because prescriptions use both:
 *
 * - a mass or volume with a unit — `500 mg`, `100 ml`, `1 g`
 * - a compound ratio, which is one product and not two strengths —
 *   `4mg/2ml`, `5mg/2.5ml`. Reading only the leading number would leave
 *   "4mg/2ml" split into a strength of "4mg" and a name containing "/2ml",
 *   which is not a medicine anyone can dispense.
 *
 * `mcg`/`ug`/`µg` are the same unit spelled three ways and all are normal here.
 * `IU` and `%` are included because drops and vitamin preparations are routinely
 * written that way and the strength is the only thing distinguishing two
 * strengths of the same product.
 */
const STRENGTH_PATTERN =
  /\d+(?:[.,]\d+)?\s*(?:mcg|ug|µg|mg|ml|gm|g|iu|%)(?:\s*\/\s*(?:\d+(?:[.,]\d+)?\s*)?(?:mcg|ug|µg|mg|ml|gm|g|iu|%))?/i;

/**
 * Words that describe *how* to take something, never *what* it is. Stripped
 * from the name wherever they appear, so "Tab. Azithral 500 mg" and "Azithral
 * 500 mg Tab" both leave the name "Azithral".
 */
const DOSAGE_WORDS =
  /^\s*(?:tab\.?|tabs\.?|tablet[s]?|cap[s]?|capsule[s]?|sachet[s]?|sach\.?|inj\.?|injn\.?|injn|susp\.?|syr\.?|syrup[s]?|oint\.?|ointment[s]?|cream[s]?|drops?)\s*[.:,-]?\s*/i;

/**
 * Multi-word forms, matched globally because they are as likely to lead the line
 * as to trail it ("Nasal Spray Xylometazoline") and, unlike the single-word
 * aliases, are unambiguous wherever they appear — no risk of matching inside
 * another word, so no word boundary is needed.
 */
const LEADING_MULTI_FORM =
  /^\s*(?:nasal\s+spray|eye\s+drops?|ear\s+drops?|sublingual\s+tab[s]?)\s*[.:,-]?\s*/i;

/**
 * The same single-word dosage markers again, this time trailing the line.
 *
 * Prescriptions are written both ways and a scan preserves whichever the
 * prescriber chose, so "Rivotril 0.5 mg Tab" and "Tab. Rivotril 0.5 mg" are the
 * same medicine with the marker in different places. Stripping only the leading
 * one leaves "Rivotril Tab" as the name — a drug name that does not exist and
 * will not match the catalogue.
 */
const TRAILING_DOSAGE_WORD =
  /\s*[.:,-]?\s*\b(?:tabs?\.?|tablets?|caps?\.?|capsules?|sachets?|sach\.?|inj\.?|injn\.?|injn|susp\.?|syr\.?|syrups?|oint\.?|ointments?|creams?|drops?)\b\.?\s*$/i;

/** The same forms again, this time stripped from anywhere in the line. */
const ANY_MULTI_FORM = /\b(?:nasal\s+spray|eye\s+drops?|ear\s+drops?)\b/gi;

/** Trailing schedule and duration words that belong to the row, not the name. */
const TRAILING_NOISE =
  /\s*[.:,-]?\s*\b(?:od|bd|tds|qid|hs|q\d+h|s\s*\/\s*c|i\s*\/\s*v|i\s*\/\s*m|before\s+food|after\s+food|with\s+food|empty\s+stomach|at\s+bedtime|daily|twice|thrice|x\s*\d+\s*days?|\d+\s*days?)\b.*$/i;

export type ParsedOcrMedicine = {
  /** The medicine's name, strength and form removed. */
  name: string;
  /** `0.5 mg`, normalised to a space before the unit — or `""` if not stated. */
  strength: string;
  /** Exactly one of `MEDICINE_FORMS`, or `""` when no form could be read. */
  form: string;
};

/**
 * Split a scanned medicine line into the three things the grid wants.
 *
 * Order of operations, and why: strip the leading dosage word first, then the
 * trailing schedule, and only then look for a strength in what remains — a line
 * reading "Metformin 500 mg BD (1-0-1)" must not yield the strength "500 mg BD",
 * and it must not yield a name containing "BD". Whatever strength is found is
 * removed from the name so the two do not duplicate each other on screen.
 *
 * Returns empty strings rather than `null` for every absent part: the caller
 * writes straight into form fields, and an empty string clears a cell, whereas a
 * `null` would need its own branch at every call site.
 */
export function parseOcrMedicineString(rawText: string): ParsedOcrMedicine {
  const original = (rawText ?? "").trim();
  if (!original) return { name: "", strength: "", form: "" };

  const form =
    FORM_ALIASES.find(({ pattern }) => pattern.test(original))?.form ?? "";

  // Strength first, on the whole line, and taken from the *first* match: a
  // compound preparation ("Augmentin 625 mg + 125 mg Clavulanic Acid") has two
  // numbers, and the first is the one that identifies the product.
  const strengthMatch = STRENGTH_PATTERN.exec(original);
  const strength = strengthMatch
    ? strengthMatch[0].replace(/\s+/g, " ").replace(/,/g, ".").trim()
    : "";

  let name = original;

  // Remove only the strength text that was actually matched, so the name loses
  // "500 mg" and not some unrelated number elsewhere in the line.
  if (strengthMatch) {
    name = name.replace(strengthMatch[0], " ");
  }

  // Multi-word forms are stripped from anywhere, then a leading single-word
  // dosage marker is stripped, and the pair is repeated because a line can carry
  // more than one ("Tab. Cap. Amoxil 500 mg" does happen). Order is
  // load-bearing: the multi-word rule has to run first or "Nasal Spray" loses
  // only "Nasal" and is left holding "Spray" as the name.
  let previous = "";
  while (name !== previous) {
    previous = name;
    name = name.replace(LEADING_MULTI_FORM, "").replace(DOSAGE_WORDS, "");
  }

  name = name.replace(ANY_MULTI_FORM, " ");
  name = name.replace(TRAILING_DOSAGE_WORD, "");
  name = name.replace(TRAILING_NOISE, "");
  name = name.replace(/\s+/g, " ").replace(/^[.,\s:]+|[.,\s:]+$/g, "");

  // A bare number with no unit ("Brufen 400") is not a strength — it is part of
  // the product's name, the way "Pan 40" and "Augmentin 625" are written on a
  // real strip. Leaving it on the name keeps it visible; splitting it out would
  // put a meaningless "400" in the Route/Form column and lose the identity.
  //
  // Falling back to `original` rather than to an empty name matters most here:
  // a parse that cannot make sense of the line must not produce a blank cell,
  // because a blank cell is invisible where the doctor is looking.
  return { name: name || original, strength, form };
}
