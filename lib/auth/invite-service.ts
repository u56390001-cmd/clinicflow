import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildInviteUrl,
  generateInviteToken,
  hashInviteToken,
} from "@/lib/auth/invite-token";
import { notifyPatient } from "@/lib/notifications";
import type { NotifyInput, NotifyResult } from "@/lib/notifications/types";
import type { ClinicRole, Database } from "@/types/database";

/**
 * Shared invitation writer (no `"use server"` — imported by both the ongoing
 * team flow and the onboarding wizard). It owns nothing but the mechanics of
 * minting a single-use invite: retire any lapsed duplicate, store only the
 * SHA-256 hash, then best-effort send the email. Callers own auth/RBAC and the
 * audit entry, so this can be unit tested in isolation.
 */

/** Invites can never grant `owner` (DB CHECK enforces it too). */
export type InviteRole = Exclude<ClinicRole, "owner">;

/** Email dispatcher — injectable so tests never touch the mail provider. */
export type InviteEmailDispatcher = (input: NotifyInput) => Promise<NotifyResult>;

const INVITE_TTL_DAYS = 7;

export interface CreateInviteRecordParams {
  supabase: SupabaseClient<Database>;
  clinicId: string;
  clinicName: string;
  invitedBy: string;
  inviterName?: string;
  email: string;
  role: InviteRole;
  permissions?: Record<string, boolean>;
  /** Override the mail gateway (defaults to `notifyPatient`). */
  sendInviteEmail?: InviteEmailDispatcher;
}

export type CreateInviteRecordResult =
  | { ok: true; token: string; inviteUrl: string; emailSent: boolean }
  | { ok: false; code?: string; message: string };

export async function createInviteRecord(
  params: CreateInviteRecordParams,
): Promise<CreateInviteRecordResult> {
  const { supabase, clinicId, clinicName, invitedBy, email, role } = params;
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Retire a lapsed pending invite for this address first: the partial unique
  // index allows one *live* invitation per clinic + email, so an expired one
  // would otherwise block the resend.
  await supabase
    .from("clinic_invites")
    .update({ status: "expired" })
    .eq("clinic_id", clinicId)
    .eq("status", "pending")
    .ilike("email", email)
    .lt("expires_at", now.toISOString());

  const token = generateInviteToken();
  const tokenHash = await hashInviteToken(token);

  const { error } = await supabase.from("clinic_invites").insert({
    clinic_id: clinicId,
    email,
    role,
    permissions: params.permissions ?? {},
    token_hash: tokenHash,
    status: "pending",
    expires_at: expiresAt,
    invited_by: invitedBy,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        code: "23505",
        message: "An invitation for this email is already pending.",
      };
    }
    console.error("[invite] insert failed", error.message);
    return {
      ok: false,
      message: "We couldn't create the invitation. Please try again.",
    };
  }

  const inviteUrl = buildInviteUrl(token);

  const dispatch = params.sendInviteEmail ?? notifyPatient;

  // Email is best-effort: onboarding must not fail because the mail provider is
  // down — the owner can still copy the returned link and share it.
  const emailResult = await dispatch({
    clinicId,
    channel: "email",
    type: "team_invite",
    to: email,
    payload: {
      clinicId,
      clinicName,
      inviterName: params.inviterName ?? "Your teammate",
      role,
      acceptUrl: inviteUrl,
    },
  });

  if (!emailResult.success) {
    console.error("[invite] invite email failed", emailResult.error);
  }

  return { ok: true, token, inviteUrl, emailSent: emailResult.success };
}
