-- =============================================================================
-- 0056_billing_settings.sql
--
-- Organization settings → Billing: numbering prefixes, receipt preferences,
-- GST and bill terms.
--
-- Why the numbering half is not just two text columns
-- Both numbers are generated in the database, not in the UI:
--
--   * `patient_bills.bill_number` is minted by the `assign_bill_number()`
--     BEFORE INSERT trigger from migration 0029, which hard-codes 'BILL'.
--   * `receipts.receipt_number` is an **integer** column assigned by three
--     different RPCs (0025, 0028, 0031) as `max(receipt_number) + 1`.
--
-- Storing the prefixes without teaching the database about them would make this
-- screen decorative: it would save 'INV', show a preview `INV-20261002-001`,
-- and every bill would still print `BILL-...`. So the prefixes are threaded
-- through both generators.
--
-- `receipts.receipt_number` stays an integer on purpose. It is the ordering key
-- and it is referenced by three existing RPCs; retyping it to text would break
-- all three and invalidate existing rows. Instead receipts gain a separate,
-- human-facing `receipt_code` column holding the formatted
-- `{PREFIX}-{YYYYMMDD}-{NNN}` string, which mirrors how bills already work
-- (`bill_number` is text; the integer column there is something else).
--
-- `receipt_code` is filled by a BEFORE INSERT trigger rather than by editing the
-- three RPCs, so a receipt issued by any of them — now or after a future fourth
-- is added — gets a code without anyone remembering to set it.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1. clinics — billing settings
-- ----------------------------------------------------------------------------
alter table public.clinics
  add column if not exists bill_number_prefix    text    not null default 'BILL',
  add column if not exists receipt_prefix        text    not null default 'RCP',
  add column if not exists auto_send_whatsapp_receipt boolean not null default false,
  add column if not exists receipt_footer_message text,
  add column if not exists show_gst_on_receipt   boolean not null default false,
  add column if not exists gst_number            text,
  add column if not exists gst_rate              numeric(5,2),
  add column if not exists bill_terms             text;

comment on column public.clinics.bill_number_prefix is
  'UHID-style prefix for generated bill numbers: {PREFIX}-{YYYYMMDD}-{NNN}.';
comment on column public.clinics.receipt_prefix is
  'Prefix for generated receipt codes: {PREFIX}-{YYYYMMDD}-{NNN}.';
comment on column public.clinics.gst_rate is
  'Total GST percentage, split evenly into SGST and CGST for display. Ignored when show_gst_on_receipt is false.';

-- Same shape as `clinics_patient_code_prefix_check` from 0029, so the Zod
-- validation and the database agree on what a prefix may contain.
do $$
begin
  alter table public.clinics
    add constraint clinics_bill_number_prefix_check
    check (bill_number_prefix ~ '^[A-Z]{2,6}$');
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.clinics
    add constraint clinics_receipt_prefix_check
    check (receipt_prefix ~ '^[A-Z]{2,6}$');
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.clinics
    add constraint clinics_gst_rate_check
    check (gst_rate is null or (gst_rate >= 0 and gst_rate <= 100));
exception when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 2. assign_bill_number() honours clinics.bill_number_prefix
--
-- Body is otherwise the 0029 logic: per clinic, per calendar day (in the
-- clinic's timezone, not UTC), zero-padded to three digits, under a per-clinic
-- advisory lock.
-- ----------------------------------------------------------------------------
create or replace function public.assign_bill_number()
returns trigger
language plpgsql
volatile
security invoker
set search_path = public, auth
as $$
declare
  v_prefix  text;
  v_tz      text;
  v_daypart text;
  v_seq     int;
begin
  if new.bill_number is not null and btrim(new.bill_number) <> '' then
    return new;
  end if;

  select c.bill_number_prefix, c.timezone
    into v_prefix, v_tz
  from public.clinics c
  where c.id = new.clinic_id;

  v_prefix := coalesce(v_prefix, 'BILL');
  v_tz     := coalesce(v_tz, 'UTC');
  v_daypart := to_char(coalesce(new.created_at, now()) at time zone v_tz, 'YYYYMMDD');

  perform pg_advisory_xact_lock(
    hashtextextended('medbook-bill-number-' || new.clinic_id::text, 0)
  );

  select coalesce(max(substring(b.bill_number from '([0-9]+)$')::int), 0) + 1
    into v_seq
  from public.patient_bills b
  where b.clinic_id = new.clinic_id
    and b.bill_number like v_prefix || '-' || v_daypart || '-%';

  new.bill_number := v_prefix || '-' || v_daypart || '-' || lpad(v_seq::text, 3, '0');
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. receipts.receipt_code
--
-- Formatted receipt ID alongside the existing integer `receipt_number`.
-- ----------------------------------------------------------------------------
alter table public.receipts
  add column if not exists receipt_code text;

-- Backfill before the unique index and NOT NULL, so existing receipts keep a
-- usable code and none of them collide.
with numbered as (
  select
    r.id,
    c.receipt_prefix as prefix,
    to_char(r.generated_at at time zone coalesce(c.timezone, 'UTC'), 'YYYYMMDD') as daypart,
    row_number() over (
      partition by
        c.id,
        (r.generated_at at time zone coalesce(c.timezone, 'UTC'))::date
      order by r.generated_at, r.id
    ) as seq
  from public.receipts r
  join public.clinics c on c.id = r.clinic_id
  where r.receipt_code is null
)
update public.receipts r
set receipt_code = numbered.prefix || '-' || numbered.daypart || '-' || lpad(numbered.seq::text, 3, '0')
from numbered
where r.id = numbered.id
  and r.receipt_code is null;

create unique index if not exists receipts_clinic_code_unique
  on public.receipts (clinic_id, receipt_code);

create or replace function public.assign_receipt_code()
returns trigger
language plpgsql
volatile
security invoker
set search_path = public, auth
as $$
declare
  v_prefix  text;
  v_tz      text;
  v_daypart text;
  v_seq     int;
begin
  if new.receipt_code is not null and btrim(new.receipt_code) <> '' then
    return new;
  end if;

  select c.receipt_prefix, c.timezone
    into v_prefix, v_tz
  from public.clinics c
  where c.id = new.clinic_id;

  v_prefix := coalesce(v_prefix, 'RCP');
  v_tz     := coalesce(v_tz, 'UTC');
  v_daypart := to_char(coalesce(new.generated_at, now()) at time zone v_tz, 'YYYYMMDD');

  -- Lock is per clinic *and* per day, because the sequence restarts daily:
  -- locking only on the clinic would serialise unrelated days for no reason.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'medbook-receipt-code-' || new.clinic_id::text || '-' || v_daypart,
      0
    )
  );

  select coalesce(max(substring(r.receipt_code from '([0-9]+)$')::int), 0) + 1
    into v_seq
  from public.receipts r
  where r.clinic_id = new.clinic_id
      and r.receipt_code like v_prefix || '-' || v_daypart || '-%';

  new.receipt_code := v_prefix || '-' || v_daypart || '-' || lpad(v_seq::text, 3, '0');
  return new;
end;
$$;

drop trigger if exists receipts_assign_receipt_code on public.receipts;
create trigger receipts_assign_receipt_code
  before insert on public.receipts
  for each row execute function public.assign_receipt_code();

-- ----------------------------------------------------------------------------
-- 4. Previews for the settings screen
--
-- Same reasoning as `preview_next_patient_code` (0055): computed in SQL from the
-- same LIKE patterns the generators use, so what the card promises and what the
-- database produces cannot drift apart.
-- ----------------------------------------------------------------------------
create or replace function public.preview_bill_number(
  p_clinic_id uuid,
  p_prefix     text,
  p_at         timestamptz default now()
)
returns text
language plpgsql
stable
security invoker
set search_path = public, auth
as $$
declare
  v_prefix  text;
  v_tz      text;
  v_daypart text;
  v_seq     int;
begin
  v_prefix := coalesce(p_prefix, 'BILL');

  select c.timezone into v_tz from public.clinics c where c.id = p_clinic_id;
  v_tz      := coalesce(v_tz, 'UTC');
  v_daypart := to_char(coalesce(p_at, now()) at time zone v_tz, 'YYYYMMDD');

  select coalesce(max(substring(b.bill_number from '([0-9]+)$')::int), 0) + 1
    into v_seq
  from public.patient_bills b
  where b.clinic_id = p_clinic_id
    and b.bill_number like v_prefix || '-' || v_daypart || '-%';

  return v_prefix || '-' || v_daypart || '-' || lpad(v_seq::text, 3, '0');
end;
$$;

create or replace function public.preview_receipt_code(
  p_clinic_id uuid,
  p_prefix     text,
  p_at         timestamptz default now()
)
returns text
language plpgsql
stable
security invoker
set search_path = public, auth
as $$
declare
  v_prefix  text;
  v_tz      text;
  v_daypart text;
  v_seq     int;
begin
  v_prefix := coalesce(p_prefix, 'RCP');

  select c.timezone into v_tz from public.clinics c where c.id = p_clinic_id;
  v_tz      := coalesce(v_tz, 'UTC');
  v_daypart := to_char(coalesce(p_at, now()) at time zone v_tz, 'YYYYMMDD');

  select coalesce(max(substring(r.receipt_code from '([0-9]+)$')::int), 0) + 1
    into v_seq
  from public.receipts r
  where r.clinic_id = p_clinic_id
      and r.receipt_code like v_prefix || '-' || v_daypart || '-%';

  return v_prefix || '-' || v_daypart || '-' || lpad(v_seq::text, 3, '0');
end;
$$;