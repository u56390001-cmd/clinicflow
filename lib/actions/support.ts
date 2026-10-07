"use server";

/**
 * Help & Support server actions (migration 0061, /app/support).
 *
 * A single action: file a support ticket. It follows the app's action
 * contract — resolve the caller first, then Zod-validate the input, then
 * write. The clinic id is resolved from the caller's own membership (and may
 * be null for a user who has not created a clinic yet); nothing a client
 * sends can name a clinic_id, so a crafted request cannot file a ticket
 * against another clinic. RLS is the backstop, not the primary control.
 */

import { getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";
import { supportTicketSchema } from "@/lib/validation/schemas";

export async function submitSupportTicketAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "You must be signed in to contact support." };
  }

  const parsed = supportTicketSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  // The clinic is context, not caller-supplied: null for users without one.
  const access = await getCurrentClinic(supabase);

  const { data, error } = await supabase
    .from("support_tickets")
    .insert({
      clinic_id: access?.clinic.id ?? null,
      user_id: user.id,
      type: parsed.data.type,
      subject: parsed.data.subject,
      description: parsed.data.description,
      priority: parsed.data.priority,
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, message: "Could not submit your request." };
  }

  return { ok: true, data: { id: data.id } };
}