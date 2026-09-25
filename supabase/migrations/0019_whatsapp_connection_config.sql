-- =============================================================================
-- MedBook AI — Phase 12 | Migration 0019
-- WhatsApp Business Connection + AI Agent Configuration
--
-- DESIGN NOTES
-- ------------
-- * `clinic_whatsapp_config` holds one row per clinic with the credentials
--   Meta's Embedded Signup produces (WABA id, phone number id, display
--   number) plus connection status. RLS follows the established membership
--   chain: any member reads, owner/admin writes.
-- * `clinic_whatsapp_secrets` holds the business access token in ISOLATION.
--   It has ZERO RLS policies: anon/authenticated can never see a row (the
--   platform re-grants table privileges periodically, so column-level REVOKEs
--   are NOT reliable here — pure-RLS isolation cannot be undone by grants).
--   Only the service-role key (bypasses RLS), used exclusively inside server
--   actions, touches this table. The token therefore can never appear in any
--   API response or client query.
-- * `clinic_ai_settings` gains three additive behavior fields (Phase 12):
--     - whatsapp_enabled  — independent channel toggle (default off)
--     - agent_tier        — 'ai_agent' (natural language, default/primary)
--                           vs 'chatbot' (stored preference only for now)
--     - greeting_style    — 'custom_template' (existing welcome_message
--                           behavior, default) vs 'ai_generated'
-- * The existing shared `tone` field is extended with 'empathetic' instead of
--   adding a parallel response_tone column — tone already feeds the shared
--   system prompt used by internal chat + widget (+ WhatsApp in Phase 13).
-- * All statements are idempotent (IF NOT EXISTS / guarded blocks).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- table: clinic_whatsapp_config (non-secret connection state)
-- ----------------------------------------------------------------------------
create table if not exists public.clinic_whatsapp_config (
  id                            uuid primary key default gen_random_uuid(),
  clinic_id                     uuid not null unique references public.clinics (id) on delete cascade,
  whatsapp_business_account_id  text check (whatsapp_business_account_id is null or char_length(btrim(whatsapp_business_account_id)) between 1 and 64),
  phone_number_id               text check (phone_number_id is null or char_length(btrim(phone_number_id)) between 1 and 64),
  display_phone_number          text check (display_phone_number is null or char_length(btrim(display_phone_number)) between 1 and 32),
  connection_status             text not null default 'not_connected' check (connection_status in ('not_connected', 'connected', 'error')),
  status_message                text check (status_message is null or char_length(btrim(status_message)) between 1 and 500),
  connected_at                  timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create index if not exists clinic_whatsapp_config_status_idx
  on public.clinic_whatsapp_config (connection_status);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'clinic_whatsapp_config_set_updated_at') then
    create trigger clinic_whatsapp_config_set_updated_at
      before update on public.clinic_whatsapp_config
      for each row
      execute function public.handle_updated_at();
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- table: clinic_whatsapp_secrets (service-role-only access token storage)
-- ----------------------------------------------------------------------------
create table if not exists public.clinic_whatsapp_secrets (
  id           uuid primary key default gen_random_uuid(),
  config_id    uuid not null unique references public.clinic_whatsapp_config (id) on delete cascade,
  access_token text not null check (char_length(btrim(access_token)) between 1 and 1024),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.clinic_whatsapp_secrets enable row level security;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'clinic_whatsapp_secrets_set_updated_at') then
    create trigger clinic_whatsapp_secrets_set_updated_at
      before update on public.clinic_whatsapp_secrets
      for each row
      execute function public.handle_updated_at();
  end if;
end $$;

-- Intentionally ZERO RLS policies on clinic_whatsapp_secrets: anon and
-- authenticated roles can never read or write a row regardless of platform
-- privilege re-grants; the service-role role bypasses RLS and is the only
-- accessor. DO NOT add policies to this table.

-- ----------------------------------------------------------------------------
-- enable RLS on the non-secret table + policies (read: member; write: admin)
-- ----------------------------------------------------------------------------
alter table public.clinic_whatsapp_config enable row level security;

drop policy if exists clinic_whatsapp_config_select_member on public.clinic_whatsapp_config;
create policy clinic_whatsapp_config_select_member
  on public.clinic_whatsapp_config
  for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists clinic_whatsapp_config_insert_admin on public.clinic_whatsapp_config;
create policy clinic_whatsapp_config_insert_admin
  on public.clinic_whatsapp_config
  for insert
  to authenticated
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists clinic_whatsapp_config_update_admin on public.clinic_whatsapp_config;
create policy clinic_whatsapp_config_update_admin
  on public.clinic_whatsapp_config
  for update
  to authenticated
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists clinic_whatsapp_config_delete_admin on public.clinic_whatsapp_config;
create policy clinic_whatsapp_config_delete_admin
  on public.clinic_whatsapp_config
  for delete
  to authenticated
  using (public.is_clinic_admin(clinic_id));

-- ----------------------------------------------------------------------------
-- clinic_ai_settings: Phase 12 behavior fields (additive, sensible defaults)
-- ----------------------------------------------------------------------------

alter table public.clinic_ai_settings
  add column if not exists whatsapp_enabled boolean not null default false;

do $$
begin
  -- agent_tier: stored preference; 'ai_agent' remains the primary mode.
  alter table public.clinic_ai_settings
    add column if not exists agent_tier text not null default 'ai_agent';
  if not exists (
    select 1 from pg_constraint where conname = 'clinic_ai_settings_agent_tier_check'
  ) then
    alter table public.clinic_ai_settings
      add constraint clinic_ai_settings_agent_tier_check
      check (agent_tier in ('chatbot', 'ai_agent'));
  end if;

  -- greeting_style: custom_template preserves today's welcome-message flow.
  alter table public.clinic_ai_settings
    add column if not exists greeting_style text not null default 'custom_template';
  if not exists (
    select 1 from pg_constraint where conname = 'clinic_ai_settings_greeting_style_check'
  ) then
    alter table public.clinic_ai_settings
      add constraint clinic_ai_settings_greeting_style_check
      check (greeting_style in ('custom_template', 'ai_generated'));
  end if;

  -- Extend the shared cross-channel tone with 'empathetic'.
  if exists (select 1 from pg_constraint where conname = 'clinic_ai_settings_tone_check') then
    alter table public.clinic_ai_settings
      drop constraint clinic_ai_settings_tone_check;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'clinic_ai_settings_tone_check'
  ) then
    alter table public.clinic_ai_settings
      add constraint clinic_ai_settings_tone_check
      check (tone in ('professional', 'friendly', 'casual', 'empathetic'));
  end if;
end $$;

-- =============================================================================
-- VERIFICATION (manual; mirrors the Phase 12 checklist)
-- -----------------------------------------------------------------------------
-- 1. As an owner, complete a signup via the server action; a staff member
--    SELECTs clinic_whatsapp_config — status/phone visible; NO access_token
--    column exists there at all.
-- 2. As ANY client role, SELECT from clinic_whatsapp_secrets returns zero
--    rows; INSERT/UPDATE fail the RLS policy check — even though blanket
--    table GRANTs exist.
-- 3. A user from ANOTHER clinic sees zero rows in clinic_whatsapp_config
--    (membership RLS).
-- 4. INSERT with connection_status 'bogus' is rejected by the CHECK.
-- 5. Existing clinics keep working: new settings columns carry defaults
--    (whatsapp_enabled=false, agent_tier='ai_agent',
--     greeting_style='custom_template'); old tones still validate; tone=
--    'empathetic' accepted; tone='quirky' rejected.
-- =============================================================================
