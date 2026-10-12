-- 0084_psych_session_notes_ux.sql
-- Session Notes tab support for the Psychology workspace: the SOAP note
-- format, a draft -> approved workflow with provenance stamps, the recorded
-- session's transcript and metadata, and a doctor-name snapshot on the note.
--
-- Additive only. The one widening change (format check) is recreated in place
-- so every existing BIRP / DAP row stays valid; existing rows are backfilled
-- to 'approved' because they predate the draft workflow.

-- 1. Widen the note-format check to accept SOAP next to BIRP and DAP. The
--    original constraint was unnamed, so Postgres auto-named it.
alter table public.psych_sessions
  drop constraint if exists psych_sessions_format_check;

alter table public.psych_sessions
  add constraint psych_sessions_format_check
    check (format in ('BIRP', 'SOAP', 'DAP'));

-- 2. SOAP uses two new free-text sections (additive columns).
alter table public.psych_sessions
  add column if not exists subjective text;

alter table public.psych_sessions
  add column if not exists objective text;

-- 3. Working copy of the recorded session: the raw transcript, an optional
--    AI/psychologist summary, and the recording length in seconds.
alter table public.psych_sessions
  add column if not exists transcript text;

alter table public.psych_sessions
  add column if not exists session_summary text;

alter table public.psych_sessions
  add column if not exists duration_seconds integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'psych_sessions_duration_seconds_check'
      and conrelid = 'public.psych_sessions'::regclass
  ) then
    alter table public.psych_sessions
      add constraint psych_sessions_duration_seconds_check
        check (duration_seconds is null or duration_seconds >= 0);
  end if;
end $$;

-- 4. Approval workflow. Every note starts as a draft; approving stamps who
--    pushed it into the permanent record and when.
alter table public.psych_sessions
  add column if not exists status text not null default 'draft';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'psych_sessions_status_check'
      and conrelid = 'public.psych_sessions'::regclass
  ) then
    alter table public.psych_sessions
      add constraint psych_sessions_status_check
        check (status in ('draft', 'approved'));
  end if;
end $$;

-- Rows predate the workflow; the psychologist who wrote them already signed
-- the clinic's copy of the record, so treat them as approved.
update public.psych_sessions
  set status = 'approved'
  where status = 'draft';

-- 5. Clinician provenance on the note itself. doctor_name mirrors the writing
--    user's display name at save time (doctor_id points at the profile);
--    approved_by / approved_at stamp the approval transition.
alter table public.psych_sessions
  add column if not exists doctor_name text;

alter table public.psych_sessions
  add column if not exists approved_by text;

alter table public.psych_sessions
  add column if not exists approved_at timestamptz;

comment on column public.psych_sessions.format is 'Progress-note format: Behavior/Intervention/Response/Plan, or SOAP, or Data/Assessment/Plan.';
comment on column public.psych_sessions.status is 'draft while the psychologist is editing; approved once it is in the permanent record.';
comment on column public.psych_sessions.transcript is 'Working transcription of the recorded session before it is distilled into the note sections.';
comment on column public.psych_sessions.session_summary is 'Optional short summary of the session (AI-generated, psychologist-approved).';
comment on column public.psych_sessions.duration_seconds is 'Length of the source recording in seconds, when the note began from one.';
comment on column public.psych_sessions.doctor_name is 'Display name of the clinician who last wrote the note (snapshot of the user).';
comment on column public.psych_sessions.approved_by is 'Who approved the note (display name snapshot).';
comment on column public.psych_sessions.approved_at is 'When the note moved from draft to approved.';