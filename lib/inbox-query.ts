/**
 * Shared data feed for the messages dashboard (Phase 14).
 *
 * Both the /app/inbox page and the dashboard Messages card consume the same
 * merged thread list: existing WhatsApp conversations PLUS patients currently
 * in today's appointment queue (visits in `waiting` / `in_consultation`). Queue
 * patients without a conversation yet appear as lightweight "queue contact"
 * rows (`id = queue:<visitId>`) that staff can click to open (get-or-create) a
 * WhatsApp thread. Patients who already have a conversation are only shown once
 * (the conversation row wins; the queue row is skipped by number).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { InboxThread } from "@/lib/header-activity";
import type { Database } from "@/types/database";

export type InboxConversationRow = {
  id: string;
  patient_whatsapp_number: string;
  patient_id: string | null;
  human_takeover: boolean;
  unread_by_staff: boolean;
  last_message_preview: string | null;
  last_message_at: string | null;
  created_at: string;
  patient_name: string | null;
};

export type QueueContact = {
  visitId: string;
  patientId: string;
  patientName: string | null;
  whatsappNumber: string | null;
  phone: string | null;
  tokenNumber: number;
  checkedInAt: string | null;
};

type InboxFeed = {
  conversations: InboxConversationRow[];
  threads: InboxThread[];
  unreadCount: number;
};

function patientsName(
  raw: { name: string } | { name: string }[] | null,
): string | null {
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0]?.name ?? null) : raw.name;
}

/** wa_ids are digits without '+'; tolerate formatted input defensively. */
export function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/[^\d]/g, "");
}

/** True when the patient's info contains a usable WhatsApp number (digits). */
export function hasReachableNumber(contact: QueueContact): boolean {
  return (
    digitsOnly(contact.whatsappNumber).length > 0 ||
    digitsOnly(contact.phone).length > 0
  );
}

/**
 * Today's appointment-queue patients (waiting / in_consultation), ordered by
 * queue position, joined with patient name + phone numbers. Only visits whose
 * patient record is readable are included.
 */
export async function fetchQueueContacts(
  supabase: SupabaseClient<Database>,
  clinicId: string,
): Promise<QueueContact[]> {
  const now = new Date();
  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).toISOString();
  const endOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  ).toISOString();

  const [{ data: visits }, { data: patients }] = await Promise.all([
    supabase
      .from("visits")
      .select("id, patient_id, token_number, checked_in_at")
      .eq("clinic_id", clinicId)
      .in("status", ["waiting", "in_consultation"])
      .gte("checked_in_at", startOfDay)
      .lt("checked_in_at", endOfDay)
      .order("queue_position", { ascending: true }),
    supabase
      .from("patients")
      .select("id, name, whatsapp_number, phone")
      .eq("clinic_id", clinicId),
  ]);

  const patientsById = new Map(patients?.map((p) => [p.id, p]) ?? []);

  return (visits ?? [])
    .map((visit) => {
      const patient = patientsById.get(visit.patient_id);
      return {
        visitId: visit.id,
        patientId: visit.patient_id,
        patientName: patient?.name ?? null,
        whatsappNumber: patient?.whatsapp_number ?? null,
        phone: patient?.phone ?? null,
        tokenNumber: visit.token_number,
        checkedInAt: visit.checked_in_at ?? null,
      } satisfies QueueContact;
    })
    .filter((contact) => contact.patientName != null);
}

function conversationsToThreads(
  conversations: InboxConversationRow[],
): InboxThread[] {
  return conversations.map((conversation) => ({
    id: conversation.id,
    patientName: conversation.patient_name,
    phone: conversation.patient_whatsapp_number,
    preview: conversation.last_message_preview ?? null,
    lastMessageAt: conversation.last_message_at ?? conversation.created_at ?? "",
    createdAt: conversation.created_at ?? "",
    unread: conversation.unread_by_staff,
    humanTakeover: conversation.human_takeover,
  }));
}

function queueContactsToThreads(
  conversations: InboxConversationRow[],
  queueContacts: QueueContact[],
): InboxThread[] {
  const existingNumbers = new Set<string>();
  for (const conversation of conversations) {
    const digits = digitsOnly(conversation.patient_whatsapp_number);
    if (digits) existingNumbers.add(digits);
  }

  return queueContacts
    .filter((contact) => hasReachableNumber(contact))
    .filter((contact) => {
      const number =
        digitsOnly(contact.whatsappNumber) || digitsOnly(contact.phone);
      return number.length > 0 && !existingNumbers.has(number);
    })
    .map((contact) => {
      const number =
        digitsOnly(contact.whatsappNumber) || digitsOnly(contact.phone);
      return {
        id: `queue:${contact.visitId}`,
        patientName: contact.patientName,
        phone: number,
        preview: `In clinic queue · Token #${contact.tokenNumber}`,
        lastMessageAt: contact.checkedInAt ?? new Date().toISOString(),
        createdAt: contact.checkedInAt ?? new Date().toISOString(),
        unread: false,
        humanTakeover: false,
        queueVisitId: contact.visitId,
        tokenNumber: contact.tokenNumber,
      } satisfies InboxThread;
    });
}

/**
 * Merge conversations + queue contacts into the thread list used by the inbox
 * page and the dashboard. Conversations are sorted newest-first; queue-only
 * contacts (no conversation yet) sit directly below sorted by check-in time.
 */
export function mergeThreads(
  conversations: InboxConversationRow[],
  queueContacts: QueueContact[],
): InboxThread[] {
  const conversationThreads = conversationsToThreads(conversations);
  const queueThreads = queueContactsToThreads(conversations, queueContacts);

  const byTime = (a: InboxThread, b: InboxThread): number =>
    new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();

  return [...conversationThreads, ...queueThreads].sort(byTime);
}

/**
 * Full feed for the messages dashboard: conversations (with the joined patient
 * name), the merged thread list (conversations + queue contacts), and the
 * unread count shown on the "Unread" pill.
 */
export async function fetchInboxFeed(
  supabase: SupabaseClient<Database>,
  clinicId: string,
): Promise<InboxFeed> {
  const [conversationResult, queueContacts] = await Promise.all([
    supabase
      .from("whatsapp_conversations")
      .select(
        `id, patient_whatsapp_number, patient_id, human_takeover,
         unread_by_staff, last_message_preview, last_message_at, created_at,
         patients(name)`,
      )
      .eq("clinic_id", clinicId)
      .order("last_message_at", { ascending: false })
      .limit(50),
    fetchQueueContacts(supabase, clinicId),
  ]);

  const conversations: InboxConversationRow[] = (conversationResult.data ?? [])
    .map((row) => {
      const raw = row as {
        id: string;
        patient_whatsapp_number: string;
        patient_id: string | null;
        human_takeover: boolean;
        unread_by_staff: boolean;
        last_message_preview: string | null;
        last_message_at: string | null;
        created_at: string;
        patients: { name: string } | { name: string }[] | null;
      };
      return {
        id: raw.id,
        patient_whatsapp_number: raw.patient_whatsapp_number,
        patient_id: raw.patient_id,
        human_takeover: raw.human_takeover,
        unread_by_staff: raw.unread_by_staff,
        last_message_preview: raw.last_message_preview,
        last_message_at: raw.last_message_at,
        created_at: raw.created_at,
        patient_name: patientsName(raw.patients),
      } satisfies InboxConversationRow;
    })
    .filter((c) => c.patient_whatsapp_number.length > 0);

  return {
    conversations,
    threads: mergeThreads(conversations, queueContacts),
    unreadCount: conversations.filter((c) => c.unread_by_staff).length,
  };
}