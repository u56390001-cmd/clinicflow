-- =============================================================================
-- MedBook AI -- Migration 0119 : Dermatology Tab 1 upgrade (structured risk history)
--
-- Tab 1's "Relevant medical & family history" block is free-text today, which
-- means "does this patient burn every summer / does melanoma run in the
-- family" has to be re-read by a human before every laser or lesion decision.
-- Two structured snapshot columns make that risk machine-readable:
--
--   * sun_exposure_history    -- UV exposure / sunburn behaviour
--   * family_skin_cancer_risk -- hereditary skin-cancer risk markers
--
-- Chip values are stored as the comma-serialized list the workspace already
-- round-trips through `parseList`/`serializeList`, exactly like the profile's
-- other multi-value text columns.
--
-- SAFETY
-- ------
-- * Re-runnable: `add column if not exists` on every column.
-- * Nullable text, no defaults: existing rows and every existing caller keep
--   working unchanged; RLS/grants/triggers already cover the table (0077).
-- =============================================================================

alter table public.derm_profiles
  add column if not exists sun_exposure_history text,
  add column if not exists family_skin_cancer_risk text;
