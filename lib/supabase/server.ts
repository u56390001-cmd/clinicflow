import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/types/database";

/**
 * Server-side Supabase client for Server Components, Server Actions and
 * Route Handlers. Reads/writes session cookies via the request's cookie jar.
 *
 * The `setAll` mutation is wrapped in try/catch because Next.js throws when a
 * Server Component tries to set cookies (that must happen in a Server Action
 * or Route Handler). In those throwing contexts the session was already
 * refreshed by middleware, so swallowing the error is intentional.
 */
export async function createClient() {
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
}
