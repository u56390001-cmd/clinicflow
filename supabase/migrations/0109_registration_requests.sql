-- ============================================================================
-- 0109_registration_requests.sql
-- Pre-signup registration funnel (plan -> payment method -> details + proof ->
-- platform admin approval -> account provisioning).
--
-- There is no payment gateway yet, so every payment is verified manually by a
-- platform admin. This table is the intake queue for that flow:
--
--   * a visitor inserts a `pending` row (anonymous); the amount/currency are
--     forced from the plan row by a trigger, so a tampered request can never
--     under- or over-pay;
--   * a platform admin approves -> the auth user, the clinic, the owner
--     membership and an active subscription are provisioned, then the
--     credentials are emailed to the applicant;
--   * a platform admin rejects -> the reason is recorded and emailed.
--
-- The applicant cannot sign in before approval: the account simply does not
-- exist until an admin provisions it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Status enum
-- ---------------------------------------------------------------------------

do $$
begin
  create type public.registration_status as enum ('pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The intake queue
-- ---------------------------------------------------------------------------

create table if not exists public.registration_requests (
  id                   uuid primary key default gen_random_uuid(),
  -- Short human-quotable code the applicant can use to check status.
  reference_code        text not null unique,
  full_name            text not null check (char_length(btrim(full_name)) between 1 and 120),
  email                text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone                text not null check (char_length(btrim(phone)) between 3 and 32),
  clinic_name          text not null check (char_length(btrim(clinic_name)) between 1 and 120),
  clinic_address       text check (clinic_address is null or char_length(btrim(clinic_address)) between 1 and 240),
  plan_id              uuid not null references public.subscription_plans(id),
  payment_method_id    uuid not null references public.payment_methods(id),
  -- Authoritative values: the trigger below overwrites them from the plan.
  amount               numeric(10,2) not null check (amount > 0),
  currency             text not null default 'PKR',
  -- Payment evidence supplied by the applicant.
  sender_name          text not null,
  sender_phone         text not null,
  transaction_reference text not null,
  notes                text,
  proof_file_path      text,
  -- Workflow.
  status               public.registration_status not null default 'pending',
  rejection_reason     text,
  reviewed_by          uuid references auth.users(id) on delete set null,
  reviewed_at          timestamptz,
  -- Provisioning results (filled in by the admin approval flow).
  user_id              uuid references auth.users(id) on delete set null,
  clinic_id            uuid references public.clinics(id) on delete set null,
  subscription_id      uuid references public.subscriptions(id) on delete set null,
  provisioned_at       timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists registration_requests_status_idx
  on public.registration_requests (status, created_at desc);
create index if not exists registration_requests_email_idx
  on public.registration_requests (lower(email));

alter table public.registration_requests enable row level security;

-- Anonymous applicants may file a request, but only a pristine pending one.
-- The trigger below is what actually pins amount/currency/status.
create policy "Registrations: public insert pending"
  on public.registration_requests for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and rejection_reason is null
    and user_id is null
    and clinic_id is null
    and subscription_id is null
    and provisioned_at is null
  );

-- Platform admins own the queue.
create policy "Registrations: admin full access"
  on public.registration_requests for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create trigger registration_requests_set_updated_at
  before update on public.registration_requests
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Guard trigger
-- ---------------------------------------------------------------------------
-- On INSERT the plan row is the single source of truth for the amount and the
-- currency, and every review/provisioning column is reset. On UPDATE only a
-- platform admin (or the service-role server action) may write.
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
  if not (
    public.is_platform_admin()
    or current_setting('request.jwt.claim.role', true) = 'service_role'
  ) then
    raise exception using errcode = '42501', message = 'REGISTRATION_UPDATE_NOT_ALLOWED';
  end if;

  return new;
end;
$$;

drop trigger if exists registration_requests_guard on public.registration_requests;
create trigger registration_requests_guard
  before insert or update on public.registration_requests
  for each row execute function public.registration_requests_guard();

-- ---------------------------------------------------------------------------
-- 4. Public status lookup
-- ---------------------------------------------------------------------------
-- The applicant has no account yet, so the only way for them to check on their
-- request is by reference code. `security definer` keeps the rest of the row
-- (payment details, internal ids) out of reach — the function returns a
-- deliberately small projection.
-- ---------------------------------------------------------------------------

create or replace function public.get_registration_status(p_reference_code text)
returns table (
  reference_code   text,
  status           public.registration_status,
  clinic_name      text,
  plan_name        text,
  amount           numeric,
  currency         text,
  created_at       timestamptz,
  reviewed_at      timestamptz,
  rejection_reason text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.reference_code,
    r.status,
    r.clinic_name,
    p.name,
    r.amount,
    r.currency,
    r.created_at,
    r.reviewed_at,
    r.rejection_reason
  from public.registration_requests r
  join public.subscription_plans p on p.id = r.plan_id
  where r.reference_code = upper(btrim(p_reference_code));
$$;

revoke all on function public.get_registration_status(text) from public;
grant execute on function public.get_registration_status(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Storage bucket for the payment proofs of pending registrations
-- ---------------------------------------------------------------------------
-- Uploaded with the service-role key by the server action; read only by
-- platform admins (through a short-lived signed URL).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('registration-proofs', 'registration-proofs', false)
on conflict (id) do nothing;

create policy "Registration proofs: admin read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'registration-proofs' and public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 6. Service-role subscriptions
-- ---------------------------------------------------------------------------
-- The provisioning flow writes the subscription through the service-role key
-- (the applicant is not a clinic member yet, so the clinic-scoped INSERT
-- policies do not apply). The billing guard trigger would otherwise reject a
-- non-`pending_payment` row, so service-role calls are exempted from it —
-- the service key already bypasses RLS entirely and is server-only.
-- ---------------------------------------------------------------------------

create or replace function public.subscriptions_guard()
returns trigger
language plpgsql
set search_path = public, auth
as $$
begin
  if public.is_platform_admin()
     or current_setting('request.jwt.claim.role', true) = 'service_role' then
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

notify pgrst, 'reload schema';
