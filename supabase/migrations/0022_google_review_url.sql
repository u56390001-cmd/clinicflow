-- =============================================================================
-- MedBook AI — Phase 16 | Migration 0022
-- Google review link for the QR engagement tool
--
-- DESIGN NOTES
-- ------------
-- * Single column on the existing `clinics` table — the general clinic
--   settings table already holds this class of simple marketing/contact data
--   (phone, email, address). No new table, no new RLS work: the column is
--   covered by the existing `clinics` policies (owner/admin write).
-- * Stored verbatim (clinics may use shortened/redirect links); format and
--   length are validated app-side. A defensive CHECK caps storage size only.
-- * Idempotent.
-- =============================================================================

alter table public.clinics
  add column if not exists google_review_url text
    check (google_review_url is null or char_length(btrim(google_review_url)) between 1 and 2048);

-- =============================================================================
-- VERIFICATION (manual)
-- -----------------------------------------------------------------------------
-- 1. Existing clinic rows read back google_review_url = NULL.
-- 2. Owner/admin can set and clear it through Clinic Settings.
-- 3. Staff cannot write it (existing clinics UPDATE policy is owner/admin).
-- =============================================================================
