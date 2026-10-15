-- ============================================================================
-- 0089 — Phase 3: assessment invite delivery metadata
--
-- Phase 3 ("Patient Mobile Assessment & Secure Links") reuses the existing
-- secure share-link system (`patient_share_links`, migration 0080) rather than
-- introducing a second, parallel `patient_assessment_invites` table. The link
-- table already carries the security-critical columns — `token_hash` (SHA-256,
-- unique), `expires_at`, single-use `status`, `submitted_at`, `assessment_type`,
-- `template_id` — and RLS is enabled with no Data-API policies so the token
-- hash is the capability. This migration only adds the *delivery* metadata the
-- Phase 3 prompt asks for, which 0080 did not track.
--
--   1. `clinician_id`   — the clinician an invite is sent on behalf of (may
--                         differ from `created_by`, the staff member who
--                         pressed send). Nullable; existing rows have none.
--   2. `delivery_channel` — how the link left the clinic.
--   3. `delivery_status`  — provider acknowledgement, distinct from the
--                         single-use lifecycle in `status`.
--   4. `metadata`         — free-form provider/receipt details (message id,
--                         template snapshot, retry bookkeeping).
--
-- `completed_at` (prompt) is intentionally NOT added: `submitted_at` already
-- records when a patient completed the invite, and duplicating it would create
-- two sources of truth. `delivery_status` uses the house lowercase vocabulary
-- (matching `status`) instead of the prompt's uppercase strings.
--
-- Additive + re-runnable: `ADD COLUMN IF NOT EXISTS` and guarded constraints.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Delivery metadata
-- ---------------------------------------------------------------------------
ALTER TABLE public.patient_share_links
  ADD COLUMN IF NOT EXISTS clinician_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.patient_share_links
  ADD COLUMN IF NOT EXISTS delivery_channel text;

ALTER TABLE public.patient_share_links
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.patient_share_links
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. Constraints (guarded so the migration can be re-run)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patient_share_links_delivery_channel_check'
  ) THEN
    ALTER TABLE public.patient_share_links
      ADD CONSTRAINT patient_share_links_delivery_channel_check
      CHECK (delivery_channel IS NULL OR delivery_channel IN ('whatsapp', 'sms', 'in_clinic', 'link'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patient_share_links_delivery_status_check'
  ) THEN
    ALTER TABLE public.patient_share_links
      ADD CONSTRAINT patient_share_links_delivery_status_check
      CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patient_share_links_metadata_object_check'
  ) THEN
    ALTER TABLE public.patient_share_links
      ADD CONSTRAINT patient_share_links_metadata_object_check
      CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS patient_share_links_clinician_idx
  ON public.patient_share_links (clinic_id, clinician_id)
  WHERE clinician_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS patient_share_links_delivery_status_idx
  ON public.patient_share_links (delivery_status)
  WHERE delivery_status <> 'pending';

COMMENT ON COLUMN public.patient_share_links.delivery_channel IS
  'How the invite left the clinic: whatsapp | sms | in_clinic (shown to patient) | link (copied manually).';
COMMENT ON COLUMN public.patient_share_links.delivery_status IS
  'Provider delivery acknowledgement. Distinct from status (the single-use lifecycle).';
COMMENT ON COLUMN public.patient_share_links.clinician_id IS
  'Clinician the invite is sent on behalf of; may differ from created_by (the sender).';
