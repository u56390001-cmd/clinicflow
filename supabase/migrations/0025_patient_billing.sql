-- =============================================================================
-- MedBook AI — Phase 19 | Migration 0025
-- Patient Billing, Payment Collection & Receipts
--
-- DESIGN NOTES
-- ------------
-- * Entirely separate from Phase 8's SaaS subscription billing. No shared
--   tables, policies, or routes.
-- * `patient_bills.visit_id` is nullable — bills can exist without a visit
--   (walk-in product sales, phone orders).
-- * A visit can have at most one bill (unique constraint on clinic_id +
--   visit_id WHERE visit_id IS NOT NULL), preventing duplicate charges.
-- * `collect_patient_payment` RPC is atomic: advisory-locked per clinic,
--   checks bill status, creates payment + receipt, updates bill and visit
--   payment_status in a single transaction. Idempotent against double-charge.
-- * Receipt numbers are per-clinic sequential, computed inside the RPC.
-- * `create_patient_bill` RPC creates a bill (with or without a visit)
--   and optionally collects payment in the same call.
-- =============================================================================

-- enum: patient_bill_status
do $$
begin
  create type public.patient_bill_status as enum ('pending', 'paid', 'partially_paid');
exception
  when duplicate_object then null;
end $$;

-- enum: patient_payment_method
do $$
begin
  create type public.patient_payment_method as enum (
    'cash', 'card', 'bank_transfer', 'jazzcash', 'easypaisa'
  );
exception
  when duplicate_object then null;
end $$;

-- table: patient_bills
create table if not exists public.patient_bills (
  id            uuid                         primary key default gen_random_uuid(),
  clinic_id     uuid                         not null references public.clinics (id) on delete cascade,
  visit_id      uuid,
  patient_id    uuid                         not null,
  total_amount  numeric(12,2)                not null default 0 check (total_amount >= 0),
  currency      text                         not null default 'PKR',
  status        public.patient_bill_status   not null default 'pending'::public.patient_bill_status,
  created_at    timestamptz                  not null default now(),
  updated_at    timestamptz                  not null default now()
);

-- one bill per visit per clinic (partial unique — only when visit_id is set)
create unique index if not exists patient_bills_clinic_visit_unique
  on public.patient_bills (clinic_id, visit_id)
  where visit_id is not null;

create index if not exists patient_bills_clinic_id_idx    on public.patient_bills (clinic_id);
create index if not exists patient_bills_patient_id_idx   on public.patient_bills (clinic_id, patient_id);
create index if not exists patient_bills_status_idx       on public.patient_bills (clinic_id, status);
create index if not exists patient_bills_visit_id_idx     on public.patient_bills (clinic_id, visit_id) where visit_id is not null;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'patient_bills_set_updated_at') then
    create trigger patient_bills_set_updated_at
      before update on public.patient_bills
      for each row
      execute function public.handle_updated_at();
  end if;
end $$;

-- table: patient_bill_items
create table if not exists public.patient_bill_items (
  id            uuid            primary key default gen_random_uuid(),
  clinic_id     uuid            not null references public.clinics (id) on delete cascade,
  bill_id       uuid            not null,
  description   text            not null check (char_length(btrim(description)) between 1 and 255),
  quantity      int             not null default 1 check (quantity > 0),
  unit_price    numeric(12,2)   not null check (unit_price >= 0),
  line_total    numeric(12,2)   not null check (line_total >= 0),
  created_at    timestamptz     not null default now()
);

create index if not exists patient_bill_items_bill_id_idx on public.patient_bill_items (bill_id);

do $$
begin
  alter table public.patient_bill_items
    add constraint patient_bill_items_bill_fkey
    foreign key (bill_id) references public.patient_bills (id) on delete cascade;
exception when duplicate_object then null;
end $$;

-- table: patient_payments
create table if not exists public.patient_payments (
  id                  uuid                        primary key default gen_random_uuid(),
  clinic_id           uuid                        not null references public.clinics (id) on delete cascade,
  bill_id             uuid                        not null,
  amount              numeric(12,2)               not null check (amount > 0),
  payment_method      public.patient_payment_method not null,
  collected_by_user_id uuid,
  collected_at        timestamptz                 not null default now(),
  created_at          timestamptz                 not null default now()
);

create index if not exists patient_payments_bill_id_idx on public.patient_payments (bill_id);

do $$
begin
  alter table public.patient_payments
    add constraint patient_payments_bill_fkey
    foreign key (bill_id) references public.patient_bills (id) on delete cascade;
exception when duplicate_object then null;
end $$;

-- table: receipts
create table if not exists public.receipts (
  id              uuid            primary key default gen_random_uuid(),
  clinic_id       uuid            not null references public.clinics (id) on delete cascade,
  bill_id         uuid            not null,
  receipt_number  int             not null,
  generated_at    timestamptz     not null default now(),
  pdf_path        text,

  constraint receipts_clinic_number_unique unique (clinic_id, receipt_number)
);

create index if not exists receipts_bill_id_idx on public.receipts (bill_id);

do $$
begin
  alter table public.receipts
    add constraint receipts_bill_fkey
    foreign key (bill_id) references public.patient_bills (id) on delete cascade;
exception when duplicate_object then null;
end $$;

-- RLS: enable
alter table public.patient_bills      enable row level security;
alter table public.patient_bill_items enable row level security;
alter table public.patient_payments   enable row level security;
alter table public.receipts           enable row level security;

-- RLS: patient_bills
drop policy if exists patient_bills_select_member on public.patient_bills;
create policy patient_bills_select_member
  on public.patient_bills for select to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists patient_bills_insert_member on public.patient_bills;
create policy patient_bills_insert_member
  on public.patient_bills for insert to authenticated
  with check (public.is_clinic_member(clinic_id));

drop policy if exists patient_bills_update_member on public.patient_bills;
create policy patient_bills_update_member
  on public.patient_bills for update to authenticated
  using (public.is_clinic_member(clinic_id))
  with check (public.is_clinic_member(clinic_id));

drop policy if exists patient_bills_delete_member on public.patient_bills;
create policy patient_bills_delete_member
  on public.patient_bills for delete to authenticated
  using (public.is_clinic_member(clinic_id));

-- RLS: patient_bill_items
drop policy if exists patient_bill_items_select_member on public.patient_bill_items;
create policy patient_bill_items_select_member
  on public.patient_bill_items for select to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists patient_bill_items_insert_member on public.patient_bill_items;
create policy patient_bill_items_insert_member
  on public.patient_bill_items for insert to authenticated
  with check (public.is_clinic_member(clinic_id));

drop policy if exists patient_bill_items_delete_member on public.patient_bill_items;
create policy patient_bill_items_delete_member
  on public.patient_bill_items for delete to authenticated
  using (public.is_clinic_member(clinic_id));

-- RLS: patient_payments
drop policy if exists patient_payments_select_member on public.patient_payments;
create policy patient_payments_select_member
  on public.patient_payments for select to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists patient_payments_insert_member on public.patient_payments;
create policy patient_payments_insert_member
  on public.patient_payments for insert to authenticated
  with check (public.is_clinic_member(clinic_id));

-- RLS: receipts
drop policy if exists receipts_select_member on public.receipts;
create policy receipts_select_member
  on public.receipts for select to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists receipts_insert_member on public.receipts;
create policy receipts_insert_member
  on public.receipts for insert to authenticated
  with check (public.is_clinic_member(clinic_id));

-- RPC: create_patient_bill
-- Creates a bill with line items. Optionally links to a visit.
-- If visit_id is provided and a bill already exists for that visit, returns
-- the existing bill (idempotent).
create or replace function public.create_patient_bill(
  p_clinic_id    uuid,
  p_patient_id   uuid,
  p_visit_id     uuid default null,
  p_items        jsonb default '[]'::jsonb,
  p_currency     text  default 'PKR'
) returns public.patient_bills
language plpgsql
volatile
security invoker
set search_path = public, auth
as $$
declare
  v_bill       public.patient_bills;
  v_total      numeric(12,2) := 0;
  v_item       jsonb;
  v_line_total numeric(12,2);
begin
  -- idempotent: if visit_id provided and bill exists, return it
  if p_visit_id is not null then
    select b.* into v_bill
    from public.patient_bills b
    where b.clinic_id = p_clinic_id
      and b.visit_id = p_visit_id;

    if v_bill is not null then
      return v_bill;
    end if;
  end if;

  -- calculate total from items
  for v_item in select jsonb_array_elements(p_items)
  loop
    v_line_total := ((v_item->>'quantity')::int) * ((v_item->>'unit_price')::numeric(12,2));
    v_total := v_total + v_line_total;
  end loop;

  -- insert bill
  insert into public.patient_bills (clinic_id, visit_id, patient_id, total_amount, currency, status)
  values (p_clinic_id, p_visit_id, p_patient_id, v_total, p_currency,
    case when v_total > 0 then 'pending'::public.patient_bill_status else 'paid'::public.patient_bill_status end)
  returning * into v_bill;

  -- insert line items
  for v_item in select jsonb_array_elements(p_items)
  loop
    v_line_total := ((v_item->>'quantity')::int) * ((v_item->>'unit_price')::numeric(12,2));
    insert into public.patient_bill_items (clinic_id, bill_id, description, quantity, unit_price, line_total)
    values (p_clinic_id, v_bill.id,
      v_item->>'description',
      (v_item->>'quantity')::int,
      (v_item->>'unit_price')::numeric(12,2),
      v_line_total);
  end loop;

  return v_bill;
end;
$$;

-- RPC: collect_patient_payment
-- Idempotent: if bill is already 'paid', returns the existing receipt.
-- Advisory-locked per clinic to prevent concurrent double-charges.
create or replace function public.collect_patient_payment(
  p_clinic_id       uuid,
  p_bill_id         uuid,
  p_payment_method  public.patient_payment_method,
  p_amount          numeric(12,2)
) returns public.receipts
language plpgsql
volatile
security invoker
set search_path = public, auth
as $$
declare
  v_bill         public.patient_bills;
  v_receipt      public.receipts;
  v_receipt_num  int;
begin
  -- advisory lock per clinic
  perform pg_advisory_xact_lock(hashtextextended('medbook-billing-' || p_clinic_id::text, 0));

  -- fetch bill (must belong to this clinic)
  select b.* into v_bill
  from public.patient_bills b
  where b.id = p_bill_id
    and b.clinic_id = p_clinic_id;

  if v_bill is null then
    raise exception using errcode = 'P0001', message = 'BILL_NOT_FOUND';
  end if;

  -- idempotent: if already paid, return existing receipt
  if v_bill.status = 'paid'::public.patient_bill_status then
    select r.* into v_receipt
    from public.receipts r
    where r.bill_id = p_bill_id
      and r.clinic_id = p_clinic_id;

    if v_receipt is not null then
      return v_receipt;
    end if;
  end if;

  -- record payment
  insert into public.patient_payments (clinic_id, bill_id, amount, payment_method, collected_by_user_id)
  values (p_clinic_id, p_bill_id, p_amount, p_payment_method, (select auth.uid()));

  -- update bill status
  update public.patient_bills b
  set status = 'paid'::public.patient_bill_status
  where b.id = p_bill_id
    and b.clinic_id = p_clinic_id;

  -- compute next receipt number for this clinic
  select coalesce(max(r.receipt_number), 0) + 1
  into v_receipt_num
  from public.receipts r
  where r.clinic_id = p_clinic_id;

  -- create receipt
  insert into public.receipts (clinic_id, bill_id, receipt_number)
  values (p_clinic_id, p_bill_id, v_receipt_num)
  returning * into v_receipt;

  -- update linked visit's payment_status if bill has a visit
  if v_bill.visit_id is not null then
    update public.visits v
    set payment_status = 'collected_post'::public.payment_status,
        updated_at = now()
    where v.id = v_bill.visit_id
      and v.clinic_id = p_clinic_id;
  end if;

  return v_receipt;
end;
$$;
