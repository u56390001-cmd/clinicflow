import type { SupabaseClient } from "@supabase/supabase-js";

import { logAuditEvent } from "@/lib/auth/role-guard";
import { getBaseUrl } from "@/lib/booking-url";
import { APP_ROUTES } from "@/lib/constants";
import { sendAssessmentSafetyAlert } from "@/lib/email/send";
import { riskLevelLabel } from "@/lib/scoring/labels";
import type { ScoringResult } from "@/lib/scoring/types";
import type {
  ClinicRole,
  Database,
  PsychAssessmentReviewStatus,
  PsychAssessmentRiskLevel,
} from "@/types/database";

/**
 * Phase 1 §2 — the clinical safety pipeline.
 *
 * Runs *after* a validated assessment has been scored and persisted. It is the
 * single place that turns a `ScoringResult.safetyFlagRaised` into side effects:
 *
 *   1. Raise (never lower) the patient's `psych_safety.risk_level`.
 *   2. Append a `PENDING_REVIEW` row to `assessment_safety_events`.
 *   3. Append an immutable `audit_logs` entry.
 *   4. Email the care team (owner / clinic admin / doctor).
 *
 * Every step is best-effort and non-throwing: a failed email or audit write
 * must never lose the clinical assessment that triggered it.
 *
 * CLINICAL-VALIDATION-REQUIRED: the mapping from risk level → action and the
 * recipient set are the specification's defaults and need clinical sign-off.
 */

/** Attribution written to `psych_safety.updated_by` for engine-driven changes. */
const SAFETY_ENGINE_ACTOR = "Assessment scoring engine";

/** Roles that receive a clinical safety alert. */
const CARE_TEAM_ROLES: ClinicRole[] = ["owner", "clinic_admin", "doctor", "admin"];

const SAFETY_RANK: Record<string, number> = {
  low: 0,
  moderate: 1,
  high: 2,
  crisis: 3,
};

export type AssessmentSafetyOutcome = {
  flagged: boolean;
  riskLevel: PsychAssessmentRiskLevel;
  reviewStatus: PsychAssessmentReviewStatus;
  notified: string[];
};

function mergeRiskFactors(existing: string | null | undefined, addition: string): string {
  const parts = (existing ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (!parts.includes(addition)) parts.push(addition);
  return parts.join(", ");
}

async function careTeamEmails(
  widget: SupabaseClient<Database>,
  clinicId: string,
): Promise<string[]> {
  const { data, error } = await widget
    .from("clinic_members")
    .select("email, role")
    .eq("clinic_id", clinicId)
    .in("role", CARE_TEAM_ROLES);
  if (error || !data) return [];
  return Array.from(
    new Set(
      data
        .map((member) => (member.email ?? "").trim())
        .filter((email) => email.length > 0),
    ),
  );
}

/**
 * Apply the safety pipeline for one scored assessment.
 *
 * @returns the triage state recorded on the assessment row.
 */
export async function applyAssessmentSafety(params: {
  widget: SupabaseClient<Database>;
  clinicId: string;
  patientId: string;
  assessmentId: string;
  patientName: string;
  clinicName?: string;
  instrumentName: string;
  severity: string | null;
  result: ScoringResult;
  /** The clinician responsible (e.g. the link creator), for audit attribution. */
  actorUserId: string | null;
}): Promise<AssessmentSafetyOutcome> {
  const {
    widget,
    clinicId,
    patientId,
    assessmentId,
    patientName,
    clinicName,
    instrumentName,
    result,
    actorUserId,
  } = params;

  const now = new Date().toISOString();
  const riskLevel = result.riskLevel;

  // Non-flagged assessments still record a CLEAR transition for the audit trail.
  if (!result.safetyFlagRaised) {
    await widget.from("assessment_safety_events").insert({
      clinic_id: clinicId,
      patient_id: patientId,
      assessment_id: assessmentId,
      from_status: null,
      to_status: "CLEAR",
      risk_level: riskLevel,
      actor_type: "system",
      actor_user_id: actorUserId,
      rationale: "No safety trigger fired on scoring.",
      details: { instrument: result.instrumentCode, version: result.instrumentVersion },
      created_at: now,
    });
    return { flagged: false, riskLevel, reviewStatus: "CLEAR", notified: [] };
  }

  const reviewStatus: PsychAssessmentReviewStatus = "PENDING_REVIEW";
  const reasonText =
    result.safetyReasons.length > 0
      ? result.safetyReasons.join("; ")
      : "Assessment safety flag raised.";

  // 1. Raise (never lower) the recorded patient risk level.
  const targetSafety = riskLevel === "HIGH" ? "high" : "moderate";
  const { data: safety } = await widget
    .from("psych_safety")
    .select("risk_level, risk_factors")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .maybeSingle();

  const currentSafety = safety?.risk_level ?? "low";
  const nextSafety =
    (SAFETY_RANK[currentSafety] ?? 0) >= (SAFETY_RANK[targetSafety] ?? 0)
      ? currentSafety
      : targetSafety;
  const factorText = `Assessment safety flag — ${instrumentName}: ${reasonText}`;
  const { error: safetyError } = await widget.from("psych_safety").upsert(
    {
      clinic_id: clinicId,
      patient_id: patientId,
      risk_level: nextSafety,
      risk_factors: mergeRiskFactors(safety?.risk_factors, factorText),
      updated_by: SAFETY_ENGINE_ACTOR,
      updated_at: now,
    },
    { onConflict: "patient_id" },
  );
  if (safetyError) {
    console.error("[applyAssessmentSafety] psych_safety upsert failed", {
      patientId,
      message: safetyError.message,
    });
  }

  // 2. Append the triage transition.
  const { error: eventError } = await widget.from("assessment_safety_events").insert({
    clinic_id: clinicId,
    patient_id: patientId,
    assessment_id: assessmentId,
    from_status: null,
    to_status: reviewStatus,
    risk_level: riskLevel,
    actor_type: "system",
    actor_user_id: actorUserId,
    rationale: reasonText,
    details: {
      instrument: result.instrumentCode,
      version: result.instrumentVersion,
      reasons: result.safetyReasons,
    },
    created_at: now,
  });
  if (eventError) {
    console.error("[applyAssessmentSafety] safety event insert failed", {
      assessmentId,
      message: eventError.message,
    });
  }

  // 3. Immutable audit entry (requires an actor for the FK; skip if absent).
  if (actorUserId) {
    await logAuditEvent(
      {
        clinicId,
        userId: actorUserId,
        action: "ASSESSMENT_SAFETY_FLAGGED",
        resourceType: "psych_assessment",
        resourceId: assessmentId,
        details: {
          patientId,
          instrument: result.instrumentCode,
          instrumentVersion: result.instrumentVersion,
          riskLevel,
          reviewStatus,
          reasons: result.safetyReasons,
        },
      },
      { supabase: widget },
    );
  } else {
    console.error("[applyAssessmentSafety] no actor for audit trail", { assessmentId });
  }

  // 4. Notify the care team.
  const recipients = await careTeamEmails(widget, clinicId);
  const sent = await sendAssessmentSafetyAlert(
    {
      clinicName: clinicName ?? "your clinic",
      patientName,
      instrumentName,
      riskLevel: riskLevelLabel(riskLevel),
      reasons: result.safetyReasons,
      reviewUrl: `${getBaseUrl()}${APP_ROUTES.app.patients}?id=${patientId}`,
    },
    recipients,
  );

  return {
    flagged: true,
    riskLevel,
    reviewStatus,
    notified: sent.delivered,
  };
}
