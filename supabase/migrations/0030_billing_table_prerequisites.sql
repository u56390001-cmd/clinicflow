-- ============================================================================
-- 0030 — Billing transactions table prerequisites (Phase 6)
--
-- Three fixes the transactions table cannot be built without:
--
--   1. `patient_bills` has no foreign key to `patients` or `visits`. Every
--      other table in the schema got a composite (clinic_id, x) FK — 0025
--      missed both. PostgREST resolves `select=*,patients(...)` from
--      pg_constraint, so the embeds in `lib/patient-billing-queries.ts` fail
--      with PGRST200 ("Could not find a relationship"). Both queries throw,
--      which means /app/patient-billing currently 500s.
--
--   2. `visits` has no unique constraint on (clinic_id, id), so the composite
--      FK in (1) has nothing to point at.
--
--   3. `app_event_logs.category` rejects 'billing', so the Waive/Cancel audit
--      row fails with 23514.
--
-- Nothing here changes existing data. (1) and (2) only add constraints; (3)
-- widens one CHECK.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Pre-flight: these must both return zero rows, or the FKs below will fail.
--
-- A non-zero count is cross-clinic contamination — a bill pointing at another
-- clinic's patient or visit — which is exactly what the missing constraints
-- allowed. Investigate before forcing the constraint; do not delete blindly.
--
--   select b.id, b.clinic_id, b.patient_id
--   from public.patient_bills b
--   left join public.patients p
--     on p.clinic_id = b.clinic_id and p.id = b.patient_id
--   where p.id is null;
--
--   select b.id, b.clinic_id, b.visit_id
--   from public.patient_bills b
--   left join public.visits v
--     on v.clinic_id = b.clinic_id and v.id = b.visit_id
--   where b.visit_id is not null and v.id is null;
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1. visits: unique (clinic_id, id)
--
-- The referenced side of a composite FK needs a unique constraint. `patients`,
-- `services` and `doctors` all carry the same one for the same reason; `visits`
-- was the odd one out because nothing had needed to reference it yet.
-- ----------------------------------------------------------------------------
do $$
begin
  alter table public.visits
    add constraint visits_clinic_id_id_unique unique (clinic_id, id);
exception
  when duplicate_object then null;
  when duplicate_table  then null;
end $$;

-- ----------------------------------------------------------------------------
-- 2. patient_bills: composite FKs to patients and visits
--
-- Composite rather than single-column so the referenced row is forced to be in
-- the SAME clinic as the bill. A plain `patient_id references patients(id)`
-- would let a bill in clinic A charge a patient in clinic B — the FK would be
-- satisfied and RLS, which filters on the bill's own clinic_id, would not
-- notice.
--
-- `visit_id` is nullable and manual bills leave it null. Under the default
-- MATCH SIMPLE, a composite FK with any NULL column is considered satisfied,
-- so manual bills pass without a partial constraint. This is the same
-- arrangement `patient_bills_clinic_doctor_fkey` (0029) already relies on.
--
-- No ON DELETE CASCADE for the patient: a paid bill is a financial record and
-- must not vanish because someone deleted a patient row. Deleting a patient who
-- has bills should fail loudly, which is the default (NO ACTION).
-- ----------------------------------------------------------------------------
do $$
begin
  alter table public.patient_bills
    add constraint patient_bills_clinic_patient_fkey
    foreign key (clinic_id, patient_id) references public.patients (clinic_id, id);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.patient_bills
    add constraint patient_bills_clinic_visit_fkey
    foreign key (clinic_id, visit_id) references public.visits (clinic_id, id)
    on delete set null;
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 3. app_event_logs.category += 'billing'
--
-- Waive and Cancel are destructive and irreversible from the UI: a waived bill
-- drops out of revenue, a cancelled one out of the ledger. Both need an audit
-- row naming the actor.
--
-- `app_event_logs` (0013) is the right home — it already carries clinic_id,
-- actor_user_id, severity and a jsonb bag, and its RLS restricts reads to
-- clinic admins, which is precisely who should see who waived what. But its
-- category CHECK only permits ('api','booking','email','auth'), so the insert
-- fails with 23514 before RLS is even consulted.
--
-- Dropping and re-adding is the only way to widen a CHECK. Both statements are
-- in one transaction, so no row can slip through the gap, and every existing
-- row satisfies the wider predicate by construction — it is a superset.
--
-- `billing_events` (0010) is deliberately not reused: that table is platform
-- SUBSCRIPTION billing. A clinic waiving a patient's consultation fee has
-- nothing to do with that clinic's own plan.
-- ----------------------------------------------------------------------------
alter table public.app_event_logs
  drop constraint if exists app_event_logs_category_check;

alter table public.app_event_logs
  add constraint app_event_logs_category_check
  check (category in ('api', 'booking', 'email', 'auth', 'billing'));

comment on table public.app_event_logs is
  'Operational event log: api/booking/email/auth failures, plus the billing '
  'audit trail for destructive bill actions (waive/cancel). AI conversations '
  'live in ai_conversation_logs; platform subscription billing in billing_events.';

-- ----------------------------------------------------------------------------
-- Manual verification
--
--   -- 1. All three FKs on patient_bills are present.
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.patient_bills'::regclass and contype = 'f'
--   order by conname;
--   -- expect: patient_bills_clinic_doctor_fkey, patient_bills_clinic_patient_fkey,
--   --         patient_bills_clinic_visit_fkey, patient_bills_clinic_id_fkey
--
--   -- 2. The embeds PostgREST needs now resolve. From the app, or via REST:
--   --    GET /rest/v1/patient_bills?select=id,patients(name),visits(token_number)
--   -- expect: 200 with nested objects, not PGRST200.
--
--   -- 3. Cross-clinic bills are now impossible. As clinic A, with a clinic B
--   --    patient id, this must raise 23503 rather than inserting:
--   insert into public.patient_bills (clinic_id, patient_id, total_amount)
--   values ('<clinic-A-id>', '<clinic-B-patient-id>', 100);
--   -- expect: ERROR 23503 patient_bills_clinic_patient_fkey
--
--   -- 4. Manual bills (visit_id null) still insert — MATCH SIMPLE.
--   insert into public.patient_bills (clinic_id, patient_id, visit_id, total_amount)
--   values ('<clinic-A-id>', '<clinic-A-patient-id>', null, 100);
--   -- expect: 1 row
--
--   -- 5. The category constraint accepts 'billing' and still rejects nonsense.
--   insert into public.app_event_logs (clinic_id, category, event, severity)
--   values (null, 'billing', 'constraint_smoke_test', 'info');
--   -- expect: 1 row
--   insert into public.app_event_logs (clinic_id, category, event)
--   values (null, 'not_a_category', 'should_fail');
--   -- expect: ERROR 23514 app_event_logs_category_check
--   delete from public.app_event_logs where event = 'constraint_smoke_test';
--
--   -- 6. Both bill statuses from 0029 exist (Waive/Cancel write these).
--   select enumlabel from pg_enum
--   where enumtypid = 'public.patient_bill_status'::regtype
--   order by enumsortorder;
--   -- expect: pending, paid, partially_paid, waived, cancelled
--
--   -- 7. As clinic STAFF, the audit log must not be readable
--   --    (app_event_logs_select_admin restricts SELECT to clinic admins).
--   select count(*) from public.app_event_logs where category = 'billing';
--   -- expect as staff: 0 rows, not an error
-- ----------------------------------------------------------------------------
