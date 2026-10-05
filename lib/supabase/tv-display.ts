import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

/**
 * Resilient Supabase client for TV display routes.
 *
 * TV display is an unauthenticated waiting room board.
 * If SUPABASE_SERVICE_ROLE_KEY is present in environment, it uses that.
 * Otherwise, it falls back to the server client / anon key.
 * This guarantees it NEVER throws "[widget] Missing SUPABASE_SERVICE_ROLE_KEY"
 * and crashes with Internal Server Error.
 */
export async function getTvDisplayClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && serviceKey) {
    try {
      return createSupabaseClient<Database>(url, serviceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    } catch (e) {
      console.warn("[getTvDisplayClient] Failed to init service-role client, falling back:", e);
    }
  }

  // Fallback to standard server client (uses cookie session if staff is viewing, or anon key)
  return await createServerClient();
}
