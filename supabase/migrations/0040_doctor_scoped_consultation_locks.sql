-- 0040_doctor_scoped_consultation_locks.sql
--
-- The consultation lock was clinic-wide: `start_consultation` refused to begin
-- when ANY visit in the clinic was `in_consultation`, no matter which doctor it
-- belonged to. In multi-doctor clinics (waiting list is already doctor-scoped)
-- this let one doctor's stale/long consultation hard-block every other doctor,
-- with the UI showing an empty "in consultation" slot while the RPC threw
-- "Another patient is currently in consultation."
--
-- Scope the lock (and the automatic next-patient promotion in
-- `complete_and_advance`) to the same doctor. Visits without a doctor keep
-- their own bucket (doctor_id IS NOT DISTINCT FROM NULL == itself), so a
-- doctor-less walk-in does not block anyone else and vice-versa.

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
  v_doctor_id uuid;
  v_lock_key bigint;
begin
  -- fetch the target visit (must be waiting, in this clinic) to learn its doctor
  select * into v_visit
  from public.visits
  where id = p_visit_id
    and clinic_id = p_clinic_id
    and status = 'waiting';

  if not found then
    raise exception 'Visit not found or not eligible for consultation.';
  end if;

  v_doctor_id := v_visit.doctor_id;

  -- acquire advisory lock per doctor (or per doctor-less bucket), not per clinic
  v_lock_key := hashtext(p_clinic_id::text || ':' || coalesce(v_doctor_id::text, ''));
  perform pg_advisory_xact_lock(v_lock_key);

  -- ensure the same doctor has no other visit in_consultation
  if exists (
    select 1 from public.visits
    where clinic_id = p_clinic_id
      and doctor_id is not distinct from v_doctor_id
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
  -- fetch the current visit (must be in_consultation) to learn its doctor
  select * into v_current
  from public.visits
  where id = p_visit_id
    and clinic_id = p_clinic_id
    and status = 'in_consultation';

  if not found then
    raise exception 'Visit not found or not currently in consultation.';
  end if;

  -- acquire advisory lock per doctor (or per doctor-less bucket), not per clinic
  v_lock_key := hashtext(p_clinic_id::text || ':' || coalesce(v_current.doctor_id::text, ''));
  perform pg_advisory_xact_lock(v_lock_key);

  -- complete the current visit
  update public.visits
  set status = 'completed',
      completed_at = now(),
      updated_at = now()
  where id = p_visit_id
    and clinic_id = p_clinic_id;

  -- find the next waiting visit for the SAME doctor (lowest queue_position)
  select * into v_next
  from public.visits
  where clinic_id = p_clinic_id
    and doctor_id is not distinct from v_current.doctor_id
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

  -- no waiting patients for this doctor
  return null;
end;
$$;