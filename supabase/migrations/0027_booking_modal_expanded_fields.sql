-- 0027: Booking modal expanded fields
-- Adds optional patient fields for the expanded booking form (Phase 51):
--   city, gender, age, known_allergies, medical_conditions
-- Extends consultation_type enum to include 'video'.
-- All columns are nullable and additive — no impact on existing records.

-- ── 1. Extend consultation_type enum with 'video' ─────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'consultation_type'
      and e.enumlabel = 'video'
  ) then
    alter type public.consultation_type add value 'video' after 'online';
  end if;
end
$$;

-- ── 2. New optional patient fields ────────────────────────────────────────
alter table public.patients
  add column if not exists city text
    constraint patients_city_check
      check (city is null or char_length(btrim(city)) between 1 and 100);

alter table public.patients
  add column if not exists gender text
    constraint patients_gender_check
      check (gender is null or gender in ('male', 'female', 'other'));

alter table public.patients
  add column if not exists age integer
    constraint patients_age_check
      check (age is null or (age >= 0 and age <= 150));

alter table public.patients
  add column if not exists known_allergies text
    constraint patients_known_allergies_check
      check (known_allergies is null or char_length(known_allergies) between 1 and 2000);

alter table public.patients
  add column if not exists medical_conditions text
    constraint patients_medical_conditions_check
      check (medical_conditions is null or char_length(medical_conditions) between 1 and 2000);
