-- =============================================================================
-- MedBook AI — Migration 0059
-- Website Builder Phase 1: custom domains, SEO overrides, doctor page slugs
--
-- DESIGN NOTES
-- ------------
-- 0009 gave each clinic one `websites` row with `content_json` (editable copy)
-- and `theme_json` (colours, fonts). Two things could not live in either blob
-- without a database constraint behind them, so they get real columns here:
--
--   * `domain` / `domain_status` / `domain_verification_token` — a custom domain
--     is identity-bearing. Two clinics must never resolve the same hostname, so
--     uniqueness is enforced by a partial index rather than by application code
--     that a future code path could forget to call. Status is a real tri-state
--     (`pending` -> `verified` | `failed`) so the builder can show DNS
--     instructions until the record actually resolves, instead of flipping a
--     "connected" badge the moment someone types a hostname.
--   * `seo_json` — meta title / description / social image / indexability. Kept
--     in its own column rather than folded into `content_json` because the SEO
--     dashboard, `generateMetadata` and the sitemap all read it, and none of
--     them should have to parse a copy blob to find it.
--
-- `doctor_page_slug` gives every doctor an indexable public page
-- (`/site/<clinic>/doctors/<slug>`). It is nullable and unique-per-clinic
-- because a clinic may not have migrated doctors into the website yet — adding
-- a NOT NULL column to a table every existing row would fail is not an option.
--
-- RLS is unchanged in shape: this migration only adds columns, so the 0009
-- policies keep applying to the new values automatically. Nothing here relaxes
-- a policy or widens who can read a website.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Domain verification status enum
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'website_domain_status') then
    create type public.website_domain_status as enum ('none', 'pending', 'verified', 'failed');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. websites: domain + SEO columns
-- ----------------------------------------------------------------------------
alter table public.websites
  add column if not exists domain text
    check (domain is null or domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  add column if not exists domain_status public.website_domain_status not null default 'none',
  add column if not exists domain_verification_token text
    check (domain_verification_token is null
           or domain_verification_token ~ '^[a-z0-9]{16,64}$'),
  add column if not exists domain_verified_at timestamptz,
  add column if not exists seo_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(seo_json) = 'object'),
  add column if not exists widget_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(widget_json) = 'object'),
  add column if not exists locale_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(locale_json) = 'object'),
  add column if not exists doctor_page_slug varchar(80);

comment on column public.websites.domain is
  'Custom hostname the clinic owns, e.g. drsmithclinic.com. Null means the site is served from the ClinicFlow subdomain (/site/<slug>).';
comment on column public.websites.domain_status is
  'DNS verification state. Only a verified domain is served on the custom hostname.';
comment on column public.websites.domain_verification_token is
  'Value the clinic must publish as a TXT record. Regenerated on every request so a leaked token stops working.';
comment on column public.websites.seo_json is
  'Search overrides: title, description, keywords, ogImage, noindex. Blank fields fall back to values derived from the clinic row.';
comment on column public.websites.widget_json is
  'Floating assistant placement for the public site: enabled, position (bottom-right|bottom-left), language.';
comment on column public.websites.locale_json is
  'Page language and writing direction. direction is derived from language but stored so a clinic can preview either writing mode.';
comment on column public.websites.doctor_page_slug is
  'Subdomain-safe slug prefix for public doctor pages. Null disables doctor pages for this website.';

-- ----------------------------------------------------------------------------
-- 3. Uniqueness + lookup indexes
-- ----------------------------------------------------------------------------
-- A hostname can only ever point at one clinic. Partial so the (very common)
-- case of "no custom domain yet" does not collide across every row.
create unique index if not exists websites_domain_unique
  on public.websites (domain)
  where domain is not null;

-- Resolution by hostname on the edge: one row, status-filtered.
create index if not exists websites_domain_lookup
  on public.websites (domain, status)
  where domain is not null;

-- Doctor pages are addressed by slug within a site, so the pair is the key.
create unique index if not exists websites_doctor_page_slug_unique
  on public.websites (clinic_id, doctor_page_slug)
  where doctor_page_slug is not null;

-- ----------------------------------------------------------------------------
-- 4. Published-site lookup used by the sitemap
-- ----------------------------------------------------------------------------
-- generateMetadata, the public route and /sitemap all filter on status first.
create index if not exists websites_published_slug_idx
  on public.websites (slug)
  where status = 'published';

-- ----------------------------------------------------------------------------
-- 5. Seed the domain_status of rows created before this migration
-- ----------------------------------------------------------------------------
-- `domain` did not exist before 0059, so no row can hold a domain yet, but a
-- clinic that already owns a hostname may want to claim it — the status stays
-- 'none' until they do.
update public.websites
set domain_status = 'none'
where domain is null
  and domain_status <> 'none';

-- ----------------------------------------------------------------------------
-- 6. Public resolution helper
-- ----------------------------------------------------------------------------
-- Resolves a custom hostname to a *published* website. Returns the clinic id
-- alongside the website id so the edge can serve the site without a second
-- round trip.
--
-- SECURITY DEFINER because the public site route runs on the service-role
-- client today but this function is also callable by `anon` once a custom
-- domain is live — and `anon` has no SELECT policy on `websites` by design
-- (0009 grants members, not the public). The function is the narrow,
-- auditable exception: it returns identifiers only, never content, and is
-- pinned to published rows so it cannot be used to probe drafts.
create or replace function public.resolve_website_domain(p_domain text)
returns table (website_id uuid, clinic_id uuid, slug text)
language sql
stable
security definer
set search_path = public
as $$
  select w.id, w.clinic_id, w.slug
  from public.websites w
  where w.domain = lower(btrim(p_domain))
    and w.domain_status = 'verified'
    and w.status = 'published'
  limit 1;
$$;

revoke all on function public.resolve_website_domain(text) from public;
grant execute on function public.resolve_website_domain(text) to anon, authenticated, service_role;

-- =============================================================================
-- ROLLBACK
-- -----------------------------------------------------------------------------
-- drop function public.resolve_website_domain(text);
-- drop index if exists websites_doctor_page_slug_unique;
-- drop index if exists websites_published_slug_idx;
-- drop index if exists websites_domain_lookup;
-- drop index if exists websites_domain_unique;
-- alter table public.websites
--   drop column if exists doctor_page_slug,
--   drop column if exists locale_json,
--   drop column if exists widget_json,
--   drop column if exists seo_json,
--   drop column if exists domain_verified_at,
--   drop column if exists domain_verification_token,
--   drop column if exists domain_status,
--   drop column if exists domain;
-- drop type if exists public.website_domain_status;
-- =============================================================================

-- =============================================================================
-- VERIFICATION (manual)
-- -----------------------------------------------------------------------------
-- 1. A clinic can set a domain; a second clinic setting the same domain fails
--    on websites_domain_unique.
-- 2. domain_status starts at 'none' and moves pending -> verified only after
--    the TXT record resolves.
-- 3. seo_json round-trips through saveWebsite without touching content_json.
-- 4. resolve_website_domain() returns a row only for a verified, published site.
-- 5. Deleting a clinic cascades to its website row and its domain is freed.
-- =============================================================================
