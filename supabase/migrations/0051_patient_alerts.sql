-- Migration: patient_alerts — allergies + known conditions extracted from
-- scanned documents (AI OCR), staged for clinician review.
--
-- The Overview tab's "Critical Safety Alerts" block reads two free-text
-- columns on `patients` (`known_allergies` and `medical_conditions`). AI OCR
-- rows must not silently write into those columns, so they arrive here as
-- `active_pending` (same gate as patient_medications); when a clinician
-- approves one, the action merges it into the matching patients column and the
-- row moves to 'approved'. `report_name` records which scan each row came from.
--
-- IF NOT EXISTS / DROP POLICY IF EXISTS keep this file re-runnable, since
-- migrations here are applied by hand rather than via `supabase db push`.

CREATE TABLE IF NOT EXISTS patient_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL
    CHECK (alert_type IN ('allergy', 'known_case')),
  text TEXT NOT NULL,            -- e.g. "Penicillin" or "Hypertension"
  report_name TEXT,              -- source scan file name, for provenance
  status TEXT NOT NULL DEFAULT 'active_pending'
    CHECK (status IN ('active_pending', 'approved', 'dismissed')),
  source TEXT NOT NULL DEFAULT 'ai_ocr'
    CHECK (source IN ('ai_ocr')),
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_patient_alerts_patient
  ON patient_alerts(patient_id, clinic_id);
CREATE INDEX IF NOT EXISTS idx_patient_alerts_status
  ON patient_alerts(status);

-- RLS policies
ALTER TABLE patient_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinic members can view patient alerts" ON patient_alerts;
CREATE POLICY "Clinic members can view patient alerts"
  ON patient_alerts FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM clinic_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clinic members can insert patient alerts" ON patient_alerts;
CREATE POLICY "Clinic members can insert patient alerts"
  ON patient_alerts FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM clinic_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clinic members can update patient alerts" ON patient_alerts;
CREATE POLICY "Clinic members can update patient alerts"
  ON patient_alerts FOR UPDATE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM clinic_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clinic members can delete patient alerts" ON patient_alerts;
CREATE POLICY "Clinic members can delete patient alerts"
  ON patient_alerts FOR DELETE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM clinic_members
      WHERE user_id = auth.uid()
    )
  );

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_patient_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS patient_alerts_updated_at ON patient_alerts;

CREATE TRIGGER patient_alerts_updated_at
  BEFORE UPDATE ON patient_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_patient_alerts_updated_at();