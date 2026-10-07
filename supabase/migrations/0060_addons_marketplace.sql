-- =============================================================================
-- MedBook AI — Add-ons & Marketplace | Migration 0060
--
-- First-party add-ons a clinic can bolt onto its plan, billed separately from
-- the subscription. A catalog (`addons`) that every clinic reads, and a
-- per-clinic subscription table (`clinic_addons`) that mirrors the
-- clinic_integrations shape: member-read, owner/admin-write, RLS as the
-- backstop and the server action as the first line of defence.
--
-- DESIGN NOTES
-- ------------
-- * `addons` is the master catalog. It is read by every clinic (public
--   read), written only by migrations/seed — there is no policy that lets a
--   member edit the catalog. `sort_order` controls the marketplace order
--   because prices and insertion order are not what a curated storefront is
--   sorted by; whoever curates the catalog sets the order here.
--
-- * `clinic_addons` holds one row per (clinic_id, addon_id). `status` is a
--   lifecycle, not a boolean: an activation, a pending approval and a
--   cancellation are three states the UI must tell apart. Re-subscribing to a
--   cancelled add-on flips the same row back to `active` rather than
--   inserting a duplicate — the UNIQUE constraint keeps the row, so an
--   add-on the clinic re-enables after a cancellation keeps its history.
--
-- * `quantity` exists because two catalog entries (doctor seats, TV displays)
--   are sold per unit, per month. `metadata` is a future-proof jsonb bag
--   (e.g. `{ "ai_credits": 1000 }` for the WhatsApp tiers) — nothing reads it
--   yet, it exists so the catalog can grow without a migration.
--
-- * Money is PKR and stays numeric. `price_pkr` is the source of truth; the
--   UI renders it through lib/utils/currency.ts (`formatCurrency`) exactly
--   like every other price in the app, so there is no ₹/Rs fork to drift.
--
-- * `is_addon_active()` is the feature-gate primitive the front desk and the
--   server actions call before opening a module that an add-on controls. It is
--   SECURITY DEFINER like the other clinic helpers (0014), pinned to
--   `public, auth`, and written to be used from a `where` clause.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. addons — master catalog
-- ----------------------------------------------------------------------------
create table if not exists public.addons (
  id              uuid primary key default gen_random_uuid(),
  -- e.g. 'whatsapp-ai-receptionist'. Validated app-side against the catalog
  -- before any write; the slug is what the feature-gate function takes.
  slug            text not null unique check (char_length(btrim(slug)) between 1 and 64),
  name            text not null check (char_length(btrim(name)) between 1 and 120),
  category        text not null check (category in ('Automation', 'Growth & Marketing', 'Operations')),
  description     text not null check (char_length(btrim(description)) between 1 and 400),
  -- Price in PKR. numeric so a future fractional billing period stays cheap.
  price_pkr       numeric(10, 2) not null check (price_pkr >= 0),
  billing_period  text not null default 'month' check (char_length(billing_period) between 1 and 20),
  -- Seat/token add-ons are bought per unit; feature add-ons are single.
  is_quantity_based boolean not null default false,
  -- Transient storefront label, e.g. 'Coming Soon'. Null renders no badge.
  badge_text      text check (badge_text is null or char_length(btrim(badge_text)) between 1 and 40),
  -- Curated marketplace order, independent of price so the storefront reads
  -- deliberately rather than in the accidental order of an insert.
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

comment on table public.addons is
  'Add-ons marketplace catalog. Public read; written only via migration seed.';
comment on column public.addons.category is
  'One of Automation, Growth & Marketing, Operations — mirrors the storefront tabs.';
comment on column public.addons.price_pkr is
  'Monthly price in PKR. Rendered through lib/utils/currency.ts only.';

create index if not exists addons_order_idx on public.addons (sort_order, category);

alter table public.addons enable row level security;

-- The catalog is public to every clinic; it is not a billing secret. Edits are
-- migration-only, so there is deliberately no insert/update/delete policy.
create policy "Addons: public catalog read"
  on public.addons for select
  using (true);

-- ----------------------------------------------------------------------------
-- 2. Seed catalog — idempotent
-- ----------------------------------------------------------------------------
-- ON CONFLICT (slug) makes re-running the migration a no-op instead of a
-- duplicate-title error. Prices from the marketplace spec (PKR).
insert into public.addons
  (slug, name, category, description, price_pkr, is_quantity_based, badge_text, sort_order)
values
  ('whatsapp-ai-receptionist', 'WhatsApp AI Receptionist', 'Automation',
   'Full conversational AI booking agent on WhatsApp, with included AI credits per tier.',
   1299, false, null, 10),
  ('ai-review-assistant', 'AI Review Assistant', 'Growth & Marketing',
   'Automated review collection and AI responses for clinic reputation.',
   1500, false, 'Coming Soon', 20),
  ('growth-agent', 'Growth Agent', 'Growth & Marketing',
   'Google Business Profile automation — posts, reviews, profile health, insights.',
   1500, false, null, 30),
  ('extra-doctor-seat', 'Extra Doctor Seat', 'Operations',
   'Add one more doctor profile to your clinic beyond your plan''s included limit.',
   199, true, null, 40),
  ('extra-tv-display', 'Extra TV Display', 'Operations',
   'Add one more Smart TV device for your waiting-room display beyond your plan''s included limit.',
   299, true, null, 50),
  ('queue-management-system', 'Queue Management System', 'Operations',
   'Digital token/queue display for walk-in patients, synced with your appointment schedule.',
   499, false, null, 60)
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- 3. clinic_addons — per-clinic subscriptions
-- ----------------------------------------------------------------------------
create table if not exists public.clinic_addons (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics(id) on delete cascade,
  addon_id     uuid not null references public.addons(id) on delete cascade,
  -- Lifecycle rather than a boolean: a cancellation is a state, not the
  -- absence of a row — see DESIGN NOTES.
  status       text not null default 'active'
               check (status in ('active', 'pending_approval', 'cancelled', 'expired')),
  -- Units for seat/display add-ons; 1 for feature add-ons.
  quantity     integer not null default 1 check (quantity between 1 and 50),
  -- Future compatibility bag, e.g. { "ai_credits": 1000 }.
  metadata     jsonb not null default '{}'::jsonb,
  activated_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (clinic_id, addon_id)
);

comment on table public.clinic_addons is
  'Per-clinic add-on subscriptions for the /app/addons marketplace.';
comment on column public.clinic_addons.status is
  'active, pending_approval, cancelled, or expired — mirrored in types/database.ts.';

-- Marketplace snapshot queries filter by clinic + status; the feature gate
-- looks up by clinic only. Both paths need the composite index.
create index if not exists clinic_addons_clinic_status_idx
  on public.clinic_addons (clinic_id, status);
create index if not exists clinic_addons_addon_idx
  on public.clinic_addons (addon_id);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'clinic_addons_updated_at') then
    create trigger clinic_addons_updated_at
      before update on public.clinic_addons
      for each row execute function public.handle_updated_at();
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4. RLS — clinic_addons
-- ----------------------------------------------------------------------------
alter table public.clinic_addons enable row level security;

-- Any member can see which add-ons their clinic runs (staff reads, like the
-- integrations dashboard).
create policy "Clinic addons: member read"
  on public.clinic_addons for select
  using (public.is_clinic_member(clinic_id));

-- Only owners/admins subscribe, change quantity, or cancel.
create policy "Clinic addons: admin insert"
  on public.clinic_addons for insert
  with check (public.is_clinic_admin(clinic_id));

create policy "Clinic addons: admin update"
  on public.clinic_addons for update
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));

create policy "Clinic addons: admin delete"
  on public.clinic_addons for delete
  using (public.is_clinic_admin(clinic_id));

-- ----------------------------------------------------------------------------
-- 5. is_addon_active() — feature gate
-- ----------------------------------------------------------------------------
create or replace function public.is_addon_active(p_clinic_id uuid, p_addon_slug text)
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.clinic_addons ca
    join public.addons a on a.id = ca.addon_id
    where ca.clinic_id = p_clinic_id
      and a.slug = p_addon_slug
      and ca.status = 'active'
  );
$$;

comment on function public.is_addon_active(uuid, text) is
  'Feature gate: true when the clinic has an active subscription for the add-on slug.';

-- =============================================================================
-- ROLLBACK
-- -----------------------------------------------------------------------------
-- drop function if exists public.is_addon_active(uuid, text);
-- drop table if exists public.clinic_addons;
-- drop table if exists public.addons;
-- =============================================================================
-- VERIFICATION (manual)
-- -----------------------------------------------------------------------------
-- 1. Any authenticated user can read public.addons (six rows, ordered).
-- 2. Owner can insert + update their clinic's clinic_addons row.
-- 3. A staff member can read clinic_addons but the update is rejected by RLS.
-- 4. A user in a different clinic sees zero clinic_addons rows.
-- 5. A second (clinic_id, addon_id) row is rejected by the unique constraint.
-- 6. is_addon_active(clinic, 'whatsapp-ai-receptionist') is true after an
--    active subscription and false while cancelled. Re-running the migration
--    changes nothing.
-- =============================================================================