-- Migration: 0041_ambient_copilot_tables.sql
-- Description: Creates tables for ambient audio transcripts, AI extraction audit logs, and copilot settings.

-- 1. ENCOUNTER TRANSCRIPTS TABLE
create table if not exists public.encounter_transcripts (
  
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  patient_id uuid not null,
  doctor_id uuid not null,
  visit_id uuid not null references public.visits(id) on delete cascade,
  audio_duration_seconds integer default 0,
  raw_transcript text not null default '',
  diarized_transcript jsonb default '[]'::jsonb,
  processing_status text check (processing_status in ('recording', 'transcribing', 'structuring', 'completed', 'failed')) default 'recording',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint encounter_transcripts_clinic_visit_unique unique (clinic_id, visit_id),
  foreign key (clinic_id) references public.clinics(id) on delete cascade,
  foreign key (clinic_id, patient_id) references public.patients(clinic_id, id) on delete cascade,
  foreign key (clinic_id, doctor_id) references public.doctors(clinic_id, id) on delete cascade
);

-- 2. COPILOT AUDIT LOGS TABLE
create table if not exists public.copilot_audit_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  visit_id uuid not null references public.visits(id) on delete cascade,
  doctor_id uuid not null,
  extracted_json jsonb not null,
  applied_changes jsonb,
  was_populated_to_form boolean default false,
  feedback_rating integer check (feedback_rating in (-1, 1)), -- -1 = Thumbs Down, 1 = Thumbs Up
  feedback_notes text,
  created_at timestamptz not null default now(),
  foreign key (clinic_id) references public.clinics(id) on delete cascade,
  foreign key (clinic_id, doctor_id) references public.doctors(clinic_id, id) on delete cascade
);

-- RLS POLICIES (Matching 0024_consultation_prescription.sql pattern)
alter table public.encounter_transcripts enable row level security;
alter table public.copilot_audit_logs enable row level security;

create policy "Clinic members can view transcripts"
  on public.encounter_transcripts for select
  using (public.is_clinic_member(clinic_id));

create policy "Clinic members can insert transcripts"
  on public.encounter_transcripts for insert
  with check (public.is_clinic_member(clinic_id));

create policy "Clinic members can update transcripts"
  on public.encounter_transcripts for update
  using (public.is_clinic_member(clinic_id));

create policy "Clinic members can view audit logs"
  on public.copilot_audit_logs for select
  using (public.is_clinic_member(clinic_id));

create policy "Clinic members can insert audit logs"
  on public.copilot_audit_logs for insert
  with check (public.is_clinic_member(clinic_id));

-- INDEXES FOR PERFORMANCE
create index if not exists idx_transcripts_clinic_visit on public.encounter_transcripts(clinic_id, visit_id);
create index if not exists idx_copilot_logs_clinic_visit on public.copilot_audit_logs(clinic_id, visit_id);
