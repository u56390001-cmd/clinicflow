-- ============================================================================
-- ci_lint.sql — multi-tenancy invariants enforced in CI.
-- Fails (RAISE EXCEPTION) when a hardening guarantee regresses.
-- Run after every migration batch:
--   supabase db query --linked -f supabase/tests/ci_lint.sql   (or psql)
-- The runner stops on the first error.
-- ============================================================================

do $$
declare
  v_list text;
  v_tenant_tables text[] := array[
    'patients','appointments','visits','prescriptions','vitals','patient_bills',
    'patient_bill_items','patient_payments','receipts','patient_documents',
    'medical_history','patient_medications','patient_alerts','patient_lab_results',
    'patient_intake_tokens','encounter_transcripts','copilot_audit_logs',
    'engagement_logs','whatsapp_conversations','whatsapp_messages','website_images',
    'websites','subscriptions','payment_submissions','billing_events','app_event_logs'
  ];
  -- Catalog/reference tables whose broad read policies are intentional.
  v_catalog_tables text[] := array[
    'addons','subscription_plans','payment_methods'
  ];
begin
  -- -------------------------------------------------------------------------
  -- 1. Every tenant table must have RLS enabled.
  -- -------------------------------------------------------------------------
  select string_agg(c.relname, ', ') into v_list
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname = any (v_tenant_tables)
    and not c.relrowsecurity;
  if v_list is not null then
    raise exception 'CI1 FAIL: tenant tables without RLS: %', v_list;
  end if;

  -- -------------------------------------------------------------------------
  -- 2. No unconditional policy on a tenant table (T-LEAK-1 class).
  -- -------------------------------------------------------------------------
  select string_agg(format('%s.%s', tablename, policyname), ', ') into v_list
  from pg_policies
  where schemaname = 'public'
    and tablename = any (v_tenant_tables)
    and (coalesce(qual, '') in ('true', '(true)')
         or coalesce(with_check, '') in ('true', '(true)'));
  if v_list is not null then
    raise exception 'CI2 FAIL: unconditional tenant policies: %', v_list;
  end if;

  -- -------------------------------------------------------------------------
  -- 3. Every broad-read policy must belong to the catalog whitelist.
  -- -------------------------------------------------------------------------
  select string_agg(format('%s.%s', tablename, policyname), ', ') into v_list
  from pg_policies
  where schemaname = 'public'
    and tablename <> all (v_catalog_tables)
    and cmd = 'SELECT'
    and roles = '{public}'
    and coalesce(qual, '') in ('true', '(true)');
  if v_list is not null then
    raise exception 'CI3 FAIL: public/anon read on non-catalog tables: %', v_list;
  end if;

  -- -------------------------------------------------------------------------
  -- 4. `anon` must not hold INSERT/UPDATE/DELETE on any public table.
  -- -------------------------------------------------------------------------
  select string_agg(format('%s(%s)', c.relname, p.priv), ', ') into v_list
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
  where n.nspname = 'public' and c.relkind = 'r'
    and has_table_privilege('anon', c.oid, p.priv);
  if v_list is not null then
    raise exception 'CI4 FAIL: anon holds write privileges: %', v_list;
  end if;

  -- -------------------------------------------------------------------------
  -- 5. No public (non-extension) function is executable by `anon`.
  --    Allow-list: resolve_website_domain is the deliberate anon grant (0059);
  --    trigger functions (0071) are excluded by having no anon grant at all.
  -- -------------------------------------------------------------------------
  select string_agg(p.proname, ', ') into v_list
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not exists (
      select 1 from pg_depend d
      where d.objid = p.oid and d.deptype = 'e'
    )
    and p.proname <> 'resolve_website_domain'
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_list is not null then
    raise exception 'CI5 FAIL: anon-executable functions: %', v_list;
  end if;

  -- -------------------------------------------------------------------------
  -- 6. Every clinic_id table has the immutability trigger (migration 0069).
  -- -------------------------------------------------------------------------
  select string_agg(c.relname, ', ') into v_list
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join information_schema.columns k
    on k.table_schema = 'public' and k.table_name = c.relname and k.column_name = 'clinic_id'
  where n.nspname = 'public' and c.relkind = 'r'
    and not exists (
      select 1 from pg_trigger t
      where t.tgrelid = c.oid
        and not t.tgisinternal
        and t.tgname = c.relname || '_clinic_id_immutable'
    );
  if v_list is not null then
    raise exception 'CI6 FAIL: clinic_id tables without immutability trigger: %', v_list;
  end if;

  raise notice 'CI lint PASS';
end $$;
