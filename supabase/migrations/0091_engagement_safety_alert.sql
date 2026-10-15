-- =============================================================================
-- MedBook AI — Engagement: clinical safety alert template | Migration 0091
--
-- Phase 5. Adds the `safety_alert` type to the engagement catalogue (migration
-- 0062). The type columns are plain TEXT (char_length only), so no CHECK change
-- is needed — only the lazy seeder is redefined to also seed this row, which
-- back-fills every existing clinic on its next Engagement page read.
--
-- The staff safety alert reuses the whole engagement pipeline: the admin-editable
-- template below, the per-clinic on/off automation, the shared Meta WhatsApp
-- client, and `engagement_logs`. Recipients are care-team members (resolved by
-- the scoring pipeline), not patients.
-- =============================================================================

create or replace function public.ensure_engagement_defaults(p_clinic_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.engagement_templates (clinic_id, type, template_text, enabled)
  select p_clinic_id, v.type, v.template_text, true
  from (values
    ('appointment_confirmation',
     'Hi {patient_name}! Your appointment with {doctor_name} at {clinic_name} is confirmed for {appointment_date} at {appointment_time}. 📅 See you soon! Reply with any questions. {clinic_location}'),
    ('appointment_reminder',
     'Hi {patient_name}! A friendly reminder about your appointment with {doctor_name} at {clinic_name} on {appointment_date} at {appointment_time}. ⏰ We look forward to seeing you! {clinic_location}'),
    ('review_request',
     'Hi {patient_name}! We hope you had a smooth appointment with {doctor_name} at {clinic_name}. 😊 We''d love your feedback — it takes less than a minute to leave a Google review and it helps us serve you better. 🌟 Thank you!\n\n{clinic_name}\n{clinic_location}'),
    ('prescription_delivery',
     'Hi {patient_name}, your prescription from {clinic_name} is ready. 📋 Here is your digital prescription from {doctor_name}. Take care!'),
    ('receipt_delivery',
     'Hi {patient_name}, thank you for your payment at {clinic_name}. 🧾 Your receipt is attached below.'),
    ('check_in',
     'Hi {patient_name}! You''re checked in at {clinic_name}. 🚶 We''ll call you as soon as {doctor_name} is ready. Estimated wait: ~{wait_time}.'),
    ('no_show_recovery',
     'Hi {patient_name}, we missed you at {clinic_name} today. 💙 We understand life gets busy — would you like to reschedule your appointment with {doctor_name}? Reply YES to pick a new time.'),
    ('auto_follow_up',
     'Hi {patient_name}! Hope you''re recovering well after your visit with {doctor_name}. 💙 Reply with any concerns or to schedule a follow-up.'),
    ('safety_alert',
     '⚠ *Clinical Safety Alert*

Patient: {patient_name}
Instrument: {instrument_name}
Risk level: {risk_level}

Please review the responses and record the appropriate triage action:
{review_url}')
  ) as v(type, template_text)
  on conflict (clinic_id, type) do nothing;

  insert into public.engagement_automations (clinic_id, automation_type, enabled, config)
  select p_clinic_id, v.automation_type, v.enabled, v.config
  from (values
    ('appointment_reminder',   true, '{"delay_hours": 24}'::jsonb),
    ('appointment_confirmation', true, '{}'::jsonb),
    ('review_request',         true, '{"delay_hours": 24}'::jsonb),
    ('prescription_delivery',  true, '{}'::jsonb),
    ('receipt_delivery',       true, '{}'::jsonb),
    ('check_in',               true, '{}'::jsonb),
    ('no_show_recovery',       true, '{"delay_hours": 24}'::jsonb),
    ('auto_follow_up',         true, '{"days_after": 3}'::jsonb),
    ('safety_alert',           true, '{}'::jsonb),
    ('general',                true, '{"maps_link": ""}'::jsonb)
  ) as v(automation_type, enabled, config)
  on conflict (clinic_id, automation_type) do nothing;
end;
$$;

comment on function public.ensure_engagement_defaults(uuid) is
  'Idempotently seeds a clinic''s engagement templates and automations (migrations 0062, 0091). SECURITY DEFINER so any member reading the page can trigger it.';

-- =============================================================================
-- ROLLBACK
-- -----------------------------------------------------------------------------
-- Re-run migration 0062's function body (without the safety_alert rows):
--   delete from public.engagement_templates  where type = 'safety_alert';
--   delete from public.engagement_automations where automation_type = 'safety_alert';
-- =============================================================================
