import assert from "node:assert/strict";
import { register } from "node:module";

/**
 * Golden-case harness for the deterministic Phase 1 scoring engine.
 *
 * The engine (`lib/scoring/*`) is pure TypeScript with no JS test runner in the
 * repo, so this script drives it directly on Node 24 (native type stripping).
 * A small resolver hook maps the app's `@/` alias onto the repo root.
 *
 * Run:  node scripts/scoring-golden.mts
 */

register("./scoring-hooks.mjs", import.meta.url);

const { scoreValidatedInstrument } = await import("@/lib/scoring/registry");
const { validateInstrumentAnswers } = await import("@/lib/scoring/schemas");

const fill = (prefix: string, count: number, value: number): Record<string, number> =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`${prefix}${i + 1}`, value]),
  );

type Case = { name: string; run: () => void };
const cases: Case[] = [];

function test(name: string, run: () => void) {
  cases.push({ name, run });
}

/* ------------------------------- PHQ-9 ----------------------------------- */

test("PHQ-9 severe, item 9 negative — not flagged", () => {
  const answers = { ...fill("phq9_", 8, 3), phq9_9: 0 };
  const r = scoreValidatedInstrument("PHQ-9", answers);
  assert.equal(r.rawScore, 24);
  assert.equal(r.severityBand, "Severe");
  assert.equal(r.isValid, true);
  assert.equal(r.safetyFlagRaised, false);
  assert.equal(r.riskLevel, "NONE");
});

test("PHQ-9 item 9 = 1 — MODERATE safety flag", () => {
  const answers = { ...fill("phq9_", 8, 0), phq9_9: 1 };
  const r = scoreValidatedInstrument("PHQ-9", answers);
  assert.equal(r.isValid, true);
  assert.equal(r.riskLevel, "MODERATE");
  assert.equal(r.safetyFlagRaised, true);
});

test("PHQ-9 item 9 = 2 — HIGH safety flag", () => {
  const answers = { ...fill("phq9_", 8, 0), phq9_9: 2 };
  const r = scoreValidatedInstrument("PHQ-9", answers);
  assert.equal(r.riskLevel, "HIGH");
  assert.equal(r.safetyFlagRaised, true);
});

test("PHQ-9 item 9 missing — invalid (never impute)", () => {
  const r = scoreValidatedInstrument("PHQ-9", fill("phq9_", 8, 0));
  assert.equal(r.isValid, false);
  assert.equal(r.rawScore, null);
  assert.equal(r.severityBand, null);
  assert.match(r.invalidationReason ?? "", /cannot be imputed/);
});

test("PHQ-9 one missing non-9 item — imputed mean, valid", () => {
  const answers = { ...fill("phq9_", 8, 0), phq9_9: 0 };
  delete answers.phq9_1;
  const r = scoreValidatedInstrument("PHQ-9", answers);
  assert.equal(r.isValid, true);
  assert.equal(r.rawScore, 0);
  const missing = r.missingItems.find((m) => m.id === "phq9_1");
  assert.ok(missing?.imputed, "phq9_1 should be imputed");
  assert.equal(missing?.imputedValue, 0);
});

/* ------------------------------- GAD-7 ----------------------------------- */

test("GAD-7 all 2 — Moderate, not flagged", () => {
  const r = scoreValidatedInstrument("GAD-7", fill("gad7_", 7, 2));
  assert.equal(r.rawScore, 14);
  assert.equal(r.severityBand, "Moderate");
  assert.equal(r.safetyFlagRaised, false);
});

test("GAD-7 two missing — invalid (max 1)", () => {
  const answers = fill("gad7_", 7, 1);
  delete answers.gad7_1;
  delete answers.gad7_2;
  const r = scoreValidatedInstrument("GAD-7", answers);
  assert.equal(r.isValid, false);
});

/* ------------------------------- C-SSRS ---------------------------------- */

test("C-SSRS Q2 = No — Q3-Q5 not applicable", () => {
  const r = scoreValidatedInstrument("C-SSRS", {
    cssrs_1: 0,
    cssrs_2: 0,
    cssrs_6: 0,
  });
  assert.equal(r.applicableCount, 3);
  assert.equal(r.rawScore, 0);
  assert.equal(r.severityBand, "No Risk");
  assert.equal(r.safetyFlagRaised, false);
});

test("C-SSRS Q2 = Yes, Q3 = Yes — MODERATE flag", () => {
  const r = scoreValidatedInstrument("C-SSRS", {
    cssrs_1: 0,
    cssrs_2: 1,
    cssrs_3: 1,
    cssrs_4: 0,
    cssrs_5: 0,
    cssrs_6: 0,
  });
  assert.equal(r.applicableCount, 6);
  assert.equal(r.severityBand, "Moderate Risk");
  assert.equal(r.riskLevel, "MODERATE");
  assert.equal(r.safetyFlagRaised, true);
});

test("C-SSRS Q5 = Yes — HIGH flag", () => {
  const r = scoreValidatedInstrument("C-SSRS", {
    cssrs_1: 0,
    cssrs_2: 1,
    cssrs_3: 0,
    cssrs_4: 0,
    cssrs_5: 1,
    cssrs_6: 0,
  });
  assert.equal(r.severityBand, "High Risk");
  assert.equal(r.riskLevel, "HIGH");
  assert.equal(r.safetyFlagRaised, true);
});

test("C-SSRS missing applicable Q6 — invalid (no imputation)", () => {
  const r = scoreValidatedInstrument("C-SSRS", { cssrs_1: 0, cssrs_2: 0 });
  assert.equal(r.isValid, false);
});

/* ------------------------------- PCL-5 ----------------------------------- */

test("PCL-5 all 4 — raw 80, Probable PTSD, cluster sums", () => {
  const r = scoreValidatedInstrument("PCL-5", fill("pcl5_", 20, 4));
  assert.equal(r.rawScore, 80);
  assert.equal(r.severityBand, "Probable PTSD");
  assert.deepEqual(r.subscaleScores, {
    B: 20,
    C: 8,
    D: 28,
    E: 24,
  });
  assert.equal(r.scaledScore, null);
  assert.equal(r.safetyFlagRaised, false);
});

test("PCL-5 all 0 — Below clinical threshold", () => {
  const r = scoreValidatedInstrument("PCL-5", fill("pcl5_", 20, 0));
  assert.equal(r.rawScore, 0);
  assert.equal(r.severityBand, "Below clinical threshold");
});

test("PCL-5 one missing per cluster — imputed, valid", () => {
  const answers = fill("pcl5_", 20, 2);
  for (const id of ["pcl5_1", "pcl5_6", "pcl5_8", "pcl5_15"]) delete answers[id];
  const r = scoreValidatedInstrument("PCL-5", answers);
  assert.equal(r.isValid, true);
  assert.equal(r.missingItems.filter((m) => m.imputed).length, 4);
});

test("PCL-5 two missing in one cluster — invalid", () => {
  const answers = fill("pcl5_", 20, 2);
  delete answers.pcl5_1;
  delete answers.pcl5_2;
  const r = scoreValidatedInstrument("PCL-5", answers);
  assert.equal(r.isValid, false);
  assert.match(r.invalidationReason ?? "", /Cluster/);
});

/* ------------------------------ WHODAS 2.0 ------------------------------- */

test("WHODAS all 4 — raw 48, scaled 100, Extreme", () => {
  const r = scoreValidatedInstrument("WHODAS-2.0", fill("whodas_", 12, 4));
  assert.equal(r.rawScore, 48);
  assert.equal(r.scaledScore, 100);
  assert.equal(r.severityBand, "Extreme disability");
});

test("WHODAS all 1 — raw 12, scaled 25, Moderate", () => {
  const r = scoreValidatedInstrument("WHODAS-2.0", fill("whodas_", 12, 1));
  assert.equal(r.rawScore, 12);
  assert.equal(r.scaledScore, 25);
  assert.equal(r.severityBand, "Moderate disability");
});

test("WHODAS one missing — imputed, valid", () => {
  const answers = fill("whodas_", 12, 2);
  delete answers.whodas_1;
  const r = scoreValidatedInstrument("WHODAS-2.0", answers);
  assert.equal(r.isValid, true);
  assert.equal(r.missingItems[0]?.imputed, true);
});

test("WHODAS two missing — invalid", () => {
  const answers = fill("whodas_", 12, 2);
  delete answers.whodas_1;
  delete answers.whodas_2;
  const r = scoreValidatedInstrument("WHODAS-2.0", answers);
  assert.equal(r.isValid, false);
});

/* ------------------------------- Schemas --------------------------------- */

test("schema rejects an out-of-domain value", () => {
  const bad = validateInstrumentAnswers("PHQ-9", { phq9_1: 9 }, true);
  assert.equal(bad.success, false);
});

test("schema accepts a valid partial subset", () => {
  const ok = validateInstrumentAnswers("PHQ-9", { phq9_1: 2, phq9_9: 0 }, true);
  assert.equal(ok.success, true);
});

/* ------------------------------- Runner ---------------------------------- */

let passed = 0;
const failures: string[] = [];
for (const c of cases) {
  try {
    c.run();
    passed += 1;
    console.log(`  ok   ${c.name}`);
  } catch (error) {
    failures.push(c.name);
    console.error(`  FAIL ${c.name}`);
    console.error(`       ${(error as Error).message}`);
  }
}

console.log(`\n${passed}/${cases.length} scoring golden cases passed.`);
if (failures.length > 0) {
  console.error(`Failed: ${failures.join(", ")}`);
  process.exitCode = 1;
}
