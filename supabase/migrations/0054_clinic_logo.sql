-- =============================================================================
-- 0054_clinic_logo.sql
--
-- Clinic logo for Organization settings (Phase 20).
--
-- 1. `clinics.logo_url` — object path inside the new `clinic-logos` bucket.
-- 2. `clinic-logos` storage bucket + tenant-scoped RLS policies.
--
-- The bucket is PUBLIC: the logo renders on the patient-facing clinic page and
-- the public booking/website templates, which are read by unauthenticated
-- visitors. Those visitors cannot be granted a signed URL because they have no
-- session to sign one with. Object keys are `{clinic_id}/{uuid}.{ext}` so path
-- segment 1 is the tenant boundary and every policy below can re-derive the
-- owning clinic from the key alone.
--
-- Writes require `is_clinic_admin` (owner or admin), matching the `clinics`
-- update policy and `canWriteClinic()` in lib/clinic-access.ts. Reads are open
-- because the bucket is public; deletes are admin-scoped so one clinic can
-- never remove another clinic's asset.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1. clinics.logo_url
-- ----------------------------------------------------------------------------
-- Nullable: existing clinics have no logo and must keep working. The 512 cap
-- matches the longest Supabase public object URL this app generates
-- (project-ref.supabase.co/storage/v1/object/public/...). Cleared to NULL when
-- the owner removes the logo.
alter table public.clinics
  add column if not exists logo_url text
  check (
    logo_url is null or char_length(btrim(logo_url)) between 1 and 512
  );

comment on column public.clinics.logo_url is
  'Object path in the public clinic-logos bucket, or null when no logo is set.';

-- ----------------------------------------------------------------------------
-- 2. clinic-logos bucket
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
  values ('clinic-logos', 'clinic-logos', true, 2097152)  -- 2 MiB, matches the UI hint
  on conflict (id) do nothing;

-- Re-assert the cap in case the bucket already existed from a partial apply.
update storage.buckets
   set file_size_limit = 2097152,
       public = true
 where id = 'clinic-logos';

drop policy if exists "Clinic logos: admin upload" on storage.objects;
create policy "Clinic logos: admin upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'clinic-logos'
    and public.is_clinic_admin(
      (string_to_array(name, '/'))[1]::uuid
    )
  );

drop policy if exists "Clinic logos: admin update" on storage.objects;
create policy "Clinic logos: admin update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'clinic-logos'
    and public.is_clinic_admin(
      (string_to_array(name, '/'))[1]::uuid
    )
  )
  with check (
    bucket_id = 'clinic-logos'
    and public.is_clinic_admin(
      (string_to_array(name, '/'))[1]::uuid
    )
  );

drop policy if exists "Clinic logos: admin delete" on storage.objects;
create policy "Clinic logos: admin delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'clinic-logos'
    and public.is_clinic_admin(
      (string_to_array(name, '/'))[1]::uuid
    )
  );