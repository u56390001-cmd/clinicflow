-- 0079_psych_workspace_structured_fields.sql
-- Structured clinical inputs for the Psychology workspace.
--
-- The 0077 tables store almost everything as free text. The workspace now
-- leads with selection (chips / dropdowns / checklists) and asks for prose
-- only where judgement is required, so two fields need a home and the
-- psychometrics library needs to grow beyond PHQ-9 / GAD-7.
--
-- Additive only: no column is dropped or retyped; the two check constraints
-- are widened in place so existing rows stay valid.

-- Safety screening checklist (selected risk factors, comma-joined).
alter table public.psych_safety
  add column if not exists risk_factors text;

-- Session kind, so a crisis contact reads differently from a routine follow-up.
alter table public.psych_sessions
  add column if not exists session_type text not null default 'individual'
    check (session_type in ('initial', 'individual', 'follow_up', 'crisis', 'group'));

-- Widen the instrument library and its score ceiling. BDI-II / PCL-5 / BAI /
-- OCI-R all score past 30, so the old 0-30 cap rejected valid administrations.
alter table public.psych_assessments
  drop constraint if exists psych_assessments_assessment_type_check;

alter table public.psych_assessments
  add constraint psych_assessments_assessment_type_check
    check (assessment_type in (
      'PHQ-9', 'GAD-7', 'BAI', 'BDI-II', 'PCL-5', 'OCI-R', 'AUDIT', 'ASRS', 'Other'
    ));

alter table public.psych_assessments
  drop constraint if exists psych_assessments_score_check;

alter table public.psych_assessments
  add constraint psych_assessments_score_check
    check (score is null or (score >= 0 and score <= 150));
