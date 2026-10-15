-- ============================================================================
-- 0092 — Psychology OPD: recurring assessment reminder rules (Phase 6)
--
-- Builds on the Phase 3 invite-delivery system (0080/0085/0089). A clinic can
-- attach a recurring schedule to a patient — e.g. "re-administer PHQ-9 every
-- 14 days" — and a cron sweeps due rules, mints a fresh secure invite link with
-- the same capability model as `patient_share_links` (only the SHA-256 hash is
-- stored), and delivers it over the existing WhatsApp channel.
--
-- `assessment_schedule_rules` follows the `patient_share_links` pattern exactly:
-- RLS is enabled with NO Data-API policies, so reads/writes go through the
-- service-role client after the server actions authorise the caller.
--
-- The `assessment_type` / `template_id` pair mirrors `patient_share_links`:
-- `assessment_type` is a built-in instrument key (PHQ-9, GAD-7, BDI-II, PCL-5)
-- when `template_id` is null, or the library template name when it points at
-- one of the clinic's active templates (0085).
--
-- Re-runnable: IF NOT EXISTS guards and DROP ... IF EXISTS before CREATE.
-- ============================================================================

create table if not exists public.assessment_schedule_rules (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics (id) on delete cascade,
  patient_id      uuid not null references public.patients (id) on delete cascade,
  -- Instrument key (built-in) or library template name (when template_id set).
  assessment_type text,
  template_id     uuid references public.assessment_templates (id) on delete set null,
  cadence_days    integer not null check (cadence_days between 1 and 365),
  next_run_at     timestamptz not null default now(),
  last_run_at     timestamptz,
  -- The most recent invite this rule issued, for audit.
  last_link_id    uuid references public.patient_share_links (id) on delete set null,
  active          boolean not null default true,
  created_by      uuid references auth.users (id) on delete set null,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint assessment_schedule_rules_target_check
    check (assessment_type is not null or template_id is not null)
);

create index if not exists assessment_schedule_rules_clinic_patient_idx
  on public.assessment_schedule_rules (clinic_id, patient_id, created_at desc);
create index if not exists assessment_schedule_rules_due_idx
  on public.assessment_schedule_rules (next_run_at)
  where active;

-- Service-role only: no policies are created, so anon/authenticated sessions
-- cannot read or write these rows through the Data API.
alter table public.assessment_schedule_rules enable row level security;

-- clinic_id is immutable, matching every other clinic-scoped table (0069).
drop trigger if exists assessment_schedule_rules_prevent_clinic_id_change on public.assessment_schedule_rules;
create trigger assessment_schedule_rules_prevent_clinic_id_change
  before update on public.assessment_schedule_rules
  for each row execute function public.prevent_clinic_id_change();

drop trigger if exists assessment_schedule_rules_updated_at on public.assessment_schedule_rules;
create trigger assessment_schedule_rules_updated_at
  before update on public.assessment_schedule_rules
  for each row execute function public.handle_updated_at();

comment on table public.assessment_schedule_rules is
  'Recurring assessment reminder schedules. A cron sweeps due rules and mints fresh patient_share_links invites over WhatsApp.';
