import type { SupabaseClient } from "@supabase/supabase-js";

import type { ClinicRole, Database } from "@/types/database";

/**
 * `requireClinicContext()` is the single server-side gate every Server Action,
 * Route Handler and RSC should call before touching clinic-scoped data. It
 * resolves the caller's identity and tenant from the session (and only the
 * session), then returns a typed {@link TenantContext}. Cross-tenant access is
 * rejected here, at the application layer, before any tenant query is issued —
 * a second wall in front of the database RLS perimeter.
 *
 * NOTE ON ROLE NAMES: the database role enum is `owner | admin | staff`
 * (migration 0001). The spec's `doctor` / `receptionist` are clinical job titles
 * mapped onto `staff` in this codebase, so the guard returns the DB truth
 * (`ClinicRole`) rather than inventing roles the policies cannot enforce.
 */
export interface TenantContext {
  userId: string;
  clinicId: string;
  role: ClinicRole;
  permissions: Record<string, boolean>;
}

/** Full access record retained for service-role callers (includes raw claims). */
export interface TenantAccess {
  userId: string;
  clinicId: string;
  role: ClinicRole;
  claims: Record<string, unknown>;
}

/** No authenticated session — maps to HTTP 401. */
export class UnauthorizedError extends Error {
  readonly statusCode = 401;
  constructor(message = "Unauthorized.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Authenticated but outside the tenant boundary — maps to HTTP 403. */
export class ForbiddenError extends Error {
  readonly statusCode = 403;
  constructor(message = "Access Denied: Tenant Isolation Boundary Violated") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Low-level failure codes thrown by {@link verifyTenantAccess}. */
export class TenantAccessError extends Error {
  constructor(
    public readonly code:
      | "UNAUTHENTICATED"
      | "NOT_A_MEMBER"
      | "STALE_CLAIM"
      | "NOT_PLATFORM_ADMIN",
    message: string,
  ) {
    super(message);
    this.name = "TenantAccessError";
  }
}

const STALE_CLAIM_GRACE_MS = 5 * 60 * 1000;
const CLINIC_ID_HEADER = "x-clinic-id";

function clampTs(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Date.parse(value);
  return 0;
}

interface VerifyTenantAccessOptions {
  supabase?: SupabaseClient<Database>;
  /** Skip the (cheap) DB re-check and trust the JWT app_metadata claim. */
  trustClaims?: boolean;
  /** Reject a JWT whose claim was minted more than this long ago. */
  maxClaimAgeMs?: number;
}

export interface RequireClinicContextOptions extends VerifyTenantAccessOptions {
  /** Request headers; `x-clinic-id` is used when no id argument is passed. */
  headers?: Pick<Headers, "get">;
  /** Dynamic route params (e.g. `[clinicId]`), used as a fallback source. */
  routeParams?: { clinicId?: string | null } | null;
}

/**
 * Lazily import the request-scoped server client. The import is dynamic so
 * `next/headers` is never pulled in by non-request consumers (scripts, edge
 * jobs) that pass their own `supabase` — and so this module can be unit tested
 * without a Next.js runtime.
 */
async function resolveServerClient(): Promise<SupabaseClient<Database>> {
  const { createClient } = await import("@/lib/supabase/server");
  return createClient();
}

function resolveClient(options: {
  supabase?: SupabaseClient<Database>;
}): Promise<SupabaseClient<Database>> {
  return options.supabase
    ? Promise.resolve(options.supabase)
    : resolveServerClient();
}

/**
 * Verify the signed-in user genuinely belongs to `clinicId` and return their
 * role. This is the authoritative app-layer gate that must run before any
 * service-role (RLS-bypassing) operation. It mirrors the DB helpers
 * `is_clinic_member` / `is_clinic_admin` so the two layers cannot disagree.
 *
 * The JWT `app_metadata.clinic_roles` claim is only a fast path; by default we
 * still confirm against `clinic_members`, which is what makes a revoked
 * membership take effect immediately instead of at the next token refresh.
 */
export async function verifyTenantAccess(
  clinicId: string,
  options: VerifyTenantAccessOptions = {},
): Promise<TenantAccess> {
  const supabase = await resolveClient(options);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new TenantAccessError("UNAUTHENTICATED", "No authenticated user.");
  }

  const claims = (user.app_metadata ?? {}) as Record<string, unknown>;

  if (!options.trustClaims) {
    const { data: membership } = await supabase
      .from("clinic_members")
      .select("role")
      .eq("clinic_id", clinicId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      throw new TenantAccessError("NOT_A_MEMBER", "User is not a clinic member.");
    }

    return {
      userId: user.id,
      clinicId,
      role: membership.role as ClinicRole,
      claims,
    };
  }

  const claimRoles = (claims.clinic_roles ?? {}) as Record<string, ClinicRole>;
  const claimIssuedAt = clampTs(claims.clinic_roles_updated_at);
  const ageMs = Date.now() - claimIssuedAt;
  if (claimIssuedAt && ageMs > (options.maxClaimAgeMs ?? STALE_CLAIM_GRACE_MS)) {
    throw new TenantAccessError("STALE_CLAIM", "Membership claim is stale.");
  }

  const role = claimRoles[clinicId];
  if (!role) {
    throw new TenantAccessError("NOT_A_MEMBER", "No clinic role in token.");
  }

  return { userId: user.id, clinicId, role, claims };
}

/**
 * The reusable server-side guard. Resolves the clinic from (in order) the
 * explicit argument, dynamic route params, or the `x-clinic-id` header, then
 * validates membership and returns a {@link TenantContext}.
 *
 * @throws UnauthorizedError (401) when there is no session.
 * @throws ForbiddenError (403) when the clinic id is missing or the caller is
 *   not a member — i.e. a tenant isolation boundary violation.
 */
export async function requireClinicContext(
  requestedClinicId?: string,
  options: RequireClinicContextOptions = {},
): Promise<TenantContext> {
  const clinicId = resolveRequestedClinicId(requestedClinicId, options);
  if (!clinicId) {
    // No resolvable tenant = a boundary violation, not an auth failure.
    throw new ForbiddenError();
  }

  let access: TenantAccess;
  try {
    access = await verifyTenantAccess(clinicId, options);
  } catch (error) {
    if (error instanceof TenantAccessError) {
      if (error.code === "UNAUTHENTICATED") throw new UnauthorizedError();
      throw new ForbiddenError();
    }
    throw error;
  }

  return {
    userId: access.userId,
    clinicId: access.clinicId,
    role: access.role,
    permissions: permissionsForRole(access.role),
  };
}

function resolveRequestedClinicId(
  requested: string | undefined,
  options: RequireClinicContextOptions,
): string | null {
  const candidate =
    requested ??
    options.routeParams?.clinicId ??
    options.headers?.get(CLINIC_ID_HEADER) ??
    null;
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Permission map derived from the DB role, kept in lock-step with the RLS
 * policies (owner/admin may write clinic settings; every member may manage the
 * clinical floor).
 */
export function permissionsForRole(role: ClinicRole): Record<string, boolean> {
  const write = canWriteClinic(role);
  return {
    "clinic:read": true,
    "clinic:write": write,
    "clinic:manage_members": write,
    "clinic:billing": write,
    "clinical:read": true,
    "clinical:write": true,
    "patients:merge": true,
  };
}

/** Verify the caller is a MediBook platform admin (not a clinic admin). */
export async function requirePlatformAdmin(
  options: VerifyTenantAccessOptions = {},
): Promise<{ userId: string; claims: Record<string, unknown> }> {
  const supabase = await resolveClient(options);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new TenantAccessError("UNAUTHENTICATED", "No authenticated user.");
  }

  const claims = (user.app_metadata ?? {}) as Record<string, unknown>;
  const roles = (claims.platform_roles ?? claims.roles ?? []) as unknown;
  const isAdmin =
    claims.platform_admin === true ||
    (Array.isArray(roles) && roles.includes("platform_admin"));

  if (!isAdmin) {
    throw new TenantAccessError(
      "NOT_PLATFORM_ADMIN",
      "Platform admin role required.",
    );
  }

  return { userId: user.id, claims };
}

/** True when the role may write clinic data (owner/admin/clinic_admin). */
export function canWriteClinic(role: ClinicRole): boolean {
  return role === "owner" || role === "admin" || role === "clinic_admin";
}

/** True when the role may administer the clinic (owner/admin/clinic_admin). */
export function isClinicAdmin(role: ClinicRole): boolean {
  return canWriteClinic(role);
}
