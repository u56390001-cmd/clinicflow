-- =============================================================================
-- MedBook AI — Migration 0108 : self-healing consultation lock
--
-- Spec: a consultation must never get stuck, and a consultation left open in
-- the background must never silently block the queue.
--
-- THE BUG
-- -------
-- A consultation is "locked" by `visits.status = 'in_consultation'`. That is
-- persistent row state, not a database lock: the advisory lock
-- (`pg_advisory_xact_lock`) is released at COMMIT and can never leak, but the
-- row state had no expiry, no timeout and no force-clear anywhere in the
-- codebase. Three things could leave a row stuck:
--
--   1. The doctor abandoned the consultation (closed the tab, navigated away).
--   2. `complete_and_advance` AUTO-PROMOTED the next patient into
--      `in_consultation` and the doctor never opened them. The promotion
--      picked the lowest `queue_position` with NO date filter, so it could
--      hand the doctor a patient who checked in weeks earlier — a patient
--      who then sat in `in_consultation` forever.
--   3. A visit whose status was set to `in_consultation` without a
--      `consultation_started_at` timestamp.
--
-- And it was HIDDEN: every "current state" surface (dashboard queue
-- snapshot, TV display, Appointments → Today, the inbox queue) filters by
-- the check-in day / appointment day, so a consultation left open on an
-- earlier day was invisible — the dashboard said "no patient in
-- consultation" while `start_consultation` refused to start anything with
-- "Another patient is currently in consultation. Complete that consultation
-- first."
--
-- THE FIX
-- -------
--   1. A consultation is LIVE only while it belongs to the CURRENT clinic
--      day — the patient checked in today AND the consultation started today.
--      Anything else is STALE: it never blocks a new start, and
--      `start_consultation` releases it back to the queue before it checks,
--      so the doctor is never locked out. (Anchoring on the check-in day as
--      well as the start day is what catches the auto-promotion case: a
--      consultation that started today but for a patient who checked in
--      weeks ago is exactly the one that used to hang around forever.)
--   2. `complete_and_advance` only auto-promotes a patient who checked in on
--      the CURRENT clinic day, so "Complete & Next" can no longer promote a
--      patient from last month.
--   3. `release_stale_consultations(clinic)` releases every stale
--      consultation in the clinic — called by the cron so the dashboard / TV
--      stop showing a phantom "in consultation".
--   4. `start_consultation` accepts a `checked_in` visit as well as
--      `waiting` (it could already finish one, but never start one).
--
-- SAFETY
-- ------
-- * Same function signatures — every existing caller keeps working.
-- * A consultation started within the current clinic day still blocks the
--   doctor exactly as before; the one-per-doctor rule is unchanged for
--   live consultations.
-- * Releasing a stale consultation returns the patient to the waiting queue
--   (`status = 'waiting'`). Any draft prescription is keyed on `visit_id`,
--   so it survives and is restored when the consultation is resumed.
-- * Idempotent: `create or replace` with unchanged signatures.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. clinic_day_start — the clinic's current local midnight, as a timestamptz.
--    "Today" for a clinic is its own calendar day, not the server's.
-- ---------------------------------------------------------------------------
create or replace function public.clinic_day_start(p_clinic_id uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (
    ((now() at time zone coalesce(c.timezone, 'UTC'))::date::timestamp)
    at time zone coalesce(c.timezone, 'UTC')
  )
  from public.clinics c
  where c.id = p_clinic_id;
$$;

comment on function public.clinic_day_start(uuid) is
  'Start of the clinic''s current local calendar day (migration 0108).';

-- ---------------------------------------------------------------------------
-- 2. start_consultation — releases stale consultations before the guard, so a
--    consultation left open on an earlier day can never block today's queue.
--    Also accepts a `checked_in` visit.
-- ---------------------------------------------------------------------------
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
  v_day_start timestamptz;
begin
  if not public.is_clinic_member(p_clinic_id) then
    raise exception using errcode = '42501', message = 'NOT_A_CLINIC_MEMBER';
  end if;

  select * into v_visit
  from public.visits
  where id = p_visit_id
    and clinic_id = p_clinic_id;

  if not found then
    raise exception 'Visit not found or not eligible for consultation.';
  end if;

  -- Idempotent: this doctor's own visit is already open — hand it back rather
  -- than tripping the one-per-doctor guard below.
  if v_visit.status = 'in_consultation' then
    return v_visit;
  end if;

  -- A checked-in patient is as eligible as a waiting one: the queue marks a
  -- visit `checked_in` before it becomes `waiting`, and the app could already
  -- finish one but never start one.
  if v_visit.status not in ('waiting', 'checked_in') then
    raise exception 'Visit not found or not eligible for consultation.';
  end if;

  v_doctor_id := v_visit.doctor_id;
  v_day_start := public.clinic_day_start(p_clinic_id);

  v_lock_key := hashtext(p_clinic_id::text || ':' || coalesce(v_doctor_id::text, ''));
  perform pg_advisory_xact_lock(v_lock_key);

  -- Release the consultations this doctor left open that do not belong to
  -- today's queue: abandoned (tab closed), auto-promoted to a patient who
  -- was never opened, or started on an earlier day. They must not block
  -- today's queue.
  update public.visits
  set status = 'waiting',
      consultation_started_at = null,
      updated_at = now()
  where clinic_id = p_clinic_id
    and doctor_id is not distinct from v_doctor_id
    and status = 'in_consultation'
    and id != p_visit_id
    and (
      consultation_started_at is null
      or consultation_started_at < v_day_start
      or checked_in_at < v_day_start
    );

  -- Only a live consultation — one whose patient checked in today and which
  -- started today — blocks this doctor.
  if exists (
    select 1 from public.visits
    where clinic_id = p_clinic_id
      and doctor_id is not distinct from v_doctor_id
      and status = 'in_consultation'
      and id != p_visit_id
      and consultation_started_at is not null
      and consultation_started_at >= v_day_start
      and checked_in_at >= v_day_start
  ) then
    raise exception 'Another patient is currently in consultation. Complete that consultation first.';
  end if;

  update public.visits
  set status = 'in_consultation',
      consultation_started_at = now(),
      paused_at = null,
      paused_by_name = null,
      updated_at = now()
  where id = p_visit_id
    and clinic_id = p_clinic_id;

  select * into v_visit
  from public.visits
  where id = p_visit_id
    and clinic_id = p_clinic_id;

  return v_visit;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. complete_and_advance — auto-promotes only a patient who checked in on
--    the CURRENT clinic day. Without the day filter it could promote a
--    patient from weeks earlier, who then sat in `in_consultation` forever
--    if the doctor never opened them.
-- ---------------------------------------------------------------------------
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
  v_day_start timestamptz;
begin
  if not public.is_clinic_member(p_clinic_id) then
    raise exception using errcode = '42501', message = 'NOT_A_CLINIC_MEMBER';
  end if;

  select * into v_current
  from public.visits
  where id = p_visit_id
    and clinic_id = p_clinic_id
    and status = 'in_consultation';

  if not found then
    raise exception 'Visit not found or not currently in consultation.';
  end if;

  v_lock_key := hashtext(p_clinic_id::text || ':' || coalesce(v_current.doctor_id::text, ''));
  perform pg_advisory_xact_lock(v_lock_key);

  update public.visits
  set status = 'completed',
      completed_at = now(),
      updated_at = now()
  where id = p_visit_id
    and clinic_id = p_clinic_id;

  v_day_start := public.clinic_day_start(p_clinic_id);

  select * into v_next
  from public.visits
  where clinic_id = p_clinic_id
    and doctor_id is not distinct from v_current.doctor_id
    and status = 'waiting'
    and paused_at is null
    and checked_in_at >= v_day_start
  order by queue_position asc
  limit 1;

  if found then
    update public.visits
    set status = 'in_consultation',
        consultation_started_at = now(),
        paused_at = null,
        paused_by_name = null,
        updated_at = now()
    where id = v_next.id
      and clinic_id = p_clinic_id;

    select * into v_next
    from public.visits
    where id = v_next.id
      and clinic_id = p_clinic_id;

    return v_next;
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. release_stale_consultations — release every consultation this clinic
--    left open on an earlier day. The app calls it when it loads the queue so
--    the dashboard / TV / Appointments stop showing a phantom "in
--    consultation", and it is available as a manual escape hatch.
-- ---------------------------------------------------------------------------
create or replace function public.release_stale_consultations_for(p_clinic_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day_start timestamptz;
  v_count integer := 0;
begin
  v_day_start := public.clinic_day_start(p_clinic_id);

  update public.visits
  set status = 'waiting',
      consultation_started_at = null,
      updated_at = now()
  where clinic_id = p_clinic_id
    and status = 'in_consultation'
    and (
      consultation_started_at is null
      or consultation_started_at < v_day_start
      or checked_in_at < v_day_start
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.release_stale_consultations_for(uuid) is
  'Internal: releases consultations left in_consultation before the clinic''s current day, returning how many were released (migration 0108).';

-- Member-facing wrapper: a signed-in clinic member may release their own
-- clinic's stale consultations.
create or replace function public.release_stale_consultations(p_clinic_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_clinic_member(p_clinic_id) then
    raise exception using errcode = '42501', message = 'NOT_A_CLINIC_MEMBER';
  end if;

  return public.release_stale_consultations_for(p_clinic_id);
end;
$$;

comment on function public.release_stale_consultations(uuid) is
  'Releases consultations left in_consultation before the clinic''s current day, returning how many were released (migration 0108).';

revoke all on function public.release_stale_consultations(uuid) from public, anon;
grant execute on function public.release_stale_consultations(uuid) to authenticated, service_role;

-- Service-role sweep across every clinic. Used by maintenance scripts and by
-- the admin tooling; the app never calls it directly.
create or replace function public.release_all_stale_consultations()
returns table(clinic_id uuid, released integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select c.id, public.release_stale_consultations_for(c.id)
  from public.clinics c;
end;
$$;

revoke all on function public.release_all_stale_consultations() from public, anon, authenticated;
grant execute on function public.release_all_stale_consultations() to service_role;

notify pgrst, 'reload schema';

-- ROLLBACK
-- ----------------------------------------------------------------------------
-- create or replace function public.start_consultation ... (re-apply 0076)
-- create or replace function public.complete_and_advance ... (re-apply 0076)
-- drop function if exists public.release_all_stale_consultations();
-- drop function if exists public.release_stale_consultations(uuid);
-- drop function if exists public.release_stale_consultations_for(uuid);
-- drop function if exists public.clinic_day_start(uuid);
-- =============================================================================
