-- Migration: Structured medical history — provenance + verification + clinical course
-- Extends the 0045 medical_history table so entries can track who recorded them
-- (doctor / receptionist / AI OCR / patient intake), whether a clinician has
-- approved them, and their clinical course (active / resolved / chronic).
-- Also widens the category set with hospitalization + immunization so every
-- free-text past-history field has a structured home.
--
-- IF NOT EXISTS / DROP ... IF EXISTS keeps this file re-runnable, since
-- migrations here are applied by hand rather than via `supabase db push`.

-- 1. Widen category: add hospitalization + immunization to the existing CHECK.
ALTER TABLE medical_history
  DROP CONSTRAINT IF EXISTS medical_history_category_check;

ALTER TABLE medical_history
  ADD CONSTRAINT medical_history_category_check
  CHECK (category IN (
    'surgical', 'chronic', 'past_illnesses', 'hospitalization',
    'family', 'social', 'immunization'
  ));

-- 2. Who recorded the entry. Default keeps existing rows honest: everything
--    already in the table was typed by clinic staff.
ALTER TABLE medical_history
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'doctor_entry'
    CHECK (source IN ('patient_intake', 'ai_ocr', 'doctor_entry', 'receptionist'));

-- 3. Whether a clinician has approved the entry. AI OCR / patient intake rows
--    arrive pending_approval; existing triage-typed rows are already verified.
ALTER TABLE medical_history
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'verified'
    CHECK (verification_status IN ('verified', 'pending_approval'));

-- 4. Clinical course of the condition (drives the "Active/Resolved/Chronic"
--    column in the UI and the ribbon's chronic-conditions count).
ALTER TABLE medical_history
  ADD COLUMN IF NOT EXISTS clinical_status TEXT NOT NULL DEFAULT 'active'
    CHECK (clinical_status IN ('active', 'resolved', 'chronic'));

-- 5. Human-readable author (display name) resolved from auth metadata at insert
--    time, so the UI can show "Added by Dr. Sarah" without the clinic member id.
ALTER TABLE medical_history
  ADD COLUMN IF NOT EXISTS created_by_name TEXT;

-- No new indexes: idx_medical_history_patient (patient_id, clinic_id) from 0045
-- already covers the per-patient reads this feature relies on.