-- =============================================================================
-- MedBook AI — Migration 0107
-- Per-clinic ZEGOcloud connection (Video Calling credentials)
--
-- DESIGN NOTES
-- ------------
-- * Replaces the single deployment-wide ZEGO_APP_ID / ZEGO_SERVER_SECRET env
--   pair with per-clinic credentials. Each clinic creates its own ZEGOcloud
--   project and pastes its App ID + Server Secret, the same self-serve
--   connection flow as AI provider keys (0029) and WhatsApp (0019).
-- * `clinic_zego_config` holds the non-secret connection state. RLS follows
--   the established membership chain: any member reads, owner/admin writes.
-- * `clinic_zego_secrets` holds the Server Secret in ISOLATION. It has ZERO
--   RLS policies (same discipline as `clinic_whatsapp_secrets` in 0019): only
--   the service-role key (bypasses RLS), used exclusively inside server
--   actions, reads or writes it. The secret therefore can never appear in any
--   API response or client query.
-- * Server-side token minting (`lib/zego/server.ts`) resolves the clinic's
--   row first and falls back to the platform env pair for clinics that have
--   not connected their own account.
-- * All statements are idempotent (IF NOT EXISTS / guarded blocks).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- table: clinic_zego_config (non-secret connection state)
-- ----------------------------------------------------------------------------
create table if not exists public.clinic_zego_config (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null unique references public.clinics (id) on delete cascade,
  app_id           text not null check (app_id ~ '^[0-9]{1,15}$'),
  connection_status text not null default 'not_connected'
                    check (connection_status in ('not_connected', 'connected', 'error')),
  status_message   text check (status_message is null or char_length(btrim(status_message)) between 1 and 500),
  connected_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists clinic_zego_config_status_idx
  on public.clinic_zego_config (connection_status);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'clinic_zego_config_set_updated_at') then
    create trigger clinic_zego_config_set_updated_at
      before update on public.clinic_zego_config
      for each row
      execute function public.handle_updated_at();
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- table: clinic_zego_secrets (service-role-only Server Secret storage)
--
-- The secret length is encrypted into the Token04 with AES (see the token
-- generator), so it must be 16, 24 or 32 bytes; HEX text of exactly those
-- lengths keeps that guarantee explicit at the storage layer.
-- ----------------------------------------------------------------------------
create table if not exists public.clinic_zego_secrets (
  id            uuid primary key default gen_random_uuid(),
  config_id     uuid not null unique references public.clinic_zego_config (id) on delete cascade,
  server_secret text not null check (char_length(btrim(server_secret)) in (16, 24, 32)),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.clinic_zego_secrets enable row level security;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'clinic_zego_secrets_set_updated_at') then
    create trigger clinic_zego_secrets_set_updated_at
      before update on public.clinic_zego_secrets
      for each row
      execute function public.handle_updated_at();
  end if;
end $$;

-- Intentionally ZERO RLS policies on clinic_zego_secrets: anon and
-- authenticated roles can never read or write a row regardless of platform
-- privilege re-grants; the service-role role bypasses RLS and is the only
-- accessor. DO NOT add policies to this table.

-- ----------------------------------------------------------------------------
-- enable RLS on the non-secret table + policies (read: member; write: admin)
-- ----------------------------------------------------------------------------
alter table public.clinic_zego_config enable row level security;

drop policy if exists clinic_zego_config_select_member on public.clinic_zego_config;
create policy clinic_zego_config_select_member
  on public.clinic_zego_config
  for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists clinic_zego_config_insert_admin on public.clinic_zego_config;
create policy clinic_zego_config_insert_admin
  on public.clinic_zego_config
  for insert
  to authenticated
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists clinic_zego_config_update_admin on public.clinic_zego_config;
create policy clinic_zego_config_update_admin
  on public.clinic_zego_config
  for update
  to authenticated
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));

drop policy if exists clinic_zego_config_delete_admin on public.clinic_zego_config;
create policy clinic_zego_config_delete_admin
  on public.clinic_zego_config
  for delete
  to authenticated
  using (public.is_clinic_admin(clinic_id));

-- =============================================================================
-- VERIFICATION (manual)
-- -----------------------------------------------------------------------------
-- 1. As an owner, connect via the settings screen; a staff member SELECTs
--    clinic_zego_config — app_id/status visible; NO server_secret column exists.
-- 2. As ANY client role, SELECT from clinic_zego_secrets returns zero rows;
--    INSERT/UPDATE fail the RLS policy check — even though blanket table
--    GRANTs exist.
-- 3. A user from ANOTHER clinic sees zero rows in clinic_zego_config
--    (membership RLS).
-- 4. INSERT with app_id 'abc' or a secret whose length is not 16/24/32 is
--    rejected by the CHECK constraints.
-- 5. Disconnecting (deleting the secrets row) keeps the config row in a
--    'not_connected' state.
-- =============================================================================