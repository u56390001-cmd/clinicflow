-- =============================================================================
-- 0063_reminder_header_images.sql
--
-- Image headers for WhatsApp reminder messages (Phase 13 extension). When the
-- clinic picks "Image Header" in the engagement reminder popup, the uploaded
-- asset lives in this bucket and `template_header_image` in the automation
-- config holds the public URL (so the cron only ever reads a URL, never a
-- blob).
--
-- The bucket is PUBLIC (reads must work for the WhatsApp media API and the
-- popup preview), object keys are `{clinic_id}/{uuid}.{ext}` so path segment 1
-- is the tenant boundary, exactly like `clinic-logos` (0054). Writes require
-- `is_clinic_admin`, reads are open.
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
  values ('reminder-header-images', 'reminder-header-images', true, 307200)  -- 300 KiB, matches the popup hint
  on conflict (id) do nothing;

update storage.buckets
   set file_size_limit = 307200,
       public = true
 where id = 'reminder-header-images';

drop policy if exists "Reminder headers: admin upload" on storage.objects;
create policy "Reminder headers: admin upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'reminder-header-images'
    and public.is_clinic_admin(
      (string_to_array(name, '/'))[1]::uuid
    )
  );

drop policy if exists "Reminder headers: admin update" on storage.objects;
create policy "Reminder headers: admin update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'reminder-header-images'
    and public.is_clinic_admin(
      (string_to_array(name, '/'))[1]::uuid
    )
  )
  with check (
    bucket_id = 'reminder-header-images'
    and public.is_clinic_admin(
      (string_to_array(name, '/'))[1]::uuid
    )
  );

drop policy if exists "Reminder headers: admin delete" on storage.objects;
create policy "Reminder headers: admin delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'reminder-header-images'
    and public.is_clinic_admin(
      (string_to_array(name, '/'))[1]::uuid
    )
  );