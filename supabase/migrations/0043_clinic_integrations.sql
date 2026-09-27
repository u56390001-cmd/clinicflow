-- =============================================================================
-- MedBook AI — Phase 25 | Migration 0043
-- Integrations dashboard: per-clinic integration state, isolated API
-- credentials, and the appointments view-mode preference.
--
-- DESIGN NOTES
-- ------------
-- * `clinic_integrations` is the metadata table the /app/integrations dashboard
--   reads. It holds, per clinic and per integration key: whether the clinic has
--   turned the integration on, and the NON-SECRET settings for it.
--
--   `config` deliberately holds no credentials. The prompt this was built from
--   proposed keeping API keys in this JSONB column, but that column is readable
--   by every clinic member, so a front-desk account would be able to read and
--   exfiltrate the clinic's Zoom client secret and Meta access token. The repo
--   already solved this twice (0019 clinic_whatsapp_secrets, and the AI provider
--   secrets) by splitting credentials into a table with no RLS policies at all.
--   We do the same here, and the dashboard is sent booleans ("has a key
--   saved"), never the key itself.
--
-- * Rows are created lazily on first write rather than seeded per clinic. A new
--   clinic has no integrations, and "no row" is the same thing as
--   "not configured" — so seeding eight disabled rows per clinic would only add
--   writes to keep in sync. The UI treats a missing row as `disabled`.
--
-- * `status` is three values rather than a boolean because a failed enable is a
--   state a boolean cannot hold, and the UI has to distinguish it from a
--   deliberate off (retry vs. re-enter credentials vs. nothing to do).
--
-- * There is NO OAuth flow and NO third-party API call in this migration, and
--   that is deliberate rather than incomplete. Seven of the eight integrations
--   in the catalogue (Google Calendar, Meet, Sheets, Zoom, Teams, WhatsApp,
--   SMS) all require vendor OAuth credentials, a verified consent screen, and
--   in Google's case API approval, none of which exist in this deployment. So
--   `activated` is only reachable for a real, self-contained preference, and
--   the rest of the catalogue reads as "configured" / "not configured" — never
--   as "connected to Google". The service layer fills these columns when the
--   vendor credentials land, and no UI change is needed.
--
-- * The eighth card, Queue Management, is the exception that proves the rule:
--   the live waiting queue already exists and works, so it is stored where the
--   thing it controls actually lives — `clinics.appointments_view_mode` — rather
--   than in a `clinic_integrations` row that would duplicate the truth. The
--   catalogue marks it as backed by a clinic setting.
--
-- * Plan gating is made real here rather than faked in the UI. The design
--   document showed Google Calendar and Meet as "Not on your plan" behind an
--   Upgrade button, but no code read `subscription_plans.features` to decide
--   anything, so the copy would have been decoration. We append real feature
--   keys to the plan rows, and lib/plan-features.ts reads them. The gate is
--   enforced in the server action, not just hidden in the card.
--
-- * RLS follows the Phase 7 pattern: member read for the authenticated app,
--   `is_clinic_admin` for every write — the same split the website and Growth
--   Agent modules use. Staff can see which integrations the clinic runs, but
--   cannot rewire the clinic's Google account.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. integration_status enum
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'integration_status') then
    create type public.integration_status as enum (
      'disabled',  -- the clinic has not turned it on
      'activated', -- the clinic's preference is live (see DESIGN NOTES)
      'error'      -- the last attempt failed; last_error says why
    );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. clinics.appointments_view_mode
-- ----------------------------------------------------------------------------
-- Backs the Queue Management card. 'queue' renders the live waiting queue above
-- the appointment tabs; 'list' shows the plain list. Defaults to 'queue' because
-- that is the behaviour the appointments page has always had, so no existing
-- clinic sees a change on upgrade.
alter table public.clinics
  add column if not exists appointments_view_mode text not null default 'queue'
  check (appointments_view_mode in ('queue', 'list'));

comment on column public.clinics.appointments_view_mode is
  'Queue Management preference: ''queue'' shows the live waiting queue, ''list'' shows the plain appointment list.';

-- ----------------------------------------------------------------------------
-- 3. clinic_integrations (metadata + non-secret settings)
-- ----------------------------------------------------------------------------
create table if not exists public.clinic_integrations (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  -- Catalog key from INTEGRATION_CATALOG in lib/constants.ts. Free text rather
  -- than an enum because the catalogue is a product decision that will gain
  -- entries; the action layer validates against the real list before writing.
  integration_key text not null check (char_length(btrim(integration_key)) between 1 and 64),

  status      public.integration_status not null default 'disabled',
  last_error  text,

  -- Non-secret settings only (spreadsheet id, timezone, phone number, ...).
  -- Credentials live in clinic_integration_secrets.
  config jsonb not null default '{}'::jsonb,

  -- When the clinic last saved a working configuration. Null means never, which
  -- the UI renders as "Not configured" rather than as a date.
  configured_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One row per clinic per integration. This is what makes the toggle an
  -- upsert rather than an insert-or-fail.
  unique (clinic_id, integration_key)
);

comment on table public.clinic_integrations is
  'Per-clinic integration state for the /app/integrations dashboard. Non-secret settings only.';
comment on column public.clinic_integrations.config is
  'Non-secret settings only. API keys and tokens belong in clinic_integration_secrets, which no member can read.';

create index if not exists clinic_integrations_clinic_idx
  on public.clinic_integrations (clinic_id, integration_key);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'clinic_integrations_updated_at') then
    create trigger clinic_integrations_updated_at
      before update on public.clinic_integrations
      for each row execute function public.handle_updated_at();
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4. clinic_integration_secrets (service-role-only credential storage)
-- ----------------------------------------------------------------------------
create table if not exists public.clinic_integration_secrets (
  id             uuid primary key default gen_random_uuid(),
  integration_id uuid not null unique references public.clinic_integrations(id) on delete cascade,

  -- Generic credential slots so one table serves every vendor. Nullable so a
  -- partially configured integration is representable; the action layer checks
  -- that the fields a given catalog entry requires are all present.
  api_key     text check (api_key is null or char_length(btrim(api_key)) between 1 and 1024),
  api_secret  text check (api_secret is null or char_length(btrim(api_secret)) between 1 and 1024),
  account_id  text check (account_id is null or char_length(btrim(account_id)) between 1 and 256),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clinic_integration_secrets enable row level security;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'clinic_integration_secrets_updated_at') then
    create trigger clinic_integration_secrets_updated_at
      before update on public.clinic_integration_secrets
      for each row execute function public.handle_updated_at();
  end if;
end $$;

-- Intentionally ZERO RLS policies on clinic_integration_secrets: anon and
-- authenticated roles can never read or write a row regardless of platform
-- privilege re-grants; the service-role role bypasses RLS and is the only
-- accessor. DO NOT add policies to this table. The UI never receives these
-- values — lib/actions/integrations.ts returns booleans derived from their
-- presence, never the values themselves.

-- ----------------------------------------------------------------------------
-- 5. RLS — clinic_integrations
-- ----------------------------------------------------------------------------
alter table public.clinic_integrations enable row level security;

-- Members can see their clinic's integration state
create policy "Integrations: member read"
  on public.clinic_integrations for select
  using (public.is_clinic_member(clinic_id));

-- Admin/owner can create
create policy "Integrations: admin insert"
  on public.clinic_integrations for insert
  with check (public.is_clinic_admin(clinic_id));

-- Admin/owner can update (enable, disable, save settings)
create policy "Integrations: admin update"
  on public.clinic_integrations for update
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));

-- Admin/owner can disconnect entirely
create policy "Integrations: admin delete"
  on public.clinic_integrations for delete
  using (public.is_clinic_admin(clinic_id));

-- ----------------------------------------------------------------------------
-- 6. Plan feature keys for the gated integrations
-- ----------------------------------------------------------------------------
-- Appends three keys to subscription_plans.features, idempotently, so the
-- Upgrade button on a locked card is backed by a real lookup instead of a
-- hardcoded string. Google Calendar and Meet are professional+; Sheets is in
-- every plan because it is a read-only export, not a privileged API surface.
-- The NOT EXISTS guard makes re-running this a no-op.
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('starter',      'google_calendar', 'Google Calendar Sync', false),
      ('starter',      'google_meet',     'Google Meet Links',    false),
      ('starter',      'google_sheets',   'Google Sheets Export', true),
      ('professional', 'google_calendar', 'Google Calendar Sync', true),
      ('professional', 'google_meet',     'Google Meet Links',    true),
      ('professional', 'google_sheets',   'Google Sheets Export', true),
      ('enterprise',   'google_calendar', 'Google Calendar Sync', true),
      ('enterprise',   'google_meet',     'Google Meet Links',    true),
      ('enterprise',   'google_sheets',   'Google Sheets Export', true)
    ) as v(plan_code, feature_key, feature_label, feature_included)
  loop
    update public.subscription_plans p
       set features = p.features || jsonb_build_array(
             jsonb_build_object(
               'key', t.feature_key,
               'label', t.feature_label,
               'included', t.feature_included))
     where p.code = t.plan_code
       and not exists (
         select 1
           from jsonb_array_elements(p.features) e
          where e->>'key' = t.feature_key);
  end loop;
end $$;

-- =============================================================================
-- ROLLBACK
-- -----------------------------------------------------------------------------
-- delete from public.subscription_plans
--   where code in ('starter','professional','enterprise');  -- restore seeds
-- drop table if exists public.clinic_integration_secrets;
-- drop table if exists public.clinic_integrations;
-- drop type if exists public.integration_status;
-- alter table public.clinics drop column if exists appointments_view_mode;
-- =============================================================================
-- VERIFICATION (manual)
-- -----------------------------------------------------------------------------
-- 1. Owner can insert + update their clinic's clinic_integrations row.
-- 2. A staff member can read it but the update is rejected by RLS.
-- 3. A user in a different clinic sees zero rows.
-- 4. A second row for the same (clinic_id, integration_key) is rejected.
-- 5. status 'activated' is accepted; status 'live' is rejected by the enum.
-- 6. clinic_integration_secrets is unreadable by `authenticated` (zero
--    policies) while authenticated INSERT into clinic_integrations succeeds.
-- 7. Starter plan shows google_calendar included=false; Professional shows
--    true. Re-running the migration changes neither.
-- 8. Setting appointments_view_mode = 'list' succeeds; 'grid' is rejected.
-- =============================================================================
