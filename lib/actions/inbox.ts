"use server";

/**
 * Human takeover inbox (Phase 14).
 *
 * Any clinic member (owner/admin/staff) can open /app/inbox, read a WhatsApp
 * thread, take over the conversation from the AI, reply manually, and hand it
 * back. Taking over flips `human_takeover` on the conversation, which the
 * channel adapter checks BEFORE any AI processing — while it is set, inbound
 * patient messages are stored and flagged unread but never answered by the
 * bot. Releasing restores automatic operation.
 */

import { revalidatePath } from "next/cache";

import { canManageClinical, getCurrentClinic } from "@/lib/clinic-access";
import { digitsOnly } from "@/lib/inbox-query";
import {
  getClinicWhatsappCredentials,
  sendWhatsappText,
} from "@/lib/whatsapp/client";
import {
  ensureConversation,
  logWhatsappMessage,
  touchConversation,
} from "@/lib/whatsapp/conversation";
import { createClient } from "@/lib/supabase/server";
import { createWidgetClient } from "@/lib/supabase/widget";
import type { ActionResult } from "@/types";

const MAX_REPLY_LENGTH = 1000;

async function requireConversation(
  conversationId: string,
): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; clinicId: string }
  | { ok: false; message: string }
> {
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) {
    return { ok: false, message: "Invalid conversation." };
  }
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to use the inbox." };
  }

  const { data } = await supabase
    .from("whatsapp_conversations")
    .select("id")
    .eq("clinic_id", access.clinic.id)
    .eq("id", conversationId)
    .maybeSingle();
  if (!data) {
    return { ok: false, message: "Conversation not found." };
  }
  return { ok: true, supabase, clinicId: access.clinic.id };
}

export async function takeoverConversationAction(
  conversationId: string,
): Promise<ActionResult<null>> {
  const guard = await requireConversation(conversationId);
  if (!guard.ok) return { ok: false, message: guard.message };

  const { error } = await guard.supabase
    .from("whatsapp_conversations")
    .update({ human_takeover: true })
    .eq("id", conversationId)
    .eq("clinic_id", guard.clinicId);
  if (error) {
    return { ok: false, message: "Could not start the takeover. Please try again." };
  }

  revalidatePath("/app/inbox");
  return { ok: true, data: null };
}

export async function releaseConversationAction(
  conversationId: string,
): Promise<ActionResult<null>> {
  const guard = await requireConversation(conversationId);
  if (!guard.ok) return { ok: false, message: guard.message };

  const { error } = await guard.supabase
    .from("whatsapp_conversations")
    .update({ human_takeover: false, unread_by_staff: false })
    .eq("id", conversationId)
    .eq("clinic_id", guard.clinicId);
  if (error) {
    return { ok: false, message: "Could not release the conversation. Please try again." };
  }

  revalidatePath("/app/inbox");
  return { ok: true, data: null };
}

export async function openQueueConversationAction(
  visitId: string,
): Promise<ActionResult<{ conversationId: string }>> {
  if (!/^[0-9a-f-]{36}$/i.test(visitId)) {
    return { ok: false, message: "Invalid visit." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to use the inbox." };
  }
  if (!canManageClinical(access.role)) {
    return {
      ok: false,
      message: "You don't have access to the inbox. Ask an owner or admin.",
    };
  }

  // The visit must be part of today's active queue for this clinic.
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

  const { data: visit } = await supabase
    .from("visits")
    .select("id, patient_id")
    .eq("clinic_id", access.clinic.id)
    .eq("id", visitId)
    .in("status", ["waiting", "in_consultation"])
    .gte("checked_in_at", startOfDay)
    .lt("checked_in_at", endOfDay)
    .maybeSingle();
  if (!visit) {
    return { ok: false, message: "Patient is no longer in today's queue." };
  }

  const { data: patient } = await supabase
    .from("patients")
    .select("id, name, whatsapp_number, phone")
    .eq("clinic_id", access.clinic.id)
    .eq("id", visit.patient_id)
    .maybeSingle();
  if (!patient) {
    return { ok: false, message: "Patient not found." };
  }

  const waNumber = digitsOnly(patient.whatsapp_number) || digitsOnly(patient.phone);
  if (!waNumber) {
    return {
      ok: false,
      message: "This patient has no WhatsApp number on file.",
    };
  }

  // Conversation rows have no member INSERT policy — create via the widget
  // (service-role) client, the same path the incoming webhook uses.
  let serviceSupabase;
  try {
    serviceSupabase = createWidgetClient();
  } catch {
    return { ok: false, message: "Server configuration error." };
  }

  const conversation = await ensureConversation(serviceSupabase, {
    clinicId: access.clinic.id,
    patientWhatsappNumber: waNumber,
  });
  if (!conversation) {
    return { ok: false, message: "Could not open a conversation for this patient." };
  }

  // Link the patient record so the thread shows the real name going forward.
  if (conversation.patient_id !== visit.patient_id) {
    await serviceSupabase
      .from("whatsapp_conversations")
      .update({ patient_id: visit.patient_id })
      .eq("id", conversation.id);
  }

  revalidatePath("/app/inbox");
  return { ok: true, data: { conversationId: conversation.id } };
}

export async function sendStaffReplyAction(
  conversationId: string,
  text: string,
): Promise<ActionResult<null>> {
  const body = text.trim().slice(0, MAX_REPLY_LENGTH);
  if (!body) {
    return { ok: false, message: "Write a message before sending." };
  }

  const guard = await requireConversation(conversationId);
  if (!guard.ok) return { ok: false, message: guard.message };

  const {
    data: { user },
  } = await guard.supabase.auth.getUser();
  if (!user?.email) {
    return { ok: false, message: "You must be signed in." };
  }

  const { data: conversation } = await guard.supabase
    .from("whatsapp_conversations")
    .select("patient_whatsapp_number")
    .eq("id", conversationId)
    .eq("clinic_id", guard.clinicId)
    .maybeSingle();
  if (!conversation) {
    return { ok: false, message: "Conversation not found." };
  }

  // Sending a manual reply implies engagement — flip the takeover flag BEFORE
  // delivering so the adapter can never answer the same thread behind us.
  const { error: takeoverError } = await guard.supabase
    .from("whatsapp_conversations")
    .update({ human_takeover: true })
    .eq("id", conversationId)
    .eq("clinic_id", guard.clinicId);
  if (takeoverError) {
    return { ok: false, message: "Could not start the takeover. Please try again." };
  }

  // Service-role client for the credential lookup (secrets table has zero
  // policies) and the outbound send — same single sending path as the AI.
  let serviceSupabase;
  try {
    serviceSupabase = createWidgetClient();
  } catch {
    return { ok: false, message: "Server configuration error." };
  }
  let accessToken: string;
  let phoneNumberId: string;
  try {
    const credentials = await getClinicWhatsappCredentials(guard.clinicId);
    accessToken = credentials.accessToken;
    phoneNumberId = credentials.phoneNumberId;
  } catch {
    return {
      ok: false,
      message:
        "WhatsApp is not connected for your clinic. Connect it in AI Settings first.",
    };
  }

  const result = await sendWhatsappText(
    { phoneNumberId, accessToken },
    conversation.patient_whatsapp_number,
    body,
  );
  if (!result.ok) {
    console.error("[inbox] staff reply failed", result.error);
    return {
      ok: false,
      message:
        "The message could not be delivered to WhatsApp. Nothing was sent — please try again.",
    };
  }

  const senderName = user.email.split("@")[0];
  await logWhatsappMessage(serviceSupabase, {
    conversationId,
    clinicId: guard.clinicId,
    senderType: "staff",
    content: body,
    senderUserId: user.id,
    senderName,
  });
  await touchConversation(serviceSupabase, {
    conversationId,
    preview: body,
    senderType: "staff",
  });

  revalidatePath("/app/inbox");
  return { ok: true, data: null };
}
