-- =============================================================================
-- MedBook AI — Migration 0097 : Dermatology diagnosis & assessment (Tab 3)
--
-- Spec: `docs/MedBookAI_Dermatology_Master_Implementation_Prompt.md` §7
--       (Diagnosis & Clinical Assessment).
--
-- `derm_exams` only carried a single free-text diagnosis + one ICD string, so
-- Tab 3's requirements — primary vs differential/suspected/provisional
-- diagnoses, an assessment narrative and a patient-friendly explanation —
-- could not be represented. This migration adds them.
--
-- DESIGN
-- ------
-- * `derm_diagnoses` is an event table: one row per diagnosis on an encounter,
--   each carrying its own status so "primary vs differential" is real data, not
--   a label. Coded terms are stored when the clinician has one; a clear
--   free-text label is always allowed (never a fabricated code).
-- * `assessment` and `patient_explanation` extend the encounter row.
--
-- SAFETY
-- ------
-- * Re-runnable, additive only. Same clinic-scoped RLS as migration 0077.
-- =============================================================================

create table if not exists public.derm_diagnoses (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics (id) on delete cascade,
  patient_id  uuid not null references public.patients (id) on delete cascade,
  doctor_id   uuid references public.doctors (id) on delete set null,
  exam_id     uuid references public.derm_exams (id) on delete cascade,
  label       text not null,
  icd_code    text,
  status      text not null default 'primary'
                check (status in ('primary', 'differential', 'suspected', 'provisional')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint derm_diagnoses_clinic_patient_fkey
    foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
);

create index if not exists derm_diagnoses_clinic_idx
  on public.derm_diagnoses (clinic_id, patient_id, created_at desc);

alter table public.derm_exams add column if not exists assessment text;
alter table public.derm_exams add column if not exists patient_explanation text;

alter table public.derm_diagnoses enable row level security;

drop policy if exists derm_diagnoses_select on public.derm_diagnoses;
drop policy if exists derm_diagnoses_insert on public.derm_diagnoses;
drop policy if exists derm_diagnoses_update on public.derm_diagnoses;
drop policy if exists derm_diagnoses_delete on public.derm_diagnoses;
create policy derm_diagnoses_select on public.derm_diagnoses
  for select using (public.is_clinic_member(clinic_id));
create policy derm_diagnoses_insert on public.derm_diagnoses
  for insert with check (public.is_clinic_member(clinic_id));
create policy derm_diagnoses_update on public.derm_diagnoses
  for update using (public.is_clinic_member(clinic_id))
  with check (public.is_clinic_member(clinic_id));
create policy derm_diagnoses_delete on public.derm_diagnoses
  for delete using (public.is_clinic_member(clinic_id));

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'specialty_derm_diagnoses_updated_at'
      and tgrelid = 'public.derm_diagnoses'::regclass
  ) then
    create trigger specialty_derm_diagnoses_updated_at
      before update on public.derm_diagnoses
      for each row execute function public.handle_updated_at();
  end if;
end
$$;

notify pgrst, 'reload schema';

-- ROLLBACK
-- ----------------------------------------------------------------------------
-- alter table public.derm_exams drop column if exists assessment;
-- alter table public.derm_exams drop column if exists patient_explanation;
-- drop table if exists public.derm_diagnoses;
-- =============================================================================
