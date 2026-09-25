-- ============================================================================
-- 0012 — Denormalized member email (Phase 9)
-- clinic_members.email mirrors auth.users.email so team lists and invite
-- de-duplication don't require a join into the auth schema under RLS.
-- ============================================================================

ALTER TABLE public.clinic_members ADD COLUMN IF NOT EXISTS email text;

UPDATE public.clinic_members cm
SET email = u.email
FROM auth.users u
WHERE cm.user_id = u.id
  AND cm.email IS NULL;

ALTER TABLE public.clinic_members ALTER COLUMN email SET NOT NULL;
