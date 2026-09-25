import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Must stay in sync with the `app_event_logs_category_check` CHECK constraint
 * (declared in `0013`, widened with `billing` in `0030`). A category missing
 * from the constraint fails the insert with 23514, which `logAppEvent` only
 * reports to the console — so a mismatch here is a silently lost audit row.
 */
export type EventCategory = "api" | "booking" | "email" | "auth" | "billing";
export type EventSeverity = "info" | "warning" | "error";

export type AppEventInput = {
  clinicId?: string | null;
  category: EventCategory;
  /** Short machine-readable event name, e.g. `slot_conflict`. */
  event: string;
  severity?: EventSeverity;
  actorUserId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Record one operational event in `app_event_logs` (Phase 9 observability).
 *
 * Best-effort by contract: logging must never break the operation it
 * observes. Failures fall back to console.error. Keep PII out of `metadata`
 * — ids, codes, and counts only.
 */
export async function logAppEvent(
  supabase: SupabaseClient<Database>,
  input: AppEventInput,
): Promise<void> {
  try {
    const { error } = await supabase.from("app_event_logs").insert({
      clinic_id: input.clinicId ?? null,
      category: input.category,
      event: input.event,
      severity: input.severity ?? "error",
      actor_user_id: input.actorUserId ?? null,
      metadata: input.metadata ?? {},
    });
    if (error) {
      console.error("[observability] app_event_logs insert failed", {
        category: input.category,
        event: input.event,
        code: error.code,
        message: error.message,
      });
    }
  } catch (error) {
    console.error("[observability] event logging threw", error);
  }
}
