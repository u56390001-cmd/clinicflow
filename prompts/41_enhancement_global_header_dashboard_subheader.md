# ENHANCEMENT PROMPT — Add Global Top Header + Dashboard Subheader
**Target tool:** OpenCode
**Type:** UI addition only — zero functional/logic changes to existing features. This complements (does not replace) the earlier left-sidebar navigation restructure.
**Reference:** Attached screenshot (Doxmate dashboard) — use ONLY as a layout/UX reference. Do not copy Doxmate's branding, exact copy, logo, or colors — use MedBook AI's own branding and existing design tokens.

---

## 0. IMPORTANT — READ BEFORE STARTING
- Do **not** change any business logic, data fetching, server actions, or API routes on any page.
- Do **not** remove or duplicate the left sidebar navigation (built in the earlier sidebar restructure) — this header sits **above/alongside** it, not instead of it. In the reference screenshot, the layout is: full-width top header bar, then below it a left sidebar + main content area side by side.
- **Design system file**: the user has referenced a separate JSON-format design system file for this update. Check the repository (e.g. `design.md`, a `design-tokens.json`, or similar) for whether this file already exists in the project. If you find it, use it as the authoritative source for colors/spacing/typography for this work. If no such JSON file exists in the repo, use the existing `design.md` tokens already established throughout the project (Phases 1–9) instead, and note back to me that the JSON file wasn't found so I can supply it if one genuinely exists separately.
- Before writing any code: inspect the current top-of-page structure (post-sidebar-restructure), the existing patient search functionality (Phase 4), the existing sign-out logic (Phase 1), the existing user/session data available client-side (name, email), and confirm whether an Inbox (Phase 14) and any notification/observability system (Phase 9) currently exist — report findings, since the header's Chat icon and Notification bell depend on what's actually built.

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect already established across this project.

## 2. OBJECTIVE
Add a full-width, persistent **top header** across all authenticated `/app/*` pages (logo, patient search, chat/inbox icon, notification bell, user account dropdown), and a **page subheader** for the Dashboard area (Dashboard/Analytics tab switcher + primary "New Appointment" action) — matching the layout structure of the reference screenshot, using MedBook AI's own branding, existing design tokens, and existing functionality underneath.

## 3. SCOPE

### A. Global Top Header (applies to every `/app/*` page via the shared layout)
**Left side:**
- MedBook AI logo/wordmark — reuse exactly what's already there today (per the user: this part is already correct) — no change needed here beyond confirming it sits correctly in the new full-width header bar.

**Right side, in this order:**
1. **Patient search bar** — a search input ("Search by patient name or phone...") that queries existing patients for the current clinic. Reuse Phase 4's patient search logic/server action (do not build a second, separate search implementation) — this can be a lightweight global quick-search that reuses the same query function, showing a dropdown of matching results that link to each patient's profile (`/app/patients/[id]`).
2. **Chat/Inbox icon** — a message/chat icon button that links to the existing Inbox (`/app/inbox` from Phase 14) if that phase has been built. If Phase 14 is not yet built in this codebase, implement the icon as present-but-disabled (or simply omit the link target and note it back to me) rather than linking to a non-existent route — do not fabricate a page for this.
3. **Notification bell icon** — check first whether any notification/event system already exists (e.g. Phase 9's observability logging) that could realistically back a notification dropdown. If nothing suitable exists yet, implement this as a **UI-only placeholder** for this phase (icon present, no badge count wired to fake data, clicking shows an empty/"No notifications yet" state) rather than inventing fake notification data — building a real notification feed is a separate, future scope; flag this back to me rather than fabricating content.
4. **User account dropdown** — avatar/initial + name, opening a menu showing:
   - User's display name (from the existing session/user data)
   - User's email (from the existing session/user data)
   - **Settings** — link to wherever the actual settings page lives in the current sidebar (Phase 9's team/clinic settings, or Phase 2's clinic settings — confirm the correct existing route and link to it exactly; do not create a new settings page).
   - **Logout** — call the existing, already-implemented sign-out function from Phase 1 (do not reimplement).

### B. Dashboard Subheader (page-level, applies specifically to the Dashboard/Analytics area)
Per the reference screenshot, this subheader sits directly below the global header, above the page content, specifically on the Dashboard:
- **Left side**: two tab-style buttons — **Dashboard** and **Analytics** — switching between the existing Dashboard view (Phase 1–3's dashboard) and the existing Analytics view (Phase 9), if Analytics is a separate route today. If Dashboard and Analytics are currently two separate pages/routes, this subheader becomes the tab-switcher between them (reuse existing routes, just add this as the visible tab UI — similar in spirit to the AI Settings/AI Test tab-combination done in the earlier sidebar-restructure prompt). If Analytics doesn't exist as a separate page yet (Phase 9 not built), implement just the "Dashboard" tab as active/selected and note Analytics back to me as pending.
- **Right side**: a primary **"+ New Appointment"** button, styled as the primary action button (existing MedBook AI primary/teal button style) — clicking it opens the existing appointment creation flow (reuse Phase 3/15's existing "create appointment" form/modal — do not build a new one).

## 4. DESIGN SYSTEM
- Use the project's existing design tokens (JSON file if found per Section 0, otherwise `design.md`): primary teal, secondary, surface/background colors, Inter font, existing button/card radius conventions.
- Match the reference screenshot's **layout structure** (element placement, spacing rhythm, icon-button sizing) but render everything in MedBook AI's own color palette and branding — do not copy Doxmate's blue/purple color scheme, logo, or exact visual style.
- Header should have a clear visual separation from the page content below it (e.g. subtle border-bottom or shadow), consistent with how cards/surfaces are already styled elsewhere in the app.

## 5. DEFINITION OF DONE
- [ ] Global top header present on every authenticated page, coexisting correctly with the existing left sidebar (not replacing it).
- [ ] Patient search in the header works and reuses existing Phase 4 search logic — no duplicated search implementation.
- [ ] Chat/Inbox icon correctly links to the real Inbox route if it exists, or is clearly flagged as pending if Phase 14 isn't built yet.
- [ ] Notification bell is present with an honest empty/placeholder state — no fabricated notification data.
- [ ] User dropdown shows real name/email from the actual session, Settings links to the real existing settings page, Logout calls the real existing sign-out function.
- [ ] Dashboard subheader shows working Dashboard/Analytics tabs (or Dashboard-only with Analytics flagged as pending) and a working "New Appointment" button that opens the existing, real appointment-creation flow.
- [ ] Zero functional regressions — every previously-working feature still works exactly as before.
- [ ] Visually consistent with existing MedBook AI design tokens, not Doxmate's branding/colors.

## 6. CONSTRAINTS
- Do not change any business logic, routes, or data-fetching behavior — this is additive UI only.
- Do not duplicate the patient search, sign-out, or appointment-creation logic — reuse what already exists.
- Do not fabricate notification data or link to non-existent pages (Inbox/Analytics) — if a dependency isn't built yet in this codebase, implement the header element in a clearly pending/disabled state and report it back rather than faking functionality.
- Do not copy Doxmate's colors, logo, or exact copy — MedBook AI's own branding and design tokens only.
- Do not remove or restructure the left sidebar from the earlier navigation refactor.

## 7. PROCESS
1. Report findings on: whether a JSON design-system file exists in the repo, current session/user-data access pattern, existing patient search function, existing sign-out function, existing settings route, and whether Phase 14 (Inbox) and Phase 9 (Analytics) are present in this codebase.
2. Propose the exact header/subheader component structure and where it plugs into the shared layout before implementing.
3. Implement: global header component (logo + search + chat icon + notification bell + user dropdown) → wire each piece to real existing functionality per Section 3A → Dashboard subheader (tabs + New Appointment button) → verify layout coexists correctly with the sidebar.
4. Provide a verification checklist: header appears on every page correctly; patient search returns real results and navigates to the right profile; chat icon and notification bell behave honestly per what's actually built; user dropdown shows correct real name/email and Settings/Logout both work correctly; Dashboard subheader tabs and New Appointment button work; confirm no regression on at least 3 other existing pages.

Confirm your Section 0 findings back to me before writing code.
