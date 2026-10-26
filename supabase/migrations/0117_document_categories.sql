-- 0117: document categories for the patient Documents tab.
--
-- Five standardized buckets keep clinical paperwork findable without a search
-- bar: the filter bar needs a column to key off, not a name-guessing heuristic.

ALTER TABLE public.patient_documents
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general'
    CHECK (category IN (
      'consents_legal',
      'labs_scans',
      'referrals_evals',
      'patient_uploads',
      'general'
    ));

-- Files that arrived through a patient share link are, by definition, patient
-- uploads. Staff-uploaded legacy files stay 'general' until the clinic edits
-- them — guessing labs vs consents from a file name would put MRI scans and
-- HIPAA forms in the wrong drawers.
UPDATE public.patient_documents
   SET category = 'patient_uploads'
 WHERE source = 'patient_online';

COMMENT ON COLUMN public.patient_documents.category IS
  'Standardized document bucket: consents_legal | labs_scans | referrals_evals | patient_uploads | general. Patient share-link backfill in 0117.';
