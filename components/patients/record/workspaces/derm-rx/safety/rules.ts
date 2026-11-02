/**
 * Prescription safety rules engine — pure functions, no React. Each finding
 * carries a severity (block/warn/info), an optional item id so the panel can
 * jump to the row, and (for checklist rules) the missing input id.
 */

import type { RxItem } from "../schema/rx-item";

export type SafetySeverity = "block" | "warn" | "info";

export type SafetyFinding = {
  id: string;
  severity: SafetySeverity;
  message: string;
  /** Item to jump to from the panel. */
  itemId?: string;
  /** For checklist findings: the missing input id (e.g. "pregnancy_status"). */
  checklistId?: string;
};

export type SafetyInput = {
  items: RxItem[];
  allergies: string[];
  /** Optional flags the tab already knows about the patient. */
  flags?: {
    pregnancyRisk?: boolean;
    lactation?: boolean;
  };
  /** Doctor-completed checklist answers (isotretinoin/methotrexate). */
  answers?: {
    pregnancyStatus?: "not_applicable" | "not_pregnant" | "pregnant" | "unknown";
    labsPlanned?: boolean;
  };
};

const STEROIDS =
  /\b(clobetasol|halobetasol|betamethasone|mometasone|triamcinolone|hydrocortisone|fluticasone|diflorasone|desoximetasone|prednicarbate)\b/i;

const ISOTRETINOIN = /\bisotretinoin|\broaccutane|\baccutane\b/i;
const METHOTREXATE = /\bmethotrexate\b/i;

function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

function allergenHit(allergy: string, item: RxItem): boolean {
  const hay = `${item.brand} ${"generic" in item ? item.generic ?? "" : ""}`.toLowerCase();
  const aWords = words(allergy);
  if (aWords.length === 0) return false;
  const allWordSet = new Set(words(hay));
  return aWords.every((w) => hasStemMatch(allWordSet, w));
}

/** Substring/normalized match so "clobet" still finds "clobetasol". */
function hasStemMatch(pool: Set<string>, token: string): boolean {
  for (const w of pool) {
    if (w === token || w.startsWith(token) || token.startsWith(w)) return true;
  }
  return false;
}

export function runSafetyChecks(input: SafetyInput): SafetyFinding[] {
  const findings: SafetyFinding[] = [];
  const { items, allergies, flags, answers } = input;

  // 1. Allergy conflicts (block).
  for (const item of items) {
    for (const allergy of allergies) {
      if (!allergy?.trim()) continue;
      if (allergenHit(allergy, item)) {
        findings.push({
          id: `allergy:${item.id}:${allergy}`,
          severity: "block",
          message: `${item.brand} vs documented allergy "${allergy}"`,
          itemId: item.id,
        });
      }
    }
  }

  // 2. Duplicate drugs (warn).
  const seen = new Map<string, RxItem>();
  for (const item of items) {
    const key = item.brand.toLowerCase().replace(/\s+/g, " ").trim();
    const prior = seen.get(key);
    if (prior) {
      findings.push({
        id: `duplicate:${prior.id}:${item.id}`,
        severity: "warn",
        message: `${item.brand} do dafa likhi hai`,
        itemId: item.id,
      });
    } else {
      seen.set(key, item);
    }
  }

  // 3. Topical steroid beyond 2 weeks (warn).
  for (const item of items) {
    if (item.route !== "topical") continue;
    if (!STEROIDS.test(`${item.brand} ${"generic" in item ? item.generic ?? "" : ""}`))
      continue;
    if (
      item.duration.kind === "fixed" &&
      item.duration.unit === "day" &&
      item.duration.value > 14
    ) {
      findings.push({
        id: `steroid-duration:${item.id}`,
        severity: "warn",
        message: `${item.brand}: topical steroid ${item.duration.value} days — 2 hafte se zyada review ke bina na rakhen`,
        itemId: item.id,
      });
    }
  }

  // 4. Isotretinoin checklist (block until answered).
  const isoItem = items.find((item) =>
    ISOTRETINOIN.test(`${item.brand} ${"generic" in item ? item.generic ?? "" : ""}`),
  );
  if (isoItem) {
    const status = answers?.pregnancyStatus;
    if (flags?.pregnancyRisk) {
      findings.push({
        id: "isotretinoin:pregnancy-flag",
        severity: "block",
        message: `Isotretinoin + pregnancy risk flag on record — prescribe nahi karen pregnancy confirm hone tak`,
        itemId: isoItem.id,
      });
    } else if (!status || status === "unknown") {
      findings.push({
        id: "isotretinoin:pregnancy-status",
        severity: "warn",
        message: "Isotretinoin: pregnancy status check karen",
        itemId: isoItem.id,
        checklistId: "pregnancy_status",
      });
    } else if (status === "pregnant") {
      findings.push({
        id: "isotretinoin:pregnant",
        severity: "block",
        message: "Isotretinoin CONTRAINDICATED in pregnancy — review karen",
        itemId: isoItem.id,
      });
    } else {
      findings.push({
        id: "isotretinoin:labs",
        severity: "info",
        message: "Isotretinoin: lipids + LFT labs planned hain?",
        itemId: isoItem.id,
        checklistId: "labs_planned",
      });
    }
    if (flags?.lactation) {
      findings.push({
        id: "isotretinoin:lactation",
        severity: "warn",
        message: "Isotretinoin + lactation: dosage/review note karen",
        itemId: isoItem.id,
      });
    }
  }

  // 5. Methotrexate labs checklist.
  const mtxItem = items.find((item) =>
    METHOTREXATE.test(`${item.brand} ${"generic" in item ? item.generic ?? "" : ""}`),
  );
  if (mtxItem) {
    findings.push({
      id: "methotrexate:labs",
      severity: "warn",
      message: "Methotrexate: CBC/LFT monitoring labs schedule karen",
      itemId: mtxItem.id,
      checklistId: "labs_planned",
    });
  }

  // 6. Pregnancy/lactation general flag info.
  if (flags?.pregnancyRisk && !isoItem) {
    findings.push({
      id: "flags:pregnancy",
      severity: "info",
      message: "Pregnancy risk flag active — dose/checklist confirm karen",
    });
  }

  return findings;
}

/** Everything the Review section needs computed in one call. */
export function safetySummary(findings: SafetyFinding[]): {
  blocks: number;
  warns: number;
  infos: number;
} {
  return {
    blocks: findings.filter((f) => f.severity === "block").length,
    warns: findings.filter((f) => f.severity === "warn").length,
    infos: findings.filter((f) => f.severity === "info").length,
  };
}
