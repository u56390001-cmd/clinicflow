-- ============================================================================
-- 0111_payment_submission_plan.sql
-- Makes the selected plan authoritative for a payment submission.
--
-- Until now a checkout never sent the plan it had selected, and the DB guard
-- priced every submission from the *subscription's* plan — so a clinic paying
-- for a different plan was charged the old plan's price. The submission now
-- carries the plan it was made for, the guard prices it from that plan, and
-- the platform admin applies the plan when approving.
--
-- Existing rows keep `plan_id = null`, which falls back to the subscription's
-- plan exactly as before.
-- ============================================================================

alter table public.payment_submissions
  add column if not exists plan_id uuid references public.subscription_plans(id);

create index if not exists payment_submissions_plan_idx
  on public.payment_submissions (plan_id);

-- ---------------------------------------------------------------------------
-- Guard: the price comes from the submitted plan, falling back to the
-- subscription's plan for submissions that predate this column.
-- ---------------------------------------------------------------------------

create or replace function public.payment_submissions_guard()
returns trigger
language plpgsql
set search_path = public, auth
as $$
declare
  v_price    numeric;
  v_currency text;
begin
  if public.is_platform_admin() or public.is_service_role() then
    return new;
  end if;

  select p.price, p.currency
  into v_price, v_currency
  from public.subscriptions s
  join public.subscription_plans p
    on p.id = coalesce(new.plan_id, s.plan_id)
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

notify pgrst, 'reload schema';
