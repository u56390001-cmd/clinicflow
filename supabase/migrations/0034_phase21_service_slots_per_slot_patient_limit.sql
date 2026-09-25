-- =============================================================================
-- MedBook AI — Phase 21 | Migration 0034
-- Per-Slot Patient Limit + Service Slot Templates + Enriched Services
--
-- DESIGN NOTES
-- ------------
-- * Phase 20 stored ONE global `max_patients_per_window` per doctor. Phase 21
--   refines this to a PER-SLOT capacity: each generated/custom slot row carries
--   its own optional `patient_limit`. This is an extension, not a replacement:
--   - `doctor_slot_templates.patient_limit` — when set, overrides the doctor's
--     global `max_patients_per_window` for that window.
--   - Existing shared-window doctors are migrated: each of their slot rows gets
--     `patient_limit = doctors.max_patients_per_window` so nothing breaks.
--   - A NULL `patient_limit` keeps today's behavior (global cap, default 1).
--
-- * Services get the same slot-storage approach they need for the new
--   "Add New Service" modal. Rather than misusing `doctor_slot_templates`, a
--   parallel `service_slot_templates` table mirrors it 1:1 (same columns,
--   composite clinic-scoped FK, same RLS posture). Capacity for a shared-window
--   service is resolved from its OWN slot rows (per `patient_limit`); no
--   doctor is required (e.g. a lab test performed by any technician).
--
-- * `services` gains the Phase 21 fields: flexible duration/report-time text,
--   category extended from 2 to 5 values, follow-up fee + validity (same shape
--   as `doctors`), preparation instructions, and `consultation_mode`
--   (`single_slot` default, matching `doctors`). All additive with
--   legacy-preserving defaults — existing rows are unchanged.
--
-- * Capacity semantics in the atomic RPCs are now timezone-aware and slot-
--   aware. `patient_limit` for whichever parent owns the window is resolved
--   from the slot row whose weekday + [start, end) window contains the booking
--   start (clinic-local). Fallback order stays intact:
--     slot patient_limit -> doctor global cap (doctors only) -> 1.
--
-- * RLS: `service_slot_templates` follows the established pattern — read for
--   any clinic member, write for owner/admin. Services remain soft-deleted so
--   `service_slot_templates` cascades on service delete only via the composite
--   FK (like doctors), never through a hard delete.
-- * All statements are idempotent.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- doctor_slot_templates: per-slot patient limit
-- ----------------------------------------------------------------------------
alter table public.doctor_slot_templates
  add column if not exists patient_limit int
    check (patient_limit is null or (patient_limit >= 1 and patient_limit <= 50));

-- Migrate existing shared-window doctors: carry the global cap down to each of
-- their slot rows as the per-slot default. Single-slot doctors stay NULL.
update public.doctor_slot_templates t
set patient_limit = d.max_patients_per_window
from public.doctors d
where t.clinic_id = d.clinic_id
  and t.doctor_id = d.id
  and t.patient_limit is null
  and d.consultation_mode = 'shared_window';

-- ----------------------------------------------------------------------------
-- services: Phase 21 fields (all additive; legacy rows unaffected)
-- ----------------------------------------------------------------------------
alter table public.services
  add column if not exists duration_or_report_time text
    check (duration_or_report_time is null or char_length(btrim(duration_or_report_time)) between 1 and 120),
  add column if not exists follow_up_fee numeric(10, 2)
    check (follow_up_fee is null or follow_up_fee >= 0),
  add column if not exists follow_up_valid_for int
    check (follow_up_valid_for is null or (follow_up_valid_for >= 1 and follow_up_valid_for <= 730)),
  add column if not exists follow_up_period text
    check (follow_up_period is null or follow_up_period in ('days', 'weeks', 'months')),
  add column if not exists preparation_instructions text
    check (preparation_instructions is null or char_length(btrim(preparation_instructions)) between 1 and 1000),
  add column if not exists consultation_mode text
    not null default 'single_slot'
    check (consultation_mode in ('single_slot', 'shared_window'));

-- category: extend from ('consultation','service') to five values. The
-- Appointments Consultations|Services toggle maps 'consultation' -> the
-- Consultations tab and every other value -> Services.
alter table public.services drop constraint if exists services_category_check;
alter table public.services
  add constraint services_category_check
  check (category in ('consultation', 'service', 'diagnostic', 'lab_test', 'procedure'));

-- Composite-FK backstop for service_slot_templates (mirrors the automatic
-- `doctors_clinic_id_id_unique` used by doctor_slot_templates).
create unique index if not exists services_clinic_id_id_key
  on public.services (clinic_id, id);

-- ----------------------------------------------------------------------------
-- table: service_slot_templates (named, discrete slots; day-scoped)
-- ----------------------------------------------------------------------------
create table if not exists public.service_slot_templates (
  id           uuid        primary key default gen_random_uuid(),
  clinic_id    uuid        not null references public.clinics (id) on delete cascade,
  service_id   uuid        not null,
  day_of_week  smallint    not null check (day_of_week between 0 and 6),
  slot_name    text        not null check (char_length(btrim(slot_name)) between 1 and 120),
  start_time   time        not null,
  end_time     time        not null check (end_time > start_time),
  -- Per-slot capacity for shared-window services. NULL -> single patient per
  -- slot regardless of consultation_mode (same rule as doctors).
  patient_limit int        check (patient_limit is null or (patient_limit >= 1 and patient_limit <= 50)),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Same-clinic integrity (mirrors doctor_slot_templates pattern).
  constraint service_slot_templates_clinic_service_fkey
    foreign key (clinic_id, service_id) references public.services (clinic_id, id)
    on delete cascade,
  -- One named slot per service/day at a given start time.
  constraint service_slot_templates_service_day_start_unique
    unique (clinic_id, service_id, day_of_week, start_time)
);

create index if not exists service_slot_templates_clinic_service_idx
  on public.service_slot_templates (clinic_id, service_id, day_of_week);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'service_slot_templates_set_updated_at') then
    create trigger service_slot_templates_set_updated_at
      before update on public.service_slot_templates
      for each row
      execute function public.handle_updated_at();
  end if;
end $$;

alter table public.service_slot_templates enable row level security;

drop policy if exists service_slot_templates_select_member on public.service_slot_templates;
create policy service_slot_templates_select_member
  on public.service_slot_templates
  for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists service_slot_templates_insert_admin on public.service_slot_templates;
create policy service_slot_templates_insert_admin
  on public.service_slot_templates
  for insert
  to authenticated
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists service_slot_templates_update_admin on public.service_slot_templates;
create policy service_slot_templates_update_admin
  on public.service_slot_templates
  for update
  to authenticated
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists service_slot_templates_delete_admin on public.service_slot_templates;
create policy service_slot_templates_delete_admin
  on public.service_slot_templates
  for delete
  to authenticated
  using (public.is_clinic_admin(clinic_id));

-- ----------------------------------------------------------------------------
-- book_appointment: timezone-aware, per-slot capacity resolution.
-- Shared-window capacity now comes from the owning slot's `patient_limit`
-- (doctor slots or service slots), falling back to the doctor's global cap
-- and finally to 1. Service-driven shared windows (booked without a doctor,
-- e.g. lab tests) aggregate same-service, same-anchor appointments; every
-- other overlap still blocks.
-- ----------------------------------------------------------------------------
create or replace function public.book_appointment(
  p_clinic_id          uuid,
  p_patient_id         uuid,
  p_service_id         uuid,
  p_start_time         timestamptz,
  p_end_time           timestamptz,
  p_booking_source     text,
  p_notes              text,
  p_status             public.appointment_status default 'pending'::public.appointment_status,
  p_doctor_id          uuid default null,
  p_consultation_type  public.consultation_type default 'in_clinic'::public.consultation_type
) returns public.appointments
language plpgsql
volatile
security invoker
set search_path = public, auth
as $$
declare
  v_appt        public.appointments;
  v_mode        text;
  v_capacity    int;
  v_used        int;
  v_slot_cap    int;
  v_tz          text;
  v_local       timestamp;
  v_dow         int;
  v_local_time  time;
begin
  -- Clinic-local interpretation of the booking start (slot matching needs the
  -- booking's weekday + wall-clock time).
  select timezone into v_tz
  from public.clinics
  where id = p_clinic_id;
  v_local := p_start_time at time zone coalesce(v_tz, 'UTC');
  v_dow := extract(isodow from v_local)::int - 1;      -- 0 = Monday ... 6 = Sunday
  v_local_time := v_local::time;

  if p_doctor_id is not null then
    select d.consultation_mode, d.max_patients_per_window
    into v_mode, v_capacity
    from public.doctors d
    where d.clinic_id = p_clinic_id and d.id = p_doctor_id;

    if v_mode is null then
      raise exception using errcode = 'P0001', message = 'DOCTOR_NOT_FOUND';
    end if;

    -- Per-slot refinement: the slot containing the booking start overrides the
    -- doctor's global cap.
    if v_mode = 'shared_window' then
      select t.patient_limit into v_slot_cap
      from public.doctor_slot_templates t
      where t.clinic_id = p_clinic_id
        and t.doctor_id = p_doctor_id
        and t.day_of_week = v_dow
        and t.start_time <= v_local_time
        and t.end_time > v_local_time
      limit 1;
      if v_slot_cap is not null then
        v_capacity := v_slot_cap;
      end if;
    end if;
  else
    -- No doctor assigned: the service's own consultation mode governs.
    v_mode := 'single_slot';
    select s.consultation_mode into v_mode
    from public.services s
    where s.id = p_service_id and s.clinic_id = p_clinic_id;
    if v_mode is null or v_mode not in ('single_slot', 'shared_window') then
      v_mode := 'single_slot';
    end if;

    if v_mode = 'shared_window' then
      v_capacity := 1;
      select t.patient_limit into v_slot_cap
      from public.service_slot_templates t
      where t.clinic_id = p_clinic_id
        and t.service_id = p_service_id
        and t.day_of_week = v_dow
        and t.start_time <= v_local_time
        and t.end_time > v_local_time
      limit 1;
      if v_slot_cap is not null then
        v_capacity := v_slot_cap;
      end if;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('medbook-appointment-' || p_clinic_id::text, 0));

  if v_mode = 'shared_window' then
    if p_doctor_id is not null then
      -- Doctor-driven group window (Phase 20 semantics, capacity now per-slot).
      if exists (
        select 1
        from public.appointments a
        where a.clinic_id = p_clinic_id
          and a.status <> 'cancelled'::public.appointment_status
          and a.doctor_id is null
          and a.start_time < p_end_time
          and a.end_time > p_start_time
      ) then
        raise exception using errcode = 'P0001', message = 'SLOT_OVERLAP';
      end if;

      select count(*) into v_used
      from public.appointments a
      where a.clinic_id = p_clinic_id
        and a.doctor_id = p_doctor_id
        and a.status <> 'cancelled'::public.appointment_status
        and a.start_time = p_start_time;

      if v_used >= v_capacity then
        raise exception using errcode = 'P0001', message = 'SHARED_WINDOW_FULL';
      end if;

      if exists (
        select 1
        from public.appointments a
        where a.clinic_id = p_clinic_id
          and a.doctor_id = p_doctor_id
          and a.status <> 'cancelled'::public.appointment_status
          and a.start_time < p_end_time
          and a.end_time > p_start_time
          and a.start_time <> p_start_time
      ) then
        raise exception using errcode = 'P0001', message = 'SLOT_OVERLAP';
      end if;
    else
      -- Service-driven group window: same service + same start anchor share
      -- the slot's capacity; every other overlap still blocks.
      if exists (
        select 1
        from public.appointments a
        where a.clinic_id = p_clinic_id
          and a.status <> 'cancelled'::public.appointment_status
          and a.start_time < p_end_time
          and a.end_time > p_start_time
          and not (a.service_id = p_service_id and a.start_time = p_start_time)
      ) then
        raise exception using errcode = 'P0001', message = 'SLOT_OVERLAP';
      end if;

      select count(*) into v_used
      from public.appointments a
      where a.clinic_id = p_clinic_id
        and a.service_id = p_service_id
        and a.status <> 'cancelled'::public.appointment_status
        and a.start_time = p_start_time;

      if v_used >= v_capacity then
        raise exception using errcode = 'P0001', message = 'SHARED_WINDOW_FULL';
      end if;
    end if;
  else
    -- single_slot: exact-overlap rejection, unchanged for doctors and services.
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
  end if;

  insert into public.appointments (
    clinic_id, patient_id, service_id, doctor_id,
    start_time, end_time, status, booking_source, notes,
    consultation_type
  ) values (
    p_clinic_id, p_patient_id, p_service_id, p_doctor_id,
    p_start_time, p_end_time, p_status, p_booking_source, p_notes,
    p_consultation_type
  )
  returning * into v_appt;

  return v_appt;
end;
$$;

-- ----------------------------------------------------------------------------
-- reschedule_appointment: same per-slot capacity re-verification for the
-- appointment's OWN doctor/service.
-- ----------------------------------------------------------------------------
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
  v_appt        public.appointments;
  v_doctor_id   uuid;
  v_service_id  uuid;
  v_mode        text;
  v_capacity    int;
  v_used        int;
  v_slot_cap    int;
  v_tz          text;
  v_local       timestamp;
  v_dow         int;
  v_local_time  time;
begin
  perform pg_advisory_xact_lock(hashtextextended('medbook-appointment-' || p_clinic_id::text, 0));

  select a.doctor_id, a.service_id into v_doctor_id, v_service_id
  from public.appointments a
  where a.id = p_appointment_id
    and a.clinic_id = p_clinic_id;

  if v_doctor_id is null and v_service_id is null and not exists (
    select 1 from public.appointments a
    where a.id = p_appointment_id and a.clinic_id = p_clinic_id
  ) then
    raise exception using errcode = 'P0001', message = 'APPOINTMENT_NOT_FOUND';
  end if;

  select timezone into v_tz
  from public.clinics
  where id = p_clinic_id;
  v_local := p_new_start_time at time zone coalesce(v_tz, 'UTC');
  v_dow := extract(isodow from v_local)::int - 1;
  v_local_time := v_local::time;

  if v_doctor_id is not null then
    select d.consultation_mode, d.max_patients_per_window
    into v_mode, v_capacity
    from public.doctors d
    where d.clinic_id = p_clinic_id and d.id = v_doctor_id;
    if v_mode is null then
      raise exception using errcode = 'P0001', message = 'DOCTOR_NOT_FOUND';
    end if;

    if v_mode = 'shared_window' then
      select t.patient_limit into v_slot_cap
      from public.doctor_slot_templates t
      where t.clinic_id = p_clinic_id
        and t.doctor_id = v_doctor_id
        and t.day_of_week = v_dow
        and t.start_time <= v_local_time
        and t.end_time > v_local_time
      limit 1;
      if v_slot_cap is not null then
        v_capacity := v_slot_cap;
      end if;
    end if;
  else
    v_mode := 'single_slot';
    select s.consultation_mode into v_mode
    from public.services s
    where s.id = v_service_id and s.clinic_id = p_clinic_id;
    if v_mode is null or v_mode not in ('single_slot', 'shared_window') then
      v_mode := 'single_slot';
    end if;

    if v_mode = 'shared_window' then
      v_capacity := 1;
      select t.patient_limit into v_slot_cap
      from public.service_slot_templates t
      where t.clinic_id = p_clinic_id
        and t.service_id = v_service_id
        and t.day_of_week = v_dow
        and t.start_time <= v_local_time
        and t.end_time > v_local_time
      limit 1;
      if v_slot_cap is not null then
        v_capacity := v_slot_cap;
      end if;
    end if;
  end if;

  if v_mode = 'shared_window' then
    if v_doctor_id is not null then
      if exists (
        select 1
        from public.appointments a
        where a.clinic_id = p_clinic_id
          and a.id <> p_appointment_id
          and a.status <> 'cancelled'::public.appointment_status
          and a.doctor_id is null
          and a.start_time < p_new_end_time
          and a.end_time > p_new_start_time
      ) then
        raise exception using errcode = 'P0001', message = 'SLOT_OVERLAP';
      end if;

      select count(*) into v_used
      from public.appointments a
      where a.clinic_id = p_clinic_id
        and a.doctor_id = v_doctor_id
        and a.id <> p_appointment_id
        and a.status <> 'cancelled'::public.appointment_status
        and a.start_time = p_new_start_time;

      if v_used >= v_capacity then
        raise exception using errcode = 'P0001', message = 'SHARED_WINDOW_FULL';
      end if;

      if exists (
        select 1
        from public.appointments a
        where a.clinic_id = p_clinic_id
          and a.doctor_id = v_doctor_id
          and a.id <> p_appointment_id
          and a.status <> 'cancelled'::public.appointment_status
          and a.start_time < p_new_end_time
          and a.end_time > p_new_start_time
          and a.start_time <> p_new_start_time
      ) then
        raise exception using errcode = 'P0001', message = 'SLOT_OVERLAP';
      end if;
    else
      if exists (
        select 1
        from public.appointments a
        where a.clinic_id = p_clinic_id
          and a.id <> p_appointment_id
          and a.status <> 'cancelled'::public.appointment_status
          and a.start_time < p_new_end_time
          and a.end_time > p_new_start_time
          and not (a.service_id = v_service_id and a.start_time = p_new_start_time)
      ) then
        raise exception using errcode = 'P0001', message = 'SLOT_OVERLAP';
      end if;

      select count(*) into v_used
      from public.appointments a
      where a.clinic_id = p_clinic_id
        and a.service_id = v_service_id
        and a.id <> p_appointment_id
        and a.status <> 'cancelled'::public.appointment_status
        and a.start_time = p_new_start_time;

      if v_used >= v_capacity then
        raise exception using errcode = 'P0001', message = 'SHARED_WINDOW_FULL';
      end if;
    end if;
  else
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
-- VERIFICATION (manual; mirrors Phase 20/21 pipeline)
-- -----------------------------------------------------------------------------
-- 1. Existing shared-window doctor: each slot row now has patient_limit equal to
--    the doctor's previous max_patients_per_window; single-slot doctors keep
--    NULL and behave identically.
-- 2. service_slot_templates: insert two rows for the same service/day (split
--    shift) -> allowed; a duplicate (clinic, service, day, start) is rejected;
--    a row for another clinic's service fails the composite FK; staff read-only.
-- 3. A shared-window service with slots capped at 6 and 4 patients: booking the
--    same window 6x then the 7th raises SHARED_WINDOW_FULL for that slot while
--    the 4-patient slot rejects at 5.
-- 4. A shared-window DOCTOR with mixed per-slot limits behaves per slot; a
--    single-slot service never triggers the shared-window branch.
-- 5. category: ('consultation','service','diagnostic','lab_test','procedure')
--    accepted; anything else rejected by services_category_check; legacy
--    'consultation'/'service' rows unchanged.
-- =============================================================================