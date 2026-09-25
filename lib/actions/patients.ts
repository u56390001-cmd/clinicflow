"use server";

import { z } from "zod";

import { canManageClinical, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import { patientSchema } from "@/lib/validation/schemas";
import type { ActionResult } from "@/types";

const patientIdSchema = z.object({ patientId: z.uuid() });

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
