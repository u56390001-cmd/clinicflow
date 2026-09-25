-- =============================================================================
-- MedBook AI — Phase 1 | Migration 0002
-- Row-Level Security: tenant isolation for clinics + clinic_members
--
-- THREAT MODEL
-- ------------
-- Every tenant-owned row is reachable only through the membership chain:
--
--     auth.uid() -> clinic_members.user_id -> clinic_members.clinic_id
--                -> resource.clinic_id
--
-- A user can read/write a clinic (and, in later phases, any record owned by
-- that clinic) IFF a `clinic_members` row links them to it. App-layer
-- filtering is NEVER a substitute for these policies.
--
-- IMPLEMENTATION NOTES
-- --------------------
-- * Helper predicates below are `SECURITY INVOKER` on purpose: subqueries
--   they issue are subject to the same RLS as the caller, so no policy can
--   be bypassed through a helper. This is what keeps `is_clinic_admin(...)`
--   referenced from a `clinic_members` policy NON-recursive: its subquery is
--   re-filtered by the self-only SELECT policy on `clinic_members`, which
--   never references itself.
-- * We deliberately do NOT use `SECURITY DEFINER` functions or the
--   service-role key for clinic bootstrap. RLS must prove every access.
-- * Clinic bootstrap: a freshly-signed-up user inserts a `clinics` row
--   (with `created_by = auth.uid()`, forced by policy), then inserts their
--   own `clinic_members` row with `role = 'owner'`. The INSERT policy on
--   `clinic_members` authorizes exactly that case — a user may join a clinic
--   they created, as owner, no other combination. Membership management
--   (inviting staff/admins) is a later phase and will extend this policy in
--   its own migration.
-- * We enable RLS but do NOT `FORCE ROW LEVEL SECURITY`: table ownership
--   remains with the `postgres` role (dashboard / migrations / service role),
--   and the app queries exclusively as `authenticated`, which is never the
--   table owner and therefore cannot bypass RLS. Forcing RLS would only
--   degrade the SQL-editor/dashboard experience without adding isolation.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- helper predicates
-- ----------------------------------------------------------------------------
create or replace function public.is_clinic_member(target_clinic_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.clinic_members cm
    where cm.clinic_id = target_clinic_id
      and cm.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_clinic_owner(target_clinic_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.clinic_members cm
    where cm.clinic_id = target_clinic_id
      and cm.user_id = (select auth.uid())
      and cm.role = 'owner'
  );
$$;

create or replace function public.is_clinic_admin(target_clinic_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.clinic_members cm
    where cm.clinic_id = target_clinic_id
      and cm.user_id = (select auth.uid())
      and cm.role in ('owner', 'admin')
  );
$$;

-- The user who created a clinic is its founder. This predicate authorizes the
-- first membership insert and lets the founder view/clean up an empty clinic
-- before their membership row exists.
create or replace function public.is_clinic_creator(target_clinic_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.clinics c
    where c.id = target_clinic_id
      and c.created_by = (select auth.uid())
  );
$$;

-- ----------------------------------------------------------------------------
-- enable RLS
-- ----------------------------------------------------------------------------
alter table public.clinics        enable row level security;
alter table public.clinic_members enable row level security;

-- ----------------------------------------------------------------------------
-- policies: clinics
-- ----------------------------------------------------------------------------

-- INSERT: any authenticated user may create a clinic, but only for themselves
-- (created_by is pinned to the caller). This is the tenancy bootstrap step.
-- NOTE: does not restrict how many clinics a user may create; abuse limits
-- are a later-phase concern (subscriptions/limits).
create policy clinics_insert_authenticated
  on public.clinics
  for insert
  to authenticated
  with check (created_by = (select auth.uid()));

-- SELECT: members (and the founder of an empty clinic) may read a clinic.
-- An outsider — even one who knows the UUID — sees zero rows.
create policy clinics_select_member
  on public.clinics
  for select
  to authenticated
  using (
    public.is_clinic_member(id)
    or public.is_clinic_creator(id)
  );

-- UPDATE: owner/admin of the clinic (or founder, for the empty bootstrap
-- clinic) may edit clinic details. Non-members cannot.
create policy clinics_update_admin
  on public.clinics
  for update
  to authenticated
  using (
    public.is_clinic_admin(id)
    or public.is_clinic_creator(id)
  )
  with check (
    public.is_clinic_admin(id)
    or public.is_clinic_creator(id)
  );

-- DELETE: only the owner (or founder) may delete a clinic. The founder case
-- doubles as the rollback path if the membership bootstrap insert fails.
create policy clinics_delete_owner
  on public.clinics
  for delete
  to authenticated
  using (
    public.is_clinic_owner(id)
    or public.is_clinic_creator(id)
  );

-- ----------------------------------------------------------------------------
-- policies: clinic_members
-- ----------------------------------------------------------------------------

-- SELECT: a user only ever sees their OWN membership rows. Combined with the
-- self-only helper predicates above, this is what makes every cross-table
-- policy lookup terminate and stay scoped to the calling user.
create policy clinic_members_select_self
  on public.clinic_members
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- INSERT: a user may add themselves to a clinic ONLY as the founder creating
-- their first (owner) membership. No other combination is permitted in Phase
-- 1; staff/admin invitations are added by a later, explicitly reviewed
-- migration. Outsiders cannot attach themselves to an existing clinic.
create policy clinic_members_insert_founder
  on public.clinic_members
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_clinic_creator(clinic_id)
    and role = 'owner'::public.clinic_role
  );

-- UPDATE: owner/admin may adjust membership rows in their own clinic. A
-- non-owner cannot escalate anyone to owner (guards against privilege
-- escalation through role changes).
create policy clinic_members_update_admin
  on public.clinic_members
  for update
  to authenticated
  using (public.is_clinic_admin(clinic_id))
  with check (
    public.is_clinic_admin(clinic_id)
    and (role <> 'owner'::public.clinic_role or public.is_clinic_owner(clinic_id))
  );

-- DELETE: owner/admin may remove members from their clinic.
create policy clinic_members_delete_admin
  on public.clinic_members
  for delete
  to authenticated
  using (public.is_clinic_admin(clinic_id));

-- =============================================================================
-- VERIFICATION (manual, documented in PHASE_1_NOTES.md)
-- -----------------------------------------------------------------------------
-- 1. Create users A and B; each creates their own clinic -> two clinics.
-- 2. As B, `select * from clinics` returns only B's clinic.
-- 3. As B, `select * from clinic_members` returns only B's membership.
-- 4. As B, `update clinics set name='pwned' where id = A's clinic id`
--    affects 0 rows.
-- 5. As B, `insert into clinic_members(clinic_id, user_id, role)
--    values (A's clinic id, B's user id, 'staff')` is rejected by RLS.
-- =============================================================================
