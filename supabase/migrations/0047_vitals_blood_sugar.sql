-- =============================================================================
-- MedBook AI — Phase 23 | Migration 0047
-- Blood Sugar as a first-class vital
--
-- DESIGN NOTES
-- ------------
-- * Blood sugar joins the `vitals` table as a real nullable column rather than
--   riding the `custom_vitals` jsonb escape hatch. It is one of the handful of
--   readings the Overview tab shows as its own card, and a card that only fills
--   in for clinics whose doctor happened to configure a matching custom vital
--   would be blank almost everywhere.
-- * Unit is mg/dL (whole blood), which is what a clinic glucometer reports and
--   what the check-in form labels. 20–800 covers the plausible range for a
--   screening reading; anything outside it is a typo, not a patient.
-- * BMI (0028) is the precedent for this pattern: a derived or frequently-read
--   measurement added as a column, threaded through `record_vitals`, and never
--   stored as free text.
-- * `record_vitals` is replaced rather than overloaded. 0037 removed the older
--   6-arg and 10-arg overloads precisely because Supabase's RPC resolution
--   choked on several same-named signatures; a 12-arg default-parameter
--   function is unambiguous to Postgres and to PostgREST's named-argument
--   calling convention, which is how `recordVitalsAction` calls it.
-- * The 11-arg (0033) signature is dropped in the same transaction so no
--   duplicate-named overload is left behind.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- column: vitals.blood_sugar
-- ----------------------------------------------------------------------------
alter table public.vitals
  add column if not exists blood_sugar numeric(5,1)
  check (blood_sugar is null or (blood_sugar > 0 and blood_sugar <= 800));

comment on column public.vitals.blood_sugar is
  'Blood glucose in mg/dL. Optional — captured at check-in like every other vital.';

-- ----------------------------------------------------------------------------
-- RPC: record_vitals — accept and persist blood sugar
-- ----------------------------------------------------------------------------
drop function if exists public.record_vitals(
  uuid, text, numeric, int, numeric, numeric, int, int, int, int, jsonb
);

create or replace function public.record_vitals(
  p_visit_id         uuid,
  p_blood_pressure   text,
  p_temperature      numeric,
  p_pulse            int,
  p_weight           numeric,
  p_height           numeric,
  p_systolic_bp      int default null,
  p_diastolic_bp     int default null,
  p_spo2             int default null,
  p_respiratory_rate int default null,
  p_custom_vitals    jsonb default null,
  p_blood_sugar      numeric default null
) returns public.vitals
language plpgsql
volatile
security invoker
set search_path = public, auth
as $$
declare
  v_clinic_id uuid;
  v_vitals    public.vitals;
  v_bmi       numeric;
begin
  -- Resolve clinic from visit
  select v.clinic_id into v_clinic_id
  from public.visits v
  where v.id = p_visit_id;

  if v_clinic_id is null then
    raise exception using errcode = 'P0001', message = 'VISIT_NOT_FOUND';
  end if;

  -- Auto-compute BMI if both height (cm) and weight (kg) are provided
  if p_height > 0 and p_weight > 0 then
    v_bmi := round((p_weight / ((p_height / 100.0) * (p_height / 100.0)))::numeric, 2);
  else
    v_bmi := null;
  end if;

  -- Empty array is treated as no custom vitals (keep the column null).
  if p_custom_vitals is not null and jsonb_typeof(p_custom_vitals) = 'array'
     and jsonb_array_length(p_custom_vitals) = 0 then
    p_custom_vitals := null;
  end if;

  -- Upsert: one vitals record per visit
  insert into public.vitals (
    clinic_id, visit_id, recorded_by,
    blood_pressure, temperature, pulse, weight, height,
    systolic_bp, diastolic_bp, spo2, respiratory_rate, bmi,
    custom_vitals, blood_sugar
  ) values (
    v_clinic_id, p_visit_id, (select auth.uid()),
    nullif(btrim(p_blood_pressure), ''),
    nullif(p_temperature, 0),
    nullif(p_pulse, 0),
    nullif(p_weight, 0),
    nullif(p_height, 0),
    nullif(p_systolic_bp, 0),
    nullif(p_diastolic_bp, 0),
    nullif(p_spo2, 0),
    nullif(p_respiratory_rate, 0),
    v_bmi,
    p_custom_vitals,
    nullif(p_blood_sugar, 0)
  )
  on conflict (clinic_id, visit_id) do update set
    blood_pressure   = excluded.blood_pressure,
    temperature      = excluded.temperature,
    pulse            = excluded.pulse,
    weight           = excluded.weight,
    height           = excluded.height,
    systolic_bp      = excluded.systolic_bp,
    diastolic_bp     = excluded.diastolic_bp,
    spo2             = excluded.spo2,
    respiratory_rate = excluded.respiratory_rate,
    bmi              = excluded.bmi,
    custom_vitals    = excluded.custom_vitals,
    blood_sugar      = excluded.blood_sugar,
    recorded_by      = excluded.recorded_by,
    recorded_at      = now()
  returning * into v_vitals;

  return v_vitals;
end;
$$;

grant execute on function public.record_vitals(
  uuid, text, numeric, int, numeric, numeric, int, int, int, int, jsonb, numeric
) to authenticated;

-- =============================================================================
-- VERIFICATION (manual)
-- -----------------------------------------------------------------------------
-- 1. Record vitals with a blood sugar -> vitals.blood_sugar populated
-- 2. Re-record the same visit without one -> column returns to null (not kept)
-- 3. A 0 value is stored as null, matching how every other numeric vital works
-- 4. A value above 800 is rejected by the CHECK constraint
-- 5. PostgREST exposes p_blood_sugar on `rpc('record_vitals', ...)`
-- =============================================================================
