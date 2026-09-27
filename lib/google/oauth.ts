/**
 * Google OAuth 2.0 for the Growth Agent's Business Profile connection.
 *
 * Plain `fetch` against Google's documented endpoints rather than a Google SDK.
 * The only Google SDK already in this repo (`@google/genai`) is the Gemini
 * client, and it is confined to `lib/ai/gemini-provider.ts`; pulling it in here
 * would couple an unrelated dependency to a credential flow. `lib/actions/
 * whatsapp.ts` talks to Meta the same way, for the same reason.
 *
 * Nothing in this module is ever imported by a client component. It reads
 * GOOGLE_CLIENT_SECRET and returns token values, so it is server-only by
 * construction — there is no `NEXT_PUBLIC_` variable in sight.
 */

/** Google's endpoints. Pinned as constants so a typo is not a runtime 404. */
const AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

/**
 * Scopes.
 *
 * `business.manage` is the single scope that covers reading locations and
 * publishing posts — Google does not offer a narrower one for Business Profile,
 * so there is no smaller ask available here. `openid` + `email` exist solely so
 * the UI can show WHICH Google account was connected, which is the difference
 * between a clinic noticing they linked a personal account and not finding out
 * until posts appear on the wrong listing.
 */
export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/business.manage",
  "openid",
  "email",
] as const;

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/**
 * Reads the deployment's Google client credentials.
 *
 * Returns null rather than throwing when they are absent, because "not
 * configured yet" is a state the UI has to render honestly — the same shape
 * `lib/actions/whatsapp.ts` uses for its own missing app credentials. A throw
 * here would turn a first-run page load into a 500.
 */
export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/growth/google/callback`;

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}

/** True when the deployment can start an OAuth flow at all. */
export function isGoogleOAuthConfigured(): boolean {
  return getGoogleOAuthConfig() !== null;
}

/**
 * Builds the consent-screen URL the browser is sent to.
 *
 * `access_type=offline` is what makes Google issue a refresh token at all, and
 * `prompt=consent` forces the consent screen every time rather than only the
 * first. Both are required together: without `prompt=consent`, Google returns a
 * refresh token on the FIRST authorisation only, so a clinic that connects,
 * disconnects and reconnects would get an authorization with no refresh token
 * and a connection that dies an hour later with no obvious cause.
 */
export function buildGoogleConsentUrl(
  config: GoogleOAuthConfig,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_OAUTH_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

export type GoogleTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch ms. Google reports `expires_in` in seconds. */
  expiresAt: number;
  scope: string | null;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

function toTokenSet(json: TokenResponse): GoogleTokenSet | null {
  if (!json.access_token) return null;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    scope: json.scope ?? null,
  };
}

/**
 * Exchanges the one-time `code` from the callback for tokens.
 *
 * Returns null on any failure and logs the reason. Callers turn null into a
 * user-facing message and an `error` connection state; nothing here throws,
 * because a failed exchange is an expected outcome of a flow a human is
 * driving, not an exceptional one.
 */
export async function exchangeGoogleCode(
  config: GoogleOAuthConfig,
  code: string,
): Promise<GoogleTokenSet | null> {
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
      }),
      cache: "no-store",
    });

    const json = (await res.json()) as TokenResponse;
    if (!res.ok || json.error) {
      console.error(
        "[google-oauth] code exchange failed",
        json.error ?? res.status,
        json.error_description ?? "",
      );
      return null;
    }
    return toTokenSet(json);
  } catch (err) {
    console.error(
      "[google-oauth] code exchange network error",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Trades a refresh token for a fresh access token.
 *
 * Note the absent `refresh_token` in the response: Google does not re-issue one
 * here, so the caller must keep the stored value. The returned set therefore has
 * `refreshToken: null` and the caller merges rather than replaces.
 */
export async function refreshGoogleAccessToken(
  config: GoogleOAuthConfig,
  refreshToken: string,
): Promise<GoogleTokenSet | null> {
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
    });

    const json = (await res.json()) as TokenResponse;
    if (!res.ok || json.error) {
      // `invalid_grant` is the one that matters: the clinic revoked access from
      // their Google account, or the token expired after long inactivity. It is
      // not retryable, and the connection has to be marked broken rather than
      // retried forever.
      console.error(
        "[google-oauth] token refresh failed",
        json.error ?? res.status,
      );
      return null;
    }
    return toTokenSet(json);
  } catch (err) {
    console.error(
      "[google-oauth] token refresh network error",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** The connected Google account's email, for display. */
export async function fetchGoogleAccountEmail(
  accessToken: string,
): Promise<string | null> {
  try {
    const res = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { email?: string };
    return json.email ?? null;
  } catch {
    return null;
  }
}

const ACCOUNT_BASE = "https://mybusinessaccountmanagement.googleapis.com/v1";
const BUSINESS_INFO_BASE =
  "https://mybusinessbusinessinformation.googleapis.com/v1";

/**
 * Resolves the clinic's Business Profile location.
 *
 * Returns the first location with a non-empty title. A Google account can hold
 * several locations, and this deliberately does not pretend to disambiguate:
 * picking silently would be worse than picking predictably, so it takes the
 * first and stores its name so the UI can show exactly which listing was
 * chosen. Multi-location selection is a real feature and a later one.
 *
 * A 403 here is the expected answer when the Google Business Profile API has
 * not been allowlisted for the project yet. That is reported distinctly from a
 * network failure, because the fix is a Google approval step rather than
 * anything the clinic can retry.
 */
export type LocationLookupResult =
  | { ok: true; locationId: string; locationName: string }
  | {
      ok: false;
      reason: "not_allowlisted" | "none_found" | "error";
      detail?: string;
    };

export async function fetchPrimaryLocation(
  accessToken: string,
): Promise<LocationLookupResult> {
  const headers = { Authorization: `Bearer ${accessToken}` };

  try {
    // 1. Find the account.
    const accountsRes = await fetch(`${ACCOUNT_BASE}/accounts`, {
      headers,
      cache: "no-store",
    });

    if (accountsRes.status === 403) {
      return { ok: false, reason: "not_allowlisted" };
    }
    if (!accountsRes.ok) {
      return {
        ok: false,
        reason: "error",
        detail: `accounts lookup returned ${accountsRes.status}`,
      };
    }

    const accountsJson = (await accountsRes.json()) as {
      accounts?: { name?: string }[];
    };
    const accountName = accountsJson.accounts?.[0]?.name;
    if (!accountName) return { ok: false, reason: "none_found" };

    // 2. List that account's locations. `readMask` is required by this API —
    //    without it the response carries no fields at all.
    const locationsRes = await fetch(
      `${BUSINESS_INFO_BASE}/${accountName}/locations?readMask=name,title&pageSize=1`,
      { headers, cache: "no-store" },
    );

    if (locationsRes.status === 403) {
      return { ok: false, reason: "not_allowlisted" };
    }
    if (!locationsRes.ok) {
      return {
        ok: false,
        reason: "error",
        detail: `locations lookup returned ${locationsRes.status}`,
      };
    }

    const locationsJson = (await locationsRes.json()) as {
      locations?: { name?: string; title?: string }[];
    };
    const location = locationsJson.locations?.find((l) => l.name && l.title);
    if (!location?.name || !location.title) {
      return { ok: false, reason: "none_found" };
    }

    return {
      ok: true,
      locationId: location.name,
      locationName: location.title,
    };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      detail: err instanceof Error ? err.message : "network error",
    };
  }
}