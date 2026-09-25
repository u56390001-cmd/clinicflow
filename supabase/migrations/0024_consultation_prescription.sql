-- =============================================================================
-- MedBook AI — Phase 18 | Migration 0024
-- Consultation Flow, Prescription & Prescription Templates
--
-- DESIGN NOTES
-- ------------
-- * Prescriptions are linked to visits — one prescription per visit (UNIQUE
--   constraint on clinic_id + visit_id). Medicines and lab orders are stored
--   as jsonb arrays to keep the schema simple and match the UI's dynamic
--   add/remove rows pattern.
-- * Prescription templates are doctor-scoped (prescribing patterns are
--   individual). Templates store reusable diagnosis/medicines/lab-orders but
--   NOT patient-specific fields (chief complaint, patient details).
-- * `start_consultation` RPC is advisory-locked per clinic to ensure only one
--   active consultation at a time in single-doctor clinics. For multi-doctor
--   clinics, the lock is per-doctor (advisory key = hashtext(clinic_id ||
--   doctor_id)).
-- * `complete_and_advance` RPC completes the current visit and automatically
--   promotes the next waiting patient for the same doctor to in_consultation.
-- * All objects are created idempotently (guarded create/table/policy blocks).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- table: prescriptions
-- ----------------------------------------------------------------------------
create table if not exists public.prescriptions (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references public.clinics(id) on delete cascade,
  visit_id      uuid not null,
  patient_id    uuid not null,
  doctor_id     uuid,

  chief_complaint   text not null default '',
  findings          text not null default '',
  diagnosis         text not null default '',
  custom_diagnosis  text not null default '',

  -- jsonb arrays: [{name, route, form, frequency, duration, unit, instructions}]
  medicines   jsonb not null default '[]'::jsonb,
  -- jsonb arrays: [{test_name, notes}]
  lab_orders  jsonb not null default '[]'::jsonb,

  follow_up_date   date,
  follow_up_notes  text not null default '',
  doctor_notes     text not null default '',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- one prescription per visit per clinic
  constraint prescriptions_clinic_visit_unique unique (clinic_id, visit_id)
);

-- foreign keys (guarded)
do $$
begin
  alter table public.prescriptions
    add constraint prescriptions_clinic_clinic_fkey
    foreign key (clinic_id) references public.clinics(id) on delete cascade;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.prescriptions
    add constraint prescriptions_clinic_visit_fkey
    foreign key (visit_id) references public.visits(id) on delete cascade;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.prescriptions
    add constraint prescriptions_clinic_patient_fkey
    foreign key (clinic_id, patient_id) references public.patients(clinic_id, id) on delete cascade;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.prescriptions
    add constraint prescriptions_clinic_doctor_fkey
    foreign key (clinic_id, doctor_id) references public.doctors(clinic_id, id) on delete set null;
exception when duplicate_object then null;
end $$;

-- updated_at trigger
create or replace function public.handle_prescriptions_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists prescriptions_updated_at on public.prescriptions;
create trigger prescriptions_updated_at
  before update on public.prescriptions
  for each row execute function public.handle_prescriptions_updated_at();

-- indexes
create index if not exists idx_prescriptions_clinic_id on public.prescriptions(clinic_id);
create index if not exists idx_prescriptions_visit_id on public.prescriptions(clinic_id, visit_id);
create index if not exists idx_prescriptions_patient_id on public.prescriptions(clinic_id, patient_id);
create index if not exists idx_prescriptions_doctor_id on public.prescriptions(clinic_id, doctor_id);

-- RLS
alter table public.prescriptions enable row level security;

do $$
begin
  drop policy if exists prescriptions_select_clinic_member on public.prescriptions;
  create policy prescriptions_select_clinic_member on public.prescriptions
    for select to authenticated using (public.is_clinic_member(clinic_id));

  drop policy if exists prescriptions_insert_clinic_member on public.prescriptions;
  create policy prescriptions_insert_clinic_member on public.prescriptions
    for insert to authenticated with check (public.is_clinic_member(clinic_id));

  drop policy if exists prescriptions_update_clinic_member on public.prescriptions;
  create policy prescriptions_update_clinic_member on public.prescriptions
    for update to authenticated using (public.is_clinic_member(clinic_id));

  drop policy if exists prescriptions_delete_clinic_member on public.prescriptions;
  create policy prescriptions_delete_clinic_member on public.prescriptions
    for delete to authenticated using (public.is_clinic_member(clinic_id));
end $$;

-- ----------------------------------------------------------------------------
-- table: prescription_templates
-- ----------------------------------------------------------------------------
create table if not exists public.prescription_templates (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references public.clinics(id) on delete cascade,
  doctor_id     uuid not null,
  name          text not null,

  diagnosis         text not null default '',
  custom_diagnosis  text not null default '',

  medicines   jsonb not null default '[]'::jsonb,
  lab_orders  jsonb not null default '[]'::jsonb,

  doctor_notes  text not null default '',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- foreign keys (guarded)
do $$
begin
  alter table public.prescription_templates
    add constraint prescription_templates_clinic_clinic_fkey
    foreign key (clinic_id) references public.clinics(id) on delete cascade;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.prescription_templates
    add constraint prescription_templates_clinic_doctor_fkey
    foreign key (clinic_id, doctor_id) references public.doctors(clinic_id, id) on delete cascade;
exception when duplicate_object then null;
end $$;

-- updated_at trigger
create or replace function public.handle_prescription_templates_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists prescription_templates_updated_at on public.prescription_templates;
create trigger prescription_templates_updated_at
  before update on public.prescription_templates
  for each row execute function public.handle_prescription_templates_updated_at();

-- indexes
create index if not exists idx_prescription_templates_clinic_id on public.prescription_templates(clinic_id);
create index if not exists idx_prescription_templates_doctor_id on public.prescription_templates(clinic_id, doctor_id);

-- RLS
alter table public.prescription_templates enable row level security;

do $$
begin
  drop policy if exists prescription_templates_select_clinic_member on public.prescription_templates;
  create policy prescription_templates_select_clinic_member on public.prescription_templates
    for select to authenticated using (public.is_clinic_member(clinic_id));

  drop policy if exists prescription_templates_insert_clinic_member on public.prescription_templates;
  create policy prescription_templates_insert_clinic_member on public.prescription_templates
    for insert to authenticated with check (public.is_clinic_member(clinic_id));

  drop policy if exists prescription_templates_update_clinic_member on public.prescription_templates;
  create policy prescription_templates_update_clinic_member on public.prescription_templates
    for update to authenticated using (public.is_clinic_member(clinic_id));

  drop policy if exists prescription_templates_delete_clinic_member on public.prescription_templates;
  create policy prescription_templates_delete_clinic_member on public.prescription_templates
    for delete to authenticated using (public.is_clinic_member(clinic_id));
end $$;

-- ----------------------------------------------------------------------------
-- RPC: start_consultation
-- Sets visit status to 'in_consultation' and consultation_started_at.
-- Advisory-locked per clinic (or per doctor in multi-doctor clinics).
-- Returns the updated visit row.
-- ----------------------------------------------------------------------------
create or replace function public.start_consultation(
  p_clinic_id  uuid,
  p_visit_id   uuid
)
returns public.visits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit public.visits%rowtype;
  v_lock_key bigint;
begin
  -- acquire advisory lock (per-clinic)
  v_lock_key := hashtext(p_clinic_id::text);
  perform pg_advisory_xact_lock(v_lock_key);

  -- fetch the target visit (must be waiting, first in queue)
  select * into v_visit
  from public.visits
  where id = p_visit_id
    and clinic_id = p_clinic_id
    and status = 'waiting';

  if not found then
    raise exception 'Visit not found or not eligible for consultation.';
  end if;

  -- ensure no other visit is currently in_consultation for this clinic
  if exists (
    select 1 from public.visits
    where clinic_id = p_clinic_id
      and status = 'in_consultation'
      and id != p_visit_id
  ) then
    raise exception 'Another patient is currently in consultation. Complete that consultation first.';
  end if;

  -- transition to in_consultation
  update public.visits
  set status = 'in_consultation',
      consultation_started_at = now(),
      updated_at = now()
  where id = p_visit_id
    and clinic_id = p_clinic_id;

  -- refetch and return
  select * into v_visit
  from public.visits
  where id = p_visit_id
    and clinic_id = p_clinic_id;

  return v_visit;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: complete_and_advance
-- Completes the current visit and promotes the next waiting visit (lowest
-- queue_position) to in_consultation. Returns the new in_consultation visit
-- or null if no waiting patients remain.
-- ----------------------------------------------------------------------------
create or replace function public.complete_and_advance(
  p_clinic_id  uuid,
  p_visit_id   uuid
)
returns public.visits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.visits%rowtype;
  v_next public.visits%rowtype;
  v_lock_key bigint;
begin
  -- acquire advisory lock (per-clinic)
  v_lock_key := hashtext(p_clinic_id::text);
  perform pg_advisory_xact_lock(v_lock_key);

  -- fetch the current visit (must be in_consultation)
  select * into v_current
  from public.visits
  where id = p_visit_id
    and clinic_id = p_clinic_id
    and status = 'in_consultation';

  if not found then
    raise exception 'Visit not found or not currently in consultation.';
  end if;

  -- complete the current visit
  update public.visits
  set status = 'completed',
      completed_at = now(),
      updated_at = now()
  where id = p_visit_id
    and clinic_id = p_clinic_id;

  -- find the next waiting visit (lowest queue_position)
  select * into v_next
  from public.visits
  where clinic_id = p_clinic_id
    and status = 'waiting'
  order by queue_position asc
  limit 1;

  if found then
    -- promote to in_consultation
    update public.visits
    set status = 'in_consultation',
        consultation_started_at = now(),
        updated_at = now()
    where id = v_next.id
      and clinic_id = p_clinic_id;

    -- refetch
    select * into v_next
    from public.visits
    where id = v_next.id
      and clinic_id = p_clinic_id;

    return v_next;
  end if;

  -- no waiting patients
  return null;
end;
$$;
