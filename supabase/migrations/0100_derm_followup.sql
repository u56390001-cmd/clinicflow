-- =============================================================================
-- MedBook AI — Migration 0100 : Dermatology encounter follow-up
-- Adds optional follow-up scheduling fields to derm_exams so Tab 6 can
-- persist a recommended/recorded follow-up date and notes without faking.
-- =============================================================================

alter table public.derm_exams
  add column if not exists follow_up_date date,
  add column if not exists follow_up_notes text;

notify pgrst, 'reload schema';

-- ROLLBACK
-- ----------------------------------------------------------------------------
-- alter table public.derm_exams drop column if exists follow_up_date;
-- alter table public.derm_exams drop column if exists follow_up_notes;
-- =============================================================================
