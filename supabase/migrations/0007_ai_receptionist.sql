-- =============================================================================
-- MedBook AI — Phase 5 | Migration 0007
-- AI Receptionist: clinic_ai_settings + ai_conversation_logs
--
-- DESIGN NOTES
-- ------------
-- * `clinic_ai_settings` holds the doctor-configured knowledge/behavior for the
--   Gemini receptionist (FAQs, welcome message, tone, policies). One row per
--   clinic (`clinic_id` UNIQUE). `faqs` is a JSONB array of `{question, answer}`
--   objects; its shape is validated by Zod before it is ever stored, and the
--   CHECK only guarantees it is an array.
-- * `ai_conversation_logs` is the observability sink for the AI chat endpoint
--   (per-turn rows). `outcome` is one of `success` / `failed` / `escalated`:
--     - `success`    — turn answered without a failing tool call
--     - `failed`     — a tool call failed (e.g. booking rejected)
--     - `escalated`  — a medical question was refused/escalated
--   `booking_attempted` is set when `createAppointment` was invoked, and
--   `message_count` records the conversation length so far (the PRD's "average
--   conversation length" metric). `error` captures the failure reason. No
--   patient content is ever stored here — only session id, outcome and counts.
-- * RLS follows the established membership chain. Both tables are read by any
--   clinic member (matching patients/appointments). Writes are split:
--     - settings: owner/admin only (same rule as services/availability).
--     - logs: any member may insert (the orchestrator runs under the signed-in
--       tester's session; the future public widget logs through a different
--       path reviewed in that phase).
-- * `appointments.booking_source` is plain TEXT (checked 1..32 chars) so
--   `'ai_agent'` is already a legal value — no enum/constraint change needed.
--   A comment below records that for posterity.
-- * All statements are idempotent (IF NOT EXISTS / guarded blocks).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- table: clinic_ai_settings
-- ----------------------------------------------------------------------------
create table if not exists public.clinic_ai_settings (
  id                     uuid primary key default gen_random_uuid(),
  clinic_id              uuid not null unique references public.clinics (id) on delete cascade,
  agent_name             text not null default 'MedBook Assistant'
                         check (char_length(btrim(agent_name)) between 1 and 60),
  welcome_message        text check (welcome_message is null or char_length(btrim(welcome_message)) between 1 and 500),
  tone                   text not null default 'professional'
                         check (tone in ('professional', 'friendly', 'casual')),
  clinic_description     text check (clinic_description is null or char_length(btrim(clinic_description)) between 1 and 2000),
  booking_rules          text check (booking_rules is null or char_length(btrim(booking_rules)) between 1 and 2000),
  cancellation_policy_text text check (cancellation_policy_text is null or char_length(btrim(cancellation_policy_text)) between 1 and 2000),
  faqs                   jsonb not null default '[]'::jsonb check (jsonb_typeof(faqs) = 'array'),
  required_patient_fields text[] not null default '{name}'::text[]
                         check (array_length(required_patient_fields, 1) >= 1
                            and required_patient_fields <@ array['name', 'email', 'phone']::text[]),
  enabled                boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'clinic_ai_settings_set_updated_at') then
    create trigger clinic_ai_settings_set_updated_at
      before update on public.clinic_ai_settings
      for each row
      execute function public.handle_updated_at();
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- table: ai_conversation_logs
-- ----------------------------------------------------------------------------
create table if not exists public.ai_conversation_logs (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references public.clinics (id) on delete cascade,
  session_id        text not null check (char_length(btrim(session_id)) between 1 and 100),
  outcome           text not null check (outcome in ('success', 'failed', 'escalated')),
  message_count     int not null default 0 check (message_count >= 0),
  booking_attempted boolean not null default false,
  error             text check (error is null or char_length(btrim(error)) between 1 and 1000),
  created_at        timestamptz not null default now()
);

create index if not exists ai_conversation_logs_clinic_created_idx on public.ai_conversation_logs (clinic_id, created_at desc);
create index if not exists ai_conversation_logs_clinic_session_idx on public.ai_conversation_logs (clinic_id, session_id);

-- ----------------------------------------------------------------------------
-- enable RLS
-- ----------------------------------------------------------------------------
alter table public.clinic_ai_settings  enable row level security;
alter table public.ai_conversation_logs enable row level security;

-- ----------------------------------------------------------------------------
-- policies: clinic_ai_settings (read: any member; write: owner/admin)
-- ----------------------------------------------------------------------------

drop policy if exists clinic_ai_settings_select_member on public.clinic_ai_settings;
create policy clinic_ai_settings_select_member
  on public.clinic_ai_settings
  for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists clinic_ai_settings_insert_admin on public.clinic_ai_settings;
create policy clinic_ai_settings_insert_admin
  on public.clinic_ai_settings
  for insert
  to authenticated
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists clinic_ai_settings_update_admin on public.clinic_ai_settings;
create policy clinic_ai_settings_update_admin
  on public.clinic_ai_settings
  for update
  to authenticated
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists clinic_ai_settings_delete_admin on public.clinic_ai_settings;
create policy clinic_ai_settings_delete_admin
  on public.clinic_ai_settings
  for delete
  to authenticated
  using (public.is_clinic_admin(clinic_id));

-- ----------------------------------------------------------------------------
-- policies: ai_conversation_logs (any member may read/write — clinic-floor)
-- ----------------------------------------------------------------------------

drop policy if exists ai_conversation_logs_select_member on public.ai_conversation_logs;
create policy ai_conversation_logs_select_member
  on public.ai_conversation_logs
  for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists ai_conversation_logs_insert_member on public.ai_conversation_logs;
create policy ai_conversation_logs_insert_member
  on public.ai_conversation_logs
  for insert
  to authenticated
  with check (public.is_clinic_member(clinic_id));

-- `appointments.booking_source` is free TEXT (migration 0005) — 'ai_agent' is a
-- valid value without schema changes. Phase 5 tools always write 'ai_agent'.

-- =============================================================================
-- VERIFICATION (manual; mirrors the Phase 5 checklist)
-- -----------------------------------------------------------------------------
-- 1. As the clinic owner, insert one row into clinic_ai_settings with FAQs; a
--    staff member can read it but cannot update/delete it.
-- 2. As a member, insert rows into ai_conversation_logs; a user from another
--    clinic sees zero rows (RLS membership chain).
-- 3. `check (jsonb_typeof(faqs) = 'array')` rejects a non-array FAQ payload.
-- 4. `required_patient_fields <@ array['name','email','phone']` rejects
--    unknown field names.
-- 5. Insert an appointment via book_appointment(..., p_booking_source := 'ai_agent')
--    and confirm it is stored.
-- =============================================================================
