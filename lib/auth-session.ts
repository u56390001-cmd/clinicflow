import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * Identity of the signed-in user for app-shell components (header, sidebar).
 *
 * Reads the email and profile out of the JWT *claims* via `getClaims()` —
 * local signature validation, no round trip to the Auth server — instead of
 * `getUser()`, which adds 100–300ms of latency on every render. This is the
 * same trade `lib/supabase/middleware.ts` already makes for route protection;
 * see its comment for why `getUser()` is avoided on the request path.
 *
 * Wrapped in `cache()` so the header and the sidebar, which both need this in
 * the same pass, share a single validation per request. Returns null when the
 * token is missing or invalid (middleware would have redirected already; the
 * components degrade to their no-email fallbacks).
 */
export const getSessionIdentity = cache(async (): Promise<{
  userId: string;
  email: string | null;
  fullName: string | null;
} | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as
    | { sub?: string; email?: string; user_metadata?: Record<string, unknown> }
    | undefined;

  if (!claims?.sub) return null;

  const meta = claims.user_metadata ?? null;
  const metaName =
    typeof meta?.full_name === "string" && meta.full_name.trim()
      ? meta.full_name.trim()
      : typeof meta?.name === "string" && meta.name.trim()
        ? meta.name.trim()
        : null;
  const email = typeof claims.email === "string" ? claims.email : null;

  return {
    userId: claims.sub,
    email,
    fullName: metaName ?? (email ? email.split("@")[0] : null),
  };
});
