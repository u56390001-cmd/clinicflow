# FIX PROMPT — CRITICAL: New Appointment Booking Broken + Consultations/Services Toggle Not Working (Regression from Old Appointment Page Removal)

## Context
After removing the old, separate "Appointment" tab/page during the recent consolidation, two more things broke:
1. **New appointments cannot be booked at all** — the "+ New Appointment" action (and/or the `/app/appointments?new=consultation` entry point wired in earlier header work) no longer successfully creates an appointment. This strongly suggests the appointment-creation modal/form/logic lived on or was tightly coupled to the old page component that got deleted.
2. The **Consultations / Services toggle** on the unified Appointments page doesn't correctly work — per the tutorial's described behavior, this should distinguish/filter between consultation-type bookings and service/diagnostic bookings (Addendum Phase 15's two booking workflows), but it currently isn't functioning properly.

This is the **highest priority fix** in this project right now — booking appointments is core functionality and must work.

## Part 1 — Restore Appointment Booking (CRITICAL)

### Step 1 — Diagnose (do not guess-and-patch)
1. Search the codebase for the appointment-creation modal/form/component that was used by the old Appointment page and by the `?new=consultation` query-param handling (from the earlier header enhancement work) and by Addendum Phase 15's manual booking form.
2. Determine exactly what broke:
   - Was the appointment-creation component itself deleted (not just the old page's list/table UI around it)?
   - Is the component still present but no longer imported/mounted anywhere reachable (orphaned code)?
   - Is the `?new=consultation` query-param handler still present but pointing at a route/component that no longer exists or no longer triggers the modal?
   - Is the "+ New Appointment" button (in the global header, per earlier work) still correctly wired to the right URL, and does that URL still lead to a working trigger?
3. Attempt to actually create an appointment through the current UI and capture the exact failure (does the button do nothing? does a modal open but fail to submit? is there a console/server error? reuse the "surface the real error" discipline from earlier fixes in this project — log the actual error, don't guess).
4. Report the precise root cause before fixing.

### Step 2 — Fix
- The core appointment-creation logic (Zod validation, `checkSlotAvailability()`, the actual DB insert — from Phase 3/10/15) must **not** have been deleted; if it was, this is a serious regression and must be restored using the same, already-proven logic (do not write new booking logic from scratch — if it's genuinely gone, restore it from what's documented in this project's Phase 3/10/15 specifications).
- If only the **UI trigger/mounting point** was lost (most likely scenario): re-wire the appointment-creation modal/form so it correctly opens from:
  - The global header's "+ New Appointment" button (`/app/appointments?new=consultation`).
  - Any "New Appointment"/"Schedule New Appointment" action within the unified Appointments page itself (e.g. a button on the Today view or elsewhere appropriate).
  - Confirm the modal correctly closes and refreshes the relevant list/queue view after a successful booking (so a newly-booked appointment actually shows up without a manual page reload).

## Part 2 — Fix the Consultations / Services Toggle

### Step 1 — Confirm intended behavior
Per Addendum Phase 15 and the tutorial's description, this toggle should distinguish between:
- **Consultations** — standard doctor appointments (`consultation_type` field from Phase 15, or simply the default appointment flow).
- **Services** — service/diagnostic bookings (tied to a specific `service_id` that represents a diagnostic/procedure rather than a general consultation).
Confirm exactly how the current data model distinguishes these two (a field on `appointments`, a category on `services`, or something else) before wiring the toggle — report this before implementing, since the fix must filter on a real, existing distinction, not an invented one.

### Step 2 — Fix
- Wire the toggle so that switching between "Consultations" and "Services" **actually filters** the currently-displayed appointment list (whichever sub-tab is active — Today/Upcoming/Completed/All/Cancelled) to only show the matching type — this must have a real effect on the query, not just a visual toggle state with no consequence (same class of bug as the Filters dropdown fixed previously — verify this one is genuinely wired to the data this time).
- If the "New Appointment" modal/form should also respect this toggle's context (e.g. clicking "New Appointment" while on the "Services" toggle pre-selects the Service booking flow from Phase 15, vs. "Consultations" pre-selecting the standard consultation flow) — implement this if it's a natural, low-effort connection; otherwise keep them independent and note that decision.

## Verification Checklist (must all pass — this is a critical-path fix)
1. Click "+ New Appointment" from the global header and confirm the booking modal/form opens correctly.
2. Complete a full booking (patient, doctor if applicable, service, date/time) and confirm it succeeds with no error.
3. Confirm the newly-created appointment actually appears in the correct sub-tab (Today if booked for today, Upcoming otherwise) without requiring a manual page refresh.
4. Confirm double-booking protection (`checkSlotAvailability()`) still correctly rejects an invalid/conflicting slot during this flow.
5. Toggle between "Consultations" and "Services" and confirm the visible appointment list actually changes to show only the correct matching type in each state.
6. Confirm this didn't break anything fixed in the previous prompt (In Consultation/Not Yet Arrived sections, Filters dropdown) — re-test those quickly as a regression check.
7. Book at least one appointment via each relevant existing booking source if easily testable (dashboard manual booking, AI widget) to confirm the core booking pipeline is genuinely restored end-to-end, not just the UI trigger.

## Constraints
- Do not write new, parallel appointment-creation logic — restore/re-wire the existing, already-proven Phase 3/10/15 logic.
- Do not invent a new Consultation/Service distinction if a real one already exists in the data model — use the real one.
- Fix the root cause (missing mount point / broken trigger / actually-deleted logic) — do not paper over this with a workaround that bypasses proper validation or double-booking protection.
- This is the top-priority fix in the project right now — verify thoroughly before reporting it as resolved, per this project's established rule of not claiming "fixed" without evidence.

Report back: the exact root cause found in Part 1 Step 1 (deleted logic vs. lost UI trigger vs. broken route), the real data-model field used to distinguish Consultations vs. Services (Part 2 Step 1), and confirm every item in the Verification Checklist passes with actual evidence (e.g. a real appointment successfully created and visible in the list).
