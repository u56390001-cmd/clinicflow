-- =============================================================================
-- MedBook AI | Phase 19+ | Migration 0037
-- Resolve RPC overload ambiguity (PGRST203) breaking check-in payment collection
--
-- PROBLEM
-- --------
-- `create_patient_bill` and `record_vitals` each accumulated MULTIPLE overloads
-- across migrations because `create or replace` only replaces a function with
-- the *same* argument list:
--
--   create_patient_bill
--     0025: (uuid, uuid, uuid, jsonb, text)                       [5-arg]
--     0032: (uuid, uuid, uuid, jsonb, text, text, uuid, date)     [8-arg]
--     0036: (uuid, uuid, uuid, jsonb, text, text, uuid, date, text) [9-arg, KEEP]
--
--   record_vitals
--     0023: (uuid, text, numeric, int, numeric, numeric)                  [6-arg]
--     0028: (uuid, text, numeric, int, numeric, numeric, int, int, int, int) [10-arg]
--     0033: (..., jsonb)                                                  [11-arg, KEEP]
--
-- The check-in flow calls `create_patient_bill` with 6 named args including
-- `p_bill_date`. Both the 8-arg (0032) and 9-arg (0036) overloads accept that
-- argument set, so PostgREST cannot choose → `PGRST203 Could not choose the
-- best candidate function between ...`. The app only handled PGRST202
-- (function not found) for its legacy fallback, so the raw PGRST203 surfaced
-- and payment collection failed after the visit was already created.
--
-- FIX
-- ----
-- Drop every overload EXCEPT the newest superset signature. The surviving
-- 9-arg `create_patient_bill` (0036) and 11-arg `record_vitals` (0033) accept
-- their older argument sets via defaults, so any caller that worked with the
-- 5-arg / 8-arg / 6-arg / 10-arg versions keeps working unambiguously.
-- =============================================================================

-- create_patient_bill: drop the 5-arg (0025) and 8-arg (0032) overloads.
drop function if exists public.create_patient_bill(uuid, uuid, uuid, jsonb, text);
drop function if exists public.create_patient_bill(uuid, uuid, uuid, jsonb, text, text, uuid, date);

-- record_vitals: drop the 6-arg (0023) and 10-arg (0028) overloads.
drop function if exists public.record_vitals(uuid, text, numeric, int, numeric, numeric);
drop function if exists public.record_vitals(uuid, text, numeric, int, numeric, numeric, int, int, int, int);

-- (Re)grant execute on the surviving supersets so the app role can call them.
grant execute on function public.create_patient_bill(uuid, uuid, uuid, jsonb, text, text, uuid, date, text) to authenticated;
grant execute on function public.record_vitals(uuid, text, numeric, int, numeric, numeric, int, int, int, int, jsonb) to authenticated;