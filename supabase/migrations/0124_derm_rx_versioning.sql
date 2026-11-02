-- =============================================================================
-- 0124 — Dermatology: prescription versioning & lock (Phase 5 Approve & Lock)
-- =============================================================================
-- WHY
--   The prescription draft is autosaved in place today, which means a
--   *finalized* prescription can still be edited by any clinic member with
--   no trace. EMR-grade review needs:
--   * a draft-vs-final state so the Review step can approve/lock an Rx;
--   * a version number so approving an edit to a locked Rx produces an
--     auditable successor row (version +1) instead of mutating history;
--   * who/when locked it, plus a frozen jsonb `snapshot` of the approved
--     content so reprints always show exactly what was prescribed.
--
-- WHAT
--   derm_prescriptions:
--     status        text  not null default 'draft'  ('draft' | 'final')
--     version       integer not null default 1     (bumped by the app on
--                                                    supersede/re-approve)
--     finalized_at  timestamptz                    (null while draft)
--     snapshot      jsonb                          (frozen approved payload)
--
-- SAFETY
--   * Additive only — re-runnable (`if not exists`), no existing data is
--     rewritten. Existing rows stay 'draft', so current in-workspace Rx
--     behaviour (edit-in-place) is untouched until the app opts in.
--   * CHECK constraint keeps status values sane.
--   * No RLS change: column set already flows through specialty_rls policies.
-- =============================================================================

alter table public.derm_prescriptions
  add column if not exists status text
    not null default 'draft'
    constraint derm_prescriptions_status_check
      check (status in ('draft', 'final'));

alter table public.derm_prescriptions
  add column if not exists version integer
    not null default 1
    constraint derm_prescriptions_version_check
      check (version >= 1);

alter table public.derm_prescriptions
  add column if not exists finalized_at timestamptz;

alter table public.derm_prescriptions
  add column if not exists snapshot jsonb;

-- Faster history filtering: the tab lists drafts vs finalized Rx by clinic.
create index if not exists derm_prescriptions_clinic_status_idx
  on public.derm_prescriptions (clinic_id, status, created_at desc);

notify pgrst, 'reload schema';

-- ROLLBACK
-- drop index if exists derm_prescriptions_clinic_status_idx;
-- alter table public.derm_prescriptions drop column if exists snapshot;
-- alter table public.derm_prescriptions drop column if exists finalized_at;
-- alter table public.derm_prescriptions drop column if exists version;
-- alter table public.derm_prescriptions drop column if exists status;
