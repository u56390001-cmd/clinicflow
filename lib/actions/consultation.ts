"use server";

import { revalidatePath } from "next/cache";

import { logAuditEvent } from "@/lib/auth/role-guard";
import { canManageClinical, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import {
  startConsultationSchema,
  completeAndAdvanceSchema,
  pauseConsultationSchema,
  savePrescriptionSchema,
  saveTemplateSchema,
  deleteTemplateSchema,
} from "@/lib/validation/schemas";
import { APP_ROUTES } from "@/lib/constants";
import type { ActionResult } from "@/types";

/** Human-readable author name from the signed-in user, for the update stamp. */
function authorName(
  user: { email?: string; user_metadata?: Record<string, unknown> } | null,
): string | null {
  if (!user) return null;
  const meta = user.user_metadata;
  const name =
    (typeof meta?.name === "string" && meta.name) ||
    (typeof meta?.full_name === "string" && meta.full_name) ||
    user.email;
  return name || null;
}

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
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      ok: false,
      message: "You must have a clinic to perform this action.",
    };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role cannot manage consultations." };
  }

  // Resuming a paused visit and starting a fresh one are the same transition,
  // but the audit trail must tell them apart — so the pause marker is read
  // before the RPC clears it.
  let wasPaused = false;
  const { data: visitRow } = await supabase
    .from("visits")
    .select("paused_at")
    .eq("clinic_id", access.clinic.id)
    .eq("id", parsed.data.visitId)
    .maybeSingle();
  wasPaused = Boolean((visitRow as { paused_at: string | null } | null)?.paused_at);

  const { data, error } = await supabase.rpc("start_consultation", {
    p_clinic_id: access.clinic.id,
    p_visit_id: parsed.data.visitId,
  });

  if (error) {
    return {
      ok: false,
      message: error.message || "Failed to start consultation.",
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id && wasPaused) {
    await logAuditEvent(
      {
        clinicId: access.clinic.id,
        userId: user.id,
        action: "CONSULTATION_RESUMED",
        resourceType: "visit",
        resourceId: parsed.data.visitId,
        details: { visitId: parsed.data.visitId },
      },
      { supabase },
    );
  }

  revalidatePath(APP_ROUTES.app.consultation);
  revalidatePath(APP_ROUTES.app.appointments);
  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: data?.id ?? "" };
}

/**
 * Complete current consultation and advance to the next waiting patient.
 *
 * `complete_and_advance` deliberately refuses to complete a visit that is not
 * already `in_consultation` — the queue is DB-owned and a visit that never
 * entered consultation has no consultation to close. That strictness is right,
 * but it made this action unusable from the prescription workspace, because the
 * workspace is reachable straight from "Write Prescription" on a visit the
 * doctor never pressed "Start Consultation" on. The doctor would write a valid
 * prescription and then hit a raw database exception:
 * "Visit not found or not currently in consultation."
 *
 * So the missing transition is performed here, through the same RPC the banner
 * uses, rather than by writing `visits.status` from the client. The visit is
 * read first so only the genuinely-open states are auto-started: a visit that is
 * already `completed` (a double click, or a second tab) must not be resurrected
 * into a fresh consultation just to be closed again.
 */
export async function completeAndAdvanceAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const parsed = completeAndAdvanceSchema.safeParse({
    visitId: formData.get("visitId"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      ok: false,
      message: "You must have a clinic to perform this action.",
    };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role cannot manage consultations." };
  }

  // Why the visit is not completable yet, decided before touching the queue.
  // `closed` stays unstarted on purpose: starting a completed visit would put
  // the doctor back into consultation and hand them the next patient for a
  // visit they already signed off.
  const OPEN_STATUSES = ["waiting", "checked_in"] as const;
  const { data: visitRow, error: visitError } = await supabase
    .from("visits")
    .select("id, status")
    .eq("clinic_id", access.clinic.id)
    .eq("id", parsed.data.visitId)
    .maybeSingle();

  if (visitError) {
    return { ok: false, message: visitError.message };
  }
  if (!visitRow) {
    return { ok: false, message: "Visit not found." };
  }
  const visitStatus = visitRow.status as string;
  const needsStarting = OPEN_STATUSES.includes(
    visitStatus as (typeof OPEN_STATUSES)[number],
  );

  if (visitStatus === "completed") {
    return {
      ok: false,
      message:
        "This visit is already completed. Refresh to see the current queue.",
    };
  }

  if (needsStarting) {
    // Goes through the advisory-locked RPC, so it still respects the one
    // in-consultation-per-doctor rule. If this doctor is already with someone
    // else, that RPC returns the reason and the doctor never sees the raw
    // exception text.
    const { error: startError } = await supabase.rpc("start_consultation", {
      p_clinic_id: access.clinic.id,
      p_visit_id: parsed.data.visitId,
    });
    if (startError) {
      return {
        ok: false,
        message: startError.message || "Failed to start consultation.",
      };
    }
  }

  const { data, error } = await supabase.rpc("complete_and_advance", {
    p_clinic_id: access.clinic.id,
    p_visit_id: parsed.data.visitId,
  });

  if (error) {
    return {
      ok: false,
      message: error.message || "Failed to complete consultation.",
    };
  }

  // A draft saved earlier must not survive a completed visit: closing the
  // consultation also finalizes the prescription. Best-effort — completion is
  // not held hostage to the update.
  await supabase
    .from("prescriptions")
    .update({ status: "final", updated_at: new Date().toISOString() })
    .eq("clinic_id", access.clinic.id)
    .eq("visit_id", parsed.data.visitId)
    .eq("status", "draft");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id) {
    await logAuditEvent(
      {
        clinicId: access.clinic.id,
        userId: user.id,
        action: "CONSULTATION_COMPLETED",
        resourceType: "visit",
        resourceId: parsed.data.visitId,
        details: {
          visitId: parsed.data.visitId,
          nextPatientId: data?.patient_id ?? null,
        },
      },
      { supabase },
    );
  }

  revalidatePath(APP_ROUTES.app.consultation);
  revalidatePath(APP_ROUTES.app.appointments);
  revalidatePath(APP_ROUTES.app.patients);
  // data = id of the patient the queue advanced into consultation ("" when
  // this doctor has no one waiting next)
  return { ok: true, data: data?.patient_id ?? "" };
}

/**
 * Return an in-consultation visit to the waiting queue (Save Draft & Return to
 * Queue). The prescription is saved by the caller first, so this only moves
 * the visit — the draft never depends on this RPC succeeding.
 */
export async function pauseConsultationAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const parsed = pauseConsultationSchema.safeParse({
    visitId: formData.get("visitId"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      ok: false,
      message: "You must have a clinic to perform this action.",
    };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role cannot manage consultations." };
  }

  const { error } = await supabase.rpc("pause_consultation", {
    p_clinic_id: access.clinic.id,
    p_visit_id: parsed.data.visitId,
  });

  if (error) {
    return {
      ok: false,
      message: error.message || "Failed to pause consultation.",
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id) {
    await logAuditEvent(
      {
        clinicId: access.clinic.id,
        userId: user.id,
        action: "CONSULTATION_PAUSED",
        resourceType: "visit",
        resourceId: parsed.data.visitId,
        details: { visitId: parsed.data.visitId },
      },
      { supabase },
    );
  }

  revalidatePath(APP_ROUTES.app.consultation);
  revalidatePath(APP_ROUTES.app.appointments);
  revalidatePath(APP_ROUTES.app.patients);
  return { ok: true, data: parsed.data.visitId };
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
    status: formData.get("status") || "final",
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
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      ok: false,
      message: "You must have a clinic to perform this action.",
    };
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
  /**
   * Normalises one lab order, keeping `sub_parameters` when the doctor narrowed a
   * panel. The list is filtered and length-capped here rather than trusted from
   * the client: this is the boundary where a `null`, a number or a 5000-entry
   * array becomes the jsonb a lab later reads.
   *
   * An empty or absent list is written as `undefined`, not `[]` — an order with
   * no sub-parameters means the whole panel, and `labTestLabel` reads both the
   * same way, so old rows and new rows stay indistinguishable to the UI.
   */
  const coerceLabOrder = (o: Record<string, unknown>) => {
    const raw = Array.isArray(o.sub_parameters) ? o.sub_parameters : [];
    const subParameters = raw
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0 && item.length <= 80)
      .slice(0, 40);
    return {
      test_name: String(o.test_name ?? ""),
      notes: String(o.notes ?? ""),
      ...(subParameters.length > 0 ? { sub_parameters: subParameters } : {}),
    };
  };

  // Who is saving, so the card can show "Updated by" and the audit log can name
  // the actor. A save is an edit when a prescription already exists for this
  // visit (upsert is keyed on clinic_id + visit_id).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actorId = user?.id ?? null;
  const actorName = authorName(user);

  const { data: existing } = await supabase
    .from("prescriptions")
    .select("id")
    .eq("clinic_id", access.clinic.id)
    .eq("visit_id", parsed.data.visitId)
    .maybeSingle();

  // Whether this save is a draft (still writing) or the final prescription.
  // Final is the default, so the consultation screen and the banner keep
  // working without change; only the draft path names the status explicitly.
  const rxStatus: "draft" | "final" =
    parsed.data.status === "draft" ? "draft" : "final";

  const prescriptionData = {
    clinic_id: access.clinic.id,
    visit_id: parsed.data.visitId,
    patient_id: visit.patient_id,
    doctor_id: visit.doctor_id,
    status: rxStatus,
    chief_complaint: d.chiefComplaint || "",
    findings: d.findings || "",
    diagnosis: d.diagnosis || "",
    custom_diagnosis: d.customDiagnosis || "",
    medicines: d.medicines.map(coerceMedicine),
    lab_orders: d.labOrders.map(coerceLabOrder),
    follow_up_date: d.followUpDate || null,
    follow_up_notes: d.followUpNotes || "",
    doctor_notes: d.doctorNotes || "",
    updated_by: actorId,
    updated_by_name: actorName,
  };

  // upsert (one prescription per visit)
  const { data: savedRow, error } = await supabase
    .from("prescriptions")
    .upsert(prescriptionData, {
      onConflict: "clinic_id,visit_id",
    })
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      message: error.message || "Failed to save prescription.",
    };
  }

  // Append-only trail of the edit. An audit write must never abort the save it
  // describes, so `logAuditEvent` swallows its own errors — and it is skipped
  // entirely for an actor-less (service/import) write, since the log's user_id
  // is not-null.
  if (actorId) {
    await logAuditEvent(
      {
        clinicId: access.clinic.id,
        userId: actorId,
        action:
          rxStatus === "draft"
            ? "PRESCRIPTION_DRAFT_SAVED"
            : existing
              ? "PRESCRIPTION_UPDATE"
              : "PRESCRIPTION_CREATE",
        resourceType: "prescription",
        resourceId: savedRow?.id ?? existing?.id,
        details: {
          visitId: parsed.data.visitId,
          patientId: visit.patient_id,
          medicineCount: prescriptionData.medicines.length,
          labOrderCount: prescriptionData.lab_orders.length,
          draft: rxStatus === "draft",
        },
      },
      { supabase },
    );
  }

  revalidatePath(APP_ROUTES.app.consultation);
  revalidatePath(APP_ROUTES.app.patients);
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
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      ok: false,
      message: "You must have a clinic to perform this action.",
    };
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
  /**
   * A saved template has to carry the panel narrowing too: a template built
   * from "CBC, platelets + ESR" that reloads as a full CBC would quietly
   * re-add four tests the doctor deliberately excluded, on every patient it is
   * applied to.
   */
  const coerceLabOrderT = (o: Record<string, unknown>) => {
    const raw = Array.isArray(o.sub_parameters) ? o.sub_parameters : [];
    const subParameters = raw
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0 && item.length <= 80)
      .slice(0, 40);
    return {
      test_name: String(o.test_name ?? ""),
      notes: String(o.notes ?? ""),
      ...(subParameters.length > 0 ? { sub_parameters: subParameters } : {}),
    };
  };

  const { error } = await supabase.from("prescription_templates").insert({
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
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      ok: false,
      message: "You must have a clinic to perform this action.",
    };
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
    return {
      ok: false,
      message: error.message || "Failed to delete template.",
    };
  }

  revalidatePath(APP_ROUTES.app.consultation);
  return { ok: true, data: "" };
}
