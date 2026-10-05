-- =============================================================================
-- 0058_booking_settings.sql
--
-- Organization settings → Booking Page:
--   * Is the booking page publicly accessible?
--   * Custom URL slug for the booking page
--   * Slot duration for booking appointments
--   * Maximum advance booking days
--   * Auto-approve new bookings (skip admin approval)
--
-- Why these settings are stored on the clinics table
-- The booking page URL is determined at the clinic level, not per doctor or per
-- service. A single `booking_slug` (e.g., "orthopedic") applies across the entire
-- clinic's booking flow, and the clinic configures the experience as a whole:
-- slot sizes, how far in advance patients may book, and whether a receptionist
-- review step is required.
--
-- Why auto-approve is a clinic setting (not per-service)
-- A clinic may choose a policy that either requires review for all bookings or
-- doesn't. When review is off, every new appointment is instantly confirmed and
-- the receptionist can focus on only the exceptions. Enforcing it per-service
-- would create inconsistent experiences (e.g., "Cardiology: review required,
-- Orthopedics: auto-approve") and a single set of rules is simpler for clinics
-- to reason about.
--
-- IF NOT EXISTS / DROP POLICY IF EXISTS keep this file re-runnable, since
-- migrations here are applied by hand rather than via `supabase db push`.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1. clinics — public booking configuration
-- ----------------------------------------------------------------------------
alter table public.clinics
  add column if not exists booking_slug varchar(30),
  add column if not exists is_public_booking_enabled boolean not null default true,
  add column if not exists slot_duration_minutes integer not null default 15,
  add column if not exists max_advance_days integer not null default 7,
  add column if not exists auto_approve_bookings boolean not null default true;

comment on column public.clinics.booking_slug is
  'Custom URL slug for the public booking page (e.g., "orthopedic"). When set, the booking page becomes https://<domain>/book/<slug>. Defaults to null, which means the public booking URL uses the clinic slug (https://<domain>/book/<clinic_slug>).';

comment on column public.clinics.is_public_booking_enabled is
  'Whether the public booking page is publicly accessible. When true, patients can book appointments without logging in. When false, only logged-in staff can book appointments.';

comment on column public.clinics.slot_duration_minutes is
  'Duration of each booking slot in minutes. Options: 10, 15, 20, 30, 45, 60. Controls how granular the calendar picker is.';

comment on column public.clinics.max_advance_days is
  'Maximum number of days in advance a patient can book an appointment. Prevents over-booking and gives the clinic time to prepare.';

comment on column public.clinics.auto_approve_bookings is
  'Whether new bookings are automatically approved. When true, appointments are instantly confirmed and the patient receives a confirmation. When false, appointments require admin/approval before confirming.';

-- ----------------------------------------------------------------------------
-- 2. Unique constraint for booking_slug per clinic
-- ----------------------------------------------------------------------------
-- If a clinic has a custom booking_slug set, it must be unique across clinics.
-- When null (no custom slug), it is ignored.
create unique index if not exists clinics_booking_slug_unique
  on public.clinics (booking_slug)
  where booking_slug is not null;

-- ----------------------------------------------------------------------------
-- 3. RLS policies
-- ----------------------------------------------------------------------------
-- Read policies ensure that:
--   * Clinic members can view booking settings
--   * Public users can SELECT clinics by booking_slug ONLY if public booking is enabled
--
-- Write policies ensure that:
--   * Only clinic owners and admins can update booking settings
-- ----------------------------------------------------------------------------

alter table public.clinics enable row level security;

-- 3.1 Clinic members can read all clinics (needed for the public URL check)
drop policy if exists "Clinic members can view all clinics" on public.clinics;
create policy "Clinic members can view all clinics"
  on public.clinics for select
  using (true);

-- 3.2 Public users can SELECT clinic details by booking_slug ONLY if public booking is enabled
drop policy if exists "Public users can select clinics by booking_slug" on public.clinics;
create policy "Public users can select clinics by booking_slug"
  on public.clinics for select
  using (
    booking_slug is not null
    and is_public_booking_enabled = true
  );

-- 3.3 Clinic owners and admins can UPDATE their own clinic's booking settings
drop policy if exists "Clinic owners and admins can update booking settings" on public.clinics;
create policy "Clinic owners and admins can update booking settings"
  on public.clinics for update
  using (
    public.is_clinic_owner(id) or public.is_clinic_admin(id)
  );

-- 3.4 Clinic owners and admins can INSERT (when creating a new clinic)
drop policy if exists "Clinic owners and admins can insert clinics" on public.clinics;
create policy "Clinic owners and admins can insert clinics"
  on public.clinics for insert
  with check (
    public.is_clinic_owner(id) or public.is_clinic_admin(id)
  );

-- 3.5 Clinic owners and admins can DELETE their own clinics
drop policy if exists "Clinic owners and admins can delete clinics" on public.clinics;
create policy "Clinic owners and admins can delete clinics"
  on public.clinics for delete
  using (
    public.is_clinic_owner(id) or public.is_clinic_admin(id)
  );
