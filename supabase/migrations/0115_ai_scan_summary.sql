-- Migration 0115: split the AI-OCR document scan summary out of `ai_summary`.
--
-- Until now `processDocumentOCRAction` OVERWROTE `patients.ai_summary`, so a
-- scanned lab report clobbered the summary the doctor generated from the
-- consultation record (and vice versa). The two sources are different
-- documents and the card renders them separately, so they get separate
-- columns. Existing scan-written summaries stay in `ai_summary`; the next
-- record generation overwrites them as designed, and future scans write to
-- `ai_scan_summary`.
-- =============================================================================

alter table public.patients
  add column if not exists ai_scan_summary text,
  add column if not exists ai_scan_summary_generated_at timestamptz;

-- patient_directory must expose the new columns (same definition as 0078 with
-- the two additions; patients-table columns flow only what the view selects).
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
  p.ai_scan_summary,
  p.ai_scan_summary_generated_at,
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
