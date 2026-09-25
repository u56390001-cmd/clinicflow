-- =============================================================================
-- MedBook AI — Phase 13 (+14 groundwork) | Migration 0020
-- WhatsApp Conversational Booking: conversation state + message history
--
-- DESIGN NOTES
-- ------------
-- * `whatsapp_conversations` is the per patient-clinic WhatsApp thread state
--   (one row per clinic + sender number). `session_state` (jsonb) tracks the
--   deterministic booking flow (selected service/doctor/date/slot, pending
--   appointment id) so multi-message conversations continue exactly where
--   they stopped. It mirrors the widget's client-held session context, moved
--   server-side because WhatsApp has no persistent browser client.
-- * Phase 14 fields are added NOW (cheap, avoids a second migration):
--     - human_takeover      — when true the webhook stores the inbound message
--                             but never auto-replies; staff answers manually.
--     - last_message_preview / unread_by_staff — inbox list-view support.
-- * `whatsapp_messages` is the persistent thread log (patient + AI + staff).
--   The inbox reads this table directly; there is no second message store.
--   Inbound Meta message ids (`meta_message_id`) are UNIQUE so Meta webhook
--   retries can be deduped at write time.
-- * `appointments.reminder_sent_at` makes the reminder cron idempotent: a
--   nullable timestamp written once the reminder for an appointment has been
--   dispatched (regardless of channel outcome, to avoid retry storms).
-- * RLS follows the established membership chain:
--     - whatsapp_conversations: members read; members update (staff takeover
--       is day-to-day clinical-floor work per CLINICAL_ROLES); insert/update
--       by the webhook happens through the service-role client (bypasses RLS
--       intentionally, like all unauthenticated channel routes).
--     - whatsapp_messages: members read + insert staff replies.
-- * All statements are idempotent.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- table: whatsapp_conversations
-- ----------------------------------------------------------------------------
create table if not exists public.whatsapp_conversations (
  id                       uuid primary key default gen_random_uuid(),
  clinic_id                uuid not null references public.clinics (id) on delete cascade,
  -- Canonical WhatsApp user id (wa_id): digits only, no leading '+'.
  patient_whatsapp_number  text not null check (char_length(btrim(patient_whatsapp_number)) between 3 and 32),
  patient_id               uuid references public.patients (id) on delete set null,
  -- Deterministic booking-flow state (service/doctor/date/slot selection,
  -- pending reschedule/cancel target). Shape owned by lib/whatsapp/adapter.ts.
  session_state            jsonb not null default '{}'::jsonb,
  human_takeover           boolean not null default false,
  last_message_preview     text check (last_message_preview is null or char_length(last_message_preview) <= 160),
  unread_by_staff          boolean not null default false,
  last_message_at          timestamptz not null default now(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint whatsapp_conversations_clinic_number_unique
    unique (clinic_id, patient_whatsapp_number)
);

create index if not exists whatsapp_conversations_clinic_recent_idx
  on public.whatsapp_conversations (clinic_id, last_message_at desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'whatsapp_conversations_set_updated_at'
  ) then
    create trigger whatsapp_conversations_set_updated_at
      before update on public.whatsapp_conversations
      for each row
      execute function public.handle_updated_at();
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- table: whatsapp_messages
-- ----------------------------------------------------------------------------
create table if not exists public.whatsapp_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations (id) on delete cascade,
  clinic_id       uuid not null references public.clinics (id) on delete cascade,
  sender_type     text not null check (sender_type in ('patient', 'ai', 'staff')),
  -- Staff sender identity (null for patient/ai rows).
  sender_user_id  uuid references auth.users (id) on delete set null,
  -- Snapshot of the staff member's display name/email at send time so the
  -- thread view needs no join into auth.users (which RLS cannot read).
  sender_name     text check (sender_name is null or char_length(btrim(sender_name)) between 1 and 200),
  content         text not null check (char_length(btrim(content)) between 1 and 4096),
  -- Meta wamid of INBOUND patient messages — unique so webhook retries are
  -- deduplicated. Null for ai/staff rows (their sends get their own wamids,
  -- which we do not need to store).
  meta_message_id text unique,
  sent_at         timestamptz not null default now()
);

create index if not exists whatsapp_messages_conversation_idx
  on public.whatsapp_messages (conversation_id, sent_at);

-- ----------------------------------------------------------------------------
-- enable RLS + policies (membership-scoped, established pattern)
-- ----------------------------------------------------------------------------
alter table public.whatsapp_conversations enable row level security;

drop policy if exists whatsapp_conversations_select_member on public.whatsapp_conversations;
create policy whatsapp_conversations_select_member
  on public.whatsapp_conversations
  for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists whatsapp_conversations_update_member on public.whatsapp_conversations;
create policy whatsapp_conversations_update_member
  on public.whatsapp_conversations
  for update
  to authenticated
  using (public.is_clinic_member(clinic_id))
  with check (public.is_clinic_member(clinic_id));

alter table public.whatsapp_messages enable row level security;

drop policy if exists whatsapp_messages_select_member on public.whatsapp_messages;
create policy whatsapp_messages_select_member
  on public.whatsapp_messages
  for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists whatsapp_messages_insert_member on public.whatsapp_messages;
create policy whatsapp_messages_insert_member
  on public.whatsapp_messages
  for insert
  to authenticated
  with check (public.is_clinic_member(clinic_id));

-- ----------------------------------------------------------------------------
-- appointments.reminder_sent_at (Phase 13 reminders, idempotent cron)
-- ----------------------------------------------------------------------------
alter table public.appointments
  add column if not exists reminder_sent_at timestamptz;

-- =============================================================================
-- VERIFICATION (manual)
-- -----------------------------------------------------------------------------
-- 1. A member SELECTs both tables — only their clinic's rows appear.
-- 2. A non-member SELECT/UPDATE returns zero rows / fails policy checks.
-- 3. Webhook-path inserts via the service-role client succeed regardless of
--    policies (RLS bypassed intentionally for that client only).
-- 4. Inserting two whatsapp_messages with the same meta_message_id fails on
--    the UNIQUE constraint (webhook retry dedup works).
-- 5. sender_type 'bot' is rejected by the CHECK; 'patient'/'ai'/'staff' pass.
-- 6. Existing appointments keep working: reminder_sent_at defaults to NULL.
-- =============================================================================
