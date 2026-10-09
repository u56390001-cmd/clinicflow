-- ============================================================================
-- 0064_rls_hardening_privileges.sql  (B2, B8, B23, T-LEAK-1)
-- Zero-trust multi-tenancy hardening — part 1 of 7.
--
-- Contents
--   1. Drop the leaky `clinics` SELECT policy that applied to PUBLIC
--      (`USING (true)`) — it let any anon caller read every clinic's row.
--   2. Revoke EXECUTE on every non-extension public function from PUBLIC/anon
--      and re-grant to authenticated + service_role (preserving the sole
--      deliberate anon grant on `resolve_website_domain`).
--   3. Normalize tenant policies from PUBLIC -> authenticated, keeping the
--      small deliberately-public allowlist (B8).
--   4. Revoke blanket table/sequence privileges from `anon` and re-grant only
--      the public catalogue reads the checkout/pricing pages need (B23).
--
-- Idempotent. Rollback: re-create the dropped policy and re-grant anon
-- privileges from 0010/0009/0060 if you ever need the pre-hardening state.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. T-LEAK-1: remove `USING (true)` clinic read (added in 0058).
--    Members are still covered by `clinics_select_member` (0003); public
--    booking still works through `Public users can select clinics by booking_slug`.
-- ---------------------------------------------------------------------------
drop policy if exists "Clinic members can view all clinics" on public.clinics;

-- ---------------------------------------------------------------------------
-- 2. B2: revoke EXECUTE from PUBLIC + anon on app functions.
--    Skip extension-owned functions (pg_trgm, pgcrypto, uuid-ossp, ...).
--
--    {@public} execute is Postgres' default for functions, which is exactly
--    what let `anon` call every RPC. We strip PUBLIC and anon, then re-grant
--    `authenticated` + `service_role` — without this, `authenticated` would
--    lose its (implicit) caller path too and every policy/trigger that calls
--    `is_clinic_member`/`is_clinic_admin`/`is_platform_admin` and every RPC
--    the app invokes would fail with permission denied. Then we restore the
--    single deliberate anon grant (public website-domain lookup).
-- ---------------------------------------------------------------------------
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- Sole deliberate anon grant (0059): resolve a verified, published website by
-- domain so a custom-domain site can bootstrap its public route as `anon`.
grant execute on function public.resolve_website_domain(text) to anon;

alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------------------
-- 3. B8: every PUBLIC-scoped tenant policy becomes authenticated-only.
--    Deliberately-public reads are kept for anon (pricing / marketing / booking).
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and roles = '{public}'
      and not (tablename = 'addons'             and policyname = 'Addons: public catalog read')
      and not (tablename = 'subscription_plans' and policyname = 'Plans: public read active')
      and not (tablename = 'payment_methods'    and policyname = 'Payment methods: public read active')
      and not (tablename = 'clinics'            and policyname = 'Public users can select clinics by booking_slug')
  loop
    execute format('alter policy %I on public.%I to authenticated', r.policyname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. B23: anon no longer inherits broad table privileges. RLS stays the gate
--    for authenticated; anon is limited to the public catalogue it must read.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

alter default privileges in schema public revoke select, insert, update, delete on tables from anon;
alter default privileges in schema public revoke usage, select on sequences from anon;

grant select on public.subscription_plans to anon;
grant select on public.payment_methods    to anon;
grant select on public.addons             to anon;

notify pgrst, 'reload schema';
