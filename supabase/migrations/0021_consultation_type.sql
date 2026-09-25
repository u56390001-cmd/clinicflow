-- =============================================================================
-- MedBook AI — Phase 15 | Migration 0021
-- Consultation type for manual booking (in_clinic / online)
--
-- DESIGN NOTES
-- ------------
-- * `consultation_type` is a DATA FIELD only — no video-call infrastructure.
--   It records how the visit is delivered so staff can plan the day and
--   patients know what to expect. Default `in_clinic` keeps every existing
--   row and every existing booking path unchanged (additive/nullable-style
--   backward compatibility per PRD v1.1 §4).
-- * The atomic booking RPC `book_appointment` gains an optional trailing
--   `p_consultation_type` parameter (default 'in_clinic'). Postgres cannot
--   `create or replace` across differing signatures, so the Phase-10 signature
--   is dropped explicitly first — same pattern as migration 0017. Named-arg
--   callers (supabase-js `.rpc`) are unaffected; omitted param → 'in_clinic'.
-- * No new tables, no policy changes: the column inherits the existing
--   `appointments` RLS wholesale.
-- * All statements are idempotent.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- enum + column
-- ----------------------------------------------------------------------------
do $$
begin
  create type public.consultation_type as enum ('in_clinic', 'online');
exception
  when duplicate_object then null;
end $$;

alter table public.appointments
  add column if not exists consultation_type public.consultation_type
    not null default 'in_clinic'::public.consultation_type;

-- ----------------------------------------------------------------------------
-- book_appointment: extend with optional p_consultation_type
-- ----------------------------------------------------------------------------
drop function if exists public.book_appointment(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text,
  public.appointment_status, uuid
);

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
-- RPC: ensure_walk_in_service — Emergency-Mode fallback service resolution.
-- `services` INSERT is owner/admin-only under RLS (Phase 2), but emergency
-- walk-in bookings are clinical-floor work any member may do. This RPC is the
-- ONLY elevated path: SECURITY DEFINER with a pinned search_path, membership
-- checked internally, and it can exclusively create/find the one fixed
-- placeholder service shape below — no arbitrary service can be written
-- through it. Returns the service id (existing or newly created).
-- ----------------------------------------------------------------------------
create or replace function public.ensure_walk_in_service(
  p_clinic_id uuid
) returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c_walk_in_name      constant text := 'Walk-in consultation';
  c_walk_in_duration  constant integer := 30;
  v_service_id        uuid;
begin
  if not public.is_clinic_member(p_clinic_id) then
    raise exception using errcode = '42501', message = 'NOT_A_CLINIC_MEMBER';
  end if;

  -- Serialize first-use creation per clinic (names are not UNIQUE-constrained).
  perform pg_advisory_xact_lock(hashtextextended('medbook-walkin-' || p_clinic_id::text, 0));

  select s.id into v_service_id
  from public.services s
  where s.clinic_id = p_clinic_id
    and s.name = c_walk_in_name
  order by (s.status = 'active') desc, s.created_at
  limit 1;

  if v_service_id is not null then
    return v_service_id;
  end if;

  insert into public.services (
    clinic_id, name, description, duration_minutes, price, status
  ) values (
    p_clinic_id,
    c_walk_in_name,
    'Auto-created placeholder for emergency/walk-in intake. Edit or replace it once the exact service is known.',
    c_walk_in_duration,
    0,
    'active'::public.service_status
  )
  on conflict do nothing
  returning id into v_service_id;

  -- Concurrent first use lost the race — re-read.
  if v_service_id is null then
    select s.id into v_service_id
    from public.services s
    where s.clinic_id = p_clinic_id and s.name = c_walk_in_name
    order by s.created_at
    limit 1;
  end if;

  return v_service_id;
end;
$$;

-- EXECUTE hardening (same posture as the Phase-9 security hardening): the
-- RPC is for signed-in clinic members only; `anon` must not reach it.
revoke execute on function public.ensure_walk_in_service(uuid) from public, anon;
grant execute on function public.ensure_walk_in_service(uuid) to authenticated;

-- =============================================================================
-- VERIFICATION (manual)
-- -----------------------------------------------------------------------------
-- 1. Existing appointments all read back consultation_type='in_clinic'.
-- 2. Booking via createAppointmentService without the new field still works
--    and stores 'in_clinic' (default).
-- 3. Passing 'online' stores 'online'; any other value is rejected by the enum.
-- 4. Double-booking protection unchanged: overlapping insert still raises
--    SLOT_OVERLAP under both normal and emergency dashboard bookings.
-- 5. ensure_walk_in_service: anon call fails (EXECUTE revoked); a non-member
--    authenticated call raises NOT_A_CLINIC_MEMBER; a member call returns an
--    id and creates exactly one active 'Walk-in consultation' service (30
--    min, price 0); repeated calls return the same id.
-- =============================================================================
