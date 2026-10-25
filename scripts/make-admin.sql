-- =============================================================================
-- Convert your account to admin role
-- User UID: 274548aa-9b53-45c0-92a2-8374244d9641
-- =============================================================================

-- 1. First, find your clinic_id by looking at your clinic_members table
SELECT
  cm.id as member_id,
  cm.clinic_id,
  cm.user_id,
  cm.role,
  cm.email,
  u.email as user_email
FROM public.clinic_members cm
JOIN auth.users u ON u.id = cm.user_id
WHERE cm.user_id = '274548aa-9b53-45c0-92a2-8374244d9641';

-- 2. Update your role to 'clinic_admin' (most common admin role)
-- Replace 'YOUR_CLINIC_ID_HERE' with the clinic_id from step 1
UPDATE public.clinic_members
SET
  role = 'clinic_admin',
  permissions = '{}'::jsonb  -- Reset to inherit role defaults
WHERE user_id = '274548aa-9b53-45c0-92a2-8374244d9641'
  AND clinic_id = 'YOUR_CLINIC_ID_HERE';

-- 3. If you want 'owner' role (full access + patient deletion):
-- Replace 'YOUR_CLINIC_ID_HERE' with the clinic_id from step 1
UPDATE public.clinic_members
SET
  role = 'owner',
  permissions = '{}'::jsonb
WHERE user_id = '274548aa-9b53-45c0-92a2-8374244d9641'
  AND clinic_id = 'YOUR_CLINIC_ID_HERE';

-- 4. Verify the update
SELECT
  cm.role,
  cm.permissions,
  u.email
FROM public.clinic_members cm
JOIN auth.users u ON u.id = cm.user_id
WHERE cm.user_id = '274548aa-9b53-45c0-92a2-8374244d9641';
