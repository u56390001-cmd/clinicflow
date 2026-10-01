-- Migration: Add medical_history table for comprehensive past history tracking
-- Supports surgical history, chronic conditions, past illnesses, family history, and social history

CREATE TABLE IF NOT EXISTS medical_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('surgical', 'chronic', 'past_illnesses', 'family', 'social')),
  condition TEXT NOT NULL,
  date DATE,
  notes TEXT,
  relationship TEXT, -- For family history entries (e.g., "Father", "Mother")
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
-- IF NOT EXISTS + DROP POLICY/TRIGGER IF EXISTS below keep this file re-runnable,
-- since migrations here are applied by hand rather than via `supabase db push`.
CREATE INDEX IF NOT EXISTS idx_medical_history_patient ON medical_history(patient_id, clinic_id);
CREATE INDEX IF NOT EXISTS idx_medical_history_category ON medical_history(category);
CREATE INDEX IF NOT EXISTS idx_medical_history_created ON medical_history(created_at DESC);

-- RLS policies
ALTER TABLE medical_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinic members can view medical history" ON medical_history;
CREATE POLICY "Clinic members can view medical history"
  ON medical_history FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM clinic_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clinic members can insert medical history" ON medical_history;
CREATE POLICY "Clinic members can insert medical history"
  ON medical_history FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM clinic_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clinic members can update medical history" ON medical_history;
CREATE POLICY "Clinic members can update medical history"
  ON medical_history FOR UPDATE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM clinic_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clinic members can delete medical history" ON medical_history;
CREATE POLICY "Clinic members can delete medical history"
  ON medical_history FOR DELETE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM clinic_members
      WHERE user_id = auth.uid()
    )
  );

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_medical_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS medical_history_updated_at ON medical_history;

CREATE TRIGGER medical_history_updated_at
  BEFORE UPDATE ON medical_history
  FOR EACH ROW
  EXECUTE FUNCTION update_medical_history_updated_at();
