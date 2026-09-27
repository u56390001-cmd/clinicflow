-- ============================================================================
-- 0044_growth_google_oauth
--
-- Adds the storage the Growth Agent needs to hold a real Google Business
-- Profile connection: the OAuth tokens, plus the small amount of non-secret
-- identity the dashboard renders.
--
-- DESIGN NOTES
--
-- * Migration 0042 deliberately shipped with NO OAuth flow and said so: the
--   `connected` state was unreachable by any code path, because Google
--   Business Profile requires a Cloud project, a consent screen and API
--   approval that did not exist for this deployment. This migration is the
--   other half of that decision — it makes `connected` reachable for real.
--
-- * The split between the two tables is the whole security design, so it is
--   worth stating plainly:
--
--     growth_agent_settings  — member-readable (anyone in the clinic, via
--                              `public.is_clinic_member`). Holds the profile
--                              NAME, its Google location id, and the Google
--                              account's email. A receptionist seeing which
--                              listing the clinic publishes to is correct and
--                              useful; none of it is a credential.
--
--     growth_agent_secrets   — service-role only, ZERO RLS policies. Holds the
--                              refresh token and current access token. Putting
--                              these in the settings row would have exposed a
--                              long-lived Google refresh token to every member
--                              of the clinic, including read-only front-desk
--                              accounts, which is exactly the failure mode
--                              0043 built `clinic_integration_secrets` to
--                              avoid. This table follows the same shape as
--                              `clinic_whatsapp_secrets` (0019).
--
-- * `refresh_token` is NOT NULL and `access_token` is nullable, on purpose: a
--   refresh token is the credential that outlives the session, and Google only
--   returns one on the first consent (or with `prompt=consent`). An access
--   token expires in an hour and is re-derivable from the refresh token, so a
--   row without one is a perfectly valid state, not a broken one.
--
-- * `google_location_id` is stored separately from `google_location_name`
--   because the name is what a human recognises and the id is what the API
--   addresses. Re-deriving the id by listing locations on every sync would be a
--   network round trip per page load to recover a value we already resolved
--   once at connect time.
--
-- * `connected_disconnect` is not a column. Disconnecting deletes the secrets
--   row and resets `connection_state` to 'not_connected' — the tokens ARE the
--   connection, so a state that said otherwise would be a lie.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. growth_agent_settings — the non-secret half of the connection
-- ----------------------------------------------------------------------------
alter table public.growth_agent_settings
  add column if not exists google_location_id text;

alter table public.growth_agent_settings
  add column if not exists google_account_email text;

comment on column public.growth_agent_settings.google_location_id is
  'The Google Business Profile location id (e.g. "locations/1234567890"). Non-secret; resolved once at connect time so sync does not have to re-list locations.';
comment on column public.growth_agent_settings.google_account_email is
  'The Google account the clinic connected with. Shown in the UI so a clinic can confirm WHICH account is linked — a common cause of "my posts go to the wrong listing".';

-- ----------------------------------------------------------------------------
-- 2. growth_agent_secrets (service-role-only token storage)
-- ----------------------------------------------------------------------------
create table if not exists public.growth_agent_secrets (
  id                      uuid primary key default gen_random_uuid(),
  settings_id             uuid not null unique
                            references public.growth_agent_settings (id) on delete cascade,

  -- The credential that outlives the session.
  refresh_token           text not null
                            check (char_length(btrim(refresh_token)) between 1 and 2048),

  -- Re-derivable from the refresh token, so its absence is a valid state.
  access_token            text
                            check (access_token is null or char_length(btrim(access_token)) between 1 and 2048),
  access_token_expires_at timestamptz,

  -- Recorded so a re-consent that grants fewer scopes can be detected rather
  -- than silently producing 403s later.
  scope                   text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.growth_agent_secrets enable row level security;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'growth_agent_secrets_updated_at') then
    create trigger growth_agent_secrets_updated_at
      before update on public.growth_agent_secrets
      for each row execute function public.handle_updated_at();
  end if;
end $$;

-- Intentionally ZERO RLS policies on growth_agent_secrets: anon and
-- authenticated roles can never read or write a row regardless of platform
-- privilege re-grants; the service-role role bypasses RLS and is the only
-- accessor. DO NOT add policies to this table. The UI never receives these
-- values — lib/actions/growth-agent.ts returns booleans derived from their
-- presence (`hasGoogleConnection`), never the tokens themselves.

comment on table public.growth_agent_secrets is
  'Google Business Profile OAuth tokens for the Growth Agent. Service-role only; zero RLS policies by design.';

-- ----------------------------------------------------------------------------
-- 3. Indexes
-- ----------------------------------------------------------------------------
-- The settings_id unique index is created by the UNIQUE constraint itself.

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- drop table if exists public.growth_agent_secrets;
-- alter table public.growth_agent_settings drop column if exists google_account_email;
-- alter table public.growth_agent_settings drop column if exists google_location_id;

-- ============================================================================
-- VERIFICATION (manual)
-- ============================================================================
-- 1. The secrets table exists and has RLS on with no policies:
--      select relname, relrowsecurity from pg_class
--       where relname = 'growth_agent_secrets';
--      select count(*) from pg_policies where tablename = 'growth_agent_secrets';
--    Expected: relrowsecurity = true, policy count = 0.
--
-- 2. The settings table gained both columns:
--      select column_name from information_schema.columns
--       where table_name = 'growth_agent_settings'
--         and column_name in ('google_location_id','google_account_email');
--    Expected: 2 rows.
--
-- 3. A second secrets row for the same settings is rejected:
--      -- after inserting one row for a known settings_id, re-run the insert.
--    Expected: unique violation on settings_id.
--
-- 4. The session-scoped client cannot read tokens (run as an authenticated
--    clinic member, NOT service role):
--      select count(*) from public.growth_agent_secrets;
--    Expected: 0 rows (denied by RLS), never the token values.
--
-- 5. Deleting the settings row removes the secrets row:
--      -- delete a growth_agent_settings row and confirm growth_agent_secrets
--      -- has no orphan.
--    Expected: on delete cascade fires; 0 orphans.
--
-- 6. The updated_at trigger fires on token refresh:
--      update public.growth_agent_secrets set access_token = 'x'
--       where id = '<id>' returning updated_at > created_at;
--    Expected: true.