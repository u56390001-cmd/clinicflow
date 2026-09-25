"use server";

import { revalidatePath } from "next/cache";

import { canManageClinical, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import {
  startConsultationSchema,
  completeAndAdvanceSchema,
  savePrescriptionSchema,
  saveTemplateSchema,
  deleteTemplateSchema,
} from "@/lib/validation/schemas";
import { APP_ROUTES } from "@/lib/constants";
import type { ActionResult } from "@/types";

/**
 * Start consultation on a waiting visit — transitions to in_consultation.
 */
export async function startConsultationAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const parsed = startConsultationSchema.safeParse({
    visitId: formData.get("visitId"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to perform this action." };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role cannot manage consultations." };
  }

  const { data, error } = await supabase.rpc("start_consultation", {
    p_clinic_id: access.clinic.id,
    p_visit_id: parsed.data.visitId,
  });

  if (error) {
    return { ok: false, message: error.message || "Failed to start consultation." };
  }

  revalidatePath(APP_ROUTES.app.consultation);
  revalidatePath(APP_ROUTES.app.appointments);
  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: data?.id ?? "" };
}

/**
 * Complete current consultation and advance to the next waiting patient.
 */
export async function completeAndAdvanceAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const parsed = completeAndAdvanceSchema.safeParse({
    visitId: formData.get("visitId"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to perform this action." };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role cannot manage consultations." };
  }

  const { data, error } = await supabase.rpc("complete_and_advance", {
    p_clinic_id: access.clinic.id,
    p_visit_id: parsed.data.visitId,
  });

  if (error) {
    return { ok: false, message: error.message || "Failed to complete consultation." };
  }

  revalidatePath(APP_ROUTES.app.consultation);
  revalidatePath(APP_ROUTES.app.appointments);
  revalidatePath(APP_ROUTES.app.patients);
  // data = id of the patient the queue advanced into consultation ("" when
  // this doctor has no one waiting next)
  return { ok: true, data: data?.patient_id ?? "" };
}

/**
 * Save (upsert) a prescription for a visit.
 */
export async function savePrescriptionAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const parsed = savePrescriptionSchema.safeParse({
    visitId: formData.get("visitId"),
    chiefComplaint: formData.get("chiefComplaint"),
    findings: formData.get("findings"),
    diagnosis: formData.get("diagnosis"),
    customDiagnosis: formData.get("customDiagnosis"),
    medicines: formData.get("medicines"),
    labOrders: formData.get("labOrders"),
    followUpDate: formData.get("followUpDate"),
    followUpNotes: formData.get("followUpNotes"),
    doctorNotes: formData.get("doctorNotes"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to perform this action." };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role cannot manage prescriptions." };
  }

  // fetch the visit to get patient_id and doctor_id
  const { data: visit, error: visitError } = await supabase
    .from("visits")
    .select("patient_id, doctor_id")
    .eq("clinic_id", access.clinic.id)
    .eq("id", parsed.data.visitId)
    .single();

  if (visitError || !visit) {
    return { ok: false, message: "Visit not found." };
  }

  const d = parsed.data;
  const coerceMedicine = (m: Record<string, unknown>) => ({
    name: String(m.name ?? ""),
    route: String(m.route ?? ""),
    form: String(m.form ?? ""),
    frequency: String(m.frequency ?? ""),
    duration: String(m.duration ?? ""),
    unit: String(m.unit ?? ""),
    instructions: String(m.instructions ?? ""),
  });
  const coerceLabOrder = (o: Record<string, unknown>) => ({
    test_name: String(o.test_name ?? ""),
    notes: String(o.notes ?? ""),
  });

  const prescriptionData = {
    clinic_id: access.clinic.id,
    visit_id: parsed.data.visitId,
    patient_id: visit.patient_id,
    doctor_id: visit.doctor_id,
    chief_complaint: d.chiefComplaint || "",
    findings: d.findings || "",
    diagnosis: d.diagnosis || "",
    custom_diagnosis: d.customDiagnosis || "",
    medicines: d.medicines.map(coerceMedicine),
    lab_orders: d.labOrders.map(coerceLabOrder),
    follow_up_date: d.followUpDate || null,
    follow_up_notes: d.followUpNotes || "",
    doctor_notes: d.doctorNotes || "",
  };

  // upsert (one prescription per visit)
  const { error } = await supabase
    .from("prescriptions")
    .upsert(prescriptionData, {
      onConflict: "clinic_id,visit_id",
    });

  if (error) {
    return { ok: false, message: error.message || "Failed to save prescription." };
  }

  revalidatePath(APP_ROUTES.app.consultation);
  return { ok: true, data: parsed.data.visitId };
}

/**
 * Save a prescription template (doctor-scoped).
 */
export async function saveTemplateAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const parsed = saveTemplateSchema.safeParse({
    doctorId: formData.get("doctorId"),
    name: formData.get("name"),
    diagnosis: formData.get("diagnosis"),
    customDiagnosis: formData.get("customDiagnosis"),
    medicines: formData.get("medicines"),
    labOrders: formData.get("labOrders"),
    doctorNotes: formData.get("doctorNotes"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to perform this action." };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role cannot manage templates." };
  }

  const d = parsed.data;
  const coerceMedicineT = (m: Record<string, unknown>) => ({
    name: String(m.name ?? ""),
    route: String(m.route ?? ""),
    form: String(m.form ?? ""),
    frequency: String(m.frequency ?? ""),
    duration: String(m.duration ?? ""),
    unit: String(m.unit ?? ""),
    instructions: String(m.instructions ?? ""),
  });
  const coerceLabOrderT = (o: Record<string, unknown>) => ({
    test_name: String(o.test_name ?? ""),
    notes: String(o.notes ?? ""),
  });

  const { error } = await supabase
    .from("prescription_templates")
    .insert({
      clinic_id: access.clinic.id,
      doctor_id: d.doctorId,
      name: d.name,
      diagnosis: d.diagnosis || "",
      custom_diagnosis: d.customDiagnosis || "",
      medicines: d.medicines.map(coerceMedicineT),
      lab_orders: d.labOrders.map(coerceLabOrderT),
      doctor_notes: d.doctorNotes || "",
    });

  if (error) {
    return { ok: false, message: error.message || "Failed to save template." };
  }

  revalidatePath(APP_ROUTES.app.consultation);
  return { ok: true, data: "" };
}

/**
 * Delete a prescription template.
 */
export async function deleteTemplateAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const parsed = deleteTemplateSchema.safeParse({
    templateId: formData.get("templateId"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to perform this action." };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role cannot delete templates." };
  }

  const { error } = await supabase
    .from("prescription_templates")
    .delete()
    .eq("id", parsed.data.templateId)
    .eq("clinic_id", access.clinic.id);

  if (error) {
    return { ok: false, message: error.message || "Failed to delete template." };
  }

  revalidatePath(APP_ROUTES.app.consultation);
  return { ok: true, data: "" };
}
