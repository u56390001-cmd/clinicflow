-- 0083 — Intake & History tab UX (presenting concern, additional notes, per-field provenance)
--
-- The Intake & History tab is restructured around an accordion of clean clinical
-- sections. The pre-visit form and the clinician both write into `psych_intake`;
-- the "AI Extracted History" review queue stages AI proposals in a separate
-- table until approved. To show, for every field, where the value came from and
-- whether a clinician touched it afterwards, each column gets an entry in a new
-- `field_provenance` JSON map, e.g.
--
--   {
--     "stressors":               { "source": "ai", "status": "updated", "label": "Session 2026-03-15" },
--     "previous_therapy_history": { "source": "patient", "status": "approved", "label": null },
--     "family_mental_health_history": { "source": "clinician", "status": "approved", "label": null }
--   }
--
-- It is derived, never ignored: the JSON is just a display aid and the plain
-- text columns remain the source of truth.

alter table public.psych_intake
  add column if not exists presenting_concern            text,
  add column if not exists presenting_concern_duration   text,
  add column if not exists presenting_concern_severity   text,
  add column if not exists presenting_concern_words      text,
  add column if not exists additional_clinical_notes     text,
  add column if not exists field_provenance              jsonb not null default '{}'::jsonb;

comment on column public.psych_intake.presenting_concern is
  'What brought the patient in the main concern, in brief clinical terms.';
comment on column public.psych_intake.presenting_concern_duration is
  'How long the presenting concern has been present (e.g. "3 months").';
comment on column public.psych_intake.presenting_concern_severity is
  'The clinician''s severity judgement for the presenting concern.';
comment on column public.psych_intake.presenting_concern_words is
  'The presenting concern in the patient''s own words.';
comment on column public.psych_intake.additional_clinical_notes is
  'Free clinical notes associated with the intake history.';
comment on column public.psych_intake.field_provenance is
  'Per-field JSON map: { source: patient|ai|clinician, status: approved|updated, label } used only for display.';

-- rollback
-- alter table public.psych_intake
--   drop column if exists presenting_concern,
--   drop column if exists presenting_concern_duration,
--   drop column if exists presenting_concern_severity,
--   drop column if exists presenting_concern_words,
--   drop column if exists additional_clinical_notes,
--   drop column if exists field_provenance;