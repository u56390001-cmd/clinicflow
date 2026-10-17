-- =============================================================================
-- MedBook AI — Migration 0099 : Dermatology procedures, parameters & biopsy
--
-- Spec: `docs/MedBookAI_Dermatology_Master_Implementation_Prompt.md` §9
--       (In-Office Procedures & Biopsy Tracker).
--
-- `derm_procedures` was a name, a date, a consent flag and a free-text note. It
-- could not record what kind of procedure it was, which lesion it treated, the
-- device/agent parameters used, aftercare, or a biopsy specimen's identity and
-- lab status — the whole point of Tab 5.
--
-- DESIGN
-- ------
-- * `procedure_kind` drives which parameter fields the UI shows; `params` is a
--   flexible key/value bag so a clinic can log device/medication settings (and
--   add custom parameters) without a migration per device. Values are what a
--   clinician typed — this is a logbook, never live machine control.
-- * `lesion_id` links a procedure to a body-map pin (migration 0096).
-- * The specimen columns track a biopsy from collection to pathology report.
--
-- SAFETY
-- ------
-- * Re-runnable, additive only. Same clinic-scoped RLS as migration 0077.
-- =============================================================================

alter table public.derm_procedures
  add column if not exists procedure_kind text;
alter table public.derm_procedures
  add column if not exists lesion_id uuid
    references public.derm_lesions (id) on delete set null;
alter table public.derm_procedures add column if not exists body_site text;
alter table public.derm_procedures
  add column if not exists params jsonb not null default '{}'::jsonb;
alter table public.derm_procedures add column if not exists aftercare text;
alter table public.derm_procedures add column if not exists complications text;
alter table public.derm_procedures add column if not exists specimen_id text;
alter table public.derm_procedures add column if not exists specimen_type text;
alter table public.derm_procedures add column if not exists specimen_lab text;
alter table public.derm_procedures add column if not exists specimen_status text;
alter table public.derm_procedures
  add column if not exists specimen_dispatched_at date;

create index if not exists derm_procedures_lesion_idx
  on public.derm_procedures (lesion_id);

notify pgrst, 'reload schema';

-- ROLLBACK
-- ----------------------------------------------------------------------------
-- alter table public.derm_procedures drop column if exists procedure_kind;
-- alter table public.derm_procedures drop column if exists lesion_id;
-- alter table public.derm_procedures drop column if exists body_site;
-- alter table public.derm_procedures drop column if exists params;
-- alter table public.derm_procedures drop column if exists aftercare;
-- alter table public.derm_procedures drop column if exists complications;
-- alter table public.derm_procedures drop column if exists specimen_id;
-- alter table public.derm_procedures drop column if exists specimen_type;
-- alter table public.derm_procedures drop column if exists specimen_lab;
-- alter table public.derm_procedures drop column if exists specimen_status;
-- alter table public.derm_procedures drop column if exists specimen_dispatched_at;
-- =============================================================================
