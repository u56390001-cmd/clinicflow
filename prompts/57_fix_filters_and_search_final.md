# FIX/IMPLEMENTATION PROMPT — Filters Dropdown (Exact Spec) + Working Search Bar on Appointments Today/Upcoming Tables

## Context — this has been requested before and is still not working
An earlier prompt asked for a working Filters dropdown on this page; it is still not functioning correctly (and Search doesn't work either). **This time, do not report success without pasting real evidence** (actual filtered results, actual network/query payloads) — a UI control that visually exists but doesn't affect real data is exactly the bug that needs to be fixed, and has apparently persisted through at least one previous attempt.

## Part 0 — Mandatory Diagnosis First
1. Locate the current Filters button and Search input on the Appointments page (Today/Upcoming tables' control row).
2. Determine exactly why they currently don't work: is the Filters button not opening any dropdown at all? Does a dropdown open but selecting options has no effect on the list? Does Search accept input but never actually query/filter anything? Capture and report the exact current broken behavior with specifics (not just "it doesn't work") before making changes.
3. Confirm the real, existing enum values for `appointments.status` (or `visits.status` where applicable) and `booking_source` — this determines exactly which Status and Source checkbox options are real vs. need to be added/reconciled (see Part 2).
4. Report all findings before implementing.

## Part 1 — Search Bar (make it actually work)
- The search input (positioned left of the Filters button, right of the tab row) must perform a real search against the currently-active table's data (Today or Upcoming) by **patient name and/or phone number** at minimum — reuse Phase 4's existing patient-search query pattern/logic if applicable, or implement an equivalent simple `ILIKE`/contains-style filter on the appointments-with-patient-join query if search needs to happen at the appointment-list level specifically.
- Typing in the search box must visibly filter the currently displayed list (debounced, e.g. ~300ms, to avoid firing a query on every keystroke) — reuse whatever debounce pattern already exists elsewhere in the project if one does.
- Clearing the search box must return the list to its normal (or currently-filtered-by-Part-2) state.

## Part 2 — Filters Dropdown (build exactly this structure)

### Trigger button
- Light-grey-bordered, rounded rectangle button: funnel/filter icon (left), text label "Filters" (center), a small down-chevron (right). Style per `design_system_profile.json` (neutral border/background, teal accents on interaction/active state — not the blueprint's literal blue).
- Shows a small count badge (e.g. "Filters 2") when one or more filters are currently active.

### Dropdown panel (opens directly below the button, left-aligned to it, soft shadow/rounded corners)
Four blocks, in this exact order, plus a footer reset action:

1. **Doctor** — bold small title "Doctor", below it a select dropdown defaulting to **"All Doctors"**, populated with the clinic's real active doctors (Addendum Phase 10). If the clinic has no doctor records configured, show just "All Doctors" with no further options, or omit this block gracefully — don't show a broken/empty dropdown.

2. **Status** — title "Status", below it a checkbox list: **"All Statuses"** at the top, then individually checkable: **Scheduled, Checked In, In Consultation, Completed, Cancelled, No Show**. These must map to the **real** status values in the data model (per Part 0's audit) — if any of these six labels don't correspond to an actual real status value currently used in this project (e.g. if "Checked In" and "In Consultation" are `visits.status` values while "Scheduled"/"Completed"/"Cancelled"/"No Show" are `appointments.status` values), implement the filter logic to correctly bridge both fields so each checkbox genuinely filters real matching rows — report back exactly how you reconciled this rather than silently guessing a mapping that might not match reality.

3. **Source** — title "Source", checkbox list: **"All Sources"** at the top, then: **Walk-in (Dashboard), WhatsApp Chatbot, Phone Call**. Reconcile these labels with the real `booking_source` enum values (per Part 0's audit): "Walk-in (Dashboard)" maps to the existing `dashboard` value; "WhatsApp Chatbot" maps to whatever value Addendum Phase 13's WhatsApp booking actually writes (confirm the exact value — likely `ai_agent` or a dedicated `whatsapp` value, don't assume); "Phone Call" — per the earlier Book Consultation modal's "Booking Source: Dashboard / Phone Call" selector, confirm whether `phone_call` already exists as a real value or sub-flag on bookings; if it doesn't exist as a real, filterable value yet, either add it properly (small additive schema/enum change, consistent with how it was handled in that earlier booking-modal prompt) or report that this filter option can't yet be made real and needs that reconciliation first — do not fake a filter option that can never match anything.

4. **Date Range** — title "Date Range", below it a bordered container with a calendar icon and placeholder "Select Date"; clicking it opens a standard date-range calendar picker widget (reuse any existing date-picker component already used elsewhere in the project, e.g. the Appointment Date field in the booking modal, for visual/technical consistency).

### Footer
- **"Clear All"** — borderless, `colorPalette.brand.primary` (teal, not the blueprint's literal blue) text button, right/bottom-aligned in the dropdown. Clicking it resets every filter field in this dropdown to its default ("All Doctors," "All Statuses," "All Sources," empty Date Range), clears the search input state if you judge that should be included (or leave Search independent — your call, note which you chose), and the table instantly returns to its default, fully unfiltered list.

### Functional requirement — the actual point of this task
- Every filter selection (Doctor + Status + Source + Date Range, combined with AND logic across categories and OR logic within a category's own checkboxes, e.g. selecting both "Scheduled" and "Cancelled" shows appointments matching either) must **actually change the real, displayed list** in the currently-active table (Today or Upcoming) — verify this is genuinely wired to the data query, not just visual dropdown state with no consequence.
- The "Filters N" badge count must accurately reflect how many distinct filter categories currently have a non-default selection.

## Verification (must provide real evidence, not just a description of expected behavior)
1. Type a known patient's name into Search and confirm the list actually narrows to matching results; clear it and confirm the full list returns.
2. Open Filters, select a single Status (e.g. only "Cancelled") and confirm the visible list changes to show only cancelled appointments — paste/describe the actual before/after list contents as evidence.
3. Select a Doctor filter (if the clinic has more than one doctor) and confirm results narrow correctly.
4. Select a Source filter and confirm results narrow correctly — explicitly confirm the "WhatsApp Chatbot" and "Phone Call" options actually match real data or report if either couldn't be made functional due to a data-model gap found in Part 0.
5. Set a Date Range and confirm results narrow correctly.
6. Combine two or more filters simultaneously and confirm the combined (AND-across-categories) result is correct.
7. Click "Clear All" and confirm every filter resets and the full list returns.
8. Confirm the "Filters N" badge count is accurate at each step.
9. Confirm this works correctly on both the Today and Upcoming tabs independently.

## Constraints
- Do not report this as complete without the Part 0 diagnosis and the Verification section's real evidence.
- Do not fabricate a working-looking filter that has no real effect on the query — this exact failure mode is why this feature is being revisited.
- Do not use literal blue for the Clear All button or any other accent — MedBook AI teal per `design_system_profile.json`.
- Do not invent a `phone_call` or `whatsapp` booking-source value if inventing it would leave it permanently unmatched by real data — either wire it to a real, correctly-populated value, or clearly report the gap instead of shipping a decorative, non-functional filter option.

Report back the Part 0 diagnosis, your Status/Source reconciliation decisions, and the full Verification section with real, specific evidence for every step.
