-- =============================================================================
-- MedBook AI — Patients EMR / Billing / AI Agent Enhancements | Migration 0029
--
-- Additive, non-destructive. Supports docs/IMPLEMENTATION_PLAN.md Phase 1.
--
-- 1.  clinics.patient_code_prefix           (UHID prefix, default 'CLI')
-- 2.  patients: patient_code (UHID), blood_group, registered_branch,
--     ai_summary cache columns
-- 3.  UHID generator trigger + backfill + unique index
-- 4.  patient_documents table + RLS
-- 5.  private storage bucket 'patient-documents' + storage RLS
-- 6.  patient_bill_status enum += 'waived', 'cancelled'
-- 7.  patient_bills: bill_number, bill_type, bill_date, doctor_id
-- 8.  bill_number generator trigger + backfill + unique index
-- 9.  patient_payments.payment_reference
-- 10. clinic_ai_settings: llm_provider, llm_model, llm_key_verified(_at)
-- 11. clinic_ai_secrets table (per-clinic LLM API key, RLS, no client read)
-- 12. patient_directory view rebuilt with new columns + visit aggregates
--
-- MARKET: Pakistan / PKR (decision D8). `patient_bills.currency` already
-- defaults to 'PKR' from 0025 — unchanged here. The 'upi' payment method added
-- in 0028 is NOT removed (Postgres cannot drop enum values and historical rows
-- may reference it); it is filtered out at the presentation layer instead.
--
-- ENUM CAVEAT: `alter type ... add value` may run inside a transaction, but the
-- new value cannot be *used* in that same transaction. Nothing in this file
-- reads or writes 'waived'/'cancelled' — the values are only declared here and
-- consumed by later application code.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. clinics.patient_code_prefix
--
-- The spec hardcodes 'CLI-2026-00001'. Making the prefix per-clinic keeps IDs
-- unambiguous in a multi-clinic deployment while still producing exactly the
-- spec's format out of the box.
-- ----------------------------------------------------------------------------
do $$
begin
  alter table public.clinics
    add column if not exists patient_code_prefix text not null default 'CLI';
exception
  when duplicate_column then null;
end $$;

do $$
begin
  alter table public.clinics
    add constraint clinics_patient_code_prefix_check
    check (patient_code_prefix ~ '^[A-Z]{2,6}$');
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 2. patients: UHID, clinical metadata, AI summary cache
--
-- `age` already exists on this table alongside `date_of_birth`. A stored age
-- goes stale within a year, so application code should derive age from
-- `date_of_birth` for display and treat `age` as legacy input only.
--
-- NOT added here: `whatsapp_number` — it already exists from 0018 along with
-- constraint patients_whatsapp_number_check and a partial index. The spec lists
-- it as a new field; it is not.
-- ----------------------------------------------------------------------------
do $$
begin
  alter table public.patients add column if not exists patient_code            text;
  alter table public.patients add column if not exists blood_group             text;
  alter table public.patients add column if not exists registered_branch       text;
  alter table public.patients add column if not exists ai_summary              text;
  alter table public.patients add column if not exists ai_summary_generated_at timestamptz;
  alter table public.patients add column if not exists ai_summary_visit_count  int;
exception
  when duplicate_column then null;
end $$;

do $$
begin
  alter table public.patients
    add constraint patients_blood_group_check
    check (blood_group is null or blood_group in
      ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.patients
    add constraint patients_registered_branch_check
    check (registered_branch is null
       or char_length(btrim(registered_branch)) between 1 and 120);
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 3. UHID: generator trigger, backfill, unique index
--
-- Format: {PREFIX}-{YYYY}-{NNNNN}  e.g. CLI-2026-00001
-- Per clinic, per calendar year, in the CLINIC's timezone (not UTC) so a
-- patient registered at 01:00 local on 1 Jan lands in the right year.
--
-- Numbering runs under a per-clinic advisory lock: two receptionists adding a
-- patient in the same second would otherwise compute the same sequence. The
-- unique index below is the backstop, not the primary defense.
-- ----------------------------------------------------------------------------
create or replace function public.assign_patient_code()
returns trigger
language plpgsql
volatile
security invoker
set search_path = public, auth
as $$
declare
  v_prefix text;
  v_tz     text;
  v_year   int;
  v_seq    int;
begin
  -- Respect an explicitly supplied code (e.g. data migration from another EMR)
  if new.patient_code is not null and btrim(new.patient_code) <> '' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('medbook-patient-code-' || new.clinic_id::text, 0)
  );

  select c.patient_code_prefix, c.timezone
    into v_prefix, v_tz
  from public.clinics c
  where c.id = new.clinic_id;

  v_prefix := coalesce(v_prefix, 'CLI');
  v_tz     := coalesce(v_tz, 'UTC');
  v_year   := extract(year from (coalesce(new.created_at, now()) at time zone v_tz))::int;

  -- Trailing digits of the highest existing code for this clinic+prefix+year
  select coalesce(max(substring(p.patient_code from '([0-9]+)$')::int), 0) + 1
    into v_seq
  from public.patients p
  where p.clinic_id = new.clinic_id
    and p.patient_code like v_prefix || '-' || v_year::text || '-%';

  new.patient_code := v_prefix || '-' || v_year::text || '-' || lpad(v_seq::text, 5, '0');
  return new;
end;
$$;

-- Backfill existing patients before the unique index is created.
-- Ordered by created_at so historical IDs are stable and reproducible.
--
-- SIDE EFFECT: `patients_set_updated_at` (0005) fires on this UPDATE, so every
-- backfilled patient gets a fresh `updated_at`. Harmless today — the directory
-- sorts by created_at / last_appointment_at / appointment_count / name, never
-- updated_at — but do not read `updated_at` as "last edited by staff" for rows
-- that predate this migration.
with numbered as (
  select
    p.id,
    coalesce(c.patient_code_prefix, 'CLI') as prefix,
    extract(year from (p.created_at at time zone coalesce(c.timezone, 'UTC')))::int as yr,
    row_number() over (
      partition by
        p.clinic_id,
        extract(year from (p.created_at at time zone coalesce(c.timezone, 'UTC')))
      order by p.created_at, p.id
    ) as seq
  from public.patients p
  join public.clinics c on c.id = p.clinic_id
  where p.patient_code is null
)
update public.patients p
set patient_code = n.prefix || '-' || n.yr::text || '-' || lpad(n.seq::text, 5, '0')
from numbered n
where p.id = n.id;

create unique index if not exists patients_clinic_code_unique
  on public.patients (clinic_id, patient_code)
  where patient_code is not null;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'patients_assign_patient_code') then
    create trigger patients_assign_patient_code
      before insert on public.patients
      for each row
      execute function public.assign_patient_code();
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4. patient_documents
--
-- Metadata only — the file itself lives in the private 'patient-documents'
-- storage bucket created in section 5. `file_path` is the object key.
--
-- The composite FK to (clinic_id, id) on patients gives the same same-clinic
-- guarantee used by visits/appointments: a document row cannot point at a
-- patient belonging to a different clinic.
-- ----------------------------------------------------------------------------
create table if not exists public.patient_documents (
  id                  uuid        primary key default gen_random_uuid(),
  clinic_id           uuid        not null references public.clinics (id) on delete cascade,
  patient_id          uuid        not null,
  document_name       text        not null check (char_length(btrim(document_name)) between 1 and 255),
  file_path           text        not null check (char_length(btrim(file_path)) between 1 and 1024),
  mime_type           text        not null check (mime_type in (
                        'application/pdf', 'image/png', 'image/jpeg', 'image/webp'
                      )),
  size_bytes          bigint      not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by_user_id uuid,
  uploaded_at         timestamptz not null default now(),
  created_at          timestamptz not null default now(),

  constraint patient_documents_clinic_patient_fkey
    foreign key (clinic_id, patient_id) references public.patients (clinic_id, id) on delete cascade
);

create index if not exists patient_documents_clinic_patient_idx
  on public.patient_documents (clinic_id, patient_id, uploaded_at desc);

create unique index if not exists patient_documents_file_path_unique
  on public.patient_documents (file_path);

alter table public.patient_documents enable row level security;

drop policy if exists patient_documents_select_member on public.patient_documents;
create policy patient_documents_select_member
  on public.patient_documents for select to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists patient_documents_insert_member on public.patient_documents;
create policy patient_documents_insert_member
  on public.patient_documents for insert to authenticated
  with check (public.is_clinic_member(clinic_id));

drop policy if exists patient_documents_delete_member on public.patient_documents;
create policy patient_documents_delete_member
  on public.patient_documents for delete to authenticated
  using (public.is_clinic_member(clinic_id));

-- ----------------------------------------------------------------------------
-- 5. Storage bucket: patient-documents (PRIVATE)
--
-- public = false. These are medical records; unlike the 'website-images'
-- bucket from 0009 they must never be reachable by unauthenticated URL.
-- Reads go through short-lived signed URLs generated server-side.
--
-- Object key layout: {clinic_id}/{patient_id}/{uuid}-{filename}
-- so path segment 1 is the tenant boundary.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('patient-documents', 'patient-documents', false)
  on conflict (id) do nothing;

drop policy if exists "Patient documents: clinic upload" on storage.objects;
create policy "Patient documents: clinic upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'patient-documents'
    and public.is_clinic_member((string_to_array(name, '/'))[1]::uuid)
  );

drop policy if exists "Patient documents: clinic read" on storage.objects;
create policy "Patient documents: clinic read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'patient-documents'
    and public.is_clinic_member((string_to_array(name, '/'))[1]::uuid)
  );

drop policy if exists "Patient documents: clinic delete" on storage.objects;
create policy "Patient documents: clinic delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'patient-documents'
    and public.is_clinic_member((string_to_array(name, '/'))[1]::uuid)
  );

-- ----------------------------------------------------------------------------
-- 6. patient_bill_status += 'waived', 'cancelled'
--
-- 0028 added 'waive' as a payment METHOD; there was no bill STATUS for either
-- outcome, so the spec's "Waive bill" / "Cancel bill" row actions had nowhere
-- to write. Both states must be excluded from revenue totals downstream.
-- ----------------------------------------------------------------------------
do $$
begin
  alter type public.patient_bill_status add value if not exists 'waived';
  alter type public.patient_bill_status add value if not exists 'cancelled';
exception
  when duplicate_object then null;
  when invalid_parameter_value then null;
end $$;

-- ----------------------------------------------------------------------------
-- 7. patient_bills: bill_number, bill_type, bill_date, doctor_id
--
-- doctor_id is nullable: manual bills (visit_id is null) have no appointment
-- to derive a doctor from.
-- ----------------------------------------------------------------------------
do $$
begin
  alter table public.patient_bills add column if not exists bill_number text;
  alter table public.patient_bills add column if not exists bill_type   text not null default 'consultation';
  alter table public.patient_bills add column if not exists bill_date   date;
  alter table public.patient_bills add column if not exists doctor_id   uuid;
exception
  when duplicate_column then null;
end $$;

do $$
begin
  alter table public.patient_bills
    add constraint patient_bills_bill_type_check
    check (bill_type in ('consultation', 'procedure', 'other'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.patient_bills
    add constraint patient_bills_clinic_doctor_fkey
    foreign key (clinic_id, doctor_id) references public.doctors (clinic_id, id);
exception
  when duplicate_object then null;
  when undefined_object  then null;
end $$;

-- Existing rows: bill_date follows created_at in clinic-local time
update public.patient_bills b
set bill_date = (b.created_at at time zone coalesce(c.timezone, 'UTC'))::date
from public.clinics c
where c.id = b.clinic_id
  and b.bill_date is null;

-- ----------------------------------------------------------------------------
-- 8. bill_number: generator trigger, backfill, unique index
--
-- Format: BILL-{YYYYMMDD}-{NNN}  e.g. BILL-20260810-004
-- Per clinic, per day, in the CLINIC's timezone so the date in the number
-- matches the date staff see on screen.
--
-- Same advisory-lock discipline as receipts in 0025 — concurrent bill creation
-- would otherwise produce duplicate numbers.
-- ----------------------------------------------------------------------------
create or replace function public.assign_bill_number()
returns trigger
language plpgsql
volatile
security invoker
set search_path = public, auth
as $$
declare
  v_tz      text;
  v_daypart text;
  v_seq     int;
begin
  if new.bill_number is not null and btrim(new.bill_number) <> '' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('medbook-bill-number-' || new.clinic_id::text, 0)
  );

  select c.timezone into v_tz
  from public.clinics c
  where c.id = new.clinic_id;

  v_tz      := coalesce(v_tz, 'UTC');
  v_daypart := to_char(coalesce(new.created_at, now()) at time zone v_tz, 'YYYYMMDD');

  select coalesce(max(substring(b.bill_number from '([0-9]+)$')::int), 0) + 1
    into v_seq
  from public.patient_bills b
  where b.clinic_id = new.clinic_id
    and b.bill_number like 'BILL-' || v_daypart || '-%';

  new.bill_number := 'BILL-' || v_daypart || '-' || lpad(v_seq::text, 3, '0');
  return new;
end;
$$;

-- Backfill before the unique index exists
with numbered as (
  select
    b.id,
    to_char(b.created_at at time zone coalesce(c.timezone, 'UTC'), 'YYYYMMDD') as daypart,
    row_number() over (
      partition by
        b.clinic_id,
        (b.created_at at time zone coalesce(c.timezone, 'UTC'))::date
      order by b.created_at, b.id
    ) as seq
  from public.patient_bills b
  join public.clinics c on c.id = b.clinic_id
  where b.bill_number is null
)
update public.patient_bills b
set bill_number = 'BILL-' || n.daypart || '-' || lpad(n.seq::text, 3, '0')
from numbered n
where b.id = n.id;

create unique index if not exists patient_bills_clinic_number_unique
  on public.patient_bills (clinic_id, bill_number)
  where bill_number is not null;

create index if not exists patient_bills_clinic_date_idx
  on public.patient_bills (clinic_id, bill_date desc);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'patient_bills_assign_bill_number') then
    create trigger patient_bills_assign_bill_number
      before insert on public.patient_bills
      for each row
      execute function public.assign_bill_number();
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 9. patient_payments.payment_reference
--
-- JazzCash / EasyPaisa / card / bank transfer reference number, shown in the
-- Bill Details payment panel.
-- ----------------------------------------------------------------------------
do $$
begin
  alter table public.patient_payments
    add column if not exists payment_reference text;
exception
  when duplicate_column then null;
end $$;

do $$
begin
  alter table public.patient_payments
    add constraint patient_payments_reference_check
    check (payment_reference is null
       or char_length(btrim(payment_reference)) between 1 and 128);
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 10. clinic_ai_settings: per-clinic LLM provider / model / verification
--
-- The model is currently global via GEMINI_MODEL / GEMINI_FALLBACK_MODEL env
-- vars (lib/ai/gemini-provider.ts). These columns move that choice per-clinic.
--
-- llm_model is deliberately left with NO default: application code resolves it
-- from env when null, so this migration cannot pin a clinic to a stale model.
-- ----------------------------------------------------------------------------
do $$
begin
  alter table public.clinic_ai_settings
    add column if not exists llm_provider          text not null default 'google';
  alter table public.clinic_ai_settings
    add column if not exists llm_model             text;
  alter table public.clinic_ai_settings
    add column if not exists llm_key_verified      boolean not null default false;
  alter table public.clinic_ai_settings
    add column if not exists llm_key_verified_at   timestamptz;
exception
  when duplicate_column then null;
end $$;

do $$
begin
  alter table public.clinic_ai_settings
    add constraint clinic_ai_settings_llm_provider_check
    check (llm_provider in ('google', 'openai', 'anthropic'));
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 11. clinic_ai_secrets — per-clinic LLM API key
--
-- SECURITY: this table holds CUSTOMER credentials. A leaked key means
-- fraudulent charges against the customer's own provider account.
--
-- Modelled on clinic_whatsapp_secrets (0019): a separate table so the key is
-- never selected incidentally by a `select *` on clinic_ai_settings.
--
-- RLS is enabled with NO policy for `authenticated`. That is deliberate — the
-- key must be unreadable from the browser under any circumstance. Only
-- server-side code holding the service role may read it.
-- ----------------------------------------------------------------------------
create table if not exists public.clinic_ai_secrets (
  id          uuid        primary key default gen_random_uuid(),
  settings_id uuid        not null unique references public.clinic_ai_settings (id) on delete cascade,
  api_key     text        not null check (char_length(btrim(api_key)) between 1 and 1024),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.clinic_ai_secrets enable row level security;

-- Intentionally no select/insert/update/delete policy for `authenticated`.
-- RLS with zero policies denies all access to non-superuser roles.

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'clinic_ai_secrets_set_updated_at') then
    create trigger clinic_ai_secrets_set_updated_at
      before update on public.clinic_ai_secrets
      for each row
      execute function public.handle_updated_at();
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 12. patient_directory view — rebuilt
--
-- !! READ THIS BEFORE EDITING !!
--
-- Both aggregate subqueries MUST stay LEFT JOIN LATERAL, and the view MUST
-- keep `security_invoker = true`. See the note at 0006:56-66. Under
-- security_invoker, a plain LEFT JOIN to appointments/visits produces a
-- NULL-extended row for patients with none, the RLS policy
-- `is_clinic_member(clinic_id)` evaluates false on the NULL clinic_id, and the
-- LEFT JOIN silently degrades to an INNER JOIN — every patient with no
-- appointments (or no visits) vanishes from the directory. That failure looks
-- like data loss, not a view bug.
--
-- `clinics` is deliberately NOT joined here. Deriving a clinic-local "today"
-- inside the view would add another RLS-sensitive join for no benefit; the
-- application already has access.clinic.timezone and computes today-ranges
-- there (see lib/time.ts).
--
-- visit_count drives the First Visit / Returning segmentation. It counts
-- `visits` (patient actually checked in), NOT `appointments` (a booking that
-- may have been cancelled or no-showed) — decision D3.
-- ----------------------------------------------------------------------------
drop view if exists public.patient_directory;
create view public.patient_directory
with (security_invoker = true) as
select
  p.id,
  p.clinic_id,
  p.name,
  p.email,
  p.phone,
  p.notes,
  p.date_of_birth,
  p.created_at,
  p.updated_at,
  -- 0029: clinical + identity metadata needed by the EMR workspace.
  --
  -- gender / age / city / known_allergies / medical_conditions and
  -- notification_preference were declared on the TypeScript
  -- `PatientDirectoryRow` type (it spreads `Patient`) but the 0006 view never
  -- actually selected them, so any consumer reading them got undefined. Adding
  -- them here makes the view match the type.
  p.patient_code,
  p.gender,
  p.age,
  p.city,
  p.blood_group,
  p.whatsapp_number,
  p.notification_preference,
  p.registered_branch,
  p.known_allergies,
  p.medical_conditions,
  p.ai_summary,
  p.ai_summary_generated_at,
  p.ai_summary_visit_count,
  -- appointment aggregates (unchanged from 0006)
  coalesce(s.appointment_count, 0) as appointment_count,
  s.last_appointment_at,
  coalesce(s.upcoming_count, 0) as upcoming_count,
  -- 0029: visit aggregates
  coalesce(v.visit_count, 0) as visit_count,
  v.last_visit_at
from public.patients p
left join lateral (
  select
    count(a.id) filter (where a.status <> 'cancelled'::public.appointment_status) as appointment_count,
    max(a.start_time) filter (where a.status <> 'cancelled'::public.appointment_status) as last_appointment_at,
    count(a.id) filter (
      where a.status in ('pending'::public.appointment_status, 'confirmed'::public.appointment_status)
        and a.start_time >= now()
    ) as upcoming_count
  from public.appointments a
  where a.clinic_id = p.clinic_id
    and a.patient_id = p.id
) s on true
left join lateral (
  select
    count(vs.id)          as visit_count,
    max(vs.checked_in_at) as last_visit_at
  from public.visits vs
  where vs.clinic_id = p.clinic_id
    and vs.patient_id = p.id
) v on true;

-- PostgREST caches the schema; new columns 404 without this.
notify pgrst, 'reload schema';

-- =============================================================================
-- VERIFICATION (run manually after applying)
--
-- 1. Zero-appointment / zero-visit patients still appear — this is the
--    regression the LATERAL shape exists to prevent:
--      select count(*) from public.patient_directory;
--      select count(*) from public.patients;
--    The two counts MUST match.
--
-- 2. UHIDs are unique and well-formed per clinic:
--      select clinic_id, count(*), count(distinct patient_code)
--      from public.patients group by clinic_id;
--
-- 3. Bill numbers are unique per clinic:
--      select clinic_id, count(*), count(distinct bill_number)
--      from public.patient_bills group by clinic_id;
--
-- 4. Cross-clinic isolation on the new table — as clinic A's user:
--      select count(*) from public.patient_documents;  -- only clinic A's rows
--
-- 5. The API key table is unreadable from the client. As an authenticated
--    (non-service-role) user this MUST return zero rows / permission denied:
--      select count(*) from public.clinic_ai_secrets;
--
-- 6. The private bucket is not publicly readable:
--      select id, public from storage.buckets where id = 'patient-documents';
--    `public` MUST be false.
-- =============================================================================
