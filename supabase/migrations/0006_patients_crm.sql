-- =============================================================================
-- MedBook AI — Phase 4 | Migration 0006
-- Patients CRM: date_of_birth + server-side directory (search/filter/sort)
--
-- DESIGN NOTES
-- ------------
-- * `date_of_birth` is the only new patient field (MVP boundary — no clinical
--   or medical data). It is optional and cannot be in the future.
-- * Search performance: `pg_trgm` GIN index over (name, email, phone) serves
--   `ilike '%term%'` (a leading-wildcard LIKE a B-tree cannot serve).
-- * Directory stats are DERIVED, not stored: a `security_invoker` view joins
--   patients to appointments and computes appointment_count /
--   last_appointment_at / upcoming_count on the fly. `security_invoker` keeps
--   RLS on the underlying tables active inside the view, and every query also
--   filters `clinic_id` explicitly — defense in depth, no cross-clinic leak.
-- * History reads are served by a new (clinic_id, patient_id, start_time)
--   index on appointments.
-- * All statements are idempotent (guard blocks / IF NOT EXISTS).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- column: patients.date_of_birth (nullable date, not in the future)
-- ----------------------------------------------------------------------------
do $$
begin
  alter table public.patients add column date_of_birth date;
exception
  when duplicate_column then null;
end $$;

do $$
begin
  alter table public.patients
    add constraint patients_dob_not_future
    check (date_of_birth is null or date_of_birth <= current_date);
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- search index: pg_trgm over name/email/phone (ilike '%term%')
-- ----------------------------------------------------------------------------
create extension if not exists pg_trgm;

create index if not exists patients_search_trgm_idx
  on public.patients
  using gin (name gin_trgm_ops, email gin_trgm_ops, phone gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- history index: per-patient appointment reads
-- ----------------------------------------------------------------------------
create index if not exists appointments_clinic_patient_start_idx
  on public.appointments (clinic_id, patient_id, start_time);

-- ----------------------------------------------------------------------------
-- view: patient_directory (read-only, RLS-preserving derived stats)
--
-- NOTE: the appointment aggregates live in a LEFT JOIN LATERAL subquery rather
-- than a plain LEFT JOIN. With `security_invoker`, RLS applies to every
-- underlying table access; a plain LEFT JOIN produces a NULL-extended
-- appointment row for patients with no appointments, and the appointments RLS
-- policy (`is_clinic_member(clinic_id)`) is false on NULL clinic_id — which
-- would silently drop zero-appointment patients (LEFT JOIN becomes INNER).
-- Aggregating inside a LATERAL keeps the NULLs on the patients side, so all
-- patients survive while appointment access stays RLS-scoped.
-- ----------------------------------------------------------------------------
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
  coalesce(s.appointment_count, 0) as appointment_count,
  s.last_appointment_at,
  coalesce(s.upcoming_count, 0) as upcoming_count
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
) s on true;

-- PostgREST needs a schema-cache reload to expose the new view.
notify pgrst, 'reload schema';

-- =============================================================================
-- VERIFICATION (manual; mirrors the Phase 4 checklist)
-- -----------------------------------------------------------------------------
-- 1. Owner inserts patients with/without date_of_birth; future DOB is rejected.
-- 2. Query patient_directory as the owner: counts/last/upcoming match the
--    appointments written in Phase 3's REST checks.
-- 3. A user from another clinic reads patient_directory for clinic A -> 0 rows
--    (view RLS + explicit clinic_id scope).
-- 4. Search: ilike over name/email/phone; filter: upcoming / no_appointments /
--    new_30d; sort: name / created / last_appointment / appointment_count.
-- 5. Pagination via limit/offset + total count.
-- =============================================================================
