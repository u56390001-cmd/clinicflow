"use server";

import {
  canManageClinical,
  getCurrentClinic,
} from "@/lib/clinic-access";
import {
  createAppointmentService,
  ensureWalkInService,
  listAvailableSlots,
  rescheduleAppointmentService,
  setAppointmentStatusService,
  updateAppointmentService,
} from "@/lib/booking-service";
import { notifyPatient } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import {
  appointmentCreateSchema,
  appointmentStatusChangeSchema,
  appointmentUpdateSchema,
  rescheduleSchema,
} from "@/lib/validation/schemas";
import type { ActionResult } from "@/types";
import type { AppointmentStatus } from "@/types/database";

/**
 * Dashboard Server Actions for appointments. All business logic lives in
 * `lib/booking-service.ts` — the shared, validated path that the AI tool layer
 * reuses (Phase 5). These wrappers only validate FormData, resolve the
 * caller's clinic, check the role, and translate results to ActionResult.
 *
 * Emergency Mode (Phase 15): when the form's emergency flag is set, a missing
 * service falls back to the clinic's "Walk-in consultation" placeholder —
 * resolved here BEFORE `createAppointmentService`, which remains the one and
 * only booking path. Normal-mode validation is untouched.
 */

export async function createAppointmentAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const parsed = appointmentCreateSchema.safeParse({
    patientId: formData.get("patientId") ?? "",
    patientName: formData.get("patientName") ?? "",
    patientEmail: formData.get("patientEmail") ?? "",
    patientPhone: formData.get("patientPhone") ?? "",
    patientAge: formData.get("patientAge") ?? "",
    patientGender: formData.get("patientGender") ?? "",
    patientCity: formData.get("patientCity") ?? "",
    knownAllergies: formData.get("knownAllergies") ?? "",
    medicalConditions: formData.get("medicalConditions") ?? "",
    serviceId: formData.get("serviceId") ?? "",
    doctorId: formData.get("doctorId") ?? "",
    start: formData.get("start") ?? "",
    notes: formData.get("notes") ?? "",
    consultationType: formData.get("consultationType") ?? "",
    bookingSource: formData.get("bookingSource") ?? "dashboard",
    emergencyMode:
      formData.get("emergencyMode") !== null ? "true" : "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the appointment details and try again.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to book appointments." };
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't manage appointments." };
  }

  let serviceId = parsed.data.serviceId;
  if (!serviceId && parsed.data.emergencyMode === "true") {
    const fallbackId = await ensureWalkInService(supabase, access.clinic.id);
    if (!fallbackId) {
      return {
        ok: false,
        message:
          "Could not prepare the walk-in placeholder for this clinic. Please pick a service or try again.",
      };
    }
    serviceId = fallbackId;
  }
  if (!serviceId) {
    return { ok: false, message: "Select a service." };
  }

  const result = await createAppointmentService(supabase, access.clinic, {
    patientId: parsed.data.patientId || undefined,
    patient: parsed.data.patientId
      ? undefined
      : {
          name: parsed.data.patientName || "",
          email: parsed.data.patientEmail || null,
          phone: parsed.data.patientPhone || null,
          age: parsed.data.patientAge ? Number(parsed.data.patientAge) : null,
          gender: (parsed.data.patientGender != null && parsed.data.patientGender !== "" && ["male", "female", "other"].includes(parsed.data.patientGender)
            ? parsed.data.patientGender as "male" | "female" | "other"
            : null),
          city: parsed.data.patientCity || null,
          known_allergies: parsed.data.knownAllergies || null,
          medical_conditions: parsed.data.medicalConditions || null,
        },
    serviceId,
    doctorId: parsed.data.doctorId || undefined,
    start: parsed.data.start,
    notes: parsed.data.notes || null,
    bookingSource: parsed.data.bookingSource || "dashboard",
    consultationType: parsed.data.consultationType === "online"
      ? "online"
      : parsed.data.consultationType === "video"
        ? "video"
        : "in_clinic",
  });

  if (!result.ok) return { ok: false, message: result.message };

  // Fire-and-forget appointment emails (non-blocking, errors logged only)
  try {
    const appt = result.appointment;
    const [serviceRes, patientRes, clinicRes] = await Promise.all([
      supabase.from("services").select("name").eq("id", appt.service_id).maybeSingle(),
      supabase.from("patients").select("name, email").eq("id", appt.patient_id).maybeSingle(),
      supabase.from("clinics").select("name, email").eq("id", appt.clinic_id).maybeSingle(),
    ]);
    const serviceName = serviceRes.data?.name ?? "Appointment";
    const patientName = patientRes.data?.name ?? "Patient";
    const patientEmail = patientRes.data?.email;
    const clinicName = clinicRes.data?.name ?? "Clinic";
    const clinicEmail = clinicRes.data?.email;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const dateStr = new Date(appt.start_time).toLocaleDateString();
    const timeStr = new Date(appt.start_time).toLocaleTimeString();

    // Email to patient (if email available)
    if (patientEmail) {
      void notifyPatient({
        clinicId: appt.clinic_id,
        channel: "email",
        type: "appointment_confirmation",
        to: patientEmail,
        payload: {
          patientName,
          clinicName,
          service: serviceName,
          date: dateStr,
          time: timeStr,
          dashboardUrl: `${siteUrl}/app/appointments`,
        },
      });
    }
    // Email to clinic (if email available)
    if (clinicEmail) {
      void notifyPatient({
        clinicId: appt.clinic_id,
        channel: "email",
        type: "new_appointment_notification",
        to: clinicEmail,
        payload: {
          patientName,
          service: serviceName,
          date: dateStr,
          time: timeStr,
          clinicName,
          dashboardUrl: `${siteUrl}/app/appointments`,
        },
      });
    }
  } catch {
    // Email failures should not block appointment creation
  }

  return { ok: true, data: result.appointment.id };
}

export async function updateAppointmentAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const parsed = appointmentUpdateSchema.safeParse({
    appointmentId: formData.get("appointmentId") ?? "",
    patientId: formData.get("patientId") ?? "",
    patientName: formData.get("patientName") ?? "",
    patientEmail: formData.get("patientEmail") ?? "",
    patientPhone: formData.get("patientPhone") ?? "",
    patientAge: formData.get("patientAge") ?? "",
    patientGender: formData.get("patientGender") ?? "",
    patientCity: formData.get("patientCity") ?? "",
    knownAllergies: formData.get("knownAllergies") ?? "",
    medicalConditions: formData.get("medicalConditions") ?? "",
    serviceId: formData.get("serviceId") ?? "",
    doctorId: formData.get("doctorId") ?? "",
    start: formData.get("start") ?? "",
    notes: formData.get("notes") ?? "",
    consultationType: formData.get("consultationType") ?? "",
    bookingSource: formData.get("bookingSource") ?? "dashboard",
    emergencyMode:
      formData.get("emergencyMode") !== null ? "true" : "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the appointment details and try again.",
    };
  }
  if (!parsed.data.patientId) {
    return { ok: false, message: "Choose a patient to edit." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to edit appointments." };
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't manage appointments." };
  }
  if (!parsed.data.serviceId) {
    return { ok: false, message: "Select a service." };
  }

  const result = await updateAppointmentService(
    supabase,
    access.clinic,
    parsed.data.appointmentId,
    {
      patientId: parsed.data.patientId,
      serviceId: parsed.data.serviceId,
      doctorId: parsed.data.doctorId || undefined,
      start: parsed.data.start,
      notes: parsed.data.notes || null,
      consultationType:
        parsed.data.consultationType === "online"
          ? "online"
          : parsed.data.consultationType === "video"
            ? "video"
            : "in_clinic",
      patient: {
        name: parsed.data.patientName || "",
        email: parsed.data.patientEmail || null,
        phone: parsed.data.patientPhone || null,
        age: parsed.data.patientAge ? Number(parsed.data.patientAge) : null,
        gender:
          parsed.data.patientGender &&
          ["male", "female", "other"].includes(parsed.data.patientGender)
            ? (parsed.data.patientGender as "male" | "female" | "other")
            : null,
        city: parsed.data.patientCity || null,
        known_allergies: parsed.data.knownAllergies || null,
        medical_conditions: parsed.data.medicalConditions || null,
      },
    },
  );

  if (!result.ok) return { ok: false, message: result.message };

  return { ok: true, data: result.appointment.id };
}

export async function setAppointmentStatusAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = appointmentStatusChangeSchema.safeParse({
    appointmentId: formData.get("appointmentId") ?? "",
    status: formData.get("status") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, message: "Invalid appointment or status." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to update appointments." };
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't manage appointments." };
  }

  const result = await setAppointmentStatusService(
    supabase,
    access.clinic,
    parsed.data.appointmentId,
    parsed.data.status as Exclude<AppointmentStatus, "pending">,
  );
  if (!result.ok) return { ok: false, message: result.message };

  // Fire-and-forget cancellation emails
  if (parsed.data.status === "cancelled") {
    try {
      const appt = result.appointment;
      const [serviceRes, patientRes, clinicRes] = await Promise.all([
        supabase.from("services").select("name").eq("id", appt.service_id).maybeSingle(),
        supabase.from("patients").select("name, email").eq("id", appt.patient_id).maybeSingle(),
        supabase.from("clinics").select("name, email").eq("id", appt.clinic_id).maybeSingle(),
      ]);
      const serviceName = serviceRes.data?.name ?? "Appointment";
      const patientName = patientRes.data?.name ?? "Patient";
      const patientEmail = patientRes.data?.email;
      const clinicName = clinicRes.data?.name ?? "Clinic";
      const clinicEmail = clinicRes.data?.email;
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
      const dateStr = new Date(appt.start_time).toLocaleDateString();
      const timeStr = new Date(appt.start_time).toLocaleTimeString();

      if (patientEmail) {
        void notifyPatient({
          clinicId: appt.clinic_id,
          channel: "email",
          type: "appointment_cancellation",
          to: patientEmail,
          payload: {
            recipientName: patientName,
            recipientRole: "patient",
            patientName,
            clinicName,
            service: serviceName,
            date: dateStr,
            time: timeStr,
            reason: "",
            dashboardUrl: `${siteUrl}/app/appointments`,
          },
        });
      }
      if (clinicEmail) {
        void notifyPatient({
          clinicId: appt.clinic_id,
          channel: "email",
          type: "appointment_cancellation",
          to: clinicEmail,
          payload: {
            recipientName: clinicName,
            recipientRole: "clinic",
            patientName,
            clinicName,
            service: serviceName,
            date: dateStr,
            time: timeStr,
            reason: "",
            dashboardUrl: `${siteUrl}/app/appointments`,
          },
        });
      }
    } catch {
      // Email failures should not block status change
    }
  }

  return { ok: true, data: undefined };
}

export async function rescheduleAppointmentAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = rescheduleSchema.safeParse({
    appointmentId: formData.get("appointmentId") ?? "",
    start: formData.get("start") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the new time and try again.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to reschedule appointments." };
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't manage appointments." };
  }

  const result = await rescheduleAppointmentService(
    supabase,
    access.clinic,
    parsed.data.appointmentId,
    parsed.data.start,
  );
  if (!result.ok) return { ok: false, message: result.message };

  // Fire-and-forget reschedule emails
  try {
    const appt = result.appointment;
    const [serviceRes, patientRes, clinicRes] = await Promise.all([
      supabase.from("services").select("name").eq("id", appt.service_id).maybeSingle(),
      supabase.from("patients").select("name, email").eq("id", appt.patient_id).maybeSingle(),
      supabase.from("clinics").select("name, email").eq("id", appt.clinic_id).maybeSingle(),
    ]);
    const serviceName = serviceRes.data?.name ?? "Appointment";
    const patientName = patientRes.data?.name ?? "Patient";
    const patientEmail = patientRes.data?.email;
    const clinicName = clinicRes.data?.name ?? "Clinic";
    const clinicEmail = clinicRes.data?.email;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const newDateStr = new Date(appt.start_time).toLocaleDateString();
    const newTimeStr = new Date(appt.start_time).toLocaleTimeString();

    if (patientEmail) {
      void notifyPatient({
        clinicId: appt.clinic_id,
        channel: "email",
        type: "appointment_reschedule",
        to: patientEmail,
        payload: {
          recipientName: patientName,
          recipientRole: "patient",
          patientName,
          clinicName,
          service: serviceName,
          oldDate: newDateStr,
          oldTime: newTimeStr,
          newDate: newDateStr,
          newTime: newTimeStr,
          dashboardUrl: `${siteUrl}/app/appointments`,
        },
      });
    }
    if (clinicEmail) {
      void notifyPatient({
        clinicId: appt.clinic_id,
        channel: "email",
        type: "appointment_reschedule",
        to: clinicEmail,
        payload: {
          recipientName: clinicName,
          recipientRole: "clinic",
          patientName,
          clinicName,
          service: serviceName,
          oldDate: newDateStr,
          oldTime: newTimeStr,
          newDate: newDateStr,
          newTime: newTimeStr,
          dashboardUrl: `${siteUrl}/app/appointments`,
        },
      });
    }
  } catch {
    // Email failures should not block reschedule
  }

  return { ok: true, data: undefined };
}

/**
 * Fetch available time slots for a given service, date, and optional doctor.
 * Called by the booking form when both doctor and date are selected.
 */
export async function fetchAvailableSlots(
  serviceId: string,
  date: string,
  doctorId?: string | null,
): Promise<{ ok: boolean; slots: string[]; message?: string }> {
  if (!serviceId || !date) {
    return { ok: false, slots: [], message: "Service and date are required." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, slots: [], message: "You must have a clinic." };

  const result = await listAvailableSlots(
    supabase,
    access.clinic,
    serviceId,
    date,
    undefined,
    doctorId,
  );

  if (!result.ok) {
    return { ok: false, slots: [], message: result.message };
  }

  return { ok: true, slots: result.slots };
}
