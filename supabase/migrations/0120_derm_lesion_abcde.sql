-- =============================================================================
-- MedBook AI -- Migration 0120 : Dermatology per-lesion ABCDE mole screening
--
-- The ABCDE melanoma checklist used to be a whole-exam checkbox set on
-- `derm_exams.severity_scores`. A mole-screening checklist is about ONE lesion,
-- not the encounter, so it belongs on the pin: this adds a structured JSONB
-- column to `derm_lesions` ({asymmetry, border, colour, diameter, evolution}),
-- letting the lesion editor attach the checklist to the selected pin and raise
-- a "biopsy advised" flag when >= 3 criteria are present.
--
-- SAFETY
-- ------
-- * Re-runnable: `add column if not exists`.
-- * Nullable JSONB, no default: existing pins and every existing caller keep
--   working; RLS/grants/triggers already cover the table (0077).
-- =============================================================================

alter table public.derm_lesions
  add column if not exists abcde jsonb;
