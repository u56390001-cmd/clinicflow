-- 0036_bill_notes.sql
-- Add an optional `notes` column to patient_bills and extend create_patient_bill
-- to persist it (used by the Add Bill screen). Nullable, capped at 500 chars.
-- The idempotent path keeps its guarantee: when a visit_id is given and a bill
-- already exists for it, that existing bill is returned unchanged.

alter table public.patient_bills
  add column if not exists notes text
  check (notes is null or char_length(btrim(notes)) <= 500);

create or replace function public.create_patient_bill(
  p_clinic_id    uuid,
  p_patient_id   uuid,
  p_visit_id     uuid default null,
  p_items        jsonb default '[]'::jsonb,
  p_currency     text  default 'PKR',
  p_bill_type    text  default 'consultation',
  p_doctor_id    uuid  default null,
  p_bill_date    date  default null,
  p_notes        text  default null
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
  v_bill_date  date := coalesce(p_bill_date, current_date);
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
  insert into public.patient_bills (clinic_id, visit_id, patient_id, total_amount, currency, status, bill_type, doctor_id, bill_date, notes)
  values (p_clinic_id, p_visit_id, p_patient_id, v_total, p_currency,
    case when v_total > 0 then 'pending'::public.patient_bill_status else 'paid'::public.patient_bill_status end,
    coalesce(nullif(p_bill_type, ''), 'consultation'),
    p_doctor_id,
    v_bill_date,
    nullif(p_notes, ''))
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

-- Grant to authenticated so the app role can call (idempotent re-grant).
grant execute on function public.create_patient_bill(
  uuid, uuid, uuid, jsonb, text, text, uuid, date, text
) to authenticated;