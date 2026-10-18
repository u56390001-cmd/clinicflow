-- =============================================================================
-- MedBook AI — Migration 0102 : Clinic machine registry & parameter profiles
--
-- Spec: `docs/MedBookAI_Dermatology_Master_Implementation_Prompt.md` §9.4
--       (Clinic machine profiling and custom parameters) and §9.2
--       (configured presets populate an editable draft).
--
-- Tab 5 could record device settings only as free text in a fixed field list.
-- A clinic that owns real machines (Nd:YAG, CO2, IPL, RF microneedling…)
-- could not register the machine once, define which parameter fields that
-- machine actually has, and have the procedure card show exactly those fields
-- next session.
--
-- DESIGN
-- ------
-- * `clinic_machines` is a clinic-scoped registry: name, brand/model, a
--   free-text category, and `parameter_fields` — a jsonb array of
--   `{key, label, placeholder}` objects the clinic defines once. The UI
--   renders them as the parameter inputs for a procedure that selected the
--   machine; recorded values still go into `derm_procedures.params` (0099),
--   so a machine row can be renamed or retired without touching history.
-- * This table records what a clinician typed. Nothing here controls or reads
--   from a physical device (§9.4: never imply live machine integration).
-- * RLS mirrors the registry's governance: any clinic member may read the
--   registry (the procedure card needs it); only clinic admins may add,
--   edit or retire machines — `is_clinic_admin` = owner/admin/clinic_admin,
--   the same set `canWriteClinic` gates on in the UI.
--
-- SAFETY
-- ------
-- * Re-runnable (`if not exists`), additive only, no seed: machines are
--   physical assets each clinic registers itself.
-- =============================================================================

create table if not exists public.clinic_machines (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  brand_model text check (brand_model is null or char_length(brand_model) <= 160),
  category text check (category is null or char_length(category) <= 80),
  parameter_fields jsonb not null default '[]'::jsonb
    check (jsonb_typeof(parameter_fields) = 'array'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.clinic_machines is
  'Clinic-registered procedure machines and their parameter profiles (Tab 5). Members read, admins write.';

drop trigger if exists clinic_machines_updated_at on public.clinic_machines;
create trigger clinic_machines_updated_at
  before update
  on public.clinic_machines
  for each row
  execute function public.handle_updated_at();

create index if not exists clinic_machines_clinic_idx
  on public.clinic_machines (clinic_id, name);

-- ----------------------------------------------------------------------------
-- RLS: members read (the procedure card renders the registry), admins write
-- (the registry itself is the clinic's configuration).
-- ----------------------------------------------------------------------------
alter table public.clinic_machines enable row level security;

drop policy if exists clinic_machines_select on public.clinic_machines;
create policy clinic_machines_select
  on public.clinic_machines
  for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists clinic_machines_insert on public.clinic_machines;
create policy clinic_machines_insert
  on public.clinic_machines
  for insert
  to authenticated
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists clinic_machines_update on public.clinic_machines;
create policy clinic_machines_update
  on public.clinic_machines
  for update
  to authenticated
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists clinic_machines_delete on public.clinic_machines;
create policy clinic_machines_delete
  on public.clinic_machines
  for delete
  to authenticated
  using (public.is_clinic_admin(clinic_id));

notify pgrst, 'reload schema';

-- ROLLBACK
-- ----------------------------------------------------------------------------
-- drop policy if exists clinic_machines_delete on public.clinic_machines;
-- drop policy if exists clinic_machines_update on public.clinic_machines;
-- drop policy if exists clinic_machines_insert on public.clinic_machines;
-- drop policy if exists clinic_machines_select on public.clinic_machines;
-- drop table if exists public.clinic_machines;
-- =============================================================================
