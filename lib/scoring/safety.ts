import type { SupabaseClient } from "@supabase/supabase-js";

import { logAuditEvent } from "@/lib/auth/role-guard";
import { getBaseUrl } from "@/lib/booking-url";
import { APP_ROUTES } from "@/lib/constants";
import { riskLevelLabel } from "@/lib/scoring/labels";
import {
  notifyCareTeamSafetyAlert,
  type SafetyCareRecipient,
  type SafetyChannelDelivery,
} from "@/lib/scoring/safety-notify";
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
 *   4. Notify the care team on every available channel (email + WhatsApp,
 *      with SMS reserved for a future provider) via `safety-notify.ts`.
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
  /** Email addresses reached. Retained for backward compatibility. */
  notified: string[];
  /** Per-channel delivery record (Phase 5). */
  channels: SafetyChannelDelivery;
};

function mergeRiskFactors(existing: string | null | undefined, addition: string): string {
  const parts = (existing ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (!parts.includes(addition)) parts.push(addition);
  return parts.join(", ");
}

async function careTeamRecipients(
  widget: SupabaseClient<Database>,
  clinicId: string,
): Promise<SafetyCareRecipient[]> {
  const { data, error } = await widget
    .from("clinic_members")
    .select("email, user_id, role")
    .eq("clinic_id", clinicId)
    .in("role", CARE_TEAM_ROLES);
  if (error || !data) return [];

  // Staff phone numbers live on the doctor roster (`doctors.phone`), not on
  // `clinic_members`. Resolve them by the shared user id so doctor recipients
  // can also receive WhatsApp/SMS alerts; everyone else stays email-only.
  const userIds = Array.from(
    new Set(data.map((member) => member.user_id).filter((id): id is string => !!id)),
  );
  const phoneByUser = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: doctors } = await widget
      .from("doctors")
      .select("user_id, phone")
      .eq("clinic_id", clinicId)
      .in("user_id", userIds);
    for (const doctor of doctors ?? []) {
      if (doctor.user_id && doctor.phone && !phoneByUser.has(doctor.user_id)) {
        phoneByUser.set(doctor.user_id, doctor.phone);
      }
    }
  }

  const seen = new Set<string>();
  const recipients: SafetyCareRecipient[] = [];
  for (const member of data) {
    const email = (member.email ?? "").trim();
    if (email.length === 0) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push({
      userId: member.user_id ?? null,
      email,
      phone: member.user_id ? (phoneByUser.get(member.user_id) ?? null) : null,
    });
  }
  return recipients;
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
    return {
      flagged: false,
      riskLevel,
      reviewStatus: "CLEAR",
      notified: [],
      channels: { email: [], whatsapp: [], sms: [] },
    };
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

  // 4. Notify the care team across every available channel (email + WhatsApp
  //    via the engagement pipeline, with SMS reserved for a future provider).
  //    Best-effort and non-throwing.
  const recipients = await careTeamRecipients(widget, clinicId);
  const channels = await notifyCareTeamSafetyAlert({
    supabase: widget,
    clinicId,
    patientId,
    content: {
      clinicName: clinicName ?? "your clinic",
      patientName,
      instrumentName,
      riskLevel: riskLevelLabel(riskLevel),
      reasons: result.safetyReasons,
      reviewUrl: `${getBaseUrl()}${APP_ROUTES.app.patients}?id=${patientId}`,
    },
    recipients,
  });

  return {
    flagged: true,
    riskLevel,
    reviewStatus,
    notified: channels.email,
    channels,
  };
}
