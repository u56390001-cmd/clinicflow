-- =============================================================================
-- MedBook AI — Migration 0077 : specialty-based doctor workspaces
--
-- Spec: `docs/specialty-based workspace routing.txt`
--
-- A doctor's workspace is DERIVED from `doctors.specialty` (never stored on the
-- doctor) and routes the patient record's tab set. Clinical Psychologists get a
-- psychology workspace (safety, intake, MSE, BIRP/DAP session notes,
-- psychometrics, care plan); Dermatologists get a dermatology workspace (skin
-- profile, examination, photo & body mapping, procedures, topical
-- prescription). General physicians keep the existing medical workspace and
-- this migration adds no rows to it.
--
-- DESIGN
-- ------
-- * Tables are keyed on (clinic_id, patient_id) and, where a fact is "the
--   latest snapshot" for a patient (safety, intake, MSE, care plan, skin
--   profile), `patient_id` is UNIQUE and the app upserts on it. Event tables
--   (session notes, assessments, exams, procedures, photos, topical Rx) append
--   rows and are listed newest first.
-- * Photo & body mapping reuses the existing Documents upload: `document_id`
--   references `patient_documents`, so the actual file already lives in the
--    patient-documents bucket while `derm_photos` holds the body-region tag,
--    before/after pairing and lesion notes.
-- * Everything is clinic-scoped via RLS (`is_clinic_member`) exactly like
--   `medical_history`; every query also filters `clinic_id` explicitly.
-- * `handle_updated_at()` (from 0001) keeps each `updated_at` honest.
--
-- SAFETY
-- ------
-- * Re-runnable: `if not exists` guards, `drop policy if exists` before create.
-- * No changes to existing tables; the default medical workspace is untouched.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Psychology — Overview & Safety snapshot (one per patient).
-- ---------------------------------------------------------------------------
create table if not exists public.psych_safety (
  id                      uuid primary key default gen_random_uuid(),
  clinic_id               uuid not null references public.clinics (id) on delete cascade,
  patient_id              uuid not null references public.patients (id) on delete cascade,
  risk_level              text not null default 'low'
                            check (risk_level in ('low', 'moderate', 'high', 'crisis')),
  mental_health_summary   text,
  current_concerns        text,
  emergency_contact       text,
  updated_by              text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint psych_safety_patient_unique unique (patient_id),
  constraint psych_safety_clinic_patient_fkey
    foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
);

create index if not exists psych_safety_clinic_idx on public.psych_safety (clinic_id);

-- ---------------------------------------------------------------------------
-- 2. Psychology — Intake & Psychological History (one per patient).
-- ---------------------------------------------------------------------------
create table if not exists public.psych_intake (
  id                           uuid primary key default gen_random_uuid(),
  clinic_id                    uuid not null references public.clinics (id) on delete cascade,
  patient_id                   uuid not null references public.patients (id) on delete cascade,
  previous_therapy_history     text,
  previous_diagnosis           text,
  family_mental_health_history text,
  psychosocial_background      text,
  stressors                    text,
  substance_use_history        text,
  updated_by                   text,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  constraint psych_intake_patient_unique unique (patient_id),
  constraint psych_intake_clinic_patient_fkey
    foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
);

create index if not exists psych_intake_clinic_idx on public.psych_intake (clinic_id);

-- ---------------------------------------------------------------------------
-- 3. Psychology — Mental Status Examination (one per patient, latest update wins).
-- ---------------------------------------------------------------------------
create table if not exists public.psych_mse (
  id                    uuid primary key default gen_random_uuid(),
  clinic_id             uuid not null references public.clinics (id) on delete cascade,
  patient_id            uuid not null references public.patients (id) on delete cascade,
  appearance_grooming   text,
  appearance_eye_contact text,
  appearance_behaviour  text,
  speech_rate           text,
  speech_tone           text,
  speech_volume         text,
  mood_patient_reported text,
  affect_observed       text,
  thought_process       text,
  thought_content       text,
  risk_thoughts         text,
  cognition_orientation text,
  cognition_memory      text,
  cognition_insight     text,
  cognition_judgment    text,
  updated_by            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint psych_mse_patient_unique unique (patient_id),
  constraint psych_mse_clinic_patient_fkey
    foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
);

create index if not exists psych_mse_clinic_idx on public.psych_mse (clinic_id);

-- ---------------------------------------------------------------------------
-- 4. Psychology — Session Notes, BIRP or DAP format. One row per session.
-- ---------------------------------------------------------------------------
create table if not exists public.psych_sessions (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references public.clinics (id) on delete cascade,
  patient_id    uuid not null references public.patients (id) on delete cascade,
  doctor_id     uuid references public.doctors (id) on delete set null,
  session_date  date not null default current_date,
  format        text not null default 'BIRP' check (format in ('BIRP', 'DAP')),
  -- BIRP
  behavior      text,
  intervention  text,
  response      text,
  -- DAP
  observation_data text,
  assessment    text,
  -- Shared
  plan          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint psych_sessions_clinic_patient_fkey
    foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
);

create index if not exists psych_sessions_clinic_idx on public.psych_sessions (clinic_id, patient_id, session_date desc);

-- ---------------------------------------------------------------------------
-- 5. Psychology — Psychometrics (score history). One row per administration.
-- ---------------------------------------------------------------------------
create table if not exists public.psych_assessments (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references public.clinics (id) on delete cascade,
  patient_id     uuid not null references public.patients (id) on delete cascade,
  doctor_id      uuid references public.doctors (id) on delete set null,
  assessment_type text not null check (assessment_type in ('PHQ-9', 'GAD-7', 'Other')),
  score          numeric check (score >= 0 and score <= 30),
  severity       text,
  notes          text,
  conducted_at   date not null default current_date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint psych_assessments_clinic_patient_fkey
    foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
);

create index if not exists psych_assessments_clinic_idx on public.psych_assessments (clinic_id, patient_id, conducted_at desc);

-- ---------------------------------------------------------------------------
-- 6. Psychology — Care Plan (one per patient).
-- ---------------------------------------------------------------------------
create table if not exists public.psych_care_plans (
  id                      uuid primary key default gen_random_uuid(),
  clinic_id               uuid not null references public.clinics (id) on delete cascade,
  patient_id              uuid not null references public.patients (id) on delete cascade,
  therapy_goals           text,
  intervention_plan       text,
  homework_assignments    text,
  follow_up_frequency     text,
  psychiatrist_referral   boolean not null default false,
  referral_notes          text,
  updated_by              text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint psych_care_plans_patient_unique unique (patient_id),
  constraint psych_care_plans_clinic_patient_fkey
    foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
);

create index if not exists psych_care_plans_clinic_idx on public.psych_care_plans (clinic_id);

-- ---------------------------------------------------------------------------
-- 7. Dermatology — Skin profile (one per patient).
-- ---------------------------------------------------------------------------
create table if not exists public.derm_profiles (
  id                         uuid primary key default gen_random_uuid(),
  clinic_id                  uuid not null references public.clinics (id) on delete cascade,
  patient_id                 uuid not null references public.patients (id) on delete cascade,
  skin_type                  text,
  active_conditions          text,
  allergies                  text,
  previous_skin_conditions   text,
  biopsy_alert               boolean not null default false,
  biopsy_notes               text,
  previous_treatment_history text,
  updated_by                 text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint derm_profiles_patient_unique unique (patient_id),
  constraint derm_profiles_clinic_patient_fkey
    foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
);

create index if not exists derm_profiles_clinic_idx on public.derm_profiles (clinic_id);

-- ---------------------------------------------------------------------------
-- 8. Dermatology — Skin examination. One row per consultation.
-- ---------------------------------------------------------------------------
create table if not exists public.derm_exams (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references public.clinics (id) on delete cascade,
  patient_id       uuid not null references public.patients (id) on delete cascade,
  doctor_id        uuid references public.doctors (id) on delete set null,
  exam_date        date not null default current_date,
  chief_complaints text[] not null default '{}',
  morphology       text[] not null default '{}',
  distribution     text check (distribution in ('localized', 'generalized', 'dermatomal')),
  diagnosis        text,
  icd_code         text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint derm_exams_clinic_patient_fkey
    foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
);

create index if not exists derm_exams_clinic_idx on public.derm_exams (clinic_id, patient_id, exam_date desc);

-- ---------------------------------------------------------------------------
-- 9. Dermatology — Procedures (biopsy, cryotherapy, …).
-- ---------------------------------------------------------------------------
create table if not exists public.derm_procedures (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics (id) on delete cascade,
  patient_id      uuid not null references public.patients (id) on delete cascade,
  doctor_id       uuid references public.doctors (id) on delete set null,
  procedure_name  text not null,
  procedure_date  date not null default current_date,
  notes           text,
  consent_status  text not null default 'documented'
                     check (consent_status in ('obtained', 'declined', 'documented')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint derm_procedures_clinic_patient_fkey
    foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
);

create index if not exists derm_procedures_clinic_idx on public.derm_procedures (clinic_id, patient_id, procedure_date desc);

-- ---------------------------------------------------------------------------
-- 10. Dermatology — Photo & body mapping. Files live in patient_documents;
--     this row tags one of those files with a body region + before/after pairing.
-- ---------------------------------------------------------------------------
create table if not exists public.derm_photos (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references public.clinics (id) on delete cascade,
  patient_id    uuid not null references public.patients (id) on delete cascade,
  doctor_id     uuid references public.doctors (id) on delete set null,
  document_id   uuid references public.patient_documents (id) on delete cascade,
  body_region   text not null,
  photo_type    text not null default 'baseline'
                    check (photo_type in ('baseline', 'follow_up', 'post_treatment')),
  lesion_notes  text,
  paired_with   uuid references public.derm_photos (id) on delete set null,
  taken_at      date not null default current_date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint derm_photos_clinic_patient_fkey
    foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
);

create index if not exists derm_photos_clinic_idx on public.derm_photos (clinic_id, patient_id, taken_at desc);

-- ---------------------------------------------------------------------------
-- 11. Dermatology — Topical prescription support. One row per consultation.
-- ---------------------------------------------------------------------------
create table if not exists public.derm_prescriptions (
  id                       uuid primary key default gen_random_uuid(),
  clinic_id                uuid not null references public.clinics (id) on delete cascade,
  patient_id               uuid not null references public.patients (id) on delete cascade,
  doctor_id                uuid references public.doctors (id) on delete set null,
  visit_id                 uuid references public.visits (id) on delete set null,
  topical_form             text check (topical_form in ('cream', 'ointment', 'gel', 'lotion')),
  application_instructions text,
  skincare_routine_am      text,
  skincare_routine_pm      text,
  patient_education        text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint derm_prescriptions_clinic_patient_fkey
    foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
);

create index if not exists derm_prescriptions_clinic_idx on public.derm_prescriptions (clinic_id, patient_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS — every table follows the `medical_history` pattern: a clinic member can
-- read/write rows inside their own clinic, nothing more.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'psych_safety', 'psych_intake', 'psych_mse', 'psych_sessions',
    'psych_assessments', 'psych_care_plans', 'derm_profiles', 'derm_exams',
    'derm_procedures', 'derm_photos', 'derm_prescriptions'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', 'specialty_' || t || '_select', t);
    execute format('drop policy if exists %I on public.%I', 'specialty_' || t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', 'specialty_' || t || '_update', t);
    execute format('drop policy if exists %I on public.%I', 'specialty_' || t || '_delete', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_clinic_member(clinic_id))',
      'specialty_' || t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_clinic_member(clinic_id))',
      'specialty_' || t || '_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id))',
      'specialty_' || t || '_update', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_clinic_member(clinic_id))',
      'specialty_' || t || '_delete', t
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- updated_at triggers (shared `handle_updated_at` from migration 0001).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'psych_safety', 'psych_intake', 'psych_mse', 'psych_sessions',
    'psych_assessments', 'psych_care_plans', 'derm_profiles', 'derm_exams',
    'derm_procedures', 'derm_photos', 'derm_prescriptions'
  ] loop
    if not exists (
      select 1 from pg_trigger
      where tgname = 'specialty_' || t || '_updated_at' and tgrelid = format('public.%I', t)::regclass
    ) then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.handle_updated_at()',
        'specialty_' || t || '_updated_at', t
      );
    end if;
  end loop;
end
$$;

notify pgrst, 'reload schema';

-- ROLLBACK
-- ----------------------------------------------------------------------------
-- drop table if exists public.derm_prescriptions;
-- drop table if exists public.derm_photos;
-- drop table if exists public.derm_procedures;
-- drop table if exists public.derm_exams;
-- drop table if exists public.derm_profiles;
-- drop table if exists public.psych_care_plans;
-- drop table if exists public.psych_assessments;
-- drop table if exists public.psych_sessions;
-- drop table if exists public.psych_mse;
-- drop table if exists public.psych_intake;
-- drop table if exists public.psych_safety;
-- =============================================================================