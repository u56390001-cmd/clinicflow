import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  type ExtendedRole,
  type Permission,
} from "@/lib/auth/rbac-config";
import {
  ForbiddenError,
  requireClinicContext,
  type RequireClinicContextOptions,
  type TenantContext,
} from "@/lib/auth/tenant-guard";
import type { Database } from "@/types/database";

/**
 * Runtime RBAC evaluation + immutable audit logging.
 *
 * `requirePermission()` is the server-side gate that combines the tenant guard
 * (`requireClinicContext`, from the app-layer security phase) with a granular
 * permission check, so a Server Action / Route Handler can assert capability
 * without trusting anything the client sent.
 */

/**
 * Pure permission evaluation.
 *
 * 1. `owner` is always allowed (cannot be locked out of their own clinic).
 * 2. A per-member override in `userOverrides` wins when it is a boolean.
 *    (An explicit `false` revokes a default; `true` grants one.)
 * 3. Otherwise the role's default set applies.
 */
export function hasPermission(
  role: ExtendedRole,
  userOverrides: Record<string, boolean>,
  requiredPermission: Permission,
): boolean {
  if (role === "owner") return true;

  const override = userOverrides[requiredPermission];
  if (typeof override === "boolean") return override;

  return DEFAULT_ROLE_PERMISSIONS[role]?.includes(requiredPermission) ?? false;
}

/** The effective permission set for a role + overrides (for UI rendering). */
export function effectivePermissions(
  role: ExtendedRole,
  userOverrides: Record<string, boolean> = {},
): Record<Permission, boolean> {
  const defaults = new Set<Permission>(DEFAULT_ROLE_PERMISSIONS[role] ?? []);
  const result = {} as Record<Permission, boolean>;
  for (const permission of ALL_PERMISSIONS) {
    result[permission] = defaults.has(permission);
  }
  for (const [permission, allowed] of Object.entries(userOverrides)) {
    if (typeof allowed === "boolean") {
      result[permission as Permission] = allowed;
    }
  }
  if (role === "owner") {
    // Owner holds every permission regardless of stored overrides.
    for (const permission of ALL_PERMISSIONS) result[permission] = true;
  }
  return result;
}

export interface RequirePermissionOptions extends RequireClinicContextOptions {
  /**
   * Pre-loaded per-member overrides. When omitted, they are read from
   * `clinic_members.permissions` using the same (or a fresh) client.
   */
  permissions?: Record<string, boolean>;
}

/**
 * Verify the caller is authenticated, is a member of `clinicId`, and holds
 * `requiredPermission`. Returns the resolved {@link TenantContext}.
 *
 * @throws UnauthorizedError (401) when there is no session.
 * @throws ForbiddenError (403) when the caller is outside the tenant boundary
 *   or lacks the permission.
 */
export async function requirePermission(
  clinicId: string | undefined,
  requiredPermission: Permission,
  options: RequirePermissionOptions = {},
): Promise<TenantContext> {
  const context = await requireClinicContext(clinicId, options);
  const overrides =
    options.permissions ?? (await loadMemberPermissions(context, options.supabase));

  if (!hasPermission(context.role, overrides, requiredPermission)) {
    throw new ForbiddenError(
      `Access Denied: missing permission "${requiredPermission}"`,
    );
  }

  return context;
}

async function loadMemberPermissions(
  context: TenantContext,
  injected?: SupabaseClient<Database>,
): Promise<Record<string, boolean>> {
  const supabase =
    injected ?? (await (await import("@/lib/supabase/server")).createClient());
  const { data, error } = await supabase
    .from("clinic_members")
    .select("permissions")
    .eq("clinic_id", context.clinicId)
    .eq("user_id", context.userId)
    .maybeSingle();

  if (error || !data) return {};
  return (data.permissions ?? {}) as Record<string, boolean>;
}

export interface AuditEventInput {
  clinicId: string;
  userId: string;
  /** e.g. "PATIENT_VIEW", "PRESCRIPTION_CREATE", "BILL_REFUND". */
  action: string;
  /** e.g. "patient", "prescription", "invoice". */
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Append an immutable audit entry. Audit writes never throw into the caller's
 * path — a failed log must not abort the clinical action it describes — but the
 * error is surfaced on the server for alerting.
 */
export async function logAuditEvent(
  params: AuditEventInput,
  options: { supabase?: SupabaseClient<Database> } = {},
): Promise<void> {
  const supabase =
    options.supabase ?? (await (await import("@/lib/supabase/server")).createClient());

  const { error } = await supabase.from("audit_logs").insert({
    clinic_id: params.clinicId,
    user_id: params.userId,
    action: params.action,
    resource_type: params.resourceType,
    resource_id: params.resourceId ?? null,
    details: params.details ?? {},
    ip_address: params.ipAddress ?? null,
  });

  if (error) {
    console.error("[audit] failed to write audit log", error.message);
  }
}
