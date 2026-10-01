/**
 * The clinic's common-diagnosis list.
 *
 * WHY it exists: a diagnosis is the one field on a prescription a doctor types
 * from memory every single time, and it is the field most worth getting right —
 * it drives the printed copy, the AI summary and the record's own history. A
 * free-text box for it means the same complaint is filed six ways in six weeks
 * ("acute pharyngitis", "pharyngitis", "sore throat"), and a search box over a
 * fixed list means it is filed one way.
 *
 * It is a *list*, not a constraint: `DiagnosisTags` accepts anything typed and
 * keeps it, because a doctor treating something this list has never heard of is
 * doing their job, not making a mistake. The list only saves them the typing.
 *
 * Kept flat and sorted, no categories: a search box over 80 flat strings is
 * faster to hit than a grouped menu at this size.
 */
export const COMMON_DIAGNOSES: string[] = [
  "Abdominal pain",
  "Acid reflux",
  "Acne",
  "Acute bronchitis",
  "Acute gastritis",
  "Acute pharyngitis",
  "Allergic rhinitis",
  "Anaemia",
  "Arthralgia",
  "Asthma",
  "Back pain",
  "Bacterial infection",
  "Candidiasis",
  "Chickenpox",
  "Chronic gastritis",
  "Common cold",
  "Conjunctivitis",
  "Constipation",
  "Cough",
  "Dengue fever",
  "Dehydration",
  "Dental caries",
  "Dermatitis",
  "Diabetes mellitus type 2",
  "Diarrhoea",
  "Dysmenorrhoea",
  "Dyspepsia",
  "Ear infection",
  "Eczema",
  "Enteric fever",
  "Epilepsy",
  "Fever",
  "Fungal infection",
  "Gastritis",
  "Gastroenteritis",
  "Generalised weakness",
  "Headache",
  "Hypertension",
  "Hypothyroidism",
  "Insomnia",
  "Iron deficiency anaemia",
  "Itching",
  "Jaundice",
  "Joint pain",
  "Kidney stone",
  "Malaria",
  "Migraine",
  "Motion sickness",
  "Muscle pain",
  "Nasal congestion",
  "Nausea",
  "Obesity",
  "Otitis media",
  "Painful micturition",
  "Piles",
  "Pneumonia",
  "Rheumatoid arthritis",
  "Scabies",
  "Sinusitis",
  "Skin infection",
  "Sore throat",
  "Spleen enlargement",
  "Stress anxiety",
  "Stroke",
  "Tonsillitis",
  "Toothache",
  "Type 1 diabetes",
  "Urinary tract infection",
  "Urticaria",
  "Viral fever",
  "Vomiting",
  "Wound",
];

/** Lower-cased membership test, built once — the list is a module constant. */
const COMMON_LOOKUP = new Set(COMMON_DIAGNOSES.map((entry) => entry.toLowerCase()));

export function isCommonDiagnosis(value: string): boolean {
  return COMMON_LOOKUP.has(value.trim().toLowerCase());
}

/**
 * Diagnoses matching `query`, best match first. An empty query returns the top
 * of the alphabet, which is what the field shows before anything is typed.
 *
 * Ranking is deliberately naive: a prefix match, then a match on the first word
 * ("fever" finding "viral fever" and "dengue fever" before "acute
 * pharyngitis"), then everything else. No fuzzy matching — at 80 entries an
 * exact prefix is always inside the first six rows, and a typo-correcting
 * search that suggests a different disease is worse than no suggestion.
 */
export function searchDiagnoses(query: string, limit = 6): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return COMMON_DIAGNOSES.slice(0, limit);

  const firstWord = needle.split(/\s+/)[0];
  const scored: { entry: string; rank: number }[] = [];

  for (const entry of COMMON_DIAGNOSES) {
    const haystack = entry.toLowerCase();
    let rank = -1;
    if (haystack === needle) rank = 0;
    else if (haystack.startsWith(needle)) rank = 1;
    else if (firstWord.length > 2 && haystack.split(/\s+/).includes(firstWord)) rank = 2;
    else if (haystack.includes(needle)) rank = 3;
    if (rank >= 0) scored.push({ entry, rank });
  }

  return scored
    .sort((a, b) => a.rank - b.rank || a.entry.localeCompare(b.entry))
    .slice(0, limit)
    .map((item) => item.entry);
}
