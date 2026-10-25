-- Migration 0116: intake baseline markers for the psychology workspace.
--
-- Three clinical gaps the intake form did not capture (UI refactor of the
--Intake & History tab):
--   1. `personal_crisis_history` — the patient's OWN crisis record (past
--      suicide attempt, NSSI, psychiatric admission). Family history covered
--      relatives; the patient's own history lived nowhere.
--   2. `sleep_quality` / `appetite_energy` — DSM-5 vegetative sign quick
--      chips below the presenting concern.
--   3. `trauma_history` — adverse events (ACEs), separated from the mundane
--      `stressors` list.
-- All four follow the same hybrid convention: comma-joined tokens on the
-- first line, narrative details on the following lines.
-- =============================================================================

alter table public.psych_intake
  add column if not exists personal_crisis_history text,
  add column if not exists sleep_quality text,
  add column if not exists appetite_energy text,
  add column if not exists trauma_history text;
