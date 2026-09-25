-- ----------------------------------------------------------------------------
-- Add the remaining Add-Patient form fields that have no backing column.
--
-- The redesigned patient form (reference: `docs/add patient html css js.txt`)
-- captures height, weight and a "current medications" tag block alongside the
-- existing clinical fields (blood group, city, gender, allergies, conditions —
-- all already on `patients` via 0027/0029). Height and weight also exist on the
-- per-visit `vitals` table, but the patient record should keep a baseline too,
-- so we store them on `patients` as well.
-- ----------------------------------------------------------------------------

alter table public.patients
  add column if not exists height             numeric,
  add column if not exists weight             numeric,
  add column if not exists current_medications text;

-- The same bounds recreated for vitals apply here (heights in cm, weights in kg).
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

-- ----------------------------------------------------------------------------
-- Extend `patient_directory` so the new columns flow through the directory view
-- (the Add/Edit modal reads back these fields when re-opening a record).
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
) v on true;

notify pgrst, 'reload schema';
