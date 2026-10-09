"use server";

/**
 * Team management (Phase 9, Scope B).
 *
 * Owner/admin can invite teammates by email; invitees accept via a hashed
 * single-use token link. Role changes and removals are enforced here AND in
 * RLS (see 0011): only an owner may grant/remove `owner`, and RLS blocks an
 * admin from deleting an owner's row even if this action were bypassed.
 */

import { revalidatePath } from "next/cache";

import { getCurrentClinic } from "@/lib/clinic-access";
import { APP_ROUTES } from "@/lib/constants";
import { notifyPatient } from "@/lib/notifications";
import { logAuditEvent } from "@/lib/auth/role-guard";
import { createClient } from "@/lib/supabase/server";
import { createWidgetClient } from "@/lib/supabase/widget";
import {
  inviteRevokeSchema,
  memberRemovalSchema,
  memberRoleChangeSchema,
  teamInviteSchema,
} from "@/lib/validation/schemas";
import type { ActionResult } from "@/types";
import type { ClinicInvite, ClinicMember, ClinicRole } from "@/types/database";

const INVITE_TTL_DAYS = 7;

/**
 * Roles allowed to manage the team (invite, change roles, remove). Mirrors the
 * clinic-admin tier: `owner`, legacy `admin`, and the granular `clinic_admin`.
 */
function isAdminRole(role: ClinicRole): boolean {
  return role === "owner" || role === "admin" || role === "clinic_admin";
}

export type TeamMemberView = {
  id: string;
  email: string;
  role: ClinicRole;
  joinedAt: string;
};

export type PendingInviteView = {
  id: string;
  email: string;
  role: ClinicRole;
  expiresAt: string;
};

/* -------------------------------------------------------------------------- */
/*  Queries                                                                   */
/* -------------------------------------------------------------------------- */

export async function getTeamDataAction(): Promise<
  ActionResult<{
    members: TeamMemberView[];
    pendingInvites: PendingInviteView[];
    viewerRole: ClinicRole;
    isAdmin: boolean;
  }>
> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to manage your team." };

  const [membersResult, invitesResult] = await Promise.all([
    supabase
      .from("clinic_members")
      .select("id, email, role, created_at")
      .eq("clinic_id", access.clinic.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("clinic_invites")
      .select("id, email, role, expires_at")
      .eq("clinic_id", access.clinic.id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  if (membersResult.error) {
    return { ok: false, message: "We couldn't load your team. Please try again." };
  }

  const isAdmin = isAdminRole(access.role);
  // Invites are admin-only data (RLS also enforces this).
  const invites = (isAdmin ? (invitesResult.data ?? []) : []) as Array<
    Pick<ClinicInvite, "id" | "email" | "role" | "expires_at">
  >;

  return {
    ok: true,
    data: {
      members: ((membersResult.data ?? []) as Array<Pick<ClinicMember, "id" | "email" | "role" | "created_at">>).map(
        (member) => ({
          id: member.id,
          email: member.email,
          role: member.role,
          joinedAt: member.created_at,
        }),
      ),
      pendingInvites: invites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expires_at,
      })),
      viewerRole: access.role,
      isAdmin,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Invite                                                                    */
/* -------------------------------------------------------------------------- */

function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function inviteTeamMemberAction(
  _prevState: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const parsed = teamInviteSchema.safeParse({
    email: formData.get("email") ?? "",
    role: formData.get("role") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the invitation details and try again.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to invite teammates." };

  // Invites never grant `owner` (DB CHECK also enforces this). Only admin-tier
  // roles may invite; only the owner may invite another admin.
  if (!isAdminRole(access.role)) {
    return { ok: false, message: "Your role can't invite teammates." };
  }
  if (
    access.role !== "owner" &&
    (parsed.data.role === "admin" || parsed.data.role === "clinic_admin")
  ) {
    return { ok: false, message: "Only the clinic owner can invite administrators." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  const token = generateInviteToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Expire any stale pending invite for this email first — the unique index
  // allows one live invitation per clinic + email.
  await supabase
    .from("clinic_invites")
    .update({ status: "expired" })
    .eq("clinic_id", access.clinic.id)
    .eq("status", "pending")
    .ilike("email", parsed.data.email)
    .lt("expires_at", new Date().toISOString());

  const { error: insertError } = await supabase.from("clinic_invites").insert({
    clinic_id: access.clinic.id,
    email: parsed.data.email,
    role: parsed.data.role,
    token_hash: tokenHash,
    status: "pending",
    expires_at: expiresAt,
    invited_by: user.id,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return {
        ok: false,
        message: "An invitation for this email is already pending. Revoke it first to resend.",
      };
    }
    console.error("[team] invite insert failed", insertError.message);
    return { ok: false, message: "We couldn't create the invitation. Please try again." };
  }

  await logAuditEvent(
    {
      clinicId: access.clinic.id,
      userId: user.id,
      action: "STAFF_INVITE_SENT",
      resourceType: "clinic_invite",
      details: { email: parsed.data.email, role: parsed.data.role },
    },
    { supabase },
  );

  const acceptUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/invite/${token}`;
  const emailResult = await notifyPatient({
    clinicId: access.clinic.id,
    channel: "email",
    type: "team_invite",
    to: parsed.data.email,
    payload: {
      clinicId: access.clinic.id,
      clinicName: access.clinic.name,
      inviterName: user.email ?? "Your teammate",
      role: parsed.data.role,
      acceptUrl,
    },
  });

  if (!emailResult.success) {
    console.error("[team] invite email failed", emailResult.error);
    return {
      ok: false,
      message:
        "The invitation was created but the email couldn't be sent. Try again shortly — or share the link manually once email delivery recovers.",
    };
  }

  revalidatePath(APP_ROUTES.app.settings + "/team");
  return { ok: true, data: parsed.data.email };
}

/* -------------------------------------------------------------------------- */
/*  Role change / removal / revoke                                            */
/* -------------------------------------------------------------------------- */

export async function updateMemberRoleAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = memberRoleChangeSchema.safeParse({
    memberId: formData.get("memberId") ?? "",
    role: formData.get("role") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the request and try again.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to manage roles." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  const { data: members } = await supabase
    .from("clinic_members")
    .select("id, role, user_id")
    .eq("clinic_id", access.clinic.id);

  const roster = (members ?? []) as Array<Pick<ClinicMember, "id" | "role" | "user_id">>;
  const target = roster.find((member) => member.id === parsed.data.memberId);
  if (!target) return { ok: false, message: "That member isn't part of your clinic." };

  // Permission rules (also enforced by RLS):
  // - only admin-tier roles may change roles
  // - only an owner may grant owner, change an owner's role, or their own role
  if (!isAdminRole(access.role)) {
    return { ok: false, message: "Your role can't change roles." };
  }
  const isOwner = access.role === "owner";
  if (!isOwner && (target.role === "owner" || parsed.data.role === "owner")) {
    return { ok: false, message: "Only the clinic owner can change owner roles." };
  }
  if (!isOwner && target.user_id === user.id) {
    return { ok: false, message: "Ask the clinic owner to change your role." };
  }

  // Never leave the clinic without an owner.
  const ownersAfterChange =
    roster.filter((member) => member.role === "owner").length -
    (target.role === "owner" && parsed.data.role !== "owner" ? 1 : 0) +
    (target.role !== "owner" && parsed.data.role === "owner" ? 1 : 0);
  if (ownersAfterChange < 1) {
    return { ok: false, message: "The clinic must always keep at least one owner." };
  }

  const { error } = await supabase
    .from("clinic_members")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.memberId);

  if (error) {
    console.error("[team] role update failed", error.message);
    return { ok: false, message: "We couldn't update that member's role. Please try again." };
  }

  revalidatePath(APP_ROUTES.app.settings + "/team");
  return { ok: true, data: undefined };
}

export async function removeMemberAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = memberRemovalSchema.safeParse({
    memberId: formData.get("memberId") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, message: "Missing member id." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to manage your team." };

  if (!isAdminRole(access.role)) {
    return { ok: false, message: "Your role can't remove members." };
  }

  const { data: members } = await supabase
    .from("clinic_members")
    .select("id, role")
    .eq("clinic_id", access.clinic.id);

  const roster = (members ?? []) as Array<Pick<ClinicMember, "id" | "role">>;
  const target = roster.find((member) => member.id === parsed.data.memberId);
  if (!target) return { ok: false, message: "That member isn't part of your clinic." };

  if (access.role !== "owner" && target.role === "owner") {
    return { ok: false, message: "Only the clinic owner can remove another owner." };
  }
  const ownersRemaining =
    roster.filter((member) => member.role === "owner" && member.id !== target.id).length;
  if (target.role === "owner" && ownersRemaining < 1) {
    return { ok: false, message: "The clinic must always keep at least one owner." };
  }

  const { error } = await supabase
    .from("clinic_members")
    .delete()
    .eq("id", parsed.data.memberId);

  if (error) {
    console.error("[team] member removal failed", error.message);
    return { ok: false, message: "We couldn't remove that member. Please try again." };
  }

  revalidatePath(APP_ROUTES.app.settings + "/team");
  return { ok: true, data: undefined };
}

export async function revokeInviteAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = inviteRevokeSchema.safeParse({
    inviteId: formData.get("inviteId") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, message: "Missing invite id." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: false, message: "You must have a clinic to manage invites." };

  const { error } = await supabase
    .from("clinic_invites")
    .update({ status: "revoked" })
    .eq("id", parsed.data.inviteId)
    .eq("status", "pending");

  if (error) {
    console.error("[team] invite revoke failed", error.message);
    return { ok: false, message: "We couldn't revoke that invitation. Please try again." };
  }

  revalidatePath(APP_ROUTES.app.settings + "/team");
  return { ok: true, data: undefined };
}

/* -------------------------------------------------------------------------- */
/*  Accept invite                                                             */
/* -------------------------------------------------------------------------- */

export type AcceptInviteResult =
  | { kind: "accepted"; clinicName: string }
  | { kind: "needs-auth"; email: string; clinicName: string }
  | { kind: "wrong-user"; invitedEmail: string; signedInEmail: string; clinicName: string }
  | { kind: "invalid" }
  | { kind: "error"; message: string };

export type InvitePreview =
  | { kind: "needs-auth"; email: string; clinicName: string }
  | { kind: "invalid" };

export async function getInvitePreviewAction(
  token: string,
): Promise<InvitePreview> {
  return resolveInvite(token);
}

/**
 * Validate an invite token and — when the viewer is the invited user and is
 * signed in — create their membership. The token itself is the capability:
 * lookups go through the service-role client (RLS blocks anonymous reads of
 * invites by design) but are scoped to the exact SHA-256 hash, never a
 * clinic id chosen by the caller.
 */
export async function acceptInviteAction(token: string): Promise<AcceptInviteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    const preview = await resolveInvite(token);
    if (preview.kind === "needs-auth") return preview;
    return preview;
  }

  const serviceRole = createWidgetClient();
  const tokenHash = await sha256Hex(token);
  const { data: invite } = await serviceRole
    .from("clinic_invites")
    .select("id, clinic_id, email, role, status, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!isAcceptableInvite(invite)) {
    return { kind: "invalid" };
  }

  if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return {
      kind: "wrong-user",
      invitedEmail: invite.email,
      signedInEmail: user.email,
      clinicName: "",
    };
  }

  // Already a member? Just consume the invite.
  const { data: existing } = await serviceRole
    .from("clinic_members")
    .select("id")
    .eq("clinic_id", invite.clinic_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    const { error: insertError } = await serviceRole.from("clinic_members").insert({
      clinic_id: invite.clinic_id,
      user_id: user.id,
      role: invite.role,
      email: invite.email.toLowerCase(),
    });
    if (insertError) {
      console.error("[team] membership insert failed", insertError.message);
      return { kind: "error", message: "We couldn't add you to the clinic. Please try again." };
    }
  }

  const { error: consumeError } = await serviceRole
    .from("clinic_invites")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invite.id)
    .eq("status", "pending");

  if (consumeError) {
    console.error("[team] invite consume failed", consumeError.message);
  }

  await logAuditEvent(
    {
      clinicId: invite.clinic_id,
      userId: user.id,
      action: "STAFF_INVITE_ACCEPTED",
      resourceType: "clinic_invite",
      resourceId: invite.id,
      details: { role: invite.role },
    },
    { supabase: serviceRole },
  );

  revalidatePath(APP_ROUTES.app.dashboard);
  return { kind: "accepted", clinicName: "" };
}

type InviteRow = {
  id: string;
  clinic_id: string;
  email: string;
  role: ClinicRole;
  status: string;
  expires_at: string;
};

function isAcceptableInvite(invite: Partial<InviteRow> | null): invite is InviteRow {
  return (
    !!invite &&
    invite.status === "pending" &&
    typeof invite.expires_at === "string" &&
    new Date(invite.expires_at).getTime() > Date.now()
  );
}

/** Look up the invite for display purposes (no session required). */
async function resolveInvite(token: string): Promise<InvitePreview> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { kind: "invalid" };

  const serviceRole = createWidgetClient();
  const tokenHash = await sha256Hex(token);
  const { data: invite } = await serviceRole
    .from("clinic_invites")
    .select("id, clinic_id, email, role, status, expires_at, clinics(name)")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  const row = invite as (InviteRow & { clinics: { name: string } | null }) | null;
  if (!row || !isAcceptableInvite(row)) return { kind: "invalid" };

  return {
    kind: "needs-auth",
    email: row.email,
    clinicName: row.clinics?.name ?? "the clinic",
  };
}
