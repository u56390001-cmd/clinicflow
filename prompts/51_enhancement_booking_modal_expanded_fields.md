# ENHANCEMENT PROMPT — Convert Appointment Booking to a Modal Popup + Expand Form Fields
**Target tool:** OpenCode
**Type:** UI/flow change (modal instead of page navigation) + form field additions. Reuses existing booking logic — extends, does not replace it.
**Reference:** `appo_2.jpg` — exact target design for the booking modal.

---

## 0. IMPORTANT — READ BEFORE STARTING

**Scope note on two new fields:** the target form includes **"Known Allergies"** and **"Medical Conditions"** — these are clinical/medical data fields. Earlier in this project (Phase 4 — Patients CRM), there was an explicit MVP boundary: *"store only the minimum information necessary for appointment management... do not add clinical/medical data fields."* This request is a deliberate, small expansion of that boundary — reasonable given Phase 18 already introduced doctor-side clinical fields (diagnosis, prescriptions). Treat these two new fields as **simple, optional, unstructured text fields** only (a quick-reference note for the doctor, not a structured clinical data model) — do not use this as a justification to build out a broader EMR/medical-history system beyond exactly these two optional text fields.

Before writing any code:
1. Locate the current appointment-booking modal/form/trigger (from the recent critical-fix work that restored booking) and confirm exactly how it's currently invoked (navigation vs. inline vs. partial modal) — the user has observed it currently seems to open in a way that isn't a proper popup/overlay; confirm the actual current behavior.
2. Confirm the current `patients` table fields (Phase 4: name, email, phone, notes, date_of_birth) and current `appointments` fields (Phase 3/15/17: including `consultation_type`, `booking_source`, and Phase 17's `payment_status`/emergency-mode handling from Phase 15) — this determines which of the target form's fields are genuinely new vs. already present under a different name.
3. Confirm the current `booking_source` enum's exact values, since the target form shows a "Booking Source: Dashboard / Phone Call" selector — check whether "Phone Call" needs to be added as a new value or represented differently (e.g. a sub-type/note under the existing `dashboard` source) — report before implementing.
Report all findings before implementing.

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect from this project.

## 2. OBJECTIVE
1. Make appointment booking open as a **true modal/popup overlay** — never a page navigation or an in-page panel — triggered from both the global header's existing "+ New Appointment" button and a new circular "+" button within the Appointments page itself.
2. Expand the booking form to match `appo_2.jpg` exactly: all Patient Information and Appointment Details fields listed below, Emergency toggle, and the informational footer.

## 3. SCOPE

### A. Modal Behavior (fix the core UX issue)
- Both trigger points — the global header's "+ New Appointment" button (`/app/appointments?new=consultation`) and the new circular "+" button on the Appointments page — must open the **same** modal component as a true overlay (dimmed backdrop, centered/floating panel, closable via the "X" in the top-right or the "Cancel" button), not navigate to a different route or render inline within the page content.
- If the current implementation navigates to a URL that then renders a full-page or in-page version of this form, refactor so the URL/query-param (`?new=consultation`) instead triggers the modal to open **on top of** whatever page is currently showing (typically the Appointments page), and closing the modal returns cleanly to that page without a jarring navigation.
- The circular "+" button on the Appointments page: small, circular, primary-teal background (`colorPalette.brand.primary`, per `design_system_profile.json` — not the reference screenshot's indigo/purple), white plus icon, positioned per a sensible convention (e.g. top-right of the page content area, or a floating action button — use your judgment for the cleanest placement matching the existing page layout).

### B. Modal Header
- Icon + title **"Book Consultation"** with subtitle **"Schedule a doctor consultation"**.
- **Emergency** toggle switch (top-right) — wire this to Phase 15's existing Emergency Mode validation-relaxation logic exactly (do not reimplement) — when on, downstream field requirements relax per Phase 15's already-established rules.
- Close ("X") button.
- Style: header bar in `colorPalette.brand.primary` (teal), not the reference's purple/indigo.

### C. Patient Information (left column)
- **Phone Number*** — 10-digit mobile input, used for patient lookup/matching (reuse Phase 4/13's existing phone-based patient-matching logic where applicable — if a matching patient is found, consider auto-filling known fields, matching the pattern already established for WhatsApp returning-patient recognition in Addendum Phase 13).
- **Full Name*** — required.
- **Patient Age*** — required numeric input. Confirm with Section 0's audit whether `patients` currently has `date_of_birth` (Phase 4) instead of a direct age field — if so, decide: either store age directly as a simpler alternative for quick booking (nullable, independent of DOB), or compute/display age from DOB if already set and only prompt for it when DOB is unknown. Propose your approach before implementing rather than guessing silently, since this affects the patient data model.
- **City** (optional) — new nullable field on `patients`.
- **Gender*** — required, three button-style options: Male / Female / Other. New nullable-by-default-but-required-in-this-form field on `patients`.
- **WhatsApp Number** (optional) — new nullable field on `patients` (reuse Phase 11/13's existing `whatsapp_number` field if it already exists — do not create a duplicate column). Helper text: "Leave empty to use phone number for WhatsApp."
- **Known Allergies** (optional) — simple free-text field, per Section 0's scope note (unstructured, not a coded/structured allergy list).
- **Medical Conditions** (optional) — simple free-text field, same treatment as above.
- **Booking Source** — selector: Dashboard / Phone Call — per Section 0's audit findings, either extend the `booking_source` enum or represent this as an appropriate sub-field; report your chosen approach.

### D. Appointment Details (right column)
- **Select Doctor*** — dropdown of the clinic's doctors (Addendum Phase 10) — if the clinic has no doctors configured, handle gracefully (single implicit default, or a clear message).
- **Appointment Date*** — date picker.
- **Time Slot*** — dropdown, **disabled with placeholder "Select doctor and date first"** until both Doctor and Date are chosen; once both are selected, populate real available slots via the existing `checkSlotAvailability()` function (Phase 3/10) — do not fabricate slots.
- **Consultation Type*** — two-button toggle: **In-Clinic Visit / Online / Video**, matching Phase 15's existing `consultation_type` field (`in_clinic`/`online`) — reuse, don't duplicate.
- **Additional Notes** (optional) — textarea with a live character counter ("0/1000"), helper text: "This information will help the doctor prepare for the appointment." Maps to the existing `appointments.notes` field (Phase 3) — enforce the 1000-character limit via the existing Zod schema.

### E. Footer
- "Your data is secure and encrypted" trust message (left), **Cancel** and **Book Consultation →** buttons (right) — Book Consultation styled as the primary teal button.

## 4. DATABASE WORK REQUIRED
- Migration: add `city`, `gender`, `known_allergies`, `medical_conditions` to `patients` (all nullable, additive — no impact on existing records). Reuse `whatsapp_number` if it already exists from Phase 11/13 rather than duplicating.
- Migration: add `age` to `patients` if Section 0's audit determines this is the right approach vs. relying solely on `date_of_birth` (per your proposal in Section 3C).
- Confirm/extend `booking_source` enum per Section 0's audit and Section 3C's Booking Source field decision.
- RLS: these are additive columns on an already-RLS-covered table — no new policy work needed unless a new table is introduced.

## 5. DEFINITION OF DONE
- [ ] Both trigger points (header button, new circular "+" button) open the exact same modal as a true overlay — no page navigation, no in-page embedded panel.
- [ ] Emergency toggle correctly reuses Phase 15's existing logic.
- [ ] All Patient Information fields present, correctly validated (required vs. optional per the spec), and correctly persisted to `patients` (existing fields reused, new fields added only where genuinely new).
- [ ] Known Allergies / Medical Conditions are simple optional text fields — no broader EMR expansion introduced.
- [ ] Time Slot correctly stays disabled until Doctor + Date are chosen, then populates real available slots.
- [ ] Consultation Type toggle correctly maps to the existing `consultation_type` field.
- [ ] Notes field enforces the 1000-character limit with a live counter.
- [ ] Booking Source selector works per the Section 0/3C decision.
- [ ] Successful booking still goes through the exact same validated creation path (Zod validation, `checkSlotAvailability()`, DB insert) already restored in the previous critical fix — no new, parallel booking logic.
- [ ] All colors/styling match `design_system_profile.json` (MedBook AI teal) — not the reference screenshot's purple/indigo.
- [ ] Modal closes correctly (X, Cancel, or successful submission) and the underlying page reflects the new appointment without a manual refresh.

## 6. CONSTRAINTS
- Do not duplicate the booking-creation logic — extend the existing, already-working Zod schema and creation function with the new optional fields.
- Do not build a structured clinical-data system around Allergies/Medical Conditions — simple text fields only.
- Do not use the reference screenshot's color scheme — MedBook AI teal throughout.
- Do not break the Emergency Mode logic already established in Phase 15 — reuse it exactly.
- Do not regress the critical booking fix from the previous prompt — this modal must still result in a real, successfully created appointment.

## 7. PROCESS
1. Report the Section 0 audit findings (current modal/trigger behavior, current patient/appointment fields, current `booking_source` values) before implementing.
2. Propose: the age-vs-date_of_birth approach, and the Booking Source (Dashboard/Phone Call) representation — confirm with me if either is ambiguous.
3. Implement: migrations (new patient fields) → convert trigger/modal behavior to a true overlay → circular "+" button → expand form fields (Patient Information, Appointment Details) → wire Emergency toggle, character counter, and slot-dependency logic → verify successful submission still uses the existing validated creation path.
4. Provide a verification checklist: open the modal from both trigger points and confirm both show the same true overlay (not navigation); fill out a complete booking including the new fields and confirm it saves correctly; confirm Time Slot stays disabled until Doctor+Date chosen; confirm Emergency toggle relaxes validation per Phase 15's rules; confirm the character counter and 1000-char limit work; confirm the newly-booked appointment appears correctly in the Appointments page without a manual refresh; confirm no regression in the underlying booking-creation logic (double-booking protection still works).

Confirm your Section 0 audit findings and your proposed approach for age/DOB and Booking Source back to me before writing code.
