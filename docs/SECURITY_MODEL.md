# Security Model

How MedBookAI keeps one clinic's patients, staff, billing and AI turns invisible
to every other clinic. Read this before touching RLS, roles, middleware, or
anything that bypasses RLS.

Defense in depth, outermost to innermost:

1. **Layer 1 — Next.js Edge Middleware & route protection** (this page's session gate).
2. **Layer 2 — Application-layer guards** (`tenant-guard.ts`, `service-scoped.ts`).
3. **Layer 3 — PostgreSQL** (RLS, composite foreign keys, security-definer functions).

A request must survive all three. A bug in any one layer is not enough to leak
across tenants, which is the whole point.

## 1. Tenancy primitive

A row belongs to a tenant through its `clinic_id`. Every security decision —
middleware redirect, guard check, RLS policy, trigger, and service-role query —
keys off that column, never off an inferred slug, email, or URL.

Three Postgres helpers are the source of truth (definer functions, authenticated
only; defined in `0014_security_hardening_phase9.sql`):

| Helper | Meaning |
|---|---|
| `is_clinic_member(clinic_id)` | caller has a `clinic_members` row for the clinic (any role) |
| `is_clinic_admin(clinic_id)` | caller's role is `owner`, `admin` or `clinic_admin` (migration `0073`) |
| `is_clinic_owner(clinic_id)` | caller's role is `owner` |
| `is_platform_admin([user_id])` | caller is a platform admin (`clinic_members`-independent) |

## 2. Layer 1 — Next.js Edge Middleware & route protection

`middleware.ts` runs on the Edge before any route handler or RSC:

- Refreshes the Supabase session cookie (via `@supabase/ssr`) so downstream
  `getUser()` calls see a live token.
- Redirects unauthenticated requests away from `/app/*` and authenticated
  requests away from `/login`, `/signup`.
- Does **not** decide tenant membership. It cannot: clinic membership lives in
  Postgres, and the Edge runtime must stay cheap and free of DB round trips.
  Tenant authorization is Layer 2's job.

## 3. Layer 2 — Application-layer guards

Two modules, both server-only (importing either from client code fails loudly).

### 3.1 `lib/auth/tenant-guard.ts` — who and which tenant

`requireClinicContext(requestedClinicId?, options?)` is the single gate every
Server Action, Route Handler and RSC should call before touching clinic data:

1. Resolves the caller via `supabase.auth.getUser()`; no session → throws
   `UnauthorizedError` (HTTP 401).
2. Resolves the clinic id from (in order) the argument, dynamic route params
   (`routeParams.clinicId`), or the `x-clinic-id` header.
3. Confirms the caller really belongs to that clinic (`clinic_members`), then
   returns a typed `TenantContext { userId, clinicId, role, permissions }`.
4. Any mismatch — missing clinic id, or not a member — throws `ForbiddenError`
   (HTTP 403, `"Access Denied: Tenant Isolation Boundary Violated"`).

```ts
import { requireClinicContext } from "@/lib/auth/tenant-guard";

export async function POST(request: Request, { params }: { params: { clinicId: string } }) {
  const { clinicId, userId, role } = await requireClinicContext(params.clinicId);
  // ... safe to query this clinic's data
}
```

`verifyTenantAccess()` is the lower-level primitive (returns raw claims too) and
`requirePlatformAdmin()` gates MediBook staff operations. `permissionsForRole()`
maps the DB role (`owner | admin | staff`) to a permission map so call sites
don't re-implement role logic. `trustClaims: true` is an optimistic fast path
that reads the JWT `app_metadata.clinic_roles` claim and touches **no** tenant
table; the default path re-checks `clinic_members` so a revoked membership takes
effect immediately.

### 3.2 `lib/supabase/service-scoped.ts` — the one allowed RLS bypass

Service-role keys bypass RLS, so the only safe shape is a client hard-bound to a
single clinic:

- `getScopedServiceClient(clinicId)` first runs `verifyTenantAccess(clinicId)`,
  then returns a bound client. Use when the caller's membership must be proven.
- `createScopedServiceClient(clinicId)` builds the bound client synchronously;
  it **throws before constructing anything** if `clinicId` is missing or not a
  UUID. Use after an explicit guard when the caller is already authorized.

Both return a `ScopedServiceClient` whose `scope(builder)` injects
`eq("clinic_id", clinicId)`, whose `stamp(row)` writes/validates the bound
`clinic_id` on inserts (rejecting a foreign id), and whose `belongs(id)` checks a
row. Never `import` these from client code; `service-scoped.ts` throws at module
load in the browser.

Do not reach for the raw `createServiceClient()` unless you understand why the
scoped API can't express it, and always add an explicit `clinic_id` filter.

### 3.3 `lib/auth/rbac-config.ts` + `lib/auth/role-guard.ts` — granular permissions & audit

`tenant-guard.ts` answers *who/which tenant*; `role-guard.ts` answers *may they do
this specific thing*, on top of it.

- `rbac-config.ts` is the single source of truth: `ExtendedRole` (identical to
  the DB `clinic_role` enum — `owner`, `clinic_admin`, `doctor`, `receptionist`,
  `nurse`, `accountant`, plus legacy `admin`/`staff`) maps to a default
  `Permission[]` (`patients:read`, `billing:write`, `settings:manage`, …).
- `hasPermission(role, overrides, permission)` is pure: `owner` is always true,
  a per-member `clinic_members.permissions` JSONB override wins when boolean,
  otherwise the role default applies.
- `requirePermission(clinicId, permission, options?)` = `requireClinicContext()`
  + the permission check; successful call returns the `TenantContext`, failure
  throws `ForbiddenError` (403) / `UnauthorizedError` (401).
- `logAuditEvent()` appends to the immutable `audit_logs` table.

The database side (`0072`/`0073`): the `clinic_role` enum gained the granular
labels, `clinic_members` gained `permissions jsonb default '{}'`,
`is_clinic_admin` now honours `clinic_admin`, and `audit_logs` is RLS-gated
(SELECT `is_clinic_admin`, INSERT `is_clinic_member AND user_id = auth.uid()`,
no UPDATE/DELETE policy) with a `BEFORE UPDATE` trigger so even the service role
cannot rewrite history. The sidebar narrows navigation by role, but that is
**cosmetic only** — `requirePermission()` (not nav visibility) is the boundary.

## 4. Layer 3 — PostgreSQL

1. **RLS policies** — the perimeter. Every tenant table is RLS on, every policy
   is written as a positive assertion (`USING`/`WITH CHECK` on membership), and
   every policy names `TO authenticated` (migration `0064`). No `USING (true)`
   policy survives on a tenant table; the only `{public}` broad-read policies
   are the catalog whitelist (`subscription_plans`, `payment_methods`, `addons`).
2. **Triggers** — invariants RLS cannot express, enforced server-side:
   - `subscriptions_guard` (0066): members may only *create* a
     `pending_payment` row and only *advance* status to `payment_submitted`;
     `plan_id`/periods are immutable to non-admins. No client-driven `active`.
   - `payment_submissions_guard` (0066): `amount`/`currency` are overwritten
     from the plan price; status/review columns forced to `pending`/NULL on
     insert. Slipping a discounted `amount` into the request changes nothing.
   - `clinic_members_guard` (0067): the last owner can never be removed or
     demoted; `user_id`/`clinic_id`/`email`/`created_at` are immutable.
   - `prevent_clinic_id_change()` (0069): `clinic_id` is immutable once a row
     exists — a tenant can't be silently re-homed into another.
3. **Composite tenant FKs** (0069): child rows reference `(clinic_id, id)` of
   their parent, so posting a valid id from another clinic is impossible
   (`website_images`, `whatsapp_*`, `patient_bills`, `medical_history`,
   `patient_*`, `encounter_transcripts`, `vitals`, `prescriptions`,
   `engagement_logs`, …).
4. **Grant hygiene** (0064, 0071): `anon` lost table/sequence privileges and
   `EXECUTE` on every non-extension function (default privileges included). The
   only anon surface left is what public checkout/widget pages need.
5. **RPC gates** (0065): `security definer` RPCs (`start_consultation`,
   `complete_and_advance`, `ensure_engagement_defaults`,
   `get_or_create_subscription`) re-check `is_clinic_member` inside the function
   body, `activate_subscription` re-checks `is_platform_admin`, and all keep
   `search_path=''`.
6. **Storage** (0070): buckets carry `file_size_limit` + `allowed_mime_types`;
   policies parse the first path segment with `storage_path_clinic_id()` (NULL
   on malformed → fail closed) and member-check through `is_clinic_member`.

## 5. Platform admin

Distinct from clinic admin. `activate_subscription`, cross-clinic support
operations and `requirePlatformAdmin()` / `is_platform_admin()` are the only
paths. Nothing in the clinic UI should ever reach them.

## 6. Known deliberate gaps (documented, not fixed)

- **B5 residual:** `billing_events` allows the clinic admin to append events for
  the subscription their clinic *administers* — a determined clinic admin can
  still write plausible event rows for their own clinic. Fully neutral event
  provenance needs a service-role writer (recommended follow-up).
- **B14:** 7 server action files still use the raw `createWidgetClient()`
  service-role factory (`lib/actions/{ai-settings,auth,inbox,patient-intake-actions,public-booking,team,whatsapp}.ts` and `lib/supabase/widget.ts`). All are server-side and were reviewed for explicit scoping; migrating them onto `service-scoped.ts` is the recommended follow-up.
- **B19:** realtime publications are empty (app polls). If realtime is enabled
  in future, tenant-filtered channels per clinic are required.
- **Secret tables** (`clinic_ai_secrets`, `clinic_whatsapp_secrets`,
  `clinic_integration_secrets`, `growth_agent_secrets`) hold plaintext API
  keys and are RLS-closed (deny all). They are readable only via service role;
  moving to Vault is a follow-up.

## 7. Verification

| Check | What it proves |
|---|---|
| `npx tsx scripts/rls-api-test.ts` | **App layer.** Mocks auth and asserts `requireClinicContext()` blocks cross-tenant with HTTP 403 (and, on the claim fast-path, with **zero** tenant queries), resolves the legitimate tenant, and that `createScopedServiceClient()` refuses a missing/invalid clinic id. Offline, no credentials. |
| `npx tsx scripts/rbac-test.ts` | **RBAC + audit.** Role→permission defaults, per-member override precedence, `requirePermission()` 403/401 outcomes, and single-row `logAuditEvent` writes. Offline, no credentials. |
| `supabase/tests/phase1_migration_test.sql` | **Database layer, behavioural.** Role/JWT impersonation (`SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims')`) proving cross-tenant reads return 0 rows, cross-tenant inserts fail, and billing guards overwrite tampered amounts. Runs against live, inside a rolled-back transaction. |
| `supabase/tests/ci_lint.sql` | **Database layer, schema invariants.** RLS on, no unconditional tenant policies, anon has no write/execute, immutability triggers present. Run in CI after any migration batch. |
| `supabase/tests/rls_penetration_test.sql` | Local-DB variant of the behavioural suite (role simulation). |

## 8. Incident response & audit checklist

Run before every production deploy, and after any change to RLS, roles,
middleware, guards, or a service-role call site.

**Pre-deploy gate**

- [ ] `npx tsc --noEmit` clean and `npx eslint` clean on changed files.
- [ ] `npx tsx scripts/rls-api-test.ts` → all checks `[PASS]`, exit 0.
- [ ] `npx tsx scripts/rbac-test.ts` → all checks `[PASS]`, exit 0.
- [ ] `supabase/tests/ci_lint.sql` → exit 0 (no `RAISE EXCEPTION`).
- [ ] `supabase/tests/phase1_migration_test.sql` → `PHASE1 OK`, exit 0.
- [ ] New table added? RLS enabled **and** a `TO authenticated` membership
  policy written **and** an index on `clinic_id`. Composite FK if it is a child
  of a tenant table.
- [ ] New function added? `search_path=''`, membership re-checked in the body,
  and `EXECUTE` revoked from `anon` (default privileges included).
- [ ] New `service-role` call site? Goes through `service-scoped.ts`, never a
  raw client with a client-supplied `clinic_id`.

**Zero-leak evidence (capture on a release candidate)**

- [ ] Cross-tenant read returns **0 rows** for every tenant table.
- [ ] Cross-tenant `INSERT`/`UPDATE`/`DELETE` returns a permission error.
- [ ] `anon` can read only the public catalog + public checkout/widget surface.
- [ ] No `{public}` policy with a `true` predicate on a tenant table.
- [ ] Supabase security & performance advisors reviewed; new warnings triaged.

**If a leak is suspected**

1. Reproduce with `scripts/rls-api-test.ts` (app) and
   `phase1_migration_test.sql` (DB) to localize the failing layer.
2. Identify the outermost layer that failed: middleware, guard, or RLS.
3. Patch at that layer and add a regression assertion to the matching suite —
   never "fix" it by relaxing a lower layer.
4. Rotate any key or token exposed during the incident; treat secret tables as
   compromised until proven otherwise.
5. Record the finding and its disposition in `AUDIT_LOG.md`.
