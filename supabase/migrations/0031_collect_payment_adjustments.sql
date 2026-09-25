-- =============================================================================
-- Migration 0031: Collect payment with adjustments (Phase 7)
--
-- The 3-column Collect Payment modal lets a user add additional charges and
-- apply a discount when settling a bill, but the 0025 `collect_patient_payment`
-- RPC only records a single flat amount. Charges and discounts were silently
-- folded into the amount paid without touching the bill's line items or
-- discount columns — the bill then disagreed with its own receipt.
--
-- This migration adds `collect_patient_payment_with_adjustments`, which applies
-- additional charges (as new `patient_bill_items`), recomputes the subtotal,
-- applies a fixed or percent discount, records the net as a payment + receipt,
-- and marks the bill paid. Waive is handled semantically: it closes the bill
-- as `waived` with no payment and no receipt, matching `waivePatientBillAction`
-- rather than producing a `paid` bill with a zero receipt.
--
-- The original 4-arg `collect_patient_payment` is left untouched so existing
-- callers (check-in persistence in `lib/actions/queue.ts`, etc.) keep working.
-- =============================================================================

create or replace function public.collect_patient_payment_with_adjustments(
  p_clinic_id          uuid,
  p_bill_id            uuid,
  p_payment_method     public.patient_payment_method,
  p_additional_charges jsonb default '[]'::jsonb,
  p_discount_amount    numeric(12,2) default 0,
  p_discount_percent   numeric(12,2) default 0
) returns public.receipts
language plpgsql
volatile
security invoker
set search_path = public, auth
as $$
declare
  v_bill          public.patient_bills;
  v_charge        jsonb;
  v_desc          text;
  v_qty           int;
  v_price         numeric(12,2);
  v_total         numeric(12,2);
  v_disc          numeric(12,2);
  v_disc_pct      numeric(12,2);
  v_paid          numeric(12,2);
  v_receipt       public.receipts;
  v_receipt_num   int;
begin
  -- Serialize per-clinic, same lock as the original RPC.
  perform pg_advisory_xact_lock(hashtextextended('medbook-billing-' || p_clinic_id::text, 0));

  select b.* into v_bill
  from public.patient_bills b
  where b.id = p_bill_id
    and b.clinic_id = p_clinic_id;

  if v_bill is null then
    raise exception using errcode = 'P0001', message = 'BILL_NOT_FOUND';
  end if;

  -- Idempotent: an already-paid bill returns its existing receipt.
  if v_bill.status = 'paid'::public.patient_bill_status then
    select r.* into v_receipt
    from public.receipts r
    where r.bill_id = p_bill_id
      and r.clinic_id = p_clinic_id;
    if v_receipt is not null then
      return v_receipt;
    end if;
  end if;

  -- Applying adjustments to an already-settled bill is not allowed; bail
  -- early so the caller can decide (e.g. route to waive/cancel instead).
  if v_bill.status in
     ('waived'::public.patient_bill_status, 'cancelled'::public.patient_bill_status)
  then
    raise exception using errcode = 'P0001', message = 'BILL_ALREADY_CLOSED';
  end if;

  -- Waive: close the bill, keep any payments already collected, no new one.
  if p_payment_method = 'waive'::public.patient_payment_method then
    update public.patient_bills b
    set status     = 'waived'::public.patient_bill_status,
        updated_at = now()
    where b.id = p_bill_id
      and b.clinic_id = p_clinic_id;

    if v_bill.visit_id is not null then
      update public.visits v
      set payment_status = 'not_required'::public.payment_status,
          updated_at     = now()
      where v.id = v_bill.visit_id
        and v.clinic_id = p_clinic_id;
    end if;

    return null;
  end if;

  -- Apply additional charges as new line items.
  for v_charge in
    select * from jsonb_array_elements(coalesce(p_additional_charges, '[]'::jsonb))
  loop
    v_desc  := v_charge->>'description';
    v_qty   := coalesce((v_charge->>'quantity')::int, 1);
    v_price := coalesce((v_charge->>'unit_price')::numeric(12,2), 0);
    if v_qty < 1 then v_qty := 1; end if;
    if v_price < 0 then v_price := 0; end if;
    if v_desc is not null and char_length(btrim(v_desc)) > 0 then
      insert into public.patient_bill_items
        (clinic_id, bill_id, description, quantity, unit_price, line_total)
      values
        (p_clinic_id, p_bill_id, btrim(v_desc), v_qty, v_price, round(v_price * v_qty, 2));
    end if;
  end loop;

  -- Recompute subtotal across all items, then apply the discount.
  select coalesce(sum(line_total), 0) into v_total
  from public.patient_bill_items
  where bill_id = p_bill_id
    and clinic_id = p_clinic_id;

  if p_discount_amount > 0 then
    v_disc     := least(p_discount_amount, v_total);
    v_disc_pct := case when v_total > 0 then round((v_disc / v_total) * 100, 2) else 0 end;
  elsif p_discount_percent > 0 then
    v_disc_pct := least(p_discount_percent, 100);
    v_disc     := round((v_total * v_disc_pct) / 100, 2);
  else
    v_disc     := 0;
    v_disc_pct := 0;
  end if;

  v_paid := round(v_total - v_disc, 2);
  if v_paid < 0 then
    v_paid := 0;
  end if;

  update public.patient_bills b
  set total_amount     = v_paid,
      discount_amount  = v_disc,
      discount_percent = v_disc_pct,
      updated_at       = now()
  where b.id = p_bill_id
    and b.clinic_id = p_clinic_id;

  -- Record the payment and receipt only when money actually changed hands.
  if v_paid > 0 then
    insert into public.patient_payments
      (clinic_id, bill_id, amount, payment_method, collected_by_user_id)
    values
      (p_clinic_id, p_bill_id, v_paid, p_payment_method, (select auth.uid()));
  end if;

  update public.patient_bills b
  set status     = 'paid'::public.patient_bill_status,
      updated_at = now()
  where b.id = p_bill_id
    and b.clinic_id = p_clinic_id;

  if v_paid > 0 then
    select coalesce(max(r.receipt_number), 0) + 1
    into v_receipt_num
    from public.receipts r
    where r.clinic_id = p_clinic_id;

    insert into public.receipts (clinic_id, bill_id, receipt_number)
    values (p_clinic_id, p_bill_id, v_receipt_num)
    returning * into v_receipt;
  end if;

  -- Sync the linked visit (setting collected_post, matching 0025).
  if v_bill.visit_id is not null then
    update public.visits v
    set payment_status = 'collected_post'::public.payment_status,
        updated_at     = now()
    where v.id = v_bill.visit_id
      and v.clinic_id = p_clinic_id;
  end if;

  return v_receipt;
end;
$$;

-- =============================================================================
-- Manual verification (idempotent, safe to run):
--   select pg_get_functiondef('public.collect_patient_payment_with_adjustments'::regproc) is not null;
--   select count(*) from pg_proc where proname = 'collect_patient_payment_with_adjustments';
-- =============================================================================
