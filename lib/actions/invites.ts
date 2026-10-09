"use server";

/**
 * Staff invitations (migration 0074).
 *
 * The ongoing entry point is `createStaffInviteAction` (Team settings): it
 * resolves the caller's clinic, asserts the granular `staff:manage` permission,
 * mints a single-use token, and writes an immutable audit entry. Acceptance is
 * token-only: the raw 64-hex token is the capability, matched against the
 * stored SHA-256 hash through the service-role client (RLS deliberately blocks
 * anonymous reads of invites), and every accept is audited.
 *
 * The onboarding wizard writes its first invites through the shared
 * `createInviteRecord` service directly — the creator is becoming the owner of
 * the clinic in the same action, so there is no existing membership to gate on.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { INVITE_TOKEN_PATTERN, hashInviteToken } from "@/lib/auth/invite-token";
import {
  createInviteRecord,
  type InviteEmailDispatcher,
  type InviteRole,
} from "@/lib/auth/invite-service";
import {
  effectivePermissions,
  logAuditEvent,
  requirePermission,
} from "@/lib/auth/role-guard";
import { getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import { createWidgetClient } from "@/lib/supabase/widget";
import { staffInviteSchema } from "@/lib/validation/schemas";
import type { ClinicRole, Database } from "@/types/database";

export type { InviteRole } from "@/lib/auth/invite-service";

type Client = SupabaseClient<Database>;

export interface StaffInviteActionOptions {
  /** Injected client (tests / non-request callers). */
  supabase?: Client;
  /** Override the mail gateway (tests). */
  sendInviteEmail?: InviteEmailDispatcher;
}

export type CreateStaffInviteResult =
  | {
      ok: true;
      email: string;
      role: InviteRole;
      inviteUrl: string;
      emailSent: boolean;
    }
  | { ok: false; message: string };

export type StaffInviteDetails =
  | {
      kind: "ok";
      email: string;
      role: ClinicRole;
      clinicName: string;
      expiresAt: string;
    }
  | { kind: "invalid" };

export type AcceptStaffInviteResult =
  | { kind: "accepted"; clinicId: string; clinicName: string }
  | { kind: "needs-auth"; email: string; clinicName: string }
  | {
      kind: "wrong-user";
      invitedEmail: string;
      signedInEmail: string;
      clinicName: string;
    }
  | { kind: "invalid" }
  | { kind: "error"; message: string };

type InviteRow = {
  id: string;
  clinic_id: string;
  email: string;
  role: ClinicRole;
  permissions: Record<string, boolean> | null;
  status: string;
  expires_at: string;
  clinics?: { name: string } | null;
};

const INVITE_SELECT =
  "id, clinic_id, email, role, permissions, status, expires_at, clinics(name)";

function isAcceptableInvite(row: Partial<InviteRow> | null): row is InviteRow {
  return (
    !!row &&
    row.status === "pending" &&
    typeof row.expires_at === "string" &&
    new Date(row.expires_at).getTime() > Date.now()
  );
}

/* -------------------------------------------------------------------------- */
/*  Create                                                                    */
/* -------------------------------------------------------------------------- */

export async function createStaffInviteAction(
  input: { email: string; role: string },
  options: StaffInviteActionOptions = {},
): Promise<CreateStaffInviteResult> {
  const parsed = staffInviteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Check the invitation details and try again.",
    };
  }

  const supabase = options.supabase ?? (await createClient());
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to invite teammates." };
  }

  // Granular RBAC gate — mirrors the admin-tier check the DB policies enforce.
  try {
    await requirePermission(access.clinic.id, "staff:manage", { supabase });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.message
          ? error.message
          : "Your role can't invite teammates.",
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  const role = parsed.data.role as InviteRole;
  const result = await createInviteRecord({
    supabase,
    clinicId: access.clinic.id,
    clinicName: access.clinic.name,
    invitedBy: user.id,
    inviterName: user.email ?? "Your teammate",
    email: parsed.data.email,
    role,
    // Persist the role's default permission map so the invite is self-describing.
    permissions: effectivePermissions(role),
    sendInviteEmail: options.sendInviteEmail,
  });

  if (!result.ok) {
    if (result.code === "23505") {
      return {
        ok: false,
        message:
          "An invitation for this email is already pending. Revoke it first to resend.",
      };
    }
    return { ok: false, message: result.message };
  }

  await logAuditEvent(
    {
      clinicId: access.clinic.id,
      userId: user.id,
      action: "STAFF_INVITE_SENT",
      resourceType: "clinic_invite",
      details: { email: parsed.data.email, role },
    },
    { supabase },
  );

  return {
    ok: true,
    email: parsed.data.email,
    role,
    inviteUrl: result.inviteUrl,
    emailSent: result.emailSent,
  };
}

/* -------------------------------------------------------------------------- */
/*  Read (public, for the accept screen)                                      */
/* -------------------------------------------------------------------------- */

export async function getStaffInviteDetails(
  token: string,
  options: { serviceSupabase?: Client } = {},
): Promise<StaffInviteDetails> {
  if (!INVITE_TOKEN_PATTERN.test(token)) return { kind: "invalid" };

  const service = options.serviceSupabase ?? createWidgetClient();
  const tokenHash = await hashInviteToken(token);
  const { data } = await service
    .from("clinic_invites")
    .select(INVITE_SELECT)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  const row = data as InviteRow | null;
  if (!isAcceptableInvite(row)) return { kind: "invalid" };

  return {
    kind: "ok",
    email: row.email,
    role: row.role,
    clinicName: row.clinics?.name ?? "the clinic",
    expiresAt: row.expires_at,
  };
}

/* -------------------------------------------------------------------------- */
/*  Accept                                                                    */
/* -------------------------------------------------------------------------- */

export async function acceptStaffInviteAction(
  token: string,
  options: { supabase?: Client; serviceSupabase?: Client } = {},
): Promise<AcceptStaffInviteResult> {
  if (!INVITE_TOKEN_PATTERN.test(token)) return { kind: "invalid" };

  const service = options.serviceSupabase ?? createWidgetClient();
  const tokenHash = await hashInviteToken(token);
  const { data } = await service
    .from("clinic_invites")
    .select(INVITE_SELECT)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  const row = data as InviteRow | null;
  if (!isAcceptableInvite(row)) return { kind: "invalid" };
  const clinicName = row.clinics?.name ?? "the clinic";

  const supabase = options.supabase ?? (await createClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return { kind: "needs-auth", email: row.email, clinicName };
  }
  if (user.email.toLowerCase() !== row.email.toLowerCase()) {
    return {
      kind: "wrong-user",
      invitedEmail: row.email,
      signedInEmail: user.email,
      clinicName,
    };
  }

  const { data: existing } = await service
    .from("clinic_members")
    .select("id")
    .eq("clinic_id", row.clinic_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    const { error: insertError } = await service.from("clinic_members").insert({
      clinic_id: row.clinic_id,
      user_id: user.id,
      role: row.role,
      email: row.email.toLowerCase(),
      permissions: row.permissions ?? {},
    });
    if (insertError) {
      console.error("[invite] membership insert failed", insertError.message);
      return {
        kind: "error",
        message: "We couldn't add you to the clinic. Please try again.",
      };
    }
  }

  const { error: consumeError } = await service
    .from("clinic_invites")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "pending");
  if (consumeError) {
    console.error("[invite] invite consume failed", consumeError.message);
  }

  await logAuditEvent(
    {
      clinicId: row.clinic_id,
      userId: user.id,
      action: "STAFF_INVITE_ACCEPTED",
      resourceType: "clinic_invite",
      resourceId: row.id,
      details: { role: row.role },
    },
    { supabase: service },
  );

  return { kind: "accepted", clinicId: row.clinic_id, clinicName };
}
