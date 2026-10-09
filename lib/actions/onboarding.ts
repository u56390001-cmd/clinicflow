"use server";

/**
 * Fast-track clinic onboarding (migration 0074).
 *
 * One Server Action creates the whole first-run footprint in a single,
 * validated pass: the clinic (with its onboarding shape and a collision-safe
 * slug), the creator's owner membership, and an optional first batch of staff
 * invites. If the membership cannot be written the clinic is rolled back, so a
 * failed bootstrap can never leave an ownerless clinic behind.
 *
 * Returns `{ redirectUrl }` rather than calling `redirect()` so the same code
 * path is unit-testable and the wizard can transition on the client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createInviteRecord,
  type InviteEmailDispatcher,
  type InviteRole,
} from "@/lib/auth/invite-service";
import { effectivePermissions, logAuditEvent } from "@/lib/auth/role-guard";
import { APP_ROUTES, slugify } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { onboardingClinicSchema } from "@/lib/validation/schemas";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

export interface OnboardingActionOptions {
  /** Injected client (tests / non-request callers). */
  supabase?: Client;
  /** Override the mail gateway (tests). */
  sendInviteEmail?: InviteEmailDispatcher;
}

export interface OnboardingInviteOutcome {
  email: string;
  sent: boolean;
  message?: string;
}

export type OnboardingResult =
  | {
      ok: true;
      clinicId: string;
      redirectUrl: string;
      invites: OnboardingInviteOutcome[];
    }
  | { ok: false; message: string };

const MAX_SLUG_ATTEMPTS = 5;

export async function createClinicOnboardingAction(
  input: unknown,
  options: OnboardingActionOptions = {},
): Promise<OnboardingResult> {
  const parsed = onboardingClinicSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check your details and try again.",
    };
  }
  const data = parsed.data;

  const supabase = options.supabase ?? (await createClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "You must be signed in to create a clinic." };
  }

  const baseSlug = slugify(data.name);
  if (!baseSlug) {
    return {
      ok: false,
      message: "Enter a clinic name we can turn into a web address.",
    };
  }

  const address =
    [data.address?.trim(), data.city?.trim()].filter(Boolean).join(", ") || null;

  // Insert the clinic, retrying only on a slug collision (23505). Any other
  // error is real and stops the loop immediately.
  let clinicId: string | null = null;
  let lastError: { code?: string } | null = null;
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const { data: clinic, error } = await supabase
      .from("clinics")
      .insert({
        name: data.name,
        slug,
        organization_type: data.organizationType,
        facility_size: data.facilitySize,
        parent_organization_id: null,
        timezone: data.timezone,
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        address,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (!error && clinic) {
      clinicId = clinic.id;
      break;
    }
    lastError = error;
    if (error?.code !== "23505") break;
  }

  if (!clinicId) {
    if (lastError?.code === "23505") {
      return {
        ok: false,
        message:
          "That clinic web address is already taken. Try a slightly different name.",
      };
    }
    console.error("[onboarding] clinic insert failed", lastError);
    return {
      ok: false,
      message: "We couldn't create your clinic. Please try again.",
    };
  }

  // Bootstrap the owner membership (authorized by `clinic_members_insert_founder`).
  const { error: memberError } = await supabase.from("clinic_members").insert({
    clinic_id: clinicId,
    user_id: user.id,
    role: "owner",
    email: user.email ?? data.email?.trim() ?? "owner@clinic.local",
  });

  if (memberError) {
    console.error("[onboarding] owner membership failed", memberError.message);
    // Best-effort rollback so a failed bootstrap cannot orphan a clinic.
    await supabase.from("clinics").delete().eq("id", clinicId);
    return {
      ok: false,
      message: "We couldn't link you to your clinic. Please try again.",
    };
  }

  await logAuditEvent(
    {
      clinicId,
      userId: user.id,
      action: "CLINIC_CREATED",
      resourceType: "clinic",
      resourceId: clinicId,
      details: {
        organization_type: data.organizationType,
        facility_size: data.facilitySize,
        invited: data.invites?.length ?? 0,
      },
    },
    { supabase },
  );

  // First staff invites. Each is independent: one failing (e.g. duplicate) must
  // not sink onboarding — the owner is told and can resend from Team settings.
  const invites: OnboardingInviteOutcome[] = [];
  for (const invite of data.invites ?? []) {
    const result = await createInviteRecord({
      supabase,
      clinicId,
      clinicName: data.name,
      invitedBy: user.id,
      inviterName: user.email ?? "Your teammate",
      email: invite.email,
      role: invite.role as InviteRole,
      permissions: effectivePermissions(invite.role),
      sendInviteEmail: options.sendInviteEmail,
    });

    if (result.ok) {
      await logAuditEvent(
        {
          clinicId,
          userId: user.id,
          action: "STAFF_INVITE_SENT",
          resourceType: "clinic_invite",
          details: { email: invite.email, role: invite.role },
        },
        { supabase },
      );
      invites.push({ email: invite.email, sent: result.emailSent });
    } else {
      invites.push({
        email: invite.email,
        sent: false,
        message: result.message,
      });
    }
  }

  return {
    ok: true,
    clinicId,
    redirectUrl: APP_ROUTES.app.dashboard,
    invites,
  };
}
