-- =============================================================================
-- MedBook AI — Migration 0072 : RBAC role extension + immutable audit logs
--
-- Spec: docs/gemini-code-1791568254354.md (Enterprise RBAC & Audit Engine).
-- (Named 0072 to follow this repo's 00NN convention; the spec's suggested
--  `20261011_rbac_and_audit_logs.sql` is equivalent.)
--
-- SAFETY
-- ------
-- * Backward compatible: existing `admin`/`staff` roles keep working. We only
--   ADD enum labels and ADD a column (with a safe default); nothing is dropped.
-- * The `is_clinic_admin()` helper is intentionally NOT changed here. Postgres
--   forbids USING a freshly-added enum value in the same transaction that adds
--   it, so the helper update lives in 0073 (its own transaction).
-- * Idempotent: every step is guarded, so re-running on a partially-applied DB
--   is a no-op.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend the clinic_role enum with the granular roles.
--    (The column is an enum, not a text CHECK — so we ADD VALUES rather than
--    swap a CHECK constraint.)
-- ----------------------------------------------------------------------------
do $$
declare
  v_role text;
begin
  foreach v_role in array array[
    'clinic_admin', 'doctor', 'receptionist', 'nurse', 'accountant'
  ] loop
    if not exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
        and t.typname = 'clinic_role'
        and e.enumlabel = v_role
    ) then
      execute format('alter type public.clinic_role add value %L', v_role);
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Per-member permission overrides (JSONB, default = use role defaults).
-- ----------------------------------------------------------------------------
alter table public.clinic_members
  add column if not exists permissions jsonb not null default '{}'::jsonb;

comment on column public.clinic_members.permissions is
  'Per-member RBAC overrides: { "<permission>": boolean }. Empty = role defaults (lib/auth/rbac-config.ts).';

-- ----------------------------------------------------------------------------
-- 3. Immutable healthcare audit log.
-- ----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id            uuid        primary key default gen_random_uuid(),
  clinic_id     uuid        not null references public.clinics (id) on delete cascade,
  user_id       uuid        not null references auth.users (id) on delete cascade,
  action        varchar(100) not null,
  resource_type varchar(50)  not null,
  resource_id   varchar(100),
  details       jsonb        not null default '{}'::jsonb,
  ip_address    varchar(45),
  created_at    timestamptz  not null default now()
);

create index if not exists idx_audit_logs_clinic_created
  on public.audit_logs (clinic_id, created_at desc);

create index if not exists idx_audit_logs_clinic_user
  on public.audit_logs (clinic_id, user_id);

-- ----------------------------------------------------------------------------
-- 4. RLS: admins read, members append as themselves, nobody edits.
-- ----------------------------------------------------------------------------
alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs_select_admins" on public.audit_logs;
create policy "audit_logs_select_admins"
  on public.audit_logs for select to authenticated
  using (public.is_clinic_admin(clinic_id));

drop policy if exists "audit_logs_insert_members" on public.audit_logs;
create policy "audit_logs_insert_members"
  on public.audit_logs for insert to authenticated
  with check (
    public.is_clinic_member(clinic_id)
    and user_id = (select auth.uid())
  );

-- No UPDATE/DELETE policy exists, so both are denied to authenticated.

-- ----------------------------------------------------------------------------
-- 5. Append-only enforcement even against a service-role UPDATE.
--    (DELETE is left possible for FK cascade / retention jobs.)
-- ----------------------------------------------------------------------------
create or replace function public.audit_logs_block_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only; UPDATE is not permitted';
end;
$$;

drop trigger if exists audit_logs_no_update on public.audit_logs;
create trigger audit_logs_no_update
  before update on public.audit_logs
  for each row
  execute function public.audit_logs_block_update();

-- ----------------------------------------------------------------------------
-- 6. Grant hygiene (mirror 0064/0071: no anon surface).
-- ----------------------------------------------------------------------------
revoke all on public.audit_logs from anon;
revoke all on public.audit_logs from public;
grant select, insert on public.audit_logs to authenticated;
revoke update, delete on public.audit_logs from authenticated;

notify pgrst, 'reload schema';

-- ROLLBACK
-- ----------------------------------------------------------------------------
-- drop trigger if exists audit_logs_no_update on public.audit_logs;
-- drop function if exists public.audit_logs_block_update();
-- drop table if exists public.audit_logs;
-- alter table public.clinic_members drop column if exists permissions;
-- (enum labels added above cannot be removed; that is safe and intended.)
-- =============================================================================
