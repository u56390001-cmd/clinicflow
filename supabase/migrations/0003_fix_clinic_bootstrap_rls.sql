-- =============================================================================
-- MedBook AI | Migration 0003
-- Fix clinic bootstrap RLS: the INSERT policy was missing/blocking on the
-- remote project, and the SELECT/member policies in 0002 were recursive.
--
-- WHAT WAS BROKEN
-- ---------------
-- 1. Clinic creation failed with
--      42501 "new row violates row-level security policy for table 'clinics'"
--    because no INSERT policy on `clinics` permitted the bootstrap insert.
--
-- 2. (Latent) `is_clinic_creator(id)` — used by `clinics_select_member`,
--    `clinics_update_admin`, `clinics_delete_owner` and
--    `clinic_members_insert_founder` — issues a subquery against `clinics`,
--    which is RLS-filtered by `clinics_select_member` again. That circular
--    dependency would raise
--      "infinite recursion detected in policy for relation \"clinics\""
--    (SQLSTATE 42P17) as soon as the policies were applied, breaking both the
--    membership bootstrap insert and any clinic read.
--
-- FIX
-- ----
-- * Recreated every policy idempotently (drop if exists + create) so this
--   migration repairs projects whether the 0002 policies are missing or
--   already present.
-- * `is_clinic_creator` is replaced in policy expressions with the direct,
--   non-recursive comparison `created_by = (select auth.uid())` on the
--   row being authorized. `clinic_members_insert_founder` checks the founder
--   fact with an explicit EXISTS subquery that, under RLS, terminates via
--   `clinics_select_member`'s now-recursion-free USING clause.
-- * No SECURITY DEFINER and no service-role key: RLS still proves every
--   access, preserving the project's "no elevated privileges" rule.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- helper predicates (kept: SECURITY INVOKER by design, see 0002).
-- `is_clinic_creator` is retained for API compatibility but is no longer
-- referenced by any policy, because it is inherently recursive on `clinics`.
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
-- ensure RLS is enabled (idempotent)
-- ----------------------------------------------------------------------------
alter table public.clinics        enable row level security;
alter table public.clinic_members enable row level security;

-- ----------------------------------------------------------------------------
-- policies: clinics (drop-if-exists + recreate)
-- ----------------------------------------------------------------------------

drop policy if exists clinics_insert_authenticated on public.clinics;
-- INSERT: any authenticated user may create a clinic, but only for themselves
-- (created_by is pinned to the caller). This is the tenancy bootstrap step.
create policy clinics_insert_authenticated
  on public.clinics
  for insert
  to authenticated
  with check (created_by = (select auth.uid()));

drop policy if exists clinics_select_member on public.clinics;
-- SELECT: members (and the founder of an empty clinic) may read a clinic.
-- `created_by = auth.uid()` replaces the self-recursive is_clinic_creator()
-- helper so this policy terminates.
create policy clinics_select_member
  on public.clinics
  for select
  to authenticated
  using (
    public.is_clinic_member(id)
    or created_by = (select auth.uid())
  );

drop policy if exists clinics_update_admin on public.clinics;
-- UPDATE: owner/admin of the clinic (or founder, for the empty bootstrap
-- clinic) may edit clinic details. Non-members cannot.
create policy clinics_update_admin
  on public.clinics
  for update
  to authenticated
  using (
    public.is_clinic_admin(id)
    or created_by = (select auth.uid())
  )
  with check (
    public.is_clinic_admin(id)
    or created_by = (select auth.uid())
  );

drop policy if exists clinics_delete_owner on public.clinics;
-- DELETE: only the owner (or founder) may delete a clinic. The founder case
-- doubles as the rollback path if the membership bootstrap insert fails.
create policy clinics_delete_owner
  on public.clinics
  for delete
  to authenticated
  using (
    public.is_clinic_owner(id)
    or created_by = (select auth.uid())
  );

-- ----------------------------------------------------------------------------
-- policies: clinic_members (drop-if-exists + recreate)
-- ----------------------------------------------------------------------------

drop policy if exists clinic_members_select_self on public.clinic_members;
-- SELECT: a user only ever sees their OWN membership rows.
create policy clinic_members_select_self
  on public.clinic_members
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists clinic_members_insert_founder on public.clinic_members;
-- INSERT: a user may add themselves to a clinic ONLY as the founder creating
-- their first (owner) membership. The founder check is a direct EXISTS against
-- `clinics.created_by` — under `clinics_select_member` (now recursion-free)
-- this terminates. No other combination is permitted in Phase 1.
create policy clinic_members_insert_founder
  on public.clinic_members
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and role = 'owner'::public.clinic_role
    and exists (
      select 1
      from public.clinics c
      where c.id = clinic_id
        and c.created_by = (select auth.uid())
    )
  );

drop policy if exists clinic_members_update_admin on public.clinic_members;
-- UPDATE: owner/admin may adjust membership rows in their own clinic. A
-- non-owner cannot escalate anyone to owner.
create policy clinic_members_update_admin
  on public.clinic_members
  for update
  to authenticated
  using (public.is_clinic_admin(clinic_id))
  with check (
    public.is_clinic_admin(clinic_id)
    and (role <> 'owner'::public.clinic_role or public.is_clinic_owner(clinic_id))
  );

drop policy if exists clinic_members_delete_admin on public.clinic_members;
-- DELETE: owner/admin may remove members from their clinic.
create policy clinic_members_delete_admin
  on public.clinic_members
  for delete
  to authenticated
  using (public.is_clinic_admin(clinic_id));
