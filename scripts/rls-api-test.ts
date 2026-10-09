/**
 * scripts/rls-api-test.ts
 *
 * Application-layer tenant-isolation test runner.
 *
 * Unlike `supabase/tests/phase1_migration_test.sql` (which proves the *database*
 * RLS perimeter against the live project) this script proves the *Next.js*
 * guard wall: that `requireClinicContext()` in `lib/auth/tenant-guard.ts`
 * rejects a cross-tenant request BEFORE any tenant row is queried, and that
 * `createScopedServiceClient()` refuses to exist without a valid clinic id.
 *
 * The Supabase auth client is mocked, so this runs offline with no credentials:
 *
 *   npx tsx scripts/rls-api-test.ts
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ForbiddenError,
  UnauthorizedError,
  requireClinicContext,
  type TenantContext,
} from "@/lib/auth/tenant-guard";
import { createScopedServiceClient } from "@/lib/supabase/service-scoped";
import type { ClinicRole, Database } from "@/types/database";

const CLINIC_A = "11111111-1111-4111-8111-111111111111";
const CLINIC_B = "22222222-2222-4222-8222-222222222222";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type MockUser = {
  id: string;
  app_metadata?: Record<string, unknown>;
};

type Membership = {
  clinic_id: string;
  user_id: string;
  role: ClinicRole;
};

type Results = { name: string; pass: boolean; detail?: string };

const results: Results[] = [];

function check(name: string, pass: boolean, detail?: string): void {
  results.push({ name, pass, detail });
  console.log(
    `${pass ? "[PASS]" : "[FAIL]"} ${name}${detail ? `  (${detail})` : ""}`,
  );
}

/**
 * Minimal PostgREST-shaped fake. Counts calls so we can assert the guard
 * rejected a cross-tenant request without issuing a tenant query.
 */
function createMockSupabaseClient(
  user: MockUser | null,
  memberships: Membership[],
) {
  const calls = { getUser: 0, from: 0 };

  const client = {
    auth: {
      async getUser() {
        calls.getUser += 1;
        return user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: { message: "no session" } };
      },
    },
    from() {
      calls.from += 1;
      const filters: Record<string, unknown> = {};
      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        async maybeSingle() {
          const match = memberships.find(
            (m) =>
              m.clinic_id === filters.clinic_id &&
              m.user_id === filters.user_id,
          );
          return { data: match ? { role: match.role } : null, error: null };
        },
      };
      return builder;
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, calls };
}

async function expectThrow<T>(
  label: string,
  fn: () => Promise<T> | T,
  predicate: (error: unknown) => boolean,
): Promise<boolean> {
  try {
    await fn();
  } catch (error) {
    if (predicate(error)) return true;
    check(`${label} (wrong error)`, false, String(error));
    return false;
  }
  check(`${label} (no throw)`, false);
  return false;
}

async function main(): Promise<void> {
  // ---------------------------------------------------------------------------
  // 1. No session -> 401.
  // ---------------------------------------------------------------------------
  {
    const { client } = createMockSupabaseClient(null, []);
    const threw = await expectThrow(
      "No session -> UnauthorizedError (401)",
      () => requireClinicContext(CLINIC_A, { supabase: client }),
      (e) => e instanceof UnauthorizedError && e.statusCode === 401,
    );
    if (threw) check("No session rejected as 401", true);
  }

  // ---------------------------------------------------------------------------
  // 2. User A legitimately belongs to clinic A only, then requests clinic B.
  // ---------------------------------------------------------------------------
  {
    const { client, calls } = createMockSupabaseClient(
      { id: USER_A },
      [{ clinic_id: CLINIC_A, user_id: USER_A, role: "admin" }],
    );

    const threw = await expectThrow(
      "App-Layer Cross-Tenant Blocked",
      () => requireClinicContext(CLINIC_B, { supabase: client }),
      (e) =>
        e instanceof ForbiddenError &&
        e.statusCode === 403 &&
        e.message === "Access Denied: Tenant Isolation Boundary Violated",
    );
    check(
      "App-Layer Cross-Tenant Blocked",
      threw,
      "403 before any tenant row returned",
    );
    check(
      "Cross-tenant probe hit the guard (membership checked once)",
      calls.getUser === 1 && calls.from === 1,
      `getUser=${calls.getUser} from=${calls.from}`,
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Claim fast-path: cross-tenant is rejected with ZERO tenant DB calls.
  // ---------------------------------------------------------------------------
  {
    const { client, calls } = createMockSupabaseClient(
      {
        id: USER_A,
        app_metadata: {
          clinic_roles: { [CLINIC_A]: "admin" },
          clinic_roles_updated_at: new Date().toISOString(),
        },
      },
      [{ clinic_id: CLINIC_A, user_id: USER_A, role: "admin" }],
    );

    const threw = await expectThrow(
      "Cross-tenant blocked before DB (claim fast-path)",
      () =>
        requireClinicContext(CLINIC_B, {
          supabase: client,
          trustClaims: true,
        }),
      (e) => e instanceof ForbiddenError,
    );
    check(
      "No tenant query issued for the rejected request",
      threw && calls.from === 0,
      `from=${calls.from}`,
    );
  }

  // ---------------------------------------------------------------------------
  // 4. Legitimate request resolves successfully.
  // ---------------------------------------------------------------------------
  {
    const { client } = createMockSupabaseClient(
      { id: USER_A },
      [{ clinic_id: CLINIC_A, user_id: USER_A, role: "admin" }],
    );

    const context: TenantContext = await requireClinicContext(CLINIC_A, {
      supabase: client,
    });
    check(
      "Legitimate same-tenant request resolves",
      context.userId === USER_A &&
        context.clinicId === CLINIC_A &&
        context.role === "admin" &&
        context.permissions["clinic:write"] === true,
      `role=${context.role}`,
    );
  }

  // ---------------------------------------------------------------------------
  // 5. Clinic id resolution from dynamic route params and headers.
  // ---------------------------------------------------------------------------
  {
    const memberships: Membership[] = [
      { clinic_id: CLINIC_A, user_id: USER_A, role: "staff" },
    ];
    const { client: routeClient } = createMockSupabaseClient(
      { id: USER_A },
      memberships,
    );
    const fromParams = await requireClinicContext(undefined, {
      supabase: routeClient,
      routeParams: { clinicId: CLINIC_A },
    });
    check(
      "Resolves clinicId from route params",
      fromParams.clinicId === CLINIC_A && fromParams.role === "staff",
    );

    const { client: headerClient } = createMockSupabaseClient(
      { id: USER_A },
      memberships,
    );
    const fromHeader = await requireClinicContext(undefined, {
      supabase: headerClient,
      headers: new Headers({ "x-clinic-id": CLINIC_A }),
    });
    check("Resolves clinicId from x-clinic-id header", fromHeader.clinicId === CLINIC_A);

    const { client: missingClient } = createMockSupabaseClient(
      { id: USER_A },
      memberships,
    );
    const missing = await expectThrow(
      "Missing clinicId -> ForbiddenError (403)",
      () => requireClinicContext(undefined, { supabase: missingClient }),
      (e) => e instanceof ForbiddenError && e.statusCode === 403,
    );
    check("Unresolvable tenant rejected", missing);
  }

  // ---------------------------------------------------------------------------
  // 6. Service-role wrapper refuses to exist without a valid clinic id.
  // ---------------------------------------------------------------------------
  {
    const badIds: unknown[] = ["", "   ", "not-a-uuid", undefined, null, 42];
    let allThrew = true;
    for (const bad of badIds) {
      try {
        createScopedServiceClient(bad as string);
        allThrew = false;
        check(`createScopedServiceClient(${String(bad)}) rejected`, false);
      } catch {
        // expected
      }
    }
    check(
      "Scoped service client requires a valid clinicId",
      allThrew,
      `${badIds.length} invalid inputs rejected`,
    );
  }

  // ---------------------------------------------------------------------------
  // 7. Scoped client auto-injects / validates clinic_id.
  // ---------------------------------------------------------------------------
  {
    const eqCalls: Array<[string, string]> = [];
    const fakeBuilder = {
      eq(column: string, value: string) {
        eqCalls.push([column, value]);
        return fakeBuilder;
      },
    };
    const scoped = createScopedServiceClient(CLINIC_A, {
      supabase: {} as SupabaseClient<Database>,
    });

    scoped.scope(fakeBuilder);
    check(
      "scope() injects the bound clinic_id",
      eqCalls.length === 1 &&
        eqCalls[0][0] === "clinic_id" &&
        eqCalls[0][1] === CLINIC_A,
    );

    check(
      "belongs() accepts own tenant, rejects another",
      scoped.belongs(CLINIC_A) === true && scoped.belongs(CLINIC_B) === false,
    );

    const stamped = scoped.stamp({ name: "x" });
    check("stamp() writes the bound clinic_id", stamped.clinic_id === CLINIC_A);

    const rejected = await expectThrow(
      "stamp() rejects a foreign clinic_id",
      () => scoped.stamp({ clinic_id: CLINIC_B }),
      () => true,
    );
    check("Foreign clinic_id never written via scoped client", rejected);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed`,
  );
  if (failed.length > 0) {
    console.error(`\n${failed.length} FAILED:`);
    for (const f of failed) console.error(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
    process.exitCode = 1;
  } else {
    console.log("[PASS] App-layer tenant isolation verified.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
