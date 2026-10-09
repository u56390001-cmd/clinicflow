-- ============================================================================
-- 0066_rls_hardening_billing.sql  (B3, B4, B5)
-- Zero-trust multi-tenancy hardening — part 3 of 7.
--
-- Closes subscription self-activation, payment-proof forgery, and forgeable
-- billing events, while preserving the legitimate flows the app performs:
--   * a clinic admin may create a `pending_payment` subscription
--     (submitPaymentAction) and may move it pending -> payment_submitted;
--   * a platform admin may approve/reject submissions and activate.
--
-- Idempotent. Rollback: re-apply 0010 policies/triggers (note: this re-opens
-- the self-activation and forgery paths — only for emergency rollback).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- B3: subscriptions — INSERT limited to a fresh `pending_payment` row.
-- ---------------------------------------------------------------------------
drop policy if exists "Subscriptions: admin insert own"  on public.subscriptions;
drop policy if exists "Subscriptions: clinic insert own" on public.subscriptions;
create policy "Subscriptions: clinic insert own"
  on public.subscriptions for insert
  to authenticated
  with check (
    public.is_clinic_member(clinic_id)
    and status = 'pending_payment'
    and current_period_start is null
    and current_period_end is null
    and exists (
      select 1 from public.subscription_plans
      where id = plan_id and active = true
    )
  );

-- B3: UPDATE stays available to the clinic (needed for the payment_submitted
-- transition) but a trigger below restricts *which* columns may change.
drop policy if exists "Subscriptions: admin update own"  on public.subscriptions;
drop policy if exists "Subscriptions: clinic update own" on public.subscriptions;
create policy "Subscriptions: clinic update own"
  on public.subscriptions for update
  to authenticated
  using (public.is_clinic_member(clinic_id))
  with check (public.is_clinic_member(clinic_id));

-- B3: INSERT/UPDATE guard — non platform-admins can only create a pending row
-- and can only advance it to `payment_submitted`. plan/period columns are
-- immutable for them, so `active` can never be set from the client.
create or replace function public.subscriptions_guard()
returns trigger
language plpgsql
set search_path = public, auth
as $$
begin
  if public.is_platform_admin() then
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

drop trigger if exists subscriptions_guard on public.subscriptions;
create trigger subscriptions_guard
  before insert or update on public.subscriptions
  for each row execute function public.subscriptions_guard();

-- ---------------------------------------------------------------------------
-- B4: payment_submissions — inserts must be a fresh, pending, own-clinic row.
-- ---------------------------------------------------------------------------
drop policy if exists "Submissions: admin insert own"  on public.payment_submissions;
drop policy if exists "Submissions: clinic insert own" on public.payment_submissions;
create policy "Submissions: clinic insert own"
  on public.payment_submissions for insert
  to authenticated
  with check (
    public.is_clinic_admin(clinic_id)
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and rejection_reason is null
    and exists (
      select 1 from public.subscriptions s
      where s.id = subscription_id and s.clinic_id = clinic_id
    )
  );

-- B4: the amount/currency, status and review columns are DB-authoritative.
-- The plan price is the single source of truth; the client's amount/currency
-- are overwritten so a tampered request cannot under/over-pay.
create or replace function public.payment_submissions_guard()
returns trigger
language plpgsql
set search_path = public, auth
as $$
declare
  v_price    numeric;
  v_currency text;
begin
  if public.is_platform_admin() then
    return new;
  end if;

  select p.price, p.currency
  into v_price, v_currency
  from public.subscriptions s
  join public.subscription_plans p on p.id = s.plan_id
  where s.id = new.subscription_id
    and s.clinic_id = new.clinic_id;

  if v_price is null then
    raise exception using errcode = '22023', message = 'SUBSCRIPTION_PLAN_NOT_RESOLVED';
  end if;

  new.amount        := v_price;
  new.currency      := v_currency;
  new.status        := 'pending';
  new.reviewed_by   := null;
  new.reviewed_at   := null;
  new.rejection_reason := null;

  return new;
end;
$$;

drop trigger if exists payment_submissions_guard on public.payment_submissions;
create trigger payment_submissions_guard
  before insert on public.payment_submissions
  for each row execute function public.payment_submissions_guard();

-- ---------------------------------------------------------------------------
-- B5: billing_events — no `WITH CHECK (true)`. Authenticated callers may only
-- append an event they are the actor of, for a subscription they administer
-- (or as platform admin). System/NULL-clinic events continue via service role.
-- ---------------------------------------------------------------------------
drop policy if exists "Billing events: system insert" on public.billing_events;
drop policy if exists "Billing events: actor insert"  on public.billing_events;
create policy "Billing events: actor insert"
  on public.billing_events for insert
  to authenticated
  with check (
    (actor_user_id is null or actor_user_id = (select auth.uid()))
    and (
      public.is_platform_admin()
      or (
        subscription_id is not null
        and exists (
          select 1 from public.subscriptions s
          where s.id = subscription_id
            and public.is_clinic_admin(s.clinic_id)
        )
      )
    )
  );

notify pgrst, 'reload schema';
