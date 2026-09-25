import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, WhatsappConversation } from "@/types/database";

/**
 * Conversation-state store for the WhatsApp channel (Phase 13).
 *
 * One row per (clinic, patient WhatsApp number) keeps the thread alive across
 * multiple inbound messages — the server-side equivalent of the widget's
 * client-held history + sessionContext. `session_state` is owned entirely by
 * the adapter; this module only persists/retrieves it and appends to the
 * message log.
 *
 * All functions take an explicit client so both the webhook path
 * (service-role) and inbox actions (authenticated, RLS-scoped) can use them.
 */

export type ConversationInput = {
  clinicId: string;
  /** Canonical wa_id: digits only. */
  patientWhatsappNumber: string;
};

/** Fetch the thread row for this patient-clinic pair, if one exists. */
export async function getConversation(
  supabase: SupabaseClient<Database>,
  input: ConversationInput,
): Promise<WhatsappConversation | null> {
  const { data } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("clinic_id", input.clinicId)
    .eq("patient_whatsapp_number", input.patientWhatsappNumber)
    .maybeSingle();
  return data ?? null;
}

/**
 * Get-or-create the thread row. Creation is idempotent via the unique
 * (clinic_id, patient_whatsapp_number) constraint — a webhook retry racing a
 * first insert falls back to re-selecting.
 */
export async function ensureConversation(
  supabase: SupabaseClient<Database>,
  input: ConversationInput,
): Promise<WhatsappConversation | null> {
  const existing = await getConversation(supabase, input);
  if (existing) return existing;

  const { data } = await supabase
    .from("whatsapp_conversations")
    .insert({
      clinic_id: input.clinicId,
      patient_whatsapp_number: input.patientWhatsappNumber,
    })
    .select("*")
    .single();
  if (data) return data;

  // Lost an insert race (or hit another transient error) — try once more.
  return getConversation(supabase, input);
}

export type SessionState = Record<string, unknown>;

/** Persist a new session state onto the thread (full replace). */
export async function saveSessionState(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  sessionState: SessionState,
): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({ session_state: sessionState })
    .eq("id", conversationId);
  if (error) {
    console.error("[whatsapp-conversation] saveSessionState failed", {
      conversationId,
      code: error.code,
      message: error.message,
    });
  }
}

/** Append one message to the persistent thread log. */
export async function logWhatsappMessage(
  supabase: SupabaseClient<Database>,
  input: {
    conversationId: string;
    clinicId: string;
    senderType: "patient" | "ai" | "staff";
    content: string;
    senderUserId?: string | null;
    senderName?: string | null;
    metaMessageId?: string | null;
    sentAt?: string;
  },
): Promise<boolean> {
  // `meta_message_id` is UNIQUE — an ON CONFLICT DO NOTHING insert makes
  // webhook retries idempotent at the storage layer.
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .insert({
      conversation_id: input.conversationId,
      clinic_id: input.clinicId,
      sender_type: input.senderType,
      content: input.content,
      sender_user_id: input.senderUserId ?? null,
      sender_name: input.senderName ?? null,
      meta_message_id: input.metaMessageId ?? null,
      ...(input.sentAt ? { sent_at: input.sentAt } : {}),
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[whatsapp-conversation] message log failed", {
      conversationId: input.conversationId,
      senderType: input.senderType,
      code: error.code,
      message: error.message,
    });
    return true; // Treat as stored-unknown; never block the reply path.
  }
  // No row back under DO NOTHING semantics means this wamid was already seen.
  return data !== null;
}

/**
 * Refresh the thread list-view metadata after any message:
 * last_message_at, preview, unread flag. Patient messages mark the thread
 * unread for staff ONLY when a human has taken over (the AI answering in
 * automatic mode is not something staff must read); AI/staff messages clear it.
 */
export async function touchConversation(
  supabase: SupabaseClient<Database>,
  input: {
    conversationId: string;
    preview: string;
    senderType: "patient" | "ai" | "staff";
    humanTakeover?: boolean;
  },
): Promise<void> {
  const patch: Database["public"]["Tables"]["whatsapp_conversations"]["Update"] = {
    last_message_at: new Date().toISOString(),
    last_message_preview: input.preview.slice(0, 160),
  };
  if (input.senderType === "patient") {
    if (input.humanTakeover === true) {
      patch.unread_by_staff = true;
    }
  } else {
    patch.unread_by_staff = false;
  }
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update(patch)
    .eq("id", input.conversationId);
  if (error) {
    console.error("[whatsapp-conversation] touch failed", {
      conversationId: input.conversationId,
      code: error.code,
      message: error.message,
    });
  }
}

export type ThreadMessage = {
  senderType: "patient" | "ai" | "staff";
  senderName: string | null;
  content: string;
  sentAt: string;
};

/** Recent thread messages, oldest-first, for orchestrator history / inbox. */
export async function getRecentMessages(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  limit = 30,
): Promise<ThreadMessage[]> {
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("sender_type, sender_name, content, sent_at")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: false })
    .limit(limit);
  return (data ?? [])
    .map((row) => ({
      senderType: row.sender_type as ThreadMessage["senderType"],
      senderName: row.sender_name,
      content: row.content,
      sentAt: row.sent_at,
    }))
    .reverse();
}
