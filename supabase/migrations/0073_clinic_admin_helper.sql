-- =============================================================================
-- MedBook AI — Migration 0073 : treat `clinic_admin` as a clinic admin
--
-- Follow-up to 0072. Postgres will not let a function added/updated in the same
-- transaction reference an enum value that was added in that transaction, so
-- this helper update is a separate migration (its own transaction).
--
-- Backward compatible: `owner` and `admin` approvals are unchanged; this only
-- ADDS `clinic_admin` to the set the policies already gate on.
-- =============================================================================

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
      and cm.role in ('owner', 'admin', 'clinic_admin')
  );
$$;

notify pgrst, 'reload schema';

-- ROLLBACK
-- ----------------------------------------------------------------------------
-- create or replace function public.is_clinic_admin(target_clinic_id uuid)
-- returns boolean language sql stable security invoker set search_path = public, auth
-- as $$ select exists (select 1 from public.clinic_members cm
--   where cm.clinic_id = target_clinic_id and cm.user_id = (select auth.uid())
--   and cm.role in ('owner','admin')); $$;
-- =============================================================================
