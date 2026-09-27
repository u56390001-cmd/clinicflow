import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Service-role Supabase client for the integration credential tables.
 *
 * `clinic_integration_secrets` has ZERO RLS policies on purpose (migration
 * 0043), so the session-scoped client physically cannot read or write it — the
 * `authenticated` role is denied by design, not by accident. Something has to
 * write those rows, and this is that something.
 *
 * ## Why this exists instead of relaxing the table's RLS
 *
 * The alternative — giving `clinic_integrations` a policy that lets members
 * insert credentials, or putting keys in its member-readable `config` jsonb —
 * would mean any front-desk account could read the clinic's Zoom client secret
 * and Meta access token and exfiltrate them. Splitting the credentials out and
 * leaving them unreachable to the client is what makes the dashboard safe to
 * render for staff.
 *
 * ## Rules for every caller
 *
 *  1. **This bypasses RLS.** It is not an authorisation check. Every caller MUST
 *     resolve the clinic from the signed-in user's own membership first
 *     (`getCurrentClinic` on the session client) and assert the role. Never
 *     accept a `clinicId` from the client.
 *  2. **Instantiate lazily, inside the function that needs it.** Constructing
 *     this at module scope would make the service key reachable from anywhere
 *     that imports the module.
 *  3. **Never return these values to the caller.** Derive booleans ("a key is
 *     saved") and discard the rest. If you find yourself wanting to read a
 *     secret to render it, the answer is a masked field and a "already saved"
 *     hint instead.
 *
 * Distinct from `createWidgetClient` in `./widget.ts`, which is scoped to
 * public `/api/widget/*` routes and resolves its clinic from an unauthenticated
 * slug. Do not merge the two.
 */
export function createSecretsClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "[integrations] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
