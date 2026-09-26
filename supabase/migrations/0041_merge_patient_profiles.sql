-- 0041_merge_patient_profiles.sql
--
-- Duplicate patient records are an unavoidable product of a phone-first clinic:
-- the same person books again from a new number, or reception re-creates them
-- because the search missed the original. The doctor then sees two half-histories
-- and neither is trustworthy.
--
-- This migration gives the clinic a real merge:
--   1. `patients` gains a soft-archive marker (`merged_at`, `merged_into_patient_id`)
--      so the duplicate disappears from the directory WITHOUT any row (or its
--      still-pointing data) being deleted.
--   2. `patient_directory` is rebuilt to hide merged duplicates, so every list,
--      search, and queue in the app stops offering the ghost record.
--   3. `merge_patient_profiles(primary, duplicate)` re-parents every direct child
--      of the duplicate onto the primary, then archives the duplicate. A single
--      plpgsql function is one implicit transaction — anything failing mid-way
--      rolls the whole merge back, so a profile is never half-moved.
--
-- Why re-parent instead of delete: prescriptions/vitals/bills carry the clinic's
-- clinical history. Deleting the duplicate would CASCADE away prescriptions and
-- documents (0024:75, 0029:219) and hard-block on appointments/visits/bills
-- (NO ACTION). UPDATE ... SET patient_id moves all of it losslessly.
--
-- Uniqueness collisions handled explicitly:
--   * visits unique (clinic_id, appointment_id) — an appointment can only belong
--     to one patient at a time; if both sides somehow have a visit for the same
--     appointment, the duplicate's is archived-check skipped (guarded below).
--   * prescriptions unique (clinic_id, visit_id) — visit ids move wholesale, so
--     no new (clinic_id, visit_id) pair is created; safe by construction.
--   * patient_bills unique (clinic_id, visit_id) where visit_id is not null —
--     same reasoning: bills travel with their visit.
--   * whatsapp_conversations unique (clinic_id, patient_whatsapp_number)
--     (0020:52) — genuinely collides when both profiles share a WhatsApp number.
--     The duplicate's conflicting conversations are folded first: the primary's
--     conversation wins (most clinics keep the older/active thread), the
--     duplicate's losing rows are deleted (they are message pointers, not
--     clinical records; losing them does not lose medical data).
--   * patients unique (clinic_id, patient_code) — the duplicate KEEPS its code
--     (the row survives, just archived). A new patient can never be assigned a
--     live duplicate's code because the UHID trigger (0029:188) only allocates on
--     INSERT, and post-merge search reads only `patient_directory` (merged rows
--     hidden). Acceptance: codes of merged patients go permanently unused —
--     which is exactly what an abandoned UHID should mean on paper.

-- =============================================================================
-- 0. Ensure 0039's health fields exist (self-heal)
-- =============================================================================
-- The directory rebuild below selects p.height/p.weight/p.current_medications,
-- which 0039 introduced. On databases where 0039 was never applied the plain
-- ALTERs below add them first (identical to 0039, including its check-constraint
-- guards), so 0041 applies cleanly no matter whether 0039 ran. On databases
-- where 0039 did run these statements are true no-ops.
alter table public.patients
  add column if not exists height             numeric,
  add column if not exists weight             numeric,
  add column if not exists current_medications text;

do $$
begin
  alter table public.patients
    add constraint patients_height_check
    check (height is null or height between 30 and 300);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.patients
    add constraint patients_weight_check
    check (weight is null or weight between 1 and 500);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.patients
    add constraint patients_current_medications_check
    check (current_medications is null or char_length(btrim(current_medications)) between 1 and 2000);
exception
  when duplicate_object then null;
end $$;

-- =============================================================================
-- 1. Soft-archive columns on patients
-- =============================================================================
alter table public.patients
  add column if not exists merged_at              timestamptz,
  add column if not exists merged_into_patient_id uuid;

-- Archive marker must be self-consistent: a timestamp implies a target and vice
-- versa, and a patient can never be merged into themselves.
do $$
begin
  alter table public.patients
    add constraint patients_merge_pair_check
    check ((merged_at is null) = (merged_into_patient_id is null));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.patients
    add constraint patients_merge_not_self_check
    check (merged_into_patient_id is null or merged_into_patient_id <> id);
exception
  when duplicate_object then null;
end $$;

-- Chain guard: `merged_into` must never point at an already-merged patient,
-- otherwise merge(M→D) after merge(P→M) would leave the directory hiding D but
-- with D's children pointed at a hidden M. Enforced transactionally by the RPC
-- (it rejects merged targets); this constraint is the backstop against any
-- future code path that writes the columns directly.
create or replace function public.patients_reject_merge_chain()
returns trigger
language plpgsql
as $$
begin
  if new.merged_into_patient_id is not null then
    if exists (
      select 1 from public.patients t
      where t.id = new.merged_into_patient_id
        and t.merged_at is not null
    ) then
      raise exception 'merge target is itself merged — merge into the final primary instead';
    end if;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'patients_reject_merge_chain') then
    create trigger patients_reject_merge_chain
      before update of merged_at, merged_into_patient_id on public.patients
      for each row
      execute function public.patients_reject_merge_chain();
  end if;
end $$;

-- Partial index: the hot read is "unmerged patients of clinic X" — keep it cheap.
create index if not exists patients_clinic_unmerged_idx
  on public.patients (clinic_id)
  where merged_at is null;

-- =============================================================================
-- 2. patient_directory: hide merged duplicates
-- =============================================================================
-- Identical to the 0039 rebuild (which itself carries 0029's additions) with ONE
-- change: `where p.merged_at is null`. Every consumer of the view — patient list
-- pane, search, check-in duplicate detection, queue — automatically stops seeing
-- archived duplicates with no app-side changes.
--
-- IMPORTANT: this list must stay in sync with the live view definition — any
-- column added to `patients` and selected by the CURRENT deployed view must be
-- selected here too, or the DROP + CREATE below will silently shrink the view
-- (columns the app reads would vanish without any error).
drop view if exists public.patient_directory;

create view public.patient_directory
with (security_invoker = true) as
select
  p.id,
  p.clinic_id,
  p.name,
  p.email,
  p.phone,
  p.notes,
  p.date_of_birth,
  p.created_at,
  p.updated_at,
  p.patient_code,
  p.gender,
  p.age,
  p.city,
  p.blood_group,
  p.whatsapp_number,
  p.notification_preference,
  p.registered_branch,
  p.known_allergies,
  p.medical_conditions,
  p.height,
  p.weight,
  p.current_medications,
  p.ai_summary,
  p.ai_summary_generated_at,
  p.ai_summary_visit_count,
  coalesce(s.appointment_count, 0) as appointment_count,
  s.last_appointment_at,
  coalesce(s.upcoming_count, 0) as upcoming_count,
  coalesce(v.visit_count, 0) as visit_count,
  v.last_visit_at
from public.patients p
left join lateral (
  select
    count(a.id) filter (where a.status <> 'cancelled'::public.appointment_status) as appointment_count,
    max(a.start_time) filter (where a.status <> 'cancelled'::public.appointment_status) as last_appointment_at,
    count(a.id) filter (
      where a.status in ('pending'::public.appointment_status, 'confirmed'::public.appointment_status)
        and a.start_time >= now()
    ) as upcoming_count
  from public.appointments a
  where a.clinic_id = p.clinic_id
    and a.patient_id = p.id
) s on true
left join lateral (
  select
    count(vs.id)          as visit_count,
    max(vs.checked_in_at) as last_visit_at
  from public.visits vs
  where vs.clinic_id = p.clinic_id
    and vs.patient_id = p.id
) v on true
where p.merged_at is null;

-- =============================================================================
-- 3. merge_patient_profiles RPC
-- =============================================================================
-- SECURITY DEFINER: the function runs with owner privileges so it can move rows
-- across two patient ids in one shot — patient-side RLS policies would let a
-- member UPDATE children of only one profile at a time in practice, and the move
-- must be atomic. Authorization is done explicitly inside the function via
-- is_clinic_member(), and BOTH ids are pinned to the caller's clinic before
-- anything is touched, so a forged id from another tenant fails closed.
--
-- Multi-tenant rule: every UPDATE carries `clinic_id = v_clinic_id` even where
-- the id is (by PK) globally unique, so no statement can ever cross clinics and
-- the composite FKs — which require (clinic_id, patient_id) to match — stay
-- satisfied by construction.
create or replace function public.merge_patient_profiles(
  p_primary_patient_id  uuid,
  p_duplicate_patient_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_primary   public.patients%rowtype;
  v_duplicate public.patients%rowtype;
  v_clinic_id uuid;
begin
  -- ---------------------------------------------------------------- pre-checks
  if p_primary_patient_id = p_duplicate_patient_id then
    raise exception 'A patient cannot be merged into itself.';
  end if;

  select * into v_primary
  from public.patients
  where id = p_primary_patient_id;

  if not found then
    raise exception 'Primary patient not found.';
  end if;

  select * into v_duplicate
  from public.patients
  where id = p_duplicate_patient_id;

  if not found then
    raise exception 'Duplicate patient not found.';
  end if;

  if v_primary.clinic_id <> v_duplicate.clinic_id then
    raise exception 'Patients belong to different clinics.' using errcode = '42501';
  end if;

  if v_primary.merged_at is not null then
    raise exception 'The target profile has itself been merged into another patient.';
  end if;

  if v_duplicate.merged_at is not null then
    raise exception 'This duplicate has already been merged.';
  end if;

  v_clinic_id := v_primary.clinic_id;

  -- Caller must be a member of THAT clinic — this is the RLS-equivalent gate for
  -- a security-definer function (same posture as 0021 / 0040's is_clinic_member).
  if not public.is_clinic_member(v_clinic_id) then
    raise exception 'Not a member of this clinic.' using errcode = '42501';
  end if;

  -- --------------------------------------------------- serialize concurrent merges
  -- Order-insensitive key: merging A→B and B→A from two tabs can't deadlock or
  -- interleave. pg_advisory_xact_lock is released automatically at COMMIT.
  perform pg_advisory_xact_lock(
    hashtext(
      v_clinic_id::text || ':merge:' ||
      (case when p_primary_patient_id < p_duplicate_patient_id
            then p_primary_patient_id || p_duplicate_patient_id
            else p_duplicate_patient_id || p_primary_patient_id
      end)::text
    )
  );

  -- ----------------------------------------------------------- re-parent children
  -- Order matters only for readability; the composite FKs are satisfied because
  -- (clinic_id, primary_id) is guaranteed to exist (v_primary just read it).

  -- appointments: blocks delete, travels to the primary's name.
  update public.appointments
     set patient_id = p_primary_patient_id
   where clinic_id = v_clinic_id
     and patient_id = p_duplicate_patient_id;

  -- visits: the clinical backbone; vitals/pre-consult answers ride along via
  -- their visit_id FKs automatically.
  update public.visits
     set patient_id = p_primary_patient_id
   where clinic_id = v_clinic_id
     and patient_id = p_duplicate_patient_id;

  -- prescriptions: CASCADE on patient delete — must move, never touch.
  update public.prescriptions
     set patient_id = p_primary_patient_id
   where clinic_id = v_clinic_id
     and patient_id = p_duplicate_patient_id;

  -- patient_documents: also CASCADE-on-delete.
  update public.patient_documents
     set patient_id = p_primary_patient_id
   where clinic_id = v_clinic_id
     and patient_id = p_duplicate_patient_id;

  -- patient_bills: blocks delete (NO ACTION); bill_items/payments/receipts ride
  -- along via their bill_id FKs.
  update public.patient_bills
     set patient_id = p_primary_patient_id
   where clinic_id = v_clinic_id
     and patient_id = p_duplicate_patient_id;

  -- whatsapp_conversations (single-column FK, SET NULL on delete):
  -- fold the unique (clinic_id, patient_whatsapp_number) collision first — the
  -- primary keeps its thread, the duplicate's same-number thread is dropped —
  -- then move whatever remains.
  delete from public.whatsapp_conversations w_dup
   where w_dup.clinic_id = v_clinic_id
     and w_dup.patient_id = p_duplicate_patient_id
     and exists (
       select 1 from public.whatsapp_conversations w_pri
       where w_pri.clinic_id = v_clinic_id
         and w_pri.patient_id = p_primary_patient_id
         and w_pri.patient_whatsapp_number = w_dup.patient_whatsapp_number
     );

  update public.whatsapp_conversations
     set patient_id = p_primary_patient_id
   where clinic_id = v_clinic_id
     and patient_id = p_duplicate_patient_id;

  -- ------------------------------------------------------------------ archive
  update public.patients
     set merged_at              = now(),
         merged_into_patient_id = p_primary_patient_id
   where id = p_duplicate_patient_id
     and clinic_id = v_clinic_id;

  -- `updated_at` intentionally not bumped: the merge audit trail is
  -- merged_at/merged_into_patient_id themselves; updated_at keeps meaning
  -- "profile content last edited".

  return p_primary_patient_id;
end;
$$;

-- EXECUTE hardening (0021/0040 posture): signed-in clinic members only; `anon`
-- must not reach it. Cross-clinic rejection happens inside via is_clinic_member.
revoke execute on function public.merge_patient_profiles(uuid, uuid) from public, anon;
grant execute on function public.merge_patient_profiles(uuid, uuid) to authenticated;

comment on function public.merge_patient_profiles(uuid, uuid) is
  'Merge a duplicate patient into a primary: re-parents appointments, visits, '
  'prescriptions, documents, bills and WhatsApp conversations, then soft-archives '
  'the duplicate. SECURITY DEFINER; gated by is_clinic_member + clinic_id pinning.';

notify pgrst, 'reload schema';

-- =============================================================================
-- VERIFICATION (manual, run in SQL editor after applying)
-- -----------------------------------------------------------------------------
-- 1. select merged_at, merged_into_patient_id from patients limit 1;   -- columns exist
-- 2. select count(*) from patient_directory;  -- unchanged (no patient merged yet)
-- 3. Dry-run on throwaway duplicates:
--      select merge_patient_profiles('<primary>', '<duplicate>');
--    then confirm the duplicate vanishes from patient_directory but its visits,
--    prescriptions and bills appear under the primary, and
--      select merged_at, merged_into_patient_id from patients where id = '<duplicate>';
--    shows the archive markers.
-- 4. Error paths: wrong-clinic id -> 42501; already-merged duplicate -> friendly
--    exception; anonymous role -> permission denied.
