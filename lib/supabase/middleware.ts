import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/types/database";

/**
 * Session refresh + cookie propagation for Next.js middleware.
 *
 * Every request that matches `middleware.ts` refreshes the session and
 * rewrites the session cookies. The response object is re-created so refreshed
 * cookies are forwarded to the browser.
 *
 * We verify the session with `getClaims()` — a local JWT validation that does
 * not hit the Auth server — rather than `getUser()`. `getUser()` makes a
 * network round-trip on every matched request and can transiently return null
 * when the auth endpoint is slow or the refresh token is mid-flight, which
 * surfaces to users as random login redirects. `getClaims()` validates the
 * token locally and only refreshes when the token is actually expired.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // Do not run any code between createServerClient and getClaims() — a common
  // cause of users being randomly logged out.
  const {
    data: claimsData,
  } = await supabase.auth.getClaims();

  const claims = claimsData?.claims;
  const user = claims?.sub ? { id: claims.sub } : null;

  return { supabase, user, response: supabaseResponse };
}
