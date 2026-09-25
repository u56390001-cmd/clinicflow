-- =============================================================================
-- MedBook AI — Phase 7 | Migration 0009
-- No-Code Website Builder: tables, storage, RLS
--
-- DESIGN NOTES
-- ------------
-- * `websites` stores the full website configuration for a clinic. Each clinic
--   has at most one website row (1:1 via UNIQUE on clinic_id). The `template`
--   field selects the presentational layer; `content_json` holds the doctor's
--   editable content (hero, about, contact, sections ordering/visibility) and
--   `theme_json` holds visual settings (primary color, font). The `status`
--   field is a real tri-state: draft | published | unpublished.
-- * `website_images` stores gallery + hero images. `kind` distinguishes them.
--   `position` controls display order. Images reference the website row, not
--   the clinic directly, so draft/published state is naturally scoped.
-- * Storage bucket `website-images` holds the actual files. Public read for
--   published site images; owner/admin-only upload and delete.
-- * RLS follows the established pattern: owner/admin write, member read for
--   authenticated routes. Public site reads use a scoped service-role client
--   (same as Phase 6 widget), never relaxing RLS.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. website status enum
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'website_status') then
    create type public.website_status as enum ('draft', 'published', 'unpublished');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. websites table
-- ----------------------------------------------------------------------------
create table if not exists public.websites (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null unique references public.clinics(id) on delete cascade,
  slug        text not null,
  template    text not null default 'modern'
              check (template in ('classic', 'modern', 'minimal')),
  status      public.website_status not null default 'draft',
  content_json jsonb not null default '{}',
  theme_json   jsonb not null default '{}',
  published_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table  public.websites is 'One website configuration per clinic — template + content + theme.';
comment on column public.websites.content_json is 'Editable content: hero, about, contact, sections ordering/visibility.';
comment on column public.websites.theme_json is 'Visual settings: primaryColor, fontFamily, etc.';

-- trigger for updated_at
create trigger websites_updated_at
  before update on public.websites
  for each row execute function public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- 3. website_images table (gallery + hero images)
-- ----------------------------------------------------------------------------
create table if not exists public.website_images (
  id          uuid primary key default gen_random_uuid(),
  website_id  uuid not null references public.websites(id) on delete cascade,
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  kind        text not null default 'gallery'
              check (kind in ('hero', 'gallery')),
  url         text not null,
  alt         text not null default '',
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

comment on table public.website_images is 'Gallery and hero images for a clinic website.';

create index if not exists website_images_website_id_idx
  on public.website_images (website_id, kind, position);

-- ----------------------------------------------------------------------------
-- 4. RLS policies for websites
-- ----------------------------------------------------------------------------
alter table public.websites enable row level security;

-- Members can read their clinic's website
create policy "Websites: member read"
  on public.websites for select
  using (public.is_clinic_member(clinic_id));

-- Admin/owner can insert (create website)
create policy "Websites: admin insert"
  on public.websites for insert
  with check (public.is_clinic_admin(clinic_id));

-- Admin/owner can update
create policy "Websites: admin update"
  on public.websites for update
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));

-- Admin/owner can delete
create policy "Websites: admin delete"
  on public.websites for delete
  using (public.is_clinic_admin(clinic_id));

-- ----------------------------------------------------------------------------
-- 5. RLS policies for website_images
-- ----------------------------------------------------------------------------
alter table public.website_images enable row level security;

-- Members can read their clinic's website images
create policy "Website images: member read"
  on public.website_images for select
  using (public.is_clinic_member(clinic_id));

-- Admin/owner can insert images
create policy "Website images: admin insert"
  on public.website_images for insert
  with check (public.is_clinic_admin(clinic_id));

-- Admin/owner can update images (reorder, alt text)
create policy "Website images: admin update"
  on public.website_images for update
  using (public.is_clinic_admin(clinic_id))
  with check (public.is_clinic_admin(clinic_id));

-- Admin/owner can delete images
create policy "Website images: admin delete"
  on public.website_images for delete
  using (public.is_clinic_admin(clinic_id));

-- ----------------------------------------------------------------------------
-- 6. Storage bucket for website images
-- ----------------------------------------------------------------------------
-- Create the bucket (public read for published site images)
insert into storage.buckets (id, name, public)
  values ('website-images', 'website-images', true)
  on conflict (id) do nothing;

-- Storage RLS: owner/admin can upload to their clinic's folder
create policy "Website images: admin upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'website-images'
    and public.is_clinic_admin(
      (string_to_array(name, '/'))[1]::uuid
    )
  );

-- Storage RLS: owner/admin can delete from their clinic's folder
create policy "Website images: admin delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'website-images'
    and public.is_clinic_admin(
      (string_to_array(name, '/'))[1]::uuid
    )
  );

-- Storage RLS: public read for all website images (needed for published sites)
create policy "Website images: public read"
  on storage.objects for select
  to public
  using (bucket_id = 'website-images');

-- ----------------------------------------------------------------------------
-- 7. Unique slug enforcement for published websites
-- ----------------------------------------------------------------------------
-- The slug on `websites` must be unique among published sites so the public
-- route can resolve a slug to exactly one clinic. Draft/unpublished slugs
-- don't need uniqueness (the doctor is still editing), but we enforce it on
-- publish via the server action (application-level check + this partial index).
-- We create a partial unique index on published websites only.
create unique index if not exists websites_published_slug_unique
  on public.websites (slug)
  where status = 'published';

-- =============================================================================
-- VERIFICATION (manual)
-- -----------------------------------------------------------------------------
-- 1. Authenticated owner/admin can create, read, update, delete their website.
-- 2. Staff members can read but not write their clinic's website.
-- 3. A user from a different clinic cannot read or write another clinic's website.
-- 4. The storage bucket is created with public read access.
-- 5. Owner/admin can upload/delete images in storage under their clinic_id path.
-- 6. published_at is set when status changes to 'published'.
-- =============================================================================
