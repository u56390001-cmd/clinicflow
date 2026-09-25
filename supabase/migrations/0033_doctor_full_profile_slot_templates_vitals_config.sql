-- =============================================================================
-- MedBook AI — Phase 20 | Migration 0033
-- Doctor Full Profile, Slot Templates, Per-Doctor Vitals Config & Shared-Window Booking
--
-- DESIGN NOTES
-- ------------
-- * BACKWARD COMPATIBILITY IS THE CORE CONSTRAINT (same posture as 0017): every
--   new `doctors` column is nullable or has a legacy-preserving default. A
--   clinic that never edits a doctor's profile keeps booking exactly as before.
-- * Full profile columns: experience, qualification, registration number,
--   contact (email/phone), follow-up fee + validity, professional description,
--   signature image, and the consultation/slot-mode fields below.
-- * `consultation_mode` ('single_slot' default | 'shared_window'): how this
--   doctor's appointments are scheduled.
--     - single_slot   — unchanged: one non-cancelled appointment per time range;
--                       exact-overlap predicate identical to Phase ≤19.
--     - shared_window — a GROUP booking model: the doctor accepts up to
--       `max_patients_per_window` (default 1) patients whose appointments share
--       the SAME start_time anchor. Capacity = count of non-cancelled
--       appointments for this doctor at that start_time. Two different anchors
--       are two different windows. Unassigned (doctor_id IS NULL) overlapping
--       appointments still block every doctor (conservative legacy semantics).
--   The mode is read from the DB inside the atomic RPCs, so a doctor's mode
--   applies to every booking channel (dashboard, AI, widget, WhatsApp).
-- * `doctor_slot_templates`: discrete NAMED slots (e.g. "Morning round",
--   09:00–12:00) — multiple rows per weekday = split shifts. Templates take
--   precedence over range-based availability in the app layer; a doctor with no
--   templates falls back to `availability_rules` unchanged.
-- * `doctor_vitals_config`: ONE row per doctor (UNIQUE clinic_id, doctor_id)
--   describing which standard vitals to show and any custom vitals, plus a
--   display order. No row = all standard vitals in canonical order. Custom
--   vitals values persist to `vitals.custom_vitals` (jsonb array of
--   {key, label, value, unit}).
-- * `consultation_type` DB enum gains 'video' (migration 0021 only defined
--   in_clinic/online; the TS union and booking UI already supported video, so
--   the RPC enum lagged). Doctor-level `consultation_type` is a separate
--   enumeration ('offline'/'both'/'online') recording which delivery modes the
--   doctor offers; it is a data field only (no video infrastructure), matching
--   the Phase-15 appointment.consultation_type posture.
-- * RLS: the two new tables follow the established `doctors` pattern — read
--   for any clinic member, write for owner/admin. `vitals.custom_vitals` and
--   `record_vitals` are member-writable (clinic-floor work), as today.
-- * All statements are idempotent.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- enum: doctor_consultation_type (delivery modes a doctor offers)
-- ----------------------------------------------------------------------------
do $$
begin
  create type public.doctor_consultation_type as enum ('offline', 'both', 'online');
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- enum: consultation_type — add 'video' (guarded; value unused in this file's
-- DDL so it is safe even when the migration runs in a transaction)
-- ----------------------------------------------------------------------------
do $$
begin
  alter type public.consultation_type add value if not exists 'video';
exception
  when duplicate_object then null;
  when invalid_parameter_value then null;
end $$;

-- ----------------------------------------------------------------------------
-- doctors: full profile columns
-- ----------------------------------------------------------------------------
alter table public.doctors
  add column if not exists years_of_experience int
    check (years_of_experience is null or (years_of_experience >= 0 and years_of_experience <= 100)),
  add column if not exists qualification text
    check (qualification is null or char_length(btrim(qualification)) between 1 and 500),
  add column if not exists medical_registration_number text
    check (medical_registration_number is null or char_length(btrim(medical_registration_number)) between 1 and 120),
  add column if not exists email text
    check (email is null or char_length(btrim(email)) between 3 and 254),
  add column if not exists phone text
    check (phone is null or char_length(btrim(phone)) between 3 and 32),
  add column if not exists follow_up_fee numeric(10, 2)
    check (follow_up_fee is null or follow_up_fee >= 0),
  add column if not exists follow_up_valid_for int
    check (follow_up_valid_for is null or (follow_up_valid_for >= 1 and follow_up_valid_for <= 730)),
  add column if not exists follow_up_period text
    check (follow_up_period is null or follow_up_period in ('days', 'weeks', 'months')),
  add column if not exists professional_description text
    check (professional_description is null or char_length(btrim(professional_description)) between 1 and 2000),
  add column if not exists signature_url text
    check (signature_url is null or char_length(btrim(signature_url)) between 1 and 2048),
  -- single_slot (legacy) vs shared_window (group slots anchored on start_time).
  add column if not exists consultation_mode text
    not null default 'single_slot'
    check (consultation_mode in ('single_slot', 'shared_window')),
  -- Capacity per shared-window start_time anchor. Irrelevant for single_slot.
  add column if not exists max_patients_per_window int
    not null default 1
    check (max_patients_per_window between 1 and 50),
  -- Delivery modes this doctor offers (data field; does not gate booking).
  add column if not exists consultation_type public.doctor_consultation_type
    not null default 'offline'::public.doctor_consultation_type;

-- ----------------------------------------------------------------------------
-- table: doctor_slot_templates (named, discrete slots; day-scoped)
-- ----------------------------------------------------------------------------
create table if not exists public.doctor_slot_templates (
  id         uuid        primary key default gen_random_uuid(),
  clinic_id  uuid        not null references public.clinics (id) on delete cascade,
  doctor_id  uuid        not null,
  day_of_week smallint   not null check (day_of_week between 0 and 6),
  slot_name  text        not null check (char_length(btrim(slot_name)) between 1 and 120),
  start_time time        not null,
  end_time   time        not null check (end_time > start_time),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Same-clinic integrity (mirrors availability_rules pattern).
  constraint doctor_slot_templates_clinic_doctor_fkey
    foreign key (clinic_id, doctor_id) references public.doctors (clinic_id, id)
    on delete cascade,
  -- One named slot per doctor/day at a given start time.
  constraint doctor_slot_templates_doctor_day_start_unique
    unique (clinic_id, doctor_id, day_of_week, start_time)
);

create index if not exists doctor_slot_templates_clinic_doctor_idx
  on public.doctor_slot_templates (clinic_id, doctor_id, day_of_week);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'doctor_slot_templates_set_updated_at') then
    create trigger doctor_slot_templates_set_updated_at
      before update on public.doctor_slot_templates
      for each row
      execute function public.handle_updated_at();
  end if;
end $$;

alter table public.doctor_slot_templates enable row level security;

drop policy if exists doctor_slot_templates_select_member on public.doctor_slot_templates;
create policy doctor_slot_templates_select_member
  on public.doctor_slot_templates
  for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists doctor_slot_templates_insert_admin on public.doctor_slot_templates;
create policy doctor_slot_templates_insert_admin
  on public.doctor_slot_templates
  for insert
  to authenticated
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists doctor_slot_templates_update_admin on public.doctor_slot_templates;
create policy doctor_slot_templates_update_admin
  on public.doctor_slot_templates
  for update
  to authenticated
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists doctor_slot_templates_delete_admin on public.doctor_slot_templates;
create policy doctor_slot_templates_delete_admin
  on public.doctor_slot_templates
  for delete
  to authenticated
  using (public.is_clinic_admin(clinic_id));

-- ----------------------------------------------------------------------------
-- table: doctor_vitals_config (one row per doctor)
-- ----------------------------------------------------------------------------
create table if not exists public.doctor_vitals_config (
  id              uuid        primary key default gen_random_uuid(),
  clinic_id       uuid        not null references public.clinics (id) on delete cascade,
  doctor_id       uuid        not null,
  -- Subset of the standard vitals keys the doctor wants recorded, e.g.
  -- ["systolic_bp","diastolic_bp","temperature","weight"]. Null = all standard.
  standard_vitals jsonb       check (standard_vitals is null or jsonb_typeof(standard_vitals) = 'array'),
  -- Custom vitals the clinic defines for this doctor:
  -- [{key, label, unit, placeholder}] — keys must be [a-z0-9_]; labels user-facing.
  custom_vitals   jsonb       check (custom_vitals is null or jsonb_typeof(custom_vitals) = 'array'),
  -- Display order of BOTH standard and custom keys as rendered on the form.
  display_order   jsonb       check (display_order is null or jsonb_typeof(display_order) = 'array'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint doctor_vitals_config_clinic_doctor_fkey
    foreign key (clinic_id, doctor_id) references public.doctors (clinic_id, id)
    on delete cascade,
  constraint doctor_vitals_config_clinic_doctor_unique unique (clinic_id, doctor_id)
);

create index if not exists doctor_vitals_config_clinic_doctor_idx
  on public.doctor_vitals_config (clinic_id, doctor_id);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'doctor_vitals_config_set_updated_at') then
    create trigger doctor_vitals_config_set_updated_at
      before update on public.doctor_vitals_config
      for each row
      execute function public.handle_updated_at();
  end if;
end $$;

alter table public.doctor_vitals_config enable row level security;

drop policy if exists doctor_vitals_config_select_member on public.doctor_vitals_config;
create policy doctor_vitals_config_select_member
  on public.doctor_vitals_config
  for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists doctor_vitals_config_insert_admin on public.doctor_vitals_config;
create policy doctor_vitals_config_insert_admin
  on public.doctor_vitals_config
  for insert
  to authenticated
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists doctor_vitals_config_update_admin on public.doctor_vitals_config;
create policy doctor_vitals_config_update_admin
  on public.doctor_vitals_config
  for update
  to authenticated
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists doctor_vitals_config_delete_admin on public.doctor_vitals_config;
create policy doctor_vitals_config_delete_admin
  on public.doctor_vitals_config
  for delete
  to authenticated
  using (public.is_clinic_admin(clinic_id));

-- ----------------------------------------------------------------------------
-- vitals: custom vitals jsonb + capacity index for shared-window counting
-- ----------------------------------------------------------------------------
alter table public.vitals
  add column if not exists custom_vitals jsonb
    check (custom_vitals is null or jsonb_typeof(custom_vitals) = 'array');

create index if not exists appointments_shared_window_capacity_idx
  on public.appointments (clinic_id, doctor_id, start_time)
  where status <> 'cancelled'::public.appointment_status;

-- ----------------------------------------------------------------------------
-- record_vitals: accept and persist custom vitals (category surgery preserved)
-- ----------------------------------------------------------------------------
create or replace function public.record_vitals(
  p_visit_id         uuid,
  p_blood_pressure   text,
  p_temperature      numeric,
  p_pulse            int,
  p_weight           numeric,
  p_height           numeric,
  p_systolic_bp      int default null,
  p_diastolic_bp     int default null,
  p_spo2             int default null,
  p_respiratory_rate int default null,
  p_custom_vitals    jsonb default null
) returns public.vitals
language plpgsql
volatile
security invoker
set search_path = public, auth
as $$
declare
  v_clinic_id uuid;
  v_vitals    public.vitals;
  v_bmi       numeric;
begin
  -- Resolve clinic from visit
  select v.clinic_id into v_clinic_id
  from public.visits v
  where v.id = p_visit_id;

  if v_clinic_id is null then
    raise exception using errcode = 'P0001', message = 'VISIT_NOT_FOUND';
  end if;

  -- Auto-compute BMI if both height (cm) and weight (kg) are provided
  if p_height > 0 and p_weight > 0 then
    v_bmi := round((p_weight / ((p_height / 100.0) * (p_height / 100.0)))::numeric, 2);
  else
    v_bmi := null;
  end if;

  -- Empty array is treated as no custom vitals (keep the column null).
  if p_custom_vitals is not null and jsonb_typeof(p_custom_vitals) = 'array'
     and jsonb_array_length(p_custom_vitals) = 0 then
    p_custom_vitals := null;
  end if;

  -- Upsert: one vitals record per visit
  insert into public.vitals (
    clinic_id, visit_id, recorded_by,
    blood_pressure, temperature, pulse, weight, height,
    systolic_bp, diastolic_bp, spo2, respiratory_rate, bmi,
    custom_vitals
  ) values (
    v_clinic_id, p_visit_id, (select auth.uid()),
    nullif(btrim(p_blood_pressure), ''),
    nullif(p_temperature, 0),
    nullif(p_pulse, 0),
    nullif(p_weight, 0),
    nullif(p_height, 0),
    nullif(p_systolic_bp, 0),
    nullif(p_diastolic_bp, 0),
    nullif(p_spo2, 0),
    nullif(p_respiratory_rate, 0),
    v_bmi,
    p_custom_vitals
  )
  on conflict (clinic_id, visit_id) do update set
    blood_pressure   = excluded.blood_pressure,
    temperature      = excluded.temperature,
    pulse            = excluded.pulse,
    weight           = excluded.weight,
    height           = excluded.height,
    systolic_bp      = excluded.systolic_bp,
    diastolic_bp     = excluded.diastolic_bp,
    spo2             = excluded.spo2,
    respiratory_rate = excluded.respiratory_rate,
    bmi              = excluded.bmi,
    custom_vitals    = excluded.custom_vitals,
    recorded_by      = excluded.recorded_by,
    recorded_at      = now()
  returning * into v_vitals;

  return v_vitals;
end;
$$;

-- ----------------------------------------------------------------------------
-- book_appointment: consultation-mode-aware overlap verification.
-- Mode is read from the target doctor inside the advisory-locked transaction:
--   single_slot  -> exact-overlap predicate (unchanged from Phase 10/15).
--   shared_window-> conflict if an unassigned overlapping appointment exists
--                  OR the doctor's non-cancelled appointments at the SAME
--                  start_time have already reached max_patients_per_window.
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
  v_appt       public.appointments;
  v_mode       text;
  v_capacity   int;
  v_used       int;
begin
  if p_doctor_id is not null then
    select d.consultation_mode, d.max_patients_per_window
    into v_mode, v_capacity
    from public.doctors d
    where d.clinic_id = p_clinic_id and d.id = p_doctor_id;

    if v_mode is null then
      raise exception using errcode = 'P0001', message = 'DOCTOR_NOT_FOUND';
    end if;
  else
    v_mode := 'single_slot';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('medbook-appointment-' || p_clinic_id::text, 0));

  if v_mode = 'shared_window' then
    -- Group capacity: an unassigned overlapping appointment still blocks every
    -- doctor; otherwise only the SAME-anchor count for this doctor matters.
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
  else
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
-- reschedule_appointment: mode-aware re-verification against the moving
-- appointment's OWN doctor (doctor reassignment stays out of scope).
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
  v_appt       public.appointments;
  v_doctor_id  uuid;
  v_mode       text;
  v_capacity   int;
  v_used       int;
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

  if v_doctor_id is not null then
    select d.consultation_mode, d.max_patients_per_window
    into v_mode, v_capacity
    from public.doctors d
    where d.clinic_id = p_clinic_id and d.id = v_doctor_id;
    if v_mode is null then
      raise exception using errcode = 'P0001', message = 'DOCTOR_NOT_FOUND';
    end if;
  else
    v_mode := 'single_slot';
  end if;

  if v_mode = 'shared_window' then
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
-- VERIFICATION (manual; mirrors Phase 20 pipeline)
-- -----------------------------------------------------------------------------
-- 1. Doctors table: new columns default safely — existing rows read back
--    consultation_mode='single_slot', max_patients_per_window=1,
--    consultation_type='offline', everything else NULL.
-- 2. consultation_type enum now accepts 'video' (booking RPC stores it);
--    existing rows unchanged ('in_clinic').
-- 3. Slot templates: insert two rows for the same doctor/day (split shift) →
--    allowed; a duplicate (clinic, doctor, day, start) is rejected; a row for
--    another clinic's doctor fails the composite FK; staff can read but not
--    write.
-- 4. Vitals config: one row per doctor enforced; RLS read=member, write=admin;
--    deleting a doctor cascades its config + templates away.
-- 5. record_vitals with p_custom_vitals persists vitals.custom_vitals; an
--    empty array stores NULL; a later call upserts (no duplicate row).
-- 6. Shared window: doctor with mode='shared_window', max=3 → three bookings
--    at the same start_time succeed, the fourth raises SHARED_WINDOW_FULL; an
--    overlapping UNASSIGNED appointment still raises SLOT_OVERLAP. single_slot
--    doctors keep exact-overlap rejection. reschedule re-verifies the same.
-- =============================================================================