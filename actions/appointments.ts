"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { canManageClinical, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import {
  createAppointmentService,
  rescheduleAppointmentService,
  setAppointmentStatusService,
} from "@/lib/booking-service";
import {
  checkDoctorCapability,
  dualModeAppointmentTypeSchema,
  type DualModeAppointmentType,
} from "@/lib/ai/receptionist-agent";
import { notifyPatient } from "@/lib/notifications";
import type { ActionResult } from "@/types";
import type { AppointmentStatus } from "@/types/database";

// Re-export standard dashboard actions from lib/actions/appointments via async wrappers
export async function createAppointmentAction(
  prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const { createAppointmentAction: action } = await import("@/lib/actions/appointments");
  return action(prevState, formData);
}

export async function updateAppointmentAction(
  prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const { updateAppointmentAction: action } = await import("@/lib/actions/appointments");
  return action(prevState, formData);
}

export async function setAppointmentStatusAction(
  prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { setAppointmentStatusAction: action } = await import("@/lib/actions/appointments");
  return action(prevState, formData);
}

export async function dashboardRescheduleAppointmentAction(
  prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { rescheduleAppointmentAction: action } = await import("@/lib/actions/appointments");
  return action(prevState, formData);
}

export async function fetchAvailableSlots(
  serviceId: string,
  date: string,
  doctorId?: string | null,
) {
  const { fetchAvailableSlots: action } = await import("@/lib/actions/appointments");
  return action(serviceId, date, doctorId);
}

const dualModeBookingSchema = z.object({
  clinicId: z.string().uuid("Invalid clinic ID.").optional(),
  doctorId: z.string().uuid("Invalid doctor ID.").optional().or(z.literal("")),
  patientName: z.string().trim().min(1, "Patient name is required.").max(120),
  patientPhone: z.string().trim().min(3, "Patient phone number is required.").max(32),
  slotTime: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use YYYY-MM-DDTHH:mm clinic-local format."),
  appointmentType: dualModeAppointmentTypeSchema,
  chiefComplaint: z.string().trim().min(1, "Chief complaint is required.").max(1000),
  serviceId: z.string().uuid("Invalid service ID.").optional().or(z.literal("")),
});

export type DualModeBookingInput = z.infer<typeof dualModeBookingSchema>;

/**
 * Server Action for Dual-Mode Appointment Booking:
 * Supports 'CLINIC_VISIT' (In-Clinic) vs 'ONLINE_VIDEO' (Online Video Consultation).
 *
 * Technical Requirements:
 *  - Enforces strict Multi-Tenant Row Level Security (RLS) scoped to current clinic.
 *  - Verifies doctor capability: ensures doctor offers video consultations before booking ONLINE_VIDEO.
 *  - Zero manual link generation: sets meeting_link: null in DB.
 *  - Sets status: 'confirmed'.
 *  - Dispatches automated WhatsApp confirmation to patient & notification to doctor.
 */
export async function bookAppointmentAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const rawData = {
    clinicId: (formData.get("clinicId") as string) || undefined,
    doctorId: (formData.get("doctorId") as string) || undefined,
    patientName: (formData.get("patientName") as string) || "",
    patientPhone: (formData.get("patientPhone") as string) || "",
    slotTime: (formData.get("slotTime") as string) || (formData.get("start") as string) || "",
    appointmentType: ((formData.get("appointmentType") as string) || "CLINIC_VISIT") as DualModeAppointmentType,
    chiefComplaint: (formData.get("chiefComplaint") as string) || "",
    serviceId: (formData.get("serviceId") as string) || undefined,
  };

  const parsed = dualModeBookingSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid appointment submission.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return { ok: false, message: "Unauthorized: Active clinic session is required." };
  }

  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Permission Denied: Your role cannot manage clinic appointments." };
  }

  const clinicId = access.clinic.id;
  const targetDoctorId = parsed.data.doctorId || undefined;

  // 1. Doctor Capability Verification for Online Video Consultations
  if (targetDoctorId) {
    const capability = await checkDoctorCapability(supabase, clinicId, targetDoctorId);
    if (capability) {
      if (parsed.data.appointmentType === "ONLINE_VIDEO" && !capability.supportsOnlineVideo) {
        return {
          ok: false,
          message: `Doctor Capability Error: Dr. ${capability.doctorName} is only available for In-Clinic Visits and does not offer Online Video Consultations.`,
        };
      }
      if (parsed.data.appointmentType === "CLINIC_VISIT" && !capability.supportsInClinic) {
        return {
          ok: false,
          message: `Doctor Capability Error: Dr. ${capability.doctorName} only accepts Online Video Consultations.`,
        };
      }
    }
  }

  // 2. Resolve Service ID (or fall back to active consultation service)
  let serviceId = parsed.data.serviceId;
  if (!serviceId) {
    const { data: defaultService } = await supabase
      .from("services")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("status", "active")
      .order("price", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!defaultService) {
      return { ok: false, message: "No active service available to associate with this booking." };
    }
    serviceId = defaultService.id;
  }

  // 3. Database Insertion (Without Link Generation)
  const result = await createAppointmentService(supabase, access.clinic, {
    patient: {
      name: parsed.data.patientName,
      phone: parsed.data.patientPhone,
    },
    serviceId,
    doctorId: targetDoctorId,
    start: parsed.data.slotTime,
    bookingSource: "dual_mode_action",
    appointmentType: parsed.data.appointmentType,
    chiefComplaint: parsed.data.chiefComplaint,
    meetingLink: null, // Strictly NULL: links are populated later by doctors
    status: "confirmed", // Set status: CONFIRMED
    consultationType: parsed.data.appointmentType === "ONLINE_VIDEO" ? "video" : "in_clinic",
    notes: `Chief complaint: ${parsed.data.chiefComplaint} | Type: ${parsed.data.appointmentType}`,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  const appointment = result.appointment;

  // 4. Automated Notifications Engine (Patient + Doctor WhatsApp Confirmation)
  try {
    const [datePart, timePart] = parsed.data.slotTime.split("T");

    // Instant Patient WhatsApp Confirmation
    void notifyPatient({
      clinicId,
      patientId: appointment.patient_id,
      to: parsed.data.patientPhone,
      channel: "whatsapp",
      type: "appointment_confirmation",
      payload: {
        patientName: parsed.data.patientName,
        clinicName: access.clinic.name,
        service:
          parsed.data.appointmentType === "ONLINE_VIDEO"
            ? "Online Video Consultation"
            : "In-Clinic Visit",
        date: datePart,
        time: timePart,
        appointmentType: parsed.data.appointmentType,
        chiefComplaint: parsed.data.chiefComplaint,
      },
    });

    // Instant Doctor WhatsApp Notification
    if (appointment.doctor_id) {
      void supabase
        .from("doctors")
        .select("name, phone")
        .eq("id", appointment.doctor_id)
        .maybeSingle()
        .then(({ data: doctor }) => {
          if (doctor?.phone) {
            void notifyPatient({
              clinicId,
              channel: "whatsapp",
              type: "appointment_confirmation",
              to: doctor.phone,
              payload: {
                recipientRole: "doctor",
                patientName: parsed.data.patientName,
                doctorName: doctor.name,
                clinicName: access.clinic.name,
                service:
                  parsed.data.appointmentType === "ONLINE_VIDEO"
                    ? "Online Video Consultation"
                    : "In-Clinic Visit",
                date: datePart,
                time: timePart,
                appointmentType: parsed.data.appointmentType,
                chiefComplaint: parsed.data.chiefComplaint,
                phone: parsed.data.patientPhone,
              },
            });
          }
        });
    }
  } catch (error) {
    console.error("[actions/appointments] notification dispatch error:", error);
  }

  revalidatePath("/app/appointments");
  return { ok: true, data: appointment.id };
}

/**
 * Server Action for Rescheduling Dual-Mode Appointments with instant
 * WhatsApp triggers for both Patient and Doctor.
 */
export async function rescheduleAppointmentAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const appointmentId = formData.get("appointmentId") as string;
  const start = formData.get("start") as string;

  if (!appointmentId || !start) {
    return { ok: false, message: "Appointment ID and new start time are required." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) return { ok: false, message: "Active clinic required." };
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role cannot reschedule appointments." };
  }

  // Fetch appointment details prior to rescheduling
  const { data: priorAppt } = await supabase
    .from("appointments")
    .select("start_time, appointment_type, doctor_id, patient_id, service_id")
    .eq("id", appointmentId)
    .eq("clinic_id", access.clinic.id)
    .maybeSingle();

  const result = await rescheduleAppointmentService(supabase, access.clinic, appointmentId, start);
  if (!result.ok) return { ok: false, message: result.message };

  // Trigger WhatsApp notification to both patient and doctor
  try {
    const [patientRes, doctorRes, serviceRes] = await Promise.all([
      priorAppt?.patient_id
        ? supabase.from("patients").select("name, phone, whatsapp_number").eq("id", priorAppt.patient_id).maybeSingle()
        : Promise.resolve({ data: null }),
      priorAppt?.doctor_id
        ? supabase.from("doctors").select("name, phone").eq("id", priorAppt.doctor_id).maybeSingle()
        : Promise.resolve({ data: null }),
      priorAppt?.service_id
        ? supabase.from("services").select("name").eq("id", priorAppt.service_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const patient = patientRes.data;
    const doctor = doctorRes.data;
    const serviceName = serviceRes.data?.name || "Consultation";
    const apptType = priorAppt?.appointment_type || "CLINIC_VISIT";

    const oldDate = priorAppt ? new Date(priorAppt.start_time).toLocaleDateString() : "";
    const oldTime = priorAppt ? new Date(priorAppt.start_time).toLocaleTimeString() : "";
    const newDate = new Date(start).toLocaleDateString();
    const newTime = new Date(start).toLocaleTimeString();

    // Notify Patient via WhatsApp
    const patientPhone = patient?.whatsapp_number || patient?.phone;
    if (patientPhone) {
      void notifyPatient({
        clinicId: access.clinic.id,
        patientId: priorAppt?.patient_id,
        to: patientPhone,
        channel: "whatsapp",
        type: "appointment_reschedule",
        payload: {
          recipientRole: "patient",
          patientName: patient?.name || "Patient",
          clinicName: access.clinic.name,
          service: serviceName,
          oldDate,
          oldTime,
          newDate,
          newTime,
          appointmentType: apptType,
        },
      });
    }

    // Notify Doctor via WhatsApp
    if (doctor?.phone) {
      void notifyPatient({
        clinicId: access.clinic.id,
        channel: "whatsapp",
        type: "appointment_reschedule",
        to: doctor.phone,
        payload: {
          recipientRole: "doctor",
          doctorName: doctor.name,
          patientName: patient?.name || "Patient",
          clinicName: access.clinic.name,
          service: serviceName,
          oldDate,
          oldTime,
          newDate,
          newTime,
          appointmentType: apptType,
        },
      });
    }
  } catch (notifyErr) {
    console.error("[actions/appointments] reschedule notification error:", notifyErr);
  }

  revalidatePath("/app/appointments");
  return { ok: true, data: undefined };
}

/**
 * Server Action for Cancelling Dual-Mode Appointments with instant
 * WhatsApp triggers informing both Doctor and Patient.
 */
export async function cancelAppointmentAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const appointmentId = formData.get("appointmentId") as string;
  const reason = (formData.get("reason") as string) || "Cancelled by patient/clinic";

  if (!appointmentId) {
    return { ok: false, message: "Appointment ID is required." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) return { ok: false, message: "Active clinic required." };
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role cannot cancel appointments." };
  }

  // Fetch appointment details before marking cancelled
  const { data: appt } = await supabase
    .from("appointments")
    .select("start_time, appointment_type, doctor_id, patient_id, service_id")
    .eq("id", appointmentId)
    .eq("clinic_id", access.clinic.id)
    .maybeSingle();

  const result = await setAppointmentStatusService(
    supabase,
    access.clinic,
    appointmentId,
    "cancelled",
  );

  if (!result.ok) return { ok: false, message: result.message };

  // Trigger WhatsApp notification to both patient and doctor
  try {
    const [patientRes, doctorRes, serviceRes] = await Promise.all([
      appt?.patient_id
        ? supabase.from("patients").select("name, phone, whatsapp_number").eq("id", appt.patient_id).maybeSingle()
        : Promise.resolve({ data: null }),
      appt?.doctor_id
        ? supabase.from("doctors").select("name, phone").eq("id", appt.doctor_id).maybeSingle()
        : Promise.resolve({ data: null }),
      appt?.service_id
        ? supabase.from("services").select("name").eq("id", appt.service_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const patient = patientRes.data;
    const doctor = doctorRes.data;
    const serviceName = serviceRes.data?.name || "Consultation";
    const apptType = appt?.appointment_type || "CLINIC_VISIT";

    const dateStr = appt ? new Date(appt.start_time).toLocaleDateString() : "";
    const timeStr = appt ? new Date(appt.start_time).toLocaleTimeString() : "";

    // Inform Patient on WhatsApp
    const patientPhone = patient?.whatsapp_number || patient?.phone;
    if (patientPhone) {
      void notifyPatient({
        clinicId: access.clinic.id,
        patientId: appt?.patient_id,
        to: patientPhone,
        channel: "whatsapp",
        type: "appointment_cancellation",
        payload: {
          recipientRole: "patient",
          patientName: patient?.name || "Patient",
          clinicName: access.clinic.name,
          service: serviceName,
          date: dateStr,
          time: timeStr,
          reason,
          appointmentType: apptType,
        },
      });
    }

    // Inform Doctor on WhatsApp
    if (doctor?.phone) {
      void notifyPatient({
        clinicId: access.clinic.id,
        channel: "whatsapp",
        type: "appointment_cancellation",
        to: doctor.phone,
        payload: {
          recipientRole: "doctor",
          doctorName: doctor.name,
          patientName: patient?.name || "Patient",
          clinicName: access.clinic.name,
          service: serviceName,
          date: dateStr,
          time: timeStr,
          reason,
          appointmentType: apptType,
        },
      });
    }
  } catch (notifyErr) {
    console.error("[actions/appointments] cancellation notification error:", notifyErr);
  }

  revalidatePath("/app/appointments");
  return { ok: true, data: undefined };
}
