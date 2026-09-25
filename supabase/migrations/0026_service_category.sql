-- =============================================================================
-- MedBook AI — Migration 0026
-- Add `category` column to services to distinguish Consultations from
-- Service/Diagnostic bookings (the Consultations | Services toggle).
--
-- Default is 'consultation' so every existing row keeps working. New rows
-- created via the Services page or AI booking will set the correct value.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- enum: service_category (text with CHECK constraint, not a real enum, for
-- flexibility — clinics may add subcategories later)
-- ----------------------------------------------------------------------------
do $$
begin
  alter table public.services
    add column category text not null default 'consultation'
    check (category in ('consultation', 'service'));
exception
  when duplicate_column then null;
end $$;

-- ----------------------------------------------------------------------------
-- RLS: no changes needed — the existing policies already gate on clinic
-- membership and admin role, which covers the new column.
-- ----------------------------------------------------------------------------
