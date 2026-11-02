/** Lab data constants ported from the legacy builder (identical saved rows). */

export type LabOrderRow = { test_name: string; notes: string };

export type CommonLabTest = { name: string; group: string };

export const COMMON_LAB_TESTS: CommonLabTest[] = [
  { name: "CBC (complete blood count)", group: "Blood" },
  { name: "ESR (erythrocyte sedimentation rate)", group: "Blood" },
  { name: "CRP (C-reactive protein)", group: "Blood" },
  { name: "LFTs (ALT, AST, bilirubin)", group: "Blood" },
  { name: "RFTs (serum creatinine, urea)", group: "Blood" },
  { name: "Fasting blood sugar", group: "Blood" },
  { name: "HbA1c (glycated haemoglobin)", group: "Blood" },
  { name: "Serum triglycerides / lipid profile", group: "Blood" },
  { name: "Serum ferritin", group: "Blood" },
  { name: "Vitamin D (25-OH)", group: "Blood" },
  { name: "Vitamin B12", group: "Blood" },
  { name: "Serum zinc", group: "Blood" },
  { name: "TSH (thyroid stimulating hormone)", group: "Hormonal" },
  { name: "Free testosterone", group: "Hormonal" },
  { name: "DHEA-S", group: "Hormonal" },
  { name: "LH : FSH ratio", group: "Hormonal" },
  { name: "Prolactin", group: "Hormonal" },
  { name: "ANA (antinuclear antibody)", group: "Immune" },
  { name: "KOH mount (skin scraping)", group: "Infection" },
  { name: "Fungal culture & sensitivity", group: "Infection" },
  { name: "VDRL (syphilis serology)", group: "Infection" },
  { name: "HIV 1 & 2 (rapid)", group: "Infection" },
  { name: "HBsAg (hepatitis B surface antigen)", group: "Infection" },
  { name: "Anti-HCV (hepatitis C antibody)", group: "Infection" },
  { name: "Urine routine examination", group: "Urine" },
  { name: "Skin biopsy (histopathology)", group: "Skin" },
];

export const LAB_NOTE_CHIPS = [
  "Fasting 12h",
  "Baseline Test",
  "Repeat 4 Weeks",
  "Urgent",
  "Day 2-5 Cycle",
] as const;

export const LAB_PANELS: {
  name: string;
  tests: { name: string; notes: string }[];
}[] = [
  {
    name: "Retinoid Baseline Panel",
    tests: [
      { name: "CBC (complete blood count)", notes: "Isotretinoin baseline" },
      { name: "LFTs (ALT, AST, bilirubin)", notes: "Isotretinoin baseline" },
      {
        name: "Serum triglycerides / lipid profile",
        notes: "Repeat 4 Weeks",
      },
      { name: "Fasting blood sugar", notes: "Fasting 12h" },
    ],
  },
  {
    name: "Fungal Workup",
    tests: [
      { name: "KOH mount (skin scraping)", notes: "Direct microscopy" },
      { name: "Fungal culture & sensitivity", notes: "Identify species" },
    ],
  },
  {
    name: "Hormonal / PCOS Panel",
    tests: [
      { name: "Free testosterone", notes: "Day 2-5 Cycle" },
      { name: "DHEA-S", notes: "Day 2-5 Cycle" },
      { name: "LH : FSH ratio", notes: "Day 2-5 Cycle" },
    ],
  },
];

/** Notes chips are " · " tags like the legacy builder — same letters on print. */
const LAB_NOTE_DELIM = " · ";

export function toggleLabNote(notes: string, chip: string): string {
  const parts = notes
    .split(LAB_NOTE_DELIM)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.some((part) => part.toLowerCase() === chip.toLowerCase())) {
    return parts
      .filter((part) => part.toLowerCase() !== chip.toLowerCase())
      .join(LAB_NOTE_DELIM);
  }
  return [...parts, chip].join(LAB_NOTE_DELIM);
}

export function labNoteOn(notes: string, chip: string): boolean {
  return notes
    .split(LAB_NOTE_DELIM)
    .some((part) => part.trim().toLowerCase() === chip.toLowerCase());
}

/** Panel merge used by the modal button (dedupe by test name). */
export function mergePanel(
  current: LabOrderRow[],
  panel: (typeof LAB_PANELS)[number],
): { next: LabOrderRow[]; added: number } {
  const existing = new Set(
    current.map((order) => order.test_name.trim().toLowerCase()),
  );
  const additions = panel.tests
    .filter((test) => !existing.has(test.name.toLowerCase()))
    .map((test) => ({ test_name: test.name, notes: test.notes }));
  return { next: [...current, ...additions], added: additions.length };
}
