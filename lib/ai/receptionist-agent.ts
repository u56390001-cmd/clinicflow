import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, AppointmentStatus } from "@/types/database";
import type { AIToolDefinition } from "@/lib/ai/types";
import {
  createAppointmentService,
  type BookingClinic,
} from "@/lib/booking-service";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import { notifyPatient } from "@/lib/notifications";

/**
 * MedBook AI Receptionist Agent — Dual-Mode Scheduling Module
 * 
 * Supports two distinct consultation modes:
 *  1. 'CLINIC_VISIT' (In-Clinic visit)
 *  2. 'ONLINE_VIDEO' (Online Video Consultation)
 *
 * Core Architectural Rules:
 *  - AI Agent asks: "Would you like to book an In-Clinic Visit or an Online Video Consultation?"
 *  - Doctor Capability Check: Verify doctor's consultation_type ('both' | 'online') before offering video slots.
 *  - Database Insertion: Writes appointment_type ('CLINIC_VISIT' | 'ONLINE_VIDEO'), status: 'confirmed', meeting_link: null.
 *  - Zero Link Generation: AI NEVER generates video call links. Links are generated/provided later by doctors.
 *  - Notification Engine: WhatsApp confirmation explicitly notes that the doctor will share the video link prior to the appointment.
 */

export type DualModeAppointmentType = "CLINIC_VISIT" | "ONLINE_VIDEO";

export interface DoctorCapability {
  doctorId: string;
  doctorName: string;
  consultationType: "offline" | "both" | "online";
  supportsOnlineVideo: boolean;
  supportsInClinic: boolean;
}

export interface ReceptionistAgentContext {
  clinic: {
    id: string;
    name: string;
    doctor_name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    timezone: string;
  };
  workingHoursSummary?: string;
  doctors?: Array<{
    id: string;
    name: string;
    specialty: string;
    consultationType: "offline" | "both" | "online";
  }>;
}

// ── Zod Schemas for Tool Validation ──────────────────────────────────────────

export const dualModeAppointmentTypeSchema = z.enum(["CLINIC_VISIT", "ONLINE_VIDEO"], {
  message: "Appointment type must be either 'CLINIC_VISIT' or 'ONLINE_VIDEO'.",
});

export const bookAppointmentArgsSchema = z.object({
  clinic_id: z.string().uuid("A valid clinic_id UUID is required."),
  doctor_id: z.string().uuid("A valid doctor_id UUID is required.").optional().nullable(),
  patient_name: z.string().trim().min(1, "Patient name is required.").max(120),
  patient_phone: z.string().trim().min(3, "Patient phone number is required.").max(32),
  slot_time: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "slot_time must be YYYY-MM-DDTHH:mm clinic-local naive format."),
  appointment_type: dualModeAppointmentTypeSchema,
  chief_complaint: z.string().trim().min(1, "Chief complaint / reason for visit is required.").max(1000),
  service_id: z.string().uuid("service_id must be a UUID.").optional().nullable(),
  /**
   * The patient's answers to the during-booking pre-consultation questions,
   * keyed by the question id returned by getPreConsultationQuestions. Without
   * this the answers the agent collected would be silently dropped, because
   * `book_appointment` is the tool the system prompt tells the model to use.
   */
  preConsultAnswers: z
    .array(
      z.object({
        questionId: z.string().uuid("A valid question id is required."),
        answerText: z.string().trim().min(1).max(2000),
      }),
    )
    .max(3)
    .optional()
    .nullable(),
});

export type BookAppointmentArgs = z.infer<typeof bookAppointmentArgsSchema>;

// ── Doctor Capability Check ──────────────────────────────────────────────────

/**
 * Verify if the selected doctor offers Online Video Consultations.
 * `doctors.consultation_type` enum values:
 *   - 'offline': In-clinic only
 *   - 'both': Both in-clinic and online video consultations
 *   - 'online': Online video consultations only
 */
export async function checkDoctorCapability(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  doctorId?: string | null,
): Promise<DoctorCapability | null> {
  if (!doctorId) return null;

  const { data: doctor, error } = await supabase
    .from("doctors")
    .select("id, name, consultation_type, is_visible")
    .eq("clinic_id", clinicId)
    .eq("id", doctorId)
    .maybeSingle();

  if (error || !doctor) {
    return null;
  }

  const rawType = (doctor.consultation_type ?? "offline") as "offline" | "both" | "online";
  const supportsOnlineVideo = rawType === "both" || rawType === "online";
  const supportsInClinic = rawType === "both" || rawType === "offline";

  return {
    doctorId: doctor.id,
    doctorName: doctor.name,
    consultationType: rawType,
    supportsOnlineVideo,
    supportsInClinic,
  };
}

// ── Dual-Mode Book Appointment Execution ─────────────────────────────────────

export interface BookAppointmentExecutionResult {
  ok: boolean;
  appointment?: {
    id: string;
    clinicId: string;
    patientId: string;
    doctorId?: string | null;
    serviceId: string;
    appointmentType: DualModeAppointmentType;
    startTime: string;
    endTime: string;
    status: AppointmentStatus;
    meetingLink: null;
    chiefComplaint: string;
    confirmationMessage: string;
  };
  error?: string;
  capabilityIssue?: boolean;
}

/**
 * Executes appointment booking in dual mode with:
 *  - Row-Level Security / Clinic ID isolation
 *  - Doctor capability check (blocks ONLINE_VIDEO if doctor is offline-only)
 *  - Explicit status: 'confirmed'
 *  - meeting_link: null (NO AI generated links)
 *  - Automated WhatsApp notification trigger
 */
export async function executeDualModeBooking(
  supabase: SupabaseClient<Database>,
  clinic: BookingClinic & { name?: string },
  args: BookAppointmentArgs,
  bookingSource: string = "ai_agent",
): Promise<BookAppointmentExecutionResult> {
  // 1. Strict Tenant Isolation Check
  if (args.clinic_id !== clinic.id) {
    return {
      ok: false,
      error: "Security Violation: clinic_id does not match the active session clinic.",
    };
  }

  // 2. Doctor Capability Check for Online Video Consultations
  const targetDoctorId: string | null = args.doctor_id ?? null;
  if (targetDoctorId) {
    const capability = await checkDoctorCapability(supabase, clinic.id, targetDoctorId);
    if (!capability) {
      return {
        ok: false,
        error: "The specified doctor does not exist or is not active in this clinic.",
      };
    }

    if (args.appointment_type === "ONLINE_VIDEO" && !capability.supportsOnlineVideo) {
      return {
        ok: false,
        capabilityIssue: true,
        error: `Dr. ${capability.doctorName} is only available for In-Clinic Visits and does not offer Online Video Consultations. Would you like to book an In-Clinic Visit with Dr. ${capability.doctorName}, or consult another doctor online?`,
      };
    }

    if (args.appointment_type === "CLINIC_VISIT" && !capability.supportsInClinic) {
      return {
        ok: false,
        capabilityIssue: true,
        error: `Dr. ${capability.doctorName} is only available for Online Video Consultations. Would you like to proceed with an Online Video Consultation?`,
      };
    }
  }

  // 3. Resolve Service ID (use provided or fallback to active consultation service)
  let effectiveServiceId = args.service_id ?? null;
  if (!effectiveServiceId) {
    const { data: defaultService } = await supabase
      .from("services")
      .select("id")
      .eq("clinic_id", clinic.id)
      .eq("status", "active")
      .order("price", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!defaultService) {
      return {
        ok: false,
        error: "No active bookable services found for this clinic.",
      };
    }
    effectiveServiceId = defaultService.id;
  }

  // 4. Atomic Database Reservation via createAppointmentService
  const result = await createAppointmentService(
    supabase,
    { id: clinic.id, timezone: clinic.timezone },
    {
      patient: {
        name: args.patient_name,
        phone: args.patient_phone,
      },
      serviceId: effectiveServiceId,
      doctorId: targetDoctorId,
      start: args.slot_time,
      bookingSource,
      appointmentType: args.appointment_type,
      chiefComplaint: args.chief_complaint,
      meetingLink: null, // Strictly null: AI never generates WebRTC links
      status: "confirmed", // Set status: CONFIRMED
      notes: `Chief complaint: ${args.chief_complaint} | Mode: ${args.appointment_type}`,
      consultationType: args.appointment_type === "ONLINE_VIDEO" ? "video" : "in_clinic",
      preConsultationAnswers: args.preConsultAnswers ?? undefined,
    },
  );

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  const appt = result.appointment;

  // 5. Build user-facing confirmation message
  const clinicDisplayName = clinic.name || "the clinic";
  const formattedStart = utcIsoToClinicLocalInput(appt.start_time, clinic.timezone);

  const confirmationMessage =
    args.appointment_type === "ONLINE_VIDEO"
      ? `Your online video consultation is confirmed for ${formattedStart}. The doctor will share your video call link prior to the appointment.`
      : `Your in-clinic appointment is confirmed for ${formattedStart} at ${clinicDisplayName}.`;

  // 6. Trigger WhatsApp notifications asynchronously (fire-and-forget)
  try {
    const datePart = formattedStart.split("T")[0];
    const timePart = formattedStart.split("T")[1] || "";

    // WhatsApp confirmation to patient
    void notifyPatient({
      clinicId: clinic.id,
      patientId: appt.patient_id,
      to: args.patient_phone,
      channel: "whatsapp",
      type: "appointment_confirmation",
      payload: {
        patientName: args.patient_name,
        clinicName: clinicDisplayName,
        service: args.appointment_type === "ONLINE_VIDEO" ? "Online Video Consultation" : "In-Clinic Visit",
        date: datePart,
        time: timePart,
        appointmentType: args.appointment_type,
        chiefComplaint: args.chief_complaint,
      },
    });

    // Notify doctor / clinic if doctor phone exists
    if (appt.doctor_id) {
      void supabase
        .from("doctors")
        .select("name, phone")
        .eq("id", appt.doctor_id)
        .maybeSingle()
        .then(({ data: doc }) => {
          if (doc?.phone) {
            void notifyPatient({
              clinicId: clinic.id,
              channel: "whatsapp",
              type: "appointment_confirmation",
              to: doc.phone,
              payload: {
                recipientRole: "doctor",
                patientName: args.patient_name,
                doctorName: doc.name,
                clinicName: clinicDisplayName,
                service: args.appointment_type === "ONLINE_VIDEO" ? "Online Video Consultation" : "In-Clinic Visit",
                date: datePart,
                time: timePart,
                appointmentType: args.appointment_type,
                chiefComplaint: args.chief_complaint,
                phone: args.patient_phone,
              },
            });
          }
        });
    }
  } catch (notifyErr) {
    console.error("[receptionist-agent] WhatsApp notification trigger error:", notifyErr);
  }

  return {
    ok: true,
    appointment: {
      id: appt.id,
      clinicId: appt.clinic_id,
      patientId: appt.patient_id,
      doctorId: appt.doctor_id,
      serviceId: appt.service_id,
      appointmentType: args.appointment_type,
      startTime: formattedStart,
      endTime: utcIsoToClinicLocalInput(appt.end_time, clinic.timezone),
      status: appt.status,
      meetingLink: null,
      chiefComplaint: args.chief_complaint,
      confirmationMessage,
    },
  };
}

// ── Gemini API Tool Definitions ──────────────────────────────────────────────

export const bookAppointmentToolDefinition: AIToolDefinition = {
  name: "book_appointment",
  description:
    "Book an appointment for a patient in either dual mode: 'CLINIC_VISIT' (in-person visit at the clinic) or 'ONLINE_VIDEO' (online video consultation). Verifies doctor capabilities, reserves the slot, sets status to 'confirmed', and leaves meeting_link as NULL (video call links are provided later by the doctor).",
  parameters: {
    type: "object",
    properties: {
      clinic_id: {
        type: "string",
        description: "The unique UUID of the clinic.",
      },
      doctor_id: {
        type: "string",
        description: "The UUID of the selected doctor (optional if single practitioner).",
      },
      patient_name: {
        type: "string",
        description: "Full legal name of the patient.",
      },
      patient_phone: {
        type: "string",
        description: "Patient contact / WhatsApp phone number with country code.",
      },
      slot_time: {
        type: "string",
        description: "Exact clinic-local start time in naive format: YYYY-MM-DDTHH:mm (e.g. '2026-08-20T10:30').",
      },
      appointment_type: {
        type: "string",
        enum: ["CLINIC_VISIT", "ONLINE_VIDEO"],
        description: "The preferred consultation mode: 'CLINIC_VISIT' for in-clinic visit, or 'ONLINE_VIDEO' for video call.",
      },
      chief_complaint: {
        type: "string",
        description: "Primary reason for visit or symptoms described by patient.",
      },
      service_id: {
        type: "string",
        description: "Optional UUID of the specific clinic service.",
      },
    },
    required: ["clinic_id", "patient_name", "patient_phone", "slot_time", "appointment_type", "chief_complaint"],
  },
};

export const checkDoctorCapabilityToolDefinition: AIToolDefinition = {
  name: "check_doctor_capability",
  description:
    "Check whether a doctor offers Online Video Consultations, In-Clinic Visits, or both before proposing slots to the patient.",
  parameters: {
    type: "object",
    properties: {
      clinic_id: {
        type: "string",
        description: "The unique UUID of the clinic.",
      },
      doctor_id: {
        type: "string",
        description: "The UUID of the doctor to inspect.",
      },
    },
    required: ["clinic_id", "doctor_id"],
  },
};

// ── Gemini System Prompt Generator ───────────────────────────────────────────

/**
 * Builds the deterministic dual-mode system instructions for Gemini API.
 */
export function buildDualModeSystemPrompt(ctx: ReceptionistAgentContext): string {
  const clinic = ctx.clinic;
  const workingHours = ctx.workingHoursSummary || "Monday - Saturday: 9:00 AM - 6:00 PM";

  const doctorList = (ctx.doctors ?? [])
    .map((d) => {
      const mode =
        d.consultationType === "both"
          ? "Offers both In-Clinic and Online Video Consultations"
          : d.consultationType === "online"
            ? "Offers Online Video Consultations ONLY"
            : "Offers In-Clinic Visits ONLY (No Online Video)";
      return `- Dr. ${d.name} (${d.specialty}) [ID: ${d.id}]: ${mode}`;
    })
    .join("\n");

  return `You are the AI Front Desk Receptionist for ${clinic.name}. You communicate warmly, efficiently, and professionally with patients over WhatsApp and Web Chat.

## DUAL-MODE APPOINTMENT SCHEDULING WORKFLOW (STRICT)

Every appointment booking MUST follow this step-by-step sequence:

### 1. Intent & Mode Discovery (MANDATORY FIRST STEP)
When a patient expresses intent to book an appointment:
- Polite greeting & inquire about preferred mode:
  *"Would you like to book an In-Clinic Visit or an Online Video Consultation?"*
- Mirror the patient's language naturally (English, Roman Urdu, or Hinglish):
  - English: "Would you like to book an In-Clinic Visit or an Online Video Consultation?"
  - Roman Urdu: "Kya aap clinic aakar checkup karwana chahte hain ya Online Video Consultation book karni hai?"
  - Hinglish: "Aap clinic visit prefer karenge ya Online Video Consultation?"

### 2. Doctor Capability Check (CRITICAL)
- Before offering slots for an Online Video Consultation, check if the chosen doctor offers online video consultations.
- If the doctor only offers in-clinic visits ('offline'):
  Politely inform the patient:
  *"Dr. [Doctor Name] is currently available for In-Clinic Visits only. Would you like to book an In-Clinic Visit with Dr. [Doctor Name], or would you prefer an Online Video Consultation with another doctor who offers video calls?"*
- Never promise or book an Online Video Consultation for a doctor who does not support it.

### 3. Slot Reservation & Patient Details Collection
Collect the following details ONE at a time:
- Patient Name
- Contact Phone / WhatsApp number
- Chief Complaint / Reason for visit (e.g. acne, fever, followup)
- Present 3-5 open slots from getAvailability or available timings.

### 4. Database Insertion (Zero-Link Guarantee)
When calling the \`book_appointment\` tool:
- Set \`appointment_type\` to either 'CLINIC_VISIT' or 'ONLINE_VIDEO'.
- Set \`chief_complaint\` to the patient's stated reason.
- Set \`clinic_id\`, \`doctor_id\`, \`patient_name\`, \`patient_phone\`, and \`slot_time\`.
- ZERO MANUAL LINK GENERATION: You must NEVER invent, construct, or output any video meeting URL, WebRTC link, or Zoom/Google Meet link. All consultation links are generated separately by doctors.
- In your confirmation message:
  - If \`appointment_type\` == 'ONLINE_VIDEO', you MUST explicitly say:
    *"Your online video consultation is confirmed. The doctor will share your video call link prior to the appointment."*
  - If \`appointment_type\` == 'CLINIC_VISIT', state:
    *"Your in-clinic visit is confirmed. We look forward to seeing you at ${clinic.address || clinic.name}."*

### 5. Medical Safety & Escalation Rules
- You CANNOT diagnose, prescribe medication, or give medical advice.
- If asked medical diagnosis or drug questions, reply with empathy:
  *"I understand you're not feeling well 😊 I can't help with medical questions, diagnose conditions or prescribe medicine, but our doctor can properly evaluate your symptoms and guide you with the right treatment. Would you like me to arrange an appointment?"*
- For emergencies (chest pain, severe bleeding, breathing distress), immediately direct the patient to the nearest hospital emergency room.

## CLINIC DETAILS
- Clinic Name: ${clinic.name}
- Doctor: ${clinic.doctor_name || "Staff Physician"}
- Phone: ${clinic.phone || "Not set"}
- Address: ${clinic.address || "Not set"}
- Working Hours: ${workingHours}

${doctorList ? `## ROSTER & CONSULTATION MODES\n${doctorList}\n` : ""}
`;
}
