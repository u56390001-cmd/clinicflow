-- ============================================================================
-- 0086 — Widen psych_assessments.assessment_type to match template names
--
-- 0085 broadened `psych_assessments.assessment_type` to free text (1..80) so
-- clinic Assessment Library template names could be recorded. Template names
-- are themselves capped at 120 chars (0085), so a long clinician-defined name
-- could be saved on the template yet violate the 80-char check when the row
-- lands on a `psych_assessments` recording (manual or patient_online). Widen
-- the check to the template's own ceiling so both stay consistent.
--
-- Re-runnable: DROP IF EXISTS before CREATE CONSTRAINT.
-- ============================================================================

alter table public.psych_assessments
  drop constraint if exists psych_assessments_assessment_type_check;

alter table public.psych_assessments
  add constraint psych_assessments_assessment_type_check
    check (length(btrim(assessment_type)) between 1 and 120);

notify pgrst, 'reload schema';

-- ROLLBACK
-- alter table public.psych_assessments
--   drop constraint if exists psych_assessments_assessment_type_check;
-- alter table public.psych_assessments
--   add constraint psych_assessments_assessment_type_check
--     check (length(btrim(assessment_type)) between 1 and 80);