-- ============================================================================
-- 0080 — Psychology OPD: WhatsApp patient links + online assessments
--
-- Extends the existing WhatsApp channel and patient-record system — it does NOT
-- introduce a second communication system. A clinic staff member mints a
-- shareable link (pre-visit questionnaire, psychometric assessment, or document
-- upload), sends it over the existing WhatsApp path, and the patient completes
-- it on their phone. Answers land back in the psychology workspace.
--
-- 1. `patient_share_links` — the generic shareable-link table. It generalises
--    `patient_intake_tokens` (0049) to three purposes instead of one. Same
--    capability model: only the SHA-256 hash of the token is stored, so a leaked
--    database cannot be replayed into a working link; the raw token lives only
--    in the URL. Like `patient_intake_tokens`, RLS is enabled with no Data-API
--    policies — reads/writes go through the service-role client with the token
--    hash as the capability.
--
-- 2. `psych_assessments` gains item-level `answers`, a `completed_by` origin
--    (Patient Online / Reception Desk / Psychologist) and a link back to the
--    share link that produced it. All additive; the workspace's manual entry
--    keeps its `completed_by = 'psychologist'` default.
--
-- 3. `patient_documents` gains a `source`, so a patient-uploaded file reads
--    differently from one a clinician attached. Additive, defaulting to the
--    existing staff path.
--
-- Re-runnable: IF NOT EXISTS guards and DROP ... IF EXISTS before CREATE.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. patient_share_links
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_share_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL REFERENCES public.clinics (id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES public.patients (id) ON DELETE CASCADE,
  appointment_id  uuid REFERENCES public.appointments (id) ON DELETE SET NULL,
  kind            text NOT NULL
                    CHECK (kind IN ('pre_visit', 'assessment', 'document_upload')),
  -- Instrument for `kind = 'assessment'` (PHQ-9, GAD-7, BDI-II, PCL-5).
  assessment_type text,
  token_hash      text NOT NULL UNIQUE,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'used', 'revoked', 'expired')),
  created_by      uuid NOT NULL REFERENCES auth.users (id),
  expires_at      timestamptz NOT NULL,
  submitted_at    timestamptz,
  -- Raw answers as submitted (assessment item responses, pre-visit fields, or
  -- an upload's metadata). Kept for audit even though derived rows are written.
  submission      jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patient_share_links_clinic_patient_idx
  ON public.patient_share_links (clinic_id, patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS patient_share_links_status_idx
  ON public.patient_share_links (status);

-- Service-role only: no policies are created, so anon/authenticated sessions
-- cannot read or write these rows through the Data API.
ALTER TABLE public.patient_share_links ENABLE ROW LEVEL SECURITY;

-- clinic_id is immutable, matching every other clinic-scoped table (0069).
DROP TRIGGER IF EXISTS patient_share_links_prevent_clinic_id_change ON public.patient_share_links;
CREATE TRIGGER patient_share_links_prevent_clinic_id_change
  BEFORE UPDATE ON public.patient_share_links
  FOR EACH ROW EXECUTE FUNCTION public.prevent_clinic_id_change();

COMMENT ON TABLE public.patient_share_links IS
  'Shareable pre-visit / assessment / upload links. Raw tokens are never stored — only their SHA-256 hash.';

-- ---------------------------------------------------------------------------
-- 2. psych_assessments — origin + item answers + source link
-- ---------------------------------------------------------------------------
ALTER TABLE public.psych_assessments
  ADD COLUMN IF NOT EXISTS completed_by text NOT NULL DEFAULT 'psychologist'
    CHECK (completed_by IN ('patient_online', 'reception', 'psychologist'));

ALTER TABLE public.psych_assessments
  ADD COLUMN IF NOT EXISTS answers jsonb;

ALTER TABLE public.psych_assessments
  ADD COLUMN IF NOT EXISTS source_link_id uuid
    REFERENCES public.patient_share_links (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3. patient_documents — provenance of the upload
-- ---------------------------------------------------------------------------
ALTER TABLE public.patient_documents
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'staff'
    CHECK (source IN ('patient_online', 'reception', 'staff'));
