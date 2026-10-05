-- =============================================================================
-- 0057_prescription_settings.sql
--
-- Organization settings → Prescription: the print-header toggle, and the clinic
-- medicine catalogue the "Manage Medicines" screen edits.
--
-- Why the header toggle is a real column rather than a print-time preference
-- The header a doctor prints is not a browser concern: the same prescription is
-- printed from two screens (`consultation-view.tsx` and
-- `prescription-workspace.tsx`) and both call `window.print()` on a page that
-- renders the header from `clinic` props. Making the visibility a clinic column
-- means both print paths read one stored answer, and a clinic that prints on
-- letterhead sets it once rather than at every desk.
--
-- Defaults matter here: a clinic that has never touched this tab must keep
-- printing the header it prints today, so the column defaults to TRUE and a
-- missing column degrades to `true` on the read side too.
--
-- Why medicines need their own table
-- `prescriptions.medicines` is a jsonb array owned by a prescription, and
-- `patient_medications` (0050) is per-patient, OCR-sourced history. Neither is a
-- clinic-wide list, so "Manage Medicines" had nowhere to write. This adds one:
-- a flat, clinic-scoped catalogue of name + strength + category with a soft
-- `is_active` flag rather than a hard delete, because an inactive drug must
-- stop being offered on new prescriptions without erasing the entries
-- prescriptions already reference by name.
--
-- No drug database and no clinical data: this is a spelling and speed aid, the
-- same job `lib/opd-medicines.ts` does with a hard-coded list. Freezing a
-- clinical decision aid into a table would be the wrong call.
--
-- IF NOT EXISTS / DROP POLICY IF EXISTS keep this file re-runnable, since
-- migrations here are applied by hand rather than via `supabase db push`.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1. clinics — prescription print header
-- ----------------------------------------------------------------------------
alter table public.clinics
  add column if not exists show_prescription_header boolean not null default true;

comment on column public.clinics.show_prescription_header is
  'Print the clinic name, address, phone and PRESCRIPTION title at the top of a prescription. Default true — clinics printing on their own letterhead turn it off.';

-- ----------------------------------------------------------------------------
-- 2. medicines — the clinic catalogue behind "Manage Medicines"
-- ----------------------------------------------------------------------------
create table if not exists public.medicines (
  id                 uuid primary key default gen_random_uuid(),
  clinic_id          uuid not null references public.clinics(id) on delete cascade,
  name               text not null,
  -- Carried beside the name rather than inside it, so "Amlodipine" and
  -- "Amlodipine 5 mg" are one suggestion with variants rather than two
  -- unmergeable rows. The prescription grid still receives a single string.
  strength           text,
  -- Free text on purpose: the markup's own samples are Tablet, Capsule and
  -- Soap, which is a dispensing-forms list, not a pharmacologic class list.
  -- Enforcing an enum would reject rows the doctor is used to typing.
  category           text,
  is_active          boolean not null default true,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint medicines_name_not_blank check (btrim(name) <> '')
);

comment on table public.medicines is
  'Clinic-scoped medicine catalogue managed from Organization settings → Prescription. Suggestions for the prescription grid, not a clinical reference.';

-- Case-insensitive, whitespace-tolerant uniqueness per clinic. This is what
-- makes "Import Excel/CSV" safe to run twice, and what stops a member adding
-- "Panadol" beside "panadol " and printing both.
create unique index if not exists medicines_clinic_name_strength_unique
  on public.medicines (clinic_id, lower(btrim(name)), lower(coalesce(btrim(strength), '')));

-- The list screen is always "this clinic's catalogue, active or not, newest
-- first", so that leading clinic_id is the index that matters.
create index if not exists medicines_clinic_created_idx
  on public.medicines (clinic_id, created_at desc);

create index if not exists medicines_clinic_active_idx
  on public.medicines (clinic_id, is_active);

-- ----------------------------------------------------------------------------
-- 3. updated_at trigger
--
-- Same shape as 0050's per-table trigger rather than a shared helper, so this
-- migration depends on nothing that another migration might later redefine.
-- ----------------------------------------------------------------------------
create or replace function public.update_medicines_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists medicines_updated_at on public.medicines;
create trigger medicines_updated_at
  before update on public.medicines
  for each row execute function public.update_medicines_updated_at();

-- ----------------------------------------------------------------------------
-- 4. RLS
--
-- Every clinic member reads the catalogue — it is offered on the prescription
-- screen, which a receptionist uses as often as a doctor. Writes are
-- owner/admin only, matching `canWriteClinic` in the application so the API
-- cannot be used to bypass the UI's own guard.
-- ----------------------------------------------------------------------------
alter table public.medicines enable row level security;

drop policy if exists "Clinic members can view medicines" on public.medicines;
create policy "Clinic members can view medicines"
  on public.medicines for select
  using (public.is_clinic_member(clinic_id));

drop policy if exists "Clinic owners and admins can insert medicines" on public.medicines;
create policy "Clinic owners and admins can insert medicines"
  on public.medicines for insert
  with check (
    public.is_clinic_owner(clinic_id) or public.is_clinic_admin(clinic_id)
  );

drop policy if exists "Clinic owners and admins can update medicines" on public.medicines;
create policy "Clinic owners and admins can update medicines"
  on public.medicines for update
  using (public.is_clinic_owner(clinic_id) or public.is_clinic_admin(clinic_id))
  with check (
    public.is_clinic_owner(clinic_id) or public.is_clinic_admin(clinic_id)
  );

drop policy if exists "Clinic owners and admins can delete medicines" on public.medicines;
create policy "Clinic owners and admins can delete medicines"
  on public.medicines for delete
  using (public.is_clinic_owner(clinic_id) or public.is_clinic_admin(clinic_id));