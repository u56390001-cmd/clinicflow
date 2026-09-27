import { NextResponse, type NextRequest } from "next/server";

import {
  completeGoogleConnect,
  consumeOAuthState,
  markGoogleConnectError,
} from "@/lib/actions/growth-google";
import { canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import {
  exchangeGoogleCode,
  fetchGoogleAccountEmail,
  fetchPrimaryLocation,
  getGoogleOAuthConfig,
} from "@/lib/google/oauth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const GROWTH_PATH = "/app/growth-agent";

/**
 * Google OAuth callback.
 *
 * A route handler rather than a server action, because Google redirects the
 * browser here with `?code=&state=` on a GET and there is no form to submit.
 *
 * ## What is verified, and in what order
 *
 * 1. `state` is compared against the httpOnly cookie set when the flow started.
 *    Google echoes it back, but the cookie is the only copy an attacker cannot
 *    read, so the cookie is the authority.
 *
 * 2. The caller's own membership is re-resolved from the session and the clinic
 *    id in the state must match it. This is the step that matters: without it,
 *    a leaked state from another clinic would let this route write tokens into
 *    a clinic the caller has nothing to do with. The state is a hint; the
 *    session is the proof.
 *
 * 3. The role is re-checked, because the flow may have taken long enough for
 *    the caller to be demoted.
 *
 * Every failure path redirects back to the Growth Agent with a reason instead
 * of rendering an error page, so a failed connect lands somewhere the person
 * can act.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const googleError = url.searchParams.get("error");

  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(`${GROWTH_PATH}?google=${encodeURIComponent(reason)}`, url.origin),
    );

  // The clinic the attempt was started for, recovered from the state. Used only
  // to record *where* a failure happened; never trusted as authorisation.
  const stateClinicId = stateParam?.includes(".")
    ? stateParam.split(".").slice(1).join(".")
    : null;

  // The person declined the consent screen. Not an error worth alarming about.
  if (googleError) {
    return fail("cancelled");
  }

  if (!code || !stateParam) {
    return fail("missing_code");
  }

  // --- 1. State check ------------------------------------------------------
  const expectedState = await consumeOAuthState();
  if (!expectedState || expectedState !== stateParam) {
    // A mismatch here is either a stale tab, a double-submit, or a forged
    // callback. All three are handled the same way: refuse and start over.
    // If we can attribute it to a clinic, record it so the UI can explain.
    if (stateClinicId) {
      await markGoogleConnectError(
        stateClinicId,
        "The connection attempt could not be verified. Please start again.",
      );
    }
    return fail("state_mismatch");
  }

  // --- 2. Membership re-check ---------------------------------------------
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return fail("no_clinic");
  }
  if (stateClinicId !== access.clinic.id) {
    await markGoogleConnectError(
      access.clinic.id,
      "That connection attempt was started for a different clinic.",
    );
    return fail("clinic_mismatch");
  }

  // --- 3. Role re-check ----------------------------------------------------
  if (!canWriteClinic(access.role)) {
    await markGoogleConnectError(
      access.clinic.id,
      "Only owners and admins can connect the clinic's Google profile.",
    );
    return fail("forbidden");
  }

  const config = getGoogleOAuthConfig();
  if (!config) {
    return fail("not_configured");
  }

  const clinicId = access.clinic.id;

  // --- 4. Exchange the code -----------------------------------------------
  const tokens = await exchangeGoogleCode(config, code);
  if (!tokens) {
    await markGoogleConnectError(
      clinicId,
      "Google rejected the sign-in. Please try connecting again.",
    );
    return fail("exchange_failed");
  }

  // A refresh token is the whole point of the flow. Google omits it when the
  // account has already granted this app access and `prompt=consent` was not
  // honoured; without it the connection dies in an hour, so refusing here is
  // far better than storing a connection that will silently break later.
  if (!tokens.refreshToken) {
    await markGoogleConnectError(
      clinicId,
      "Google did not return a long-lived token. Remove MedBookAi's access at myaccount.google.com/permissions and connect again.",
    );
    return fail("no_refresh_token");
  }

  // --- 5. Resolve what we actually connected to ---------------------------
  const [accountEmail, location] = await Promise.all([
    fetchGoogleAccountEmail(tokens.accessToken),
    fetchPrimaryLocation(tokens.accessToken),
  ]);

  // The connection is real — Google granted tokens — even when the Business
  // Profile API refuses to answer. Two different situations, two different
  // messages, and neither one is "connected".
  if (!location.ok) {
    const message =
      location.reason === "not_allowlisted"
        ? "Connected to Google, but the Business Profile API is not enabled for this app yet. Ask your MedBookAi administrator to request access from Google."
        : location.reason === "none_found"
          ? "Connected to Google, but no Business Profile location was found on that account."
          : `Connected to Google, but your profile could not be read (${location.detail ?? "unknown error"}).`;

    await markGoogleConnectError(clinicId, message);

    // Store the tokens anyway. The clinic HAS granted access; re-running the
    // consent screen once Google approves the API would be a pointless ask.
    await completeGoogleConnect({
      clinicId,
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
      accountEmail,
      locationId: null,
      locationName: null,
    });

    return fail(
      location.reason === "not_allowlisted" ? "api_not_enabled" : "no_location",
    );
  }

  // --- 6. Persist ----------------------------------------------------------
  const saved = await completeGoogleConnect({
    clinicId,
    refreshToken: tokens.refreshToken,
    accessToken: tokens.accessToken,
    expiresAt: tokens.expiresAt,
    scope: tokens.scope,
    accountEmail,
    locationId: location.locationId,
    locationName: location.locationName,
  });

  if (!saved.ok) {
    return fail("store_failed");
  }

  return NextResponse.redirect(
    new URL(`${GROWTH_PATH}?google=connected`, url.origin),
  );
}