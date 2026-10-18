-- =============================================================================
-- MedBook AI — Migration 0104 : Dermatology encounter linkage (visit_id)
--
-- Gap #5 of the dermatology roadmap; spec `docs/MedBookAI_Dermatology_Master_
-- Implementation_Prompt.md` §629 ("save the finalized prescription to the
-- correct encounter") and §11 (encounter persistence — every visit saved
-- separately, historical encounters stay associated with their original visit).
--
-- PROBLEM
-- -------
-- The GP prescription is encounter-linked (`prescriptions.visit_id NOT NULL`
-- → `visits`, migration 0024), but every dermatology artifact was
-- encounter-orphaned: `derm_prescriptions` has carried a nullable `visit_id`
-- since migration 0077 that no code path ever wrote, and `derm_exams`,
-- `derm_procedures`, `derm_photos`, `derm_lesions` and `derm_diagnoses` had no
-- visit column at all. There was no way to answer "what did this visit
-- produce?" per patient.
--
-- DESIGN
-- ------
-- * Additive, re-runnable. Columns are nullable with `on delete set null`:
--   records written outside an active visit (record browsing, historical
--   imports) keep `visit_id null`, and deleting a visit never deletes the
--   clinical record it produced.
-- * The application stamps `visit_id` on INSERT only (server actions in
--   `lib/actions/specialty-workspaces.ts` resolve the id against
--   clinic + patient before writing). Updates never move a row between
--   encounters — an old exam re-saved today must not re-home to today's
--   visit. No backfill is possible for rows that predate this migration;
--   they stay null, which is honest.
-- * Plain FK to `visits (id)`, matching the `derm_prescriptions_visit_id_fkey`
--   precedent from migration 0077; tenant safety is enforced app-side by the
--   same resolver (it only returns ids owned by the caller's clinic+patient).
-- * RLS: unchanged — no new tables, all five already follow the migration 0077
--   clinic-member pattern, and the new column carries no separate policy.
--
-- Rollback: drop the columns and indexes (derm_prescriptions' column was
-- pre-existing and is left in place).
-- =============================================================================

alter table public.derm_exams
  add column if not exists visit_id uuid references public.visits (id) on delete set null;

alter table public.derm_procedures
  add column if not exists visit_id uuid references public.visits (id) on delete set null;

alter table public.derm_photos
  add column if not exists visit_id uuid references public.visits (id) on delete set null;

alter table public.derm_lesions
  add column if not exists visit_id uuid references public.visits (id) on delete set null;

alter table public.derm_diagnoses
  add column if not exists visit_id uuid references public.visits (id) on delete set null;

-- Per-patient encounter lookup: "everything this visit produced" stays a
-- covered index scan instead of a patient-wide sort.
create index if not exists derm_exams_visit_idx
  on public.derm_exams (clinic_id, patient_id, visit_id)
  where visit_id is not null;

create index if not exists derm_procedures_visit_idx
  on public.derm_procedures (clinic_id, patient_id, visit_id)
  where visit_id is not null;

create index if not exists derm_photos_visit_idx
  on public.derm_photos (clinic_id, patient_id, visit_id)
  where visit_id is not null;

create index if not exists derm_lesions_visit_idx
  on public.derm_lesions (clinic_id, patient_id, visit_id)
  where visit_id is not null;

create index if not exists derm_diagnoses_visit_idx
  on public.derm_diagnoses (clinic_id, patient_id, visit_id)
  where visit_id is not null;

-- The column existed since 0077 without an index; now that writes reach it,
-- the same per-encounter lookup applies.
create index if not exists derm_prescriptions_visit_idx
  on public.derm_prescriptions (clinic_id, patient_id, visit_id)
  where visit_id is not null;

notify pgrst, 'reload schema';

-- ROLLBACK
-- ----------------------------------------------------------------------------
-- drop index if exists public.derm_prescriptions_visit_idx;
-- drop index if exists public.derm_diagnoses_visit_idx;
-- drop index if exists public.derm_lesions_visit_idx;
-- drop index if exists public.derm_photos_visit_idx;
-- drop index if exists public.derm_procedures_visit_idx;
-- drop index if exists public.derm_exams_visit_idx;
-- alter table public.derm_diagnoses drop column if exists visit_id;
-- alter table public.derm_lesions drop column if exists visit_id;
-- alter table public.derm_photos drop column if exists visit_id;
-- alter table public.derm_procedures drop column if exists visit_id;
-- alter table public.derm_exams drop column if exists visit_id;
-- =============================================================================
