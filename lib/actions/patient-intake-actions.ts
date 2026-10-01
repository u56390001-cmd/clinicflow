"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { canManageClinical, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import { createWidgetClient } from "@/lib/supabase/widget";
import {
  INTAKE_TOKEN_TTL_DAYS,
  randomHexToken,
  resolvePatientIntake,
  sha256Hex,
} from "@/lib/patient-intake";
import { historyInsertFromIntakeEntry } from "@/lib/medical-history-mapping";
import {
  PATIENT_INTAKE_CREATED_BY,
  patientIntakeSubmissionSchema,
} from "@/lib/validation/intake-schema";
import type { ActionResult } from "@/types";

const mintSchema = z.object({ patientId: z.uuid() });

const submitSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/, "This link is invalid."),
  items: z.unknown(),
});

/**
 * Mint a shareable pre-intake link for a patient and hand back its path. The
 * raw token appears in the database only as its SHA-256 hash; the version rich
 * enough to use is returned here once, for the clinic's screen.
 *
 * Gated by the same clinical-role rule as every other clinical write. The token
 * row itself is written through the service-role client because
 * `patient_intake_tokens` has no Data-API policies — only the invite-style
 * "knowing the hash" flow can touch it.
 */
export async function createPatientIntakeTokenAction(
  _prevState: ActionResult<{ path: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ path: string }>> {
  const parsed = mintSchema.safeParse({ patientId: formData.get("patientId") });
  if (!parsed.success) {
    return { ok: false, message: "Missing patient id." };
  }
  const { patientId } = parsed.data;

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to create intake links." };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't manage patient intake." };
  }
  const clinicId = access.clinic.id;

  const { data: patient } = await supabase
    .from("patients")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("id", patientId)
    .maybeSingle();
  if (!patient) {
    return { ok: false, message: "That patient is not in this clinic." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "You need to be signed in to do that." };
  }

  const rawToken = randomHexToken();
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(
    Date.now() + INTAKE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error: insertError } = await createWidgetClient()
    .from("patient_intake_tokens")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      token_hash: tokenHash,
      created_by: user.id,
      expires_at: expiresAt,
    });

  if (insertError) {
    console.error("[createPatientIntakeTokenAction] insert failed", {
      clinicId,
      patientId,
      message: insertError.message,
    });
    return { ok: false, message: "We couldn't create the intake link. Please try again." };
  }

  return { ok: true, data: { path: `/intake/${rawToken}` } };
}

/**
 * Submit a patient's pre-intake medical history (the unauthenticated side of
 * the shareable link).
 *
 * The raw token in the URL is the patient's credential — it resolves the link
 * to the exact clinic + patient and is then marked used atomically with the
 * history write, so the same link cannot be replayed to cluster rows into a
 * record. All writes go through the service-role client because the visitor has
 * no session; the token hash is the only thing that made this possible.
 */
export async function submitPatientPreIntakeAction(
  _prevState: ActionResult<{ count: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ count: number }>> {
  const rawToken = formData.get("token");
  const rawItems = formData.get("items");
  if (typeof rawToken !== "string" || typeof rawItems !== "string") {
    return { ok: false, message: "This form is incomplete. Please try again." };
  }

  let parsedItems: unknown;
  try {
    parsedItems = JSON.parse(rawItems);
  } catch {
    return { ok: false, message: "This form is incomplete. Please try again." };
  }

  const tokenShape = submitSchema.safeParse({
    token: rawToken,
    items: parsedItems,
  });
  if (!tokenShape.success) {
    return { ok: false, message: "This link is invalid." };
  }

  const submission = patientIntakeSubmissionSchema.safeParse(tokenShape.data.items);
  if (!submission.success) {
    const firstIssue = submission.error.issues[0]?.message;
    return { ok: false, message: firstIssue ?? "Some entries were not quite right. Check them." };
  }

  const preview = await resolvePatientIntake(rawToken);
  if (!preview) {
    return {
      ok: false,
      message: "This link is no longer valid. Ask the clinic for a fresh one.",
    };
  }
  if (preview.status !== "pending") {
    return {
      ok: false,
      message:
        preview.status === "expired"
          ? "This link has expired. Ask the clinic for a fresh one."
          : "This link has already been used. Ask the clinic for a fresh one.",
    };
  }

  const rows = submission.data.items.map((item) =>
    historyInsertFromIntakeEntry({
      clinic_id: preview.clinicId,
      patient_id: preview.patientId,
      category: item.category,
      condition: item.condition_name,
      onsetDate: item.onset_date,
      relationship: item.relationship,
      source: "patient_intake",
      createdBy: PATIENT_INTAKE_CREATED_BY,
    }),
  );

  const widget = createWidgetClient();
  const { error: insertError } = await widget
    .from("medical_history")
    .insert(rows);
  if (insertError) {
    console.error("[submitPatientPreIntakeAction] history insert failed", {
      patientId: preview.patientId,
      clinicId: preview.clinicId,
      message: insertError.message,
    });
    return {
      ok: false,
      message: "We couldn't save your entries. Please try again.",
    };
  }

  // Mark the link used only after the history rows are safely in, so a failed
  // save leaves the link reusable for a retry.
  const { error: updateError } = await widget
    .from("patient_intake_tokens")
    .update({ status: "used", submitted_at: new Date().toISOString() })
    .eq("id", preview.tokenId);
  if (updateError) {
    console.error("[submitPatientPreIntakeAction] token finalize failed", {
      tokenId: preview.tokenId,
      message: updateError.message,
    });
  }

  revalidatePath("/app/patients");
  return { ok: true, data: { count: rows.length } };
}