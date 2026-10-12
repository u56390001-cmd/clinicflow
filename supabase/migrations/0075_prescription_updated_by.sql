-- =============================================================================
-- MedBook AI — Migration 0075 : who last edited a prescription
--
-- Spec: Patient Workspace → Prescriptions tab action buttons (View / Print /
-- Edit). An edited prescription keeps an update trail: the card shows
-- "Last updated: <date/time> · Updated by: Dr <name>" and every edit is also
-- appended to the immutable `audit_logs` table (0072). Nothing here replaces
-- the audit log — this column is the cheap, always-visible stamp the card
-- renders without a second query.
--
-- SAFETY
-- ------
-- * Backward compatible: both columns are nullable, so every existing row and
--   every INSERT that does not name them stays valid.
-- * `updated_by` is nullable on purpose: `doctor_management` rows and the
--   audit trail both link to auth users, but a prescription can be seeded by a
--   service/import path that has no actor, and we must not invent one.
-- * `updated_by_name` is a snapshot, not a join: the card must keep reading the
--   same doctor name even if that member is later removed or renamed.
-- * Idempotent: `add column if not exists`, so re-running on a partially
--   applied database is a no-op.
-- =============================================================================

alter table public.prescriptions
  add column if not exists updated_by uuid
    references auth.users (id) on delete set null;

alter table public.prescriptions
  add column if not exists updated_by_name text;

comment on column public.prescriptions.updated_by is
  'auth.users id of the clinician who last saved this prescription. Null for rows never edited (or written before 0075).';

comment on column public.prescriptions.updated_by_name is
  'Display name of the last editor, snapshotted at save time so the card never depends on a live join.';

notify pgrst, 'reload schema';

-- ROLLBACK
-- ----------------------------------------------------------------------------
-- alter table public.prescriptions drop column if exists updated_by_name;
-- alter table public.prescriptions drop column if exists updated_by;
-- =============================================================================
