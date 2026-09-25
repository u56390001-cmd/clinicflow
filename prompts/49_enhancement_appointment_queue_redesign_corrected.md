# ENHANCEMENT PROMPT (CORRECTED) — Redesign "Queue" Tab into This Exact Reference Design, Rename to "Appointment", Remove Old "Appointment" Tab Entirely
**Target tool:** OpenCode
**Type:** UI redesign of one existing tab + removal of another existing tab.
**Design authority:** `design_system_profile.json` (colors/typography/spacing only — MedBook AI's own teal branding, not the reference screenshot's exact colors).
**Reference screenshots:** `APP_3.jpg` + `APP2.jpg` — these two screenshots are **one single reference page** (shown as two states/scroll-positions of the same design), not two different pages. This is the exact target design for the rebuilt tab.

---

## 0. CLARIFICATION (supersedes the previous, more complicated version of this prompt)
This is simpler than previously scoped:
1. The project currently has **two separate tabs**: an existing **"Appointment"** tab (old design, different from the reference) and an existing **"Queue"** tab (Phase 17's check-in/queue feature).
2. **Redesign the "Queue" tab's UI** to match the reference screenshots exactly (structure below) — this becomes the one and only appointments-management experience in the app.
3. **Rename this tab to "Appointment"** (in the sidebar and its route/URL if reasonable — confirm with existing routing conventions).
4. **Completely remove the old, separate "Appointment" tab** (its old page/component/route) — it is fully replaced by the redesigned-and-renamed former "Queue" tab. Nothing from the old Appointment tab's *visual design* needs to be preserved, since the reference design already covers stat cards, status browsing, search/filter/export, and the live queue view all in one place.
5. Fix any internal links currently pointing to the old "Appointment" tab's route so they point to the new, renamed one instead.

If anything below is still unclear once you start implementing, ask me before guessing — this is explicitly requested by the user.

## 1. THE TARGET DESIGN (from the reference screenshots — build exactly this)

**Top summary row:** four stat cards — **Today**, **Confirmed**, **Pending**, **Cancelled** — each with a count and a small icon, per `design_system_profile.json`'s stat-card pattern (icon badge, bold metric value, label).

**Toggle row:** a **Consultations / Services** toggle (pill-style two-option switch) — confirm what this actually filters in the current data model (consultation-type appointments vs. service/diagnostic bookings, per Addendum Phase 15) and wire it to that real distinction.

**Sub-tabs:** **Today | Upcoming | Completed | All | Cancelled** — horizontal tab row, active tab underlined/highlighted per the design system's tab pattern, each showing genuinely filtered real data (not the same list repeated).

**Header controls (same row as sub-tabs or just below):** Search input ("Search..."), a Filters control, an Export action — reuse real, working search/filter/export logic if it already exists anywhere in the project (old Appointment tab or elsewhere); if none of this currently exists functionally, implement search (by patient name at minimum) and a basic status/date filter for real; Export can be a simple CSV export of the currently filtered list if not already implemented elsewhere.

**Content area — depends on which sub-tab is active:**
- **"Today" sub-tab** → the **queue/check-in view** (per `APP2.jpg`): grouped sections **"In Consultation (N)"** and **"Not Yet Arrived (N)"**, each listing patients with avatar-initials, doctor name, time range, and — for Not Yet Arrived — a **"Check In"** action button (reuse Phase 17's exact, existing check-in logic — do not rebuild it). "In Consultation" shows an honest empty state ("No patient in consultation right now / Check in a patient to begin") when empty, matching `components.emptyState`.
- **"Upcoming" / "Completed" / "All" / "Cancelled" sub-tabs** → the **table view** (per `APP_3.jpg`): columns **Patient | Doctor | Date & Slot | Token | Status | Actions**, styled per `design_system_profile.json` (`typography.scale.tableHeader` for headers, status pills using `colorPalette.semantic.*`). Each sub-tab reuses the real, existing appointment-fetching logic filtered to the correct status/date range (reuse whatever query already powers the old Appointment tab's equivalent views — don't rewrite working queries, just re-host them here).
- **Token column**: per the earlier established rule (Phase 17/45), do not fabricate token numbers — show the real token if a queue/check-in has assigned one for that appointment, otherwise a neutral placeholder (`—`).

## 2. COLOR/BRANDING CORRECTION
The reference screenshots use a blue/purple color scheme (e.g. blue "Check In" buttons, blue active-tab indicators) — **do not copy these colors**. Every color in the rebuilt tab must come from `design_system_profile.json`: MedBook AI's primary teal (`colorPalette.brand.primary`, #0D9488) for primary actions/active states (including the "Check In" button and active tab underline), and the established neutral/semantic palette for everything else (status pills, borders, backgrounds).

## 3. SCOPE OF WORK
1. Audit: locate the current "Appointment" tab's route/component and the current "Queue" tab's route/component; confirm all data-fetching logic each currently uses (today/upcoming/completed/cancelled/all queries, check-in logic, any existing search/filter/export). Report findings before implementing.
2. Rebuild the Queue tab's UI to the exact structure in Section 1, reusing real existing data logic wherever it already exists (from either the old Appointment tab or Phase 17's Queue implementation) rather than writing new queries from scratch.
3. Rename this tab to "Appointment" in the sidebar (and route, if reasonable given existing conventions).
4. Delete the old, separate "Appointment" tab's page/component/route entirely.
5. Fix every internal link in the app (Dashboard widgets, Quick Actions, any other page) that currently points to the old Appointment route, so they point to the new unified tab instead.

## 4. DEFINITION OF DONE
- [ ] Exactly one appointments-related sidebar entry, labeled "Appointment", matching the reference design's full structure (stat cards, toggle, sub-tabs, search/filter/export, Today = queue view, other sub-tabs = table view).
- [ ] Old separate "Appointment" tab/route/component fully removed.
- [ ] Today sub-tab's Check-in action works exactly as Phase 17 built it — no logic changes, just restyled/repositioned.
- [ ] Upcoming/Completed/All/Cancelled sub-tabs show correct, real, differently-filtered data (not duplicates of each other).
- [ ] All colors are MedBook AI teal/design-system colors — zero blue/purple from the reference screenshots.
- [ ] Every internal link that pointed to the old Appointment route now correctly points to the new one.
- [ ] Token column honestly shows real tokens or a neutral placeholder — never fabricated numbers.
- [ ] Zero functional regression — every real capability from both the old Appointment tab and the Queue tab still works, just unified under this one redesigned, renamed tab.

## 5. CONSTRAINTS
- Do not invent new business logic — reuse existing check-in, appointment-fetching, and (if present) search/filter/export logic.
- Do not copy the reference screenshots' colors — MedBook AI teal/design-system palette only.
- Do not leave the old "Appointment" tab in place alongside the new one — it must be fully removed, not just hidden from navigation.
- Do not break any existing link into the appointments area from elsewhere in the app.

## 6. VERIFICATION
1. Confirm only one "Appointment" entry exists in the sidebar, and it renders the full reference-matching layout.
2. Check in a "Not Yet Arrived" patient on the Today sub-tab and confirm it works exactly as before (moves to In Consultation state correctly, per Phase 17).
3. Switch through Upcoming/Completed/All/Cancelled and confirm each shows correct, genuinely different real data.
4. Confirm search/filter/export work if implemented.
5. Confirm every other page's links into appointments (Dashboard, Quick Actions, etc.) still navigate correctly to the new unified tab.
6. Confirm no blue/purple reference colors remain anywhere — MedBook AI teal throughout.

If any part of this is still ambiguous once you begin, stop and ask rather than guessing. Report your Section 3.1 audit findings back to me before writing code.
