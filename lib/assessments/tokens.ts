import { getBaseUrl } from "@/lib/booking-url";
import {
  PATIENT_LINK_TTL_DAYS,
  resolvePatientLink,
  type PatientLinkPreview,
} from "@/lib/patient-links";
import { randomHexToken, sha256Hex } from "@/lib/patient-intake";
import { createWidgetClient } from "@/lib/supabase/widget";
import type {
  PatientShareLinkDeliveryChannel,
  PatientShareLinkDeliveryStatus,
} from "@/types/database";

/**
 * Phase 3 — secure one-time assessment links.
 *
 * Thin, purpose-named facade over the existing share-link capability
 * (`patient_share_links`, migrations 0080 + 0089). No second token system: the
 * raw 32-byte token is returned to the caller exactly once to build the URL,
 * and only its SHA-256 hash is ever persisted. Reads/writes go through the
 * service-role client because the table has RLS enabled with no Data-API
 * policies — knowing the hash *is* the capability.
 *
 * Server-only: imports `next`-free node-safe helpers but reads env via
 * `getBaseUrl` and uses the service-role client. Never import from a Client
 * Component.
 */

/** Public URL segment a patient assessment link lives under. Must match the route. */
export const ASSESSMENT_EVAL_SEGMENT = "eval";

/** Generate the raw, single-use token (256 bits, hex). Returned once, never stored. */
export function generateAssessmentToken(): string {
  return randomHexToken();
}

/** Hash a raw token for storage/lookup. */
export function hashAssessmentToken(rawToken: string): Promise<string> {
  return sha256Hex(rawToken);
}

/** The patient-facing URL for a raw assessment token. */
export function buildAssessmentUrl(rawToken: string, baseUrl: string = getBaseUrl()): string {
  return `${baseUrl.replace(/\/+$/, "")}/${ASSESSMENT_EVAL_SEGMENT}/${rawToken}`;
}

/** The path-only form (used inside the app where the origin is implicit). */
export function buildAssessmentPath(rawToken: string): string {
  return `/${ASSESSMENT_EVAL_SEGMENT}/${rawToken}`;
}

/**
 * Resolve an assessment invite token to the patient/clinic it belongs to.
 * Returns null for a malformed, missing, wrong-kind, expired or already-used
 * token so the caller can render one deliberately generic "unavailable" state.
 */
export async function resolveAssessmentInvite(
  rawToken: string,
): Promise<PatientLinkPreview | null> {
  return resolvePatientLink(rawToken, "assessment");
}

export type MintAssessmentInviteInput = {
  clinicId: string;
  patientId: string;
  /** Staff member minting the link (audit attribution). */
  createdBy: string;
  /** Clinician the invite is sent on behalf of. Defaults to createdBy. */
  clinicianId?: string | null;
  appointmentId?: string | null;
  /** Built-in instrument key or library template name (when no templateId). */
  assessmentType?: string | null;
  /** Clinic library template this link points at, when applicable. */
  templateId?: string | null;
  deliveryChannel: PatientShareLinkDeliveryChannel;
  /** Days until expiry. Defaults to the shared patient-link TTL. */
  ttlDays?: number;
  metadata?: Record<string, unknown>;
};

export type MintedAssessmentInvite = {
  id: string;
  path: string;
  url: string;
  expiresAt: string;
};

/**
 * Persist a new assessment invite and return the raw URL exactly once. Insert
 * only — delivery is recorded separately via `recordAssessmentDelivery`.
 */
export async function mintAssessmentInvite(
  input: MintAssessmentInviteInput,
): Promise<MintedAssessmentInvite> {
  const rawToken = generateAssessmentToken();
  const tokenHash = await hashAssessmentToken(rawToken);
  const ttlDays = input.ttlDays ?? PATIENT_LINK_TTL_DAYS;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  const widget = createWidgetClient();
  const { data, error } = await widget
    .from("patient_share_links")
    .insert({
      clinic_id: input.clinicId,
      patient_id: input.patientId,
      appointment_id: input.appointmentId ?? null,
      kind: "assessment",
      assessment_type: input.assessmentType ?? null,
      template_id: input.templateId ?? null,
      token_hash: tokenHash,
      created_by: input.createdBy,
      clinician_id: input.clinicianId ?? input.createdBy,
      delivery_channel: input.deliveryChannel,
      delivery_status: "pending",
      metadata: input.metadata ?? {},
      expires_at: expiresAt,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      `[mintAssessmentInvite] insert failed: ${error?.message ?? "no row returned"}`,
    );
  }

  return {
    id: data.id,
    path: buildAssessmentPath(rawToken),
    url: buildAssessmentUrl(rawToken),
    expiresAt,
  };
}

/**
 * Record how a minted invite fared with the delivery provider. Distinct from
 * the single-use `status` lifecycle.
 */
export async function recordAssessmentDelivery(
  linkId: string,
  update: {
    channel?: PatientShareLinkDeliveryChannel;
    status: PatientShareLinkDeliveryStatus;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const widget = createWidgetClient();
  const patch: {
    delivery_status: PatientShareLinkDeliveryStatus;
    delivery_channel?: PatientShareLinkDeliveryChannel;
    metadata?: Record<string, unknown>;
  } = { delivery_status: update.status };
  if (update.channel) patch.delivery_channel = update.channel;
  if (update.metadata) patch.metadata = update.metadata;

  const { error } = await widget.from("patient_share_links").update(patch).eq("id", linkId);
  if (error) {
    // Delivery bookkeeping must never fail the caller's request.
    console.error("[recordAssessmentDelivery] update failed", {
      linkId,
      message: error.message,
    });
  }
}
