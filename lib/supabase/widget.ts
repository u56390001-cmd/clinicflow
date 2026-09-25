import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Service-role Supabase client for public (unauthenticated) routes.
 *
 * This client bypasses RLS — it is used exclusively in server-side route
 * handlers that manually scope every query to a specific clinic by id (looked
 * up from a validated slug). RLS on authenticated tables is never weakened.
 *
 * Only use this in `/api/widget/*` routes. Never use it in `/app/*` routes
 * or Server Actions that should respect the user's session.
 */
export function createWidgetClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "[widget] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
