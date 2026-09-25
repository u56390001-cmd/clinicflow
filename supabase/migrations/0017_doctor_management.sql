-- =============================================================================
-- MedBook AI — Phase 10 | Migration 0017
-- Doctor Management & Multi-Doctor Availability
--
-- DESIGN NOTES
-- ------------
-- * BACKWARD COMPATIBILITY IS THE CORE CONSTRAINT: every column added here is
--   nullable and every new behavior defaults to the exact Phase 1–9 semantics.
--   A clinic that never creates a `doctors` row continues to book through the
--   same clinic-wide availability rules and clinic-wide overlap checks as
--   before, unchanged.
-- * `doctors` generalizes the implicit "one doctor = the clinic owner" model.
--   `user_id` is nullable (a doctor may not have a login). `is_visible`
--   controls whether the AI widget / website / booking surfaces offer the
--   doctor for NEW bookings; invisible doctors keep their historical
--   appointments. Hard deletes are allowed only because appointments reference
--   doctors with ON DELETE SET NULL — history survives; unassigned rows fall
--   back to conservative clinic-wide overlap semantics.
-- * Same-clinic integrity is enforced IN THE DATABASE via composite FKs
--   `(clinic_id, doctor_id) -> doctors(clinic_id, id)` on availability_rules,
--   blocked_times, services and appointments — mirroring the Phase 3 pattern
--   for patients/services.
-- * OVERLAP SEMANTICS (the critical change):
--       - An appointment with doctor_id NULL ("unassigned") blocks EVERY
--         doctor — this keeps all pre-Phase-10 appointments and any code path
--         not yet passing a doctor behaving exactly as before.
--       - An appointment assigned to Dr X only conflicts with Dr X's bookings
--         or with unassigned bookings. Two different named doctors CAN be
--         booked at the same time; the same doctor CANNOT be double-booked.
-- * availability_rules: the old UNIQUE (clinic_id, day_of_week) is replaced by
--   TWO partial unique indexes:
--       - one clinic-default row per weekday (doctor_id IS NULL)
--       - one row per doctor per weekday (doctor_id IS NOT NULL)
--   Because PostgREST upsert cannot target a partial index
--   (`ON CONFLICT (cols) WHERE predicate`), weekly-hours saves go through the
--   new SECURITY INVOKER `upsert_availability_rules` RPC, which branches on
--   scope and uses the matching partial-index conflict target.
-- * RPC changes: `book_appointment` gains optional `p_doctor_id`;
--   overlap predicates implement the semantics above inside the existing
--   advisory-lock transaction. `reschedule_appointment` re-verifies against
--   the moving appointment's OWN doctor (doctor reassignment is out of scope).
-- * RLS: `doctors` follows the established pattern — read for any member,
--   write for owner/admin (`is_clinic_admin`). All other tables keep their
--   existing policies; no policy is loosened.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- table: doctors
-- ----------------------------------------------------------------------------
create table if not exists public.doctors (
  id               uuid           primary key default gen_random_uuid(),
  clinic_id        uuid           not null references public.clinics (id) on delete cascade,
  -- Nullable: a doctor does not need a login to exist in the roster.
  user_id          uuid           references auth.users (id) on delete set null,
  name             text           not null check (char_length(btrim(name)) between 1 and 120),
  specialty        text           check (specialty is null or char_length(btrim(specialty)) between 1 and 120),
  -- Simple string array of degrees/certifications, e.g. ["MBBS","FCPS"].
  credentials      jsonb          check (credentials is null or jsonb_typeof(credentials) = 'array'),
  photo_url        text           check (photo_url is null or char_length(btrim(photo_url)) between 1 and 2048),
  consultation_fee numeric(10, 2) check (consultation_fee is null or consultation_fee >= 0),
  -- false = kept in records but never offered for NEW bookings by any surface.
  is_visible       boolean        not null default true,
  created_at       timestamptz    not null default now(),
  updated_at       timestamptz    not null default now(),
  -- Composite FK target for the doctor-scoped columns below.
  constraint doctors_clinic_id_id_unique unique (clinic_id, id),
  -- A login can be linked to each doctor of a clinic at most once.
  constraint doctors_clinic_user_unique unique (clinic_id, user_id)
);

create index if not exists doctors_clinic_id_idx       on public.doctors (clinic_id);
create index if not exists doctors_clinic_visible_idx  on public.doctors (clinic_id, is_visible);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'doctors_set_updated_at') then
    create trigger doctors_set_updated_at
      before update on public.doctors
      for each row
      execute function public.handle_updated_at();
  end if;
end $$;

alter table public.doctors enable row level security;

drop policy if exists doctors_select_member on public.doctors;
create policy doctors_select_member
  on public.doctors
  for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists doctors_insert_admin on public.doctors;
create policy doctors_insert_admin
  on public.doctors
  for insert
  to authenticated
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists doctors_update_admin on public.doctors;
create policy doctors_update_admin
  on public.doctors
  for update
  to authenticated
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists doctors_delete_admin on public.doctors;
create policy doctors_delete_admin
  on public.doctors
  for delete
  to authenticated
  using (public.is_clinic_admin(clinic_id));

-- ----------------------------------------------------------------------------
-- availability_rules: nullable doctor scope + per-scope uniqueness
-- ----------------------------------------------------------------------------
alter table public.availability_rules add column if not exists doctor_id uuid;

do $$
begin
  alter table public.availability_rules
    add constraint availability_rules_clinic_doctor_fkey
    foreign key (clinic_id, doctor_id)
    references public.doctors (clinic_id, id)
    on delete cascade;
exception
  when duplicate_object then null;
end $$;

-- The old single-scope unique constraint is replaced by two partial indexes:
-- exactly one clinic-default row per weekday AND one row per doctor/weekday.
alter table public.availability_rules
  drop constraint if exists availability_rules_clinic_day_unique;

create unique index if not exists availability_rules_clinic_default_idx
  on public.availability_rules (clinic_id, day_of_week)
  where doctor_id is null;

create unique index if not exists availability_rules_doctor_day_idx
  on public.availability_rules (clinic_id, doctor_id, day_of_week)
  where doctor_id is not null;

create index if not exists availability_rules_clinic_doctor_idx
  on public.availability_rules (clinic_id, doctor_id);

-- ----------------------------------------------------------------------------
-- blocked_times: nullable doctor scope (a doctor's time off vs clinic closure)
-- ----------------------------------------------------------------------------
alter table public.blocked_times add column if not exists doctor_id uuid;

do $$
begin
  alter table public.blocked_times
    add constraint blocked_times_clinic_doctor_fkey
    foreign key (clinic_id, doctor_id)
    references public.doctors (clinic_id, id)
    on delete cascade;
exception
  when duplicate_object then null;
end $$;

create index if not exists blocked_times_clinic_doctor_idx
  on public.blocked_times (clinic_id, doctor_id);

-- ----------------------------------------------------------------------------
-- services: nullable doctor tie (NULL = any doctor can perform the service)
-- ----------------------------------------------------------------------------
alter table public.services add column if not exists doctor_id uuid;

do $$
begin
  alter table public.services
    add constraint services_clinic_doctor_fkey
    foreign key (clinic_id, doctor_id)
    references public.doctors (clinic_id, id)
    on delete cascade;
exception
  when duplicate_object then null;
end $$;

create index if not exists services_clinic_doctor_idx
  on public.services (clinic_id, doctor_id);

-- ----------------------------------------------------------------------------
-- appointments: record which doctor was booked (nullable/backfill-safe).
-- ON DELETE SET NULL: deleting a doctor keeps history; the orphaned row falls
-- back to the conservative unassigned-overlap semantics.
-- ----------------------------------------------------------------------------
alter table public.appointments add column if not exists doctor_id uuid;

do $$
begin
  alter table public.appointments
    add constraint appointments_clinic_doctor_fkey
    foreign key (clinic_id, doctor_id)
    references public.doctors (clinic_id, id)
    on delete set null;
exception
  when duplicate_object then null;
end $$;

create index if not exists appointments_clinic_doctor_idx
  on public.appointments (clinic_id, doctor_id);

-- ----------------------------------------------------------------------------
-- atomic booking RPCs — extended with the optional doctor dimension.
-- Overlap predicate (both functions):
--     p_doctor_id IS NULL            -> conflict with ANY appointment (legacy)
--     p_doctor_id = X                -> conflict only with X's appointments or
--                                       unassigned ones
-- The pre-Phase-10 book_appointment overloads (7/8 args, no doctor dimension)
-- are dropped explicitly: `create or replace` cannot replace across differing
-- signatures and would otherwise leave an ambiguous, unscoped overload behind.
-- ----------------------------------------------------------------------------

drop function if exists public.book_appointment(uuid, uuid, uuid, timestamptz, timestamptz, text, text);
drop function if exists public.book_appointment(uuid, uuid, uuid, timestamptz, timestamptz, text, text, public.appointment_status);
drop function if exists public.book_appointment(uuid, uuid, uuid, timestamptz, timestamptz, text, text, public.appointment_status, uuid);

create or replace function public.book_appointment(
  p_clinic_id       uuid,
  p_patient_id      uuid,
  p_service_id      uuid,
  p_start_time      timestamptz,
  p_end_time        timestamptz,
  p_booking_source  text,
  p_notes           text,
  p_status          public.appointment_status default 'pending'::public.appointment_status,
  p_doctor_id       uuid default null
) returns public.appointments
language plpgsql
volatile
security invoker
set search_path = public, auth
as $$
declare
  v_appt public.appointments;
begin
  if p_doctor_id is not null and not exists (
    select 1 from public.doctors d
    where d.clinic_id = p_clinic_id and d.id = p_doctor_id
  ) then
    raise exception using errcode = 'P0001', message = 'DOCTOR_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('medbook-appointment-' || p_clinic_id::text, 0));

  if exists (
    select 1
    from public.appointments a
    where a.clinic_id = p_clinic_id
      and a.status <> 'cancelled'::public.appointment_status
      and a.start_time < p_end_time
      and a.end_time > p_start_time
      and (
        p_doctor_id is null
        or a.doctor_id is null
        or a.doctor_id = p_doctor_id
      )
  ) then
    raise exception using errcode = 'P0001', message = 'SLOT_OVERLAP';
  end if;

  insert into public.appointments (
    clinic_id, patient_id, service_id, doctor_id,
    start_time, end_time, status, booking_source, notes
  ) values (
    p_clinic_id, p_patient_id, p_service_id, p_doctor_id,
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
  v_appt       public.appointments;
  v_doctor_id  uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('medbook-appointment-' || p_clinic_id::text, 0));

  select a.doctor_id into v_doctor_id
  from public.appointments a
  where a.id = p_appointment_id
    and a.clinic_id = p_clinic_id;

  if v_doctor_id is null and not exists (
    select 1 from public.appointments a
    where a.id = p_appointment_id and a.clinic_id = p_clinic_id
  ) then
    raise exception using errcode = 'P0001', message = 'APPOINTMENT_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.appointments a
    where a.clinic_id = p_clinic_id
      and a.id <> p_appointment_id
      and a.status <> 'cancelled'::public.appointment_status
      and a.start_time < p_new_end_time
      and a.end_time > p_new_start_time
      and (
        v_doctor_id is null
        or a.doctor_id is null
        or a.doctor_id = v_doctor_id
      )
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

-- ----------------------------------------------------------------------------
-- RPC: upsert 7 weekly rules for one scope (clinic-default or one doctor).
-- Replaces the supabase-js `.upsert(onConflict: "clinic_id,day_of_week")`
-- call, which can no longer target the partial unique indexes. SECURITY
-- INVOKER: RLS (owner/admin write policies) applies to every row written.
-- Payload: [{"dayOfWeek":0,"startTime":"09:00","endTime":"17:00","enabled":true}, ...]
-- ----------------------------------------------------------------------------
create or replace function public.upsert_availability_rules(
  p_clinic_id uuid,
  p_doctor_id uuid,
  p_rules     jsonb
) returns void
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  r         jsonb;
  v_day     smallint;
  v_enabled boolean;
  v_start   time;
  v_end     time;
begin
  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then
    raise exception using errcode = 'P0001', message = 'INVALID_RULES_PAYLOAD';
  end if;

  if p_doctor_id is not null and not exists (
    select 1 from public.doctors d
    where d.clinic_id = p_clinic_id and d.id = p_doctor_id
  ) then
    raise exception using errcode = 'P0001', message = 'DOCTOR_NOT_FOUND';
  end if;

  for r in select * from jsonb_array_elements(p_rules) loop
    v_day     := (r ->> 'dayOfWeek')::smallint;
    v_enabled := coalesce((r ->> 'enabled')::boolean, false);
    -- Disabled days may carry blank times in the payload; columns are NOT NULL.
    v_start   := case
                   when v_enabled and r ->> 'startTime' ~ '^\d{2}:\d{2}$'
                     then (r ->> 'startTime' || ':00')::time
                   else '09:00:00'::time
                 end;
    v_end     := case
                   when v_enabled and r ->> 'endTime' ~ '^\d{2}:\d{2}$'
                     then (r ->> 'endTime' || ':00')::time
                   else '17:00:00'::time
                 end;

    if p_doctor_id is null then
      insert into public.availability_rules
        (clinic_id, doctor_id, day_of_week, start_time, end_time, enabled)
      values
        (p_clinic_id, null, v_day, v_start, v_end, v_enabled)
      on conflict (clinic_id, day_of_week) where doctor_id is null
      do update set start_time = excluded.start_time,
                    end_time   = excluded.end_time,
                    enabled    = excluded.enabled;
    else
      insert into public.availability_rules
        (clinic_id, doctor_id, day_of_week, start_time, end_time, enabled)
      values
        (p_clinic_id, p_doctor_id, v_day, v_start, v_end, v_enabled)
      on conflict (clinic_id, doctor_id, day_of_week) where doctor_id is not null
      do update set start_time = excluded.start_time,
                    end_time   = excluded.end_time,
                    enabled    = excluded.enabled;
    end if;
  end loop;
end;
$$;

-- =============================================================================
-- VERIFICATION (manual + SQL harness; mirrors PHASE_10 checklist)
-- -----------------------------------------------------------------------------
-- 1. Existing clinics untouched: pre-existing availability_rules rows (doctor_id
--    NULL) satisfy availability_rules_clinic_default_idx; booking without a
--    doctor behaves exactly as before (overlap = ANY appointment).
-- 2. Doctor CRUD under RLS: staff role reads doctors but cannot insert/update/
--    delete (RLS); another clinic sees zero rows.
-- 3. Doctor-specific hours: save rules via upsert_availability_rules for a
--    doctor; getAvailability/book for that doctor uses THEIR hours; a doctor
--    with NO custom hours falls back to clinic defaults.
-- 4. Two different doctors CAN be booked in overlapping slots; the SAME doctor
--    gets SLOT_OVERLAP; an unassigned (doctor_id NULL) appointment blocks both.
-- 5. Cross-tenant FK rejection: an appointment/service/rule referencing another
--    clinic's doctor fails the composite FK.
-- =============================================================================
