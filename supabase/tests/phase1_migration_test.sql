-- ============================================================================
-- phase1_migration_test.sql
-- Automated, idempotent verification of the MedBook AI hardening migrations
-- (0064-0071) against the LIVE database. Per docs/gemini-code-1791560016306.md.
--
-- Validates:
--   1. Every tenant table has RLS enabled.
--   2. Every tenant table has an active index leading on clinic_id.
--   3. Hardening objects present (T-LEAK-1 dropped, anon stripped, guards up,
--      composite FKs, storage buckets constrained).
--   4. Behavioural cross-tenant isolation using the DOCUMENTED Supabase pattern:
--        SET LOCAL ROLE authenticated
--        SELECT set_config('request.jwt.claims', json_build_object(...), true);
--
-- Safe on live data: the whole script runs in ONE transaction that ROLLs BACK.
-- Fixtures use fresh UUIDs against two DISCOVERED real clinics; nothing outside
-- the transaction is touched.
--
-- Run:  supabase db query --linked -f supabase/tests/phase1_migration_test.sql
--        (or paste into the Supabase SQL Editor)
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Section 1: catalog invariants (superuser session).
-- ---------------------------------------------------------------------------
do $$
declare
  v_bad text;
  t text;
begin
  -- 1. RLS enabled on every tenant table.
  select string_agg(c.relname, ', ') into v_bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname in (
      'patients','appointments','visits','prescriptions','vitals','patient_bills',
      'patient_bill_items','patient_payments','receipts','patient_documents',
      'medical_history','patient_medications','patient_alerts','patient_lab_results',
      'patient_intake_tokens','encounter_transcripts','copilot_audit_logs',
      'engagement_logs','whatsapp_conversations','whatsapp_messages','website_images',
      'websites','subscriptions','payment_submissions','billing_events','app_event_logs',
      'clinic_members','clinics'
    )
    and not c.relrowsecurity;
  if v_bad is not null then raise exception 'S1 FAIL: RLS off: %', v_bad; end if;

  -- 2. Active clinic_id-leading index on every tenant table with clinic_id.
  select string_agg(c.relname, ', ') into v_bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  join information_schema.columns k
    on k.table_schema='public' and k.table_name=c.relname and k.column_name='clinic_id'
  where n.nspname='public' and c.relkind='r'
    and not exists (
      select 1 from pg_index i
      where i.indrelid=c.oid and i.indisvalid
        and pg_get_indexdef(i.indexrelid) like '%(clinic_id%'
    );
  if v_bad is not null then raise exception 'S2 FAIL: clinic_id without leading index: %', v_bad; end if;

  -- 3. T-LEAK-1 gone.
  if exists (select 1 from pg_policies where tablename='clinics'
             and policyname='Clinic members can view all clinics') then
    raise exception 'S3 FAIL: T-LEAK-1 policy still present';
  end if;

  -- 4. anon holds no table write privileges.
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join (values('INSERT'),('UPDATE'),('DELETE')) v(p)
    where n.nspname='public' and c.relkind='r'
      and has_table_privilege('anon', c.oid, v.p)
  ) then raise exception 'S4 FAIL: anon still holds table write privileges'; end if;

  -- 5. Only the deliberate anon function grant may remain (resolve_website_domain).
  select string_agg(p.proname, ', ') into v_bad
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
    and p.proname <> 'resolve_website_domain'
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_bad is not null then raise exception 'S5 FAIL: anon-executable functions: %', v_bad; end if;

  -- 6. authenticated can still run the policy/trigger helpers.
  if not (select bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE'))
          from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname in
            ('is_clinic_member','is_clinic_admin','is_platform_admin')) then
    raise exception 'S6 FAIL: authenticated lost helper EXECUTE grants';
  end if;

  -- 7. Guard triggers present and not anon-executable (0071).
  if not (select bool_and(exists (select 1 from pg_trigger where tgname = g))
          from unnest(array['subscriptions_guard','payment_submissions_guard',
                             'clinic_members_guard']) g) then
    raise exception 'S7 FAIL: a guard trigger is missing';
  end if;
  foreach t in array array['subscriptions_guard','payment_submissions_guard',
                           'clinic_members_guard','prevent_clinic_id_change']
  loop
    if (select has_function_privilege('anon', patt.oid, 'EXECUTE')
        from pg_proc patt join pg_namespace n2 on n2.oid=patt.pronamespace
        where n2.nspname='public' and patt.proname=t) then
      raise exception 'S7 FAIL: anon can execute trigger function %', t;
    end if;
  end loop;

  -- 8. Composite tenant FKs from 0069 present.
  if not exists (select 1 from pg_constraint
                 where conrelid='public.website_images'::regclass
                   and contype='f' and conname='website_images_website_id_fkey') then
    raise exception 'S8 FAIL: composite FK website_images missing';
  end if;

  -- 9. Storage buckets configured with size + mime limits; payment-proofs exists.
  if not exists (select 1 from storage.buckets
                 where id='payment-proofs'
                   and file_size_limit is not null and allowed_mime_types is not null) then
    raise exception 'S9 FAIL: payment-proofs bucket unconfigured';
  end if;
  if exists (select 1 from storage.buckets
             where id in ('patient-documents','ai-ocr-documents','website-images',
                          'clinic-logos','reminder-header-images')
               and file_size_limit is null) then
    raise exception 'S9 FAIL: a bucket lacks a size limit';
  end if;

  raise notice 'S1-S9 catalog checks PASS';
end $$;

-- ---------------------------------------------------------------------------
-- Section 2: discovery + fixtures (superuser; rolled back when done).
--
-- Clinic A: has an admin/owner member AND a non-active subscription where
--           available (lets us prove the transition + amount-override guards).
-- Clinic B: any other clinic with an admin/owner member.
-- Values are published through custom GUCs so later role-switched DO blocks
-- can read them without temp-table ACL problems.
-- ---------------------------------------------------------------------------
do $$
declare
  v_ca uuid := null; v_ua uuid := null; v_sub uuid := null;
  v_price numeric := null; v_cur text := null;
  v_cb uuid := null; v_ub uuid := null;
  v_method uuid := null;
  v_web_b uuid;
  v_plan uuid := 'aaaaaaaa-0000-4000-8000-0000000000a3';
begin
  -- Clinic A: an admin/owner member with NO subscription yet — that lets the
  -- test create its own controlled subscription and verify the billing guards
  -- end-to-end (a clinic with an existing subscription can't take another,
  -- the subscriptions.clinic_id UNIQUE).
  select cm.clinic_id, cm.user_id into v_ca, v_ua
  from public.clinic_members cm
  where cm.role in ('owner','admin')
    and not exists (select 1 from public.subscriptions s where s.clinic_id = cm.clinic_id)
  order by random()
  limit 1;

  if v_ca is null then
    select cm.clinic_id, cm.user_id into v_ca, v_ua
    from public.clinic_members cm
    where cm.role in ('owner','admin')
    order by random()
    limit 1;
  end if;

  if v_ca is null then
    raise exception 'TEST SKIP: no clinic with an admin/owner member found';
  end if;

  select cm.clinic_id, cm.user_id into v_cb, v_ub
  from public.clinic_members cm
  where cm.role in ('owner','admin') and cm.clinic_id <> v_ca
  order by random() limit 1;

  -- A fresh active plan + a subscription fixture so the billing guards run.
  insert into public.subscription_plans (id, code, name, price) values
    (v_plan, 'phase1-plan', 'Phase1 Plan', 2500);
  select price, currency into v_price, v_cur from public.subscription_plans where id = v_plan;
  insert into public.subscriptions (id, clinic_id, plan_id, status) values
    ('aaaaaaaa-0000-4000-8000-0000000000a5', v_ca, v_plan, 'pending_payment')
  on conflict (id) do nothing;
  v_sub := 'aaaaaaaa-0000-4000-8000-0000000000a5';

  v_method := (select id from public.payment_methods where active order by sort_order limit 1);
  v_web_b  := (select id from public.websites where clinic_id = v_cb order by created_at desc limit 1);
  if v_web_b is null then
    v_web_b := 'bbbbbbbb-0000-4000-8000-000000000002';
    insert into public.websites (id, clinic_id, slug) values (v_web_b, v_cb, '_phase1_fixture_b');
  end if;

  -- Fixtures (all rolled back by the outer transaction).
  insert into public.patients (id, clinic_id, name) values
    ('aaaaaaaa-0000-4000-8000-000000000001', v_ca, '__phase1_marker_a'),
    ('bbbbbbbb-0000-4000-8000-000000000002', v_cb, '__phase1_marker_b');

  perform set_config('test.uid',   coalesce(v_ua::text,''), true);
  perform set_config('test.cbid',  coalesce(v_cb::text,'' ), true);
  perform set_config('test.ubid',  coalesce(v_ub::text,'' ), true);
  perform set_config('test.subid', coalesce(v_sub::text,''), true);
  perform set_config('test.price', coalesce(v_price::text,''), true);
  perform set_config('test.cur',   coalesce(v_cur,''   ), true);
  perform set_config('test.method',coalesce(v_method::text,''), true);
  perform set_config('test.webid_b', v_web_b::text, true);
  perform set_config('test.hassub', case when v_sub is null then 'no' else 'yes' end, true);
end $$;

-- ---------------------------------------------------------------------------
-- Section 3: impersonate user A (admin of clinic A).
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.uid', true), 'role', 'authenticated')::text,
  true);
set local role authenticated;

do $$
declare
  v_n integer;
  v_amount numeric;
  v_cur text;
  v_expected numeric := nullif(current_setting('test.price', true),'')::numeric;
  v_expected_cur text := current_setting('test.cur', true);
  v_sub uuid := nullif(current_setting('test.subid', true),'')::uuid;
  v_method uuid := nullif(current_setting('test.method', true),'')::uuid;
  v_webid uuid := current_setting('test.webid_b', true)::uuid;
  v_rows integer;
begin
  -- B1 positive: A sees its own marker patient.
  select count(*) into v_n from public.patients where name='__phase1_marker_a';
  if v_n <> 1 then raise exception 'B1 FAIL: own-clinic read returned % rows', v_n; end if;

  -- B2 negative: A must NOT see clinic B's rows.
  select count(*) into v_n from public.patients where name='__phase1_marker_b';
  if v_n <> 0 then raise exception 'B2 FAIL: cross-tenant patient read leaked %', v_n; end if;
  select count(*) into v_n from public.clinics where id = current_setting('test.cbid', true)::uuid;
  if v_n <> 0 then raise exception 'B2 FAIL: cross-tenant clinic read leaked'; end if;

  -- B3 negative: A cannot insert a patient into clinic B (RLS FORBIDDEN).
  begin
    insert into public.patients (clinic_id, name)
    values (current_setting('test.cbid', true)::uuid, '__phase1_injected');
    raise exception 'B3 FAIL: cross-tenant insert succeeded';
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;

  -- B4 positive (if a suitable subscription exists): pending -> payment_submitted works.
  if v_sub is not null then
    update public.subscriptions set status='payment_submitted' where id = v_sub;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'B4 FAIL: legitimate transition affected % rows', v_rows; end if;
  end if;

  -- B5 negative: self-activation (status=active) is rejected by the guard trigger.
  if v_sub is not null then
    begin
      update public.subscriptions set status = 'active' where id = v_sub;
      raise exception 'B5 FAIL: self-activation from client succeeded';
    exception when others then
      if sqlstate <> '42501' then raise; end if;
    end;
  end if;
  if v_sub is not null then raise notice 'B4-B5 subscription guards verified'; end if;

  -- B6 positive: tampered amount/currency are overwritten from the plan price.
  if v_sub is not null and v_method is not null and v_expected is not null then
    insert into public.payment_submissions
      (clinic_id, subscription_id, payment_method_id, amount, currency, sender_name, sender_phone, transaction_reference)
    values ((select clinic_id from public.subscriptions where id = v_sub),
            v_sub, v_method, 1, 'USD', 'Phase1 Sender', '03000000000', 'PHASE1-TXN');
    select amount, currency into v_amount, v_cur
    from public.payment_submissions where subscription_id = v_sub
    order by created_at desc limit 1;
    if v_amount <> v_expected or v_cur <> v_expected_cur then
      raise exception 'B6 FAIL: tampered amount %/currency % persisted (expected %/%)',
        v_amount, v_cur, v_expected, v_expected_cur;
    end if;
  end if;

  -- B7 negative: cannot log a billing event as another actor.
  if v_sub is not null then
    begin
      insert into public.billing_events (actor_user_id, subscription_id, event_type)
      values (current_setting('test.ubid', true)::uuid, v_sub, 'spoof');
      raise exception 'B7 FAIL: spoofed billing event accepted';
    exception when others then
      if sqlstate <> '42501' then raise; end if;
    end;
  end if;

  -- B8 negative: composite FK blocks a website_images row pointing at clinic B's website.
  begin
    insert into public.website_images (clinic_id, website_id, url)
    values ((select clinic_id from public.clinic_members where user_id=auth.uid() limit 1),
            v_webid, 'https://example.com/phase1-inject.jpg');
    raise exception 'B8 FAIL: cross-tenant website_images reference accepted';
  exception when others then
    if sqlstate not in ('42501','23503') then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Section 4: impersonate anon.
-- ---------------------------------------------------------------------------
set local role none;
select set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
set local role anon;

do $$
begin
  begin
    perform count(*) from public.patients;
    raise exception 'B9 FAIL: anon read patients';
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;
  begin
    perform public.start_consultation('aaaaaaaa-0000-4000-8000-0000000000c1',
                                       'aaaaaaaa-0000-4000-8000-000000000001');
    raise exception 'B10 FAIL: anon executed start_consultation';
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;
  raise notice 'B9-B10 anon checks PASS';
end $$;

set local role none;
select
  'PHASE1 OK' as result,
  current_setting('test.hassub', true) as subscription_flow_verified,
  case when current_setting('test.subid', true) <> '' then 'yes' else 'no' end as billing_guard_verified;
rollback;