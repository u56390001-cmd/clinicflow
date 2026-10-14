-- ============================================================================
-- 0087 — Phase 1: deterministic scoring, validated-instrument metadata & the
--        clinical safety triage pipeline.
--
-- Spec: docs/medbook-ai-phase1-specification.md
--
-- This migration is ADDITIVE and reuses the existing psychology/assessment
-- tables rather than creating a parallel schema:
--
--   * `assessment_templates` (0085) gains the instrument identity/versioning
--     fields the spec asks for (`code`, `version`, `instrument_meta`,
--     `is_validated`) so validated instruments can be distinguished from
--     clinic-authored questionnaires. Submitted responses snapshot the active
--     structure, so the template row itself stays editable.
--
--   * `psych_assessments` (0077→0086) IS the spec's `assessment_responses`
--     table. It gains the deterministic-scoring outputs (scaled score,
--     subscales, diagnostic criteria), validity/imputation flags, the
--     administration mode, the immutable template snapshot, and the safety
--     triage state (`safety_flag_raised`, `risk_level`, `review_status`) with
--     provider review provenance.
--
--   * `assessment_safety_events` is NEW: an append-only transition log for the
--     safety state machine (§2.2), mirroring the `audit_logs` (0072)
--     append-only pattern. Every risk state change writes one row here and one
--     `audit_logs` row.
--
-- Existing rows are valid: every new column is nullable or defaulted, and the
-- one semantic backfill (`administration_mode`) is derived from the existing
-- `completed_by` value.
--
-- Re-runnable: IF NOT EXISTS guards and DROP ... IF EXISTS before CREATE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. assessment_templates — instrument identity + immutable version metadata
-- ----------------------------------------------------------------------------
alter table public.assessment_templates
  add column if not exists code text;

alter table public.assessment_templates
  add column if not exists version text not null default '1.0.0';

-- Engine metadata: subscales, diagnostic rules, safety triggers, imputation.
-- Empty for clinic-authored questionnaires (which stay on the sum/average path).
alter table public.assessment_templates
  add column if not exists instrument_meta jsonb not null default '{}'::jsonb;

alter table public.assessment_templates
  add column if not exists is_validated boolean not null default false;

-- Instrument codes are shared across clinics, so the lookup is by code.
create index if not exists assessment_templates_code_idx
  on public.assessment_templates (code, version)
  where code is not null;

comment on column public.assessment_templates.code is
  'Validated-instrument key (PHQ-9, GAD-7, C-SSRS, PCL-5, WHODAS-2.0-12); null for clinic-authored templates.';
comment on column public.assessment_templates.version is
  'Semantic version (MAJOR.MINOR.PATCH). Each response snapshots the version it was scored against.';
comment on column public.assessment_templates.instrument_meta is
  'Phase-1 engine metadata: subscales, diagnostic criteria, safety triggers, imputation caps.';

-- ----------------------------------------------------------------------------
-- 2. psych_assessments — deterministic scoring outputs + validity
-- ----------------------------------------------------------------------------
alter table public.psych_assessments
  add column if not exists scaled_score numeric;

alter table public.psych_assessments
  add column if not exists subscale_scores jsonb not null default '{}'::jsonb;

alter table public.psych_assessments
  add column if not exists diagnostic_criteria_results jsonb not null default '{}'::jsonb;

alter table public.psych_assessments
  add column if not exists is_valid boolean not null default true;

alter table public.psych_assessments
  add column if not exists invalidation_reason text;

-- How the instrument was administered (spec §3.1). Derived from the existing
-- `completed_by` on backfill so history stays consistent.
alter table public.psych_assessments
  add column if not exists administration_mode text not null default 'CLINICIAN_ENTERED'
    check (administration_mode in ('SELF_REPORT', 'CLINICIAN_ENTERED', 'PROXY'));

-- Immutable snapshot of the exact template structure scored, for audit.
alter table public.psych_assessments
  add column if not exists template_version text;

alter table public.psych_assessments
  add column if not exists template_snapshot jsonb;

-- Denormalised instrument code so safety/analytics queries don't need a join.
alter table public.psych_assessments
  add column if not exists instrument_code text;

-- ----------------------------------------------------------------------------
-- 3. psych_assessments — safety triage state
-- ----------------------------------------------------------------------------
alter table public.psych_assessments
  add column if not exists safety_flag_raised boolean not null default false;

alter table public.psych_assessments
  add column if not exists risk_level text not null default 'NONE'
    check (risk_level in ('NONE', 'LOW', 'MODERATE', 'HIGH'));

alter table public.psych_assessments
  add column if not exists review_status text not null default 'CLEAR'
    check (review_status in (
      'CLEAR', 'PENDING_REVIEW', 'UNDER_REVIEW',
      'ACTIONED_SAFETY_PLAN', 'ESCALATED_EMERGENCY', 'RESOLVED'
    ));

alter table public.psych_assessments
  add column if not exists reviewed_by uuid references auth.users (id) on delete set null;

alter table public.psych_assessments
  add column if not exists reviewed_at timestamptz;

-- Backfill administration_mode from the pre-existing origin column.
update public.psych_assessments
  set administration_mode = case completed_by
    when 'patient_online' then 'SELF_REPORT'
    when 'reception'      then 'PROXY'
    else 'CLINICIAN_ENTERED'
  end;

-- Fast lookup for the persistent safety banner + review queue.
create index if not exists psych_assessments_safety_idx
  on public.psych_assessments (clinic_id, patient_id, review_status, conducted_at desc)
  where safety_flag_raised = true;

comment on column public.psych_assessments.scaled_score is
  'Derived scaled/standardised score (e.g. WHODAS 2.0 metric 0-100). Null when not applicable.';
comment on column public.psych_assessments.subscale_scores is
  'Subscale sums keyed by subscale id (e.g. PCL-5 clusters B/C/D/E).';
comment on column public.psych_assessments.diagnostic_criteria_results is
  'Deterministic diagnostic-criteria evaluation (e.g. PCL-5 DSM-5 provisional).';
comment on column public.psych_assessments.template_snapshot is
  'Immutable snapshot of the instrument/template structure scored, for legal auditability.';
comment on column public.psych_assessments.review_status is
  'Safety triage state machine: CLEAR → PENDING_REVIEW → UNDER_REVIEW → ACTIONED_SAFETY_PLAN/ESCALATED_EMERGENCY → RESOLVED.';

-- ----------------------------------------------------------------------------
-- 4. assessment_safety_events — append-only triage transition log
-- ----------------------------------------------------------------------------
create table if not exists public.assessment_safety_events (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references public.clinics (id) on delete cascade,
  patient_id       uuid not null references public.patients (id) on delete cascade,
  assessment_id    uuid not null references public.psych_assessments (id) on delete cascade,
  from_status      text,
  to_status        text not null
                     check (to_status in (
                       'CLEAR', 'PENDING_REVIEW', 'UNDER_REVIEW',
                       'ACTIONED_SAFETY_PLAN', 'ESCALATED_EMERGENCY', 'RESOLVED'
                     )),
  risk_level       text
                     check (risk_level is null or risk_level in ('NONE', 'LOW', 'MODERATE', 'HIGH')),
  actor_type       text not null default 'system'
                     check (actor_type in ('system', 'provider')),
  actor_user_id    uuid references auth.users (id) on delete set null,
  actor_name       text,
  rationale        text,
  details          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists assessment_safety_events_assessment_idx
  on public.assessment_safety_events (assessment_id, created_at);
create index if not exists assessment_safety_events_clinic_idx
  on public.assessment_safety_events (clinic_id, patient_id, created_at desc);

alter table public.assessment_safety_events enable row level security;

drop policy if exists assessment_safety_events_select on public.assessment_safety_events;
create policy assessment_safety_events_select on public.assessment_safety_events
  for select to authenticated using (public.is_clinic_member(clinic_id));

drop policy if exists assessment_safety_events_insert on public.assessment_safety_events;
create policy assessment_safety_events_insert on public.assessment_safety_events
  for insert to authenticated with check (public.is_clinic_member(clinic_id));

-- No UPDATE/DELETE policy: the log is append-only. Belt-and-braces trigger
-- blocks UPDATE even for a service-role writer (mirrors audit_logs, 0072).
create or replace function public.assessment_safety_events_block_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'assessment_safety_events is append-only; UPDATE is not permitted';
end;
$$;

drop trigger if exists assessment_safety_events_no_update on public.assessment_safety_events;
create trigger assessment_safety_events_no_update
  before update on public.assessment_safety_events
  for each row execute function public.assessment_safety_events_block_update();

-- Grant hygiene: members read/append only (0064/0072 pattern).
revoke all on public.assessment_safety_events from anon;
revoke all on public.assessment_safety_events from public;
grant select, insert on public.assessment_safety_events to authenticated;
revoke update, delete on public.assessment_safety_events from authenticated;

comment on table public.assessment_safety_events is
  'Append-only clinical safety triage transitions for scored assessments (Phase 1 §2.2).';

notify pgrst, 'reload schema';

-- ROLLBACK
-- ----------------------------------------------------------------------------
-- drop trigger if exists assessment_safety_events_no_update on public.assessment_safety_events;
-- drop function if exists public.assessment_safety_events_block_update();
-- drop table if exists public.assessment_safety_events;
-- drop index if exists public.psych_assessments_safety_idx;
-- alter table public.psych_assessments
--   drop column if exists reviewed_at,
--   drop column if exists reviewed_by,
--   drop column if exists review_status,
--   drop column if exists risk_level,
--   drop column if exists safety_flag_raised,
--   drop column if exists instrument_code,
--   drop column if exists template_snapshot,
--   drop column if exists template_version,
--   drop column if exists administration_mode,
--   drop column if exists invalidation_reason,
--   drop column if exists is_valid,
--   drop column if exists diagnostic_criteria_results,
--   drop column if exists subscale_scores,
--   drop column if exists scaled_score;
-- drop index if exists public.assessment_templates_code_idx;
-- alter table public.assessment_templates
--   drop column if exists is_validated,
--   drop column if exists instrument_meta,
--   drop column if exists version,
--   drop column if exists code;
