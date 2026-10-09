import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import { verifyTenantAccess, type TenantAccess } from "@/lib/auth/tenant-guard";
import type { Database } from "@/types/database";

/**
 * Runtime "server-only" guard.
 *
 * The `server-only` package is not a project dependency, so importing it would
 * break the build. This throw is the functional equivalent: any attempt to pull
 * this module into a client bundle fails loudly, and the service-role key is
 * never shipped to the browser.
 */
if (typeof window !== "undefined") {
  throw new Error(
    "[service-scoped] This module must never be imported in client code.",
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A service-role client is RLS-bypassing, so it is only ever safe when it is
 * hard-bound to exactly one clinic. `clinicId` is a mandatory constructor
 * argument for every factory here and is validated before any client is built.
 */
function assertClinicId(clinicId: unknown): asserts clinicId is string {
  if (typeof clinicId !== "string" || clinicId.trim().length === 0) {
    throw new Error(
      "[service-scoped] A non-empty clinicId is required to scope a service client.",
    );
  }
  if (!UUID_RE.test(clinicId)) {
    throw new Error(
      `[service-scoped] Invalid clinicId "${clinicId}" — expected a UUID.`,
    );
  }
}

function assertServiceEnv(): { url: string; serviceKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "[service-scoped] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return { url, serviceKey };
}

/** Raw service-role client. Bypasses RLS — always scope queries yourself. */
export function createServiceClient(): SupabaseClient<Database> {
  const { url, serviceKey } = assertServiceEnv();
  return createSupabaseClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface ScopedServiceClient {
  /** The tenant this client is bound to. */
  readonly clinicId: string;
  /** The verified caller, when resolved via {@link getScopedServiceClient}. */
  readonly access?: TenantAccess;
  /** The underlying service-role client. */
  readonly supabase: SupabaseClient<Database>;
  /**
   * Apply the tenant filter to any Postgrest builder, preserving its type so
   * the normal `.order()` / `.limit()` / `.single()` chain keeps working.
   *
   *   const { data } = await scoped
   *     .scope(scoped.supabase.from("patients").select("*"))
   *     .order("created_at");
   */
  scope<T>(builder: T): T;
  /** True when a row's clinic_id belongs to the bound tenant. */
  belongs(clinicId: string | null | undefined): boolean;
  /**
   * Stamp the bound `clinic_id` onto an insert payload. Rejects a payload that
   * already carries a *different* clinic_id, so a mismatched row can never be
   * written through a scoped client.
   */
  stamp<R extends { clinic_id?: string | null } & Record<string, unknown>>(
    row: R,
  ): R & { clinic_id: string };
  /** {@link stamp} for a batch insert. */
  stampAll<R extends { clinic_id?: string | null } & Record<string, unknown>>(
    rows: R[],
  ): (R & { clinic_id: string })[];
}

interface ScopedFactoryOptions {
  /** Inject a client (tests / advanced use). Defaults to a fresh service client. */
  supabase?: SupabaseClient<Database>;
}

function buildScopedClient(
  clinicId: string,
  access: TenantAccess | undefined,
  options: ScopedFactoryOptions,
): ScopedServiceClient {
  assertClinicId(clinicId);
  const supabase = options.supabase ?? createServiceClient();

  const stamp = <R extends { clinic_id?: string | null } & Record<string, unknown>>(
    row: R,
  ): R & { clinic_id: string } => {
    if (row.clinic_id && row.clinic_id !== clinicId) {
      throw new Error(
        `[service-scoped] Refusing to write clinic_id "${row.clinic_id}" through a client bound to "${clinicId}".`,
      );
    }
    return { ...row, clinic_id: clinicId };
  };

  return {
    clinicId,
    access,
    supabase,
    scope<T>(builder: T): T {
      const filterable = builder as unknown as {
        eq: (column: string, value: string) => T;
      };
      return filterable.eq("clinic_id", clinicId);
    },
    belongs(rowClinicId: string | null | undefined): boolean {
      return rowClinicId === clinicId;
    },
    stamp,
    stampAll<R extends { clinic_id?: string | null } & Record<string, unknown>>(
      rows: R[],
    ): (R & { clinic_id: string })[] {
      return rows.map(stamp);
    },
  };
}

/**
 * Build a service-role client hard-bound to `clinicId` — synchronously, with
 * no membership check. Use when the caller has *already* been authorised by
 * {@link requireClinicContext} (e.g. inside a worker or after an explicit
 * guard), and you only need the client to be incapable of cross-tenant access.
 *
 * @throws if `clinicId` is missing or not a UUID — before any client is built.
 */
export function createScopedServiceClient(
  clinicId: string,
  options: ScopedFactoryOptions = {},
): ScopedServiceClient {
  return buildScopedClient(clinicId, undefined, options);
}

/**
 * Resolve a service-role client hard-bound to one clinic *and* verify the
 * signed-in caller is a member of it.
 *
 * Use this whenever a server action / route handler must bypass RLS (e.g. to
 * write a field the authenticated user is not allowed to set). The membership
 * check runs first, so a forged `clinicId` from the client is rejected before
 * any DB access.
 */
export async function getScopedServiceClient(
  clinicId: string,
): Promise<ScopedServiceClient> {
  const access = await verifyTenantAccess(clinicId);
  return buildScopedClient(access.clinicId, access, {});
}
