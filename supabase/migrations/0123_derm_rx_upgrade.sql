-- =============================================================================
-- 0123 — Dermatology: prescription tab upgrade (follow-up, Rx presets,
--        custom lab-test registry)
-- =============================================================================
-- WHY
--   The prescriptions tab needs international dermatology EMR basics:
--   * a revisit/follow-up stamp on every Rx (printed on the sheet and shown
--     as a "revisit in X" tag on history cards);
--   * clinic-level prescription presets — the same 1-tap recipe idea as the
--     procedure tables (0122), but for medicine/lab/advice bundles, so a
--     clinic's standard regimens load in one click and doctors can save
--     their own drafts as reusable templates;
--   * a clinic-scoped registry of custom lab tests so the test search
--     dropdown learns new test names permanently instead of re-typing them.
--
-- WHAT
--   1. derm_prescriptions.follow_up        text — revisit label ("1 Week",
--      "SOS / As Needed", "Post-Biopsy 10 Days", …)
--   2. derm_rx_presets                     clinic-level Rx templates
--      (medicines + lab_orders jsonb + advice texts + follow_up)
--   3. derm_custom_lab_tests               clinic lab registry
--      (one row per test name, unique per clinic case-insensitively)
--
-- SAFETY
--   * Re-runnable (`if not exists`); existing Rx rows keep their values.
--   * RLS mirrors 0122: is_clinic_member reads and manages.
-- =============================================================================

alter table public.derm_prescriptions
  add column if not exists follow_up text;

create table if not exists public.derm_rx_presets (
  id                      uuid primary key default gen_random_uuid(),
  clinic_id               uuid not null references public.clinics (id) on delete cascade,
  name                    text not null,
  description             text,
  medicines               jsonb not null default '[]'::jsonb,
  lab_orders              jsonb not null default '[]'::jsonb,
  application_instructions text,
  skincare_routine_am     text,
  skincare_routine_pm     text,
  patient_education       text,
  follow_up               text,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists derm_rx_presets_clinic_idx
  on public.derm_rx_presets (clinic_id, created_at desc);

create or replace trigger derm_rx_presets_updated_at
  before update on public.derm_rx_presets
  for each row execute function public.handle_updated_at();

create table if not exists public.derm_custom_lab_tests (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics (id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Case-insensitive uniqueness per clinic, repeated saves are no-ops.
create unique index if not exists derm_custom_lab_tests_clinic_name_key
  on public.derm_custom_lab_tests (clinic_id, lower(name));

create index if not exists derm_custom_lab_tests_clinic_idx
  on public.derm_custom_lab_tests (clinic_id, created_at desc);

-- RLS (same posture as 0122 specialty presets).
alter table public.derm_rx_presets enable row level security;
alter table public.derm_custom_lab_tests enable row level security;

drop policy if exists derm_rx_presets_select on public.derm_rx_presets;
create policy derm_rx_presets_select on public.derm_rx_presets
  for select to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists derm_rx_presets_insert on public.derm_rx_presets;
create policy derm_rx_presets_insert on public.derm_rx_presets
  for insert to authenticated
  with check (public.is_clinic_member(clinic_id));

drop policy if exists derm_rx_presets_update on public.derm_rx_presets;
create policy derm_rx_presets_update on public.derm_rx_presets
  for update to authenticated
  using (public.is_clinic_member(clinic_id))
  with check (public.is_clinic_member(clinic_id));

drop policy if exists derm_rx_presets_delete on public.derm_rx_presets;
create policy derm_rx_presets_delete on public.derm_rx_presets
  for delete to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists derm_custom_lab_tests_select on public.derm_custom_lab_tests;
create policy derm_custom_lab_tests_select on public.derm_custom_lab_tests
  for select to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists derm_custom_lab_tests_insert on public.derm_custom_lab_tests;
create policy derm_custom_lab_tests_insert on public.derm_custom_lab_tests
  for insert to authenticated
  with check (public.is_clinic_member(clinic_id));

drop policy if exists derm_custom_lab_tests_delete on public.derm_custom_lab_tests;
create policy derm_custom_lab_tests_delete on public.derm_custom_lab_tests
  for delete to authenticated
  using (public.is_clinic_member(clinic_id));

notify pgrst, 'reload schema';

-- ROLLBACK
-- drop table if exists public.derm_rx_presets;
-- drop table if exists public.derm_custom_lab_tests;
-- alter table public.derm_prescriptions drop column if exists follow_up;
