/**
 * Phase 1 deterministic scoring engine — types.
 *
 * Spec: docs/medbook-ai-phase1-specification.md §1, §4.
 *
 * These types describe a *validated instrument* as pure data plus, where a
 * published rule cannot be expressed as a simple table, a pure function
 * (diagnostic criteria, risk stratification). The engine in `registry.ts`
 * consumes them and produces a `ScoringResult`.
 *
 * CLINICAL NOTE: no LLM is involved anywhere in this module. Every number here
 * is computed deterministically from the submitted answers. LLMs are only used
 * elsewhere to write a narrative *after* scoring (`generateAssessmentInterpretationAction`).
 */

export type InstrumentRiskLevel = "NONE" | "LOW" | "MODERATE" | "HIGH";

export type InstrumentOption = { value: number; label: string };

/** One administered item. `subscaleId` groups items (PCL-5 clusters, WHODAS domains). */
export type InstrumentItem = {
  id: string;
  text: string;
  subscaleId?: string;
};

export type SeverityBand = { min: number; max: number; label: string };

export type InstrumentSubscale = {
  id: string;
  label: string;
  itemIds: string[];
};

/**
 * A conditional branch: `items` are only applicable when `dependsOn` is
 * answered with one of `showWhen`. Items not covered by any branch are always
 * applicable. Serializable so both the server engine and the patient client
 * agree on which items exist for a given response.
 */
export type InstrumentBranchRule = {
  items: string[];
  dependsOn: string;
  showWhen: number[];
};

/**
 * Missing-data handling (spec §4). The engine supports the three imputation
 * strategies the specification requires.
 */
export type ImputationRule =
  | { method: "none"; maxMissing: number }
  | { method: "mean_answered"; maxMissing: number }
  | {
      method: "subscale_mean";
      maxMissing: number;
      maxMissingPerSubscale: number;
    };

/** A single deterministic safety trigger (spec §2.1). */
export type InstrumentSafetyRule = {
  id: string;
  label: string;
  /** Item id whose value is compared. */
  itemId: string;
  /** Triggered when `answers[itemId] >= threshold`. */
  threshold: number;
  /** Risk level recorded when triggered. */
  riskLevel: Exclude<InstrumentRiskLevel, "NONE">;
};

export type DiagnosticContext = {
  /** Raw (non-imputed) answers keyed by item id. */
  answers: Record<string, number>;
  /** Computed subscale sums. */
  subscaleScores: Record<string, number>;
};

export type DiagnosticResult = {
  /** e.g. { provisionalPtsd: true, criteria: { B: true, C: true, D: true, E: true } } */
  result: Record<string, unknown>;
  /** Optional human-readable note for the record. */
  note?: string;
};

/**
 * Risk stratification that cannot be expressed as simple item thresholds
 * (e.g. the C-SSRS matrix, where the level depends on which branching items
 * were endorsed). Returns the highest applicable level.
 */
export type RiskOverride = (ctx: DiagnosticContext) => {
  riskLevel: InstrumentRiskLevel;
  reasons: string[];
} | null;

export type InstrumentDefinition = {
  /** Stable key stored on responses (e.g. "PHQ-9"). */
  code: string;
  /** Semantic version of the scoring rules, snapshotted onto each response. */
  version: string;
  name: string;
  shortName: string;
  timeframe: string;
  instructions: string;
  responseOptions: InstrumentOption[];
  items: InstrumentItem[];
  scoring: {
    /** Phase 1 instruments are all sums, optionally with a scaled derivative. */
    method: "sum";
    minScore: number;
    maxScore: number;
    bands: SeverityBand[];
    /** Short human description of the formula, for audit trails. */
    note: string;
  };
  subscales: InstrumentSubscale[];
  imputation: ImputationRule;
  safetyRules: InstrumentSafetyRule[];
  /**
   * Item ids that must NEVER be imputed (clinically sensitive — e.g. the PHQ-9
   * self-harm item). Leaving one unanswered invalidates the score.
   * CLINICAL-VALIDATION-REQUIRED.
   */
  neverImpute?: string[];
  /**
   * Which items are applicable given branching. Defaults to all items. Used by
   * C-SSRS so a correctly-skipped branch is "not applicable", not "missing".
   * Serializable (no functions) so the patient client can apply it too.
   */
  branching?: InstrumentBranchRule[];
  /** Optional deterministic diagnostic evaluation (PCL-5 DSM-5 provisional). */
  diagnosticCriteria?: (ctx: DiagnosticContext) => DiagnosticResult;
  /** Optional scaled-score derivative (WHODAS 2.0 metric 0-100). */
  scaledScore?: (rawScore: number) => number;
  /** Optional override for risk stratification (C-SSRS). */
  riskOverride?: RiskOverride;
  /**
   * Optional severity label that is not a pure score band (C-SSRS reports the
   * risk stratum, not a numeric band). Takes precedence over `scoring.bands`.
   */
  deriveSeverity?: (ctx: {
    rawScore: number | null;
    riskLevel: InstrumentRiskLevel;
    answers: Record<string, number>;
    subscaleScores: Record<string, number>;
  }) => string | null;
};

export type MissingItemInfo = {
  id: string;
  text: string;
  imputed: boolean;
  imputedValue?: number;
};

/**
 * A serializable (no functions) view of an instrument, safe to pass from a
 * Server Component into a Client Component for patient-facing rendering.
 */
export type PatientInstrumentModel = {
  code: string;
  name: string;
  instructions: string;
  timeframe: string;
  maxScore: number;
  items: Array<{ id: string; text: string; subscaleId?: string }>;
  options: InstrumentOption[];
  branching: InstrumentBranchRule[];
};

export type ScoringResult = {
  instrumentCode: string;
  instrumentVersion: string;
  instrumentName: string;
  /** Null when the instrument has no meaningful sum (e.g. C-SSRS). */
  rawScore: number | null;
  scaledScore: number | null;
  subscaleScores: Record<string, number>;
  severityBand: string | null;
  diagnosticCriteria: Record<string, unknown>;
  safetyFlagRaised: boolean;
  riskLevel: InstrumentRiskLevel;
  safetyReasons: string[];
  isValid: boolean;
  invalidationReason: string | null;
  missingItems: MissingItemInfo[];
  answeredCount: number;
  applicableCount: number;
};
