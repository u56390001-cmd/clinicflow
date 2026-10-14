import type {
  PsychAssessmentReviewStatus,
  PsychAssessmentRiskLevel,
} from "@/types/database";

/**
 * Client-safe display labels for Phase 1 assessment safety state. Kept separate
 * from `lib/scoring/safety.ts` (which is server-only) so UI components can
 * import them without pulling in email/audit dependencies.
 */

export function riskLevelLabel(level: PsychAssessmentRiskLevel): string {
  switch (level) {
    case "HIGH":
      return "High";
    case "MODERATE":
      return "Moderate";
    case "LOW":
      return "Low";
    default:
      return "None";
  }
}

export function assessmentReviewStatusLabel(
  status: PsychAssessmentReviewStatus,
): string {
  switch (status) {
    case "PENDING_REVIEW":
      return "Pending review";
    case "UNDER_REVIEW":
      return "Under review";
    case "ACTIONED_SAFETY_PLAN":
      return "Safety plan actioned";
    case "ESCALATED_EMERGENCY":
      return "Escalated — emergency";
    case "RESOLVED":
      return "Resolved";
    default:
      return "Clear";
  }
}

/** Review states that should keep the persistent safety banner visible. */
export const ACTIVE_SAFETY_REVIEW_STATUSES: PsychAssessmentReviewStatus[] = [
  "PENDING_REVIEW",
  "UNDER_REVIEW",
  "ESCALATED_EMERGENCY",
];
