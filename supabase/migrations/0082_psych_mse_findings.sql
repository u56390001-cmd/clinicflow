-- ============================================================================
-- 0082 — Psychology Mental Status Examination: structured findings + AI summary
--
-- The MSE tab moves from a flat set of descriptor columns to a guided, sectioned
-- examination: the psychologist selects findings per domain, adds observation
-- notes, and the assistant drafts a clinical summary the psychologist approves.
-- This migration adds the storage that workflow needs — additively, without
-- disturbing the existing `psych_mse` columns the Overview & Safety tab reads.
--
-- 1. `findings`    — the whole structured exam as JSONB:
--                    { appearance: { options: [...], note: "" }, ... }.
--                    Keyed by the section ids in `lib/psych-mse.ts`.
-- 2. `ai_summary`  — the assistant's clinical summary, once approved.
-- 3. `assessed_at` — when the examination was last recorded.
--
-- The legacy descriptor columns (appearance_grooming, risk_thoughts, …) stay in
-- place and keep being written by the server action, so the read-only Overview
-- snapshot, the AI summary generator and past visits all continue to work.
--
-- Re-runnable: ADD COLUMN IF NOT EXISTS guards only.
-- ============================================================================

ALTER TABLE public.psych_mse
  ADD COLUMN IF NOT EXISTS findings jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.psych_mse
  ADD COLUMN IF NOT EXISTS ai_summary text;

ALTER TABLE public.psych_mse
  ADD COLUMN IF NOT EXISTS assessed_at timestamptz;

COMMENT ON COLUMN public.psych_mse.findings IS
  'Structured MSE findings keyed by section id (see lib/psych-mse.ts).';
COMMENT ON COLUMN public.psych_mse.ai_summary IS
  'Assistant-drafted clinical summary, saved only after the psychologist approves it.';

-- ROLLBACK
-- ALTER TABLE public.psych_mse DROP COLUMN IF EXISTS findings;
-- ALTER TABLE public.psych_mse DROP COLUMN IF EXISTS ai_summary;
-- ALTER TABLE public.psych_mse DROP COLUMN IF EXISTS assessed_at;
