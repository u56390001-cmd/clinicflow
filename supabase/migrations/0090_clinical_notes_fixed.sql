-- ============================================================================
-- 0090 - Clinical notes (AI-approved summaries)
--
-- Phase 4: approved AI longitudinal summaries are written to clinical_notes for
-- auditability. Append-only; read for clinic members, create for clinical
-- staff. Updates/deletes blocked.
-- ============================================================================

create table if not exists public.clinical_notes (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  patient_id uuid not null,
  author_user_id uuid references auth.users (id) on delete set null,
  author_name text,
  source text not null default 'ai_longitudinal_summary' check (source in ('ai_longitudinal_summary', 'clinician_manual')),
  content_markdown text not null check (length(btrim(content_markdown)) between 1 and 8000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.clinical_notes
  add constraint clinical_notes_patient_fk foreign key (clinic_id, patient_id) references public.patients (clinic_id, id) on delete cascade;

create index if not exists clinical_notes_clinic_patient_idx
  on public.clinical_notes (clinic_id, patient_id, created_at desc);

create index if not exists clinical_notes_author_idx
  on public.clinical_notes (clinic_id, author_user_id, created_at desc);

alter table public.clinical_notes enable row level security;

drop policy if exists clinical_notes_select on public.clinical_notes;
create policy clinical_notes_select on public.clinical_notes
  for select to authenticated using (public.is_clinic_member(clinic_id));

drop policy if exists clinical_notes_insert on public.clinical_notes;
create policy clinical_notes_insert on public.clinical_notes
  for insert to authenticated with check (public.is_clinic_member(clinic_id));

revoke all on public.clinical_notes from anon;
revoke all on public.clinical_notes from public;
grant select, insert on public.clinical_notes to authenticated;
revoke update, delete on public.clinical_notes from authenticated;

create or replace function public.clinical_notes_block_update()
returns trigger
language plpgsql
as 
begin
  raise exception 'clinical_notes is append-only; UPDATE is not permitted';
end;
;

drop trigger if exists clinical_notes_no_update on public.clinical_notes;
create trigger clinical_notes_no_update
  before update on public.clinical_notes
  for each row execute function public.clinical_notes_block_update();

create or replace function public.clinical_notes_block_delete()
returns trigger
language plpgsql
as 
begin
  raise exception 'clinical_notes is append-only; DELETE is not permitted';
end;
;

drop trigger if exists clinical_notes_no_delete on public.clinical_notes;
create trigger clinical_notes_no_delete
  before delete on public.clinical_notes
  for each row execute function public.clinical_notes_block_delete();

comment on table public.clinical_notes is
  'Append-only clinical notes; approved AI summaries and clinician notes for audit trail.';

notify pgrst, 'reload schema';