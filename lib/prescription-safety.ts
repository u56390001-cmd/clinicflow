import type { DrugInteractionRule, MedicineEntry } from "@/types/database";

/**
 * Rule-based safety checks for a prescription draft (dermatology spec §8.4).
 *
 * Two sources, both real:
 *
 *   * **Allergy interlock** — the patient's own recorded allergies
 *     (`patients.known_allergies`, plus the dermatology profile's allergy
 *     fields when the derm tab passes them), matched literally against the
 *     drafted medicine names. Literal is deliberate: this system holds no
 *     allergen-to-drug-class mapping, and inventing one ("penicillin" →
 *     every beta-lactam) would be a clinical claim nobody configured. A match
 *     means "same drug name the allergy was recorded under", phrased in the
 *     UI as something to verify, not a verdict.
 *
 *   * **Drug-drug interactions** — rows from `drug_interaction_rules`
 *     (migration 0103). Each side of a rule is a comma-separated list of
 *     name fragments; a fragment matches a draft row on word boundaries,
 *     case-insensitively. A warning fires when two DIFFERENT rows satisfy
 *     the two sides, so a combination product cannot interact with itself
 *     while two separate NSAID rows can.
 *
 * Pure functions only — fetching the rules and presenting the warnings are
 * the caller's jobs. Nothing here blocks a save: these are advisory warnings
 * for a prescriber, not an order set.
 */

export type RxSafetyWarning = {
  /** Stable dedupe/React key: `allergy:<allergen>:<row>` / `interaction:<rule id>`. */
  key: string;
  kind: "allergy" | "interaction";
  severity: "major" | "moderate";
  message: string;
  /** The draft medicine names involved, for display. */
  medicines: string[];
};

const MIN_TERM_LENGTH = 3;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when `term` occurs in `text` on a word/number boundary: "aspirin"
 * matches "Aspirin 75 mg" but not "Aspirinase", "iron" does not match
 * "Ferrous", and "trimoxazole" still matches "Co-trimoxazole" (the hyphen
 * is a boundary).
 */
export function matchesTerm(text: string, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (needle.length < MIN_TERM_LENGTH) return false;
  const escaped = escapeRegExp(needle).replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(
    text.toLowerCase(),
  );
}

/** Split a rule side ("ibuprofen, diclofenac, ...") into its fragments. */
function sideTerms(side: string): string[] {
  return side
    .split(",")
    .map((term) => term.trim())
    .filter((term) => term.length >= MIN_TERM_LENGTH);
}

/**
 * Split a recorded allergy string into allergen terms.
 *
 * Patients' allergies arrive as free text ("Penicillin, Sulfa drugs";
 * "Aspirin / Latex"); commas, semicolons, slashes, pipes and newlines are
 * treated as separators. Short fragments (< 3 chars) are dropped because
 * they cannot match anything honestly.
 */
export function splitAllergens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;/|\n]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= MIN_TERM_LENGTH);
}

export function evaluateRxSafety({
  medicines,
  allergySources,
  rules,
}: {
  medicines: MedicineEntry[];
  /** Raw recorded allergy strings; nullish entries are ignored. */
  allergySources: Array<string | null | undefined>;
  /** Active rules (the caller fetches — global + the clinic's own rows). */
  rules: DrugInteractionRule[];
}): RxSafetyWarning[] {
  const warnings: RxSafetyWarning[] = [];

  const named = medicines
    .map((medicine, index) => ({ index, name: medicine.name.trim() }))
    .filter((row) => row.name.length > 0);

  // --- allergy interlock ---------------------------------------------------
  const seenAllergens = new Set<string>();
  for (const raw of allergySources) {
    for (const allergen of splitAllergens(raw)) {
      const dedupe = allergen.toLowerCase();
      if (seenAllergens.has(dedupe)) continue;
      seenAllergens.add(dedupe);
      for (const row of named) {
        if (!matchesTerm(row.name, allergen)) continue;
        warnings.push({
          key: `allergy:${dedupe}:${row.index}`,
          kind: "allergy",
          severity: "major",
          message: `Recorded allergy to "${allergen}" may conflict with "${row.name}" — verify before prescribing.`,
          medicines: [row.name],
        });
      }
    }
  }

  // --- drug-drug interactions ---------------------------------------------
  for (const rule of rules) {
    if (!rule.is_active) continue;
    const termsA = sideTerms(rule.drug_a);
    const termsB = sideTerms(rule.drug_b);
    if (termsA.length === 0 || termsB.length === 0) continue;

    const sideA = named.filter((row) =>
      termsA.some((term) => matchesTerm(row.name, term)),
    );
    if (sideA.length === 0) continue;
    const sideB = named.filter((row) =>
      termsB.some((term) => matchesTerm(row.name, term)),
    );

    // Two DIFFERENT draft rows must satisfy the two sides: a combination
    // product ("Ibuprofen + Paracetamol") matches its own side once and
    // cannot interact with itself.
    let pair: { a: string; b: string } | null = null;
    for (const a of sideA) {
      for (const b of sideB) {
        if (a.index === b.index) continue;
        pair = { a: a.name, b: b.name };
        break;
      }
      if (pair) break;
    }
    if (!pair) continue;

    warnings.push({
      key: `interaction:${rule.id}`,
      kind: "interaction",
      severity: rule.severity,
      message: rule.message,
      medicines: [pair.a, pair.b],
    });
  }

  // Allergies first, then major before moderate; stable within each group.
  const kindRank = { allergy: 0, interaction: 1 } as const;
  const severityRank = { major: 0, moderate: 1 } as const;
  return warnings.sort(
    (a, b) =>
      kindRank[a.kind] - kindRank[b.kind] ||
      severityRank[a.severity] - severityRank[b.severity],
  );
}
