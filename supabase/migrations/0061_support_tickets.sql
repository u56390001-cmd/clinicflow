-- =============================================================================
-- MedBook AI — Help & Support | Migration 0061
--
-- Support ticket intake for the /app/support page. A clinic team sends a
-- structured request (bug, feature, general help) and the row lands in a
-- support inbox. The page the spec describes reads nothing back — this table
-- exists so the server action has somewhere honest to write, and so a future
-- in-app tickets inbox has the rows to render.
--
-- DESIGN NOTES
-- ------------
-- * `clinic_id` is nullable on purpose. A ticket is fundamentally from a
--   person: a brand-new user may have to file one before they have created a
--   clinic. The author's own id is always present; clinic is helpful context
--   when it exists.
--
-- * `type` / `priority` are allowed-values CHECK constraints, not Postgres
--   enums. The ticket form is the only writer and it is already Zod-checked
--   (supportTicketSchema), so an enum type would buy nothing here and cost a
--   migration later when the catalogue grows.
--
-- * RLS lets the author read and update their own ticket (closing a request
--   they filed), and members/admins of the row's clinic read tickets filed
--   about that clinic. There is deliberately no public delete policy — a
--   support inbox should keep its history.
--
-- * `status` seed: a freshly inserted ticket is `open`. A support operator
--   moves it through in_progress / resolved / closed; no app UI touches it yet.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. support_tickets
-- ----------------------------------------------------------------------------
create table if not exists public.support_tickets (
  id          uuid primary key default gen_random_uuid(),
  -- Nullable: see DESIGN NOTES — tickets are filed by a person.
  clinic_id   uuid references public.clinics(id) on delete set null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- Mirrors the request-type dropdown in the support form (0061 schema).
  type        text not null check (type in ('Bug Report', 'Feature Improvement Request', 'General Help & Support')),
  subject     text not null check (char_length(btrim(subject)) between 1 and 200),
  description text not null check (char_length(btrim(description)) between 1 and 4000),
  -- Matches the priority control: Low / Medium / High.
  priority    text not null default 'Medium' check (priority in ('Low', 'Medium', 'High')),
  -- Single source of truth for the support inbox; app writes 'open' only.
  status      text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.support_tickets is
  'Support requests filed from /app/support. Author-owned, clinic-scoped where applicable.';
comment on column public.support_tickets.clinic_id is
  'Nullable — a user may file a ticket before their clinic exists.';
comment on column public.support_tickets.status is
  'open, in_progress, resolved, or closed. Written by the support operator.';

-- The two read paths: a clinic inbox and a user's own tickets. Both sort most
-- recent first, which is the order any support panel displays.
create index if not exists support_tickets_clinic_created_idx
  on public.support_tickets (clinic_id, created_at desc);
create index if not exists support_tickets_user_created_idx
  on public.support_tickets (user_id, created_at desc);
create index if not exists support_tickets_status_idx
  on public.support_tickets (status);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'support_tickets_updated_at') then
    create trigger support_tickets_updated_at
      before update on public.support_tickets
      for each row execute function public.handle_updated_at();
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. RLS
-- ----------------------------------------------------------------------------
alter table public.support_tickets enable row level security;

-- Whoever filed the ticket can read it even before a clinic exists.
create policy "Support tickets: author read"
  on public.support_tickets for select
  using (auth.uid() = user_id);

-- Clinic members can see the tickets filed about their clinic.
create policy "Support tickets: member read"
  on public.support_tickets for select
  using (clinic_id is not null and public.is_clinic_member(clinic_id));

-- The submit action always sets user_id = auth.uid() and writes at most the
-- author's own clinic, so a crafted request cannot file a ticket for someone
-- else or attach another clinic's id.
create policy "Support tickets: author insert"
  on public.support_tickets for insert
  with check (
    auth.uid() = user_id
    and (clinic_id is null or public.is_clinic_member(clinic_id))
  );

-- The author may edit their own ticket (e.g. add detail); the row's clinic
-- admins may manage tickets filed about their clinic.
create policy "Support tickets: author or admin update"
  on public.support_tickets for update
  using (
    auth.uid() = user_id
    or (clinic_id is not null and public.is_clinic_admin(clinic_id))
  )
  with check (
    auth.uid() = user_id
    or (clinic_id is not null and public.is_clinic_admin(clinic_id))
  );

-- =============================================================================
-- ROLLBACK
-- -----------------------------------------------------------------------------
-- drop table if exists public.support_tickets;
-- =============================================================================
-- VERIFICATION (manual)
-- -----------------------------------------------------------------------------
-- 1. A signed-in user can insert a ticket; the inserted row gets their
--    auth.uid() regardless of what the request claimed, via the action.
-- 2. Two users: A inserts, B cannot read A's ticket, A can.
-- 3. A clinic member can read tickets where clinic_id matches, staff included.
-- 4. A clinic admin can update tickets for their clinic; a member cannot.
-- 5. No API user can delete a ticket (no delete policy exists).
-- 6. Re-running the migration changes nothing.
-- =============================================================================