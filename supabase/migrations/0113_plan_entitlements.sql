-- ============================================================================
-- 0113_plan_entitlements.sql
-- The plan becomes a contract: every module in the product is named here.
--
-- Until now a plan was decoration. `lib/plan-features.ts` was consulted in
-- exactly one place (the integrations actions), the app layout had no gate and
-- the sidebar filtered by role, so a Starter clinic had every module open.
-- This migration writes the data half of the contract:
--
--   * `subscription_plans.features` — the authoritative module list per plan
--     (one key per module, `included` true/false);
--   * `subscription_plans.limits`   — the numeric half of the contract
--     (doctor seats, team logins) that a boolean list cannot express;
--   * `addons` — the scale add-ons, re-priced and re-labelled;
--   * `clinics.onboarding_completed_at` — the marker that tells a freshly
--     provisioned clinic (it still has to be set up) from a finished one.
--
-- Pricing is modelled on the Pakistani market: a solo doctor, a 2-5 doctor
-- clinic and a hospital group. Seats are capped instead of patient records —
-- capping records punishes a busy clinic and is a promise the marketing page
-- cannot keep.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Numeric entitlements
-- ---------------------------------------------------------------------------

alter table public.subscription_plans
  add column if not exists limits jsonb not null default '{}'::jsonb;

comment on column public.subscription_plans.limits is
  'Numeric entitlements: {"doctor_seats": 1, "team_seats": 5}. A null seat count means unlimited.';

-- ---------------------------------------------------------------------------
-- 2. The three plans
-- ---------------------------------------------------------------------------
-- `features` is replaced wholesale (not merged) so the list is exactly the
-- module catalogue: no stale key can survive a plan change and quietly grant
-- something.

update public.subscription_plans
   set name = 'Solo',
       price = 2499,
       currency = 'PKR',
       billing_interval = 'monthly',
       features = '[
         {"key": "appointments",       "label": "Appointment management",            "included": true},
         {"key": "patients",           "label": "Patient records (unlimited)",       "included": true},
         {"key": "consultations",      "label": "Consultations & prescriptions",      "included": true},
         {"key": "patient_billing",    "label": "Patient billing & receipts",         "included": true},
         {"key": "online_booking",     "label": "Public online booking page",         "included": true},
         {"key": "google_sheets",      "label": "Google Sheets export",               "included": true},
         {"key": "ai_receptionist",    "label": "AI Receptionist",                    "included": false},
         {"key": "website",            "label": "Website builder & custom domain",   "included": false},
         {"key": "whatsapp",           "label": "WhatsApp Business & AI replies",     "included": false},
         {"key": "queue",              "label": "Smart TV queue display",            "included": false},
         {"key": "telehealth",         "label": "Video consultations",                "included": false},
         {"key": "google_calendar",    "label": "Google Calendar sync",               "included": false},
         {"key": "google_meet",        "label": "Google Meet links",                 "included": false},
         {"key": "multi_branch",       "label": "Multi-branch organisation",          "included": false},
         {"key": "assessments",        "label": "Assessment library & psychometrics", "included": false},
         {"key": "clinical_templates", "label": "Intake, MSE & note templates",        "included": false},
         {"key": "priority_support",   "label": "Priority support & onboarding",      "included": false}
       ]'::jsonb,
       limits = '{"doctor_seats": 1, "team_seats": 5}'::jsonb,
       updated_at = now()
 where code = 'starter';

update public.subscription_plans
   set name = 'Clinic',
       price = 6999,
       currency = 'PKR',
       billing_interval = 'monthly',
       features = '[
         {"key": "appointments",       "label": "Appointment management",            "included": true},
         {"key": "patients",           "label": "Patient records (unlimited)",       "included": true},
         {"key": "consultations",      "label": "Consultations & prescriptions",      "included": true},
         {"key": "patient_billing",    "label": "Patient billing & receipts",         "included": true},
         {"key": "online_booking",     "label": "Public online booking page",         "included": true},
         {"key": "google_sheets",      "label": "Google Sheets export",               "included": true},
         {"key": "ai_receptionist",    "label": "AI Receptionist",                    "included": true},
         {"key": "website",            "label": "Website builder & custom domain",   "included": true},
         {"key": "whatsapp",           "label": "WhatsApp Business & AI replies",     "included": true},
         {"key": "queue",              "label": "Smart TV queue display",            "included": true},
         {"key": "telehealth",         "label": "Video consultations",                "included": true},
         {"key": "google_calendar",    "label": "Google Calendar sync",               "included": true},
         {"key": "google_meet",        "label": "Google Meet links",                 "included": true},
         {"key": "multi_branch",       "label": "Multi-branch organisation",          "included": false},
         {"key": "assessments",        "label": "Assessment library & psychometrics", "included": false},
         {"key": "clinical_templates", "label": "Intake, MSE & note templates",        "included": false},
         {"key": "priority_support",   "label": "Priority support & onboarding",      "included": false}
       ]'::jsonb,
       limits = '{"doctor_seats": 5, "team_seats": 15}'::jsonb,
       updated_at = now()
 where code = 'professional';

update public.subscription_plans
   set name = 'Practice',
       price = 16999,
       currency = 'PKR',
       billing_interval = 'monthly',
       features = '[
         {"key": "appointments",       "label": "Appointment management",            "included": true},
         {"key": "patients",           "label": "Patient records (unlimited)",       "included": true},
         {"key": "consultations",      "label": "Consultations & prescriptions",      "included": true},
         {"key": "patient_billing",    "label": "Patient billing & receipts",         "included": true},
         {"key": "online_booking",     "label": "Public online booking page",         "included": true},
         {"key": "google_sheets",      "label": "Google Sheets export",               "included": true},
         {"key": "ai_receptionist",    "label": "AI Receptionist",                    "included": true},
         {"key": "website",            "label": "Website builder & custom domain",   "included": true},
         {"key": "whatsapp",           "label": "WhatsApp Business & AI replies",     "included": true},
         {"key": "queue",              "label": "Smart TV queue display",            "included": true},
         {"key": "telehealth",         "label": "Video consultations",                "included": true},
         {"key": "google_calendar",    "label": "Google Calendar sync",               "included": true},
         {"key": "google_meet",        "label": "Google Meet links",                 "included": true},
         {"key": "multi_branch",       "label": "Multi-branch organisation",          "included": true},
         {"key": "assessments",        "label": "Assessment library & psychometrics", "included": true},
         {"key": "clinical_templates", "label": "Intake, MSE & note templates",        "included": true},
         {"key": "priority_support",   "label": "Priority support & onboarding",      "included": true}
       ]'::jsonb,
       limits = '{"doctor_seats": null, "team_seats": 50}'::jsonb,
       updated_at = now()
 where code = 'enterprise';

-- ---------------------------------------------------------------------------
-- 3. Add-on catalogue
-- ---------------------------------------------------------------------------
-- The three scale add-ons were priced at 199 / 299 / 499 — too cheap to be
-- worth selling next to a PKR 2,499 plan, and they made a clinic wonder why
-- a second doctor cost less than a coffee. They now sit in the 1,000-1,500
-- band, under a plan upgrade and in line with the rest of the catalogue.

update public.addons
   set price_pkr = 1199,
       description = 'Add a doctor to your clinic beyond the seats your plan includes.',
       badge_text = null
 where slug = 'extra-doctor-seat';

update public.addons
   set price_pkr = 1299,
       description = 'Add another waiting-room display for the TV queue.',
       badge_text = null
 where slug = 'extra-tv-display';

-- WhatsApp + the TV queue are now part of the Clinic plan. The catalogue rows
-- stay (existing purchases keep pointing at them) but they are no longer sold
-- on their own.
update public.addons
   set badge_text = 'Included in Clinic plan'
 where slug in ('whatsapp-ai-receptionist', 'queue-management-system');

insert into public.addons
  (slug, name, category, description, price_pkr, billing_period, is_quantity_based, badge_text, sort_order)
values
  ('extra-whatsapp-number', 'Extra WhatsApp Number', 'Automation',
   'Connect a second WhatsApp Business number to the same clinic.', 1499, 'month', true, null, 4),
  ('priority-setup', 'Priority Setup & Data Migration', 'Operations',
   'One-time guided setup: we import your existing patients and configure the clinic with you.', 2500, 'once', false, null, 7)
on conflict (slug) do update
   set name = excluded.name,
       category = excluded.category,
       description = excluded.description,
       price_pkr = excluded.price_pkr,
       billing_period = excluded.billing_period,
       is_quantity_based = excluded.is_quantity_based,
       badge_text = excluded.badge_text,
       sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- 4. First-run setup marker
-- ---------------------------------------------------------------------------
-- A clinic created through the registration funnel still has to be set up
-- (facility type, size, team), so its marker stays NULL and the app sends it
-- to the setup wizard on first login. Clinics that already existed are
-- marked as set up.

alter table public.clinics
  add column if not exists onboarding_completed_at timestamptz;

comment on column public.clinics.onboarding_completed_at is
  'NULL until the clinic completes its first-run setup; the app redirects to the setup wizard while it is NULL.';

update public.clinics c
   set onboarding_completed_at = c.created_at
 where c.onboarding_completed_at is null
   and not exists (
     select 1 from public.registration_requests r where r.clinic_id = c.id
   );

notify pgrst, 'reload schema';
