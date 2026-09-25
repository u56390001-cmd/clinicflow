-- ============================================================================
-- 0013 — Operational event log (Phase 9)
-- Consolidated observability log for api/booking/email/auth failures.
-- AI conversations live in ai_conversation_logs; billing in billing_events —
-- this table deliberately does not duplicate those.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.app_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('api', 'booking', 'email', 'auth')),
  event text NOT NULL CHECK (char_length(btrim(event)) >= 1 AND char_length(btrim(event)) <= 100),
  severity text NOT NULL DEFAULT 'error' CHECK (severity IN ('info', 'warning', 'error')),
  actor_user_id uuid REFERENCES auth.users(id),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_event_logs_category_idx
  ON public.app_event_logs (category, created_at DESC);
CREATE INDEX IF NOT EXISTS app_event_logs_clinic_created_idx
  ON public.app_event_logs (clinic_id, created_at DESC);

ALTER TABLE public.app_event_logs ENABLE ROW LEVEL SECURITY;

-- Idempotency guards: drop policies if they exist so this file can be
-- re-run safely (the table/policies may already exist in environments
-- where this migration was applied out-of-band).
DROP POLICY IF EXISTS app_event_logs_insert_member ON public.app_event_logs;
DROP POLICY IF EXISTS app_event_logs_select_admin ON public.app_event_logs;

-- Members may append events for their clinic (or clinic-scoped system events).
CREATE POLICY "app_event_logs_insert_member"
  ON public.app_event_logs FOR INSERT
  WITH CHECK ((clinic_id IS NULL) OR public.is_clinic_member(clinic_id));

-- Only admins of the owning clinic (or platform admins) can read the log.
CREATE POLICY "app_event_logs_select_admin"
  ON public.app_event_logs FOR SELECT
  USING (
    ((clinic_id IS NOT NULL) AND public.is_clinic_admin(clinic_id))
    OR public.is_platform_admin()
  );

COMMENT ON TABLE public.app_event_logs IS
  'Operational event log: api/booking/email/auth failures. AI conversations live in ai_conversation_logs; billing in billing_events.';
