import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

import type { Database } from "@/types/database";

/**
 * Server-side Supabase client for Server Components, Server Actions and
 * Route Handlers. Reads/writes session cookies via the request's cookie jar.
 *
 * Wrapped in React's `cache()` so that every component rendering in the same
 * request — the layout's header, the sidebar, the page, and any nested card —
 * shares one client instead of each building its own. That matters less for the
 * client object itself than for what sits on top of it: `getCurrentClinic` and
 * `auth.getClaims()` are both memoized per client, so instead of N components
 * each firing their own auth/DB round trip, the request makes one. The cache is
 * request-scoped, so nothing is ever shared across users.
 *
 * The `setAll` mutation is wrapped in try/catch because Next.js throws when a
 * Server Component tries to set cookies (that must happen in a Server Action
 * or Route Handler). In those throwing contexts the session was already
 * refreshed by middleware, so swallowing the error is intentional.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component; middleware already refreshed
            // the session for this request.
          }
        },
      },
    },
  );
});
