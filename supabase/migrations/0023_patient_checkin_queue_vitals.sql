-- =============================================================================
-- MedBook AI — Phase 17 | Migration 0023
-- Patient Check-In, Waiting Queue, Token Assignment & Vitals Capture
--
-- DESIGN NOTES
-- ------------
-- * `visits` is a SEPARATE state dimension from `appointments.status`. An
--   appointment tracks the booked slot lifecycle (pending/confirmed/completed/
--   cancelled/no_show); a visit tracks the physical visit workflow
--   (checked_in -> waiting -> in_consultation -> completed). An appointment
--   with no check-in yet has NO visit row.
-- * Token numbers are daily per-clinic sequences. Queue position is the
--   serving order; token is the patient's identifier (assigned at check-in,
--   does not change on reorder). Both reset daily.
-- * `check_in_patient` RPC is idempotent: calling it twice for the same
--   appointment returns the existing visit without creating a duplicate.
-- * `reorder_queue` RPC is atomic: it takes the advisory lock for the clinic
--   and recalculates all affected queue positions in one transaction.
-- * Vitals are optional and recorded during the waiting/check-in step.
-- * All objects are created idempotently (guarded create/enum/policy blocks).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- enum: visit_status
-- ----------------------------------------------------------------------------
do $$
begin
  create type public.visit_status as enum (
    'scheduled', 'checked_in', 'waiting', 'in_consultation', 'completed'
  );
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- enum: payment_status
-- ----------------------------------------------------------------------------
do $$
begin
  create type public.payment_status as enum (
    'pending', 'collected_pre', 'collected_post', 'not_required'
  );
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- table: visits
-- ----------------------------------------------------------------------------
create table if not exists public.visits (
  id                      uuid                   primary key default gen_random_uuid(),
  clinic_id               uuid                   not null references public.clinics (id) on delete cascade,
  appointment_id          uuid                   not null,
  patient_id              uuid                   not null,
  doctor_id               uuid,
  status                  public.visit_status    not null default 'waiting'::public.visit_status,
  payment_status          public.payment_status  not null default 'pending'::public.payment_status,
  token_number            int                    not null,
  queue_position          int                    not null,
  checked_in_at           timestamptz            not null default now(),
  consultation_started_at timestamptz,
  completed_at            timestamptz,
  created_at              timestamptz            not null default now(),
  updated_at              timestamptz            not null default now(),
  -- Same-clinic integrity via composite FKs
  constraint visits_clinic_appointment_unique unique (clinic_id, appointment_id),
  constraint visits_clinic_patient_fkey
    foreign key (clinic_id, patient_id) references public.patients (clinic_id, id),
  constraint visits_clinic_appointment_fkey
    foreign key (clinic_id, appointment_id) references public.appointments (clinic_id, id),
  constraint visits_clinic_doctor_fkey
    foreign key (clinic_id, doctor_id) references public.doctors (clinic_id, id)
);

-- Indexes: today's queue query, appointment lookup, patient lookup
create index if not exists visits_clinic_status_idx    on public.visits (clinic_id, status);
create index if not exists visits_clinic_date_idx      on public.visits (clinic_id, checked_in_at);
create index if not exists visits_appointment_idx      on public.visits (clinic_id, appointment_id);
create index if not exists visits_patient_idx          on public.visits (clinic_id, patient_id);
create index if not exists visits_queue_idx            on public.visits (clinic_id, queue_position) where status in ('waiting', 'in_consultation');

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'visits_set_updated_at') then
    create trigger visits_set_updated_at
      before update on public.visits
      for each row
      execute function public.handle_updated_at();
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- table: vitals
-- ----------------------------------------------------------------------------
create table if not exists public.vitals (
  id               uuid        primary key default gen_random_uuid(),
  clinic_id        uuid        not null references public.clinics (id) on delete cascade,
  visit_id         uuid        not null,
  recorded_by      uuid,
  blood_pressure   text        check (blood_pressure is null or char_length(btrim(blood_pressure)) between 1 and 32),
  temperature      numeric(4,1) check (temperature is null or (temperature >= 30 and temperature <= 45)),
  pulse            int         check (pulse is null or (pulse >= 30 and pulse <= 300)),
  weight           numeric(5,2) check (weight is null or (weight > 0 and weight <= 500)),
  height           numeric(5,1) check (height is null or (height > 0 and height <= 300)),
  recorded_at      timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint vitals_clinic_visit_fkey
    foreign key (visit_id) references public.visits (id) on delete cascade
);

create index if not exists vitals_clinic_visit_idx on public.vitals (clinic_id, visit_id);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'vitals_set_updated_at') then
    create trigger vitals_set_updated_at
      before update on public.vitals
      for each row
      execute function public.handle_updated_at();
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- enable RLS
-- ----------------------------------------------------------------------------
alter table public.visits  enable row level security;
alter table public.vitals  enable row level security;

-- ----------------------------------------------------------------------------
-- policies: visits (any member may read/write — clinic-floor work)
-- ----------------------------------------------------------------------------
drop policy if exists visits_select_member on public.visits;
create policy visits_select_member
  on public.visits
  for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists visits_insert_member on public.visits;
create policy visits_insert_member
  on public.visits
  for insert
  to authenticated
  with check (public.is_clinic_member(clinic_id));

drop policy if exists visits_update_member on public.visits;
create policy visits_update_member
  on public.visits
  for update
  to authenticated
  using (public.is_clinic_member(clinic_id))
  with check (public.is_clinic_member(clinic_id));

drop policy if exists visits_delete_member on public.visits;
create policy visits_delete_member
  on public.visits
  for delete
  to authenticated
  using (public.is_clinic_member(clinic_id));

-- ----------------------------------------------------------------------------
-- policies: vitals (any member may read/write)
-- ----------------------------------------------------------------------------
drop policy if exists vitals_select_member on public.vitals;
create policy vitals_select_member
  on public.vitals
  for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists vitals_insert_member on public.vitals;
create policy vitals_insert_member
  on public.vitals
  for insert
  to authenticated
  with check (public.is_clinic_member(clinic_id));

drop policy if exists vitals_update_member on public.vitals;
create policy vitals_update_member
  on public.vitals
  for update
  to authenticated
  using (public.is_clinic_member(clinic_id))
  with check (public.is_clinic_member(clinic_id));

drop policy if exists vitals_delete_member on public.vitals;
create policy vitals_delete_member
  on public.vitals
  for delete
  to authenticated
  using (public.is_clinic_member(clinic_id));

-- ----------------------------------------------------------------------------
-- RPC: check_in_patient (idempotent)
-- Creates or returns the visit for an appointment. On first check-in,
-- assigns the next token number and appends to the end of the queue.
-- ----------------------------------------------------------------------------
create or replace function public.check_in_patient(
  p_clinic_id      uuid,
  p_appointment_id uuid,
  p_payment_status public.payment_status default 'pending'::public.payment_status
) returns public.visits
language plpgsql
volatile
security invoker
set search_path = public, auth
as $$
declare
  v_visit     public.visits;
  v_patient   uuid;
  v_doctor    uuid;
  v_next_token int;
  v_next_pos   int;
begin
  -- Serialize per-clinic to prevent concurrent duplicate check-ins
  perform pg_advisory_xact_lock(hashtextextended('medbook-checkin-' || p_clinic_id::text, 0));

  -- Resolve the appointment (must belong to this clinic)
  select a.patient_id, a.doctor_id
  into v_patient, v_doctor
  from public.appointments a
  where a.id = p_appointment_id
    and a.clinic_id = p_clinic_id;

  if v_patient is null then
    raise exception using errcode = 'P0001', message = 'APPOINTMENT_NOT_FOUND';
  end if;

  -- Idempotent: if a visit already exists, return it
  select v.* into v_visit
  from public.visits v
  where v.clinic_id = p_clinic_id
    and v.appointment_id = p_appointment_id;

  if v_visit is not null then
    return v_visit;
  end if;

  -- Compute next token number for today (clinic-local day)
  select coalesce(max(v.token_number), 0) + 1
  into v_next_token
  from public.visits v
  where v.clinic_id = p_clinic_id
    and v.checked_in_at >= date_trunc('day', now());

  -- Compute next queue position (append to end)
  select coalesce(max(v.queue_position), 0) + 1
  into v_next_pos
  from public.visits v
  where v.clinic_id = p_clinic_id
    and v.status in ('waiting'::public.visit_status, 'in_consultation'::public.visit_status);

  -- Insert the visit
  insert into public.visits (
    clinic_id, appointment_id, patient_id, doctor_id,
    status, payment_status, token_number, queue_position
  ) values (
    p_clinic_id, p_appointment_id, v_patient, v_doctor,
    'waiting'::public.visit_status, p_payment_status, v_next_token, v_next_pos
  )
  returning * into v_visit;

  return v_visit;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: record_vitals (upserts vitals for a visit)
-- ----------------------------------------------------------------------------
create or replace function public.record_vitals(
  p_visit_id       uuid,
  p_blood_pressure text,
  p_temperature    numeric,
  p_pulse          int,
  p_weight         numeric,
  p_height         numeric
) returns public.vitals
language plpgsql
volatile
security invoker
set search_path = public, auth
as $$
declare
  v_clinic_id uuid;
  v_vitals    public.vitals;
begin
  -- Resolve clinic from visit
  select v.clinic_id into v_clinic_id
  from public.visits v
  where v.id = p_visit_id;

  if v_clinic_id is null then
    raise exception using errcode = 'P0001', message = 'VISIT_NOT_FOUND';
  end if;

  -- Upsert: one vitals record per visit
  insert into public.vitals (
    clinic_id, visit_id, recorded_by,
    blood_pressure, temperature, pulse, weight, height
  ) values (
    v_clinic_id, p_visit_id, (select auth.uid()),
    nullif(btrim(p_blood_pressure), ''),
    nullif(p_temperature, 0),
    nullif(p_pulse, 0),
    nullif(p_weight, 0),
    nullif(p_height, 0)
  )
  on conflict (clinic_id, visit_id) do update set
    blood_pressure = excluded.blood_pressure,
    temperature    = excluded.temperature,
    pulse          = excluded.pulse,
    weight         = excluded.weight,
    height         = excluded.height,
    recorded_by    = excluded.recorded_by,
    recorded_at    = now()
  returning * into v_vitals;

  return v_vitals;
end;
$$;

-- Unique constraint for vitals upsert (one per visit per clinic)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vitals_clinic_visit_unique'
  ) then
    alter table public.vitals
      add constraint vitals_clinic_visit_unique unique (clinic_id, visit_id);
  end if;
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- RPC: reorder_queue (atomic reorder of waiting patients)
-- Moves a visit to a new position in the queue. All affected positions
-- are recalculated atomically under an advisory lock.
-- ----------------------------------------------------------------------------
create or replace function public.reorder_queue(
  p_clinic_id   uuid,
  p_visit_id    uuid,
  p_new_position int
) returns void
language plpgsql
volatile
security invoker
set search_path = public, auth
as $$
declare
  v_current_pos int;
  v_max_pos     int;
  v_target      int;
begin
  perform pg_advisory_xact_lock(hashtextextended('medbook-queue-' || p_clinic_id::text, 0));

  -- Get current position
  select queue_position into v_current_pos
  from public.visits
  where id = p_visit_id
    and clinic_id = p_clinic_id
    and status in ('waiting'::public.visit_status, 'in_consultation'::public.visit_status);

  if v_current_pos is null then
    raise exception using errcode = 'P0001', message = 'VISIT_NOT_FOUND_IN_QUEUE';
  end if;

  -- Clamp target to valid range [1, max_position]
  select coalesce(max(queue_position), 0) into v_max_pos
  from public.visits
  where clinic_id = p_clinic_id
    and status in ('waiting'::public.visit_status, 'in_consultation'::public.visit_status);

  v_target := greatest(1, least(p_new_position, v_max_pos));

  if v_target = v_current_pos then
    return; -- no-op
  end if;

  if v_target < v_current_pos then
    -- Moving UP: shift items between target and current down by 1
    update public.visits v
    set queue_position = queue_position + 1
    where v.clinic_id = p_clinic_id
      and v.status in ('waiting'::public.visit_status, 'in_consultation'::public.visit_status)
      and v.queue_position >= v_target
      and v.queue_position < v_current_pos;
  else
    -- Moving DOWN: shift items between current and target up by 1
    update public.visits v
    set queue_position = queue_position - 1
    where v.clinic_id = p_clinic_id
      and v.status in ('waiting'::public.visit_status, 'in_consultation'::public.visit_status)
      and v.queue_position > v_current_pos
      and v.queue_position <= v_target;
  end if;

  -- Place the visit at its new position
  update public.visits v
  set queue_position = v_target
  where v.id = p_visit_id
    and v.clinic_id = p_clinic_id;
end;
$$;

-- =============================================================================
-- VERIFICATION (manual; mirrors Phase 17 checklist)
-- -----------------------------------------------------------------------------
-- 1. Check in an appointment -> creates visit with token + queue position
-- 2. Check in same appointment again -> returns existing visit (idempotent)
-- 3. Patient appears in waiting queue ordered by queue_position
-- 4. Reorder: move patient to position 1 -> all others shift down atomically
-- 5. Vitals: record vitals for a visit -> vitals row created
-- 6. Vitals: update vitals for same visit -> upserts (no duplicate)
-- 7. Cross-tenant: another clinic's user sees zero rows
-- =============================================================================
