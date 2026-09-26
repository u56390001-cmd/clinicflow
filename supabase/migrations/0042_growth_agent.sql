-- =============================================================================
-- MedBook AI — Phase 24 | Migration 0042
-- Growth Agent: Google Business Profile posts, automation settings, metrics
--
-- DESIGN NOTES
-- ------------
-- * `growth_agent_settings` is 1:1 with a clinic (UNIQUE on clinic_id). It holds
--   BOTH the Google Business Profile connection state and the auto-publishing
--   preferences, because they are configured by the same person at the same
--   time and splitting them would mean two records describing one setup.
--
-- * `connection_state` is a four-value state machine, not a boolean, because
--   "connecting" and "error" are states a boolean cannot represent and the UI
--   has to tell them apart (retry vs. re-authenticate vs. done). We store the
--   last error text so a failed OAuth attempt survives a page reload.
--
--   There is NO Google OAuth flow in this migration, and that is deliberate.
--   The Google Business Profile API requires a Google Cloud project, a
--   verified OAuth consent screen and API approval from Google. Until those
--   credentials exist in the deployment, `connected` cannot be reached by any
--   code path, so the UI is built to show that honestly rather than to fake a
--   live connection. When the credentials land, the service layer fills these
--   columns and nothing else has to change.
--
-- * `growth_posts` is the content queue. `keywords` is a text[] so the tags the
--   clinic typed are stored verbatim and can be re-rendered into the editor
--   without re-parsing a string. `status` is a real enum, not a free string, so
--   an unknown status is a write error rather than a blank badge at render time.
--
-- * `created_by` is nullable and ON DELETE SET NULL: keeping the clinic's
--   marketing history after a team member leaves the roster is the correct
--   behaviour for a business record, and the column being null says "we don't
--   know who" rather than losing the row.
--
-- * `growth_metrics` is a daily per-clinic series. A `date` column rather than
--   a `timestamptz` because a Google metric is a *calendar day in the clinic's
--   timezone* — there is no meaningful instant attached to it. Google reports
--   these in the profile's own timezone, so bucketing must happen before the
--   value is written, not at read time.
--
--   The table starts empty. It is populated by the sync job that the Google
--   integration will drive, or by a manual import. Until then the dashboard
--   shows an empty state that says so, rather than plausible invented numbers.
--
-- * `health_score` is nullable and range-checked 0-100, unlike the three count
--   columns which are NOT NULL with a zero default. A count of zero is a
--   meaningful measurement ("nobody called"); a health score of zero would be a
--   lie, because the score is only computable once enough profile data exists.
--
-- * RLS follows the established Phase 7 pattern exactly: member read for the
--   authenticated app, `is_clinic_admin` for every write. Staff can see the
--   queue and the metrics but cannot change the connection or the automation —
--   which is the same split the website module uses.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. growth_post_status enum
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'growth_post_status') then
    create type public.growth_post_status as enum (
      'draft',      -- written, not yet reviewed
      'scheduled',  -- approved, waiting for its publish time
      'published',  -- handed to Google (or held, while unconnected — see below)
      'failed'      -- Google rejected it; failure_reason says why
    );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. growth_agent_settings (1:1 with clinic)
-- ----------------------------------------------------------------------------
create table if not exists public.growth_agent_settings (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null unique references public.clinics(id) on delete cascade,

  -- Google Business Profile connection
  connection_state text not null default 'not_connected'
                  check (connection_state in ('not_connected', 'connecting', 'connected', 'error')),
  -- The profile this clinic publishes to, e.g. "Dental Care Center - Downtown".
  google_location_name text,
  connected_at  timestamptz,
  last_synced_at timestamptz,
  -- Survives a page reload so a failed attempt is still visible after the fact.
  last_error    text,

  -- Auto-publishing
  auto_post_enabled boolean not null default false,
  posting_frequency text not null default 'weekly'
                   check (posting_frequency in ('weekly', 'biweekly', 'monthly')),
  -- 0 = Monday ... 6 = Sunday, matching availability_rules.day_of_week and
  -- WEEKDAY_ORDER in lib/constants.ts.
  preferred_day  integer not null default 3
                 check (preferred_day between 0 and 6),
  preferred_time time not null default '10:00',
  -- When true, generated posts land as `draft` for a human to approve. When
  -- false the scheduler publishes them unreviewed — so the switch defaults to
  -- the safe side and the clinic has to opt out of review deliberately.
  require_approval boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.growth_agent_settings is
  'One Growth Agent configuration per clinic: Google profile connection state + auto-publishing preferences.';
comment on column public.growth_agent_settings.connection_state is
  'not_connected | connecting | connected | error. Four states, not a boolean, because the UI must distinguish retry from re-authenticate.';
comment on column public.growth_agent_settings.preferred_day is
  '0 = Monday ... 6 = Sunday, matching availability_rules.day_of_week.';
comment on column public.growth_agent_settings.require_approval is
  'true: generated posts wait as drafts. false: the scheduler publishes unreviewed. Defaults to true.';

create trigger growth_agent_settings_updated_at
  before update on public.growth_agent_settings
  for each row execute function public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- 3. growth_posts (content queue)
-- ----------------------------------------------------------------------------
create table if not exists public.growth_posts (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  content    text not null,
  topic      text not null,
  keywords   text[] not null default '{}',
  cta        text not null default 'Book Now',
  tone       text not null default 'professional',
  status     public.growth_post_status not null default 'draft',
  scheduled_at timestamptz,
  published_at timestamptz,
  -- Why a publish attempt failed. Only meaningful while status = 'failed'.
  failure_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A scheduled post must have a time to be scheduled at, and a post cannot be
  -- both published and still waiting. Enforced here so a bad write is rejected
  -- by the database, not silently rendered as a confusing row.
  constraint growth_posts_scheduled_needs_time
    check (status <> 'scheduled' or scheduled_at is not null),
  constraint growth_posts_published_needs_time
    check (status <> 'published' or published_at is not null),
  -- Failure detail belongs to failed rows only.
  constraint growth_posts_failure_reason_scope
    check (status = 'failed' or failure_reason is null)
);

comment on table public.growth_posts is
  'Google Business Profile posts for a clinic, from first draft through publication.';

create index if not exists growth_posts_clinic_status_idx
  on public.growth_posts (clinic_id, status, created_at desc);

create trigger growth_posts_updated_at
  before update on public.growth_posts
  for each row execute function public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- 4. growth_metrics (daily per-clinic series)
-- ----------------------------------------------------------------------------
create table if not exists public.growth_metrics (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  -- Calendar day in the clinic's timezone. NOT a timestamptz — see design notes.
  metric_date date not null,
  views            integer not null default 0 check (views >= 0),
  calls            integer not null default 0 check (calls >= 0),
  direction_requests integer not null default 0 check (direction_requests >= 0),
  -- Nullable: only computable once there is enough profile data to score.
  health_score integer check (health_score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One row per clinic per day. The sync job upserts on this pair.
  unique (clinic_id, metric_date)
);

comment on table public.growth_metrics is
  'Daily Google Business Profile metrics per clinic. Populated by the sync job; empty until then.';

create index if not exists growth_metrics_clinic_date_idx
  on public.growth_metrics (clinic_id, metric_date desc);

create trigger growth_metrics_updated_at
  before update on public.growth_metrics
  for each row execute function public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- 5. RLS — growth_agent_settings
-- ----------------------------------------------------------------------------
alter table public.growth_agent_settings enable row level security;

-- Members can read their clinic's Growth Agent configuration
create policy "Growth settings: member read"
  on public.growth_agent_settings for select
  using (public.is_clinic_member(clinic_id));

-- Admin/owner can create
create policy "Growth settings: admin insert"
  on public.growth_agent_settings for insert
  with check (public.is_clinic_admin(clinic_id));

-- Admin/owner can update (connection + automation)
create policy "Growth settings: admin update"
  on public.growth_agent_settings for update
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));

-- Admin/owner can delete
create policy "Growth settings: admin delete"
  on public.growth_agent_settings for delete
  using (public.is_clinic_admin(clinic_id));

-- ----------------------------------------------------------------------------
-- 6. RLS — growth_posts
-- ----------------------------------------------------------------------------
alter table public.growth_posts enable row level security;

-- Members can read the queue
create policy "Growth posts: member read"
  on public.growth_posts for select
  using (public.is_clinic_member(clinic_id));

-- Admin/owner can create
create policy "Growth posts: admin insert"
  on public.growth_posts for insert
  with check (public.is_clinic_admin(clinic_id));

-- Admin/owner can update (edit, schedule, publish)
create policy "Growth posts: admin update"
  on public.growth_posts for update
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));

-- Admin/owner can delete
create policy "Growth posts: admin delete"
  on public.growth_posts for delete
  using (public.is_clinic_admin(clinic_id));

-- ----------------------------------------------------------------------------
-- 7. RLS — growth_metrics
-- ----------------------------------------------------------------------------
alter table public.growth_metrics enable row level security;

-- Members can read metrics
create policy "Growth metrics: member read"
  on public.growth_metrics for select
  using (public.is_clinic_member(clinic_id));

-- Writes come from the sync job via the service role, which bypasses RLS. There
-- is deliberately no admin write policy: a clinic owner should not be able to
-- edit their own view counts, and the client has no code path that would try.

-- =============================================================================
-- ROLLBACK
-- -----------------------------------------------------------------------------
-- drop table if exists public.growth_metrics;
-- drop table if exists public.growth_posts;
-- drop table if exists public.growth_agent_settings;
-- drop type if exists public.growth_post_status;
-- =============================================================================
-- VERIFICATION (manual)
-- -----------------------------------------------------------------------------
-- 1. Owner/admin can insert + update their clinic's growth_agent_settings row.
-- 2. A staff member can read it but the update is rejected by RLS.
-- 3. A user in a different clinic sees zero rows from all three tables.
-- 4. Inserting a post with status 'scheduled' and a null scheduled_at fails
--    the growth_posts_scheduled_needs_time CHECK.
-- 5. Setting status 'published' on a row with a null published_at fails.
-- 6. growth_metrics rejects a second row for the same (clinic_id, metric_date).
-- 7. health_score = 101 is rejected; health_score = null is accepted.
-- =============================================================================
