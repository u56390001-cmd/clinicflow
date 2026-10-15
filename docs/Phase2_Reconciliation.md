# Phase 2 Reconciliation — Core Patient & EHR Infrastructure

Status of `docs/phase_2_prompt.md` against the ClinicFlow codebase.

The Phase 2 prompt is written as if starting from an empty repository: it defines
greenfield migrations, `app/actions/*`, `lib/validations/*`, and component
filenames that do not match what already ships. ClinicFlow already has a mature,
hardened implementation of everything the prompt asks for (patients,
appointments, encounters, RLS, server actions, booking UI, record timeline). The
correct move was therefore **reconcile + fill gaps**, not recreate.

This document maps each prompt requirement to its real home, records the
intentional divergences and why they are safe, and lists what this pass changed.

---

## Verdict

| Prompt area | Status | Where it lives |
| --- | --- | --- |
| Patients / appointments / encounters schema | Already exists (superset) | migrations `0005`, `0017`, `0023`, `0024`, `0029`… |
| Multi-tenant RLS | Already exists (hardened) | `is_clinic_member()` + `0064`–`0072` |
| Patient server actions + Zod | Already exists | `lib/actions/patients.ts`, `lib/validation/schemas.ts` |
| Appointment server actions + Zod | Already exists | `lib/actions/appointments.ts` |
| Patient directory (search + pagination) | Already exists | `patient-list-pane.tsx` + patients page |
| Appointment scheduling UI + slot picker | Already exists | `appointment-form.tsx`, `appointment-manager.tsx` |
| Optimistic feedback on booking | **Added this pass** | `appointment-form.tsx` (`useOptimistic`) |
| Record/timeline view | **Added this pass** | `components/patients/record/encounter-timeline.tsx` |
| `address` jsonb + `gender='unknown'` | **Added this pass** | migration `0088` |
| RLS verification test | Already exists | `supabase/tests/rls_penetration_test.sql` |

---

## 1. Database Schema & RLS

### Enums
- **`appointment_status`** — the prompt asks for
  `scheduled, confirmed, in_progress, completed, cancelled, no_show`.
  The live enum is `pending, confirmed, completed, cancelled, no_show`.
  - `pending` is our `scheduled`.
  - **No `in_progress` value.** In-progress is modelled by the `visits` row
    (check-in / queue, migration `0023`), which is the authoritative "patient is
    here and being seen" signal. Adding a second `in_progress` state on
    `appointments` would create two sources of truth for one fact. This is a
    deliberate divergence, not a gap.
- **`gender_type`** — the prompt asks for an enum
  `male, female, other, unknown`. We use `patients.gender text` guarded by a
  CHECK constraint and widened that constraint to include `'unknown'`
  (migration `0088`). Text + CHECK is behaviourally equivalent and avoids an
  enum migration that would ripple through every cast in the app.

### Tables
- **`patients`** — exists (33 columns) and is a superset in the dimensions that
  matter: single `name`, `date_of_birth`, `phone`, `email`, `city`, plus CRM,
  billing and AI fields added by later migrations.
  - The prompt's `first_name` / `last_name` split was **not** adopted: the app
    stores a single `name` everywhere and a split would be a large, purely
    cosmetic migration with real regression risk.
  - The prompt's `address jsonb` **was** added (migration `0088`), constrained to
    an object of at most 4 KB.
  - The prompt's `medical_history jsonb` is **not** added as a blob: structured
    history already lives in dedicated intake/history structures that the patient
    record renders. A parallel jsonb column would duplicate it.
- **`appointments`** — exists (14 columns). Divergences:
  - Provider column is **`doctor_id`** (FK to `doctors(clinic_id, id)`), not
    `provider_id` referencing `clinic_members`. Doctors are first-class rows here.
  - Scheduling columns are the clinic's local `date`/time plus derived values
    rather than only `start_time`/`end_time`; booking RPCs enforce overlap rules.
- **`medical_records`** — no such table. Encounters map to the existing clinical
  triad: **`visits`** (encounter + `chief_complaint`/`diagnosis`) and
  **`prescriptions`** (treatment, `diagnosis` / `custom_diagnosis`), plus
  **`vitals`**. This is the live source of truth for the record timeline.

### RLS
- Every tenant table enables RLS with `public.is_clinic_member(clinic_id)` (and
  role-scoped variants). This is **stronger** than the prompt's inline
  `clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())`:
  migrations `0064`–`0072` specifically forbid the naive subquery pattern
  (privilege leaks / recursion) and route everything through `SECURITY DEFINER`
  helpers. The prompt's naive pattern was intentionally **not** introduced.

---

## 2. Server Actions & Validation

- Prompt: `app/actions/patients.ts`, `app/actions/appointments.ts`.
  Real: **`lib/actions/patients.ts`**, **`lib/actions/appointments.ts`** (plus
  `lib/booking-service.ts` shared by staff and public booking).
- Prompt: `lib/validations/patient.ts` (plural dir).
  Real: **`lib/validation/schemas.ts`** (singular dir) alongside
  `booking-settings.ts`, `intake-schema.ts`, `ocr-intake-schema.ts`.
- Validation is **Zod** (v4), exactly as the prompt requires. Forms use the
  platform's `useActionState` + server actions rather than React Hook Form /
  `@hookform/resolvers`; behaviour is the same and the rest of the app is built
  this way.

---

## 3. UI Components

- Prompt: `components/patients/patient-table.tsx` → real
  **`components/patients/patient-list-pane.tsx`** + `patients-workspace.tsx`.
  Search-by-name/phone and **server-side pagination** (`PATIENT_PAGE_SIZE`,
  `?page=` in the URL; the server page owns filtering/paging) both exist.
- Prompt: `components/appointments/booking-drawer.tsx` → real
  **`components/appointments/booking-modal.tsx`** +
  **`components/appointments/appointment-form.tsx`** (provider selection,
  dynamic available-slot picker via `fetchAvailableSlots`, emergency mode).
- Prompt: `components/records/record-timeline.tsx` → real **Overview tab of the
  patient record**, now backed by
  **`components/patients/record/encounter-timeline.tsx`** (see below).

---

## 4. Execution Checklist

1. **Run migration** — done via the Supabase CLI against the linked project
   (e.g. `supabase db query --linked -f supabase/migrations/0088_*.sql`).
2. **Type generation** — types are hand-maintained in `types/database.ts`
   (the file the whole app imports), not generated to `types/supabase.ts`.
3. **Form components** — use server actions + Zod (see §2), not RHF.
4. **RLS verification** — `supabase/tests/rls_penetration_test.sql` covers
   cross-tenant isolation; `phase1_migration_test.sql` and
   `assessment_scoring_safety_test.sql` cover later phases.

---

## Changes made in this pass

### Migration `0088_patient_address_gender_unknown.sql`
- `patients.address jsonb NOT NULL DEFAULT '{}'::jsonb`, constrained by
  `patients_address_object_check` (`jsonb_typeof(address) = 'object'` and
  `pg_column_size(address) <= 4096`).
- Relaxed `patients_gender_check` to allow `'unknown'`.
- Applied to the linked DB and verified (constraints present; a transactional
  insert with `gender='unknown'` and an address object succeeded, then rolled
  back with zero leftover rows).

### Gender `'unknown'` propagated to consumers
`types/database.ts` (Row/Insert/Update), `lib/validation/schemas.ts`,
`lib/actions/appointments.ts`, `lib/booking-service.ts`,
`components/patients/patient-form.tsx`,
`components/patients/record/record-banner.tsx`,
`components/patients/record/prescription-workspace.tsx`,
`components/appointments/appointment-form.tsx`,
`components/appointments/appointment-manager.tsx`.

### Structured address
- `PatientAddress` type in `types/database.ts`; `address` on the `Patient` row.
- `patientSchema` gains `addressLine1/2`, `addressState`, `addressPostalCode`,
  `addressCountry`; `lib/actions/patients.ts` gains `addressFields()` and writes
  `address` on create / create-and-get-id / update (mirrors `city` into
  `address.city`).
- `components/patients/patient-form.tsx` renders the structured address block.

### Record timeline
- New `components/patients/record/encounter-timeline.tsx` renders past visits
  newest-first (date, token, doctor/specialty, diagnosis, key vitals).
- Wired into `components/patients/record/overview-tab.tsx`, matching the
  documented intent that Overview "continues into the full visit timeline"
  (`lib/patient-directory.ts`). The stale comment claiming no timeline was
  corrected.

### Optimistic booking feedback
- `components/appointments/appointment-form.tsx` uses `useOptimistic` to show an
  immediate "booking receipt" (patient, service, date/time) while the server
  confirms. It registers inside the create action's transition, so it clears on
  settle: a rejection swaps it for the existing error alert; success closes the
  modal. The edit path and the `useActionState` pending/error contract are
  unchanged.
- A full list-level optimistic insert into `appointment-manager.tsx` was
  **intentionally not** done: its today/queue/table lists are derived from
  server props through many memos, and the change carried real regression risk
  for little visible gain (the modal closes and `router.refresh()` reconciles).
  The form-level receipt delivers the feedback with a one-file blast radius.

---

## Verification

- `npx tsc --noEmit` — clean.
- `npx eslint` on touched files — clean.
- Migration `0088` constraints/behaviour verified against the linked database.

## Open items / follow-ups

- Phase 1 clinical sign-off is still pending (see
  `docs/Phase1_Clinical_Signoff_Checklist.md`).
- If an explicit `in_progress` appointment state is ever required, derive it from
  `visits` rather than adding a parallel enum value.
