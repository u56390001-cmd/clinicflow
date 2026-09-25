# INIT PROMPT — MedBook AI
## Phase 20: Upgrade "Add Doctor" — Full Profile, Fees, Slot-Generation Availability & Per-Doctor Vitals Configuration
**Target tool:** OpenCode
**Reference documents:** Base PRD + `PRD-Feature-Expansion-v1.1.md` Phase 10 (Doctor Management — already built) + this document's detailed "Add New Doctor" modal specification + reference screenshots (`t17`–`t21`).
**Design authority:** `design_system_profile.json` — every violet/blue color in the reference must map to MedBook AI's teal (`colorPalette.brand.primary`).

---

## 0. IMPORTANT — READ BEFORE STARTING: TWO CRITICAL RECONCILIATIONS

This upgrade changes two things that were already decided differently in earlier phases. Both must be handled carefully — audit first, propose a migration approach, confirm before implementing destructively.

### Reconciliation A — Vitals move from clinic-wide-fixed to per-doctor-configurable
An earlier prompt in this project (the Appointments master prompt, building on Phase 17) specified **one fixed vitals field set** (Height, Weight, BMI, Systolic/Diastolic BP, Pulse, Temperature, SpO2, Respiratory Rate) used clinic-wide for every visit's vitals capture. This new spec reveals the **actual intended design**: vitals tracking is **configured per doctor** — each doctor's profile selects which vitals (from the same standard checkbox list, plus custom vitals) apply to *their* patients, with a configurable display order.
- Treat this new per-doctor spec as authoritative going forward.
- The standard checkbox options remain the same underlying set (Height/Weight/BMI/BP/Pulse/Temp/SpO2/RR) — nothing there was wrong, it just needs to become **selectable per doctor** rather than globally fixed.
- Migration approach: add a `doctor_vitals_config` (or a `vitals_config` jsonb column on `doctors`) storing which standard vitals are enabled for that doctor, any custom vitals they've defined, and display order. When Phase 17's vitals-capture UI (check-in/waiting) runs for a visit, it must now look up the **assigned doctor's** vitals configuration to decide which fields to render, falling back to a sensible default set if a doctor has no vitals configured yet (don't show an empty vitals form). Propose the exact migration/fallback behavior before implementing.

### Reconciliation B — "Multiple patients at once" consultation mode
The existing `checkSlotAvailability()` function (Phase 3, extended in Phase 10 for multi-doctor) assumes **one patient per time slot**. This new spec introduces a second mode: a doctor can instead offer **shared time windows** where multiple patients (up to a configured number) are booked into the same window and seen in order (e.g. 10:00–12:00, up to 6 patients).
- This is a genuinely significant extension, not a small tweak. Do not attempt to silently retrofit this into the existing single-patient-per-slot logic — instead:
  1. Add a `consultation_mode` field to `doctors` (`'single_slot'` | `'shared_window'`, default `'single_slot'` — so every existing doctor from Phase 10 continues behaving exactly as before, unaffected).
  2. For `'single_slot'` doctors, `checkSlotAvailability()` behaves exactly as it does today — **zero change**.
  3. For `'shared_window'` doctors, extend the availability/booking logic to check a **capacity count** rather than exact-slot occupancy: a window is available as long as fewer than `max_patients_per_window` appointments are already booked into it; booking into it doesn't block other patients from also booking that same window (up to the cap).
  4. This affects: slot generation (Section 3 below), `checkSlotAvailability()`, appointment creation, and how the Today/Queue view (Phase 17) orders multiple simultaneously-scheduled patients within a shared window (likely by booking order/check-in order rather than exact time).
  5. Propose the exact extension design before implementing — this touches code used by AI booking (Phase 5), widget booking (Phase 6), WhatsApp booking (Phase 13), and manual booking (Phase 15), so correctness here matters broadly. If full support for this mode across every booking channel is too large for this phase, it's acceptable to implement it correctly for dashboard/manual booking first and flag AI/widget/WhatsApp support as a fast-follow — confirm this scoping decision with me rather than silently doing a partial job everywhere.

Before writing any code, also audit: the current `doctors` table (Phase 10) and Add Doctor UI, the current `availability_rules`/`blocked_times` model (Phase 2/10), and the current vitals data model (Phase 17). Report exact current state before implementing.

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect from this project.

## 2. OBJECTIVE
Upgrade the "Add Doctor" flow (Phase 10) into the full, detailed modal specified below — profile/fees/contact fields, a slot-generation availability builder supporting both consultation modes, doctor signature (for prescriptions), and per-doctor vitals configuration.

## 3. SCOPE

### A. Modal Header
- Icon + title **"Add New Doctor"**, subtitle **"Create a new doctor profile with availability"**, close "X". Header band in `colorPalette.brand.primary` (teal, not the reference's violet/blue).
- Centered circular profile-photo upload (avatar placeholder + upload badge icon) — reuse the same Supabase Storage upload pattern already established for doctor photos in Phase 10, or website/gallery images from Phase 7, for consistency.

### B. Basic Information (left column) — extend `doctors` table
- Doctor Name* (already exists, Phase 10).
- **Years of Experience*** — new, integer.
- **Specialty*** — dropdown; confirm whether a specialty list/enum already exists anywhere (e.g. tied to the vitals-config-by-specialty idea mentioned loosely in the earlier research) — if not, implement as a simple configurable list (clinic-level or a reasonable default list of common specialties), not hardcoded per-doctor free text, so "Title" (below) can meaningfully depend on it.
- **Qualification / Degree*** — text input, 48-character limit with live counter.
- **Medical Registration Number*** — text input, helper text as specified.

### C. Contact & Details (right column)
- Email Address (optional), Phone Number (optional) — already likely present or trivially added to `doctors`.
- **Title*** — dropdown, **dependent on Specialty** (disabled/placeholder "Select specialty first" until Specialty is chosen, per the reference's dependent-field logic) — populate with sensible title options relevant to the chosen specialty (e.g. "Dermatologist" for Dermatology) — if no existing mapping data exists, implement a simple, reasonable specialty→title default mapping rather than an empty dead-end dropdown.
- **Professional Description** (optional) — textarea, 600-character limit with live counter, helper text noting it's shown to patients during booking (surface this on the AI widget/website's doctor info where relevant, per Phase 5/7's existing doctor-info display, if it makes sense to wire in now — otherwise store it and note it as a fast-follow display integration).
- **Doctor Signature** (optional) — image upload dropzone (PNG/JPG/JPEG, transparent background preferred), with Replace/Remove actions once uploaded — store via Supabase Storage; **this signature must be usable on prescription printing (Phase 18)** — confirm/wire this into Phase 18's prescription print-preview so a doctor's real uploaded signature appears there instead of a placeholder.

### D. Consultation Fees & Follow-up Rules
- **Consultation Fee (₹)*** — numeric, reuse/extend Phase 10's existing fee field if one exists.
- **Consultation Type** dropdown — Offline (In-Person Only) / Both (Offline & Online) / Online-Video, per the two source documents' slightly differing option sets — reconcile with Phase 15's existing `consultation_type` concept (`in_clinic`/`online`) rather than introducing an incompatible second concept; propose how "Both" is represented (likely: doctor supports both, and the *appointment's* own `consultation_type` field, already established, is chosen per-booking).
- **Follow-up Fee (₹)**, **Valid For** (numeric), **Period** (Day(s)/Week(s)/Month(s)) — new fields on `doctors`; a **dynamic rule banner** auto-computes and displays a sentence like *"Follow-up visits within {N} {period} will be charged ₹{fee} instead of ₹{consultation_fee}"* as the fields are filled in — this is display logic only, real enforcement of follow-up pricing during booking is a reasonable fast-follow if not trivial to wire into the booking flow immediately; note your scoping decision.

### E. Doctor Availability & Slots (the core, complex section)
1. **Consultation Mode** (radio cards): **"One patient at a time"** vs **"Multiple patients at once"** — this is `doctors.consultation_mode` from Reconciliation B above. If "Multiple," an additional field appears: max patients per window (e.g. "up to 6 patients").
2. **Select Working Days** — day-picker pills (Mon–Sun), plus a **"Same time slots for all selected days"** checkbox: when checked, one shared time-range/slot template applies to all selected days; when unchecked, render a separate sub-panel per selected day (e.g. tabs or stacked sections labeled "Monday," "Tuesday," etc.) each with its own independent time ranges/slots.
3. **Per-day (or shared) Time Range(s) + Slot Generation**:
   - Start Time / End Time pickers, with a "+ Add another time range" link (supports split shifts, e.g. morning + evening).
   - Slot Duration (minutes) input.
   - **"⚡ Generate Slots"** button — client-side (or a quick server call) computes evenly-divided slots from Start→End at the given duration and populates an editable list (Slot A: 09:00–09:30, Slot B: 09:30–10:00, etc.).
   - Each generated slot row: editable slot name, editable start/end time, delete (trash) icon.
   - **"+ Add Custom Slot"** — manually add a slot outside the generated pattern.
4. **Persistence**: on save, this UI's output must correctly populate/replace the doctor's `availability_rules` (Phase 2/10) — reconcile the "named slot" concept (Slot A/B/C) with the existing `availability_rules` schema (which is currently a simpler day-of-week + start/end range model, not named discrete slots) — propose whether to: (a) keep `availability_rules` as the coarse working-hours boundary and treat named slots as a separate, more granular `doctor_slot_templates` table that `checkSlotAvailability()` consults when present, falling back to the simpler range-based calculation when a doctor has no custom slot template, or (b) another approach — confirm before implementing, since this is a meaningful schema decision affecting the core booking function.

### F. Vitals Configuration (per Reconciliation A — now doctor-specific)
- **Basic Measurements** checkboxes: Height (cm), Weight (kg), BMI (kg/m²).
- **Vital Signs** checkboxes: Blood Pressure (mmHg), Pulse (bpm), Temperature (°F), SpO2 (%), Respiratory Rate (breaths/min).
- **Custom Vitals**: "+ Add Custom Vital" — lets the clinic/doctor define an additional named vital (e.g. "Blood Sugar," "Peak Flow") with a unit.
- **Display Order**: drag-to-reorder list of the selected vitals, controlling the order they appear in Phase 17's check-in vitals form and Phase 18's doctor consultation view for this doctor's patients.
- Persist to the `doctor_vitals_config` model from Reconciliation A; wire Phase 17/18's vitals UI to read this per-assigned-doctor configuration.

### G. Modal Footer
- Left: "🔒 All data is securely stored" trust text with a green shield icon.
- Right: **Cancel** (secondary/outline) and **Add Doctor** (primary teal, check icon) buttons.
- **Active toggle on the Doctors list** (post-creation): confirm this maps to Phase 10's existing `is_visible` field — when off, the doctor is hidden from AI/widget/WhatsApp booking surfaces exactly as Phase 10 already established; this reference document's description of this toggle matches Phase 10's existing behavior, so just confirm consistency rather than building a second concept.

## 4. DATABASE WORK REQUIRED
- Migration: extend `doctors` with — `years_of_experience`, `specialty`, `qualification`, `medical_registration_number`, `consultation_fee` (if not already present from Phase 10), `follow_up_fee`, `follow_up_valid_for`, `follow_up_period`, `professional_description`, `signature_url`, `consultation_mode`, `max_patients_per_window` (nullable, only relevant when `consultation_mode = 'shared_window'`).
- Migration: `doctor_vitals_config` (Reconciliation A) — `id, doctor_id, standard_vitals (jsonb array of enabled standard vital keys), custom_vitals (jsonb array of {name, unit}), display_order (jsonb array defining sequence)`.
- Migration/decision: doctor slot-template storage per Section 3E.4's chosen approach.
- All new fields additive/nullable — zero impact on existing doctors created before this phase.
- RLS: consistent with Phase 10's existing `clinic_members`-scoped pattern.

## 5. DEFINITION OF DONE
- [ ] Add Doctor modal implements every field/section above, correctly persisting to the extended `doctors` model.
- [ ] Specialty→Title dependent dropdown works correctly.
- [ ] Slot generation (time range + duration → generated editable slot list, custom slot addition, per-day or shared-across-days) works and correctly persists per the Section 3E.4 schema decision.
- [ ] Both consultation modes work correctly; existing single-slot doctors from before this phase are completely unaffected; shared-window doctors correctly allow multiple bookings into one window up to the configured cap.
- [ ] Per-doctor vitals configuration works, and Phase 17/18's vitals capture/display correctly reflects the assigned doctor's configuration (with a sensible fallback for doctors with no configuration yet).
- [ ] Doctor signature uploads correctly and appears on Phase 18's prescription print-preview.
- [ ] Active/`is_visible` toggle behavior confirmed consistent with Phase 10.
- [ ] All colors use MedBook AI teal, not the reference's violet/blue.
- [ ] Zero regression to any existing Phase 10 doctor or Phase 17/18 vitals/consultation functionality.

## 6. CONSTRAINTS
- Do not silently change `checkSlotAvailability()`'s behavior for existing single-slot doctors — this must remain byte-for-byte identical in outcome for them.
- Do not implement the shared-window mode partially/incorrectly across booking channels without explicitly confirming the scoping decision from Reconciliation B.5 with me first.
- Do not keep two competing vitals models (the old fixed clinic-wide set and the new per-doctor config) — fully migrate to the per-doctor model, with the old fixed set becoming the fallback default only.
- Do not disable RLS.

## 7. PROCESS
1. Complete the Section 0 audit (current `doctors`/availability/vitals state) and report findings.
2. Propose resolutions for both Reconciliations (A and B) and the Section 3E.4 slot-storage schema decision — confirm with me before implementing, since these are consequential architecture decisions.
3. Implement: migrations → modal UI (all sections) → slot-generation logic → consultation-mode-aware booking extension (scoped per the confirmed decision) → per-doctor vitals config + wiring into Phase 17/18 → signature upload + Phase 18 print integration.
4. Provide a verification checklist: create a new "single_slot" doctor with generated slots and confirm booking/availability works exactly as before this phase; create a "shared_window" doctor and confirm multiple patients can book the same window up to the cap and a booking beyond the cap is correctly rejected; configure per-doctor vitals for two different doctors and confirm each one's patients see the correct, different vitals form at check-in and on the consultation screen; upload a doctor signature and confirm it appears on a printed prescription for that doctor; confirm existing Phase 10 doctors (created before this phase) still work unaffected.

Confirm your Section 0 audit and your proposed Reconciliation A/B resolutions back to me before writing code.
