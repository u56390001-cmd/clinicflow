"use server";

import { z } from "zod";

import { getCurrentClinic, canWriteClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import { replacePreConsultationQuestions } from "@/lib/actions/pre-consultation";
import {
  doctorSchema,
  doctorSlotTemplatesSchema,
  doctorVitalsConfigSchema,
} from "@/lib/validation/schemas";
import type { ActionResult } from "@/types";
import type { DoctorVitalsConfig } from "@/types/database";

const doctorIdSchema = z.object({ doctorId: z.uuid() });

/**
 * Split the raw credentials textarea (comma/newline separated) into the JSONB
 * string array stored on `doctors.credentials`. Empty input -> null.
 */
function parseCredentials(
  text: string | undefined,
): { ok: true; value: string[] | null } | { ok: false; message: string } {
  const items = (text ?? "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (items.length === 0) return { ok: true, value: null };
  if (items.length > 20) {
    return { ok: false, message: "List at most 20 credentials." };
  }
  if (items.some((item) => item.length > 120)) {
    return { ok: false, message: "Each credential must be 120 characters or fewer." };
  }
  return { ok: true, value: items };
}

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function toNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Parse a JSON-array hidden field; a missing/blank field yields []. */
function formJsonArray(formData: FormData, key: string): string {
  const raw = formString(formData, key);
  if (!raw.trim()) return "[]";
  try {
    JSON.parse(raw);
    return raw;
  } catch {
    return "[]";
  }
}

type ParsedDoctorForm = z.infer<typeof doctorSchema> & {
  isVisible: boolean;
  vitalsConfigJson: string;
  templatesJson: string;
  preConsultationQuestionsJson: string;
};

function parseDoctorForm(
  formData: FormData,
): { ok: true; data: ParsedDoctorForm } | { ok: false; error: ActionResult } {
  const feeRaw = formData.get("consultationFee");
  const consultationFee =
    typeof feeRaw === "string" && feeRaw.trim() !== "" ? Number(feeRaw) : null;
  const followUpFeeRaw = formData.get("followUpFee");
  const followUpFee =
    typeof followUpFeeRaw === "string" && followUpFeeRaw.trim() !== "" ? Number(followUpFeeRaw) : null;

  const parsed = doctorSchema.safeParse({
    name: formString(formData, "name"),
    specialty: formString(formData, "specialty"),
    credentialsText: formString(formData, "credentialsText"),
    photoUrl: formString(formData, "photoUrl"),
    consultationFee,
    yearsOfExperience: formString(formData, "yearsOfExperience"),
    qualification: formString(formData, "qualification"),
    registrationNumber: formString(formData, "registrationNumber"),
    email: formString(formData, "email"),
    phone: formString(formData, "phone"),
    followUpFee,
    followUpValidFor: formString(formData, "followUpValidFor"),
    followUpPeriod: formString(formData, "followUpPeriod"),
    professionalDescription: formString(formData, "professionalDescription"),
    signatureUrl: formString(formData, "signatureUrl"),
    consultationMode: formString(formData, "consultationMode"),
    maxPatientsPerWindow: formString(formData, "maxPatientsPerWindow"),
    doctorConsultationType: formString(formData, "doctorConsultationType"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Check the doctor details and try again.",
      },
    };
  }
  return {
    ok: true,
    data: {
      ...parsed.data,
      isVisible: formData.get("isVisible") === "on",
      vitalsConfigJson: formJsonArray(formData, "vitalsConfigJson"),
      templatesJson: formJsonArray(formData, "templatesJson"),
      preConsultationQuestionsJson: formString(formData, "preConsultationQuestionsJson"),
    },
  };
}

async function resolveCredentials(
  raw: string | undefined,
): Promise<{ ok: true; value: string[] | null } | { ok: false; error: ActionResult }> {
  const parsed = parseCredentials(raw);
  if (!parsed.ok) {
    return { ok: false, error: { ok: false, message: parsed.message } };
  }
  return { ok: true, value: parsed.value };
}

/** The column payload shared by create and update. */
function doctorRowPayload(parsed: ParsedDoctorForm) {
  return {
    name: parsed.name,
    specialty: toNull(parsed.specialty ?? ""),
    credentials: null as string[] | null,
    photo_url: toNull(parsed.photoUrl ?? ""),
    consultation_fee: parsed.consultationFee,
    is_visible: parsed.isVisible,
    years_of_experience:
      parsed.yearsOfExperience === "" || parsed.yearsOfExperience == null
        ? null
        : parsed.yearsOfExperience,
    qualification: toNull(parsed.qualification ?? ""),
    medical_registration_number: toNull(parsed.registrationNumber ?? ""),
    email: toNull(parsed.email ?? ""),
    phone: toNull(parsed.phone ?? ""),
    follow_up_fee: parsed.followUpFee,
    follow_up_valid_for:
      parsed.followUpValidFor === "" || parsed.followUpValidFor == null
        ? null
        : parsed.followUpValidFor,
    follow_up_period: parsed.followUpPeriod || null,
    professional_description: toNull(parsed.professionalDescription ?? ""),
    signature_url: toNull(parsed.signatureUrl ?? ""),
    consultation_mode: parsed.consultationMode,
    max_patients_per_window: parsed.maxPatientsPerWindow,
    consultation_type: parsed.doctorConsultationType,
  };
}

/**
 * Persist the per-doctor vitals config. No config submitted means an empty
 * array payload, which replaces any prior config (one row per doctor).
 */
async function saveDoctorVitalsConfig(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
  doctorId: string,
  rawJson: string,
): Promise<ActionResult> {
  const parsed = doctorVitalsConfigSchema.safeParse({ doctorId, vitalsConfigJson: rawJson });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the vitals configuration and try again.",
    };
  }

  const { standardVitals, customVitals, displayOrder } = parsed.data.vitalsConfigJson ?? {};
  const { error } = await supabase
    .from("doctor_vitals_config")
    .upsert(
      {
        clinic_id: clinicId,
        doctor_id: doctorId,
        standard_vitals: standardVitals?.length ? standardVitals : null,
        custom_vitals: customVitals?.length ? (customVitals as unknown[]) : null,
        display_order: displayOrder?.length ? displayOrder : null,
      },
      { onConflict: "clinic_id,doctor_id" },
    );

  if (error) {
    console.error("[saveDoctorVitalsConfig] upsert failed", {
      clinicId,
      doctorId,
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: "We couldn't save the vitals configuration. Please try again." };
  }
  return { ok: true, data: undefined };
}

/**
 * Replace a doctor's slot templates wholesale (the form submits the full list).
 * An empty list clears every template for the doctor.
 */
async function replaceDoctorSlotTemplates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
  doctorId: string,
  rawJson: string,
): Promise<ActionResult> {
  const parsed = doctorSlotTemplatesSchema.safeParse({ doctorId, templatesJson: rawJson });
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the slot templates and try again.",
    };
  }

  const { error: deleteError } = await supabase
    .from("doctor_slot_templates")
    .delete()
    .eq("clinic_id", clinicId)
    .eq("doctor_id", doctorId);
  if (deleteError) {
    console.error("[replaceDoctorSlotTemplates] delete failed", {
      clinicId,
      doctorId,
      code: deleteError.code,
      message: deleteError.message,
    });
    return { ok: false, message: "We couldn't update this doctor's slots. Please try again." };
  }

  const templates = Array.from(
    new Map(
      parsed.data.templatesJson.map((t) => [`${t.dayOfWeek}-${t.startTime}`, t]),
    ).values(),
  );
  if (templates.length === 0) return { ok: true, data: undefined };

  const rows = templates.map((t) => ({
    clinic_id: clinicId,
    doctor_id: doctorId,
    day_of_week: t.dayOfWeek,
    slot_name: t.slotName,
    start_time: `${t.startTime}:00`,
    end_time: `${t.endTime}:00`,
    patient_limit: t.patientLimit ?? null,
  }));
  const { error: insertError } = await supabase
    .from("doctor_slot_templates")
    .insert(rows);
  if (insertError) {
    console.error("[replaceDoctorSlotTemplates] insert failed", {
      clinicId,
      doctorId,
      code: insertError.code,
      message: insertError.message,
    });
    return { ok: false, message: "We couldn't save this doctor's slots. Please try again." };
  }
  return { ok: true, data: undefined };
}

/**
 * Add a doctor to the caller's clinic. Authorization: owner/admin only
 * (RLS `doctors_insert_admin` enforces the same rule). Photo upload happens
 * client-side into the existing clinic-scoped storage bucket; this action only
 * persists the resulting public URL. The full profile is saved along with the
 * per-doctor vitals configuration and slot templates.
 */
export async function createDoctorAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseDoctorForm(formData);
  if (!parsed.ok) return parsed.error;

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to add doctors." };
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can manage doctors." };
  }

  const credentials = await resolveCredentials(parsed.data.credentialsText || undefined);
  if (!credentials.ok) return credentials.error;

  const payload = doctorRowPayload(parsed.data);
  payload.credentials = credentials.value;

  const { data: doctor, error } = await supabase
    .from("doctors")
    .insert({ clinic_id: access.clinic.id, ...payload })
    .select("id")
    .single();

  if (error || !doctor) {
    console.error("[createDoctorAction] doctors insert failed", {
      clinicId: access.clinic.id,
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
    return { ok: false, message: "We couldn't add this doctor. Please try again." };
  }

  const vitalsSaved = await saveDoctorVitalsConfig(
    supabase,
    access.clinic.id,
    doctor.id,
    parsed.data.vitalsConfigJson,
  );
  if (!vitalsSaved.ok) return vitalsSaved;

  const questionsSaved = await replacePreConsultationQuestions(
    supabase,
    access.clinic.id,
    { doctorId: doctor.id },
    parsed.data.preConsultationQuestionsJson,
  );
  if (!questionsSaved.ok) return questionsSaved;

  return await replaceDoctorSlotTemplates(
    supabase,
    access.clinic.id,
    doctor.id,
    parsed.data.templatesJson,
  );
}

/**
 * Update a doctor. `doctorId` is client-supplied but harmless: the update is
 * scoped to the caller's clinic AND gated by the `doctors_update_admin` RLS
 * policy, so a foreign id can never be touched. Vitals config and slot
 * templates are replaced alongside the profile.
 */
export async function updateDoctorAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const idParsed = doctorIdSchema.safeParse({ doctorId: formData.get("doctorId") });
  if (!idParsed.success) {
    return { ok: false, message: "Missing doctor id." };
  }

  const parsed = parseDoctorForm(formData);
  if (!parsed.ok) return parsed.error;

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to edit doctors." };
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can manage doctors." };
  }

  const credentials = await resolveCredentials(parsed.data.credentialsText || undefined);
  if (!credentials.ok) return credentials.error;

  const { error } = await supabase
    .from("doctors")
    .update({
      ...doctorRowPayload(parsed.data),
      credentials: credentials.value,
    })
    .eq("id", idParsed.data.doctorId)
    .eq("clinic_id", access.clinic.id);

  if (error) {
    console.error("[updateDoctorAction] doctors update failed", {
      doctorId: idParsed.data.doctorId,
      clinicId: access.clinic.id,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, message: "We couldn't save this doctor. Please try again." };
  }

  const vitalsSaved = await saveDoctorVitalsConfig(
    supabase,
    access.clinic.id,
    idParsed.data.doctorId,
    parsed.data.vitalsConfigJson,
  );
  if (!vitalsSaved.ok) return vitalsSaved;

  const questionsSaved = await replacePreConsultationQuestions(
    supabase,
    access.clinic.id,
    { doctorId: idParsed.data.doctorId },
    parsed.data.preConsultationQuestionsJson,
  );
  if (!questionsSaved.ok) return questionsSaved;

  return await replaceDoctorSlotTemplates(
    supabase,
    access.clinic.id,
    idParsed.data.doctorId,
    parsed.data.templatesJson,
  );
}

/**
 * Toggle whether booking surfaces (AI widget, website, dashboard selection)
 * offer this doctor for NEW bookings. The record and its history remain.
 */
export async function setDoctorVisibilityAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({ doctorId: z.uuid(), isVisible: z.boolean() })
    .safeParse({
      doctorId: formData.get("doctorId"),
      isVisible: formData.get("isVisible") === "on",
    });
  if (!parsed.success) {
    return { ok: false, message: "Invalid doctor or visibility." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to manage doctors." };
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can manage doctors." };
  }

  const { error } = await supabase
    .from("doctors")
    .update({ is_visible: parsed.data.isVisible })
    .eq("id", parsed.data.doctorId)
    .eq("clinic_id", access.clinic.id);

  if (error) {
    console.error("[setDoctorVisibilityAction] doctors visibility update failed", {
      doctorId: parsed.data.doctorId,
      clinicId: access.clinic.id,
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: "We couldn't update this doctor. Please try again." };
  }

  return { ok: true, data: undefined };
}

/**
 * Remove a doctor from the roster. Historical appointments survive via the
 * ON DELETE SET NULL FK; their slots fall back to conservative unassigned
 * overlap semantics. Doctor-specific availability/services/blocked times/slot
 * templates/vitals configs are removed by the ON DELETE CASCADE FKs.
 */
export async function deleteDoctorAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = doctorIdSchema.safeParse({ doctorId: formData.get("doctorId") });
  if (!parsed.success) {
    return { ok: false, message: "Missing doctor id." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to manage doctors." };
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can manage doctors." };
  }

  const { error } = await supabase
    .from("doctors")
    .delete()
    .eq("id", parsed.data.doctorId)
    .eq("clinic_id", access.clinic.id);

  if (error) {
    console.error("[deleteDoctorAction] doctors delete failed", {
      doctorId: parsed.data.doctorId,
      clinicId: access.clinic.id,
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: "We couldn't remove this doctor. Please try again." };
  }

  return { ok: true, data: undefined };
}

/**
 * Read one doctor's vitals config for the check-in / consultation UI. Returns
 * null when the doctor has none configured (UI then shows all standard vitals).
 * Any clinic member may read it.
 */
export async function getDoctorVitalsConfigAction(
  doctorId: string | null,
): Promise<
  | { ok: true; data: DoctorVitalsConfig | null }
  | { ok: false; message: string }
> {
  if (!doctorId) return { ok: true, data: null };

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to view doctors." };

  const { data, error } = await supabase
    .from("doctor_vitals_config")
    .select("*")
    .eq("clinic_id", access.clinic.id)
    .eq("doctor_id", doctorId)
    .maybeSingle();

  if (error) {
    console.error("[getDoctorVitalsConfigAction] select failed", {
      clinicId: access.clinic.id,
      doctorId,
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: "We couldn't load the vitals configuration. Please try again." };
  }

  return { ok: true, data: data ?? null };
}

export interface ClinicDoctorOption {
  id: string;
  name: string;
  specialty: string | null;
}

/**
 * List the caller's clinic doctors for a lightweight picker (e.g. the New Bill
 * modal). Any clinic member may select a doctor on a bill, so this is gated
 * only by clinic membership, not by role.
 */
export async function listClinicDoctorsAction(): Promise<
  ActionResult<ClinicDoctorOption[]>
> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to view doctors." };

  const { data, error } = await supabase
    .from("doctors")
    .select("id, name, specialty")
    .eq("clinic_id", access.clinic.id)
    .order("name");

  if (error) {
    console.error("[listClinicDoctorsAction] doctors select failed", {
      clinicId: access.clinic.id,
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: "We couldn't load doctors. Please try again." };
  }

  return {
    ok: true,
    data: (data ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      specialty: d.specialty,
    })),
  };
}