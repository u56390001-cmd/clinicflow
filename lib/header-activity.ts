import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Feed data shared by the header's notification bell and messages dropdown.
 *
 * The client widgets import these types only via ``import type``, so this
 * server-only module never leaks into the browser bundle.
 */

export type HeaderAppointmentNotification = {
  kind: "appointment";
  id: string;
  patientName: string;
  serviceName: string;
  tokenNumber: number | null;
  createdAt: string;
};

export type HeaderConversationNotification = {
  kind: "conversation";
  id: string;
  patientName: string | null;
  phone: string;
  createdAt: string;
};

export type HeaderNotification =
  | HeaderAppointmentNotification
  | HeaderConversationNotification;

export type HeaderConversation = {
  id: string;
  patientName: string | null;
  phone: string;
  preview: string | null;
  lastMessageAt: string;
  unread: boolean;
  humanTakeover: boolean;
};

/** One row in the messages dashboard thread list. */
export type InboxThread = {
  id: string;
  patientName: string | null;
  phone: string;
  preview: string | null;
  lastMessageAt: string;
  createdAt: string;
  unread: boolean;
  humanTakeover: boolean;
  /** Set on queue-patient rows that have no conversation yet (id = `queue:<visitId>`). */
  queueVisitId?: string;
  tokenNumber?: number | null;
};

/** Initials used for chat avatars ("M Farooq" -> "MF"). */
export function initialsOf(name: string | null): string {
  const cleaned = name?.trim() ?? "";
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

const APPOINTMENT_LIMIT = 12;
const CONVERSATION_LIMIT = 12;
const NOTIFICATION_LIMIT = 16;

type AppointmentFeedRow = {
  id: string;
  created_at: string;
  patients: { name: string } | { name: string }[] | null;
  services: { name: string } | { name: string }[] | null;
  visits: { token_number: number } | { token_number: number }[] | null;
};

type ConversationFeedRow = {
  id: string;
  created_at: string;
  patient_whatsapp_number: string;
  patients: { name: string } | { name: string }[] | null;
};

type ConversationListRow = {
  id: string;
  patient_whatsapp_number: string;
  human_takeover: boolean;
  unread_by_staff: boolean;
  last_message_preview: string | null;
  last_message_at: string;
  patients: { name: string } | { name: string }[] | null;
};

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/**
 * Chronologically-sorted "what's new" feed for the bell: recently booked
 * appointments (with the service name and, when checked in, the queue token)
 * plus WhatsApp conversations started recently.
 */
export async function fetchHeaderNotifications(
  supabase: SupabaseClient<Database>,
  clinicId: string,
): Promise<HeaderNotification[]> {
  const [appointments, conversations] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, created_at, patients(name), services(name), visits(token_number)")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .limit(APPOINTMENT_LIMIT),
    supabase
      .from("whatsapp_conversations")
      .select("id, created_at, patient_whatsapp_number, patients(name)")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .limit(CONVERSATION_LIMIT),
  ]);

  const activity: HeaderNotification[] = [];

  for (const raw of appointments.data ?? []) {
    const row = raw as AppointmentFeedRow;
    const patient = pickFirst(row.patients);
    const service = pickFirst(row.services);
    const visit = pickFirst(row.visits);
    activity.push({
      kind: "appointment",
      id: row.id,
      patientName: patient?.name ?? "Patient",
      serviceName: service?.name ?? "Service",
      tokenNumber: typeof visit?.token_number === "number" ? visit.token_number : null,
      createdAt: row.created_at,
    });
  }

  for (const raw of conversations.data ?? []) {
    const row = raw as ConversationFeedRow;
    const patient = pickFirst(row.patients);
    activity.push({
      kind: "conversation",
      id: row.id,
      patientName: typeof patient?.name === "string" ? patient.name : null,
      phone: row.patient_whatsapp_number,
      createdAt: row.created_at,
    });
  }

  return activity
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, NOTIFICATION_LIMIT);
}

/** The most recent WhatsApp threads for the messages dropdown. */
export async function fetchHeaderConversations(
  supabase: SupabaseClient<Database>,
  clinicId: string,
): Promise<HeaderConversation[]> {
  const { data } = await supabase
    .from("whatsapp_conversations")
    .select(
      "id, patient_whatsapp_number, human_takeover, unread_by_staff, last_message_preview, last_message_at, patients(name)",
    )
    .eq("clinic_id", clinicId)
    .order("last_message_at", { ascending: false })
    .limit(CONVERSATION_LIMIT);

  const conversations: HeaderConversation[] = [];
  for (const raw of data ?? []) {
    const row = raw as ConversationListRow;
    const patient = pickFirst(row.patients);
    conversations.push({
      id: row.id,
      patientName: typeof patient?.name === "string" ? patient.name : null,
      phone: row.patient_whatsapp_number,
      preview: row.last_message_preview,
      lastMessageAt: row.last_message_at,
      unread: row.unread_by_staff,
      humanTakeover: row.human_takeover,
    });
  }
  return conversations;
}