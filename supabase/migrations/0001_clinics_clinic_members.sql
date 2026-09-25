-- =============================================================================
-- MedBook AI — Phase 1 | Migration 0001
-- Multi-tenant core schema: clinics + clinic_members
--
-- DESIGN NOTES
-- ------------
-- * Supabase's `auth.users` is the single source of truth for user identity.
--   We intentionally do NOT create a duplicate `users` table. Tenancy is
--   expressed purely through `clinic_members` join rows.
-- * `clinics.created_by` is a deliberate addition beyond the minimal column
--   list. It exists so the clinic bootstrap (create clinic -> insert owner
--   membership) can be enforced ENTIRELY through Row-Level Security, with no
--   `SECURITY DEFINER` function and no service-role key. The "creator owns the
--   empty clinic" fact gives RLS a non-recursive way to authorize the very
--   first `clinic_members` insert. See 0002 for the policies.
-- * `updated_at` is maintained by a trigger (no ORM-side bookkeeping).
-- * The slug CHECK enforces a url-safe, DNS-label-style format. Reserved-word
--   rejection (e.g. "admin", "api") is enforced at the application layer with
--   Zod so the rejection list can change without a migration.
-- =============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- enum: clinic_role
-- ----------------------------------------------------------------------------
-- `create type` has no IF NOT EXISTS in Postgres, so we guard with a DO block
-- to keep this migration re-runnable.
do $$
begin
  create type public.clinic_role as enum ('owner', 'admin', 'staff');
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- table: clinics
-- ----------------------------------------------------------------------------
create table public.clinics (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null check (char_length(btrim(name)) between 1 and 120),
  slug        text        not null unique
              check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,60}[a-z0-9])?$'),
  doctor_name text        check (doctor_name is null or char_length(btrim(doctor_name)) between 1 and 120),
  timezone    text        not null default 'UTC'
              check (char_length(timezone) between 1 and 64),
  phone       text        check (phone is null or char_length(btrim(phone)) between 3 and 32),
  email       text        check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  address     text        check (address is null or char_length(btrim(address)) between 1 and 240),
  created_by  uuid        not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Indexes: slug has a unique index via the UNIQUE constraint. Additional
-- indexes serve RLS policy lookups and ordering.
create index clinics_created_by_idx on public.clinics (created_by);
create index clinics_created_at_idx on public.clinics (created_at desc);

-- ----------------------------------------------------------------------------
-- table: clinic_members
-- ----------------------------------------------------------------------------
create table public.clinic_members (
  id         uuid           primary key default gen_random_uuid(),
  clinic_id  uuid           not null references public.clinics (id) on delete cascade,
  user_id    uuid           not null references auth.users (id) on delete cascade,
  role       public.clinic_role not null default 'staff',
  created_at timestamptz    not null default now(),
  -- A user appears at most once per clinic.
  constraint clinic_members_clinic_user_unique unique (clinic_id, user_id)
);

-- Indexes: both FK columns are used by RLS policies, so both get an index.
create index clinic_members_user_id_idx on public.clinic_members (user_id);
create index clinic_members_clinic_id_idx on public.clinic_members (clinic_id);

-- ----------------------------------------------------------------------------
-- trigger: updated_at maintenance
-- ----------------------------------------------------------------------------
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clinics_set_updated_at
  before update on public.clinics
  for each row
  execute function public.handle_updated_at();
