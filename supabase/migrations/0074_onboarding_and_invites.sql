-- ============================================================================
-- 0074 — Fast-track onboarding + staff invites
--
-- Purely additive and idempotent. It captures the two extra onboarding facts
-- (organization shape) and lets an invitation carry a per-member permission
-- payload. Deliberately does NOT touch the existing invite model or its RLS:
--
--   * `clinic_invites` already exists (migration 0011) with a secure
--     SHA-256 `token_hash` model and admin-only policies built on
--     `is_clinic_admin`. We only ADD a column.
--   * No `get_user_clinic_ids()` helper is introduced — the existing
--     `is_clinic_admin` / `is_clinic_member` helpers already fence invites, so
--     re-creating them here would be a regression risk with no upside.
--   * `clinics` gains three columns, all defaulted so pre-existing rows and
--     inserts that omit them keep working unchanged.
-- ============================================================================

-- Organization shape collected during the onboarding wizard.
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS organization_type varchar(50) NOT NULL DEFAULT 'clinic';
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS facility_size varchar(50) NOT NULL DEFAULT 'single_location';
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS parent_organization_id uuid
    REFERENCES public.clinics(id) ON DELETE SET NULL;

-- CHECK constraints are added idempotently (ADD COLUMN IF NOT EXISTS cannot
-- attach a named check in one statement on every Postgres version).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinics_organization_type_check'
  ) THEN
    ALTER TABLE public.clinics
      ADD CONSTRAINT clinics_organization_type_check
      CHECK (organization_type IN ('clinic', 'polyclinic', 'hospital'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinics_facility_size_check'
  ) THEN
    ALTER TABLE public.clinics
      ADD CONSTRAINT clinics_facility_size_check
      CHECK (facility_size IN ('single_location', 'multi_branch'));
  END IF;
END $$;

-- Invite-scoped RBAC overrides `{ "<permission>": boolean }`. An empty object
-- means "inherit the role defaults" (lib/auth/rbac-config.ts) — which is what
-- every invite wrote before this column existed, so the default is exact.
ALTER TABLE public.clinic_invites
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.clinics.organization_type IS
  'Organization kind captured during onboarding: clinic | polyclinic | hospital.';
COMMENT ON COLUMN public.clinics.facility_size IS
  'Footprint captured during onboarding: single_location | multi_branch.';
COMMENT ON COLUMN public.clinics.parent_organization_id IS
  'Optional parent clinic for multi-branch organizations.';
COMMENT ON COLUMN public.clinic_invites.permissions IS
  'Per-member RBAC overrides granted on accept; empty = inherit role defaults.';

NOTIFY pgrst, 'reload schema';
