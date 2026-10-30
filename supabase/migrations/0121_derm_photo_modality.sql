-- =============================================================================
-- 0121 — Dermatology: photo modality (clinical / dermoscopy / histology)
-- =============================================================================
-- WHY
--   The photos tab only classified captures by timeline position (baseline /
--   follow-up / post-treatment) — never by HOW they were taken. International
--   dermoscopy workflows (DermEngine, Canfield) treat a macro clinical photo,
--   a dermatoscope capture and a pathology slide as different evidence: they
--   get different badges, different zoom behaviour and different comparisons.
--
-- WHAT
--   * derm_photos.image_kind — 'clinical' (macro skin/body photo, the default
--     for every existing row), 'dermoscopy' (magnified dermatoscope capture),
--     'histology' (pathology slide / lab image).
--   * NOT NULL DEFAULT 'clinical': existing tagged photos keep rendering, and
--     the tag form can retro-classify them.
--
-- SAFETY
--   * Re-runnable (`if not exists`).
--   * No table creation, no data migration beyond the column default.
-- =============================================================================

alter table public.derm_photos
  add column if not exists image_kind text not null default 'clinical'
    check (image_kind in ('clinical', 'dermoscopy', 'histology'));

notify pgrst, 'reload schema';

-- ROLLBACK
-- alter table public.derm_photos drop column if exists image_kind;
