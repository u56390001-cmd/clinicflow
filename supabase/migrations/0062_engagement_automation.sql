-- =============================================================================
-- MedBook AI — Patient Engagement & Automation | Migration 0062
--
-- Backing tables for the /app/engagement page. The page is the control room
-- for clinic-to-patient communication: reminder and confirmation templates,
-- automation toggles (review requests, prescription/receipt delivery, check-in,
-- no-show recovery, auto follow-up), an outbound message log, and the Google
-- reviews the metrics dashboard reads (count + average rating).
--
-- DESIGN NOTES
-- ------------
-- * Templates and toggles are split across two tables so a toggled-off
--   automation (e.g. prescription delivery) can still keep its draft message.
--   `engagement_templates` owns message copy; `engagement_automations` owns
--   the on/off switch plus any JSON config (delay hours, review URL, ...).
--   Rows are keyed by a Text type (not a Postgres enum) so the catalogue can
--   grow without a migration — same choice as 0061's ticket types.
--
-- * `clinic_reviews` exists so "Google Reviews" and "Average Rating" are real
--   numbers (recorded by the clinic team) rather than mocked counts. The
--   `source` column keeps honest bookkeeping: 'google' vs 'manual'.
--
-- * `engagement_logs` is append-only and written by the reminder cron / other
--   dispatchers, never by a browser action. RLS exposes member SELECT only so
--   the metrics card can count sent messages; inserts come from the service
--   role, which bypasses RLS.
--
-- * RLS split follows 0060/0061: members read, admins write (config) for the
--   automation tables; any member may record a review (front-desk staff log
--   ratings); logs are read-only to the app.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. engagement_automations
-- ----------------------------------------------------------------------------
create table if not exists public.engagement_automations (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references public.clinics(id) on delete cascade,
  -- One row per automation: appointment_reminder, review_request,
  -- prescription_delivery, receipt_delivery, check_in, appointment_confirmation,
  -- no_show_recovery, auto_follow_up, general (page-level misc settings).
  automation_type  text not null check (char_length(automation_type) between 1 and 64),
  enabled          boolean not null default true,
  -- JSON runtime config, e.g. {"delay_hours": 24, "store_opening_time": "09:00 AM"}.
  config           jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint engagement_automations_clinic_type_key unique (clinic_id, automation_type)
);

comment on table public.engagement_automations is
  'Per-clinic automation toggles and config for the /app/engagement page.';
comment on column public.engagement_automations.enabled is
  'Whether the automation is currently switched on in the page.';
comment on column public.engagement_automations.config is
  'Automation-specific JSON, e.g. delay hours or the Google Maps link.';

-- Partial index for the cron path: find enabled automations of a given type fast.
create index if not exists engagement_automations_enabled_type_idx
  on public.engagement_automations (automation_type, enabled)
  where enabled is true;

-- ----------------------------------------------------------------------------
-- 2. engagement_templates
-- ----------------------------------------------------------------------------
create table if not exists public.engagement_templates (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references public.clinics(id) on delete cascade,
  -- appointment_confirmation, appointment_reminder, review_request,
  -- prescription_delivery, receipt_delivery, check_in, no_show_recovery,
  -- auto_follow_up. Same vocabulary as engagement_automations.
  type          text not null check (char_length(type) between 1 and 64),
  template_text text not null check (char_length(btrim(template_text)) between 1 and 2000),
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint engagement_templates_clinic_type_key unique (clinic_id, type)
);

comment on table public.engagement_templates is
  'Per-clinic WhatsApp message templates for each engagement type.';
comment on column public.engagement_templates.template_text is
  'Supports {patient_name}, {doctor_name}, {clinic_name}, {clinic_location}, {appointment_date}, {appointment_time} variables.';

-- ----------------------------------------------------------------------------
-- 3. engagement_logs
-- ----------------------------------------------------------------------------
create table if not exists public.engagement_logs (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  patient_id      uuid references public.patients(id) on delete set null,
  automation_type text not null check (char_length(automation_type) between 1 and 64),
  -- queued, sent, failed, delivered. Written by the dispatcher/cron.
  message_status  text not null default 'queued' check (message_status in ('queued', 'sent', 'failed', 'delivered')),
  response_data   jsonb not null default '{}'::jsonb,
  sent_at         timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

comment on table public.engagement_logs is
  'Append-only outbound engagement message log powering the Reminders Sent metric.';

create index if not exists engagement_logs_clinic_sent_idx
  on public.engagement_logs (clinic_id, sent_at desc);
create index if not exists engagement_logs_clinic_type_idx
  on public.engagement_logs (clinic_id, automation_type, sent_at desc);
create index if not exists engagement_logs_patient_idx
  on public.engagement_logs (patient_id, sent_at desc);

-- ----------------------------------------------------------------------------
-- 4. clinic_reviews
-- ----------------------------------------------------------------------------
create table if not exists public.clinic_reviews (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references public.clinics(id) on delete cascade,
  rating        int not null check (rating between 1 and 5),
  reviewer_name text check (reviewer_name is null or char_length(btrim(reviewer_name)) between 1 and 100),
  comment       text check (comment is null or char_length(btrim(comment)) between 1 and 2000),
  -- Keeps the source honest: 'google' (imported) vs 'manual' (logged in-app).
  source        text not null default 'google' check (source in ('google', 'manual')),
  created_at    timestamptz not null default now()
);

comment on table public.clinic_reviews is
  'Google reviews recorded for the engagement metrics cards.';
comment on column public.clinic_reviews.source is
  '"google" when imported from Google, "manual" when logged by the clinic team.';

create index if not exists clinic_reviews_clinic_created_idx
  on public.clinic_reviews (clinic_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 5. Default seeding (SECURITY DEFINER)
-- ----------------------------------------------------------------------------
-- The page's row set is seeded lazily on first read. Seeding must work for any
-- clinic member (staff read the page too, but only admins may write the same
-- tables), so it runs under a SECURITY DEFINER helper that bypasses RLS and
-- inserts only what is missing — `on conflict do nothing` keeps a clinic's
-- custom copy safe on re-runs.
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
     'Hi {patient_name}! Hope you''re recovering well after your visit with {doctor_name}. 💙 Reply with any concerns or to schedule a follow-up.')
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
    ('general',                true, '{"maps_link": ""}'::jsonb)
  ) as v(automation_type, enabled, config)
  on conflict (clinic_id, automation_type) do nothing;
end;
$$;

comment on function public.ensure_engagement_defaults(uuid) is
  'Idempotently seeds a clinic''s engagement templates and automations (migration 0062). SECURITY DEFINER so any member reading the page can trigger it.';

grant execute on function public.ensure_engagement_defaults(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Updated-at triggers
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'engagement_automations_updated_at') then
    create trigger engagement_automations_updated_at
      before update on public.engagement_automations
      for each row execute function public.handle_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'engagement_templates_updated_at') then
    create trigger engagement_templates_updated_at
      before update on public.engagement_templates
      for each row execute function public.handle_updated_at();
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 7. RLS
-- ----------------------------------------------------------------------------
alter table public.engagement_automations enable row level security;
alter table public.engagement_templates enable row level security;
alter table public.engagement_logs enable row level security;
alter table public.clinic_reviews enable row level security;

-- Engagement automations — members read, admins write.
create policy "Engagement automations: member read"
  on public.engagement_automations for select
  using (public.is_clinic_member(clinic_id));

create policy "Engagement automations: admin insert"
  on public.engagement_automations for insert
  with check (public.is_clinic_admin(clinic_id));

create policy "Engagement automations: admin update"
  on public.engagement_automations for update
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));

-- Engagement templates — members read, admins write.
create policy "Engagement templates: member read"
  on public.engagement_templates for select
  using (public.is_clinic_member(clinic_id));

create policy "Engagement templates: admin insert"
  on public.engagement_templates for insert
  with check (public.is_clinic_admin(clinic_id));

create policy "Engagement templates: admin update"
  on public.engagement_templates for update
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));

-- Engagement logs — members may read (metrics), no app writes.
create policy "Engagement logs: member read"
  on public.engagement_logs for select
  using (public.is_clinic_member(clinic_id));

-- Clinic reviews — members read and record, admins manage.
create policy "Clinic reviews: member read"
  on public.clinic_reviews for select
  using (public.is_clinic_member(clinic_id));

create policy "Clinic reviews: member insert"
  on public.clinic_reviews for insert
  with check (public.is_clinic_member(clinic_id));

create policy "Clinic reviews: admin update"
  on public.clinic_reviews for update
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));

-- =============================================================================
-- ROLLBACK
-- -----------------------------------------------------------------------------
-- drop table if exists public.clinic_reviews;
-- drop table if exists public.engagement_logs;
-- drop table if exists public.engagement_templates;
-- drop table if exists public.engagement_automations;
-- =============================================================================
-- VERIFICATION (manual)
-- -----------------------------------------------------------------------------
-- 1. A clinic admin can upsert an automation and a template; a non-member cannot.
-- 2. A member can read automations/templates/logs/reviews for their clinic only.
-- 3. A member (front desk) can insert a clinic_reviews row for their clinic.
-- 4. No API user can insert into engagement_logs (service role only) — RLS blocks it.
-- 5. Re-running the migration changes nothing.
-- =============================================================================