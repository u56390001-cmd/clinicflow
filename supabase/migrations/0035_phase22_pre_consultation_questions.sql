-- =============================================================================
-- MedBook AI — Phase 22 | Migration 0035
-- Pre-Consultation Questions & Answers
--
-- DESIGN NOTES
-- ------------
-- * `pre_consultation_questions` lets a clinic attach 0–3 short (<100 char)
--   screening questions to a doctor OR a service (a question targets exactly
--   one, enforced by an XOR check + composite FKs, so a row can never leak into
--   another clinic's scope). `timing` ('during_booking' | 'after_booking')
--   decides whether the receptionist asks them inside the booking conversation
--   or through a follow-up message after the appointment is confirmed. A set is
--   persisted as ONE timing (the app always writes a set with a single timing),
--   read back ordered by `display_order`.
-- * REPLACE-WHOLESALE persistence: the profile modal submits a JSON array of
--   active questions; the server action deletes the old set for that scope and
--   re-inserts the submitted rows within the same transaction. One "Update
--   Doctor / Update Service" click is the source of truth (same posture as
--   slot templates). Partial unique indexes keep at most one question per
--   (scope, display_order).
-- * `pre_consultation_answers`: ONE row per (appointment_id, question_id).
--   Composite FKs into appointments + questions (same-clinic integrity)
--   mean even a raw member insert can never span clinics or reference an
--   appointment/question outside the clinic. All writes go through the
--   `record_pre_consultation_answers` RPC which validates ownership, trims and
--   upserts idempotently; because it is SECURITY INVOKER and the tables have
--   member INSERT/UPDATE policies, both a signed-in member and the service-role
--   widget/WhatsApp path can record answers through the same function.
-- * RLS: questions read for every clinic member, write for owner/admin only
--   (mirrors doctor_vitals_config). Answers read for members; INSERT/UPDATE for
--   members (validation is enforced by the composite FKs + RPC), no DELETE.
-- * All statements are idempotent.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- table: pre_consultation_questions (0–3 per doctor XOR service)
-- ----------------------------------------------------------------------------
create table if not exists public.pre_consultation_questions (
  id           uuid        primary key default gen_random_uuid(),
  clinic_id    uuid        not null references public.clinics (id) on delete cascade,
  -- Exactly one target per question (doctor XOR service).
  doctor_id    uuid,
  service_id   uuid,
  -- 'during_booking' -> receptionist asks inside the conversation, before booking.
  -- 'after_booking'  -> sent as a WhatsApp follow-up once the appointment is made.
  timing       text        not null check (timing in ('during_booking', 'after_booking')),
  question_text text       not null check (char_length(btrim(question_text)) between 1 and 100),
  display_order smallint   not null check (display_order between 0 and 2),
  active       boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint pre_consultation_questions_scope_check
    check ((doctor_id is null) <> (service_id is null)),
  -- Same-clinic integrity (mirrors doctor_slot_templates pattern).
  constraint pre_consultation_questions_clinic_doctor_fkey
    foreign key (clinic_id, doctor_id) references public.doctors (clinic_id, id)
    on delete cascade,
  constraint pre_consultation_questions_clinic_service_fkey
    foreign key (clinic_id, service_id) references public.services (clinic_id, id)
    on delete cascade,
  -- Composite unique on (clinic_id, id) so sibling same-clinic FKs can target
  -- the table (same posture as doctors/services/appointments, whose PKs are
  -- composite). Idempotently added below for shells created by an earlier,
  -- partial application of this script.
  constraint pre_consultation_questions_clinic_id_unique
    unique (clinic_id, id)
);

-- Ensure the composite-clinic unique exists even if the table was created by a
-- previous partial run that predated this constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pre_consultation_questions'::regclass
      and conname = 'pre_consultation_questions_clinic_id_unique'
  ) then
    alter table public.pre_consultation_questions
      add constraint pre_consultation_questions_clinic_id_unique unique (clinic_id, id);
  end if;
end $$;

-- At most one question per (scope, order) — nullability makes these partial.
create unique index if not exists pre_consultation_questions_doctor_order_unique
  on public.pre_consultation_questions (clinic_id, doctor_id, display_order)
  where doctor_id is not null;

create unique index if not exists pre_consultation_questions_service_order_unique
  on public.pre_consultation_questions (clinic_id, service_id, display_order)
  where service_id is not null;

-- Lookup for the receptionist / adapter when fetching a scope's active set.
create index if not exists pre_consultation_questions_doctor_active_idx
  on public.pre_consultation_questions (clinic_id, doctor_id, active, timing);

create index if not exists pre_consultation_questions_service_active_idx
  on public.pre_consultation_questions (clinic_id, service_id, active, timing);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'pre_consultation_questions_set_updated_at') then
    create trigger pre_consultation_questions_set_updated_at
      before update on public.pre_consultation_questions
      for each row
      execute function public.handle_updated_at();
  end if;
end $$;

alter table public.pre_consultation_questions enable row level security;

drop policy if exists pre_consultation_questions_select_member on public.pre_consultation_questions;
create policy pre_consultation_questions_select_member
  on public.pre_consultation_questions
  for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists pre_consultation_questions_insert_admin on public.pre_consultation_questions;
create policy pre_consultation_questions_insert_admin
  on public.pre_consultation_questions
  for insert
  to authenticated
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists pre_consultation_questions_update_admin on public.pre_consultation_questions;
create policy pre_consultation_questions_update_admin
  on public.pre_consultation_questions
  for update
  to authenticated
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists pre_consultation_questions_delete_admin on public.pre_consultation_questions;
create policy pre_consultation_questions_delete_admin
  on public.pre_consultation_questions
  for delete
  to authenticated
  using (public.is_clinic_admin(clinic_id));

-- ----------------------------------------------------------------------------
-- table: pre_consultation_answers (one row per appointment × question)
-- ----------------------------------------------------------------------------
create table if not exists public.pre_consultation_answers (
  id             uuid        primary key default gen_random_uuid(),
  clinic_id      uuid        not null references public.clinics (id) on delete cascade,
  appointment_id uuid        not null,
  question_id    uuid        not null,
  answer_text    text        not null check (char_length(btrim(answer_text)) between 1 and 500),
  answered_at    timestamptz not null default now(),
  -- Same-clinic integrity: composite FKs into appointments + questions, so a
  -- row can never point at an appointment/question outside this clinic.
  constraint pre_consultation_answers_clinic_appointment_fkey
    foreign key (clinic_id, appointment_id) references public.appointments (clinic_id, id)
    on delete cascade,
  constraint pre_consultation_answers_clinic_question_fkey
    foreign key (clinic_id, question_id) references public.pre_consultation_questions (clinic_id, id)
    on delete cascade,
  -- A question is asked (and answered) at most once per appointment.
  constraint pre_consultation_answers_appointment_question_unique
    unique (appointment_id, question_id)
);

-- Consultation screen reads answers per appointment.
create index if not exists pre_consultation_answers_appointment_idx
  on public.pre_consultation_answers (clinic_id, appointment_id);

-- Pending-count lookups (after-booking reminder / adapter capture).
create index if not exists pre_consultation_answers_question_idx
  on public.pre_consultation_answers (clinic_id, question_id);

alter table public.pre_consultation_answers enable row level security;

drop policy if exists pre_consultation_answers_select_member on public.pre_consultation_answers;
create policy pre_consultation_answers_select_member
  on public.pre_consultation_answers
  for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists pre_consultation_answers_insert_member on public.pre_consultation_answers;
create policy pre_consultation_answers_insert_member
  on public.pre_consultation_answers
  for insert
  to authenticated
  with check (public.is_clinic_member(clinic_id));

-- Needed so the RPC's upsert (INSERT ... ON CONFLICT DO UPDATE) passes under
-- SECURITY INVOKER for a signed-in member caller.
drop policy if exists pre_consultation_answers_update_member on public.pre_consultation_answers;
create policy pre_consultation_answers_update_member
  on public.pre_consultation_answers
  for update
  to authenticated
  using (public.is_clinic_member(clinic_id))
  with check (public.is_clinic_member(clinic_id));

-- ----------------------------------------------------------------------------
-- record_pre_consultation_answers: validate + upsert one row per question.
-- Unknown/malformed entries are skipped (never failed), so the booking itself
-- can never be blocked by a stray payload row.
-- ----------------------------------------------------------------------------
create or replace function public.record_pre_consultation_answers(
  p_clinic_id      uuid,
  p_appointment_id uuid,
  p_answers        jsonb
) returns void
language plpgsql
volatile
security invoker
set search_path = public, auth
as $$
declare
  v_answer      jsonb;
  v_raw_id      text;
  v_question_id uuid;
  v_text        text;
begin
  if not exists (
    select 1 from public.appointments a
    where a.id = p_appointment_id and a.clinic_id = p_clinic_id
  ) then
    raise exception using errcode = 'P0001', message = 'APPOINTMENT_NOT_FOUND';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    return;
  end if;

  for v_answer in select * from jsonb_array_elements(p_answers)
  loop
    v_raw_id := v_answer->>'question_id';
    v_text   := nullif(btrim(v_answer->>'answer_text'), '');

    -- Skip rows without a well-formed uuid or without an answer text. A raw
    -- string that fails the cast is skipped too, never fatal to the call.
    if v_raw_id is null or v_text is null
       or v_raw_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      continue;
    end if;
    v_question_id := v_raw_id::uuid;

    -- Question must belong to this clinic (skipped silently otherwise).
    if not exists (
      select 1 from public.pre_consultation_questions q
      where q.id = v_question_id and q.clinic_id = p_clinic_id
    ) then
      continue;
    end if;

    v_text := left(v_text, 500);

    insert into public.pre_consultation_answers (
      clinic_id, appointment_id, question_id, answer_text
    ) values (
      p_clinic_id, p_appointment_id, v_question_id, v_text
    )
    on conflict (appointment_id, question_id)
    do update set answer_text = excluded.answer_text, answered_at = now();
  end loop;
end;
$$;

-- =============================================================================
-- VERIFICATION (manual; mirrors Phase 22 pipeline)
-- -----------------------------------------------------------------------------
-- 1. Insert 2 during-booking + 1 after-booking question for a doctor →
--    allowed; a 4th row (display_order 3) or a row scoped to BOTH doctor and
--    service is rejected; a row for another clinic's doctor fails the FK.
-- 2. Service-scoped rows work identically; a doctor-scoped index never
--    collides with a service-scoped one.
-- 3. Deleting a doctor/service cascades its questions away; deleting a
--    question cascades its answers.
-- 4. record_pre_consultation_answers: a valid payload upserts once; re-calling
--    with a changed answer updates the same row (no duplicate); an appointment
--    id from another clinic raises APPOINTMENT_NOT_FOUND; a question id from
--    another clinic is skipped. Non-members cannot SELECT answers.
-- 5. A member can record answers via the RPC; the service-role widget path can
--    record the same (RLS bypass), proving both booking channels work.
-- =============================================================================