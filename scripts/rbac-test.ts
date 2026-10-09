/**
 * scripts/rbac-test.ts
 *
 * Offline RBAC + audit test runner.
 *
 * Proves the application-layer permission engine (`lib/auth/role-guard.ts` +
 * `lib/auth/rbac-config.ts`):
 *   - role → permission defaults are correct,
 *   - per-member JSONB overrides win over defaults,
 *   - `requirePermission()` returns a typed context on success and throws the
 *     right HTTP-mapped error (401 / 403) on failure,
 *   - `logAuditEvent()` writes exactly one append-only row.
 *
 * The Supabase client is mocked, so this runs with no credentials:
 *
 *   npx tsx scripts/rbac-test.ts
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_ROLE_PERMISSIONS,
  type Permission,
} from "@/lib/auth/rbac-config";
import { effectivePermissions, hasPermission, logAuditEvent, requirePermission } from "@/lib/auth/role-guard";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/tenant-guard";
import type { ClinicRole, Database } from "@/types/database";

const CLINIC_A = "11111111-1111-4111-8111-111111111111";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type Results = { name: string; pass: boolean; detail?: string };
const results: Results[] = [];

function check(name: string, pass: boolean, detail?: string): void {
  results.push({ name, pass, detail });
  console.log(`${pass ? "[PASS]" : "[FAIL]"} ${name}${detail ? `  (${detail})` : ""}`);
}

/** PostgREST-shaped fake for `auth.getUser()` + the membership lookup. */
function createMockClient(userId: string | null, role: ClinicRole) {
  const calls = { getUser: 0, from: 0 };

  const membershipChain = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    async maybeSingle() {
      return { data: userId ? { role } : null, error: null };
    },
  };

  const client = {
    auth: {
      async getUser() {
        calls.getUser += 1;
        return userId
          ? { data: { user: { id: userId, app_metadata: {} } }, error: null }
          : { data: { user: null }, error: { message: "no session" } };
      },
    },
    from() {
      calls.from += 1;
      return membershipChain;
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, calls };
}

/** Capturing fake for `audit_logs.insert()`. */
function createInsertClient() {
  const rows: Array<Record<string, unknown>> = [];
  const client = {
    from() {
      return {
        async insert(row: Record<string, unknown>) {
          rows.push(row);
          return { error: null };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, rows };
}

async function expectThrow(
  fn: () => Promise<unknown>,
): Promise<Error | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error as Error;
  }
}

async function main() {
  /* --------------------------------------------------------------------- */
  /* 1. Pure permission defaults                                           */
  /* --------------------------------------------------------------------- */
  check(
    "owner holds every permission",
    (Object.keys(DEFAULT_ROLE_PERMISSIONS) as Permission[]).every((p) =>
      hasPermission("owner", {}, p),
    ),
  );
  check(
    "receptionist: billing:write yes, settings:manage no",
    hasPermission("receptionist", {}, "billing:write") &&
      !hasPermission("receptionist", {}, "settings:manage"),
  );
  check(
    "doctor: prescriptions:write yes, billing:write no",
    hasPermission("doctor", {}, "prescriptions:write") &&
      !hasPermission("doctor", {}, "billing:write"),
  );
  check(
    "nurse: patients:read yes, billing:read no",
    hasPermission("nurse", {}, "patients:read") &&
      !hasPermission("nurse", {}, "billing:read"),
  );
  check(
    "accountant: billing:write yes, patients:read no",
    hasPermission("accountant", {}, "billing:write") &&
      !hasPermission("accountant", {}, "patients:read"),
  );
  check(
    "legacy admin/staff still resolve",
    hasPermission("admin", {}, "staff:manage") &&
      hasPermission("staff", {}, "patients:write"),
  );

  /* --------------------------------------------------------------------- */
  /* 2. Per-member overrides                                               */
  /* --------------------------------------------------------------------- */
  check(
    "override grants: receptionist + settings:manage",
    hasPermission("receptionist", { "settings:manage": true }, "settings:manage"),
  );
  check(
    "override revokes: doctor - patients:write",
    !hasPermission("doctor", { "patients:write": false }, "patients:write"),
  );
  check(
    "owner override cannot remove access",
    hasPermission("owner", { "settings:manage": false }, "settings:manage"),
  );
  check(
    "effectivePermissions(owner) all true",
    Object.values(effectivePermissions("owner")).every(Boolean),
  );

  /* --------------------------------------------------------------------- */
  /* 3. requirePermission() → 403 / 401                                    */
  /* --------------------------------------------------------------------- */
  const doctor = createMockClient(USER_A, "doctor");
  const receptionist = createMockClient(USER_A, "receptionist");

  const allowed = await requirePermission(CLINIC_A, "prescriptions:write", {
    supabase: doctor.client,
    permissions: {},
  });
  check(
    "requirePermission allows doctor/prescriptions:write",
    allowed.role === "doctor" && allowed.clinicId === CLINIC_A,
  );

  const doctorBilling = await expectThrow(() =>
    requirePermission(CLINIC_A, "billing:write", {
      supabase: doctor.client,
      permissions: {},
    }),
  );
  check(
    "requirePermission blocks doctor/billing:write (403)",
    doctorBilling instanceof ForbiddenError && doctorBilling.statusCode === 403,
    doctorBilling?.message,
  );

  const receptionSettings = await expectThrow(() =>
    requirePermission(CLINIC_A, "settings:manage", {
      supabase: receptionist.client,
      permissions: {},
    }),
  );
  check(
    "requirePermission blocks receptionist/settings:manage (403)",
    receptionSettings instanceof ForbiddenError &&
      receptionSettings.statusCode === 403,
    receptionSettings?.message,
  );

  const overrideAllowed = await requirePermission(
    CLINIC_A,
    "settings:manage",
    { supabase: receptionist.client, permissions: { "settings:manage": true } },
  );
  check(
    "requirePermission honours member override",
    overrideAllowed.role === "receptionist",
  );

  const noTenant = await expectThrow(() =>
    requirePermission(undefined, "patients:read", {
      supabase: receptionist.client,
      permissions: {},
    }),
  );
  check(
    "missing clinic id → 403 boundary violation",
    noTenant instanceof ForbiddenError,
  );

  const anonymous = createMockClient(null, "staff");
  const unauthenticated = await expectThrow(() =>
    requirePermission(CLINIC_A, "patients:read", {
      supabase: anonymous.client,
      permissions: {},
    }),
  );
  check(
    "no session → 401 Unauthorized",
    unauthenticated instanceof UnauthorizedError &&
      unauthenticated.statusCode === 401,
  );

  /* --------------------------------------------------------------------- */
  /* 4. Audit logging                                                      */
  /* --------------------------------------------------------------------- */
  const audit = createInsertClient();
  await logAuditEvent(
    {
      clinicId: CLINIC_A,
      userId: USER_A,
      action: "PATIENT_VIEW",
      resourceType: "patient",
      resourceId: "p-123",
      details: { source: "chart" },
      ipAddress: "203.0.113.7",
    },
    { supabase: audit.client },
  );
  const row = audit.rows[0];
  check(
    "logAuditEvent writes exactly one append-only row",
    audit.rows.length === 1 &&
      row?.clinic_id === CLINIC_A &&
      row?.user_id === USER_A &&
      row?.action === "PATIENT_VIEW" &&
      row?.resource_type === "patient",
  );

  /* --------------------------------------------------------------------- */
  const failed = results.filter((r) => !r.pass);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed`,
  );
  if (failed.length > 0) {
    console.error(`FAILED: ${failed.map((f) => f.name).join(", ")}`);
    process.exit(1);
  }
}

void main();
