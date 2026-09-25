# INIT PROMPT — MedBook AI
## Phase 15: Manual Appointment & Service Booking (Receptionist/Walk-in)
**Reference documents:** Base PRD (Phases 1–9) + `PRD-Feature-Expansion-v1.1.md` Section 4.6
**Target tool:** OpenCode
**Prerequisite:** Phase 10 (Doctor Management) complete and verified. (Phases 11–14 are not hard dependencies for this phase — it can run in parallel/before them if prioritized differently, but doctor-awareness from Phase 10 is required.)

---

## 0. IMPORTANT — READ BEFORE STARTING
This phase has **no new AI logic and no new booking rules** — it's a dashboard-internal UI that calls the exact same validated booking pipeline already used by AI/widget/WhatsApp bookings, just without the conversational layer.
- Do **not** build a separate appointment-creation code path — reuse Phase 3's appointment-creation function (the same one Phase 5's `createAppointment` tool and Phase 13's WhatsApp booking call into), extended for doctor-awareness in Phase 10.
- Do **not** duplicate `checkSlotAvailability()` — call the existing function.
- Before writing any code: confirm the exact existing appointment-creation function signature (post-Phase 10 doctor extension) and the existing Appointments UI (Phase 3) — this phase adds a new entry point into that same logic, and may extend the existing Appointments page's "New Appointment" flow rather than building an entirely separate page.

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect from Phases 1–10 (and later phases if already built).

## 2. OBJECTIVE
Give clinic staff a fast, reliable way to manually book a consultation or a standalone service/diagnostic appointment for walk-in or phone patients — reusing all existing validation, double-booking protection, and doctor-awareness, with an "Emergency Mode" for rapid intake when full details aren't available yet.

## 3. SCOPE

### A. Manual Consultation Booking
- This likely already exists in some form from Phase 3 ("create appointment" in the dashboard) — audit first. This phase's job is to confirm/extend it to be doctor-aware (Phase 10) and add the specific fields below if missing:
  - Patient (existing patient search/select, or quick-create — reuse Phase 4's patient logic).
  - Doctor selection (if clinic has >1 visible doctor, per Phase 10 — otherwise skip this field entirely).
  - Service (existing services list).
  - Date/time (via the existing calendar/slot-picker UI, respecting `checkSlotAvailability()`).
  - **Consultation type**: `in_clinic` / `online` — add this field to the booking form if not already present (the underlying `appointments.consultation_type` column should already exist per the addendum's architecture-ready guidance from Phase 10, or add it now if it was deferred — confirm and add if missing; do not build any actual video infrastructure, this is a data field only).
  - `booking_source = 'dashboard'` (already correct/existing).

### B. Manual Service / Diagnostic Booking
- Same underlying flow as A, but framed around selecting a **service** first (e.g. "Book a diagnostic test") rather than starting from "book a consultation" — this is primarily a UI/entry-point distinction, not a different data model. If Phase 3's existing appointment creation already treats service selection as the natural first step, this may just need a UI entry point/label (e.g. a "New Service Booking" quick-action) rather than new backend logic — confirm and avoid over-building a second backend path for what is functionally the same appointment record.

### C. Emergency Mode
- A toggle on the manual booking form that relaxes required-field validation for rapid intake — e.g. only patient name is strictly required, other fields (exact service, doctor, detailed notes) can be filled in or corrected later.
- Implement as a **validation-mode flag** on the existing Zod schema (e.g. a conditional schema or a `.partial()` variant gated by the emergency-mode flag) — not a separate booking pathway/table. The resulting appointment record must still be valid and complete enough to appear correctly on the calendar and in patient history; "relaxed" means fewer required fields at entry time, not a different or lesser data model.
- Visually distinguish an emergency-mode-created appointment if useful for staff follow-up (e.g. a small badge/flag on the appointment indicating it needs detail completion) — optional nice-to-have, keep simple if included.

## 4. DATABASE WORK REQUIRED
- Confirm `appointments.consultation_type` exists (enum: `in_clinic`, `online`, default `in_clinic`) — add via migration if it wasn't already added in Phase 10's scope (Phase 10 flagged this as architecture-ready but didn't mandate building it — confirm current state and add now if missing, since this phase needs it).
- No other new tables expected — this phase is UI + validation-mode logic on top of existing schema.

## 5. DEFINITION OF DONE
- [ ] Manual consultation booking works, doctor-aware (Phase 10), respects `checkSlotAvailability()`, reuses existing appointment-creation logic (no duplicated backend path).
- [ ] Manual service/diagnostic booking works via the same underlying logic, with an appropriately labeled entry point.
- [ ] Consultation type field (`in_clinic`/`online`) present and stored, no video logic built.
- [ ] Emergency Mode correctly relaxes required fields while still producing a valid, complete-enough appointment record.
- [ ] No new/duplicated booking backend — confirmed by code review that this phase calls into Phase 3/10's existing function(s).
- [ ] Cross-tenant isolation unaffected (no new tables requiring new RLS beyond the `consultation_type` column, which inherits existing `appointments` RLS).

## 6. CONSTRAINTS
- Do not create a new appointment-creation function — extend/call the existing one.
- Do not duplicate `checkSlotAvailability()`.
- Do not build video consultation infrastructure — `consultation_type` is a field only.
- Do not weaken validation globally — Emergency Mode is an explicit, scoped exception, not a general loosening of the booking form's validation.

## 7. PROCESS
1. Audit the existing Phase 3 "create appointment" dashboard flow and the Phase 10 doctor-aware appointment-creation function; report exactly what already exists vs. what this phase needs to add.
2. Propose the UI changes (form fields, entry points for consultation vs. service booking, Emergency Mode toggle) before implementing.
3. Implement: `consultation_type` migration (if missing) → doctor-aware manual booking form (extend existing, don't rebuild) → service/diagnostic booking entry point → Emergency Mode validation logic.
4. Provide a verification checklist: book a normal consultation with full details via the dashboard; book with Emergency Mode (minimal fields) and confirm a valid appointment is still created; book a service/diagnostic appointment; confirm doctor selection appears only when the clinic has >1 visible doctor; confirm double-booking protection still applies in both normal and emergency mode; confirm the appointment appears correctly on `/app/calendar` and in the patient's history (Phase 4) in all cases.

Confirm your understanding and the Phase 3/10 audit findings back to me before writing code. Do not start Phase 16 (Google Review + QR) — I'll provide that init prompt once this phase is verified.
