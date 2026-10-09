-- ============================================================================
-- 0065_rls_hardening_functions.sql  (B1, B1b, B3, AUTO-4)
-- Zero-trust multi-tenancy hardening — part 2 of 7.
--
-- SECURITY DEFINER RPCs bypass RLS, so each must prove membership itself.
--   * start_consultation / complete_and_advance — add `is_clinic_member` gate.
--   * ensure_engagement_defaults               — add `is_clinic_member` gate.
--   * activate_subscription                     — add `is_platform_admin` gate.
--   * get_or_create_subscription                — add membership + plan checks.
--
-- Signatures are unchanged (Section 9 rule 2). Bodies are otherwise identical
-- to their previous definitions so behaviour only changes for callers that were
-- already committing cross-tenant access.
--
-- Idempotent (CREATE OR REPLACE). Rollback: re-apply 0040 (start/complete),
-- 0062 (ensure_engagement_defaults), 0010 (activate/get_or_create).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- B1: start_consultation — definer, search_path='', now membership-gated.
-- ---------------------------------------------------------------------------
create or replace function public.start_consultation(
  p_clinic_id  uuid,
  p_visit_id   uuid
)
returns public.visits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit public.visits%rowtype;
  v_doctor_id uuid;
  v_lock_key bigint;
begin
  if not public.is_clinic_member(p_clinic_id) then
    raise exception using errcode = '42501', message = 'NOT_A_CLINIC_MEMBER';
  end if;

  -- fetch the target visit (must be waiting, in this clinic) to learn its doctor
  select * into v_visit
  from public.visits
  where id = p_visit_id
    and clinic_id = p_clinic_id
    and status = 'waiting';

  if not found then
    raise exception 'Visit not found or not eligible for consultation.';
  end if;

  v_doctor_id := v_visit.doctor_id;

  -- acquire advisory lock per doctor (or per doctor-less bucket), not per clinic
  v_lock_key := hashtext(p_clinic_id::text || ':' || coalesce(v_doctor_id::text, ''));
  perform pg_advisory_xact_lock(v_lock_key);

  -- ensure the same doctor has no other visit in_consultation
  if exists (
    select 1 from public.visits
    where clinic_id = p_clinic_id
      and doctor_id is not distinct from v_doctor_id
      and status = 'in_consultation'
      and id != p_visit_id
  ) then
    raise exception 'Another patient is currently in consultation. Complete that consultation first.';
  end if;

  update public.visits
  set status = 'in_consultation',
      consultation_started_at = now(),
      updated_at = now()
  where id = p_visit_id
    and clinic_id = p_clinic_id;

  select * into v_visit
  from public.visits
  where id = p_visit_id
    and clinic_id = p_clinic_id;

  return v_visit;
end;
$$;

-- ---------------------------------------------------------------------------
-- B1: complete_and_advance — definer, search_path='', now membership-gated.
-- ---------------------------------------------------------------------------
create or replace function public.complete_and_advance(
  p_clinic_id  uuid,
  p_visit_id   uuid
)
returns public.visits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.visits%rowtype;
  v_next public.visits%rowtype;
  v_lock_key bigint;
begin
  if not public.is_clinic_member(p_clinic_id) then
    raise exception using errcode = '42501', message = 'NOT_A_CLINIC_MEMBER';
  end if;

  select * into v_current
  from public.visits
  where id = p_visit_id
    and clinic_id = p_clinic_id
    and status = 'in_consultation';

  if not found then
    raise exception 'Visit not found or not currently in consultation.';
  end if;

  v_lock_key := hashtext(p_clinic_id::text || ':' || coalesce(v_current.doctor_id::text, ''));
  perform pg_advisory_xact_lock(v_lock_key);

  update public.visits
  set status = 'completed',
      completed_at = now(),
      updated_at = now()
  where id = p_visit_id
    and clinic_id = p_clinic_id;

  select * into v_next
  from public.visits
  where clinic_id = p_clinic_id
    and doctor_id is not distinct from v_current.doctor_id
    and status = 'waiting'
  order by queue_position asc
  limit 1;

  if found then
    update public.visits
    set status = 'in_consultation',
        consultation_started_at = now(),
        updated_at = now()
    where id = v_next.id
      and clinic_id = p_clinic_id;

    select * into v_next
    from public.visits
    where id = v_next.id
      and clinic_id = p_clinic_id;

    return v_next;
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- B1b: ensure_engagement_defaults — definer, now membership-gated.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_engagement_defaults(p_clinic_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not public.is_clinic_member(p_clinic_id) then
    raise exception using errcode = '42501', message = 'NOT_A_CLINIC_MEMBER';
  end if;

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
    ('appointment_reminder',     true, '{"delay_hours": 24}'::jsonb),
    ('appointment_confirmation', true, '{}'::jsonb),
    ('review_request',           true, '{"delay_hours": 24}'::jsonb),
    ('prescription_delivery',    true, '{}'::jsonb),
    ('receipt_delivery',         true, '{}'::jsonb),
    ('check_in',                 true, '{}'::jsonb),
    ('no_show_recovery',         true, '{"delay_hours": 24}'::jsonb),
    ('auto_follow_up',           true, '{"days_after": 3}'::jsonb),
    ('general',                  true, '{"maps_link": ""}'::jsonb)
  ) as v(automation_type, enabled, config)
  on conflict (clinic_id, automation_type) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- B3: activate_subscription — platform-admin only. Kept SECURITY INVOKER so
-- the admin's own RLS still applies; the explicit gate documents intent and
-- is callable by platform admins (service_role also passes via bypassrls).
-- ---------------------------------------------------------------------------
create or replace function public.activate_subscription(
  p_subscription_id uuid,
  p_duration_days   integer default 30
)
returns public.subscriptions
language plpgsql
set search_path = public, auth
as $$
declare
  v_sub public.subscriptions;
  v_start timestamptz := now();
  v_end timestamptz := now() + (p_duration_days || ' days')::interval;
begin
  if not public.is_platform_admin() then
    raise exception using errcode = '42501', message = 'NOT_A_PLATFORM_ADMIN';
  end if;

  update public.subscriptions
  set
    status = 'active',
    current_period_start = v_start,
    current_period_end = v_end,
    updated_at = now()
  where id = p_subscription_id
  returning * into v_sub;

  if v_sub is null then
    raise exception 'Subscription not found';
  end if;

  return v_sub;
end;
$$;

-- ---------------------------------------------------------------------------
-- AUTO-4: get_or_create_subscription — caller must belong to the clinic and
-- the plan must be a real, active plan. SECURITY INVOKER kept (RLS is a second
-- gate), but the definer helpers below make the intent explicit.
-- ---------------------------------------------------------------------------
create or replace function public.get_or_create_subscription(
  p_clinic_id uuid,
  p_plan_id   uuid
)
returns public.subscriptions
language plpgsql
set search_path = public, auth
as $$
declare
  v_sub public.subscriptions;
begin
  if not public.is_clinic_member(p_clinic_id) then
    raise exception using errcode = '42501', message = 'NOT_A_CLINIC_MEMBER';
  end if;

  if not exists (
    select 1 from public.subscription_plans
    where id = p_plan_id and active = true
  ) then
    raise exception using errcode = '22023', message = 'INVALID_PLAN';
  end if;

  select * into v_sub
  from public.subscriptions
  where clinic_id = p_clinic_id
  order by created_at desc
  limit 1;

  if v_sub is not null then
    return v_sub;
  end if;

  insert into public.subscriptions (clinic_id, plan_id, status)
  values (p_clinic_id, p_plan_id, 'pending_payment')
  returning * into v_sub;

  return v_sub;
end;
$$;

notify pgrst, 'reload schema';
