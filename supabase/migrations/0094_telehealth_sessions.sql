-- ============================================================================
-- 0094 — Telehealth video consultations (Phase 8)
--
-- One row per video consultation room. The doctor launches a call from the
-- active-patient header; a short-lived ZEGOcloud KitToken is minted server-side
-- (`lib/zego/server.ts`) so the AppSecret never reaches the browser. The patient
-- joins through a capability URL (`/telehealth/join?room=...&token=...`) sent
-- over WhatsApp or copied by hand.
--
-- Tenant isolation: unlike the service-role-only share-link tables, this table
-- is read and written by signed-in staff through the Data API, so RLS admits
-- only members of the owning clinic.
--
-- Re-runnable: IF NOT EXISTS guards and DROP ... IF EXISTS before CREATE.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'telehealth_status') then
    create type public.telehealth_status as enum (
      'SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'
    );
  end if;
end $$;

create table if not exists public.telehealth_sessions (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics (id) on delete cascade,
  doctor_id       uuid references public.doctors (id) on delete set null,
  patient_id      uuid not null references public.patients (id) on delete cascade,
  appointment_id  uuid references public.appointments (id) on delete set null,
  room_id         text not null unique,
  status          public.telehealth_status not null default 'SCHEDULED',
  started_at      timestamptz,
  ended_at        timestamptz,
  patient_join_url text not null,
  created_by      uuid references auth.users (id) on delete set null,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists telehealth_sessions_clinic_patient_idx
  on public.telehealth_sessions (clinic_id, patient_id, created_at desc);
create index if not exists telehealth_sessions_active_idx
  on public.telehealth_sessions (status)
  where status in ('SCHEDULED', 'ACTIVE');

-- Tenant isolation. A member of the owning clinic may see and manage only that
-- clinic's sessions; anyone else is refused by RLS.
alter table public.telehealth_sessions enable row level security;

drop policy if exists "telehealth_sessions_clinic_members" on public.telehealth_sessions;
create policy "telehealth_sessions_clinic_members"
  on public.telehealth_sessions
  for all
  using (
    clinic_id in (
      select clinic_id from public.clinic_members where user_id = auth.uid()
    )
  )
  with check (
    clinic_id in (
      select clinic_id from public.clinic_members where user_id = auth.uid()
    )
  );

-- clinic_id is immutable, matching every other clinic-scoped table (0069).
drop trigger if exists telehealth_sessions_prevent_clinic_id_change on public.telehealth_sessions;
create trigger telehealth_sessions_prevent_clinic_id_change
  before update on public.telehealth_sessions
  for each row execute function public.prevent_clinic_id_change();

drop trigger if exists telehealth_sessions_updated_at on public.telehealth_sessions;
create trigger telehealth_sessions_updated_at
  before update on public.telehealth_sessions
  for each row execute function public.handle_updated_at();

comment on table public.telehealth_sessions is
  'Phase 8 telehealth video rooms. KitTokens are minted server-side; the patient joins via a short-lived capability URL.';
