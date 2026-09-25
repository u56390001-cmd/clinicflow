# CORRECTION PROMPT — Merge Dashboard/Analytics Tabs + New Appointment Button into the Single Global Header (not a separate subheader row)

## Context
This corrects/refines the previous header enhancement prompt. Instead of a separate subheader row below the global header, the **Dashboard / Analytics tabs** and the **"+ New Appointment"** button should be part of the **same single full-width header row** — one header, not two stacked rows.

## Task

### 1. Layout adjustment
- Remove the separate "Dashboard subheader" row from the previous implementation (if already built) and instead add its two elements directly into the global header:
  - **Dashboard** / **Analytics** tab buttons — position them appropriately within the single header row (e.g. left-center area, after the logo, or wherever fits cleanly alongside the existing header elements — search, chat icon, notification bell, user dropdown — without crowding). Use your judgment for a clean single-row layout; a reasonable approach is: Logo (far left) → Dashboard/Analytics tabs (next) → search bar (flexible middle/right space) → chat icon, notification bell, user dropdown, New Appointment button (far right).
  - **"+ New Appointment"** button — place on the far right of the same header row.
- End result: **one** full-width header bar containing logo, Dashboard/Analytics tabs, patient search, chat/inbox icon, notification bell, user dropdown, and the New Appointment button — no second row beneath it for these elements.

### 2. Dashboard / Analytics tabs — same behavior as specified before
- Still reuse the existing Dashboard and Analytics routes/pages exactly as they already exist (Phase 1–3 dashboard, Phase 9 analytics) — this is a placement change only, not a behavior change from the previous prompt.
- If Analytics (Phase 9) isn't built yet in this codebase, show Dashboard as the only/active tab and note Analytics as pending, same as before.

### 3. New Appointment button — exact link target
- The button must link to: `/app/appointments?new=consultation`
- Confirm the existing Appointments page (`/app/appointments`, from Phase 3/15) already supports a `?new=consultation` query parameter to auto-open the "create appointment" flow. If it doesn't currently support this query param, add the minimal handling for it (on page load, if `?new=consultation` is present, automatically open the existing create-appointment modal/form pre-set to the consultation flow) — reuse the existing appointment-creation UI/logic exactly as built in Phase 3/15, do not build a new form.
- Style as the primary action button (existing MedBook AI primary/teal button style), matching the reference screenshot's placement (top-right of the header).

### 4. Where these appear (global vs. page-specific)
- Confirm with existing behavior: should the Dashboard/Analytics tabs and New Appointment button show on **every** page's header, or only when viewing the Dashboard/Analytics area? Per the reference screenshot, they appear specifically as part of that section's header context. If your current shared-header implementation is global (same header markup on every route), the simplest correct approach is: keep the header component itself global/shared, but conditionally render the Dashboard/Analytics tabs only when the current route is `/app/dashboard` or `/app/analytics`, while the New Appointment button can reasonably stay visible everywhere (it's a common quick action) unless that feels cluttered on unrelated pages — use judgment, but don't force irrelevant tabs to appear on, say, the Patients or Billing pages.

## Constraints
- Do not duplicate the header into two separate components/rows — one shared header component handles all of this.
- Do not change any underlying logic for Dashboard, Analytics, or appointment creation — only their placement/entry point changes.
- Keep everything from the previous header prompt (search, chat icon, notification bell, user dropdown) intact and working — this is a layout consolidation, not a rebuild.
- Maintain responsive behavior — confirm this consolidated single-row header still degrades sensibly on mobile (e.g. some elements may need to collapse into an overflow menu on narrow screens rather than breaking the layout — use your judgment for what to prioritize showing vs. collapsing on small screens).

## Verification
1. Confirm one single header row (not two) contains all elements: logo, Dashboard/Analytics tabs, search, chat icon, notification bell, user dropdown, New Appointment button.
2. Click "New Appointment" and confirm it navigates to `/app/appointments?new=consultation` and correctly auto-opens the existing appointment creation flow.
3. Confirm Dashboard/Analytics tabs still switch between the correct existing pages.
4. Confirm mobile/narrow-viewport behavior is still usable (no broken/overflowing layout).
5. Confirm zero regression on all previously-verified header functionality (search, chat icon, notifications, user dropdown, settings, logout).

Report back the final single-row header structure and confirm all verification steps pass.
