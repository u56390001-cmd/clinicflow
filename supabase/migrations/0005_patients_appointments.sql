-- =============================================================================
-- MedBook AI — Phase 3 | Migration 0005
-- Patients + Appointments + atomic booking RPCs
--
-- DESIGN NOTES
-- ------------
-- * Both tables are clinic-scoped (every row carries `clinic_id`), reachable
--   only through the Phase 1 membership chain:
--       auth.uid() -> clinic_members.clinic_id -> resource.clinic_id
-- * ROLES: `staff` is READ/WRITE on patients and appointments — this is core
--   clinic-floor work. (Staff remains read-only on services/availability/
--   settings from Phase 2.) Owner/admin are full-access everywhere.
-- * Same-clinic integrity is enforced IN THE DATABASE via composite FKs:
--       appointments(clinic_id, patient_id) -> patients(clinic_id, id)
--       appointments(clinic_id, service_id) -> services(clinic_id, id)
--   An appointment can therefore never reference another clinic's patient or
--   service even if application code slips. Patient/service rows referenced by
--   an appointment are protected from deletion by the default NO ACTION FK
--   behavior (history must survive; services already soft-delete).
-- * `appointment_status` is an enum so status changes are audit-able and the
--   exact values stay stable across phases. `booking_source` is a plain TEXT
--   column (not an enum) so later phases (ai_agent, widget) add values without
--   a migration. This phase only ever writes 'dashboard'.
-- * Appointment times are `timestamptz` (stored UTC), displayed and validated
--   in the clinic's timezone (clinics.timezone). `end_time` is derived from
--   the service's duration_minutes at booking time and stored, so historical
--   records survive later duration edits.
-- * DOUBLE-BOOKING PROTECTION: the app-layer `checkSlotAvailability()` handles
--   overlap / working-hours / blocked-time checks and returns specific
--   messages. To close the TOCTOU race (two bookings submitted at once), the
--   actual INSERT and UPDATE happen inside SECURITY INVOKER RPCs that take a
--   per-clinic advisory xact lock and re-verify the overlap in the SAME
--   transaction as the write. SECURITY INVOKER means RLS still applies to
--   every table access inside the function — the RPC is not a backdoor.
-- * All objects are created idempotently (guarded create/enum/policy blocks),
--   so this migration is safe to run against any project state.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- enum: appointment_status
-- ----------------------------------------------------------------------------
do $$
begin
  create type public.appointment_status as enum ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- table: patients
-- ----------------------------------------------------------------------------
create table if not exists public.patients (
  id         uuid        primary key default gen_random_uuid(),
  clinic_id  uuid        not null references public.clinics (id) on delete cascade,
  name       text        not null check (char_length(btrim(name)) between 1 and 120),
  email      text        check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone      text        check (phone is null or char_length(btrim(phone)) between 3 and 32),
  notes      text        check (notes is null or char_length(btrim(notes)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- (clinic_id, id) unique so it can be a composite FK target for
  -- appointments (same-clinic guarantee).
  constraint patients_clinic_id_id_unique unique (clinic_id, id)
);

create index if not exists patients_clinic_id_idx   on public.patients (clinic_id);
create index if not exists patients_clinic_name_idx on public.patients (clinic_id, lower(name));

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'patients_set_updated_at') then
    create trigger patients_set_updated_at
      before update on public.patients
      for each row
      execute function public.handle_updated_at();
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- composite FK target on services (must exist BEFORE appointments references it)
-- ----------------------------------------------------------------------------
do $$
begin
  alter table public.services
    add constraint services_clinic_id_id_unique unique (clinic_id, id);
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- table: appointments
-- ----------------------------------------------------------------------------
create table if not exists public.appointments (
  id             uuid                      primary key default gen_random_uuid(),
  clinic_id      uuid                      not null references public.clinics (id) on delete cascade,
  patient_id     uuid                      not null,
  service_id     uuid                      not null,
  start_time     timestamptz               not null,
  end_time       timestamptz               not null,
  status         public.appointment_status not null default 'pending'::public.appointment_status,
  booking_source text                      not null default 'dashboard'
               check (char_length(btrim(booking_source)) between 1 and 32),
  notes          text                      check (notes is null or char_length(btrim(notes)) between 1 and 4000),
  created_at     timestamptz               not null default now(),
  updated_at     timestamptz               not null default now(),
  -- Same-clinic integrity: the referenced patient/service must belong to the
  -- same clinic as the appointment row itself.
  constraint appointments_clinic_patient_fkey
    foreign key (clinic_id, patient_id) references public.patients (clinic_id, id),
  constraint appointments_clinic_service_fkey
    foreign key (clinic_id, service_id) references public.services (clinic_id, id),
  constraint appointments_end_after_start check (end_time > start_time)
);

-- Indexes: clinic scoping, the (clinic_id, start_time) overlap query used by
-- the availability check, and status filtering on the calendar.
create index if not exists appointments_clinic_id_idx     on public.appointments (clinic_id);
create index if not exists appointments_clinic_start_idx  on public.appointments (clinic_id, start_time);
create index if not exists appointments_clinic_status_idx on public.appointments (clinic_id, status);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'appointments_set_updated_at') then
    create trigger appointments_set_updated_at
      before update on public.appointments
      for each row
      execute function public.handle_updated_at();
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- enable RLS
-- ----------------------------------------------------------------------------
alter table public.patients     enable row level security;
alter table public.appointments enable row level security;

-- ----------------------------------------------------------------------------
-- policies: patients (any member may read/write — clinic-floor work)
-- ----------------------------------------------------------------------------

drop policy if exists patients_select_member on public.patients;
create policy patients_select_member
  on public.patients
  for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists patients_insert_member on public.patients;
create policy patients_insert_member
  on public.patients
  for insert
  to authenticated
  with check (public.is_clinic_member(clinic_id));

drop policy if exists patients_update_member on public.patients;
create policy patients_update_member
  on public.patients
  for update
  to authenticated
  using (public.is_clinic_member(clinic_id))
  with check (public.is_clinic_member(clinic_id));

drop policy if exists patients_delete_member on public.patients;
create policy patients_delete_member
  on public.patients
  for delete
  to authenticated
  using (public.is_clinic_member(clinic_id));

-- ----------------------------------------------------------------------------
-- policies: appointments (any member may read/write)
-- ----------------------------------------------------------------------------

drop policy if exists appointments_select_member on public.appointments;
create policy appointments_select_member
  on public.appointments
  for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists appointments_insert_member on public.appointments;
create policy appointments_insert_member
  on public.appointments
  for insert
  to authenticated
  with check (public.is_clinic_member(clinic_id));

drop policy if exists appointments_update_member on public.appointments;
create policy appointments_update_member
  on public.appointments
  for update
  to authenticated
  using (public.is_clinic_member(clinic_id))
  with check (public.is_clinic_member(clinic_id));

drop policy if exists appointments_delete_member on public.appointments;
create policy appointments_delete_member
  on public.appointments
  for delete
  to authenticated
  using (public.is_clinic_member(clinic_id));

-- ----------------------------------------------------------------------------
-- atomic booking RPCs
-- ----------------------------------------------------------------------------
-- Both functions serialize per-clinic via `pg_advisory_xact_lock` and re-check
-- the overlap inside the same transaction as the write, so two simultaneous
-- submissions cannot both succeed. They are SECURITY INVOKER: RLS still gates
-- every table access, so a non-member can never insert/update via these.

create or replace function public.book_appointment(
  p_clinic_id       uuid,
  p_patient_id      uuid,
  p_service_id      uuid,
  p_start_time      timestamptz,
  p_end_time        timestamptz,
  p_booking_source  text,
  p_notes           text,
  p_status          public.appointment_status default 'pending'::public.appointment_status
) returns public.appointments
language plpgsql
volatile
security invoker
set search_path = public, auth
as $$
declare
  v_appt public.appointments;
begin
  perform pg_advisory_xact_lock(hashtextextended('medbook-appointment-' || p_clinic_id::text, 0));

  if exists (
    select 1
    from public.appointments a
    where a.clinic_id = p_clinic_id
      and a.status <> 'cancelled'::public.appointment_status
      and a.start_time < p_end_time
      and a.end_time > p_start_time
  ) then
    raise exception using errcode = 'P0001', message = 'SLOT_OVERLAP';
  end if;

  insert into public.appointments (
    clinic_id, patient_id, service_id,
    start_time, end_time, status, booking_source, notes
  ) values (
    p_clinic_id, p_patient_id, p_service_id,
    p_start_time, p_end_time, p_status, p_booking_source, p_notes
  )
  returning * into v_appt;

  return v_appt;
end;
$$;

create or replace function public.reschedule_appointment(
  p_appointment_id uuid,
  p_clinic_id      uuid,
  p_new_start_time timestamptz,
  p_new_end_time   timestamptz
) returns public.appointments
language plpgsql
volatile
security invoker
set search_path = public, auth
as $$
declare
  v_appt public.appointments;
begin
  perform pg_advisory_xact_lock(hashtextextended('medbook-appointment-' || p_clinic_id::text, 0));

  if exists (
    select 1
    from public.appointments a
    where a.clinic_id = p_clinic_id
      and a.id <> p_appointment_id
      and a.status <> 'cancelled'::public.appointment_status
      and a.start_time < p_new_end_time
      and a.end_time > p_new_start_time
  ) then
    raise exception using errcode = 'P0001', message = 'SLOT_OVERLAP';
  end if;

  update public.appointments a
  set start_time = p_new_start_time,
      end_time   = p_new_end_time
  where a.id = p_appointment_id
    and a.clinic_id = p_clinic_id
  returning * into v_appt;

  if v_appt is null then
    raise exception using errcode = 'P0001', message = 'APPOINTMENT_NOT_FOUND';
  end if;

  return v_appt;
end;
$$;

-- =============================================================================
-- VERIFICATION (manual; mirrors the Phase 3 checklist)
-- -----------------------------------------------------------------------------
-- 1. Owner/staff insert two patients; a user from another clinic sees zero.
-- 2. Owner creates an appointment via book_appointment().
-- 3. Double-book the same slot -> SLOT_OVERLAP. Outside working hours and
--    inside a blocked time are rejected by the app-layer check (working-hours
--    and blocked ranges are static data; overlap is the only race, handled
--    atomically here).
-- 4. Status updates (confirm/cancel/complete/no-show) are plain RLS-scoped
--    updates; reschedule goes through reschedule_appointment().
-- 5. Composite FKs reject an appointment whose patient/service belong to a
--    different clinic (FK violation at insert time).
-- =============================================================================
