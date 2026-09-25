-- Vitals temperature check was authored with a Celsius range (30–45),
-- but the whole app stores/displays Fahrenheit (form unit "°F", zod 85–115,
-- displays "Temp (°F)"). Any normal °F value (e.g. 98.6) violates the check
-- and blocks check-in / payment at the vitals step.
--
-- Convert existing °C rows to °F and re-create the check as a °F range.

-- Drop the Celsius-range check first, otherwise the conversion below would
-- violate it (old rows are 30–45, converted values would be 85–113).
ALTER TABLE public.vitals
  DROP CONSTRAINT IF EXISTS vitals_temperature_check;

UPDATE public.vitals
SET temperature = round((temperature * 9.0 / 5.0 + 32.0)::numeric, 1)
WHERE temperature IS NOT NULL;

ALTER TABLE public.vitals
  ADD CONSTRAINT vitals_temperature_check
    CHECK (
      temperature IS NULL
      OR (temperature >= 85 AND temperature <= 115)
    );