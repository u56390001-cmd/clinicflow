-- =============================================================================
-- MedBook AI — Dual-Mode Appointment Scheduling Migration (0106)
--
-- Adds support for dual-mode appointment scheduling:
--   1. Clinic Visit ('CLINIC_VISIT')
--   2. Online Video Consultation ('ONLINE_VIDEO')
--
-- Columns added to `appointments`:
--   - appointment_type: TEXT CHECK (appointment_type IN ('CLINIC_VISIT', 'ONLINE_VIDEO')) DEFAULT 'CLINIC_VISIT'
--   - meeting_link: TEXT DEFAULT NULL (links populated by doctors, not AI)
--   - is_reminder_enabled: BOOLEAN DEFAULT TRUE
--   - chief_complaint: TEXT DEFAULT NULL
--
-- Synchronization:
--   Maintains bi-directional compatibility with existing `consultation_type` enum
--   ('in_clinic', 'online', 'video') via a trigger.
--
-- Atomic booking RPC:
--   Updates `book_appointment` to accept `p_appointment_type`, `p_meeting_link`,
--   `p_is_reminder_enabled`, and `p_chief_complaint`.
-- =============================================================================

-- 1. Alter table appointments
ALTER TABLE public.appointments 
  ADD COLUMN IF NOT EXISTS appointment_type TEXT 
    CHECK (appointment_type IN ('CLINIC_VISIT', 'ONLINE_VIDEO')) 
    DEFAULT 'CLINIC_VISIT',
  ADD COLUMN IF NOT EXISTS meeting_link TEXT 
    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_reminder_enabled BOOLEAN 
    DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS chief_complaint TEXT 
    DEFAULT NULL;

-- 2. Index for filtering appointments by type within a clinic
CREATE INDEX IF NOT EXISTS appointments_clinic_appointment_type_idx 
  ON public.appointments (clinic_id, appointment_type);

-- 3. Backfill existing appointments
UPDATE public.appointments
SET appointment_type = CASE 
  WHEN consultation_type IN ('online', 'video') THEN 'ONLINE_VIDEO' 
  ELSE 'CLINIC_VISIT' 
END
WHERE appointment_type IS NULL;

-- 4. Sync trigger between appointment_type and consultation_type
CREATE OR REPLACE FUNCTION public.sync_appointment_types()
RETURNS TRIGGER AS $$
BEGIN
  -- If appointment_type is explicitly set to ONLINE_VIDEO, sync consultation_type
  IF NEW.appointment_type = 'ONLINE_VIDEO' THEN
    IF NEW.consultation_type IS NULL OR NEW.consultation_type = 'in_clinic' THEN
      NEW.consultation_type := 'video'::public.consultation_type;
    END IF;
  -- If appointment_type is CLINIC_VISIT, sync consultation_type
  ELSIF NEW.appointment_type = 'CLINIC_VISIT' THEN
    IF NEW.consultation_type IS NULL THEN
      NEW.consultation_type := 'in_clinic'::public.consultation_type;
    END IF;
  -- If consultation_type was passed as online or video and appointment_type wasn't updated
  ELSIF NEW.consultation_type IN ('online', 'video') AND (NEW.appointment_type IS NULL OR NEW.appointment_type = 'CLINIC_VISIT') THEN
    NEW.appointment_type := 'ONLINE_VIDEO';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_appointment_types ON public.appointments;
CREATE TRIGGER trg_sync_appointment_types
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_appointment_types();

-- 5. Atomic booking RPC book_appointment update
-- Drop older 10-argument overload from 0034 to avoid PGRST203 overload ambiguity
DROP FUNCTION IF EXISTS public.book_appointment(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text, public.appointment_status, uuid, public.consultation_type
);

CREATE OR REPLACE FUNCTION public.book_appointment(
  p_clinic_id          uuid,
  p_patient_id         uuid,
  p_service_id         uuid,
  p_start_time         timestamptz,
  p_end_time           timestamptz,
  p_booking_source     text,
  p_notes              text,
  p_status             public.appointment_status default 'pending'::public.appointment_status,
  p_doctor_id          uuid default null,
  p_consultation_type  public.consultation_type default 'in_clinic'::public.consultation_type,
  p_appointment_type   text default 'CLINIC_VISIT',
  p_meeting_link       text default null,
  p_is_reminder_enabled boolean default true,
  p_chief_complaint    text default null
) RETURNS public.appointments
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, auth
AS $$
DECLARE
  v_appt        public.appointments;
  v_mode        text;
  v_capacity    int;
  v_used        int;
  v_slot_cap    int;
  v_tz          text;
  v_local       timestamp;
  v_dow         int;
  v_local_time  time;
  v_appt_type   text;
BEGIN
  -- Normalize appointment_type
  v_appt_type := COALESCE(p_appointment_type, 
    CASE WHEN p_consultation_type IN ('online', 'video') THEN 'ONLINE_VIDEO' ELSE 'CLINIC_VISIT' END
  );

  -- Clinic-local interpretation of booking start
  SELECT timezone INTO v_tz
  FROM public.clinics
  WHERE id = p_clinic_id;
  v_local := p_start_time AT TIME ZONE COALESCE(v_tz, 'UTC');
  v_dow := EXTRACT(isodow FROM v_local)::int - 1;
  v_local_time := v_local::time;

  IF p_doctor_id IS NOT NULL THEN
    SELECT d.consultation_mode, d.max_patients_per_window
    INTO v_mode, v_capacity
    FROM public.doctors d
    WHERE d.clinic_id = p_clinic_id AND d.id = p_doctor_id;

    IF v_mode IS NULL THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'DOCTOR_NOT_FOUND';
    END IF;

    IF v_mode = 'shared_window' THEN
      SELECT t.patient_limit INTO v_slot_cap
      FROM public.doctor_slot_templates t
      WHERE t.clinic_id = p_clinic_id
        AND t.doctor_id = p_doctor_id
        AND t.day_of_week = v_dow
        AND t.start_time <= v_local_time
        AND t.end_time > v_local_time
      LIMIT 1;
      IF v_slot_cap IS NOT NULL THEN
        v_capacity := v_slot_cap;
      END IF;
    END IF;
  ELSE
    v_mode := 'single_slot';
    SELECT s.consultation_mode INTO v_mode
    FROM public.services s
    WHERE s.id = p_service_id AND s.clinic_id = p_clinic_id;
    IF v_mode IS NULL OR v_mode NOT IN ('single_slot', 'shared_window') THEN
      v_mode := 'single_slot';
    END IF;

    IF v_mode = 'shared_window' THEN
      v_capacity := 1;
      SELECT t.patient_limit INTO v_slot_cap
      FROM public.service_slot_templates t
      WHERE t.clinic_id = p_clinic_id
        AND t.service_id = p_service_id
        AND t.day_of_week = v_dow
        AND t.start_time <= v_local_time
        AND t.end_time > v_local_time
      LIMIT 1;
      IF v_slot_cap IS NOT NULL THEN
        v_capacity := v_slot_cap;
      END IF;
    END IF;
  END IF;

  -- Verify overlap
  IF v_mode = 'shared_window' THEN
    SELECT count(*) INTO v_used
    FROM public.appointments a
    WHERE a.clinic_id = p_clinic_id
      AND a.status <> 'cancelled'::public.appointment_status
      AND a.start_time = p_start_time
      AND (
        p_doctor_id IS NULL
        OR a.doctor_id IS NULL
        OR a.doctor_id = p_doctor_id
      );

    IF v_used >= coalesce(v_capacity, 1) THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'SHARED_WINDOW_FULL';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM public.appointments a
      WHERE a.clinic_id = p_clinic_id
        AND a.status <> 'cancelled'::public.appointment_status
        AND a.start_time < p_end_time
        AND a.end_time > p_start_time
        AND (
          p_doctor_id IS NULL
          OR a.doctor_id IS NULL
          OR a.doctor_id = p_doctor_id
        )
    ) THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'SLOT_OVERLAP';
    END IF;
  END IF;

  -- Insert appointment record
  INSERT INTO public.appointments (
    clinic_id, patient_id, service_id, doctor_id,
    start_time, end_time, status, booking_source, notes,
    consultation_type, appointment_type, meeting_link,
    is_reminder_enabled, chief_complaint
  ) VALUES (
    p_clinic_id, p_patient_id, p_service_id, p_doctor_id,
    p_start_time, p_end_time, p_status, p_booking_source, p_notes,
    p_consultation_type, v_appt_type, p_meeting_link,
    p_is_reminder_enabled, p_chief_complaint
  )
  RETURNING * INTO v_appt;

  RETURN v_appt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_appointment(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text, public.appointment_status, uuid, public.consultation_type, text, text, boolean, text
) TO authenticated, anon;
