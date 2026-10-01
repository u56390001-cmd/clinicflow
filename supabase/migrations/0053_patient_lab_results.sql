-- Migration: patient_lab_results — lab values extracted from scanned reports
-- (AI OCR), staged for clinician review.
--
-- These rows are a *read* of a report the patient already has, not an order.
-- The rail in the prescription workspace lists them next to the AI OCR summary
-- so the doctor writes the next prescription against the numbers that were
-- actually measured, instead of ordering the same panel blind.
--
-- Rows arrive `active_pending` (same gate as patient_medications and
-- patient_alerts): an unverified number in the sidebar looks authoritative, and
-- a wrong value that looks authoritative is worse than no value. `report_name`
-- and `document_id` record which scan each value came from so the doctor can
-- check it against the paper.
--
-- `abnormal` is an enum rather than a boolean: "High", "Low" and "Critical" are
-- three different clinical signals, and a value inside the stated range can
-- still be alarming. `reference_range` is kept verbatim from the report because
-- labs differ and nothing should hardcode it.
--
-- IF NOT EXISTS / DROP POLICY IF EXISTS keep this file re-runnable, since
-- migrations here are applied by hand rather than via `supabase db push`.

CREATE TABLE IF NOT EXISTS patient_lab_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  -- The scan this came from; null if that upload was later deleted.
  document_id UUID REFERENCES patient_documents(id) ON DELETE SET NULL,
  test_name TEXT NOT NULL,        -- e.g. "Hemoglobin (Hb)"
  test_value TEXT,                -- kept as text: "11.2", "<0.01", ">200" are all real
  unit TEXT,                      -- e.g. "g/dL"
  reference_range TEXT,           -- the report's own range, verbatim
  abnormal TEXT
    CHECK (abnormal IN ('normal', 'high', 'low', 'critical')),
  report_date DATE,               -- naive, as printed on the report
  report_name TEXT,               -- source scan file name, for provenance
  status TEXT NOT NULL DEFAULT 'active_pending'
    CHECK (status IN ('active_pending', 'active', 'discontinued')),
  source TEXT NOT NULL DEFAULT 'ai_ocr'
    CHECK (source IN ('manual', 'ai_ocr')),
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance.
-- The workspace rail reads newest-first for one patient, so the sort column is
-- covered rather than filtering on it after the fact.
CREATE INDEX IF NOT EXISTS idx_patient_lab_results_patient
  ON patient_lab_results(patient_id, clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_lab_results_document
  ON patient_lab_results(document_id);
CREATE INDEX IF NOT EXISTS idx_patient_lab_results_status
  ON patient_lab_results(status);

-- RLS policies.
ALTER TABLE patient_lab_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinic members can view patient lab results" ON patient_lab_results;
CREATE POLICY "Clinic members can view patient lab results"
  ON patient_lab_results FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM clinic_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clinic members can insert patient lab results" ON patient_lab_results;
CREATE POLICY "Clinic members can insert patient lab results"
  ON patient_lab_results FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM clinic_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clinic members can update patient lab results" ON patient_lab_results;
CREATE POLICY "Clinic members can update patient lab results"
  ON patient_lab_results FOR UPDATE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM clinic_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clinic members can delete patient lab results" ON patient_lab_results;
CREATE POLICY "Clinic members can delete patient lab results"
  ON patient_lab_results FOR DELETE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM clinic_members
      WHERE user_id = auth.uid()
    )
  );

-- Updated timestamp trigger.
CREATE OR REPLACE FUNCTION update_patient_lab_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS patient_lab_results_updated_at ON patient_lab_results;

CREATE TRIGGER patient_lab_results_updated_at
  BEFORE UPDATE ON patient_lab_results
  FOR EACH ROW
  EXECUTE FUNCTION update_patient_lab_results_updated_at();
