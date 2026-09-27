"use server";

import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import { buildGoogleConsentUrl, getGoogleOAuthConfig } from "@/lib/google/oauth";
import { createClient } from "@/lib/supabase/server";
import { createSecretsClient } from "@/lib/supabase/secrets";
import type { ActionResult } from "@/types";

const GROWTH_PATH = "/app/growth-agent";

/**
 * The CSRF state cookie.
 *
 * `httpOnly` so no script can read it, `sameSite: "lax"` so it survives
 * Google's top-level redirect back (a `strict` cookie would be dropped on that
 * cross-site navigation and every connect attempt would fail its state check),
 * and `secure` in production only — a secure cookie over the local http dev
 * origin would be silently discarded by the browser.
 *
 * Ten minutes: long enough to read a consent screen, short enough that an
 * abandoned attempt cannot be replayed later.
 */
const STATE_COOKIE = "growth_google_oauth_state";
const STATE_MAX_AGE_SECONDS = 600;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Starts the OAuth flow.
 *
 * Returns the consent URL rather than redirecting from here: this is a server
 * action called from a button, and a client-side `window.location` assignment
 * is what lets the UI show a spinner and a failure message without the page
 * having already navigated away.
 *
 * ## Order of operations
 *
 * Membership and role are resolved BEFORE the credentials are read and before
 * any state is minted. The reverse order — mint a state, then discover the
 * caller has no clinic — would leave a valid state cookie in the browser that
 * belongs to nobody.
 */
export async function startGoogleConnect(): Promise<ActionResult<{ url: string }>> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You need a clinic before you can connect Google." };
  }
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can connect the clinic's Google profile.",
    };
  }

  const config = getGoogleOAuthConfig();
  if (!config) {
    return {
      ok: false,
      message:
        "Google sign-in isn't configured on this deployment yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local first.",
    };
  }

  // The clinic id travels in the state so the callback can prove which clinic
  // the attempt was started for. It is NOT trusted on its own — the callback
  // re-resolves the caller's membership and compares, so a tampered state
  // cannot connect a clinic the caller does not belong to.
  const nonce = randomUUID();
  const state = `${nonce}.${access.clinic.id}`;

  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STATE_MAX_AGE_SECONDS,
  });

  return { ok: true, data: { url: buildGoogleConsentUrl(config, state) } };
}

/** Reads and clears the state cookie. Single-use by construction. */
export async function consumeOAuthState(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(STATE_COOKIE)?.value ?? null;
  if (value) cookieStore.delete(STATE_COOKIE);
  return value;
}

/**
 * Records a failed connect attempt.
 *
 * Lives here rather than in the route handler so the failure path is testable
 * and so the "which columns mean what" knowledge stays with the rest of the
 * connection logic. Never throws: a failed attempt that then fails to record
 * itself must not turn into a 500 in the user's face.
 */
export async function markGoogleConnectError(
  clinicId: string,
  message: string,
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase
      .from("growth_agent_settings")
      .upsert(
        {
          clinic_id: clinicId,
          connection_state: "error",
          last_error: message,
        },
        { onConflict: "clinic_id" },
      );
  } catch (err) {
    console.error(
      "[growth-google] could not record connect failure",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Disconnects the Google profile.
 *
 * Deleting the secrets row IS the disconnect — the tokens are the connection,
 * so leaving them behind while flipping a state flag would leave a live
 * credential in the database that nothing references. `connection_state` and
 * the resolved identity are cleared in the same action for the same reason.
 *
 * The settings row itself is kept (not deleted) because it also holds the
 * clinic's auto-publishing preferences, which have nothing to do with whether
 * Google is currently linked.
 */
export async function disconnectGoogleProfile(): Promise<ActionResult> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      ok: false,
      message: "You need a clinic before you can disconnect Google.",
    };
  }
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can disconnect the clinic's Google profile.",
    };
  }

  const clinicId = access.clinic.id;

  // Resolve the settings row so we know which secrets row to remove.
  const { data: settings } = await supabase
    .from("growth_agent_settings")
    .select("id")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (settings?.id) {
    // Service role, because growth_agent_secrets has zero RLS policies.
    const secrets = createSecretsClient();
    const { error: deleteError } = await secrets
      .from("growth_agent_secrets")
      .delete()
      .eq("settings_id", settings.id);

    if (deleteError) {
      return {
        ok: false,
        message: "We couldn't remove the stored Google access. Please try again.",
      };
    }
  }

  const { error } = await supabase
    .from("growth_agent_settings")
    .update({
      connection_state: "not_connected",
      google_location_name: null,
      google_location_id: null,
      google_account_email: null,
      connected_at: null,
      last_error: null,
    })
    .eq("clinic_id", clinicId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath(GROWTH_PATH);
  return { ok: true, data: undefined };
}

/**
 * Persists a successful connection.
 *
 * Called by the OAuth callback. `revalidatePath` runs explicitly here because
 * the dashboard must not keep serving a cached "not connected" render after the
 * row changes.
 */
export async function completeGoogleConnect(input: {
  clinicId: string;
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
  scope: string | null;
  accountEmail: string | null;
  locationId: string | null;
  locationName: string | null;
}): Promise<ActionResult> {
  const supabase = await createClient();

  // Upsert the settings row first: it owns the id the secrets row references.
  const { data: settings, error: settingsError } = await supabase
    .from("growth_agent_settings")
    .upsert(
      {
        clinic_id: input.clinicId,
        connection_state: "connected",
        google_location_name: input.locationName,
        google_location_id: input.locationId,
        google_account_email: input.accountEmail,
        connected_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: "clinic_id" },
    )
    .select("id")
    .single();

  if (settingsError || !settings) {
    return {
      ok: false,
      message: settingsError?.message ?? "Could not save the Google connection.",
    };
  }

  // Tokens go to the service-role-only table. Never the settings row — that one
  // is member-readable, and a refresh token in it would be visible to every
  // account in the clinic.
  const secrets = createSecretsClient();
  const { error: secretError } = await secrets
    .from("growth_agent_secrets")
    .upsert(
      {
        settings_id: settings.id,
        refresh_token: input.refreshToken,
        access_token: input.accessToken,
        access_token_expires_at: new Date(input.expiresAt).toISOString(),
        scope: input.scope,
      },
      { onConflict: "settings_id" },
    );

  if (secretError) {
    // The connection is not usable without the refresh token, so leaving the
    // settings row reading `connected` would be a lie. Roll it back.
    await supabase
      .from("growth_agent_settings")
      .update({
        connection_state: "error",
        last_error: "Google access could not be stored. Please reconnect.",
        connected_at: null,
      })
      .eq("clinic_id", input.clinicId);

    return { ok: false, message: "Could not store the Google access securely." };
  }

  revalidatePath(GROWTH_PATH);
  return { ok: true, data: undefined };
}

/**
 * True when a stored refresh token exists for the clinic.
 *
 * The one thing the client is ever told about the secret table: whether a
 * credential is present. Never the value, following the rule stated in
 * `lib/supabase/secrets.ts`.
 */
export async function hasStoredGoogleToken(
  supabase: Supabase,
  clinicId: string,
): Promise<boolean> {
  const { data: settings } = await supabase
    .from("growth_agent_settings")
    .select("id")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (!settings?.id) return false;

  const secrets = createSecretsClient();
  const { data } = await secrets
    .from("growth_agent_secrets")
    .select("id")
    .eq("settings_id", settings.id)
    .maybeSingle();

  return Boolean(data);
}