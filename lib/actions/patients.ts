"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { APP_ROUTES } from "@/lib/constants";
import { canManageClinical, canMergePatients, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import { patientSchema } from "@/lib/validation/schemas";
import type { ActionResult } from "@/types";
import type { Patient } from "@/types/database";

const patientIdSchema = z.object({ patientId: z.uuid() });

/**
 * The six past-history textareas (0046), mapped from the *validated* payload.
 * Read through one helper and spread into both the insert and the update, so the
 * two can never disagree about which fields exist — the failure mode where a
 * field saves on create but is silently dropped on edit is invisible until
 * someone loses an answer.
 */
function pastHistoryFields(data: {
  pastIllnesses?: string;
  pastSurgeries?: string;
  hospitalizations?: string;
  familyHistory?: string;
  personalHistory?: string;
  immunizationHistory?: string;
}) {
  return {
    past_illnesses: data.pastIllnesses || null,
    past_surgeries: data.pastSurgeries || null,
    hospitalizations: data.hospitalizations || null,
    family_history: data.familyHistory || null,
    personal_history: data.personalHistory || null,
    immunization_history: data.immunizationHistory || null,
  } as const;
}

/**
 * Create a patient in the signed-in user's current clinic. Any member may
 * add patients (clinic-floor work) — the `patients_insert_member` RLS policy
 * enforces the same rule.
 */
export async function createPatientAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = patientSchema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    notes: formData.get("notes") ?? "",
    dateOfBirth: formData.get("dateOfBirth") ?? "",
    age: formData.get("age") ?? "",
    gender: formData.get("gender") ?? "",
    city: formData.get("city") ?? "",
    bloodGroup: formData.get("bloodGroup") ?? "",
    knownAllergies: formData.get("knownAllergies") ?? "",
    medicalConditions: formData.get("medicalConditions") ?? "",
    height: formData.get("height") ?? "",
    weight: formData.get("weight") ?? "",
    currentMeds: formData.get("currentMeds") ?? "",
    pastIllnesses: formData.get("pastIllnesses") ?? "",
    pastSurgeries: formData.get("pastSurgeries") ?? "",
    hospitalizations: formData.get("hospitalizations") ?? "",
    familyHistory: formData.get("familyHistory") ?? "",
    personalHistory: formData.get("personalHistory") ?? "",
    immunizationHistory: formData.get("immunizationHistory") ?? "",
  });
  if (!parsed.success) {
    console.error("[createPatientAction] validation failed", parsed.error.issues);
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the patient details and try again.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to add patients." };
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't manage patients." };
  }

  const { error } = await supabase
    .from("patients")
    .insert({
      clinic_id: access.clinic.id,
      name: parsed.data.name,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      notes: parsed.data.notes || null,
      date_of_birth: parsed.data.dateOfBirth || null,
      age: parsed.data.age ? Number(parsed.data.age) : null,
      gender: parsed.data.gender || null,
      city: parsed.data.city || null,
      blood_group: parsed.data.bloodGroup || null,
      known_allergies: parsed.data.knownAllergies || null,
      medical_conditions: parsed.data.medicalConditions || null,
      height: parsed.data.height ? Number(parsed.data.height) : null,
      weight: parsed.data.weight ? Number(parsed.data.weight) : null,
      current_medications: parsed.data.currentMeds || null,
      ...pastHistoryFields(parsed.data),
    });

  if (error) {
    console.error("[createPatientAction] patients insert failed", {
      clinicId: access.clinic.id,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, message: "We couldn't add this patient. Please try again." };
  }

  return { ok: true, data: undefined };
}

/**
 * Create a patient and return their id, used by flows (e.g. the New Bill
 * modal) that need to immediately continue with the newly-created patient.
 * Same authorization and validation as `createPatientAction`.
 */
export async function createPatientAndGetIdAction(
  formData: FormData,
): Promise<ActionResult<string>> {
  const parsed = patientSchema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    notes: formData.get("notes") ?? "",
    dateOfBirth: formData.get("dateOfBirth") ?? "",
    age: formData.get("age") ?? "",
    gender: formData.get("gender") ?? "",
    city: formData.get("city") ?? "",
    bloodGroup: formData.get("bloodGroup") ?? "",
    knownAllergies: formData.get("knownAllergies") ?? "",
    medicalConditions: formData.get("medicalConditions") ?? "",
    height: formData.get("height") ?? "",
    weight: formData.get("weight") ?? "",
    currentMeds: formData.get("currentMeds") ?? "",
    pastIllnesses: formData.get("pastIllnesses") ?? "",
    pastSurgeries: formData.get("pastSurgeries") ?? "",
    hospitalizations: formData.get("hospitalizations") ?? "",
    familyHistory: formData.get("familyHistory") ?? "",
    personalHistory: formData.get("personalHistory") ?? "",
    immunizationHistory: formData.get("immunizationHistory") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the patient details and try again.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to add patients." };
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't manage patients." };
  }

  const { data, error } = await supabase
    .from("patients")
    .insert({
      clinic_id: access.clinic.id,
      name: parsed.data.name,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      notes: parsed.data.notes || null,
      date_of_birth: parsed.data.dateOfBirth || null,
      age: parsed.data.age ? Number(parsed.data.age) : null,
      gender: parsed.data.gender || null,
      city: parsed.data.city || null,
      blood_group: parsed.data.bloodGroup || null,
      known_allergies: parsed.data.knownAllergies || null,
      medical_conditions: parsed.data.medicalConditions || null,
      height: parsed.data.height ? Number(parsed.data.height) : null,
      weight: parsed.data.weight ? Number(parsed.data.weight) : null,
      current_medications: parsed.data.currentMeds || null,
      ...pastHistoryFields(parsed.data),
    })
    .select("id")
    .single();

  if (error) {
    console.error("[createPatientAndGetIdAction] patients insert failed", {
      clinicId: access.clinic.id,
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: "We couldn't add this patient. Please try again." };
  }

  return { ok: true, data: data.id };
}

/**
 * Update a patient. `patientId` is client-supplied but harmless: the update is
 * scoped to the caller's clinic AND gated by the `patients_update_member` RLS
 * policy, so another clinic's patient can never be touched.
 */
export async function updatePatientAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const idParsed = patientIdSchema.safeParse({ patientId: formData.get("patientId") });
  if (!idParsed.success) {
    return { ok: false, message: "Missing patient id." };
  }

  const parsed = patientSchema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    notes: formData.get("notes") ?? "",
    dateOfBirth: formData.get("dateOfBirth") ?? "",
    age: formData.get("age") ?? "",
    gender: formData.get("gender") ?? "",
    city: formData.get("city") ?? "",
    bloodGroup: formData.get("bloodGroup") ?? "",
    knownAllergies: formData.get("knownAllergies") ?? "",
    medicalConditions: formData.get("medicalConditions") ?? "",
    height: formData.get("height") ?? "",
    weight: formData.get("weight") ?? "",
    currentMeds: formData.get("currentMeds") ?? "",
    pastIllnesses: formData.get("pastIllnesses") ?? "",
    pastSurgeries: formData.get("pastSurgeries") ?? "",
    hospitalizations: formData.get("hospitalizations") ?? "",
    familyHistory: formData.get("familyHistory") ?? "",
    personalHistory: formData.get("personalHistory") ?? "",
    immunizationHistory: formData.get("immunizationHistory") ?? "",
  });
  if (!parsed.success) {
    console.error("[updatePatientAction] validation failed", parsed.error.issues);
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the patient details and try again.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to edit patients." };
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't manage patients." };
  }

  const { error } = await supabase
    .from("patients")
    .update({
      name: parsed.data.name,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      notes: parsed.data.notes || null,
      date_of_birth: parsed.data.dateOfBirth || null,
      age: parsed.data.age ? Number(parsed.data.age) : null,
      gender: parsed.data.gender || null,
      city: parsed.data.city || null,
      blood_group: parsed.data.bloodGroup || null,
      known_allergies: parsed.data.knownAllergies || null,
      medical_conditions: parsed.data.medicalConditions || null,
      height: parsed.data.height ? Number(parsed.data.height) : null,
      weight: parsed.data.weight ? Number(parsed.data.weight) : null,
      current_medications: parsed.data.currentMeds || null,
      ...pastHistoryFields(parsed.data),
    })
    .eq("id", idParsed.data.patientId)
    .eq("clinic_id", access.clinic.id);

  if (error) {
    console.error("[updatePatientAction] patients update failed", {
      patientId: idParsed.data.patientId,
      clinicId: access.clinic.id,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, message: "We couldn't save this patient. Please try again." };
  }

  return { ok: true, data: undefined };
}

/**
 * The six past-history columns, as a runtime-checkable list. The Health Info tab
 * autosaves one of these at a time (on blur), and the field name arrives from
 * the client — so it is validated against this list rather than interpolated
 * into an update object, where an unexpected key would be written as a column
 * and fail at the database with an opaque error.
 */
const PAST_HISTORY_COLUMNS = [
  "past_illnesses",
  "past_surgeries",
  "hospitalizations",
  "family_history",
  "personal_history",
  "immunization_history",
] as const;
type PastHistoryColumn = (typeof PAST_HISTORY_COLUMNS)[number];

const inlinePastHistorySchema = z.object({
  patientId: z.uuid(),
  field: z.enum(PAST_HISTORY_COLUMNS),
  value: z
    .string()
    .max(2000, "This must be 2000 characters or fewer.")
    .optional()
    .or(z.literal("")),
});

/**
 * Save one past-history field of one patient, called by the Health Info tab when
 * a textarea loses focus.
 *
 * Narrower than `updatePatientAction` on purpose: this writes exactly one
 * whitelisted column, so an autosave can never clobber a field another form owns
 * (name, phone, allergies) with a stale copy. Authorization matches the full
 * update — the write is additionally scoped to the caller's clinic, and the
 * `patients_update_member` RLS policy is the real gate.
 */
export async function updatePatientPastHistoryAction(input: {
  patientId: string;
  field: PastHistoryColumn;
  value: string;
}): Promise<ActionResult> {
  const parsed = inlinePastHistorySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "That value couldn't be saved.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to edit patients." };
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't manage patients." };
  }

  const { field, value } = parsed.data;
  const next = (value ?? "").trim() || null;

  // The one cast in this file, and it is load-bearing: `field` was validated
  // against PAST_HISTORY_COLUMNS above, so `{ [field]: next }` provably has the
  // shape `Pick<Patient, PastHistoryColumn>`. Without the assertion TypeScript
  // widens the computed key to `{ [x: string]: string | null }`, which the
  // generated `Update` type correctly refuses. Casting to a single-key patch
  // (rather than a whole-row type) keeps the write narrow: the other five
  // columns are never mentioned, so an autosave cannot clear a sibling field.
  const patch = { [field]: next } as Pick<Patient, PastHistoryColumn>;

  const { error } = await supabase
    .from("patients")
    .update(patch)
    .eq("id", parsed.data.patientId)
    .eq("clinic_id", access.clinic.id);

  if (error) {
    console.error("[updatePatientPastHistoryAction] patients update failed", {
      patientId: parsed.data.patientId,
      field,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, message: "We couldn't save this. Please try again." };
  }

  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: undefined };
}

const mergeIdsSchema = z
  .object({
    primaryPatientId: z.uuid(),
    duplicatePatientId: z.uuid(),
  })
  .refine((v) => v.primaryPatientId !== v.duplicatePatientId, {
    message: "A patient can't be merged into themselves.",
  });

/**
 * Merge a duplicate patient profile into a primary one (RPC: 0041
 * `merge_patient_profiles`). The RPC re-parents every appointment, visit,
 * prescription, document, bill and WhatsApp conversation and then
 * soft-archives the duplicate — nothing is deleted.
 *
 * Any clinic member may merge (`canMergePatients`), matching both the 0041 RPC's
 * `is_clinic_member` gate and the RLS any-member rule for patients: the front
 * desk books the walk-ins, and a duplicate is usually only discovered while
 * booking the next one. The merge is non-destructive by construction —
 * everything the duplicate owned is re-parented and its row is soft-archived,
 * never deleted. Defense in depth:
 *   * both ids are verified to belong to the caller's clinic here, and again
 *     inside the SECURITY DEFINER function (`is_clinic_member` + clinic pinning),
 *     so a forged id from another tenant fails closed at two layers.
 */
export async function mergePatientProfilesAction(formData: FormData): Promise<ActionResult<{ primaryPatientId: string }>> {
  const parsed = mergeIdsSchema.safeParse({
    primaryPatientId: formData.get("primaryPatientId"),
    duplicatePatientId: formData.get("duplicatePatientId"),
  });
  if (!parsed.success) {
    console.error("[mergePatientProfilesAction] validation failed", parsed.error.issues);
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the two patient records and try again.",
    };
  }
  const { primaryPatientId, duplicatePatientId } = parsed.data;

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to merge patients." };
  // Every clinic member — matching the 0041 RPC's own `is_clinic_member` gate,
  // so this check can never admit a call the database would refuse. See
  // `canMergePatients` for why the front desk needs it at booking time.
  if (!canMergePatients(access.role)) {
    return { ok: false, message: "You must be a member of this clinic to merge patient records." };
  }

  // Client-side tenancy pre-check (the RPC re-checks). RLS on `patients`
  // already restricts reads to the caller's clinic, so a foreign id simply
  // reads as "not found" here.
  const { data: both, error: readError } = await supabase
    .from("patients")
    .select("id, merged_at")
    .in("id", [primaryPatientId, duplicatePatientId])
    .eq("clinic_id", access.clinic.id);

  if (readError) {
    console.error("[mergePatientProfilesAction] patient read failed", {
      code: readError.code,
      message: readError.message,
    });
    return { ok: false, message: "We couldn't verify these records. Please try again." };
  }
  if ((both?.length ?? 0) !== 2) {
    return { ok: false, message: "One of these records no longer exists in your clinic." };
  }
  if (both?.some((p) => p.merged_at !== null)) {
    return { ok: false, message: "One of these records has already been merged into another patient." };
  }

  const { data: mergedId, error } = await supabase.rpc("merge_patient_profiles", {
    p_primary_patient_id: primaryPatientId,
    p_duplicate_patient_id: duplicatePatientId,
  });

  if (error) {
    console.error("[mergePatientProfilesAction] merge rpc failed", {
      primaryPatientId,
      duplicatePatientId,
      clinicId: access.clinic.id,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    // Postgres raises our friendly merge exceptions as P0001; surface their text
    // (it never contains data from other tenants) so admins see WHY it refused.
    const friendly =
      error.code === "P0001" && error.message
        ? error.message
        : "We couldn't merge these records. Nothing was changed — please try again.";
    return { ok: false, message: friendly };
  }

  // The directory, every tab of this patient's record, and the queue all read
  // data the merge just moved — refresh the whole workspace subtree.
  revalidatePath(APP_ROUTES.app.patients);
  revalidatePath(APP_ROUTES.app.appointments);
  revalidatePath(APP_ROUTES.app.consultation);

  return { ok: true, data: { primaryPatientId: mergedId ?? primaryPatientId } };
}
