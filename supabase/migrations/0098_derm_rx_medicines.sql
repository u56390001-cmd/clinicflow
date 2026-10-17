-- =============================================================================
-- MedBook AI — Migration 0098 : Dermatology prescription medicines & labs
--
-- Spec: `docs/MedBookAI_Dermatology_Master_Implementation_Prompt.md` §8
--       (Treatment Plan & Prescriptions).
--
-- `derm_prescriptions` only carried a topical form + skincare routine text, so a
-- dermatology visit could not record the actual medicines and investigations it
-- prescribed. This adds the same jsonb shapes the General Physician prescription
-- already uses, so the Derm tab reuses that UI (`MedicineEntry`, `LabOrderEntry`)
-- and stays readable if the two ever need to converge.
--
--   * `medicines`  — array of `MedicineEntry` (name, route, form, frequency,
--                    duration, unit, instructions).
--   * `lab_orders` — array of `LabOrder` ({ test_name, notes, sub_parameters? }).
--
-- SAFETY
-- ------
-- * Additive and re-runnable. Defaults are empty arrays, so existing rows read
--   back as "no medicines recorded" rather than null.
-- =============================================================================

alter table public.derm_prescriptions
  add column if not exists medicines jsonb not null default '[]'::jsonb;

alter table public.derm_prescriptions
  add column if not exists lab_orders jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';

-- ROLLBACK
-- ----------------------------------------------------------------------------
-- alter table public.derm_prescriptions drop column if exists medicines;
-- alter table public.derm_prescriptions drop column if exists lab_orders;
-- =============================================================================
