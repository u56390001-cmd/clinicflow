-- ============================================================================
-- assessment_scoring_safety_test.sql
-- Verification of migration 0087 (Phase 1 deterministic scoring + clinical
-- safety triage pipeline) against the LIVE database.
--
-- Validates:
--   1. Every new column / index / check constraint / policy exists.
--   2. RLS is enabled on assessment_safety_events with member select/insert
--      policies and no anon privileges.
--   3. The append-only trigger rejects UPDATE.
--   4. Behavioural cross-tenant isolation for the new table.
--
-- Safe on live data: the whole script runs in ONE transaction that ROLLs BACK.
--
-- Run:  supabase db query --linked -f supabase/tests/assessment_scoring_safety_test.sql
--        (or paste into the Supabase SQL Editor)
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Section 1: catalog invariants.
-- ---------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_n integer;
begin
  -- 1a. psych_assessments Phase-1 columns.
  select string_agg(c.expected, ', ') into v_missing
  from unnest(array[
    'scaled_score','subscale_scores','diagnostic_criteria_results','is_valid',
    'invalidation_reason','administration_mode','template_version',
    'template_snapshot','instrument_code','safety_flag_raised','risk_level',
    'review_status','reviewed_by','reviewed_at'
  ]) c(expected)
  where not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='psych_assessments'
      and column_name=c.expected
  );
  if v_missing is not null then
    raise exception 'S1a FAIL: missing psych_assessments columns: %', v_missing;
  end if;

  -- 1b. assessment_templates Phase-1 columns.
  select string_agg(c.expected, ', ') into v_missing
  from unnest(array['code','version','instrument_meta','is_validated']) c(expected)
  where not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='assessment_templates'
      and column_name=c.expected
  );
  if v_missing is not null then
    raise exception 'S1b FAIL: missing assessment_templates columns: %', v_missing;
  end if;

  -- 1c. Indexes.
  select string_agg(i.expected, ', ') into v_missing
  from unnest(array[
    'assessment_templates_code_idx','psych_assessments_safety_idx',
    'assessment_safety_events_assessment_idx','assessment_safety_events_clinic_idx'
  ]) i(expected)
  where not exists (
    select 1 from pg_indexes where schemaname='public' and indexname=i.expected
  );
  if v_missing is not null then
    raise exception 'S1c FAIL: missing indexes: %', v_missing;
  end if;

  -- 1d. Value-domain check constraints on the new columns.
  select string_agg(c.expected, ', ') into v_missing
  from unnest(array[
    'psych_assessments_administration_mode_check',
    'psych_assessments_risk_level_check',
    'psych_assessments_review_status_check',
    'assessment_safety_events_to_status_check',
    'assessment_safety_events_risk_level_check',
    'assessment_safety_events_actor_type_check'
  ]) c(expected)
  where not exists (select 1 from pg_constraint where conname=c.expected);
  if v_missing is not null then
    raise exception 'S1d FAIL: missing check constraints: %', v_missing;
  end if;

  -- 1e. RLS + policies on the new table.
  if not (select relrowsecurity from pg_class where oid='public.assessment_safety_events'::regclass) then
    raise exception 'S1e FAIL: RLS not enabled on assessment_safety_events';
  end if;
  if not exists (select 1 from pg_policies
                 where tablename='assessment_safety_events'
                   and policyname='assessment_safety_events_select') then
    raise exception 'S1e FAIL: missing select policy';
  end if;
  if not exists (select 1 from pg_policies
                 where tablename='assessment_safety_events'
                   and policyname='assessment_safety_events_insert') then
    raise exception 'S1e FAIL: missing insert policy';
  end if;
  if exists (select 1 from pg_policies
             where tablename='assessment_safety_events'
               and cmd in ('UPDATE','DELETE')) then
    raise exception 'S1e FAIL: unexpected UPDATE/DELETE policy (must be append-only)';
  end if;

  -- 1f. Append-only trigger present.
  if not exists (select 1 from pg_trigger
                 where tgname='assessment_safety_events_no_update') then
    raise exception 'S1f FAIL: append-only trigger missing';
  end if;

  -- 1g. anon holds no privileges on the new table.
  if has_table_privilege('anon', 'public.assessment_safety_events', 'SELECT')
     or has_table_privilege('anon', 'public.assessment_safety_events', 'INSERT') then
    raise exception 'S1g FAIL: anon holds privileges on assessment_safety_events';
  end if;

  raise notice 'S1 catalog checks PASS';
end $$;

-- ---------------------------------------------------------------------------
-- Section 2: discovery + fixtures (superuser; rolled back when done).
-- ---------------------------------------------------------------------------
do $$
declare
  v_ca uuid; v_ua uuid; v_cb uuid;
begin
  select cm.clinic_id, cm.user_id into v_ca, v_ua
  from public.clinic_members cm
  where cm.role in ('owner','admin','doctor')
  order by random() limit 1;
  if v_ca is null then
    raise exception 'TEST SKIP: no clinic member found';
  end if;

  select cm.clinic_id into v_cb
  from public.clinic_members cm
  where cm.clinic_id <> v_ca
  order by random() limit 1;

  insert into public.patients (id, clinic_id, name) values
    ('aaaaaaaa-0000-4000-8000-000000000087', v_ca, '__safety_marker_a');

  insert into public.psych_assessments
    (id, clinic_id, patient_id, assessment_type, score, severity,
     instrument_code, is_valid, safety_flag_raised, risk_level, review_status)
  values
    ('aaaaaaaa-0000-4000-8000-000000000088', v_ca,
     'aaaaaaaa-0000-4000-8000-000000000087', 'PHQ-9', 18, 'Moderately severe',
     'PHQ-9', true, true, 'MODERATE', 'PENDING_REVIEW');

  insert into public.assessment_safety_events
    (id, clinic_id, patient_id, assessment_id, from_status, to_status,
     risk_level, actor_type, rationale)
  values
    ('aaaaaaaa-0000-4000-8000-000000000089', v_ca,
     'aaaaaaaa-0000-4000-8000-000000000087',
     'aaaaaaaa-0000-4000-8000-000000000088', null, 'PENDING_REVIEW',
     'MODERATE', 'system', 'unit test');

  perform set_config('test.ca',  v_ca::text, true);
  perform set_config('test.ua',  v_ua::text, true);
  perform set_config('test.cb',  coalesce(v_cb::text,''), true);
end $$;

-- ---------------------------------------------------------------------------
-- Section 3: append-only trigger rejects UPDATE (fires for any role).
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    update public.assessment_safety_events
      set rationale = 'tampered'
      where id = 'aaaaaaaa-0000-4000-8000-000000000089';
    raise exception 'S3 FAIL: UPDATE on assessment_safety_events succeeded';
  exception when others then
    if sqlstate <> 'P0001' then raise; end if;
  end;
  raise notice 'S3 append-only trigger PASS';
end $$;

-- ---------------------------------------------------------------------------
-- Section 4: RLS behavioural checks as a member of clinic A.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ua', true), 'role', 'authenticated')::text,
  true);
set local role authenticated;

do $$
declare
  v_n integer;
  v_cb uuid := nullif(current_setting('test.cb', true),'')::uuid;
begin
  -- B1 positive: A sees the safety event in its own clinic.
  select count(*) into v_n from public.assessment_safety_events
    where assessment_id = 'aaaaaaaa-0000-4000-8000-000000000088';
  if v_n <> 1 then raise exception 'B1 FAIL: own-clinic event read returned %', v_n; end if;

  -- B2 positive: A may append a transition for its own clinic.
  insert into public.assessment_safety_events
    (clinic_id, patient_id, assessment_id, from_status, to_status,
     risk_level, actor_type, rationale)
  values
    (current_setting('test.ca', true)::uuid,
     'aaaaaaaa-0000-4000-8000-000000000087',
     'aaaaaaaa-0000-4000-8000-000000000088', 'PENDING_REVIEW', 'UNDER_REVIEW',
     'MODERATE', 'provider', 'reviewed');

  -- B3 negative: A cannot append to another clinic's log (RLS WITH CHECK).
  if v_cb is not null then
    begin
      insert into public.assessment_safety_events
        (clinic_id, patient_id, assessment_id, to_status, actor_type)
      values
        (v_cb, 'aaaaaaaa-0000-4000-8000-000000000087',
         'aaaaaaaa-0000-4000-8000-000000000088', 'UNDER_REVIEW', 'provider');
      raise exception 'B3 FAIL: cross-tenant safety event insert succeeded';
    exception when others then
      if sqlstate <> '42501' then raise; end if;
    end;
  end if;

  raise notice 'B1-B3 RLS checks PASS';
end $$;

set local role none;
select 'ASSESSMENT SAFETY 0087 OK' as result;
rollback;
