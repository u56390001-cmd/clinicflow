-- ============================================================================
-- 0093 — Psychology OPD: multi-rater assessment tools (Phase 7)
--
-- The Phase 1 engine (0087) records *how* an assessment was administered with a
-- coarse `administration_mode` (SELF_REPORT / CLINICIAN_ENTERED / PROXY). That is
-- not enough for multi-informant measures, where the same instrument is filled
-- by different respondents and the clinician compares them (parent vs teacher
-- vs self — the core workflow for child ADHD/autism and family cases).
--
-- This migration adds an explicit respondent identity to the two ends of the
-- assessment lifecycle:
--
--   1. `psych_assessments.rater_type` + `rater_name` — who actually answered.
--      `administration_mode` is derived from `rater_type` on write (SELF →
--      SELF_REPORT, CLINICIAN → CLINICIAN_ENTERED, anything else → PROXY), so
--      the existing safety/scoring pipeline keeps working unchanged.
--
--   2. `patient_share_links.rater_type` — the respondent a remote invite is
--      intended for, so a link sent to a parent lands on the assessment as a
--      PARENT report rather than defaulting to the patient's self-report.
--
-- Existing rows are valid: `rater_type` defaults to 'SELF' and is backfilled
-- from `administration_mode`, and `rater_name` stays null.
--
-- Re-runnable: IF NOT EXISTS guards and conditional backfill.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. psych_assessments — respondent identity
-- ----------------------------------------------------------------------------
alter table public.psych_assessments
  add column if not exists rater_type text not null default 'SELF'
    check (rater_type in (
      'SELF', 'PARENT', 'TEACHER', 'CLINICIAN', 'PARTNER', 'CAREGIVER', 'OTHER'
    ));

alter table public.psych_assessments
  add column if not exists rater_name text;

-- Backfill the coarse administration_mode into an explicit respondent. Only
-- rows still sitting on the column default are touched, so a re-run never
-- overwrites a clinician's explicit choice.
update public.psych_assessments
  set rater_type = case administration_mode
    when 'SELF_REPORT'       then 'SELF'
    when 'CLINICIAN_ENTERED' then 'CLINICIAN'
    else 'OTHER'
  end
  where rater_type = 'SELF'
    and administration_mode <> 'SELF_REPORT';

-- Cross-rater comparison: latest administration of one instrument per rater.
create index if not exists psych_assessments_rater_idx
  on public.psych_assessments (clinic_id, patient_id, assessment_type, rater_type, conducted_at desc);

comment on column public.psych_assessments.rater_type is
  'Respondent who answered the measure (multi-rater tools). administration_mode is derived from this on write.';
comment on column public.psych_assessments.rater_name is
  'Optional free-text name of the respondent (e.g. the parent/teacher), when rater_type is not SELF/CLINICIAN.';

-- ----------------------------------------------------------------------------
-- 2. patient_share_links — respondent an invite is intended for
-- ----------------------------------------------------------------------------
alter table public.patient_share_links
  add column if not exists rater_type text not null default 'SELF'
    check (rater_type in (
      'SELF', 'PARENT', 'TEACHER', 'CLINICIAN', 'PARTNER', 'CAREGIVER', 'OTHER'
    ));

comment on column public.patient_share_links.rater_type is
  'Respondent the invite is meant for; copied onto the resulting psych_assessment so remote multi-rater links are attributed correctly.';

notify pgrst, 'reload schema';

-- ROLLBACK
-- ----------------------------------------------------------------------------
-- alter table public.patient_share_links drop column if exists rater_type;
-- drop index if exists public.psych_assessments_rater_idx;
-- alter table public.psych_assessments
--   drop column if exists rater_name,
--   drop column if exists rater_type;
