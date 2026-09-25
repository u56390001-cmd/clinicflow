-- ============================================================================
-- 0011 — Team invites (Phase 9)
-- Pending/accepted team invitations. Raw tokens are never stored — only their
-- SHA-256 hash. Invites can only grant admin/staff (never owner).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.clinic_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  email text NOT NULL
    CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
           AND char_length(btrim(email)) >= 3
           AND char_length(btrim(email)) <= 254),
  role public.clinic_role NOT NULL DEFAULT 'staff' CHECK (role <> 'owner'),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL,
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinic_invites_clinic_id_idx
  ON public.clinic_invites (clinic_id);
CREATE INDEX IF NOT EXISTS clinic_invites_status_idx
  ON public.clinic_invites (status);

-- At most one pending invite per (clinic, email).
CREATE UNIQUE INDEX IF NOT EXISTS clinic_invites_one_pending_per_email_idx
  ON public.clinic_invites (clinic_id, lower(email))
  WHERE status = 'pending';

ALTER TABLE public.clinic_invites ENABLE ROW LEVEL SECURITY;

-- Idempotency guards: drop policies if they exist so this file can be
-- re-run safely (the table/policies may already exist in environments
-- where this migration was applied out-of-band).
DROP POLICY IF EXISTS clinic_invites_select_admin ON public.clinic_invites;
DROP POLICY IF EXISTS clinic_invites_insert_admin ON public.clinic_invites;
DROP POLICY IF EXISTS clinic_invites_update_admin ON public.clinic_invites;
DROP POLICY IF EXISTS clinic_invites_delete_admin ON public.clinic_invites;

CREATE POLICY "clinic_invites_select_admin"
  ON public.clinic_invites FOR SELECT
  USING (public.is_clinic_admin(clinic_id));

CREATE POLICY "clinic_invites_insert_admin"
  ON public.clinic_invites FOR INSERT
  WITH CHECK (public.is_clinic_admin(clinic_id) AND role <> 'owner');

CREATE POLICY "clinic_invites_update_admin"
  ON public.clinic_invites FOR UPDATE
  USING (public.is_clinic_admin(clinic_id) AND role <> 'owner')
  WITH CHECK (public.is_clinic_admin(clinic_id) AND role <> 'owner');

CREATE POLICY "clinic_invites_delete_admin"
  ON public.clinic_invites FOR DELETE
  USING (public.is_clinic_admin(clinic_id) AND role <> 'owner');

COMMENT ON TABLE public.clinic_invites IS
  'Pending/accepted team invitations. Raw tokens are never stored — only their SHA-256 hash.';
