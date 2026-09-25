# MedBook AI — Phase 1 Notes

Phase 1 of 12: foundation, multi-tenant database, authentication, and clinic
onboarding. Everything here is complete and runnable — no stubs, no TODOs.

---

## What was built

### Database (`supabase/migrations/`)

- **`0001_clinics_clinic_members.sql`**
  - `clinics` — id, name, slug (unique, url-safe CHECK), doctor_name, timezone,
    phone, email, address, `created_by`, timestamps.
  - `clinic_members` — clinic_id / user_id FKs (both `on delete cascade`),
    role enum (`owner | admin | staff`), unique `(clinic_id, user_id)`.
  - Indexes on every FK column used by RLS (`clinic_members.user_id`,
    `clinic_members.clinic_id`, `clinics.created_by`) plus `slug` and
    `created_at`.
  - `handle_updated_at()` trigger maintaining `clinics.updated_at`.
- **`0002_rls_policies.sql`**
  - RLS enabled on both tables.
  - `SECURITY INVOKER` helper predicates (`is_clinic_member`, `is_clinic_owner`,
    `is_clinic_admin`, `is_clinic_creator`) so no helper can bypass RLS.
  - Policies follow `auth.uid() → clinic_members → clinic_id` for every
    tenant-owned table.

### Application

- **Auth (full flow)** — signup, email verification, login, logout, password
  reset (request + confirm). Server Actions + Zod validation + `@supabase/ssr`
  cookie sessions; `/auth/callback` route handles PKCE `code` and `token_hash`
  OTP exchanges (`type=email` / `type=recovery`).
- **Session middleware** — protects `/app/*` (redirects to `/login` with
  `?next=`), bounces authenticated users off `/login`, `/signup`, `/verify`,
  `/forgot-password`. `/reset-password` is intentionally excluded (recovery
  needs a session after the link exchange).
- **Clinic onboarding** — minimal single-form creation at `/app/clinic/new` →
  inserts `clinics` (with `created_by`) then `clinic_members` as `owner`, with a
  best-effort rollback of the clinic row if the membership insert fails.
  Dashboard empty state prompts users to create their first clinic.
- **UI** — shadcn-style primitives (`components/ui/`), the MedBook AI design
  tokens in `tailwind.config.ts`, responsive layouts, loading spinners, empty
  and error states, keyboard/focus support.

## Key assumptions & decisions

1. **No service-role key, no `SECURITY DEFINER`.** The clinic bootstrap is
   authorized purely through RLS policies. To make the *first* membership insert
   checkable without recursion, `clinics.created_by` was added and the
   `clinic_members` INSERT policy permits exactly one combination: the caller
   adding **themselves** as **owner** to a clinic they created. Staff/admin
   invitations are a later phase and will extend this policy in its own
   migration.
2. **RLS is enabled but not `FORCE ROW LEVEL SECURITY`.** Table ownership stays
   with `postgres` (dashboard, migrations). The app always queries as
   `authenticated`, which is never the table owner and cannot bypass RLS.
   Forcing RLS would only degrade the dashboard/SQL-editor experience.
3. **Reserved slugs are rejected at the app layer** (Zod) per the spec; the DB
   enforces only the format CHECK. The reserved list lives in
   `lib/constants.ts`.
4. **No duplicate `users` table.** Supabase's `auth.users` is the identity
   source; tenancy is expressed solely through `clinic_members`.
5. **`/verify` page shows the "check your inbox" interstitial.** After email
   confirmation the `/auth/callback` exchange redirects to `/app/dashboard`
   (the user is now signed in). The success state of `/verify?confirmed=1` is
   also rendered for direct visits.
6. **Recovery email enumeration.** `resetPasswordForEmail` never reveals whether
   an account exists; the forgot-password UI returns a neutral message.
7. **A user may create multiple clinics** in this phase. Per-user limits are a
   later-phase (subscription/billing) concern.

## RLS verification (run in the Supabase SQL editor, as `postgres`)

Creates nothing permanent; asserts tenant isolation directly at the database
layer — exactly what the app's queries go through.

```sql
-- 1. Two users
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token,
                        email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated',
   'doctor.a@example.com', crypt('password-a', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated',
   'doctor.b@example.com', crypt('password-b', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), '', '', '', '');

-- 2. Each creates their own clinic + owner membership (as their role)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', false);
insert into clinics (name, slug, created_by)
  values ('Clinic A', 'clinic-a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into clinic_members (clinic_id, user_id, role)
  values ((select id from clinics where slug='clinic-a'), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', false);
insert into clinics (name, slug, created_by)
  values ('Clinic B', 'clinic-b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into clinic_members (clinic_id, user_id, role)
  values ((select id from clinics where slug='clinic-b'), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner');
reset role;

-- 3. ISOLATION ASSERTIONS (all should hold; run as the `postgres` role)
set role authenticated;

-- 3a. User A sees only clinic A and only their own membership
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', false);
select count(*) as a_sees_clinics from clinics;                          -- expect 1
select count(*) as a_sees_memberships from clinic_members;               -- expect 1
select bool_and(name = 'Clinic A') as a_only_sees_a
  from clinics
  where id in (select clinic_id from clinic_members where user_id = auth.uid()); -- expect true

-- 3b. User A cannot read clinic B
select count(*) as a_cannot_read_b
  from clinics where id = (select id from clinics where slug = 'clinic-b'); -- expect 0

-- 3c. User A cannot modify clinic B
update clinics set name = 'pwned'
  where id = (select id from clinics where slug = 'clinic-b');   -- expect UPDATE 0
delete from clinics
  where id = (select id from clinics where slug = 'clinic-b');   -- expect DELETE 0

-- 3d. User A cannot attach themselves to clinic B
insert into clinic_members (clinic_id, user_id, role)
  values ((select id from clinics where slug = 'clinic-b'), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'staff');
-- expect RLS violation / 0 rows inserted

-- 3e. User B (non-owner) cannot add a membership to clinic A
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', false);
insert into clinic_members (clinic_id, user_id, role)
  values ((select id from clinics where slug = 'clinic-a'), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'staff');
-- expect RLS violation / 0 rows inserted

reset role;

-- Cleanup
delete from clinics where slug in ('clinic-a', 'clinic-b');
delete from auth.users where email in ('doctor.a@example.com', 'doctor.b@example.com');
```

> `set_config('request.jwt.claims', …)` simulates the JWT that PostgREST would
> attach for the user, so `auth.uid()` resolves to that user. `set role
> authenticated` reproduces the app's database role exactly.

## Left for later phases (explicitly out of scope)

- Clinic onboarding wizard (services, availability, AI config, website,
  publish) — Phase 2+
- Appointments / calendar / patients CRM / services
- AI booking receptionist (agent/Gemini), public booking widget
- No-code website builder + domain publishing
- Email notification templates beyond auth emails
- Stripe/billing/subscriptions
- Staff/admin invitation UX (the RLS policy exists but the UI is deferred)
- Generated TypeScript types (`supabase gen types`) — hand-written types are
  kept in sync with the migrations for now
