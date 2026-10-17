-- =============================================================================
-- MedBook AI — Migration 0096 : Dermatology body map (Tab 2)
--
-- Spec: `docs/MedBookAI_Dermatology_Master_Implementation_Prompt.md` §6
--       (Derm Examination & Visual Body Mapping).
--
-- Tab 2 asks for a *persisted* body map: numbered lesion/location pins that each
-- link to their own observations, morphology and photos — "do not create a
-- decorative map that does not save data." `derm_exams` only held free-text
-- distribution, so this migration adds the missing entity.
--
-- DESIGN
-- ------
-- * `derm_lesions` is an event table (one row per pin), clinic-scoped and linked
--   to the encounter row it was captured on (`exam_id`, nullable so pins survive
--   even if the exam day is re-saved). Pins are listed per patient newest first.
-- * Pin coordinates are normalised 0–1 fractions of the body-map image so the
--   same pin lands correctly at any rendered size; the readable anchor is
--   `body_region`/`body_view` (front or back).
-- * Structured morphology/colour/texture are `text[]` so a clinician is never
--   limited to a fixed chip list — custom tags live with the lesion, never in a
--   global vocabulary.
-- * `derm_photos.lesion_id` links an existing tagged photo to its pin (§6.4).
-- * `derm_exams.severity_scores` stores validated scoring sheets (GAGS, PASI,
--   ABCDE) as JSON with their inputs, so the total can always be explained.
-- * Everything is clinic-scoped via RLS (`is_clinic_member`) exactly like the
--   other `derm_*` tables; every query also filters `clinic_id` explicitly.
--
-- SAFETY
-- ------
-- * Re-runnable: `if not exists` guards, `drop policy if exists` before create.
-- * Additive only: no column is dropped, existing rows keep working.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Dermatology — Body-map lesion / location pin.
-- ---------------------------------------------------------------------------
create table if not exists public.derm_lesions (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references public.clinics (id) on delete cascade,
  patient_id    uuid not null references public.patients (id) on delete cascade,
  doctor_id     uuid references public.doctors (id) on delete set null,
  exam_id       uuid references public.derm_exams (id) on delete set null,
  pin_number    integer not null default 1,
  body_region   text not null,
  body_view     text not null default 'front' check (body_view in ('front', 'back')),
  body_x        numeric(5, 4) check (body_x between 0 and 1),
  body_y        numeric(5, 4) check (body_y between 0 and 1),
  laterality    text check (laterality in ('left', 'right', 'bilateral', 'central')),
  morphology    text[] not null default '{}',
  color         text[] not null default '{}',
  texture       text[] not null default '{}',
  size_value    numeric,
  size_unit     text default 'mm',
  observations  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint derm_lesions_clinic_patient_fkey
    foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
);

create index if not exists derm_lesions_clinic_idx
  on public.derm_lesions (clinic_id, patient_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Link an existing tagged photo to its body pin (§6.4).
-- ---------------------------------------------------------------------------
alter table public.derm_photos
  add column if not exists lesion_id uuid
    references public.derm_lesions (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3. Structured, reviewable severity scoring on the encounter (§6.5).
-- ---------------------------------------------------------------------------
alter table public.derm_exams
  add column if not exists severity_scores jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- RLS — same `is_clinic_member` pattern as migration 0077.
-- ---------------------------------------------------------------------------
alter table public.derm_lesions enable row level security;

drop policy if exists derm_lesions_select on public.derm_lesions;
drop policy if exists derm_lesions_insert on public.derm_lesions;
drop policy if exists derm_lesions_update on public.derm_lesions;
drop policy if exists derm_lesions_delete on public.derm_lesions;
create policy derm_lesions_select on public.derm_lesions
  for select using (public.is_clinic_member(clinic_id));
create policy derm_lesions_insert on public.derm_lesions
  for insert with check (public.is_clinic_member(clinic_id));
create policy derm_lesions_update on public.derm_lesions
  for update using (public.is_clinic_member(clinic_id))
  with check (public.is_clinic_member(clinic_id));
create policy derm_lesions_delete on public.derm_lesions
  for delete using (public.is_clinic_member(clinic_id));

-- ---------------------------------------------------------------------------
-- updated_at trigger (shared `handle_updated_at` from migration 0001).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'specialty_derm_lesions_updated_at'
      and tgrelid = 'public.derm_lesions'::regclass
  ) then
    create trigger specialty_derm_lesions_updated_at
      before update on public.derm_lesions
      for each row execute function public.handle_updated_at();
  end if;
end
$$;

notify pgrst, 'reload schema';

-- ROLLBACK
-- ----------------------------------------------------------------------------
-- alter table public.derm_exams drop column if exists severity_scores;
-- alter table public.derm_photos drop column if exists lesion_id;
-- drop table if exists public.derm_lesions;
-- =============================================================================
