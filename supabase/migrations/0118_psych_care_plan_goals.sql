-- 0118: structured SMART goals + review cadence for the psychology Care Plan.
--
-- The free-text `therapy_goals` field stays untouched (backward compatibility -
-- one-line-per-goal text remains valid to read and to seed the goals builder).
-- The structured `goals` JSONB array is what the Goal Builder writes and what
-- the Overview snapshot, push-to-note and print surface consume.

ALTER TABLE public.psych_care_plans
  ADD COLUMN IF NOT EXISTS diagnosis_problem_list text,
  ADD COLUMN IF NOT EXISTS goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS next_review_date date,
  ADD COLUMN IF NOT EXISTS review_cadence_days integer NOT NULL DEFAULT 60
    CHECK (review_cadence_days BETWEEN 7 AND 365);

CREATE INDEX IF NOT EXISTS psych_care_plans_next_review_idx
  ON public.psych_care_plans (next_review_date)
  WHERE next_review_date IS NOT NULL;

-- Existing plans: one free-text goal line becomes one active SMART goal row.
UPDATE public.psych_care_plans p
   SET goals = COALESCE(
         (
           SELECT jsonb_agg(
                    jsonb_build_object(
                      'id', gen_random_uuid()::text,
                      'title', btrim(t.line),
                      'target_date', NULL,
                      'status', 'active',
                      'baseline_metric', '',
                      'target_metric', ''
                    )
                    ORDER BY t.ord
                  )
             FROM unnest(regexp_split_to_array(p.therapy_goals, E'\r?\n'))
                  WITH ORDINALITY AS t(line, ord)
            WHERE btrim(t.line) <> ''
         ),
         '[]'::jsonb
       )
 WHERE p.goals = '[]'::jsonb;

-- Review date seeded from the plan's last touch, so plans that have been idle
-- for longer than their cadence are surfaced as "due for review" immediately.
UPDATE public.psych_care_plans
   SET next_review_date = (updated_at + (review_cadence_days * interval '1 day'))::date
 WHERE next_review_date IS NULL;

COMMENT ON COLUMN public.psych_care_plans.goals IS
  'SMART goal objects: {id, title, target_date, status: active|in_progress|achieved|discontinued, baseline_metric, target_metric}. Seeded from legacy therapy_goals lines in 0118.';
