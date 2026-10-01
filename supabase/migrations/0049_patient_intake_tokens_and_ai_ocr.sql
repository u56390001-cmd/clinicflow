-- ============================================================================
-- 0049 — Patient pre-intake + AI OCR document scanning
--
-- Two ingestion paths feed the 0048-structured `medical_history` table with
-- `pending_approval` rows for the doctor to verify:
--   1. Patient pre-intake form  (source = 'patient_intake')
--   2. AI OCR document scan     (source = 'ai_ocr')
--
-- 1. `patient_intake_tokens` — a shareable one-time link per patient. Mirrors
--    `clinic_invites` (0011): only the SHA-256 hash of the token is stored, so
--    a leaked database cannot be replayed into valid links. The raw token lives
--    only in the URL. Like `clinic_ai_secrets`, RLS is enabled with no policies
--    written from the app session — reads/writes go through the service-role
--    client with the token hash as the capability, exactly like invite lookups.
--    (Admin-staff list/revoke is future work; the mint action is clinical gated.)
--
-- 2. `ai-ocr-documents` storage bucket (PRIVATE) — transient uploads holding the
--    scan between the browser and the AI parser. Object key layout is
--    {clinic_id}/{patient_id}/{uuid}-{filename}, so path segment 1 is the
--    tenant boundary, same as 'patient-documents' (0029). Files are removed
--    server-side when parsing finishes; nothing is retained for audit.
--
-- IF NOT EXISTS / DROP POLICY IF EXISTS keep this file re-runnable, since
-- migrations here are applied by hand rather than via `supabase db push`.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. patient_intake_tokens
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_intake_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'used', 'revoked', 'expired')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patient_intake_tokens_clinic_patient_idx
  ON public.patient_intake_tokens (clinic_id, patient_id);
CREATE INDEX IF NOT EXISTS patient_intake_tokens_status_idx
  ON public.patient_intake_tokens (status);

-- Service-role only: no policies are created, so `anon`/`authenticated`
-- sessions cannot read or write these rows through the Data API.
ALTER TABLE public.patient_intake_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.patient_intake_tokens IS
  'Shareable pre-intake form links. Raw tokens are never stored — only their SHA-256 hash.';

-- ---------------------------------------------------------------------------
-- 2. ai-ocr-documents storage bucket (PRIVATE)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
  VALUES ('ai-ocr-documents', 'ai-ocr-documents', false)
  ON CONFLICT (id) DO NOTHING;

-- Clinic members can stage a scan for parsing (insert), read it back to hand
-- it to the AI parser (select), and delete it once parsing finishes (delete).
DROP POLICY IF EXISTS "AI OCR: clinic upload" ON storage.objects;
CREATE POLICY "AI OCR: clinic upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'ai-ocr-documents'
    AND public.is_clinic_member((string_to_array(name, '/'))[1]::uuid)
  );

DROP POLICY IF EXISTS "AI OCR: clinic read" ON storage.objects;
CREATE POLICY "AI OCR: clinic read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'ai-ocr-documents'
    AND public.is_clinic_member((string_to_array(name, '/'))[1]::uuid)
  );

DROP POLICY IF EXISTS "AI OCR: clinic delete" ON storage.objects;
CREATE POLICY "AI OCR: clinic delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'ai-ocr-documents'
    AND public.is_clinic_member((string_to_array(name, '/'))[1]::uuid)
  );