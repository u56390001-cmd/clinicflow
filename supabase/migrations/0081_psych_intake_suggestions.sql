-- ============================================================================
-- 0081 — Psychology Intake & History: AI-extracted suggestions queue
--
-- The Intake & History tab leads with AI assistance: background details are
-- proposed from the patient's pre-visit questionnaire, uploaded documents,
-- previous session notes and psychometrics, then held for the psychologist to
-- APPROVE / EDIT / REJECT before anything lands in the permanent record.
--
-- This is an approval queue, not a second record. Approved values merge into
-- `psych_intake`, the one snapshot the rest of the workspace (AI summary, care
-- plan, session context) already reads — so nothing downstream changes.
--
-- Design:
--   * One row per proposed field value. `field` mirrors the `psych_intake`
--     columns so approval is a straight merge.
--   * `source` / `source_label` / `source_date` carry provenance so the tab can
--     show "From <report> · 15 Mar 2018" beside each suggestion.
--   * `status` moves pending -> approved | rejected once; `reviewed_by` /
--     `reviewed_at` record who decided.
--   * clinic-scoped via RLS (`is_clinic_member`), exactly like `psych_intake`.
--
-- Re-runnable: IF NOT EXISTS guards, DROP ... IF EXISTS before CREATE.
-- ============================================================================

create table if not exists public.psych_intake_suggestions (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics (id) on delete cascade,
  patient_id      uuid not null references public.patients (id) on delete cascade,
  field           text not null
                    check (field in (
                      'previous_therapy_history',
                      'previous_diagnosis',
                      'family_mental_health_history',
                      'psychosocial_background',
                      'stressors',
                      'substance_use_history'
                    )),
  value           text not null check (length(btrim(value)) > 0),
  source          text not null default 'ai'
                    check (source in ('pre_visit', 'document', 'session', 'assessment', 'ai')),
  source_label    text,
  source_date     date,
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  created_by_name text,
  reviewed_by     text,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint psych_intake_suggestions_clinic_patient_fkey
    foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
);

create index if not exists psych_intake_suggestions_queue_idx
  on public.psych_intake_suggestions (clinic_id, patient_id, status, created_at desc);

-- clinic_id is immutable, matching every other clinic-scoped table (0069).
drop trigger if exists psych_intake_suggestions_prevent_clinic_id_change on public.psych_intake_suggestions;
create trigger psych_intake_suggestions_prevent_clinic_id_change
  before update on public.psych_intake_suggestions
  for each row execute function public.prevent_clinic_id_change();

drop trigger if exists psych_intake_suggestions_updated_at on public.psych_intake_suggestions;
create trigger psych_intake_suggestions_updated_at
  before update on public.psych_intake_suggestions
  for each row execute function public.handle_updated_at();

alter table public.psych_intake_suggestions enable row level security;

drop policy if exists psych_intake_suggestions_select on public.psych_intake_suggestions;
drop policy if exists psych_intake_suggestions_insert on public.psych_intake_suggestions;
drop policy if exists psych_intake_suggestions_update on public.psych_intake_suggestions;
drop policy if exists psych_intake_suggestions_delete on public.psych_intake_suggestions;

create policy psych_intake_suggestions_select on public.psych_intake_suggestions
  for select to authenticated using (public.is_clinic_member(clinic_id));
create policy psych_intake_suggestions_insert on public.psych_intake_suggestions
  for insert to authenticated with check (public.is_clinic_member(clinic_id));
create policy psych_intake_suggestions_update on public.psych_intake_suggestions
  for update to authenticated
  using (public.is_clinic_member(clinic_id))
  with check (public.is_clinic_member(clinic_id));
create policy psych_intake_suggestions_delete on public.psych_intake_suggestions
  for delete to authenticated using (public.is_clinic_member(clinic_id));

comment on table public.psych_intake_suggestions is
  'AI-extracted Intake & History suggestions awaiting psychologist approval. Approved values merge into psych_intake.';

notify pgrst, 'reload schema';

-- ROLLBACK
-- drop table if exists public.psych_intake_suggestions;
