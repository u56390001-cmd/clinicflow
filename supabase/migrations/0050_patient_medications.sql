-- Migration: patient_medications — medicines extracted from scanned documents
-- (AI OCR) alongside manually entered ones.
--
-- AI OCR rows arrive with status = 'active_pending' so nothing flows into the
-- Overview "Active Medications" list until a clinician approves it — the same
-- verification gate medical_history uses for AI-extracted entries. `report_name`
-- records which scan each row came from, giving the doctor provenance without a
-- join back into patient_documents.
--
-- IF NOT EXISTS / DROP POLICY IF EXISTS keep this file re-runnable, since
-- migrations here are applied by hand rather than via `supabase db push`.

CREATE TABLE IF NOT EXISTS patient_medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  medicine_name TEXT NOT NULL,
  strength TEXT,      -- e.g. "500 mg"
  frequency TEXT,     -- e.g. "1 tab - BD", "3x daily"
  duration TEXT,      -- e.g. "5 days", "Continue"
  instructions TEXT,  -- short usage note
  report_name TEXT,   -- source scan file name, for provenance
  status TEXT NOT NULL DEFAULT 'active_pending'
    CHECK (status IN ('active_pending', 'active', 'discontinued')),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'ai_ocr')),
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_patient_medications_patient
  ON patient_medications(patient_id, clinic_id);
CREATE INDEX IF NOT EXISTS idx_patient_medications_status
  ON patient_medications(status);

-- RLS policies
ALTER TABLE patient_medications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinic members can view patient medications" ON patient_medications;
CREATE POLICY "Clinic members can view patient medications"
  ON patient_medications FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM clinic_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clinic members can insert patient medications" ON patient_medications;
CREATE POLICY "Clinic members can insert patient medications"
  ON patient_medications FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM clinic_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clinic members can update patient medications" ON patient_medications;
CREATE POLICY "Clinic members can update patient medications"
  ON patient_medications FOR UPDATE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM clinic_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clinic members can delete patient medications" ON patient_medications;
CREATE POLICY "Clinic members can delete patient medications"
  ON patient_medications FOR DELETE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM clinic_members
      WHERE user_id = auth.uid()
    )
  );

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_patient_medications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS patient_medications_updated_at ON patient_medications;

CREATE TRIGGER patient_medications_updated_at
  BEFORE UPDATE ON patient_medications
  FOR EACH ROW
  EXECUTE FUNCTION update_patient_medications_updated_at();