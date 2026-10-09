-- ============================================================================
-- 0070_storage_hardening.sql  (B13)
-- Zero-trust multi-tenancy hardening — part 7 of 7.
--
--   * Creates the missing `payment-proofs` bucket (referenced by
--     app/api/billing/proof and submitPaymentAction but absent on the live DB).
--   * Sets file_size_limit + allowed_mime_types on every bucket.
--   * Recreates the storage policies with a defensive path parser
--     (`storage_path_clinic_id`) that returns NULL instead of raising on a
--     malformed path (fails closed, never 500s).
--
-- Idempotent. Rollback: set limits to NULL, drop the helper and the created
-- bucket if you must (data loss risk — only for a full rollback).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Buckets + limits
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs', 'payment-proofs', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
where id = 'website-images';

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
where id in ('patient-documents', 'ai-ocr-documents');

update storage.buckets
set file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
where id = 'clinic-logos';

update storage.buckets
set file_size_limit = 307200,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'reminder-header-images';

-- ---------------------------------------------------------------------------
-- 2. Defensive path parser: first segment -> clinic uuid, or NULL (fail closed).
-- ---------------------------------------------------------------------------
create or replace function public.storage_path_clinic_id(p_name text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case
    when p_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(/|$)'
      then split_part(p_name, '/', 1)::uuid
    else null
  end;
$$;

revoke execute on function public.storage_path_clinic_id(text) from public, anon;
grant  execute on function public.storage_path_clinic_id(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Recreate storage policies against the defensive parser.
-- ---------------------------------------------------------------------------
-- patient-documents (private medical records)
drop policy if exists "Patient documents: clinic upload" on storage.objects;
create policy "Patient documents: clinic upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'patient-documents'
    and public.is_clinic_member(public.storage_path_clinic_id(name))
  );
drop policy if exists "Patient documents: clinic read" on storage.objects;
create policy "Patient documents: clinic read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'patient-documents'
    and public.is_clinic_member(public.storage_path_clinic_id(name))
  );
drop policy if exists "Patient documents: clinic delete" on storage.objects;
create policy "Patient documents: clinic delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'patient-documents'
    and public.is_clinic_member(public.storage_path_clinic_id(name))
  );

-- ai-ocr-documents (private)
drop policy if exists "AI OCR: clinic upload" on storage.objects;
create policy "AI OCR: clinic upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ai-ocr-documents'
    and public.is_clinic_member(public.storage_path_clinic_id(name))
  );
drop policy if exists "AI OCR: clinic read" on storage.objects;
create policy "AI OCR: clinic read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'ai-ocr-documents'
    and public.is_clinic_member(public.storage_path_clinic_id(name))
  );
drop policy if exists "AI OCR: clinic delete" on storage.objects;
create policy "AI OCR: clinic delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'ai-ocr-documents'
    and public.is_clinic_member(public.storage_path_clinic_id(name))
  );

-- website-images (public read by design; writes admin-only)
drop policy if exists "Website images: admin upload" on storage.objects;
create policy "Website images: admin upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'website-images'
    and public.is_clinic_admin(public.storage_path_clinic_id(name))
  );
drop policy if exists "Website images: admin delete" on storage.objects;
create policy "Website images: admin delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'website-images'
    and public.is_clinic_admin(public.storage_path_clinic_id(name))
  );
drop policy if exists "Website images: public read" on storage.objects;
create policy "Website images: public read"
  on storage.objects for select to public
  using (bucket_id = 'website-images');

-- clinic-logos (public read; admin write)
drop policy if exists "Clinic logos: admin upload" on storage.objects;
create policy "Clinic logos: admin upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'clinic-logos'
    and public.is_clinic_admin(public.storage_path_clinic_id(name))
  );
drop policy if exists "Clinic logos: admin update" on storage.objects;
create policy "Clinic logos: admin update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'clinic-logos'
    and public.is_clinic_admin(public.storage_path_clinic_id(name))
  )
  with check (
    bucket_id = 'clinic-logos'
    and public.is_clinic_admin(public.storage_path_clinic_id(name))
  );
drop policy if exists "Clinic logos: admin delete" on storage.objects;
create policy "Clinic logos: admin delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'clinic-logos'
    and public.is_clinic_admin(public.storage_path_clinic_id(name))
  );

-- reminder-header-images (public read; admin write)
drop policy if exists "Reminder headers: admin upload" on storage.objects;
create policy "Reminder headers: admin upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'reminder-header-images'
    and public.is_clinic_admin(public.storage_path_clinic_id(name))
  );
drop policy if exists "Reminder headers: admin update" on storage.objects;
create policy "Reminder headers: admin update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'reminder-header-images'
    and public.is_clinic_admin(public.storage_path_clinic_id(name))
  )
  with check (
    bucket_id = 'reminder-header-images'
    and public.is_clinic_admin(public.storage_path_clinic_id(name))
  );
drop policy if exists "Reminder headers: admin delete" on storage.objects;
create policy "Reminder headers: admin delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'reminder-header-images'
    and public.is_clinic_admin(public.storage_path_clinic_id(name))
  );

-- payment-proofs (private; clinic write/read own, platform admin read all)
drop policy if exists "Payment proofs: clinic upload own" on storage.objects;
create policy "Payment proofs: clinic upload own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and public.is_clinic_member(public.storage_path_clinic_id(name))
  );
drop policy if exists "Payment proofs: clinic read own" on storage.objects;
create policy "Payment proofs: clinic read own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (
      public.is_clinic_member(public.storage_path_clinic_id(name))
      or public.is_platform_admin()
    )
  );

notify pgrst, 'reload schema';
