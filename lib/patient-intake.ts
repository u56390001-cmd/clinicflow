import { createWidgetClient } from "@/lib/supabase/widget";

/** How long a pre-intake link stays usable after it is minted. */
export const INTAKE_TOKEN_TTL_DAYS = 7;

/** What a valid pre-intake link resolves to, for the public page preview. */
export type PatientIntakePreview = {
  tokenId: string;
  patientId: string;
  patientFirstName: string;
  clinicId: string;
  clinicName: string;
  /** Why the link is live or dead. The public page renders any non-pending case the same way. */
  status: PatientIntakeTokenStatus;
  submitted: boolean;
};

type PatientIntakeTokenStatus = "pending" | "used" | "revoked" | "expired";

const TRUNCATED_NAME_MAX = 30;

/**
 * Resolve a raw intake-link token to the patient + clinic it was minted for.
 *
 * Token lookup goes through the service-role client: `patient_intake_tokens`
 * (0049) has RLS enabled with no Data-API policies, so the hash is the
 * capability — table reads are impossible without owning the link. Returns null
 * for anything that is missing, already used, revoked or past expiry; there is
 * deliberately no per-case detail shown to an unauthenticated visitor.
 */
export async function resolvePatientIntake(
  rawToken: string,
): Promise<PatientIntakePreview | null> {
  if (!/^[0-9a-f]{64}$/.test(rawToken)) return null;

  const tokenHash = await sha256Hex(rawToken);
  const client = createWidgetClient();
  const { data: token } = await client
    .from("patient_intake_tokens")
    .select(
      "id, clinic_id, patient_id, status, expires_at, submitted_at, clinics(name), patients(name)",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!token) return null;

  let status: PatientIntakeTokenStatus;
  if (new Date(token.expires_at).getTime() <= Date.now()) {
    status = "expired";
  } else {
    status = token.status;
  }
  if (status !== "pending") return null;

  const patientName =
    typeof token.patients === "object" &&
    token.patients !== null &&
    "name" in token.patients
      ? String(token.patients.name)
      : "";
  const clinicName =
    typeof token.clinics === "object" &&
    token.clinics !== null &&
    "name" in token.clinics
      ? String(token.clinics.name)
      : "";

  return {
    tokenId: token.id,
    patientId: token.patient_id,
    patientFirstName: patientName.split(" ")[0].slice(0, TRUNCATED_NAME_MAX),
    clinicId: token.clinic_id,
    clinicName,
    status,
    submitted: token.submitted_at !== null,
  };
}

/** SHA-256 hex of a value — the only form a raw intake token is ever stored in. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 64-char hex token (256 bits) — safe for URLs and impractical to guess. */
export function randomHexToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}