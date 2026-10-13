-- ============================================================================
-- 0085 — Assessment Library (Clinical Settings)
--
-- Clinic-owned psychological assessment templates: the Settings → Clinical
-- Settings → Assessment Library feature. Each clinic can organise instrument
-- templates into categories, configure questions, scoring (method + severity
-- bands) and AI interpretation rules, and then use the templates in Patient
-- Workspace → Psychometrics (manual entry / during consultation) and via
-- send-to-patient share links (patient_share_links, 0080).
--
-- Design:
--   * `clinic_assessment_categories` — clinic-scoped category buckets (e.g.
--     "Anxiety", "Depression", "ADHD & Attention", "Trauma").
--   * `assessment_templates` — the instrument cards. Questions, scoring and
--     interpretation are JSONB so the shape can evolve without migration
--     churn. Rows are clinic-scoped like every other clinic table (0069).
--   * Standard instruments are NOT seeded here: they live in a TypeScript
--     catalog (lib/assessment-library.ts) and are copied in by "Import
--     template" so each clinic can edit a copy for its own practice.
--   * `psych_assessments.assessment_type` is widened from the 9-literal CHECK
--     (0079) to free text (max 80 chars) because library template names are
--     clinician-defined; the row still records `template_id` when it came
--     from a library template.
--   * `patient_share_links` gains `template_id` so a minted assessment link
--     can point at a library template (the visitor form renders template
--     questions generically).
--
-- RLS: read for any clinic member, write for clinic admins only — matches
-- clinical *settings* governance (medicines, 0057 style). Template rows are
-- read by psychologists (to log/send assessments) but only admins configure
-- them.
--
-- Re-runnable: IF NOT EXISTS guards, DROP ... IF EXISTS before CREATE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Categories
-- ----------------------------------------------------------------------------
create table if not exists public.clinic_assessment_categories (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 120),
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clinic_assessment_categories_clinic_idx
  on public.clinic_assessment_categories (clinic_id, sort_order, name);

create unique index if not exists clinic_assessment_categories_clinic_name_key
  on public.clinic_assessment_categories (clinic_id, lower(name));

-- ----------------------------------------------------------------------------
-- Templates
-- ----------------------------------------------------------------------------
create table if not exists public.assessment_templates (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references public.clinics (id) on delete cascade,
  category_id      uuid references public.clinic_assessment_categories (id) on delete set null,
  name             text not null check (length(btrim(name)) between 1 and 120),
  description      text,
  target_specialty text not null default 'psychology'
    check (target_specialty in ('psychology', 'psychiatry', 'general_medicine')),
  status           text not null default 'draft'
    check (status in ('draft', 'active')),
  questions        jsonb not null default '[]'::jsonb,
  scoring          jsonb not null default '{}'::jsonb,
  interpretation   jsonb not null default '[]'::jsonb,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists assessment_templates_clinic_idx
  on public.assessment_templates (clinic_id, status, name);

create index if not exists assessment_templates_category_idx
  on public.assessment_templates (category_id);

create unique index if not exists assessment_templates_clinic_name_key
  on public.assessment_templates (clinic_id, lower(name));

-- ----------------------------------------------------------------------------
-- Wire library templates into existing psych tables
-- ----------------------------------------------------------------------------
alter table public.psych_assessments
  add column if not exists template_id uuid
    references public.assessment_templates (id) on delete set null;

alter table public.psych_assessments
  drop constraint if exists psych_assessments_assessment_type_check;

alter table public.psych_assessments
  add constraint psych_assessments_assessment_type_check
    check (length(btrim(assessment_type)) between 1 and 80);

alter table public.patient_share_links
  add column if not exists template_id uuid
    references public.assessment_templates (id) on delete set null;

-- ----------------------------------------------------------------------------
-- Immutability + updated_at, matching every clinic-scoped table (0069/0081)
-- ----------------------------------------------------------------------------
drop trigger if exists clinic_assessment_categories_prevent_clinic_id_change on public.clinic_assessment_categories;
create trigger clinic_assessment_categories_prevent_clinic_id_change
  before update on public.clinic_assessment_categories
  for each row execute function public.prevent_clinic_id_change();

drop trigger if exists clinic_assessment_categories_updated_at on public.clinic_assessment_categories;
create trigger clinic_assessment_categories_updated_at
  before update on public.clinic_assessment_categories
  for each row execute function public.handle_updated_at();

drop trigger if exists assessment_templates_prevent_clinic_id_change on public.assessment_templates;
create trigger assessment_templates_prevent_clinic_id_change
  before update on public.assessment_templates
  for each row execute function public.prevent_clinic_id_change();

drop trigger if exists assessment_templates_updated_at on public.assessment_templates;
create trigger assessment_templates_updated_at
  before update on public.assessment_templates
  for each row execute function public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- RLS — members read, admins write
-- ----------------------------------------------------------------------------
alter table public.clinic_assessment_categories enable row level security;
alter table public.assessment_templates enable row level security;

drop policy if exists clinic_assessment_categories_select on public.clinic_assessment_categories;
drop policy if exists clinic_assessment_categories_insert on public.clinic_assessment_categories;
drop policy if exists clinic_assessment_categories_update on public.clinic_assessment_categories;
drop policy if exists clinic_assessment_categories_delete on public.clinic_assessment_categories;

create policy clinic_assessment_categories_select on public.clinic_assessment_categories
  for select to authenticated using (public.is_clinic_member(clinic_id));
create policy clinic_assessment_categories_insert on public.clinic_assessment_categories
  for insert to authenticated with check (public.is_clinic_admin(clinic_id));
create policy clinic_assessment_categories_update on public.clinic_assessment_categories
  for update to authenticated
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));
create policy clinic_assessment_categories_delete on public.clinic_assessment_categories
  for delete to authenticated using (public.is_clinic_admin(clinic_id));

drop policy if exists assessment_templates_select on public.assessment_templates;
drop policy if exists assessment_templates_insert on public.assessment_templates;
drop policy if exists assessment_templates_update on public.assessment_templates;
drop policy if exists assessment_templates_delete on public.assessment_templates;

create policy assessment_templates_select on public.assessment_templates
  for select to authenticated using (public.is_clinic_member(clinic_id));
create policy assessment_templates_insert on public.assessment_templates
  for insert to authenticated with check (public.is_clinic_admin(clinic_id));
create policy assessment_templates_update on public.assessment_templates
  for update to authenticated
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));
create policy assessment_templates_delete on public.assessment_templates
  for delete to authenticated using (public.is_clinic_admin(clinic_id));

comment on table public.clinic_assessment_categories is
  'Clinic-scoped assessment categories (Assessment Library, Clinical Settings).';
comment on table public.assessment_templates is
  'Clinic-scoped assessment templates: questions, scoring and interpretation JSONB. Writable by clinic admins only.';

notify pgrst, 'reload schema';

-- ROLLBACK
-- drop table if exists public.assessment_templates;
-- drop table if exists public.clinic_assessment_categories;
-- alter table public.patient_share_links drop column if exists template_id;
-- alter table public.psych_assessments drop column if exists template_id;
-- alter table public.psych_assessments
--   add constraint psych_assessments_assessment_type_check
--   check (assessment_type in ('PHQ-9','GAD-7','BAI','BDI-II','PCL-5','OCI-R','AUDIT','ASRS','Other'));