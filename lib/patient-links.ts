import { createWidgetClient } from "@/lib/supabase/widget";
import { randomHexToken, sha256Hex } from "@/lib/patient-intake";
import type { PatientShareLinkKind, PatientShareLinkStatus } from "@/types/database";

/**
 * Shareable patient links (pre-visit questionnaire, psychometric assessment,
 * document upload) for the Psychology OPD workflow.
 *
 * Mirrors `patient_intake_tokens` (0049): only the SHA-256 hash of the raw token
 * is ever stored, so a leaked database cannot be replayed into a working link.
 * Table reads go through the service-role client because `patient_share_links`
 * (0080) has RLS enabled with no Data-API policies — knowing the hash is the
 * capability.
 */

export { randomHexToken, sha256Hex };

/** How long a share link stays usable after it is minted. */
export const PATIENT_LINK_TTL_DAYS = 14;

/** URL segment each link kind lives under. Must match the public routes. */
export const PATIENT_LINK_SEGMENTS: Record<PatientShareLinkKind, string> = {
  pre_visit: "pre-visit",
  assessment: "assessment",
  document_upload: "upload",
};

export function buildPatientLinkPath(kind: PatientShareLinkKind, rawToken: string): string {
  return `/${PATIENT_LINK_SEGMENTS[kind]}/${rawToken}`;
}

export type PatientLinkPreview = {
  tokenId: string;
  clinicId: string;
  patientId: string;
  patientFirstName: string;
  clinicName: string;
  kind: PatientShareLinkKind;
  assessmentType: string | null;
  status: PatientShareLinkStatus;
};

const TRUNCATED_NAME_MAX = 30;

/**
 * Resolve a raw share-link token to the patient + clinic it was minted for.
 *
 * Returns null for a malformed token, a missing row, a row of the wrong kind,
 * or any non-pending state — the caller shows one deliberately generic
 * "unavailable" message so nothing about *why* leaks to an unauthenticated
 * visitor.
 */
export async function resolvePatientLink(
  rawToken: string,
  expectedKind: PatientShareLinkKind,
): Promise<PatientLinkPreview | null> {
  if (!/^[0-9a-f]{64}$/.test(rawToken)) return null;

  const tokenHash = await sha256Hex(rawToken);
  const client = createWidgetClient();
  const { data } = await client
    .from("patient_share_links")
    .select(
      "id, clinic_id, patient_id, kind, assessment_type, status, expires_at, clinics(name), patients(name)",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!data) return null;
  if (data.kind !== expectedKind) return null;

  const status: PatientShareLinkStatus =
    new Date(data.expires_at).getTime() <= Date.now() ? "expired" : data.status;
  if (status !== "pending") return null;

  const patientName =
    typeof data.patients === "object" && data.patients !== null && "name" in data.patients
      ? String(data.patients.name)
      : "";
  const clinicName =
    typeof data.clinics === "object" && data.clinics !== null && "name" in data.clinics
      ? String(data.clinics.name)
      : "";

  return {
    tokenId: data.id,
    clinicId: data.clinic_id,
    patientId: data.patient_id,
    patientFirstName: patientName.split(" ")[0].slice(0, TRUNCATED_NAME_MAX),
    clinicName,
    kind: data.kind as PatientShareLinkKind,
    assessmentType: data.assessment_type,
    status,
  };
}
