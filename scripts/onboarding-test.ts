/**
 * scripts/onboarding-test.ts
 *
 * Offline fast-track onboarding + staff invite test runner.
 *
 * Proves the onboarding/invite engine end to end WITHOUT touching the network:
 *   - invite token primitives (64-hex format, SHA-256 hashing, link building),
 *   - the onboarding + invite zod schemas,
 *   - `createClinicOnboardingAction` (happy path, slug-collision retry, audit
 *     rows, per-invite permissions),
 *   - `createStaffInviteAction` (RBAC `staff:manage` gate, hashed storage),
 *   - `getStaffInviteDetails` / `acceptStaffInviteAction` (needs-auth,
 *     wrong-user, accepted — copying role + permissions and auditing).
 *
 * The Supabase clients are mocked and the mail gateway is stubbed, so this runs
 * with no credentials:
 *
 *   npx tsx scripts/onboarding-test.ts
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { APP_ROUTES } from "@/lib/constants";
import {
  buildInviteUrl,
  generateInviteToken,
  hashInviteToken,
  INVITE_TOKEN_PATTERN,
} from "@/lib/auth/invite-token";
import { createClinicOnboardingAction } from "@/lib/actions/onboarding";
import {
  acceptStaffInviteAction,
  createStaffInviteAction,
  getStaffInviteDetails,
} from "@/lib/actions/invites";
import type { InviteEmailDispatcher } from "@/lib/auth/invite-service";
import { onboardingClinicSchema } from "@/lib/validation/schemas";
import type { ClinicRole, Database } from "@/types/database";

const CLINIC_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type Results = { name: string; pass: boolean; detail?: string };
const results: Results[] = [];

function check(name: string, pass: boolean, detail?: string): void {
  results.push({ name, pass, detail });
  console.log(`${pass ? "[PASS]" : "[FAIL]"} ${name}${detail ? `  (${detail})` : ""}`);
}

const noopEmail: InviteEmailDispatcher = async () => ({ success: true });

function future(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

/* -------------------------------------------------------------------------- */
/*  Fake user client – route by table                                          */
/* -------------------------------------------------------------------------- */

interface OnboardingMocks {
  auditRows: Record<string, unknown>[];
  inviteInserts: Record<string, unknown>[];
  clinicInserts: Record<string, unknown>[];
  clinicSlugResults: Array<{ data: { id: string } | null; error: { code: string } | null }>;
}

/** Client for `createClinicOnboardingAction` happy paths. */
function createOnboardingClient(mocks: OnboardingMocks) {
  const client = {
    auth: {
      async getUser() {
        return { data: { user: { id: USER_ID, email: "owner@clinic.com" } }, error: null };
      },
    },
    from(table: string) {
      if (table === "clinics") {
        return {
          insert(row: Record<string, unknown>) {
            mocks.clinicInserts.push(row);
            return {
              select() {
                return {
                  async single() {
                    return mocks.clinicSlugResults.length > 0
                      ? mocks.clinicSlugResults.shift()!
                      : { data: { id: CLINIC_ID }, error: null };
                  },
                };
              },
            };
          },
          async delete() {
            return { data: null, error: null };
          },
        };
      }
      if (table === "clinic_members") {
        return { async insert() { return { error: null }; } };
      }
      if (table === "clinic_invites") {
        return {
          update() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      ilike() {
                        return {
                          async lt() { return { data: null, error: null }; },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          async insert(row: Record<string, unknown>) {
            mocks.inviteInserts.push(row);
            return { error: null };
          },
        };
      }
      if (table === "audit_logs") {
        return {
          async insert(row: Record<string, unknown>) {
            mocks.auditRows.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table "${table}" in onboarding client`);
    },
  };
  return client as unknown as SupabaseClient<Database>;
}

/* -------------------------------------------------------------------------- */
/*  Fake staff client – supports getCurrentClinic + requirePermission          */
/* -------------------------------------------------------------------------- */

interface StaffMocks {
  auditRows: Record<string, unknown>[];
  inviteInserts: Record<string, unknown>[];
  role: ClinicRole;
  signedInUserId: string | null;
}

function createStaffClient(mocks: StaffMocks) {
  const client = {
    auth: {
      async getUser() {
        if (!mocks.signedInUserId) {
          return { data: { user: null }, error: { message: "no session" } };
        }
        return {
          data: {
            user: {
              id: mocks.signedInUserId,
              email: "owner@clinic.com",
              app_metadata: {},
            },
          },
          error: null,
        };
      },
    },
    from(table: string) {
      if (table === "clinic_members") {
        return {
          select(cols: string) {
            if (String(cols).startsWith("role, clinics")) {
              // getCurrentClinic → .order().limit(1)
              return {
                order() {
                  return {
                    async limit() {
                      return {
                        data: [
                          {
                            role: mocks.role,
                            clinics: {
                              id: CLINIC_ID,
                              name: "Sunrise Family Clinic",
                              slug: "sunrise-family-clinic",
                              timezone: "UTC",
                              doctor_name: null,
                              phone: null,
                              email: null,
                              address: null,
                              google_review_url: null,
                              appointments_view_mode: "queue",
                              patient_code_prefix: "CLI",
                            },
                          },
                        ],
                        error: null,
                      };
                    },
                  };
                },
              };
            }
            // verifyTenantAccess / loadMemberPermissions → eq().eq().maybeSingle()
            return {
              eq() {
                return {
                  eq() {
                    return {
                      async maybeSingle() {
                        const isPermissions = String(cols).startsWith("permissions");
                        return {
                          data: isPermissions
                            ? { permissions: {} }
                            : { role: mocks.role },
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "clinic_invites") {
        return {
          update() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      ilike() {
                        return {
                          async lt() { return { data: null, error: null }; },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          async insert(row: Record<string, unknown>) {
            mocks.inviteInserts.push(row);
            return { error: null };
          },
        };
      }
      if (table === "audit_logs") {
        return {
          async insert(row: Record<string, unknown>) {
            mocks.auditRows.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table "${table}" in staff client`);
    },
  };
  return client as unknown as SupabaseClient<Database>;
}

/* -------------------------------------------------------------------------- */
/*  Invite service client (token → row) for details + accept                   */
/* -------------------------------------------------------------------------- */

function createServiceClient({
  inviteRow,
  existingMember = false,
}: {
  inviteRow: {
    id: string;
    email: string;
    role: ClinicRole;
    status: string;
    expires_at: string;
    permissions?: Record<string, boolean>;
    clinicName?: string;
  } | null;
  existingMember?: boolean;
}) {
  const state = {
    membershipInserts: [] as Record<string, unknown>[],
    consumedIds: [] as string[],
    consumedPatch: [] as Record<string, unknown>[],
    auditRows: [] as Record<string, unknown>[],
  };

  const client = {
    from(table: string) {
      if (table === "clinic_invites") {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return {
                      data: inviteRow
                        ? {
                            ...inviteRow,
                            clinics:
                              inviteRow.clinicName
                                ? { name: inviteRow.clinicName }
                                : null,
                          }
                        : null,
                      error: null,
                    };
                  },
                };
              },
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              eq(_column: string, value: string) {
                return {
                  eq() {
                    state.consumedIds.push(value);
                    state.consumedPatch.push(patch);
                    return { data: null, error: null };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "clinic_members") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      async maybeSingle() {
                        return existingMember
                          ? { data: { id: "member-1" }, error: null }
                          : { data: null, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
          async insert(row: Record<string, unknown>) {
            state.membershipInserts.push(row);
            return { error: null };
          },
        };
      }
      if (table === "audit_logs") {
        return {
          async insert(row: Record<string, unknown>) {
            state.auditRows.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table "${table}" in service client`);
    },
  } as unknown as SupabaseClient<Database>;

  return { client, ...state };
}

function authClient(
  user: { id: string; email: string } | null,
): SupabaseClient<Database> {
  return {
    auth: {
      async getUser() {
        return user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: { message: "no session" } };
      },
    },
  } as unknown as SupabaseClient<Database>;
}

async function main() {
  /* --------------------------------------------------------------------- */
  /* 1. Invite token primitives                                            */
  /* --------------------------------------------------------------------- */
  const token = generateInviteToken();
  check("generateInviteToken → 64-char token", token.length === 64 && /^[0-9a-f]+$/.test(token));
  check("token matches INVITE_TOKEN_PATTERN", INVITE_TOKEN_PATTERN.test(token));
  check("INVITE_TOKEN_PATTERN rejects short token", !INVITE_TOKEN_PATTERN.test("abc"));

  const hash = await hashInviteToken(token);
  check(
    "hash is 64 hex and not the raw token",
    hash.length === 64 && /^[0-9a-f]+$/.test(hash) && hash !== token,
  );
  check(
    "hash is deterministic",
    (await hashInviteToken(token)) === hash,
  );
  check(
    "buildInviteUrl strips trailing slash",
    buildInviteUrl("t", "https://app.example.com/") === "https://app.example.com/invite/t",
  );

  /* --------------------------------------------------------------------- */
  /* 2. Schemas                                                            */
  /* --------------------------------------------------------------------- */
  const validPayload = {
    name: "Sunrise Family Clinic",
    organizationType: "clinic",
    facilitySize: "single_location",
    timezone: "UTC",
    phone: "+1 555 123 4567",
    email: "FRONT@clinic.com",
    address: "123 Main Street",
    city: "Springfield",
    invites: [{ email: "DR.CHEN@clinic.com", role: "doctor" }],
  };
  const valid = onboardingClinicSchema.safeParse(validPayload);
  check("onboarding schema accepts valid payload", valid.success);
  check(
    "schema lowercases emails",
    valid.success && valid.data.email === "front@clinic.com",
  );
  check(
    "schema lowercases invite emails",
    valid.success && valid.data.invites?.[0]?.email === "dr.chen@clinic.com",
  );
  check(
    "schema rejects empty organizationType",
    !onboardingClinicSchema.safeParse({ ...validPayload, organizationType: "" }).success,
  );
  check(
    "schema rejects unknown organizationType",
    !onboardingClinicSchema.safeParse({ ...validPayload, organizationType: "lab" }).success,
  );
  check(
    "schema rejects blank name",
    !onboardingClinicSchema.safeParse({ ...validPayload, name: "  " }).success,
  );
  check(
    "schema rejects 11 invites (max 10)",
    !onboardingClinicSchema.safeParse({
      ...validPayload,
      invites: Array.from({ length: 11 }, (_, i) => ({ email: `p${i}@clinic.com`, role: "staff" })),
    }).success,
  );

  /* --------------------------------------------------------------------- */
  /* 3. createClinicOnboardingAction — happy path                           */
  /* --------------------------------------------------------------------- */
  const mocks: OnboardingMocks = {
    auditRows: [],
    inviteInserts: [],
    clinicInserts: [],
    clinicSlugResults: [{ data: { id: CLINIC_ID }, error: null }],
  };
  const result = await createClinicOnboardingAction(validPayload, {
    supabase: createOnboardingClient(mocks),
    sendInviteEmail: noopEmail,
  });

  check("onboarding happy path ok", result.ok, result.ok ? undefined : (result as { message: string }).message);
  if (result.ok) {
    check("onboarding returns dashboard redirect", result.redirectUrl === APP_ROUTES.app.dashboard);
    check("invites delivered", result.invites[0]?.sent === true);
  }
  check("onboarding writes CLINIC_CREATED audit", mocks.auditRows.some((r) => r.action === "CLINIC_CREATED"));
  check("onboarding writes STAFF_INVITE_SENT audit", mocks.auditRows.some((r) => r.action === "STAFF_INVITE_SENT"));
  const insertedInvite = mocks.inviteInserts[0];
  check(
    "invite stored hashed token (64 hex, not raw)",
    !!insertedInvite && typeof insertedInvite.token_hash === "string"
      ? INVITE_TOKEN_PATTERN.test(insertedInvite.token_hash as string)
      : false,
  );
  check(
    "invite carries the doctor's permission map",
    !!insertedInvite &&
      (insertedInvite.permissions as Record<string, boolean>)?.["prescriptions:write"] === true,
  );
  check("invite role is doctor", insertedInvite?.role === "doctor");
  const clinicRow = mocks.clinicInserts[0];
  check(
    "clinic inserted with onboarding metadata",
    clinicRow?.organization_type === "clinic" && clinicRow?.facility_size === "single_location",
  );

  /* --------------------------------------------------------------------- */
  /* 4. createClinicOnboardingAction — slug collision retry                 */
  /* --------------------------------------------------------------------- */
  const collisionMocks: OnboardingMocks = {
    auditRows: [],
    inviteInserts: [],
    clinicInserts: [],
    clinicSlugResults: [
      { data: null, error: { code: "23505" } },
      { data: { id: CLINIC_ID }, error: null },
    ],
  };
  const retried = await createClinicOnboardingAction(validPayload, {
    supabase: createOnboardingClient(collisionMocks),
    sendInviteEmail: noopEmail,
  });
  check("slug collision retries with -2 suffix", retried.ok && collisionMocks.clinicInserts[1]?.slug === "sunrise-family-clinic-2");

  /* --------------------------------------------------------------------- */
  /* 5. createClinicOnboardingAction — validation failure                   */
  /* --------------------------------------------------------------------- */
  const invalid = await createClinicOnboardingAction(
    { name: "", organizationType: "clinic", facilitySize: "single_location", timezone: "UTC" },
    { supabase: createOnboardingClient({ auditRows: [], inviteInserts: [], clinicInserts: [], clinicSlugResults: [] }) },
  );
  check("onboarding rejects blank input", !invalid.ok);

  /* --------------------------------------------------------------------- */
  /* 6. createStaffInviteAction — RBAC gate                                 */
  /* --------------------------------------------------------------------- */
  const doctorMocks: StaffMocks = {
    auditRows: [],
    inviteInserts: [],
    role: "doctor",
    signedInUserId: USER_ID,
  };
  const denied = await createStaffInviteAction(
    { email: "staff@clinic.com", role: "receptionist" },
    { supabase: createStaffClient(doctorMocks), sendInviteEmail: noopEmail },
  );
  check(
    "doctor without staff:manage is denied",
    !denied.ok && denied.message.includes("Access Denied"),
  );

  const ownerMocks: StaffMocks = {
    auditRows: [],
    inviteInserts: [],
    role: "owner",
    signedInUserId: USER_ID,
  };
  const allowed = await createStaffInviteAction(
    { email: "staff@clinic.com", role: "receptionist" },
    { supabase: createStaffClient(ownerMocks), sendInviteEmail: noopEmail },
  );
  check("owner can invite", allowed.ok, allowed.ok ? undefined : (allowed as { message: string }).message);
  if (allowed.ok) {
    check(
      "invite URL points at the raw token",
      INVITE_TOKEN_PATTERN.test(allowed.inviteUrl.split("/invite/")[1] ?? ""),
    );
    check("allowable role echoed", allowed.role === "receptionist");
  }
  check(
    "invite stored a hashed token for the owner flow",
    ownerMocks.inviteInserts[0]?.token_hash !== undefined &&
      INVITE_TOKEN_PATTERN.test(ownerMocks.inviteInserts[0]?.token_hash as string),
  );
  check("owner flow audits STAFF_INVITE_SENT", ownerMocks.auditRows.some((r) => r.action === "STAFF_INVITE_SENT"));

  /* --------------------------------------------------------------------- */
  /* 7. getStaffInviteDetails                                               */
  /* --------------------------------------------------------------------- */
  const details = await getStaffInviteDetails("a".repeat(64), {
    serviceSupabase: createServiceClient({
      inviteRow: {
        id: "inv-1",
        email: "staff@clinic.com",
        role: "doctor",
        status: "pending",
        expires_at: future(),
        permissions: {},
        clinicName: "Sunrise Family Clinic",
      },
    }).client,
  });
  check(
    "details resolves a pending invite",
    details.kind === "ok" && details.clinicName === "Sunrise Family Clinic" && details.role === "doctor",
  );

  const expired = await getStaffInviteDetails("a".repeat(64), {
    serviceSupabase: createServiceClient({
      inviteRow: {
        id: "inv-2",
        email: "staff@clinic.com",
        role: "doctor",
        status: "pending",
        expires_at: new Date(Date.now() - 1000).toISOString(),
      },
    }).client,
  });
  check("expired invite is invalid", expired.kind === "invalid");

  const malformed = await getStaffInviteDetails("not-a-token");
  check("malformed token is invalid", malformed.kind === "invalid");

  /* --------------------------------------------------------------------- */
  /* 8. acceptStaffInviteAction                                             */
  /* --------------------------------------------------------------------- */
  const acceptedService = createServiceClient({
    inviteRow: {
      id: "inv-3",
      email: "staff@clinic.com",
      role: "doctor",
      status: "pending",
      expires_at: future(),
      permissions: { "appointments:write": true, "billing:write": false },
      clinicName: "Sunrise Family Clinic",
    },
  });
  const accepted = await acceptStaffInviteAction("a".repeat(64), {
    supabase: authClient({ id: USER_ID, email: "staff@clinic.com" }),
    serviceSupabase: acceptedService.client,
  });
  check(
    "accept succeeds for the invited user",
    accepted.kind === "accepted" && accepted.clinicName === "Sunrise Family Clinic",
  );
  check(
    "accept copies role + permissions onto the membership",
    acceptedService.membershipInserts[0]?.role === "doctor" &&
      (acceptedService.membershipInserts[0]?.permissions as Record<string, boolean>)?.["appointments:write"] === true,
  );
  check("accept consumes the invite", acceptedService.consumedIds[0] === "inv-3" && acceptedService.consumedPatch[0]?.status === "accepted");
  check("accept audits STAFF_INVITE_ACCEPTED", acceptedService.auditRows.some((r) => r.action === "STAFF_INVITE_ACCEPTED"));

  const needsAuth = await acceptStaffInviteAction("a".repeat(64), {
    supabase: authClient(null),
    serviceSupabase: createServiceClient({
      inviteRow: {
        id: "inv-4",
        email: "staff@clinic.com",
        role: "receptionist",
        status: "pending",
        expires_at: future(),
        clinicName: "Sunrise Family Clinic",
      },
    }).client,
  });
  check(
    "accept without a session → needs-auth with pre-fill email",
    needsAuth.kind === "needs-auth" && needsAuth.email === "staff@clinic.com",
  );

  const wrongUser = await acceptStaffInviteAction("a".repeat(64), {
    supabase: authClient({ id: USER_ID, email: "other@clinic.com" }),
    serviceSupabase: createServiceClient({
      inviteRow: {
        id: "inv-5",
        email: "staff@clinic.com",
        role: "doctor",
        status: "pending",
        expires_at: future(),
        permissions: {},
      },
    }).client,
  });
  check(
    "accept as a different user → wrong-user",
    wrongUser.kind === "wrong-user" && wrongUser.invitedEmail === "staff@clinic.com",
  );

  /* --------------------------------------------------------------------- */
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.error(`FAILED: ${failed.map((f) => f.name).join(", ")}`);
    process.exit(1);
  }
}

void main();