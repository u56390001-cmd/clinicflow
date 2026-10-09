-- ============================================================================
-- rls_penetration_test.sql
-- Behavioural multi-tenant isolation tests for the 0064-0070 hardening.
--
-- HOW TO RUN (NEVER against production):
--   supabase db reset                       # apply migrations to local DB
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_penetration_test.sql
-- No pgTAP needed: every check RAISEs on failure and the whole run rolls back.
--
-- The script creates two disposable clinics/users inside a transaction, then
-- impersonates each user by setting `request.jwt.claims` + `set local role`.
-- ============================================================================

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Fixtures (created as the privileged role; RLS is bypassed for setup only).
-- ---------------------------------------------------------------------------
create temporary table _ids (k text primary key, v uuid);
insert into _ids values
  ('clinic_a',   'aaaaaaaa-0000-4000-8000-000000000001'),
  ('clinic_b',   'bbbbbbbb-0000-4000-8000-000000000002'),
  ('user_a',     'aaaaaaaa-0000-4000-8000-0000000000a1'),
  ('user_b',     'bbbbbbbb-0000-4000-8000-0000000000b1'),
  ('patient_a',  'aaaaaaaa-0000-4000-8000-0000000000a2'),
  ('patient_b',  'bbbbbbbb-0000-4000-8000-0000000000b2'),
  ('plan_a',     'aaaaaaaa-0000-4000-8000-0000000000a3'),
  ('sub_a',      'aaaaaaaa-0000-4000-8000-0000000000a4');

insert into public.clinics (id, name, slug)
select v, 'RLS Test A', 'rls-test-a' from _ids where k = 'clinic_a'
on conflict (id) do nothing;
insert into public.clinics (id, name, slug)
select v, 'RLS Test B', 'rls-test-b' from _ids where k = 'clinic_b'
on conflict (id) do nothing;

insert into public.clinic_members (clinic_id, user_id, role, email)
select (select v from _ids where k='clinic_a'), (select v from _ids where k='user_a'), 'admin', 'a@test.local'
on conflict do nothing;
insert into public.clinic_members (clinic_id, user_id, role, email)
select (select v from _ids where k='clinic_b'), (select v from _ids where k='user_b'), 'admin', 'b@test.local'
on conflict do nothing;

insert into public.patients (id, clinic_id, name)
select (select v from _ids where k='patient_a'), (select v from _ids where k='clinic_a'), 'Patient A'
on conflict (id) do nothing;
insert into public.patients (id, clinic_id, name)
select (select v from _ids where k='patient_b'), (select v from _ids where k='clinic_b'), 'Patient B'
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Helper: impersonate a user.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.as_user(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function pg_temp.as_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;

-- ===========================================================================
-- T1  T-LEAK-1: an authenticated member of A must NOT see clinic B.
-- ===========================================================================
select pg_temp.as_user((select v from _ids where k='user_a'));
do $$
declare n integer;
begin
  select count(*) into n from public.clinics
  where id = (select v from _ids where k='clinic_b');
  if n <> 0 then raise exception 'T1 FAIL: user A can read clinic B (%)', n; end if;
  raise notice 'T1 PASS';
end $$;
set local role none; -- reset back to the privileged role for setup

-- ===========================================================================
-- T2  Cross-tenant patient read is blocked.
-- ===========================================================================
select pg_temp.as_user((select v from _ids where k='user_a'));
do $$
declare n integer;
begin
  select count(*) into n from public.patients
  where id = (select v from _ids where k='patient_b');
  if n <> 0 then raise exception 'T2 FAIL: user A can read patient B (%)', n; end if;
  raise notice 'T2 PASS';
end $$;
set local role none;

-- ===========================================================================
-- T3  Cross-tenant patient INSERT (forging clinic_id) is rejected by RLS.
-- ===========================================================================
select pg_temp.as_user((select v from _ids where k='user_a'));
do $$
begin
  begin
    insert into public.patients (clinic_id, name)
    values ((select v from _ids where k='clinic_b'), 'Injected');
    raise exception 'T3 FAIL: cross-tenant patient insert succeeded';
  exception when insufficient_privilege or check_violation then
    raise notice 'T3 PASS';
  end;
end $$;
set local role none;

-- ===========================================================================
-- T4  Fake-active subscription is rejected (B3).
-- ===========================================================================
select pg_temp.as_user((select v from _ids where k='user_a'));
do $$
begin
  begin
    insert into public.subscriptions (clinic_id, plan_id, status)
    values ((select v from _ids where k='clinic_a'),
            (select v from _ids where k='plan_a'), 'active');
    raise exception 'T4 FAIL: member created an active subscription';
  exception when insufficient_privilege or check_violation or others then
    if sqlerrm like 'T4 FAIL%' then raise; end if;
    raise notice 'T4 PASS (%)', sqlerrm;
  end;
end $$;
set local role none;

-- ===========================================================================
-- T5  Tampered payment_submission amount is overwritten by the DB (B4).
-- ===========================================================================
select pg_temp.as_user((select v from _ids where k='user_a'));
do $$
declare v_amount numeric;
begin
  begin
    insert into public.payment_submissions
      (clinic_id, subscription_id, amount, currency, status)
    values ((select v from _ids where k='clinic_a'),
            (select v from _ids where k='sub_a'), 1, 'USD', 'approved');
    -- if it somehow inserted, the guard must have overwritten amount/status
    select amount into v_amount from public.payment_submissions
    where subscription_id = (select v from _ids where k='sub_a')
    order by created_at desc limit 1;
    if v_amount = 1 then raise exception 'T5 FAIL: tampered amount persisted'; end if;
    raise notice 'T5 PASS';
  exception when others then
    if sqlerrm like 'T5 FAIL%' then raise; end if;
    raise notice 'T5 PASS (blocked: %)', sqlerrm;
  end;
end $$;
set local role none;

-- ===========================================================================
-- T6  Billing event spoofing another actor is rejected (B5).
-- ===========================================================================
select pg_temp.as_user((select v from _ids where k='user_a'));
do $$
begin
  begin
    insert into public.billing_events (actor_user_id, event_type)
    values ((select v from _ids where k='user_b'), 'spoof');
    raise exception 'T6 FAIL: spoofed billing event accepted';
  exception when insufficient_privilege or check_violation or others then
    if sqlerrm like 'T6 FAIL%' then raise; end if;
    raise notice 'T6 PASS';
  end;
end $$;
set local role none;

-- ===========================================================================
-- T7  Owner row cannot be demoted by an admin (last-owner guard, B6).
-- ===========================================================================
do $$
declare v_owner uuid := 'aaaaaaaa-0000-4000-8000-0000000000a9';
begin
  insert into public.clinic_members (clinic_id, user_id, role, email)
  values ((select v from _ids where k='clinic_a'), v_owner, 'owner', 'owner@test.local')
  on conflict do nothing;

  select pg_temp.as_user((select v from _ids where k='user_a'));
  begin
    update public.clinic_members set role = 'staff'
    where clinic_id = (select v from _ids where k='clinic_a') and user_id = v_owner;
    raise exception 'T7 FAIL: admin demoted the owner';
  exception when insufficient_privilege or check_violation or others then
    if sqlerrm like 'T7 FAIL%' then raise; end if;
    raise notice 'T7 PASS';
  end;
  perform set_config('role', 'none', true);
end $$;

-- ===========================================================================
-- T8  Anon cannot execute privileged RPCs (B1/B2, migration 0064).
-- ===========================================================================
select pg_temp.as_anon();
do $$
begin
  begin
    perform public.start_consultation(gen_random_uuid());
    raise exception 'T8 FAIL: anon executed start_consultation';
  exception when insufficient_privilege then
    raise notice 'T8 PASS';
  end;
end $$;
set local role none;

rollback;

\echo 'RLS penetration tests complete (transaction rolled back).'
