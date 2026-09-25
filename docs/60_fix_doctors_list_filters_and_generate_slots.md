# FIX/POLISH PROMPT — Doctors List UI Cleanup, Filters Dropdown, and Fix "Generate Slots" Functionality (+ Reuse in Services Tab)

## Context
Three things need attention on the Doctors tab:
1. The Doctors list/table view (`t26.JPG`) needs a clean, professional UI pass — confirm column structure/order matches this reference, and polish spacing/alignment if it currently looks rough.
2. The Filters dropdown (also visible open in `t26.JPG`) needs to match this exact structure: four filter blocks — **Specialty** (dropdown, "All Specialties"), **Status** (dropdown, "All Status"), **Experience** (dropdown, "All Experience"), **Rating** (dropdown, "All Ratings") — laid out horizontally, plus a **"✕ Clear Filters"** button.
3. **Most important — likely a real bug**: the "Generate Slots" feature in the Add Doctor modal (`t25.JPG`) currently shows *"No slots yet — generate above or add a custom one"* even after presumably clicking Generate Slots. Confirm the exact intended behavior and fix it if broken: selecting a **Time Range** (e.g. 09:00 AM to 01:00 PM) + a **Slot Duration** (e.g. 30 min) and clicking **"⚡ Generate Slots"** must compute and display the resulting individual slots (Slot A: 09:00–09:30 AM, Slot B: 09:30–10:00 AM, etc., continuing until the end time), each with an editable name, editable start/end time, and a delete icon — replacing the empty state, not leaving it showing.

## Part 1 — Doctors List View Polish
1. Confirm the current table's column order/content matches `t26.JPG` exactly: **Doctor** (avatar + name + specialty sub-label), **Specialty**, **Experience**, **Rating** (star icon + number), **Fee**, **Availability** (working-day pills, active days highlighted in teal, inactive muted), **Status** (Active/Inactive pill), **Actions** (eye/view icon, pencil/edit icon, active toggle switch).
2. Clean up spacing, row height, alignment, and hover states per `design_system_profile.json` conventions already used elsewhere in this project's tables (e.g. the Appointments table) — this should look and feel consistent with those, not like a separately-styled component.
3. Confirm horizontal scroll behavior (visible in `t26.JPG`'s bottom scrollbar) works smoothly on narrower viewports without breaking column alignment.

## Part 2 — Filters Dropdown (Doctors view)
Build/confirm exactly this structure, opening below the "Filters" button:
- **Specialty** — dropdown, default "All Specialties", populated from real specialty values used by the clinic's actual doctors (or the configured specialty list from Phase 20/21).
- **Status** — dropdown, default "All Status", options: Active / Inactive (mapping to `is_visible`/active toggle).
- **Experience** — dropdown, default "All Experience" — a reasonable set of experience-range buckets (e.g. "0–5 years," "5–10 years," "10+ years") derived from real `years_of_experience` data, or a simpler min-value filter if ranges feel over-engineered — use your judgment for the simplest correct implementation.
- **Rating** — dropdown, default "All Ratings" — only meaningful once a real rating system exists (per Phase 21's note that ratings shouldn't be fabricated); if no real rating source exists yet, this filter can remain present but functionally inert (always returns all doctors) until ratings are real — don't fabricate rating data to make this filter "work."
- **"✕ Clear Filters"** button — resets all four to their defaults and returns the list to unfiltered.
- **Functional requirement** (per the established standard from the Appointments Filters fix): every filter must have a real, verifiable effect on the displayed doctor list — not just visual dropdown state.

## Part 3 — Fix "Generate Slots" (the core bug/completion task)

### Step 1 — Diagnose
1. Locate the current Generate Slots implementation in the Add Doctor modal (Phase 20).
2. Determine why it's not populating the slot list: is the button's click handler not firing at all? Does it fire but fail to compute slots correctly (e.g. an off-by-one error, a timezone/parsing bug in the start/end time inputs)? Does it compute correctly but fail to update the UI state that renders the slot list? Capture the exact real behavior (add temporary logging if needed) before fixing.
3. Report the exact root cause before applying a fix.

### Step 2 — Fix
- Correct calculation: given Start Time, End Time, and Slot Duration (minutes), generate sequential slots covering the full range (e.g. 09:00 AM–01:00 PM at 30 min → 8 slots: 09:00–09:30, 09:30–10:00, ... 12:30–01:00). Handle a remainder correctly (e.g. if the range doesn't divide evenly, either drop the incomplete trailing slot or include it as a shorter final slot — pick one consistent, sensible behavior and note your choice).
- Auto-generated slots get default names (Slot A, Slot B, Slot C, ...) but remain editable.
- Each slot row must render with a delete (trash) icon that removes just that slot from the list.
- The **"+ Add Custom Slot"** button must add a new, blank/default slot row that the user can manually fill in and edit — independent of the Generate Slots calculation, addable at any time (before or after generating).
- Clicking "Generate Slots" again after slots already exist should sensibly either replace the auto-generated set (keeping any manually-added custom slots, if you can cleanly distinguish them) or append — confirm and note your chosen behavior; replacing the auto-generated portion while preserving custom slots is the more sensible default if easily achievable, otherwise a simple full-replace with a clear "this will replace existing generated slots" affordance is an acceptable simpler alternative.

## Part 4 — Reuse the Same Slot Feature in the Services Tab (per Phase 21)
- Confirm the exact same Time Range + "Add another time range" + Slot Duration + "⚡ Generate Slots" + generated-slot-list (with delete) + "+ Add Custom Slot" component is used identically in the Add/Edit Service modal's "Availability & Slots" section (Phase 21) — this must be the **same shared component**, not a second, separately-built copy, so this bug fix automatically applies to both places.
- If Services currently has its own separate, non-shared implementation of this slot logic, consolidate it to use the same fixed component from Part 3.

## Verification Checklist
1. Confirm the Doctors list view visually matches `t26.JPG`'s column structure and looks clean/professional/consistent with the rest of the app.
2. Open Filters and confirm all four dropdowns + Clear Filters render and function correctly (real filtering effect where real data exists; Rating filter honestly inert if no real rating data exists yet).
3. In the Add Doctor modal, select a working day, set a time range (e.g. 09:00 AM–01:00 PM) and slot duration (e.g. 30 min), click Generate Slots, and confirm the correct list of slots actually appears (not the "No slots yet" empty state) with correct times.
4. Delete one generated slot and confirm only that one is removed.
5. Click "+ Add Custom Slot" and confirm a new editable slot row appears correctly.
6. Repeat steps 3–5 in the Add/Edit Service modal and confirm identical, correctly-working behavior (proving the shared component is genuinely reused, not duplicated).
7. Save a doctor/service with generated slots and confirm the slots persist correctly and are reflected in real availability/booking behavior.

## Constraints
- Do not duplicate the slot-generation component between Doctors and Services — one shared component, fixed once.
- Do not fabricate rating data to make the Rating filter appear functional.
- Do not change any other part of the Add Doctor/Add Service modals not related to this fix.
- Do not disable RLS or change unrelated booking logic.

Report back: the exact root cause found for the Generate Slots bug, your chosen behavior for uneven time-range division and for re-generating after slots already exist, and confirm every item in the Verification Checklist with real evidence.
