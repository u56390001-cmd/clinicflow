/**
 * Script to convert your account to admin role
 * Run this in Supabase SQL Editor
 */

-- Step 1: Check your current membership
SELECT
  'Current Status' as status,
  cm.role,
  cm.clinic_id,
  cm.email,
  u.email as user_email
FROM public.clinic_members cm
JOIN auth.users u ON u.id = cm.user_id
WHERE cm.user_id = '274548aa-9b53-45c0-92a2-8374244d9641';

-- Step 2: Find your clinic_id
SELECT
  'Your Clinic Details' as info,
  cm.clinic_id,
  c.name as clinic_name,
  c.slug as clinic_slug
FROM public.clinic_members cm
JOIN public.clinics c ON c.id = cm.clinic_id
WHERE cm.user_id = '274548aa-9b53-45c0-92a2-8374244d9641';

-- Step 3: Update your role to clinic_admin
-- Uncomment and replace 'CLINIC_ID_FROM_STEP_2' below
/*
UPDATE public.clinic_members
SET
  role = 'clinic_admin',
  permissions = '{}'::jsonb  -- Reset to inherit role defaults
WHERE user_id = '274548aa-9b53-45c0-92a2-8374244d9641'
  AND clinic_id = 'CLINIC_ID_FROM_STEP_2';
*/

-- Step 4: Verify the update
SELECT
  'Updated Status' as info,
  cm.role,
  cm.permissions,
  u.email
FROM public.clinic_members cm
JOIN auth.users u ON u.id = cm.user_id
WHERE cm.user_id = '274548aa-9b53-45c0-92a2-8374244d9641';

-- Step 5: List all permissions for clinic_admin role
SELECT
  'Available Permissions' as info,
  p.permission,
  p.description
FROM (
  VALUES
    ('patients:read', 'View patients'),
    ('patients:write', 'Edit patients'),
    ('patients:delete', 'Delete patients'),
    ('appointments:read', 'View appointments'),
    ('appointments:write', 'Manage appointments'),
    ('prescriptions:read', 'View prescriptions'),
    ('prescriptions:write', 'Write prescriptions'),
    ('billing:read', 'View billing'),
    ('billing:write', 'Manage billing'),
    ('reports:read', 'View reports'),
    ('settings:manage', 'Manage settings'),
    ('staff:manage', 'Manage staff')
) as p(permission, description)
WHERE p.permission IN (
  SELECT permission FROM public.role_permissions WHERE role = 'clinic_admin'
);
