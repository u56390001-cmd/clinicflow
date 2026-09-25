# ENHANCEMENT PROMPT — Actions Column (Eye Icon + Dropdown Menu) + Appointment Details Modal on "Upcoming" Tab
**Target tool:** OpenCode
**Type:** Additive UI feature on the existing Upcoming table — reuses existing appointment logic (edit/cancel/no-show/payment/check-in), no new business logic beyond what's already built across Phases 3/15/17/19.
**Design authority:** `design_system_profile.json` — map every color below to the real palette (teal primary, semantic warning/danger/success), not literal color names.

---

## 0. IMPORTANT — READ BEFORE STARTING
Before writing any code:
1. Confirm the exact current "Actions" column content on the Upcoming sub-tab's table (built during the earlier Appointments consolidation/master-prompt work) — this task adds/completes the Eye icon + three-dot dropdown if not already fully present, and must not duplicate whatever partial version may already exist.
2. Confirm the existing functions for: editing an appointment, marking no-show, cancelling an appointment, and confirming/collecting payment (Phase 3/15/19) — every dropdown action below must call these existing functions, not new ones.
3. **Patient ID format reconciliation**: an earlier prompt in this project used the example format `CIT-2026-00003` for a patient ID shown in the Check-In Patient modal; this new spec shows `CLI-2026-00001`. These must not both exist as inconsistent formats — confirm whatever format was actually implemented (if any) and use that exact same one here. If no patient-ID scheme was actually implemented yet, propose one consistent format now and report it back rather than picking silently, since it will need to match wherever else patient IDs are displayed in this project.
4. Confirm Phase 17's check-in function signature so it can be correctly triggered from this new modal's "Check In Patient" button.
Report all findings before implementing.

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect from this project.

## 2. OBJECTIVE
On the Upcoming sub-tab's appointment table, add a two-icon Actions column (Eye = preview, three-dot = operations menu), and build the "Appointment Details" preview modal it opens — surfacing full patient/doctor/schedule/payment information with quick actions, all wired to existing, already-working logic.

## 3. SCOPE

### A. Actions Column (far-right of the Upcoming table)
Two elements per row:
1. **Eye icon** (flat circular button) — opens the Appointment Details modal (Section B) for that row's appointment.
2. **Vertical three-dot icon** — opens an overlay dropdown menu with exactly four actions, in this order:
   - **Edit Appointment** — opens the existing appointment edit flow (reuse the Book Consultation/booking modal in edit mode if that pattern already exists from earlier phases, pre-filled with this appointment's current data; if no edit flow exists yet, this is a small new addition: open the same booking modal component with existing values pre-populated and adjust its submit action to update rather than create).
   - **Confirm Payment** — reuse Phase 19's existing "payment already collected at booking, confirm it" scenario logic (from Phase 17's original payment-scenario design) — do not build new payment logic.
   - **Mark No Show** — reuse the existing `no_show` status-transition action from Phase 3.
   - **Cancel Appointment** — styled in `colorPalette.semantic.danger` (red) text and/or a trash icon — reuse the existing cancel-appointment action from Phase 3.

### B. Appointment Details Modal (opened by the Eye icon)
**Overlay/backdrop**: standard modal backdrop blur, centered rectangular panel, vertically scrollable if content exceeds viewport height.

**Header bar**: title **"Appointment Details"**, the appointment's real date (e.g. "31-08-2026"), and a colored outline status badge showing the appointment's real current status (e.g. "Scheduled") — use `colorPalette.semantic.*` mapped to the real status value, not a hardcoded "Scheduled" label.

**Body — three sections, real data throughout, no placeholders/hardcoded examples:**

1. **Patient Information** (card/grid layout): Full Name, Patient ID (per the Section 0.3 reconciled format), Age (show "N/A" if not recorded, per Phase 4's optional `date_of_birth`/age fields), Gender, City, Phone Number, WhatsApp contact (if set), and Booking Source (with a small device/channel icon — e.g. distinguishing dashboard/walk-in vs. AI/WhatsApp/website, per the real `booking_source` value).

2. **Doctor Information & Schedule Details** (adjacent section, bold labels + grey secondary values): Doctor Name, Title, Speciality (per Phase 10's `doctors` fields — show gracefully if the clinic has no formal doctor records, e.g. defaulting to the clinic's implicit single-doctor context), Date, **Token Number** — show **"Not Assigned"** specifically when this appointment hasn't been checked in yet (which is always true for genuinely "Upcoming" appointments, per Phase 17's token-assignment-at-check-in design — this is expected, not a bug), Slot Name (if the project's slot model has named slots — e.g. "Slot B" — confirm this concept exists; if slots are only represented as raw time ranges without named labels, omit the Slot Name field rather than fabricating a label), and Slot Time (the real appointment time range).

3. **Consultation & Payment** (after a horizontal divider): Consultation Type (In-Person Visit/Offline vs. Online/Video, per Phase 15's `consultation_type`), **Payment Status** — shown as a colored banner: `colorPalette.semantic.warning` (orange) styling with text like "Payment Pending" when `visits.payment_status`/`patient_bills.status` indicates unpaid, or an appropriately different color/label for paid/waived states (do not hardcode "Payment Pending" regardless of actual status), Consultation Fee (real amount, from the linked service/consultation price), and a status tag such as "Pay at Clinic" if that reflects the real configured payment-collection timing for this visit (per Phase 17's payment-scenario field) — don't show this tag if it doesn't apply to the current scenario.

**Footer:**
- Left: "Data encrypted and secure" trust label with a green checkmark-shield icon (`colorPalette.semantic.success`).
- Right, three buttons:
  1. **Cancel** — flat/plain button, closes the modal (does not cancel the appointment — this is just "close," distinct from the dropdown's "Cancel Appointment" action).
  2. **Mark No Show** — secondary button styled with `colorPalette.semantic.danger` accent — reuse the same existing no-show action as the dropdown menu's equivalent item (Section A) — do not duplicate this logic, call the same function.
  3. **Check In Patient** — primary solid button using `colorPalette.semantic.success` (green) — reuse Phase 17's exact check-in function: assigns a real token number, transitions the appointment/visit into the waiting queue, and this appointment should now correctly disappear from "Upcoming" and appear in the Today/Queue view (per the already-established Today-tab queue behavior) — confirm this cross-tab consistency after implementing.

## 4. DEFINITION OF DONE
- [ ] Actions column shows Eye icon + three-dot menu on every Upcoming row, styled per the design system.
- [ ] Dropdown menu shows exactly the four specified actions in order, each correctly calling its existing underlying function (no duplicated logic).
- [ ] Appointment Details modal shows fully real data in all three body sections — no hardcoded/placeholder values anywhere, graceful "N/A"/omission for fields genuinely not set or not applicable (e.g. Token Number "Not Assigned," Slot Name omitted if the concept doesn't exist, Age "N/A" if unrecorded).
- [ ] Payment Status banner and "Pay at Clinic" tag correctly reflect the real payment-scenario/status data, not a hardcoded appearance.
- [ ] Footer's Check In Patient button correctly triggers Phase 17's real check-in flow, and the appointment correctly moves from Upcoming to the Today/Queue view afterward.
- [ ] Footer's Mark No Show reuses the exact same function as the dropdown's Mark No Show — verified as one shared function, not two.
- [ ] Patient ID format is consistent with wherever else patient IDs are shown in this project (per Section 0.3's reconciliation).
- [ ] All colors map to `design_system_profile.json` — no literal/hardcoded colors outside the palette.
- [ ] Zero regression to any other part of the Appointments module already built.

## 5. CONSTRAINTS
- Do not duplicate edit/cancel/no-show/payment/check-in logic — every action here must call the existing, already-established function for that operation.
- Do not hardcode any patient/doctor/schedule/payment data in the modal — all real, live data.
- Do not introduce a second, inconsistent patient-ID format.
- Do not fabricate a "Slot Name" concept if the project's data model doesn't actually have named slots.

## 6. PROCESS
1. Report the Section 0 audit findings (current Actions column state, existing edit/cancel/no-show/payment functions, patient-ID format reconciliation, check-in function signature) before implementing.
2. Propose the exact modal layout/component structure and confirm the patient-ID format decision before implementing.
3. Implement: Actions column (Eye + dropdown) → dropdown action wiring (reusing existing functions) → Appointment Details modal (three body sections + footer) → verify Check In Patient correctly transitions the appointment out of Upcoming and into Today/Queue.
4. Provide a verification checklist: open the modal for a real upcoming appointment and confirm every field shows correct real data; test each of the four dropdown actions and confirm each performs the correct, already-established behavior; test the modal's Mark No Show and Check In Patient buttons and confirm correct behavior/queue transition; confirm Payment Status banner and Pay at Clinic tag correctly vary based on real different payment scenarios (test at least two different real appointments with different payment states); confirm no regression elsewhere in the Appointments module.

Confirm your Section 0 audit findings and the patient-ID format decision back to me before writing code.
