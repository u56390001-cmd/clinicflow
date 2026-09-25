# MASTER ENHANCEMENT PROMPT — Complete the Appointments Module Per Full Component Blueprint
**Target tool:** OpenCode
**Type:** Audit-and-complete pass across the entire Appointments tab and its sub-modals. Significant work has already been done on this tab across earlier prompts (consolidation, queue sections, filters, booking modal, critical booking fix). **This prompt is the authoritative, complete specification of what the finished Appointments module should look like — use it to identify what's already correct, what's broken, and what's still missing, and act on each accordingly.**
**Design authority:** `design_system_profile.json` — **every color in this spec (dark blue/violet/indigo described below) must be replaced with MedBook AI's own teal (`colorPalette.brand.primary`) and the established neutral/semantic palette.** The blueprint below describes shapes, layout, and structure — not colors.

---

## 0. MANDATORY APPROACH — READ FIRST
For **every single component/feature** listed in Sections 1–8 below:
1. Check whether it already exists and works correctly as described → **leave it alone, do not touch or rebuild it.**
2. Check whether it exists but is broken, incomplete, or styled incorrectly (wrong colors, missing field, wrong behavior) → **fix/correct it in place, do not rewrite it from scratch.**
3. Check whether it doesn't exist at all → **build it fresh, per this spec.**

Before writing any code, go through this entire document section by section and produce an audit table: `Component | Status (exists-correct / exists-broken / missing) | Notes`. Report this back before making any changes. This is not optional — given how much has already been built on this tab, guessing wrong here risks silently breaking working functionality or duplicating existing logic.

Reuse everything already established in this project rather than reinventing: Phase 10 (Doctors), Phase 15 (Emergency Mode, consultation_type, manual service booking), Phase 17 (check-in, queue, token, vitals data model), Phase 18 (consultation/prescription — not part of this tab but shares data), Phase 19 (patient billing/payments/receipts, Notification Dispatcher for WhatsApp receipts), and the design system (`design_system_profile.json`).

---

## 1. Sidebar
- "Appointments" sidebar item shows a clear active-state highlight (background fill) when selected, using `colorPalette.brand.primary` (or its light variant) — not the blueprint's dark blue/violet.

## 2. Page Header
- Title **"Appointments"** (bold) with sub-title **"Manage and track patient appointments"** directly beneath it, left-aligned.
- A circular **"+"** floating action button, top-right of this header row, solid `colorPalette.brand.primary` background, white plus icon — this is the same "new appointment" trigger already built; confirm it still correctly opens the Book Consultation modal as a true overlay (per the earlier critical fix).

## 3. KPI Summary Cards
Four horizontal cards, light rounded corners, colored icon badge on the left of each, bold count on the right:
- **Checked In** (user/avatar icon)
- **In Consultation** (heartbeat/vitals-wave icon)
- **Not Arrived** (clock icon)
- **Completed** (check-mark icon)
- **Reconciliation note**: an earlier prompt in this project specified different top-level stat cards (Today/Confirmed/Pending/Cancelled). This blueprint's four cards (Checked In/In Consultation/Not Arrived/Completed) are the **current, authoritative spec** — if the earlier cards were already built, replace their labels/data-source with these four (all real, computed from `visits`/`appointments` state per Phase 17), don't keep both sets.
- Icon badge colors: use `colorPalette.brand.primary` and semantic colors (`success`, `warning`, `info`) appropriately per card meaning, not the blueprint's purple/blue/yellow/green literally — pick a sensible mapping from the existing semantic palette.

## 4. Segmented Navigation + Search Controls
- Top-level segmented pill selector: **Consultations | Services** (already specified in earlier work — confirm this still works and correctly filters, per the earlier fix for this toggle).
- Under **Consultations**: two further tabs — **Today** and **Upcoming** (the earlier work also had Completed/All/Cancelled sub-tabs — keep those too if already built; this blueprint emphasizes Today/Upcoming as the primary two, but don't remove Completed/All/Cancelled if they already exist and work, since that would be a capability regression).
- **Today Tab**: renders the live queue view (Section 5 below) — today's active appointments and their current states.
- **Upcoming Tab**: future scheduled appointments, **merging both WhatsApp-bot-booked and manually-booked entries** in one list (confirm this already reads from the same `appointments` table regardless of `booking_source`, per the established architecture principle used throughout this project — all booking channels write to the same tables).
- Search box ("Search...", magnifying-glass icon), **Filters** dropdown (per the earlier Filters fix — Doctor/Status/Source/Date Range), and **Export** button — positioned inline to the right of the tab row. Confirm these still work per the earlier fix; don't rebuild if already functional.

## 5. Main Queue List Area (Today Tab content)
- Two stacked panels: **"In Consultation"** (header band styled with `colorPalette.brand.primary` or `info`, not literal blue) and **"Not Yet Arrived"** (header band styled with `colorPalette.semantic.warning`/warningLight, not literal yellow) — per the earlier restored-sections fix; confirm still present and correctly wired to Phase 17 data.
- Each patient row (horizontal card, soft-rounded corners, white background):
  - Left: colored rounded-square avatar with patient initials.
  - Center: patient name (bold), assigned doctor, appointment time — stacked.
  - Right: action controls (see Section 6) + a vertical three-dot menu for secondary actions.

## 6. Per-Patient Row Actions (Today Tab) — five actions, each mapped to existing project logic
1. **Check In** — reuse Phase 17's exact check-in logic (idempotent, creates token/queue entry). Per this blueprint, **clicking Check In should open the "Check In Patient" modal** (Section 7) rather than checking in instantly with no confirmation — reconcile: if Check In currently performs an instant action with no modal, upgrade it to open this richer modal instead, since the modal captures useful info (payment, vitals-adjacent) at the same moment. Confirm this is a reasonable UX upgrade rather than a regression before implementing (it isn't removing the check-in capability, just enriching the moment it happens).
2. **Collect Payment / Confirm Payment** — reuse Phase 19's exact payment-collection logic (bill creation, `patient_payments`, receipt generation, WhatsApp/email delivery via the Notification Dispatcher) — do not duplicate this logic; this row action should trigger the same underlying flow, possibly the same modal used elsewhere for Collect Payment.
3. **Enter Vital Signs** — opens the **Add Vitals** modal (Section 9) — reuse Phase 17's vitals data model, now with the **specific field set** given in Section 9 (this supersedes Phase 17's original generic placeholder field set — Phase 17 was told to keep vitals minimal/generic since exact fields weren't yet known; they are now known and specified below — implement exactly this field set).
4. **Token Update** — reuse Phase 17's exact atomic queue-reorder logic (move a patient to top of queue, recalculate `queue_position`, keep `token_number` per the rule already established in Phase 17) — this is not new logic, just confirm it's exposed as a row-level action here.
5. **Complete** — reuse Phase 18's "Next Patient"/complete-consultation logic (or Phase 18's receptionist-driven equivalent for non-EMR-flow clinics, if that's the applicable case for this row) — marks the visit completed and promotes the next waiting patient automatically. Confirm this row-level "Complete" maps to the same underlying transition already built, not a new one.

## 7. Book Consultation Modal (New Appointment)
Per the earlier detailed prompt already implemented — this blueprint adds a few more precise details to confirm/adjust:
- **Booking Source** field: represented as **choice cards** (Dashboard / Phone Call) rather than a plain dropdown, if not already built this way — a small visual upgrade, confirm the underlying data value/enum handling from the earlier prompt is unaffected.
- **Time Slot**: represented as a **grid of slot "chips"** (individually selectable time buttons) rather than a plain dropdown, if not already built this way — still populated only after Doctor + Date are chosen, via the existing `checkSlotAvailability()` function; still no fabricated slots.
- **Emergency Toggle**: confirm exact behavior matches Phase 15 — when active, background validation checks relax (partial details can be saved), consistent with the earlier prompt's Emergency Mode wiring.
- Everything else (Patient Information fields, Appointment Details fields, footer) as already specified/implemented in the earlier booking-modal prompt — do not rebuild, only adjust the two visual details above if not already matching.

## 8. Services Tab
- Displays existing saved service records (reuse Phase 2/3's `services` data).
- **Book Service** button opens a modal capturing: patient parameters (reuse the same patient info pattern as Book Consultation, or a lighter version if that's more appropriate — confirm with existing Phase 15 manual-service-booking scope), the specific clinic diagnostic/service selection (e.g. "Blood Sugar Test," "CBC" — real services from the clinic's configured `services` list, not fabricated examples), test/appointment date, available slots (via `checkSlotAvailability()`), and a specialized-requirements notes field.
- This maps directly to Addendum Phase 15's "Manual Service/Diagnostic Booking" — reuse that underlying booking logic; this is the same booking creation path as Consultations, just entry-point-labeled differently and pre-selecting the service-booking context.

## 9. Add Vitals Modal — exact field set (supersedes Phase 17's placeholder generic fields)
Two-column grid, borderless/shadow-outline inputs:
- Height (cm)
- Weight (kg)
- **BMI** — auto-calculated from Height + Weight, displayed in a disabled/grey read-only box (do not let the user manually enter BMI — always computed).
- Systolic BP (mmHg)
- Diastolic BP (mmHg)
- Pulse (bpm)
- Temperature (°C)
- SpO2 (%)
- Respiratory Rate (/min)
- Footer: "Cancel" (outline) and "Save Vitals" (primary teal, with a small icon) buttons.
- Persist to Phase 17's `vitals` table/structure — update that table's schema now with this exact field set if it was left more generic/placeholder before (migration to add/rename fields as needed, additive/non-destructive to any already-recorded test data if reasonably possible).
- Doctor-side viewing of these vitals (Phase 18's consultation screen) must reflect this same exact field set — confirm/update that view too, so the two sides of vitals capture/display stay consistent.

## 10. Check-In Patient Modal (new — the richer check-in experience referenced in Section 6.1)
A high-contrast header (styled `colorPalette.brand.primary`, not literal blue) showing a user icon, title **"Check In Patient"**, and a **"Returning Patient"** badge when the phone/patient lookup matches an existing patient (reuse Phase 13's returning-patient-recognition pattern/logic if applicable, or Phase 4's patient lookup).

**Three-column layout:**
1. **Patient Confirmation** — profile photo placeholder, Name, a patient ID (format like `CIT-2026-00003` — confirm whether the project already has a patient-ID scheme; if not, this is a new, simple, clinic-scoped sequential/formatted ID to introduce — propose the exact format based on existing ID conventions in the project, don't invent a clashing scheme), Source (`booking_source`), Doctor, and the selected appointment slot/time.
2. **Collect Payment** — "Consultation Fee (₹)" field, pre-filled from the linked service/consultation price (editable, with a small pencil/edit affordance), and payment method selection: **Cash / UPI / Card / Waive**. Reconcile with Phase 19's existing `patient_payments.payment_method` values — extend that enum to include `cash`, `upi`, `card`, and a `waive` option (a legitimate "no charge" outcome — `patient_bills.status` should correctly reflect a waived bill as resolved/paid-equivalent, not left `pending`).
3. **Add-ons** — expandable drawers for **"Additional Charges"** (extra line items on the bill, reusing Phase 19's `patient_bill_items` structure) and **"Apply Discount"** (a discount amount/percentage applied to the total — confirm Phase 19's billing schema supports a discount concept; if not, add a nullable discount field to `patient_bills` — additive migration).

**Footer**: bold **"Total Amount: ₹{amount}"** summary (bottom-left), and action buttons (bottom-right): **"Collect Payment"** (triggers the actual payment recording, reusing Phase 19's logic — idempotent, matching the already-established duplicate-payment-prevention rule) and a solid bright-green **"Check In"** button (completes the check-in transition per Phase 17's logic, now enriched with whatever payment/vitals context was captured in this same modal). Use `colorPalette.semantic.success` for this button rather than a literal bright green outside the design system, unless `success` already renders as a suitable green.

- **Critical reconciliation with Phase 17's payment scenarios**: this modal must correctly support all three original payment scenarios (pre-consultation collection here in this modal, post-consultation deferred, or already-collected-at-booking confirmation) — confirm the modal's payment section adapts appropriately (e.g. shows "Confirm Payment" instead of "Collect Payment" if `visits.payment_status` indicates it was already collected at booking time) rather than always assuming payment is being collected fresh.

## 11. Billing / Transaction Sheet (multi-stage popup, triggered from Billing-related actions)
- A slide-over/partial-overlay panel (not necessarily a full modal) showing itemized line items (description, Qty, unit price, line total) — reuse Phase 19's `patient_bills`/`patient_bill_items` exactly.
- Bottom action: a bright, prominent button reading **"Collect & Send Receipt"** (styled `colorPalette.semantic.success` or `brand.primary` per what looks correct against the design system, with a check icon) — on click, this performs Phase 19's payment-collection + receipt-generation + Notification-Dispatcher delivery (email/WhatsApp) as one combined action — confirm this maps to existing Phase 19 functions rather than new logic.

---

## 12. DEFINITION OF DONE
- [ ] Full audit table (Section 0) produced and reported before any code changes.
- [ ] Every component in Sections 1–11 is in one of these states: confirmed-correct-and-untouched, fixed-in-place, or newly-built-per-spec — nothing silently skipped.
- [ ] KPI cards reconciled to the Checked In/In Consultation/Not Arrived/Completed spec (Section 3), replacing any earlier conflicting stat-card set.
- [ ] Check-In flow upgraded to open the richer Check-In Patient modal (Section 10), correctly handling all three payment scenarios from Phase 17.
- [ ] Add Vitals modal implements the exact specified field set (Section 9), with BMI auto-calculated and read-only, consistently reflected on the doctor's Phase 18 consultation view.
- [ ] Payment method enum extended to include Cash/UPI/Card/Waive, with Waive correctly resolving the bill without a real charge.
- [ ] Additional Charges and Apply Discount supported in the billing data model and UI.
- [ ] Services tab's Book Service modal works via the existing Phase 15 service-booking logic.
- [ ] All colors are MedBook AI teal/design-system colors throughout every component described — zero literal blue/violet/purple/yellow from the blueprint's raw color descriptions.
- [ ] No regression to any already-working piece of this tab (booking, filters, queue sections, consolidation work from earlier prompts).

## 13. CONSTRAINTS
- Do not rebuild anything already working correctly — this is an audit-and-complete pass, not a rewrite.
- Do not duplicate check-in, payment, vitals, queue-reorder, or consultation-completion logic — every action in this spec maps to already-established functions from Phases 17–19; extend/expose them, don't reimplement.
- Do not use any color from the blueprint's literal descriptions (dark blue, violet, indigo, yellow, bright green as literal values) — map everything to `design_system_profile.json`.
- Do not invent a patient-ID scheme that conflicts with any existing identifier convention in the project — check first.
- Do not let "Waive" leave a bill in an inconsistent/pending state — it must resolve cleanly.

## 14. PROCESS
1. Produce and report the full Section 0 audit table before writing any code.
2. Propose resolutions for the explicitly-flagged reconciliation points (KPI card replacement, Check-In modal upgrade, vitals field-set migration, payment-method enum extension, patient-ID format) before implementing — confirm with me if any of these feel ambiguous or risky given what's already built.
3. Implement in dependency order: KPI card reconciliation → vitals schema/field update (affects both Phase 17 capture and Phase 18 display) → payment-method/discount schema extensions → Check-In Patient modal (ties together check-in + payment + the new vitals/discount pieces) → Add Vitals modal exact fields → Book Consultation modal detail adjustments (choice cards, slot chips) → Services tab Book Service modal → Billing/Transaction sheet.
4. Provide a full verification checklist covering every numbered section above, explicitly re-testing previously-working flows (booking, filters, queue restore, consolidation) to confirm zero regression.

Confirm your Section 0 audit table and your proposed resolutions for the flagged reconciliation points back to me before writing any code.
