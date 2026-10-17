-- =============================================================================
-- MedBook AI — Migration 0095 : Dermatology Tab 1 (Clinical Overview & History)
--
-- Spec: `docs/MedBookAI_Dermatology_Master_Implementation_Prompt.md` §5 and the
-- source workflow `docs/derma ehr consultation.txt` (Tab 1).
--
-- Tab 1 needs two kinds of history that migration 0077 did not model:
--
--   * Patient-level dermatology history that belongs on the skin-profile
--     snapshot: Fitzpatrick skin type (lass/peel safety), drug allergies,
--     topical/contact allergies, the current oral and topical/skincare regimen,
--     and relevant systemic / family history. `derm_profiles` is unique per
--     patient, so these are plain snapshot columns like the existing ones.
--
--   * Encounter-level "today's complaint" captured with quick chips: HPI
--     duration, severity, dermatology triggers and associated symptoms, plus a
--     free-text HPI. These belong to a single consultation, which the app already
--     models as one `derm_exams` row per visit, so they extend that event table.
--
-- DESIGN
-- ------
-- * Snapshot vs event: `derm_profiles` keeps the one-per-patient history;
--   `derm_exams` keeps the per-consultation complaint. This matches the 0077
--   split (unique snapshot vs append/dated event) — no new tables, no JSON blob.
-- * Descriptive text stays text (comma/paragraph), chip fields stay text[] on the
--   event table, exactly like the existing `chief_complaints` / `morphology`.
-- * Every new column is nullable or defaulted, so existing rows and every
--   existing caller keep working.
--
-- SAFETY
-- ------
-- * Re-runnable: `add column if not exists` on every column.
-- * RLS/grants/updated_at triggers already cover both tables from 0077; only
--   columns are added here.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Dermatology skin profile — structured history (one row per patient).
-- ---------------------------------------------------------------------------
alter table public.derm_profiles
  add column if not exists fitzpatrick_type text,
  add column if not exists drug_allergies text,
  add column if not exists topical_allergies text,
  add column if not exists current_orals text,
  add column if not exists current_topicals text,
  add column if not exists relevant_systemic_history text,
  add column if not exists family_history text;

-- Fitzpatrick I–VI only (kept as the display string so the picker round-trips).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'derm_profiles_fitzpatrick_type_check'
  ) then
    alter table public.derm_profiles
      add constraint derm_profiles_fitzpatrick_type_check
      check (
        fitzpatrick_type is null
        or fitzpatrick_type in ('Type I', 'Type II', 'Type III', 'Type IV', 'Type V', 'Type VI')
      );
  end if;
end
$$;

comment on column public.derm_profiles.fitzpatrick_type is
  'Fitzpatrick skin type I–VI, stored as the display string ("Type III").';
comment on column public.derm_profiles.drug_allergies is
  'Systemic drug allergies (e.g. Penicillin, Sulfa). Drives the high-alert banner.';
comment on column public.derm_profiles.topical_allergies is
  'Topical/contact sensitivities (fragrances, parabens, retinoids, contact allergens).';
comment on column public.derm_profiles.current_orals is
  'Active oral medications: isotretinoin, antibiotics, hormonal therapy, …';
comment on column public.derm_profiles.current_topicals is
  'Current topical/skincare regimen: retinoids, steroids, sunscreen, serums, …';
comment on column public.derm_profiles.relevant_systemic_history is
  'Relevant systemic history, e.g. PCOS for hormonal acne or thyroid for alopecia.';
comment on column public.derm_profiles.family_history is
  'Family history, e.g. skin cancer/melanoma or autoimmune skin disease.';

-- ---------------------------------------------------------------------------
-- 2. Dermatology examination — encounter complaint + HPI (one row per visit).
-- ---------------------------------------------------------------------------
alter table public.derm_exams
  add column if not exists duration text,
  add column if not exists severity text,
  add column if not exists triggers text[] not null default '{}',
  add column if not exists associated_symptoms text[] not null default '{}',
  add column if not exists hpi text;

-- Severity is a three-point index only (mirrors the source workflow chips).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'derm_exams_severity_check'
  ) then
    alter table public.derm_exams
      add constraint derm_exams_severity_check
      check (severity is null or severity in ('Mild', 'Moderate', 'Severe'));
  end if;
end
$$;

comment on column public.derm_exams.duration is
  'How long the presenting complaint has been present (free text, e.g. "3 weeks").';
comment on column public.derm_exams.severity is
  'Severity index: Mild, Moderate or Severe.';
comment on column public.derm_exams.triggers is
  'Dermatology-specific triggers: sun exposure, new skincare, stress, diet, seasonal.';
comment on column public.derm_exams.associated_symptoms is
  'Associated symptoms: itch/pruritus, pain, bleeding, scaling, burning, …';
comment on column public.derm_exams.hpi is
  'History of present illness free-text note for this encounter.';

notify pgrst, 'reload schema';

-- ROLLBACK
-- ----------------------------------------------------------------------------
-- alter table public.derm_exams
--   drop column if exists duration,
--   drop column if exists severity,
--   drop column if exists triggers,
--   drop column if exists associated_symptoms,
--   drop column if exists hpi;
-- alter table public.derm_profiles
--   drop column if exists fitzpatrick_type,
--   drop column if exists drug_allergies,
--   drop column if exists topical_allergies,
--   drop column if exists current_orals,
--   drop column if exists current_topicals,
--   drop column if exists relevant_systemic_history,
--   drop column if exists family_history;
-- =============================================================================
