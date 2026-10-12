-- =============================================================================
-- MedBook AI — Migration 0076 : consultation draft + queue resume
--
-- Spec: Consultation workspace gets a single "Save Draft" control with two
-- choices —
--   * Save Draft & Continue        → prescription kept, visit stays open
--   * Save Draft & Return to Queue → visit goes back to the waiting queue and
--                                    reads as "Paused · Draft Saved"
-- and reselecting a paused patient restores the draft and resumes the same
-- consultation. Completing a consultation finalizes the prescription and moves
-- the next waiting patient in.
--
-- DESIGN
-- ------
-- * A paused patient is NOT a new visit status. `visit_status` stays the five
--   values the queue, TV display and dashboard already filter on; a pause is
--   `status = 'waiting'` plus a non-null `paused_at`. That keeps every existing
--   `status in ('waiting', ...)` consumer correct without touching it, and the
--   pause is a render-level distinction ("Paused · Draft Saved") rather than a
--   new dimension every query has to learn.
-- * `paused_at` is cleared by `start_consultation`, so the same call both
--   starts a fresh patient and resumes a paused one — there is no separate
--   "resume" transition to keep in sync.
-- * `complete_and_advance` skips paused visits when it auto-promotes the next
--   patient: a doctor who deliberately paused someone is not silently handed
--   them back the moment an unrelated consultation ends.
-- * `prescriptions.status` is the draft/final bit. Default 'final' means every
--   existing row and every caller that does not name it stays valid.
--
-- SAFETY
-- ------
-- * Backward compatible: the new columns are nullable or defaulted.
-- * Idempotent: `if not exists` guards on the type, columns and enum; the RPCs
--   are CREATE OR REPLACE with unchanged signatures.
-- * `start_consultation` is now idempotent — re-starting a visit already in
--   consultation returns it instead of raising. This is what stops a double
--   click (or a stale tab) from surfacing "Another patient is currently in
--   consultation" against the doctor's own active visit.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. prescription_status — draft while the doctor is still writing, final once
--    the consultation is completed.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'prescription_status') then
    create type public.prescription_status as enum ('draft', 'final');
  end if;
end
$$;

alter table public.prescriptions
  add column if not exists status public.prescription_status not null default 'final';

comment on column public.prescriptions.status is
  'draft while the consultation is in progress; final once the visit is completed. Default final (migration 0076).';

-- ---------------------------------------------------------------------------
-- 2. Pause marker on visits (status stays 'waiting').
-- ---------------------------------------------------------------------------
alter table public.visits
  add column if not exists paused_at timestamptz;

alter table public.visits
  add column if not exists paused_by_name text;

comment on column public.visits.paused_at is
  'Set when a doctor returns an in-consultation patient to the waiting queue with a saved draft. Cleared on resume.';

comment on column public.visits.paused_by_name is
  'Display name of the clinician who paused the visit, snapshotted for the queue label.';

-- ---------------------------------------------------------------------------
-- 3. start_consultation — idempotent, and clears any pause marker on (re)start.
--    Membership gate kept from 0065; advisory-lock rule kept from 0040.
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

  if v_visit.status <> 'waiting' then
    raise exception 'Visit not found or not eligible for consultation.';
  end if;

  v_doctor_id := v_visit.doctor_id;

  v_lock_key := hashtext(p_clinic_id::text || ':' || coalesce(v_doctor_id::text, ''));
  perform pg_advisory_xact_lock(v_lock_key);

  if exists (
    select 1 from public.visits
    where clinic_id = p_clinic_id
      and doctor_id is not distinct from v_doctor_id
      and status = 'in_consultation'
      and id != p_visit_id
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
-- 4. pause_consultation — park an in-consultation visit back on the queue.
--    The draft prescription is saved by the app BEFORE this runs, so pausing
--    never discards anything the doctor wrote.
-- ---------------------------------------------------------------------------
create or replace function public.pause_consultation(
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
  v_name text;
  v_lock_key bigint;
begin
  if not public.is_clinic_member(p_clinic_id) then
    raise exception using errcode = '42501', message = 'NOT_A_CLINIC_MEMBER';
  end if;

  select * into v_visit
  from public.visits
  where id = p_visit_id
    and clinic_id = p_clinic_id
    and status = 'in_consultation';

  if not found then
    raise exception 'Visit not found or not currently in consultation.';
  end if;

  v_lock_key := hashtext(p_clinic_id::text || ':' || coalesce(v_visit.doctor_id::text, ''));
  perform pg_advisory_xact_lock(v_lock_key);

  v_name := coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    auth.jwt() ->> 'email'
  );

  update public.visits
  set status = 'waiting',
      paused_at = now(),
      paused_by_name = v_name,
      consultation_started_at = null,
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
-- 5. complete_and_advance — as 0065, but never auto-promotes a paused visit.
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

  select * into v_next
  from public.visits
  where clinic_id = p_clinic_id
    and doctor_id is not distinct from v_current.doctor_id
    and status = 'waiting'
    and paused_at is null
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

notify pgrst, 'reload schema';

-- ROLLBACK
-- ----------------------------------------------------------------------------
-- create or replace function public.start_consultation ... (re-apply 0065)
-- create or replace function public.complete_and_advance ... (re-apply 0065)
-- drop function if exists public.pause_consultation(uuid, uuid);
-- alter table public.visits drop column if exists paused_by_name;
-- alter table public.visits drop column if exists paused_at;
-- alter table public.prescriptions drop column if exists status;
-- drop type if exists public.prescription_status;
-- =============================================================================
