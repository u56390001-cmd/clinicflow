# INIT PROMPT — MedBook AI
## Phase 18: Doctor Waiting List, Consultation Flow & Prescription
**Reference documents:** Base PRD (Phases 1–9) + `PRD-Feature-Expansion-v1.1.md` (Phases 10–16) + the Clinic Patient Queue/Consultation/Billing Feature Specification — **Part 2 of 3**: Consultation + Prescription. Payment collection/Billing/Receipts is Phase 19.
**Target tool:** OpenCode
**Prerequisite:** Phase 17 (Check-in, Waiting Queue, Token, Vitals capture) complete and verified — `visits` table exists with correct status transitions and queue ordering.

---

## 0. IMPORTANT — READ BEFORE STARTING
- Do **not** rebuild the queue/token logic from Phase 17 — this phase consumes it (reads "who is first eligible," transitions `visits.status`).
- Do **not** implement payment collection or billing — Phase 19.
- **Prescription/EMR scope reminder**: the base PRD explicitly excludes full EMR from MVP. This phase implements the specific prescription-creation workflow described in the feature spec (structured fields: chief complaint, findings, diagnosis, medicines, lab orders, follow-up) — this is a bounded, specific feature, not an invitation to build a general clinical-notes/EMR system beyond what's specified. Stay within the spec's exact field list (Section 8 below).
- Before writing any code: inspect the current `visits` table/status model from Phase 17, confirm there's no existing prescription/EMR model already partially built anywhere in the codebase (the base PRD's MVP boundary suggests there shouldn't be, but confirm), and inspect the existing Doctors dashboard area (Phase 10) where this waiting list/consultation UI will live. Report findings before implementing.

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect from this project.

## 2. OBJECTIVE
Give doctors a waiting-list view of checked-in patients, a Start Consultation → view patient details/vitals → create prescription → Next Patient workflow, plus reusable prescription templates and a print-preview.

## 3. SCOPE

### A. Doctor Waiting List
- A doctor-facing view (e.g. `/app/consultation` or integrated into the Doctors area from Phase 10) showing only `visits` where `status IN ('waiting', 'in_consultation')` **and** check-in is complete — per the spec's explicit rule: merely scheduled/not-yet-checked-in appointments must **not** appear here as active waiting patients.
- If the clinic has multiple doctors (Phase 10), scope this view to the logged-in doctor's own patients (if `visits.doctor_id` is set) — for a single-doctor clinic or unassigned visits, show all.
- **Start Consultation** button is shown/enabled **only** for the single first-eligible patient (per Phase 17's queue-position logic) — every other waiting patient shows their position but no active Start Consultation action.

### B. Start Consultation
- Clicking Start Consultation on the eligible patient:
  1. Sets `visits.status = 'in_consultation'`, `consultation_started_at = now()`.
  2. Removes them from "eligible to start" (they're now the active consultation).
  3. Correctly promotes the queue's understanding of "first eligible" — no other patient becomes eligible while someone is `in_consultation` for that doctor (if multi-doctor, this is scoped per-doctor; if single-doctor clinic, only one `in_consultation` visit at a time clinic-wide).
- Doctor now sees the full consultation screen: patient details, vitals recorded in Phase 17 (view + ability to add/update — reuse Phase 17's vitals data model, add doctor-side edit capability), and the prescription form.

### C. Prescription Creation
Implement the exact field set from the specification — no more, no less:
- Patient details (collapsible patient-information section — reuse existing patient data display, don't re-enter).
- Chief complaint
- Clinical/examination findings
- Diagnosis (+ custom diagnosis free-text option)
- Multiple medicines via "Add Medicine" — each medicine entry: name, route, form, frequency, duration, unit, instructions.
- Lab test orders (simple structured list — test name, notes; this is an **order/request**, not an actual lab-management system, which remains explicitly out of scope per the base PRD).
- Follow-up date + follow-up notes.
- Doctor notes.
- Save persists this as a `prescriptions` record linked to the `visit_id`/`patient_id`/`doctor_id`.

### D. Prescription Templates
- "Save as Template" on a completed/in-progress prescription — stores the reusable field configuration (diagnosis, medicines, instructions, etc. — not patient-specific fields like chief complaint/patient details) as a `prescription_templates` record, scoped to the doctor (or clinic, per your judgment — a template is more naturally per-doctor since prescribing patterns are individual, but confirm this fits the project's existing per-doctor vs per-clinic data patterns).
- "Load Template" on a new prescription populates the applicable fields (medicines, diagnosis, lab orders, instructions) without requiring manual re-entry — patient-specific fields (chief complaint, patient details) remain untouched/blank for the doctor to fill per-visit.

### E. Prescription Printing
- "Print" opens a print-preview representation of the completed prescription (clinic header/branding, patient info, all prescription fields formatted clearly, doctor signature area).
- Check the existing project for any print/PDF infrastructure already established (e.g. the `pdf` skill used elsewhere for document generation) and reuse it rather than building a new printing mechanism from scratch — a clean, print-optimized HTML view triggering the browser's native print dialog is also an acceptable, simple approach if no existing PDF infrastructure fits naturally.

### F. Next Patient
- "Next Patient" (or the receptionist-driven equivalent for clinics not using full doctor-side EMR flow, per the spec's fallback):
  1. Completes the current consultation: `visits.status = 'completed'`, `completed_at = now()`.
  2. Identifies the next `waiting` visit (lowest `queue_position` for this doctor/clinic).
  3. Promotes that visit to `in_consultation` automatically.
  4. Updates the Doctor Waiting List and any Phase 17 queue views consistently — both must reflect the new state immediately (and correctly on refresh, server-authoritative per Phase 17's established discipline).
- If no waiting patients remain, the queue simply becomes empty — no error state, handle gracefully.

## 4. DATABASE WORK REQUIRED
- Migration: `prescriptions` — `id, visit_id, patient_id, doctor_id, clinic_id, chief_complaint, findings, diagnosis, custom_diagnosis, medicines (jsonb array: {name, route, form, frequency, duration, unit, instructions}), lab_orders (jsonb array: {test_name, notes}), follow_up_date, follow_up_notes, doctor_notes, created_at, updated_at`.
- Migration: `prescription_templates` — `id, doctor_id (or clinic_id, per Section 3D's decision), name, diagnosis, custom_diagnosis, medicines (jsonb), lab_orders (jsonb), doctor_notes, created_at, updated_at`.
- RLS scoped via `clinic_members` for both, following the established pattern; if templates are doctor-scoped, further restrict to the owning doctor's `user_id` for write access if doctors have individual login accounts (Phase 10 made `doctors.user_id` nullable — confirm how this affects template ownership if a doctor has no login).

## 5. DEFINITION OF DONE
- [ ] Doctor Waiting List correctly shows only checked-in, waiting/in-consultation patients — never merely-scheduled ones.
- [ ] Start Consultation is offered only to the single first-eligible patient, correctly scoped per-doctor if multi-doctor.
- [ ] Consultation screen shows real patient details and Phase 17 vitals, with doctor-side add/update capability.
- [ ] Prescription form implements exactly the specified field set, including multiple medicines via Add Medicine.
- [ ] Save/Load Template works correctly, populating the right fields without requiring manual re-entry.
- [ ] Print preview renders a clean, complete representation of the prescription.
- [ ] Next Patient correctly completes the current visit and promotes the next waiting patient, keeping all queue views consistent.
- [ ] Cross-tenant and cross-doctor isolation verified.

## 6. CONSTRAINTS
- Do not implement payment/billing — Phase 19.
- Do not expand beyond the specified prescription field set into a broader EMR/clinical-notes system.
- Do not duplicate Phase 17's queue/token logic — read and transition its existing `visits` state.
- Do not build real lab-result management — lab orders here are a request/order list only.
- Do not disable RLS.

## 7. PROCESS
1. Complete the Section 0 inspection and report findings before writing code.
2. Propose the exact `prescriptions`/`prescription_templates` schema and the Doctor Waiting List/consultation UI structure before implementing.
3. Implement: migrations → Doctor Waiting List (scoped correctly) → Start Consultation transition → consultation screen (patient details + vitals) → prescription form (full field set) → Save/Load Template → Print preview → Next Patient transition.
4. Provide a verification checklist matching the spec's acceptance-gate items 13–24: doctor sees patient in waiting list; only first patient can start consultation; doctor starts consultation and patient becomes In Consultation; doctor accesses patient details/vitals; doctor creates a prescription with multiple medicines and optional lab/follow-up info; doctor saves and loads a template correctly; prescription previews/prints correctly; doctor advances to Next Patient; current visit becomes Completed; next waiting patient becomes In Consultation automatically; queue continues correctly until all patients are completed; waiting queue correctly clears.

Confirm your understanding and the Section 0 inspection findings back to me before writing code. Do not start Phase 19 (Payment Collection + Billing + Receipts) — that prompt comes next, once this phase is verified.
