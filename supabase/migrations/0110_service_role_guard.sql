-- ============================================================================
-- 0110_service_role_guard.sql
-- Fixes the service-role detection used by the billing/registration guards.
--
-- 0109 guarded the service-role path with
-- `current_setting('request.jwt.claim.role', true) = 'service_role'`. That GUC
-- is the legacy PostgREST form: PostgREST v9 (and therefore Supabase) exposes
-- the JWT as a single `request.jwt.claims` JSON blob, so the individual
-- `request.jwt.claim.<name>` settings are never populated and the check
-- silently failed — a service-role insert of an `active` subscription was
-- rejected with SUBSCRIPTION_INSERT_NOT_ALLOWED.
--
-- `public.is_service_role()` reads both forms and is used by the two guards
-- that the server-only provisioning flow has to pass. Ordinary authenticated
-- callers are unaffected: for them it is false, exactly as before.
-- ============================================================================

create or replace function public.is_service_role()
returns boolean
language sql
stable
set search_path = public
as $$
  select
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or coalesce(
         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
         ''
       ) = 'service_role';
$$;

-- ---------------------------------------------------------------------------
-- subscriptions guard
-- ---------------------------------------------------------------------------

create or replace function public.subscriptions_guard()
returns trigger
language plpgsql
set search_path = public, auth
as $$
begin
  if public.is_platform_admin() or public.is_service_role() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'pending_payment'
       or new.current_period_start is not null
       or new.current_period_end is not null then
      raise exception using errcode = '42501', message = 'SUBSCRIPTION_INSERT_NOT_ALLOWED';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.plan_id is distinct from old.plan_id
     or new.current_period_start is distinct from old.current_period_start
     or new.current_period_end is distinct from old.current_period_end then
    raise exception using errcode = '42501', message = 'SUBSCRIPTION_FIELDS_IMMUTABLE';
  end if;

  if new.status is distinct from old.status then
    if not (old.status in ('pending_payment', 'payment_submitted', 'rejected', 'expired')
            and new.status = 'payment_submitted') then
      raise exception using errcode = '42501', message = 'SUBSCRIPTION_STATUS_TRANSITION_NOT_ALLOWED';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- registration requests guard
-- ---------------------------------------------------------------------------

create or replace function public.registration_requests_guard()
returns trigger
language plpgsql
set search_path = public, auth
as $$
declare
  v_price    numeric;
  v_currency text;
begin
  if tg_op = 'INSERT' then
    select p.price, p.currency
    into v_price, v_currency
    from public.subscription_plans p
    where p.id = new.plan_id and p.active = true;

    if v_price is null then
      raise exception using errcode = '22023', message = 'REGISTRATION_PLAN_NOT_RESOLVED';
    end if;

    new.amount           := v_price;
    new.currency         := v_currency;
    new.status           := 'pending';
    new.reviewed_by      := null;
    new.reviewed_at      := null;
    new.rejection_reason := null;
    new.user_id          := null;
    new.clinic_id        := null;
    new.subscription_id  := null;
    new.provisioned_at   := null;

    return new;
  end if;

  -- UPDATE
  if not (public.is_platform_admin() or public.is_service_role()) then
    raise exception using errcode = '42501', message = 'REGISTRATION_UPDATE_NOT_ALLOWED';
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
