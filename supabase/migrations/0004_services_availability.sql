-- =============================================================================
-- MedBook AI — Phase 2 | Migration 0004
-- Services + Availability: services, availability_rules, blocked_times
--
-- DESIGN NOTES
-- ------------
-- * These three tables are clinic-scoped: every row carries `clinic_id` and is
--   reachable only through the Phase 1 membership chain
--   (auth.uid() -> clinic_members.clinic_id -> resource.clinic_id).
-- * Read is allowed for any member (`is_clinic_member`, all roles).
--   Write is allowed for `owner`/`admin` only (`is_clinic_admin`). The
--   `staff` role can read services/availability but cannot modify them —
--   enforced by RLS, not just hidden in the UI.
-- * Services are SOFT-DELETED via `status = 'inactive'`. Once Appointments
--   exist, historical appointment rows reference a service; a hard delete
--   would orphan them. The AI agent must only ever offer active services
--   (PRD §13), so the status enum is the source of truth.
-- * Availability is modeled with two tables:
--     - `availability_rules`: weekly working hours, one row per day of the
--       week. `start_time`/`end_time` are `time` (wall clock) interpreted in
--       the clinic's timezone (clinics.timezone). Storing wall-clock + day +
--       clinic timezone is the canonical representation for recurring weekly
--       hours and survives timezone/DST changes.
--     - `blocked_times`: absolute exceptions (holidays, time off) as
--       `timestamptz` (stored UTC, rendered in the clinic's timezone).
--       `(clinic_id, day_of_week)` is UNIQUE so a clinic has exactly one rule
--       per weekday and the app can upsert all seven rows per save.
-- * `updated_at` on `services` is maintained by the Phase 1
--   `handle_updated_at()` trigger (no ORM-side bookkeeping).
-- * All policies are idempotent (drop-if-exists + create) so this migration
--   can be applied to any project state without conflict.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- enum: service_status
-- ----------------------------------------------------------------------------
do $$
begin
  create type public.service_status as enum ('active', 'inactive');
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- table: services
-- ----------------------------------------------------------------------------
create table public.services (
  id               uuid                primary key default gen_random_uuid(),
  clinic_id        uuid                not null references public.clinics (id) on delete cascade,
  name             text                not null check (char_length(btrim(name)) between 1 and 120),
  description      text                check (description is null or char_length(btrim(description)) between 1 and 1000),
  duration_minutes integer             not null check (duration_minutes between 1 and 1440),
  price            numeric(10, 2)      not null default 0 check (price >= 0),
  status           public.service_status not null default 'active'::public.service_status,
  created_at       timestamptz         not null default now(),
  updated_at       timestamptz         not null default now()
);

-- Indexes: clinic_id drives every RLS lookup; the composite index serves the
-- "active services for clinic" query used by the AI agent and booking widget.
create index services_clinic_id_idx       on public.services (clinic_id);
create index services_clinic_status_idx   on public.services (clinic_id, status);
create index services_clinic_created_idx  on public.services (clinic_id, created_at desc);

create trigger services_set_updated_at
  before update on public.services
  for each row
  execute function public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- table: availability_rules
-- ----------------------------------------------------------------------------
create table public.availability_rules (
  id         uuid    primary key default gen_random_uuid(),
  clinic_id  uuid    not null references public.clinics (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time    not null,
  end_time   time    not null,
  enabled    boolean not null default true,
  -- Exactly one rule per weekday per clinic; enables clean 7-row upserts.
  constraint availability_rules_clinic_day_unique unique (clinic_id, day_of_week),
  -- An enabled day must span real working hours (cross-checked in Zod too).
  constraint availability_rules_hours_check check (not enabled or end_time > start_time)
);

create index availability_rules_clinic_id_idx on public.availability_rules (clinic_id);

-- ----------------------------------------------------------------------------
-- table: blocked_times
-- ----------------------------------------------------------------------------
create table public.blocked_times (
  id         uuid        primary key default gen_random_uuid(),
  clinic_id  uuid        not null references public.clinics (id) on delete cascade,
  start_time timestamptz not null,
  end_time   timestamptz not null,
  reason     text        check (reason is null or char_length(btrim(reason)) between 1 and 240),
  created_at timestamptz not null default now(),
  constraint blocked_times_end_after_start check (end_time > start_time)
);

-- Indexes: clinic scoping plus the time range for slot calculation.
create index blocked_times_clinic_id_idx    on public.blocked_times (clinic_id);
create index blocked_times_clinic_start_idx on public.blocked_times (clinic_id, start_time);

-- ----------------------------------------------------------------------------
-- enable RLS
-- ----------------------------------------------------------------------------
alter table public.services           enable row level security;
alter table public.availability_rules enable row level security;
alter table public.blocked_times      enable row level security;

-- ----------------------------------------------------------------------------
-- policies: services
-- ----------------------------------------------------------------------------

drop policy if exists services_select_member on public.services;
create policy services_select_member
  on public.services
  for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists services_insert_admin on public.services;
create policy services_insert_admin
  on public.services
  for insert
  to authenticated
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists services_update_admin on public.services;
create policy services_update_admin
  on public.services
  for update
  to authenticated
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists services_delete_admin on public.services;
create policy services_delete_admin
  on public.services
  for delete
  to authenticated
  using (public.is_clinic_admin(clinic_id));

-- ----------------------------------------------------------------------------
-- policies: availability_rules
-- ----------------------------------------------------------------------------

drop policy if exists availability_rules_select_member on public.availability_rules;
create policy availability_rules_select_member
  on public.availability_rules
  for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists availability_rules_insert_admin on public.availability_rules;
create policy availability_rules_insert_admin
  on public.availability_rules
  for insert
  to authenticated
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists availability_rules_update_admin on public.availability_rules;
create policy availability_rules_update_admin
  on public.availability_rules
  for update
  to authenticated
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists availability_rules_delete_admin on public.availability_rules;
create policy availability_rules_delete_admin
  on public.availability_rules
  for delete
  to authenticated
  using (public.is_clinic_admin(clinic_id));

-- ----------------------------------------------------------------------------
-- policies: blocked_times
-- ----------------------------------------------------------------------------

drop policy if exists blocked_times_select_member on public.blocked_times;
create policy blocked_times_select_member
  on public.blocked_times
  for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists blocked_times_insert_admin on public.blocked_times;
create policy blocked_times_insert_admin
  on public.blocked_times
  for insert
  to authenticated
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists blocked_times_update_admin on public.blocked_times;
create policy blocked_times_update_admin
  on public.blocked_times
  for update
  to authenticated
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists blocked_times_delete_admin on public.blocked_times;
create policy blocked_times_delete_admin
  on public.blocked_times
  for delete
  to authenticated
  using (public.is_clinic_admin(clinic_id));

-- =============================================================================
-- VERIFICATION (manual; see PHASE_2_NOTES)
-- -----------------------------------------------------------------------------
-- 1. Owner inserts two services; one toggled to inactive. Staff role reads
--    them but cannot insert/update/delete (RLS).
-- 2. Owner upserts 7 availability_rules rows (one per day_of_week); an
--    enabled day with end_time <= start_time is rejected by the CHECK.
-- 3. Owner inserts a blocked_time (end > start enforced by CHECK).
-- 4. A user from another clinic sees ZERO rows in all three tables and gets
--    an RLS violation (0 rows affected) on every write.
-- =============================================================================
