-- ============================================================================
-- 0105 — Telehealth upgrade: encounter linkage, in-call chat, chat attachments.
--
-- Three things, all additive:
--
--   1. `telehealth_sessions.visit_id` — the encounter a call belongs to, so
--      notes, captured frames and derm photo tags can be stamped with the same
--      visit the consultation is being documented under. Mirrors the 0104
--      linkage added to the derm tables.
--
--   2. `telehealth_messages` — the durable, append-only record of in-call text
--      and attachments, in BOTH directions. It is deliberately not a
--      fire-and-forget signalling channel: a message persists before it is
--      broadcast, so a doctor who reloads mid-call still sees the conversation.
--
--   3. A private `telehealth-attachments` bucket. Chat files are read only
--      through short-lived signed URLs minted by the server actions, which
--      re-check clinic membership (doctor) or the session's patient-link hash
--      (patient) on every request. No storage policy grants broad read access,
--      so the bucket is inert without those actions.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Encounter linkage
-- ----------------------------------------------------------------------------
alter table public.telehealth_sessions
  add column if not exists visit_id uuid
    references public.visits (id) on delete set null;

create index if not exists telehealth_sessions_visit_idx
  on public.telehealth_sessions (visit_id)
  where visit_id is not null;

comment on column public.telehealth_sessions.visit_id is
  'Encounter this call is documenting; frames and derm photo tags captured in-call carry the same visit_id.';

-- ----------------------------------------------------------------------------
-- 2. In-call messages
-- ----------------------------------------------------------------------------
create table if not exists public.telehealth_messages (
  id                uuid        primary key default gen_random_uuid(),
  clinic_id         uuid        not null references public.clinics (id) on delete cascade,
  session_id        uuid        not null references public.telehealth_sessions (id) on delete cascade,
  patient_id        uuid        not null,

  -- Who spoke. 'doctor' covers every clinic-side participant (a call is 1:1
  -- today, so there is no shared session token between clinicians).
  sender_type       text        not null check (sender_type in ('doctor', 'patient')),
  sender_name       text        not null
                                check (char_length(btrim(sender_name)) between 1 and 120),

  -- A message is text, a file, or both. One of the two must be present.
  body              text        check (body is null or char_length(body) <= 4000),

  -- Attachment metadata. `attachment_path` is a storage key, never a URL: the
  -- signed URL is minted per read, so nothing durable leaks a patient file.
  attachment_path   text        check (attachment_path is null
                                       or char_length(btrim(attachment_path)) between 1 and 1024),
  attachment_name   text        check (attachment_name is null
                                       or char_length(btrim(attachment_name)) between 1 and 255),
  attachment_mime   text        check (attachment_mime is null or attachment_mime in (
                                  'application/pdf', 'image/png', 'image/jpeg', 'image/webp'
                                )),
  attachment_size   bigint      check (attachment_size is null
                                       or (attachment_size > 0 and attachment_size <= 10485760)),

  created_at        timestamptz not null default now(),

  constraint telehealth_messages_clinic_patient_fkey
    foreign key (clinic_id, patient_id) references public.patients (clinic_id, id) on delete cascade,

  -- Nothing to show the other side otherwise.
  constraint telehealth_messages_content_present
    check (body is not null or attachment_path is not null),

  -- An attachment is all four fields or none of them; a half-filled card would
  -- render as a broken download.
  constraint telehealth_messages_attachment_consistent
    check (
      (attachment_path is null and attachment_name is null
        and attachment_mime is null and attachment_size is null)
      or
      (attachment_path is not null and attachment_name is not null
        and attachment_mime is not null and attachment_size is not null)
    )
);

create index if not exists telehealth_messages_session_idx
  on public.telehealth_messages (session_id, created_at);

create index if not exists telehealth_messages_clinic_patient_idx
  on public.telehealth_messages (clinic_id, patient_id, created_at desc);

alter table public.telehealth_messages enable row level security;

-- Read and append, scoped to the caller's clinic. No update and no delete
-- policy: a consultation transcript is evidence, and nothing in the product
-- edits or removes one.
drop policy if exists telehealth_messages_select_member on public.telehealth_messages;
create policy telehealth_messages_select_member
  on public.telehealth_messages for select to authenticated
  using (public.is_clinic_member(clinic_id));

drop policy if exists telehealth_messages_insert_member on public.telehealth_messages;
create policy telehealth_messages_insert_member
  on public.telehealth_messages for insert to authenticated
  with check (public.is_clinic_member(clinic_id));

comment on table public.telehealth_messages is
  'In-call telehealth chat (text + attachments), both directions. Append-only; files live in the private telehealth-attachments bucket.';

-- Realtime so the doctor side receives messages as they are sent. Optional by
-- design: the chat also polls, and the call never depends on this publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'telehealth_messages'
  ) then
    alter publication supabase_realtime add table public.telehealth_messages;
  end if;
exception
  when undefined_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Private attachment bucket
-- ----------------------------------------------------------------------------
-- 10 MB ceiling matches the DB CHECK and the patient-document limit. Bucket
-- path segment 1 is the clinic id, so any future policy can key off the tenant
-- boundary without a schema change.
insert into storage.buckets (id, name, public, file_size_limit)
  values ('telehealth-attachments', 'telehealth-attachments', false, 10485760)
  on conflict (id) do nothing;
