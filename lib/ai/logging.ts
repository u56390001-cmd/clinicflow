import type { SupabaseClient } from "@supabase/supabase-js";

import type { AiConversationOutcome, Database } from "@/types/database";

/**
 * Record one AI chat turn in `ai_conversation_logs` (PRD §57 observability:
 * conversations, booking attempts, successful/failed bookings, escalations,
 * average conversation length via `message_count` per session). Only session
 * id, outcome and counts are stored — never patient content. Best-effort:
 * logging must never break the chat itself.
 */
export async function logAiConversationTurn(
  supabase: SupabaseClient<Database>,
  input: {
    clinicId: string;
    sessionId: string;
    outcome: AiConversationOutcome;
    messageCount: number;
    bookingAttempted: boolean;
    error?: string | null;
  },
): Promise<void> {
  try {
    const { error } = await supabase.from("ai_conversation_logs").insert({
      clinic_id: input.clinicId,
      session_id: input.sessionId,
      outcome: input.outcome,
      message_count: input.messageCount,
      booking_attempted: input.bookingAttempted,
      error: input.error ?? null,
    });
    if (error) {
      console.error("[ai-log] conversation log insert failed", {
        clinicId: input.clinicId,
        sessionId: input.sessionId,
        code: error.code,
        message: error.message,
      });
    }
  } catch (error) {
    console.error("[ai-log] conversation logging threw", error);
  }
}
