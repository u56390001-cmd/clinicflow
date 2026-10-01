/**
 * Standard sub-parameter lists for the lab panels a GP orders by name.
 *
 * Why this is a literal table and not a free-text list: "CBC" on its own is not
 * an order, it is a family of tests, and the bill the patient sees is per
 * parameter. A doctor writing "CBC" and a doctor writing "Hb + Platelets only"
 * mean different investigations at different prices, so the chip has to be able
 * to say which one it means. The panel name alone cannot carry that.
 *
 * The parameter names are the ones printed on the lab's own report, because the
 * doctor reads them off the previous report and ticks the same rows. Short
 * forms are kept where the report itself uses them (`Hb`, `TLC / DLC`) so the
 * checklist matches the paper in front of the doctor instead of a textbook.
 */
export type LabPanel = {
  /** The panel as the doctor types it into the order field. */
  name: string;
  /** Parameters in the order the report lists them. */
  parameters: string[];
};

/**
 * Matched on a normalised panel name, so "cbc", "CBC " and "Complete Blood
 * Count" all reach the same list. Keys are lowercase with collapsed whitespace.
 */
const PANEL_PARAMETERS: Record<string, string[]> = {
  /** Complete Blood Count. */
  cbc: [
    "Hemoglobin (Hb)",
    "Total Leukocyte Count (TLC)",
    "Differential Leucocyte Count (DLC)",
    "Platelets",
    "ESR",
  ],
  /** Renal Function Test. */
  rft: [
    "Blood Urea",
    "Serum Creatinine",
    "Estimated GFR (eGFR)",
    "Serum Uric Acid",
    "Serum Electrolytes",
  ],
  /** Liver Function Test. */
  lft: [
    "Total Bilirubin",
    "SGPT (ALT)",
    "SGOT (AST)",
    "Alkaline Phosphatase",
    "Total Protein / Albumin",
  ],
  "lipid profile": [
    "Total Cholesterol",
    "Triglycerides (TG)",
    "HDL Cholesterol",
    "LDL Cholesterol",
    "VLDL Cholesterol",
  ],
};

/**
 * A second name doctors use for the same investigation.
 *
 * `kft` is here because the order field's own suggestion list offers it — a
 * suggestion with no gear behind it would teach the doctor that the chip's
 * checklist is unreliable, so the two lists are kept in step deliberately.
 */
const PANEL_ALIASES: Record<string, string> = {
  "complete blood count": "cbc",
  "c.b.c": "cbc",
  "cbc with esr": "cbc",
  "renal function test": "rft",
  kft: "rft",
  "kidney function test": "rft",
  "liver function test": "lft",
  "lft with bilirubin": "lft",
  "lipid profile": "lipid profile",
  lipid: "lipid profile",
  "lipid studies": "lipid profile",
};

/**
 * Resolves a typed panel name to its parameter list, or `null` when the test
 * has no standard breakdown.
 *
 * `null` is the load-bearing case: a doctor typing "Dengue NS1" or "TSH" gets a
 * plain chip with no gear, because offering a checklist for a test with no
 * standard sub-parameters would be inventing structure the lab does not have.
 */
export function labPanelParameters(testName: string): string[] | null {
  const key = testName.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return null;
  return PANEL_PARAMETERS[key] ?? PANEL_PARAMETERS[PANEL_ALIASES[key]] ?? null;
}

/**
 * The short form a parameter is known by on a chip: "Hemoglobin (Hb)" reads as
 * "Hb", so a narrowed chip says `CBC (Hb, Platelets)` rather than
 * `CBC (Hemoglobin (Hb), Platelets)` — which is unreadable at chip width and
 * is a parenthesis inside a parenthesis.
 *
 * Parameters without a parenthetical are returned unchanged, so "ESR" and
 * "Platelets" survive intact.
 */
function shortParameterName(parameter: string): string {
  const match = /^(.*?)\s*\(([^()]+)\)$/.exec(parameter.trim());
  return match ? match[2].trim() : parameter.trim();
}

/**
 * The label on the order chip: "CBC" when whole, "CBC (Platelets, ESR)" when
 * narrowed.
 *
 * The parentheses matter clinically — a chip that reads only "CBC" after the
 * doctor has unticked four parameters is a chip that lies about the order. The
 * parameters are joined in the checklist's own order, never the selection
 * order, so the same set of ticks always produces the same string and the
 * prescription does not churn between saves.
 *
 * Three or more parameters collapse to a count: a chip has to stay a chip, and
 * "CBC (Hb, TLC, DLC, Platelets, ESR)" is a sentence, not a label.
 */
export function labTestLabel(
  testName: string,
  subParameters: string[] | null | undefined,
): string {
  if (!subParameters || subParameters.length === 0) return testName;
  const known = labPanelParameters(testName);
  // A selection that covers the whole panel is not a narrowing, so it must not
  // print as one — "CBC (Hb, TLC, DLC, Platelets, ESR)" and "CBC" are the same
  // order, and the long form would send the reader looking for a difference.
  // It prints exactly like the empty case above, so the chip does not change
  // text just because the doctor re-ticked a row it was already getting.
  if (known && subParameters.length === known.length) return testName;
  if (subParameters.length > 2) {
    return `${testName} (${subParameters.length} selected)`;
  }
  return `${testName} (${subParameters.map(shortParameterName).join(", ")})`;
}
