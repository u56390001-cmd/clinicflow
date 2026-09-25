import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

/**
 * Browser-side Supabase client (client components).
 * Safe to call anywhere on the client; session cookies are managed by the
 * @supabase/ssr package automatically.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
