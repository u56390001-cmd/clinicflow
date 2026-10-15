-- ============================================================================
-- 0088 — Patient structured address + allow 'unknown' gender.
--
-- Spec: docs/phase_2_prompt.md (patient demographics).
--
-- This migration is ADDITIVE and reuses the existing `patients` table rather
-- than creating a parallel schema:
--
--   * `patients.address` — a structured mailing address stored as JSONB
--     (`{ line1, line2, city, state, postalCode, country }`). Defaults to an
--     empty object so every existing row is valid and quick-create paths that
--     never collect an address keep working unchanged. The legacy `city`
--     column (0027) is retained and continues to hold the city for the booking
--     quick-create flow and the `patient_directory` view; the address object
--     carries its own `city` copy for a complete structured address.
--
--   * `patients_gender_check` (0027) is relaxed to also accept 'unknown', so
--     the front desk can register a patient whose sex is not recorded instead
--     of leaving the field blank or guessing.
--
-- Re-runnable: IF NOT EXISTS guards and DROP ... IF EXISTS before re-adding.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. patients.address — structured address as JSONB
-- ----------------------------------------------------------------------------
alter table public.patients
  add column if not exists address jsonb not null default '{}'::jsonb;

-- The column is an object, never an array/scalar, and stays small. The app
-- validates the individual keys and their lengths; this is defense in depth
-- against a hand-crafted payload and against unbounded bloat.
alter table public.patients
  drop constraint if exists patients_address_object_check;
alter table public.patients
  add constraint patients_address_object_check
    check (jsonb_typeof(address) = 'object' and pg_column_size(address) <= 4096);

-- ----------------------------------------------------------------------------
-- 2. patients.gender — accept 'unknown'
-- ----------------------------------------------------------------------------
alter table public.patients
  drop constraint if exists patients_gender_check;
alter table public.patients
  add constraint patients_gender_check
    check (gender is null or gender in ('male', 'female', 'other', 'unknown'));
