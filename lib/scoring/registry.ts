import type {
  DiagnosticContext,
  InstrumentDefinition,
  InstrumentRiskLevel,
  MissingItemInfo,
  PatientInstrumentModel,
  ScoringResult,
} from "@/lib/scoring/types";
import { PHQ9 } from "@/lib/scoring/instruments/phq9";
import { GAD7 } from "@/lib/scoring/instruments/gad7";
import { CSSRS } from "@/lib/scoring/instruments/cssrs";
import { PCL5 } from "@/lib/scoring/instruments/pcl5";
import { WHODAS12 } from "@/lib/scoring/instruments/whodas12";

/**
 * Registry + deterministic scoring algorithm for Phase 1 validated instruments.
 *
 * Pure functions only: no DB, no network, no LLM. Safe to call on both the
 * server (authoritative persistence) and the client (live preview).
 */

const INSTRUMENTS: InstrumentDefinition[] = [PHQ9, GAD7, CSSRS, PCL5, WHODAS12];

const BY_CODE: Record<string, InstrumentDefinition> = Object.fromEntries(
  INSTRUMENTS.map((def) => [def.code, def]),
);

/** Case-insensitive lookup of a validated instrument by its code. */
export function getInstrument(code: string | null | undefined): InstrumentDefinition | null {
  if (!code) return null;
  const direct = BY_CODE[code];
  if (direct) return direct;
  const upper = code.trim().toUpperCase();
  return INSTRUMENTS.find((def) => def.code.toUpperCase() === upper) ?? null;
}

export function listInstruments(): InstrumentDefinition[] {
  return [...INSTRUMENTS];
}

export function isValidatedInstrumentCode(code: string | null | undefined): boolean {
  return getInstrument(code) !== null;
}

const RISK_ORDER: Record<InstrumentRiskLevel, number> = {
  NONE: 0,
  LOW: 1,
  MODERATE: 2,
  HIGH: 3,
};

function maxRisk(a: InstrumentRiskLevel, b: InstrumentRiskLevel): InstrumentRiskLevel {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * The item ids that apply to a given set of answers, honouring branching
 * (e.g. C-SSRS Q3-Q5 only when Q2=Yes). Items not named by any branch rule are
 * always applicable.
 */
export function applicableItemIds(
  def: InstrumentDefinition,
  answers: Record<string, number>,
): Set<string> {
  const applicable = new Set(def.items.map((item) => item.id));
  for (const rule of def.branching ?? []) {
    const dependsValue = answers[rule.dependsOn];
    const active =
      dependsValue !== undefined && rule.showWhen.includes(dependsValue);
    for (const id of rule.items) {
      if (active) applicable.add(id);
      else applicable.delete(id);
    }
  }
  return applicable;
}

/**
 * Score a validated instrument from raw answers.
 *
 * @param code        Instrument code (e.g. "PHQ-9").
 * @param answers     Map of item id -> numeric answer.
 * @throws if the instrument code is unknown.
 */
export function scoreValidatedInstrument(
  code: string,
  answers: Record<string, number>,
): ScoringResult {
  const def = getInstrument(code);
  if (!def) {
    throw new Error(`Unknown validated instrument: ${code}`);
  }

  const allItemIds = def.items.map((item) => item.id);
  const itemById = Object.fromEntries(def.items.map((item) => [item.id, item]));
  const applicable = applicableItemIds(def, answers);
  const applicableIds = allItemIds.filter((id) => applicable.has(id));

  const allowedValues = new Set(def.responseOptions.map((option) => option.value));
  const answered: Record<string, number> = {};
  const invalidAnswers: string[] = [];
  for (const id of applicableIds) {
    const value = answers[id];
    if (value === undefined || value === null) continue;
    if (!isFiniteNumber(value) || !allowedValues.has(value)) {
      invalidAnswers.push(id);
      continue;
    }
    answered[id] = value;
  }

  const missingIds = applicableIds.filter((id) => !(id in answered));
  const invalidationReasons: string[] = [];

  if (invalidAnswers.length > 0) {
    invalidationReasons.push(
      `Invalid response value for item(s): ${invalidAnswers.join(", ")}.`,
    );
  }

  // Never-impute items (e.g. PHQ-9 item 9) invalidate the record if unanswered.
  const neverImpute = new Set(def.neverImpute ?? []);
  const missingNeverImpute = missingIds.filter((id) => neverImpute.has(id));
  if (missingNeverImpute.length > 0) {
    invalidationReasons.push(
      `Clinically sensitive item(s) left unanswered and cannot be imputed: ${missingNeverImpute.join(", ")}.`,
    );
  }

  // Missing-data handling.
  const values: Record<string, number> = { ...answered };
  const imputed = new Set<string>();

  const imputation = def.imputation;
  const missingNotNever = missingIds.filter((id) => !neverImpute.has(id));

  if (imputation.method === "none") {
    if (missingNotNever.length > 0) {
      invalidationReasons.push(
        `${missingNotNever.length} required item(s) unanswered (no imputation permitted).`,
      );
    }
  } else if (imputation.method === "mean_answered") {
    if (missingNotNever.length > imputation.maxMissing) {
      invalidationReasons.push(
        `${missingNotNever.length} item(s) unanswered exceeds the maximum of ${imputation.maxMissing}.`,
      );
    } else if (missingNotNever.length > 0) {
      if (Object.keys(answered).length === 0) {
        invalidationReasons.push("No items answered; cannot impute.");
      } else {
        const fallback = mean(Object.values(answered));
        for (const id of missingNotNever) {
          values[id] = fallback;
          imputed.add(id);
        }
      }
    }
  } else {
    // subscale_mean: bounded overall and per-subscale.
    if (missingNotNever.length > imputation.maxMissing) {
      invalidationReasons.push(
        `${missingNotNever.length} item(s) unanswered exceeds the maximum of ${imputation.maxMissing}.`,
      );
    }
    for (const subscale of def.subscales) {
      const subscaleMissing = subscale.itemIds.filter((id) => missingNotNever.includes(id));
      if (subscaleMissing.length > imputation.maxMissingPerSubscale) {
        invalidationReasons.push(
          `Cluster "${subscale.label}" has ${subscaleMissing.length} missing item(s); maximum ${imputation.maxMissingPerSubscale}.`,
        );
      }
    }
    if (invalidationReasons.length === 0) {
      for (const id of missingNotNever) {
        const item = itemById[id];
        const subscale = def.subscales.find((s) => s.id === item?.subscaleId);
        const peers = (subscale?.itemIds ?? applicableIds).filter(
          (peer) => peer !== id && peer in answered,
        );
        if (peers.length === 0) {
          invalidationReasons.push(
            `Cannot impute ${id}: no answered items in its cluster.`,
          );
          continue;
        }
        values[id] = mean(peers.map((peer) => answered[peer]));
        imputed.add(id);
      }
    }
  }

  // Subscale sums (computed from answered + imputed values).
  const subscaleScores: Record<string, number> = {};
  for (const subscale of def.subscales) {
    const ids = subscale.itemIds.filter((id) => applicable.has(id) && id in values);
    subscaleScores[subscale.id] = ids.reduce((sum, id) => sum + (values[id] ?? 0), 0);
  }

  // Safety evaluation runs on the raw answers regardless of validity — a
  // partially completed form can still reveal risk.
  const safetyContext: DiagnosticContext = { answers: values, subscaleScores };
  const safetyReasons: string[] = [];
  let riskLevel: InstrumentRiskLevel = "NONE";
  for (const rule of def.safetyRules) {
    if (isFiniteNumber(values[rule.itemId]) && values[rule.itemId] >= rule.threshold) {
      safetyReasons.push(rule.label);
      riskLevel = maxRisk(riskLevel, rule.riskLevel);
    }
  }
  const override = def.riskOverride ? def.riskOverride(safetyContext) : null;
  if (override) {
    riskLevel = maxRisk(riskLevel, override.riskLevel);
    if (override.riskLevel !== "NONE") safetyReasons.push(...override.reasons);
  }
  const safetyFlagRaised = riskLevel === "MODERATE" || riskLevel === "HIGH";

  const isValid = invalidationReasons.length === 0;

  let rawScore: number | null = null;
  let scaledScore: number | null = null;
  let severityBand: string | null = null;
  let diagnosticCriteria: Record<string, unknown> = {};

  if (isValid) {
    rawScore = Math.round(
      applicableIds.reduce((sum, id) => sum + (values[id] ?? 0), 0),
    );
    scaledScore = def.scaledScore ? def.scaledScore(rawScore) : null;
    if (def.deriveSeverity) {
      severityBand = def.deriveSeverity({
        rawScore,
        riskLevel,
        answers: values,
        subscaleScores,
      });
    } else {
      const band = def.scoring.bands.find(
        (b) => rawScore! >= b.min && rawScore! <= b.max,
      );
      severityBand = band?.label ?? null;
    }
    diagnosticCriteria = def.diagnosticCriteria
      ? def.diagnosticCriteria(safetyContext).result
      : {};
  }

  const missingItems: MissingItemInfo[] = missingIds.map((id) => ({
    id,
    text: itemById[id]?.text ?? id,
    imputed: imputed.has(id),
    imputedValue: imputed.has(id) ? values[id] : undefined,
  }));

  return {
    instrumentCode: def.code,
    instrumentVersion: def.version,
    instrumentName: def.name,
    rawScore,
    scaledScore,
    subscaleScores: isValid ? subscaleScores : {},
    severityBand,
    diagnosticCriteria,
    safetyFlagRaised,
    riskLevel,
    safetyReasons: Array.from(new Set(safetyReasons)),
    isValid,
    invalidationReason: isValid ? null : invalidationReasons.join(" "),
    missingItems,
    answeredCount: Object.keys(answered).length,
    applicableCount: applicableIds.length,
  };
}

/**
 * Serializable metadata snapshot persisted onto each response
 * (`psych_assessments.template_snapshot` / `instrument_meta`). Contains the
 * rules used to produce a score so it can be re-audited even if the definition
 * later changes.
 */
export function toInstrumentMeta(def: InstrumentDefinition) {
  return {
    code: def.code,
    version: def.version,
    name: def.name,
    timeframe: def.timeframe,
    scoring: def.scoring,
    subscales: def.subscales,
    imputation: def.imputation,
    safetyRules: def.safetyRules,
    neverImpute: def.neverImpute ?? [],
    branching: def.branching ?? [],
    responseOptions: def.responseOptions,
  };
}

/** Serializable, function-free view for patient-facing client rendering. */
export function toPatientInstrumentModel(
  def: InstrumentDefinition,
): PatientInstrumentModel {
  return {
    code: def.code,
    name: def.name,
    instructions: def.instructions,
    timeframe: def.timeframe,
    maxScore: def.scoring.maxScore,
    items: def.items.map((item) => ({
      id: item.id,
      text: item.text,
      subscaleId: item.subscaleId,
    })),
    options: def.responseOptions,
    branching: def.branching ?? [],
  };
}
