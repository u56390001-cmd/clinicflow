-- ============================================================================
-- 0125_subscription_tiers_and_super_admin.sql
--
-- The public three-tier contract and the platform-admin naming layer.
--
-- The plan row remains the single source of truth: `features` says which
-- modules are open, `limits` says how many seats the plan carries, and the
-- active subscription decides whether the plan grants anything at all. Nothing
-- is duplicated onto `clinics`.
--
-- Tier shape:
--   starter      Solo Doctor Plan          1 doctor / 5 team logins
--   professional 4-Doctor Clinic Plan      4 doctors / 15 team logins
--   enterprise   Practice / Hospital Plan  unlimited doctors / 50 team logins
--
-- Website, AI receptionist, WhatsApp, custom domains and premium templates
-- start at `professional`; multi-branch and advanced security start at
-- `enterprise`. The clinical core and the standard subdomain booking page are
-- available on every tier.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Plans
-- ----------------------------------------------------------------------------
-- `features` is replaced wholesale rather than merged. A stale key surviving a
-- plan rewrite is how a downgrade silently keeps a module open.

update public.subscription_plans
   set name = 'Solo Doctor Plan',
       price = 2499,
       currency = 'PKR',
       billing_interval = 'monthly',
       features = '[
         {"key": "core_ehr",           "label": "Core EHR",                          "included": true},
         {"key": "appointments",       "label": "Appointment management",             "included": true},
         {"key": "patients",           "label": "Patient master timeline",            "included": true},
         {"key": "consultations",      "label": "6-tab consultation workspace",       "included": true},
         {"key": "patient_billing",    "label": "Patient billing & receipts",          "included": true},
         {"key": "online_booking",     "label": "Standard subdomain booking page",    "included": true},
         {"key": "google_sheets",      "label": "Google Sheets export",                "included": true},
         {"key": "website",            "label": "Website builder",                     "included": false},
         {"key": "ai_receptionist",    "label": "AI Receptionist",                     "included": false},
         {"key": "whatsapp",           "label": "WhatsApp Business & AI replies",      "included": false},
         {"key": "custom_domain",      "label": "Custom domain",                       "included": false},
         {"key": "pro_templates",      "label": "Premium website templates",           "included": false},
         {"key": "multi_branch",       "label": "Multi-branch organisation",           "included": false},
         {"key": "advanced_security",  "label": "Advanced security & audit controls",  "included": false},
         {"key": "queue",              "label": "Smart TV queue display",              "included": false},
         {"key": "telehealth",         "label": "Video consultations",                 "included": false},
         {"key": "google_calendar",    "label": "Google Calendar sync",                "included": false},
         {"key": "google_meet",        "label": "Google Meet links",                   "included": false},
         {"key": "assessments",        "label": "Assessment library & psychometrics",  "included": false},
         {"key": "clinical_templates", "label": "Intake, MSE & note templates",        "included": false},
         {"key": "priority_support",   "label": "Priority support & onboarding",       "included": false}
       ]'::jsonb,
       limits = '{"doctor_seats": 1, "team_seats": 5}'::jsonb,
       active = true,
       updated_at = now()
 where code = 'starter';

update public.subscription_plans
   set name = '4-Doctor Clinic Plan',
       price = 6999,
       currency = 'PKR',
       billing_interval = 'monthly',
       features = '[
         {"key": "core_ehr",           "label": "Core EHR",                          "included": true},
         {"key": "appointments",       "label": "Appointment management",             "included": true},
         {"key": "patients",           "label": "Patient master timeline",            "included": true},
         {"key": "consultations",      "label": "6-tab consultation workspace",       "included": true},
         {"key": "patient_billing",    "label": "Patient billing & receipts",          "included": true},
         {"key": "online_booking",     "label": "Standard subdomain booking page",    "included": true},
         {"key": "google_sheets",      "label": "Google Sheets export",                "included": true},
         {"key": "website",            "label": "Website builder",                     "included": true},
         {"key": "ai_receptionist",    "label": "AI Receptionist",                     "included": true},
         {"key": "whatsapp",           "label": "WhatsApp Business & AI replies",      "included": true},
         {"key": "custom_domain",      "label": "Custom domain",                       "included": true},
         {"key": "pro_templates",      "label": "Premium website templates",           "included": true},
         {"key": "multi_branch",       "label": "Multi-branch organisation",           "included": false},
         {"key": "advanced_security",  "label": "Advanced security & audit controls",  "included": false},
         {"key": "queue",              "label": "Smart TV queue display",              "included": true},
         {"key": "telehealth",         "label": "Video consultations",                 "included": true},
         {"key": "google_calendar",    "label": "Google Calendar sync",                "included": true},
         {"key": "google_meet",        "label": "Google Meet links",                   "included": true},
         {"key": "assessments",        "label": "Assessment library & psychometrics",  "included": false},
         {"key": "clinical_templates", "label": "Intake, MSE & note templates",        "included": false},
         {"key": "priority_support",   "label": "Priority support & onboarding",       "included": false}
       ]'::jsonb,
       limits = '{"doctor_seats": 4, "team_seats": 15}'::jsonb,
       active = true,
       updated_at = now()
 where code = 'professional';

update public.subscription_plans
   set name = 'Practice / Hospital Plan',
       price = 16999,
       currency = 'PKR',
       billing_interval = 'monthly',
       features = '[
         {"key": "core_ehr",           "label": "Core EHR",                          "included": true},
         {"key": "appointments",       "label": "Appointment management",             "included": true},
         {"key": "patients",           "label": "Patient master timeline",            "included": true},
         {"key": "consultations",      "label": "6-tab consultation workspace",       "included": true},
         {"key": "patient_billing",    "label": "Patient billing & receipts",          "included": true},
         {"key": "online_booking",     "label": "Standard subdomain booking page",    "included": true},
         {"key": "google_sheets",      "label": "Google Sheets export",                "included": true},
         {"key": "website",            "label": "Website builder",                     "included": true},
         {"key": "ai_receptionist",    "label": "AI Receptionist",                     "included": true},
         {"key": "whatsapp",           "label": "WhatsApp Business & AI replies",      "included": true},
         {"key": "custom_domain",      "label": "Custom domain",                       "included": true},
         {"key": "pro_templates",      "label": "Premium website templates",           "included": true},
         {"key": "multi_branch",       "label": "Multi-branch organisation",           "included": true},
         {"key": "advanced_security",  "label": "Advanced security & audit controls",  "included": true},
         {"key": "queue",              "label": "Smart TV queue display",              "included": true},
         {"key": "telehealth",         "label": "Video consultations",                 "included": true},
         {"key": "google_calendar",    "label": "Google Calendar sync",                "included": true},
         {"key": "google_meet",        "label": "Google Meet links",                   "included": true},
         {"key": "assessments",        "label": "Assessment library & psychometrics",  "included": true},
         {"key": "clinical_templates", "label": "Intake, MSE & note templates",        "included": true},
         {"key": "priority_support",   "label": "Priority support & onboarding",       "included": true}
       ]'::jsonb,
       limits = '{"doctor_seats": null, "team_seats": 50}'::jsonb,
       active = true,
       updated_at = now()
 where code = 'enterprise';

-- ----------------------------------------------------------------------------
-- 2. Seat add-ons
-- ----------------------------------------------------------------------------
-- `teamSeatAllowance()` already reads `extra-team-seat`; until this migration
-- the catalogue row did not exist, so the add-on could never be bought.

insert into public.addons
  (slug, name, category, description, price_pkr, billing_period, is_quantity_based, badge_text, sort_order)
values
  ('extra-doctor-seat', 'Extra Doctor Seat', 'Operations',
   'Add a doctor to your clinic beyond the seats your plan includes.',
   1199, 'month', true, null, 40),
  ('extra-team-seat', 'Extra Team Login', 'Operations',
   'Add one more staff login beyond the team logins your plan includes.',
   999, 'month', true, null, 45)
on conflict (slug) do update
   set name = excluded.name,
       category = excluded.category,
       description = excluded.description,
       price_pkr = excluded.price_pkr,
       billing_period = excluded.billing_period,
       is_quantity_based = excluded.is_quantity_based,
       badge_text = excluded.badge_text,
       sort_order = excluded.sort_order;

-- ----------------------------------------------------------------------------
-- 3. Super-admin alias
-- ----------------------------------------------------------------------------
-- Platform administration is still stored in `platform_admins`; there is no
-- second role table. This alias makes the product language ("Super Admin")
-- explicit while keeping the existing RLS helper and every policy intact.

create or replace function public.is_super_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_platform_admin(p_user_id);
$$;

comment on function public.is_super_admin(uuid) is
  'Alias for is_platform_admin(). Super Admin is a platform_admins row, not a clinic role.';

revoke all on function public.is_super_admin(uuid) from public;
grant execute on function public.is_super_admin(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Admin overview indexes
-- ----------------------------------------------------------------------------
-- The platform console lists clinics by subscription age and filters by plan
-- status. Both reads start from `subscriptions`.

create index if not exists subscriptions_admin_status_created_idx
  on public.subscriptions (status, created_at desc);

notify pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION
-- ----------------------------------------------------------------------------
-- 1. Three active plans exist with the names, prices and limits above.
-- 2. Starter features exclude website, ai_receptionist, whatsapp,
--    custom_domain and pro_templates; professional includes them; enterprise
--    also includes multi_branch and advanced_security.
-- 3. `extra-doctor-seat` and `extra-team-seat` both exist and are quantity
--    based so seat allowances can grow.
-- 4. `select public.is_super_admin()` is true exactly for a platform_admins
--    member.
-- ============================================================================
