# INIT PROMPT — MedBook AI
## Phase 17: Patient Check-In, Waiting Queue, Token Assignment & Vitals Capture
**Reference documents:** Base PRD (Phases 1–9) + `PRD-Feature-Expansion-v1.1.md` (Phases 10–16) + this Feature Specification (Clinic Patient Queue/Consultation/Billing Workflow) — **Part 1 of 3**: Check-in + Queue only. Consultation/Prescription is Phase 18. Payment collection/Billing/Receipts is Phase 19.
**Target tool:** OpenCode
**Prerequisite:** Phase 10 (Doctor Management) complete. Phase 3/4 (Appointments/Patients) and Phase 8 (SaaS subscription billing) already exist — see the critical naming/scope boundary in Section 0.

---

## 0. IMPORTANT — READ BEFORE STARTING
This is a **significant scope addition** beyond what the base PRD and Feature Expansion Addendum originally planned as "Add Now" — queue/token management was explicitly marked 🟡 architecture-ready/future in the addendum. This has been a deliberate, confirmed decision to proceed now — implement it fully, but with the same discipline applied to every other phase in this project: extend existing entities, don't duplicate, don't break anything.

**CRITICAL NAMING/SCOPE BOUNDARY — read carefully before touching any billing-related code:**
This project already has a **"Billing" system from Phase 8** — that system is exclusively the **clinic/doctor's SaaS subscription payment to MedBook AI** (`subscription_plans`, `subscriptions`, `payment_methods`, `payment_submissions` tables). The **new** billing concept introduced by this feature spec (Phase 19, not this phase) is **patient consultation/visit billing** — completely different domain, different tables, different purpose. **Do not** reuse, rename, or extend Phase 8's tables for this. This phase (17) doesn't touch payment/billing logic directly but does need a `payment_status` awareness on the check-in flow — keep this as a simple state field for now, with actual payment collection deferred to Phase 19.

Before writing any code, inspect (per the spec's own Phase 1 — Inspect):
1. Existing `patients`, `appointments`, `doctors` (Phase 10) entities and their exact current fields/relations.
2. Existing appointment status model (Phase 3: `pending`/`confirmed`/`completed`/`cancelled`/`no_show`) — this phase introduces a **separate, additional** visit/queue-state dimension, not a replacement of appointment status.
3. Existing RLS patterns, existing UI component library/design tokens (`design_system_profile.json` + `design.md`), existing Doctors dashboard views.
4. Confirm there is no existing visit/encounter/queue model already partially built anywhere in the codebase.
Report findings before implementing.

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect from this project. Apply the same "reuse, extend, don't duplicate" discipline used in every prior phase.

## 2. OBJECTIVE
Implement: **Today's Appointments view → Check-In (with payment-state awareness) → Queue entry with Token → Waiting Queue (with reordering) → Vitals capture** — the front half of the full patient-flow workflow. Consultation, prescriptions, and payment collection are explicitly out of scope for this phase (Phases 18/19).

## 3. SCOPE

### A. Visit/Queue Data Model (new, additive — does not replace `appointments`)
```
visits (or patient_queue — pick the name that fits existing conventions):
  id, clinic_id, appointment_id (FK), patient_id, doctor_id (nullable, per Phase 10),
  status ('scheduled' | 'checked_in' | 'waiting' | 'in_consultation' | 'completed'),
  payment_status ('pending' | 'collected_pre' | 'collected_post' | 'not_required') — independent dimension, NOT hard-wired to `status`,
  token_number (int, recalculated on reorder — see below),
  queue_position (int, recalculated on reorder),
  checked_in_at, consultation_started_at, completed_at,
  created_at, updated_at
```
- One `visits` row per appointment-that-becomes-a-visit — created at check-in time, not at booking time. An appointment with no check-in yet has no visit row (this is how "scheduled but not checked in" is distinguished from "waiting," per the spec's explicit requirement in Section 6).
- `token_number`/`queue_position` are **per clinic per day** (reset daily — confirm this matches the spec's intent; token numbers are a daily sequence, not a global counter).
- RLS scoped via `clinic_members`, same established pattern.

### B. Today's / Upcoming Appointments View
- Extend the existing Appointments page (Phase 3/15) with a **"Today"** view showing today's appointments with their current workflow/payment state (not checked in / checked in / waiting / in consultation / completed) and the relevant next action button per state (Check In / View / etc.).
- Appointments from **any** `booking_source` (dashboard, AI widget, website, and — once Addendum Phase 13 is built — WhatsApp) must appear identically here — this view reads from the existing `appointments` table (all sources already write to it per the established schema) joined with `visits` if a visit exists yet.

### C. Check-In Flow
- From an appointment row (Today view), a "Check In" action opens a check-in flow:
  1. Confirm patient identity/details (reuse existing patient data — no re-entry of already-known info).
  2. **Payment scenario handling** (per the spec's three scenarios) — for this phase, only the **state-recording** part is in scope, not actual payment processing (that's Phase 19):
     - "Payment collected before check-in" → mark `payment_status = 'collected_pre'` (a simple confirmation checkbox/toggle at check-in time — actual charge/receipt logic is Phase 19).
     - "Payment collected after consultation" → mark `payment_status = 'pending'`, to be resolved later (Phase 19).
     - "Payment already completed during booking" → if such a flag/record already exists elsewhere (e.g. a prepayment captured during AI/website booking — check if this exists; if not, this scenario simply isn't reachable yet and can be deferred) → mark `payment_status = 'collected_pre'` accordingly.
  3. On confirmation, create the `visits` row (or activate it if a stub was somehow pre-created), set `status = 'checked_in'`, then immediately transition to `status = 'waiting'` with a newly assigned `token_number`/`queue_position` (append to the end of today's queue).
  4. **Prevent duplicate check-in**: if a visit already exists for this appointment with `status` beyond `scheduled`, the Check-In action must not be offered again / must be idempotent (clicking it again should not create a second visit or duplicate token).

### D. Waiting Queue
- A queue view (could be part of the Today Appointments view, or a dedicated `/app/queue` page — propose the cleaner option) showing all of today's `visits` in `waiting` or `in_consultation` status, ordered by `queue_position`.
- Only the **first** `waiting` patient is eligible for "Start Consultation" (the actual Start Consultation action itself is Phase 18's doctor-facing feature — this phase just needs to correctly compute and expose "who is first in queue" as data/state that Phase 18 will consume).
- **Reordering**: receptionist can move a waiting patient to the top of the queue. On reorder:
  - `queue_position` values recalculate for all affected `waiting` visits.
  - `token_number` recalculation: confirm with the spec's intent — token numbers are typically assigned at check-in and don't change, while **queue position/order** is what changes on reorder (a patient keeps their token but moves up in serving order). Implement it this way unless clear evidence in the existing project suggests otherwise — flag back if ambiguous rather than guessing destructively.
  - This must be **atomic** (a single transaction/RPC updating all affected rows' positions together) — per the spec's explicit concurrency requirement, prevent two simultaneous reorders from producing an inconsistent queue.

### E. Vitals Capture
- Check whether the existing project has any doctor/specialty-based vitals configuration already (per the spec's instruction: use existing config architecture if available, do not invent specific vital fields otherwise).
- If no existing vitals config exists: implement a simple, generic vitals form (e.g. blood pressure, temperature, pulse, weight, height — standard basic vitals) attached to the `visits` record, recordable by receptionist during the waiting/check-in step. Keep the field set minimal and standard — do not invent an elaborate vitals schema.
- Doctor's ability to view/add/update vitals during consultation is Phase 18's scope — this phase only needs the data model and the receptionist-side capture UI.

## 4. CONCURRENCY & SAFETY (mandatory, matches the spec's explicit requirements)
- Prevent duplicate check-ins for the same appointment (idempotent check-in action).
- Prevent duplicate/conflicting queue positions (atomic reorder operation).
- All queue-mutating operations (check-in, reorder) must be server-authoritative — client-side optimistic UI is fine for responsiveness, but the source of truth is always the server/DB state, and a page refresh must always reflect the correct, current server state (no client-only queue state that can drift from reality).

## 5. DATABASE WORK REQUIRED
- Migration: `visits` (or `patient_queue`) table as specified in Section 3A, RLS scoped via `clinic_members`.
- Migration: `vitals` table (or a `vitals_json` column on `visits` if that fits existing conventions better — confirm which pattern the project already prefers for semi-structured clinical-adjacent data): `id, visit_id, recorded_by_user_id, blood_pressure, temperature, pulse, weight, height, recorded_at` (adjust field set per Section 3E's findings).
- Indexes: `clinic_id + visit date` for efficient "today's queue" queries; `appointment_id` on `visits` for lookup.

## 6. DEFINITION OF DONE
- [ ] Today's Appointments view shows real appointments (all booking sources) with correct current workflow state and next action.
- [ ] Check-in works, is idempotent (no duplicate visits/tokens on repeat clicks), and correctly records the payment-state scenario.
- [ ] Check-in correctly creates a `waiting` visit with a token and queue position.
- [ ] Waiting Queue view correctly orders patients and correctly identifies the single first-eligible patient.
- [ ] Reordering works, is atomic, correctly recalculates queue position (and token per the Section 3D decision), and correctly updates who's "first eligible."
- [ ] Vitals can be recorded during check-in/waiting and are correctly attached to the visit record.
- [ ] Cross-tenant isolation verified for all new tables.
- [ ] Refreshing the page at any point in this flow shows correct, server-authoritative state — no client-state drift.

## 7. CONSTRAINTS
- Do not build consultation, prescription, or payment-collection/billing logic — Phases 18/19.
- Do not touch or rename Phase 8's SaaS-subscription billing tables — this is a completely separate billing domain (Phase 19, new tables).
- Do not replace or overload the existing `appointments.status` enum — `visits.status` is a separate, additional state dimension.
- Do not invent elaborate vitals fields beyond simple, standard ones unless an existing project-specific vitals config already exists.
- Do not disable RLS.

## 8. PROCESS
1. Complete the Section 0 inspection and report findings before writing code.
2. Propose the exact `visits`/vitals schema and the check-in/queue/reorder API design before implementing.
3. Implement: migrations → Today's Appointments view → check-in flow (with idempotency + payment-state recording) → waiting queue view + first-eligible-patient logic → atomic reorder operation → vitals capture UI.
4. Provide a verification checklist matching the spec's acceptance-gate items 1–12: appointment appears under Today; check-in works and respects each payment scenario; duplicate check-in is blocked; check-in creates a token; patient appears in waiting queue; vitals can be recorded; reordering correctly recalculates position and re-identifies the first eligible patient; concurrent reorder attempts don't corrupt queue state; page refresh mid-flow shows correct state; cross-tenant isolation confirmed.

Confirm your understanding and the Section 0 inspection findings back to me before writing code. Do not start Phase 18 (Consultation + Prescription) — that prompt comes next, once this phase is verified.
