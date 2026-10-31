-- =============================================================================
-- 0122 — Dermatology: procedure upgrade (specimen barcode, structured
--        anaesthesia, SAFE timeout, treatment-recipe presets)
-- =============================================================================
-- WHY
--   Real-world dermo-surgery workflow needs more than the free-text logbook:
--   * specimen jars are labelled with a PHYSICAL barcode clinicians must be
--     able to record alongside the minted SP- id;
--   * anaesthesia was free text buried in params — structured agent / epi /
--     volume is what a surgical record (and a push-to-Rx note) needs;
--   * the WHO/regulatory SAFE procedural timeout wants an explicit checkbox;
--   * repeat treatments (laser courses, peel series) re-use the same machine
--     settings — 1-tap treatment-recipe presets per clinic.
--
-- WHAT
--   1. derm_procedures — new optional columns (nullable where sensible, so
--      existing logbook rows render untouched):
--        specimen_barcode       physical bottle / container id
--        anesthesia_agent       'Lidocaine 1%' | 'Lidocaine 2%' | ...
--        anesthesia_epinephrine true = with epi (1:100k), false = plain
--        anesthesia_volume_ml   total volume administered
--        safe_timeout           SAFE procedural timeout verified
--   2. derm_procedure_presets — clinic-level treatment recipes (name, kind,
--      params jsonb) loaded 1-tap into the parameter card. No patient link:
--      a recipe belongs to the clinic's device workflow, like clinic_machines.
--
-- SAFETY
--   * Re-runnable (`if not exists`); existing rows keep their values.
--   * RLS mirrors 0077: is_clinic_member for reads; clinic members manage
--     recipes (any doctor may save a personal workflow recipe).
-- =============================================================================

alter table public.derm_procedures
  add column if not exists specimen_barcode text,
  add column if not exists anesthesia_agent text,
  add column if not exists anesthesia_epinephrine boolean,
  add column if not exists anesthesia_volume_ml numeric(6, 2),
  add column if not exists safe_timeout boolean;

create index if not exists derm_procedures_clinic_idx_barcode
  on public.derm_procedures (clinic_id, patient_id, procedure_date desc);

create table if not exists public.derm_procedure_presets (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references public.clinics (id) on delete cascade,
  name          text not null,
  kind          text not null default 'other'
                  check (kind in ('laser', 'injectable', 'peel', 'cryotherapy',
                                  'electrocautery', 'minor_surgery', 'biopsy', 'other')),
  params        jsonb not null default '{}'::jsonb,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists derm_procedure_presets_clinic_idx
  on public.derm_procedure_presets (clinic_id, kind, created_at desc);

create trigger if not exists derm_procedure_presets_updated_at
  before update on public.derm_procedure_presets
  for each row execute function public.handle_updated_at();

-- RLS (same posture as 0077 specialty rows).
alter table public.derm_procedure_presets enable row level security;

drop policy if exists derm_procedure_presets_select on public.derm_procedure_presets;
create policy derm_procedure_presets_select on public.derm_procedure_presets
  for select to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists derm_procedure_presets_insert on public.derm_procedure_presets;
create policy derm_procedure_presets_insert on public.derm_procedure_presets
  for insert to authenticated
  with check (public.is_clinic_member(clinic_id));

drop policy if exists derm_procedure_presets_update on public.derm_procedure_presets;
create policy derm_procedure_presets_update on public.derm_procedure_presets
  for update to authenticated
  using (public.is_clinic_member(clinic_id))
  with check (public.is_clinic_member(clinic_id));

drop policy if exists derm_procedure_presets_delete on public.derm_procedure_presets;
create policy derm_procedure_presets_delete on public.derm_procedure_presets
  for delete to authenticated
  using (public.is_clinic_member(clinic_id));

notify pgrst, 'reload schema';

-- ROLLBACK
-- drop table if exists public.derm_procedure_presets;
-- alter table public.derm_procedures
--   drop column if exists specimen_barcode,
--   drop column if exists anesthesia_agent,
--   drop column if exists anesthesia_epinephrine,
--   drop column if exists anesthesia_volume_ml,
--   drop column if exists safe_timeout;
