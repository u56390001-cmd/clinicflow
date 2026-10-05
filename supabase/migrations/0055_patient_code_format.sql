-- =============================================================================
-- 0055_patient_code_format.sql
--
-- Patient ID (UHID) format choice for Organization settings.
--
-- 1. `clinics.patient_code_format` — 'sequence' or 'year_sequence'.
-- 2. `assign_patient_code()` redefined to honour that choice.
--
-- Migration 0029 hard-coded `{PREFIX}-{YYYY}-{NNNNN}` and exposed only the
-- prefix. The settings UI now offers two shapes:
--
--   sequence        CLI-00001        one running sequence per clinic
--   year_sequence   CLI-2026-00001   restarts each calendar year (previous
--                                    behaviour, and the default)
--
-- Existing rows default to 'year_sequence' so no clinic's numbering changes
-- unless an owner explicitly picks the other option.
--
-- WHY THE TRIGGER IS REDEFINED RATHER THAN ADDED AROUND
-- The code is assigned by a BEFORE INSERT trigger that reads the clinic's
-- settings at insert time. Storing a format column without teaching the
-- trigger about it would leave the column decorative — the preview in the UI
-- would promise `CLI-00001` while the database kept writing `CLI-2026-00001`.
-- The function body below is otherwise byte-for-byte the 0029 logic.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1. clinics.patient_code_format
-- ----------------------------------------------------------------------------
do $$
begin
  alter table public.clinics
    add column if not exists patient_code_format text not null
      default 'year_sequence';
exception
  when duplicate_column then null;
end $$;

do $$
begin
  alter table public.clinics
    add constraint clinics_patient_code_format_check
    check (patient_code_format in ('sequence', 'year_sequence'));
exception
  when duplicate_object then null;
end $$;

comment on column public.clinics.patient_code_format is
  'UHID shape for new patients: ''sequence'' (PREFIX-NNNNN) or ''year_sequence'' (PREFIX-YYYY-NNNNN). Existing IDs are never rewritten.';

-- ----------------------------------------------------------------------------
-- 2. assign_patient_code() honours the format
--
-- Unchanged from 0029 except for the format branch:
--   * 'year_sequence' matches `PREFIX-YYYY-%` and keeps the year in the code,
--     which is what 0029 did.
--   * 'sequence'     matches `PREFIX-%` so numbering stays monotonic across
--     year boundaries and continues past any IDs minted while the clinic was
--     in 'year_sequence' mode (their trailing digits are still counted).
--
-- The advisory lock, the explicit-code passthrough, the clinic-timezone year
-- and the trailing-digit extraction all stay as they were.
-- ----------------------------------------------------------------------------
create or replace function public.assign_patient_code()
returns trigger
language plpgsql
volatile
security invoker
set search_path = public, auth
as $$
declare
  v_prefix text;
  v_tz     text;
  v_year   int;
  v_seq    int;
  v_format text;
begin
  -- Respect an explicitly supplied code (e.g. data migration from another EMR)
  if new.patient_code is not null and btrim(new.patient_code) <> '' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('medbook-patient-code-' || new.clinic_id::text, 0)
  );

  select c.patient_code_prefix, c.timezone, c.patient_code_format
    into v_prefix, v_tz, v_format
  from public.clinics c
  where c.id = new.clinic_id;

  v_prefix := coalesce(v_prefix, 'CLI');
  v_tz     := coalesce(v_tz, 'UTC');
  -- A clinic predating 0055 has no value here yet; fall back rather than fail.
  v_format := coalesce(v_format, 'year_sequence');
  v_year   := extract(year from (coalesce(new.created_at, now()) at time zone v_tz))::int;

  if v_format = 'sequence' then
    -- Trailing digits of the highest existing code for this clinic + prefix,
    -- regardless of the year segment already embedded in it.
    select coalesce(max(substring(p.patient_code from '([0-9]+)$')::int), 0) + 1
      into v_seq
    from public.patients p
    where p.clinic_id = new.clinic_id
      and p.patient_code like v_prefix || '-%';

    new.patient_code := v_prefix || '-' || lpad(v_seq::text, 5, '0');
  else
    -- Original 0029 behaviour: per clinic, per calendar year.
    select coalesce(max(substring(p.patient_code from '([0-9]+)$')::int), 0) + 1
      into v_seq
    from public.patients p
    where p.clinic_id = new.clinic_id
      and p.patient_code like v_prefix || '-' || v_year::text || '-%';

    new.patient_code := v_prefix || '-' || v_year::text || '-' || lpad(v_seq::text, 5, '0');
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. preview_next_patient_code()
--
-- What the next patient inserted right now would be given, without inserting
-- one. Powers the "Next patient ID will be: CLI-2026-00027" line on the
-- Patient ID settings tab.
--
-- Built as an RPC rather than pulling every matching `patient_code` into the
-- server component so the settings page does not cost O(patients) per render,
-- and so the preview uses the SAME LIKE patterns as the trigger above — the
-- two drifting apart is exactly how a settings screen starts lying to its user.
--
-- SECURITY INVOKER, no `search_path` override beyond public, so the `patients`
-- RLS policies apply: a member sees their own clinic's numbering, and a caller
-- with no access to that clinic's patients sees NULL.
--
-- `p_prefix` and `p_format` are parameters rather than reads of the clinics row
-- because the preview has to reflect the values the owner is typing but has not
-- saved yet.
-- ----------------------------------------------------------------------------
create or replace function public.preview_next_patient_code(
  p_clinic_id uuid,
  p_prefix     text,
  p_format     text
)
returns text
language plpgsql
stable
security invoker
set search_path = public, auth
as $$
declare
  v_tz     text;
  v_year   int;
  v_seq    int;
  v_prefix text;
begin
  -- The year key comes from the clinic's timezone. A clinic whose row is not
  -- readable (no membership / RLS) returns NULL so the caller can fall back,
  -- rather than guessing a year and showing a number that may be wrong.
  select c.timezone
    into v_tz
  from public.clinics c
  where c.id = p_clinic_id;

  v_tz := coalesce(v_tz, 'UTC');

  v_year := extract(year from (now() at time zone v_tz))::int;
  v_prefix := coalesce(p_prefix, 'CLI');

  if p_format = 'sequence' then
    select coalesce(max(substring(p.patient_code from '([0-9]+)$')::int), 0) + 1
      into v_seq
    from public.patients p
    where p.clinic_id = p_clinic_id
      and p.patient_code like v_prefix || '-%';

    return v_prefix || '-' || lpad(v_seq::text, 5, '0');
  end if;

  select coalesce(max(substring(p.patient_code from '([0-9]+)$')::int), 0) + 1
    into v_seq
  from public.patients p
  where p.clinic_id = p_clinic_id
    and p.patient_code like v_prefix || '-' || v_year::text || '-%';

  return v_prefix || '-' || v_year::text || '-' || lpad(v_seq::text, 5, '0');
end;
$$;