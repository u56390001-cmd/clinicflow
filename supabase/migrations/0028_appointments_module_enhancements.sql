-- =============================================================================
-- MedBook AI — Appointments Module Enhancements | Migration 0028
--
-- Additive, non-destructive migration:
-- * Extends vitals table with structured BP, SpO2, respiratory rate, BMI
-- * Extends patient_payment_method enum with 'upi' and 'waive'
-- * Adds discount_amount and discount_percent to patient_bills
-- * Updates record_vitals RPC to accept new fields + auto-compute BMI
-- * Adds collect_patient_payment overload supporting 'waive' (zero-charge)
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend vitals table with new columns
-- ----------------------------------------------------------------------------
do $$
begin
  -- Split BP into systolic/diastolic (keep blood_pressure for backward compat)
  alter table public.vitals add column if not exists systolic_bp   int check (systolic_bp is null or (systolic_bp >= 50 and systolic_bp <= 300));
  alter table public.vitals add column if not exists diastolic_bp  int check (diastolic_bp is null or (diastolic_bp >= 20 and diastolic_bp <= 200));
  alter table public.vitals add column if not exists spo2          int check (spo2 is null or (spo2 >= 0 and spo2 <= 100));
  alter table public.vitals add column if not exists respiratory_rate int check (respiratory_rate is null or (respiratory_rate >= 4 and respiratory_rate <= 60));
  alter table public.vitals add column if not exists bmi           numeric(5,2) check (bmi is null or (bmi >= 5 and bmi <= 80));
exception
  when duplicate_column then null;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Extend patient_payment_method enum with 'upi' and 'waive'
-- ----------------------------------------------------------------------------
do $$
begin
  alter type public.patient_payment_method add value if not exists 'upi' before 'jazzcash';
  alter type public.patient_payment_method add value if not exists 'waive' after 'easypaisa';
exception
  when duplicate_object then null;
  when invalid_parameter_value then null;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Add discount columns to patient_bills
-- ----------------------------------------------------------------------------
do $$
begin
  alter table public.patient_bills add column if not exists discount_amount  numeric(12,2) default 0 check (discount_amount >= 0);
  alter table public.patient_bills add column if not exists discount_percent numeric(5,2)  default 0 check (discount_percent >= 0 and discount_percent <= 100);
exception
  when duplicate_column then null;
end $$;

-- ----------------------------------------------------------------------------
-- 4. Update record_vitals RPC to accept new fields + auto-compute BMI
-- ----------------------------------------------------------------------------
create or replace function public.record_vitals(
  p_visit_id         uuid,
  p_blood_pressure   text,
  p_temperature      numeric,
  p_pulse            int,
  p_weight           numeric,
  p_height           numeric,
  p_systolic_bp      int default null,
  p_diastolic_bp     int default null,
  p_spo2             int default null,
  p_respiratory_rate int default null
) returns public.vitals
language plpgsql
volatile
security invoker
set search_path = public, auth
as $$
declare
  v_clinic_id uuid;
  v_vitals    public.vitals;
  v_bmi       numeric;
begin
  -- Resolve clinic from visit
  select v.clinic_id into v_clinic_id
  from public.visits v
  where v.id = p_visit_id;

  if v_clinic_id is null then
    raise exception using errcode = 'P0001', message = 'VISIT_NOT_FOUND';
  end if;

  -- Auto-compute BMI if both height (cm) and weight (kg) are provided
  if p_height > 0 and p_weight > 0 then
    v_bmi := round((p_weight / ((p_height / 100.0) * (p_height / 100.0)))::numeric, 2);
  else
    v_bmi := null;
  end if;

  -- Upsert: one vitals record per visit
  insert into public.vitals (
    clinic_id, visit_id, recorded_by,
    blood_pressure, temperature, pulse, weight, height,
    systolic_bp, diastolic_bp, spo2, respiratory_rate, bmi
  ) values (
    v_clinic_id, p_visit_id, (select auth.uid()),
    nullif(btrim(p_blood_pressure), ''),
    nullif(p_temperature, 0),
    nullif(p_pulse, 0),
    nullif(p_weight, 0),
    nullif(p_height, 0),
    nullif(p_systolic_bp, 0),
    nullif(p_diastolic_bp, 0),
    nullif(p_spo2, 0),
    nullif(p_respiratory_rate, 0),
    v_bmi
  )
  on conflict (clinic_id, visit_id) do update set
    blood_pressure   = excluded.blood_pressure,
    temperature      = excluded.temperature,
    pulse            = excluded.pulse,
    weight           = excluded.weight,
    height           = excluded.height,
    systolic_bp      = excluded.systolic_bp,
    diastolic_bp     = excluded.diastolic_bp,
    spo2             = excluded.spo2,
    respiratory_rate = excluded.respiratory_rate,
    bmi              = excluded.bmi,
    recorded_by      = excluded.recorded_by,
    recorded_at      = now()
  returning * into v_vitals;

  return v_vitals;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Update collect_patient_payment to support 'waive' (zero-charge path)
-- ----------------------------------------------------------------------------
-- We allow amount = 0 when payment_method = 'waive', and mark bill as 'paid'.
-- The existing function checks amount > 0; we create an overload that relaxes
-- this for waive. To avoid breaking the existing RPC contract, we update
-- the existing function to conditionally allow amount = 0 for waive.
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

  -- validate amount: waive allows zero, others must be positive
  if p_payment_method = 'waive'::public.patient_payment_method then
    -- waive: force amount to 0
    p_amount := 0;
  elsif p_amount <= 0 then
    raise exception using errcode = 'P0001', message = 'AMOUNT_MUST_BE_POSITIVE';
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

  -- record payment (skip for waive with zero amount)
  if p_amount > 0 then
    insert into public.patient_payments (clinic_id, bill_id, amount, payment_method, collected_by_user_id)
    values (p_clinic_id, p_bill_id, p_amount, p_payment_method, (select auth.uid()));
  end if;

  -- update bill status to paid
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
    set payment_status = case
      when p_payment_method = 'waive'::public.patient_payment_method
        then 'not_required'::public.payment_status
      else 'collected_post'::public.payment_status
    end,
    updated_at = now()
    where v.id = v_bill.visit_id
      and v.clinic_id = p_clinic_id;
  end if;

  return v_receipt;
end;
$$;
