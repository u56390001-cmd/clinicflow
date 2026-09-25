# ENHANCEMENT PROMPT — Convert Top Nav to Left Sidebar + Combine "AI Test" and "AI Settings" into One Menu Item
**Target tool:** OpenCode
**Type:** UI/navigation restructure only — zero functional/logic changes.

---

## 0. IMPORTANT — READ BEFORE STARTING
This is a **pure layout/navigation refactor**. No page's underlying functionality, data logic, server actions, API routes, or feature behavior should change in any way.
- Do **not** modify any business logic, data fetching, form handling, AI orchestrator, or booking logic on any page.
- Do **not** rename any route/URL path, database table, or function unless explicitly instructed below.
- Do **not** remove any existing feature — every current top-bar link/action must still be reachable, just relocated into the new sidebar.
- Before writing any code: inspect the current top navbar component (all its links/items across every phase built so far — Dashboard, Appointments, Calendar, Patients, Services, Availability, AI (test), AI Settings, Doctors if Phase 10 is built, Inbox if Phase 14 is built, Billing if Phase 8 is built, Team/Settings if Phase 9 is built, etc.) and report the full current list before restructuring, so nothing gets dropped.

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect already established across this project. Treat this with the same care as any refactor phase (e.g. Phase 11's Notification Dispatcher refactor) — the goal is behavior-identical output through a different structural arrangement.

## 2. OBJECTIVE
1. Convert the existing top horizontal navigation bar into a **left-hand sidebar navigation** (persistent on desktop, collapsible/drawer-style on mobile), applied consistently across every authenticated `/app/*` page.
2. Combine the two currently-separate nav entries **AI Test** (`/app/ai-test`) and **AI Settings** (`/app/ai-settings`) into a **single sidebar menu item called "AI Settings"**, with the two existing pages presented as **tabs** within that one section (e.g. "Configuration" tab = current AI Settings content, "Test Assistant" tab = current AI Test chat) — both existing routes/pages/components remain functionally intact underneath; this is a navigation/grouping change, not a content merge.

## 3. SCOPE

### A. Sidebar Layout
- Persistent left sidebar on desktop (reasonable fixed width, e.g. ~240–280px), containing every item currently in the top navbar, in a sensible grouped order (e.g. Dashboard first, then day-to-day clinical items — Appointments, Calendar, Patients — then configuration items — Services, Availability, Doctors, AI Settings, Website, Billing, Team/Settings — matching or improving on the current top-bar's logical grouping).
- On mobile/narrow viewports: collapse into a drawer/hamburger-triggered sidebar (standard responsive sidebar pattern) rather than keeping a horizontal bar — confirm this doesn't break any existing mobile-responsive work from earlier phases.
- Keep the existing top header row for whatever it currently holds beyond navigation (e.g. clinic name/logo, signed-in user email, "Sign out") — this can become a slim top bar above/beside the sidebar, or be integrated into the sidebar's header area; use your judgment for the cleanest layout, but don't lose any of this information/functionality.
- Active-route highlighting in the sidebar (the current page's nav item should be visually indicated), matching whatever active-state pattern the current top nav already uses, if any.
- Apply consistently: this layout change should live in the shared `/app` layout component so every existing authenticated page picks it up automatically — do not manually edit every individual page.

### B. Combine AI Test + AI Settings
- New sidebar item: **"AI Settings"** (single entry, replacing the two separate "AI" and "AI Settings" entries currently in the top nav).
- Clicking it lands on a page with two tabs (or an equivalent sub-navigation pattern consistent with the design system):
  - **Configuration** (or similar label) — renders the existing AI Settings page's content exactly as it is today (welcome message, tone, FAQs, widget appearance, WhatsApp config if Phase 12 is built, etc.) — reuse the existing component(s) as-is, just mounted inside a tab instead of at its own top-level route.
  - **Test Assistant** (or similar label) — renders the existing AI Test chat page's content exactly as it is today — same component, same functionality, reused as-is.
- **Keep both underlying routes working** (`/app/ai-test` and `/app/ai-settings`) — either redirect them to the new combined page with the correct tab pre-selected, or have the new combined page be reachable at one of the two paths with the other redirecting to it with a tab query param (e.g. `/app/ai-settings?tab=test`). Pick whichever is simplest given the existing routing setup, but do not produce a 404 for either previously-bookmarked URL.
- No changes to what either tab's content actually does — this is purely presenting two existing pages under one grouped navigation entry.

### C. Design System Consistency
- Use the existing MedBook AI design tokens (colors, spacing, radius, Inter font) already established throughout the app — the sidebar should look like a natural extension of the current design, not a new visual style.
- This phase is explicitly **not** the broader "UI/UX design system upgrade" mentioned as a next step — keep this phase strictly to the navigation restructure; do not redesign individual page content, cards, or components beyond what's needed to accommodate the new sidebar layout.

## 4. DEFINITION OF DONE
- [ ] Every page previously reachable from the top navbar is reachable from the new left sidebar — full audit list from Section 0 confirmed, nothing dropped.
- [ ] Sidebar is persistent on desktop, collapsible/drawer on mobile.
- [ ] Active route is visually indicated in the sidebar.
- [ ] "AI Settings" is a single sidebar entry containing both the former AI Settings and AI Test pages as tabs, both fully functional exactly as before.
- [ ] Both `/app/ai-test` and `/app/ai-settings` URLs still resolve correctly (no 404s), whether via redirect or direct tab-aware routing.
- [ ] Zero functional regressions anywhere — every feature built in every prior phase (booking, calendar, patients, services, availability, billing, website builder, doctors, WhatsApp, inbox, etc., whichever are already built) works exactly as before, just navigated to differently.
- [ ] Layout change applied via the shared layout, not duplicated per-page.
- [ ] Consistent with existing design tokens.

## 5. CONSTRAINTS
- Do not change any business logic, data fetching, server actions, or API routes on any page.
- Do not merge the actual *content/functionality* of AI Test and AI Settings into one combined component — they remain two distinct, fully-intact pieces of functionality, just grouped under one nav entry with tabs.
- Do not remove any existing top-nav item — only relocate.
- Do not break any existing URL a user might have bookmarked.
- Do not start any broader visual redesign in this phase — that's explicitly a separate, later step per your own plan.

## 6. PROCESS
1. Audit and report the complete current top-nav item list and their exact routes before restructuring.
2. Propose the new sidebar's item grouping/order and the AI Settings/AI Test tab combination approach (redirect strategy) before implementing.
3. Implement: shared sidebar layout component → responsive (mobile drawer) behavior → migrate every nav item → combine AI Settings/AI Test into tabs with working redirects for both old URLs → verify active-route highlighting.
4. Provide a verification checklist: click through every sidebar item and confirm it lands on the correct, fully-functional existing page; visit both `/app/ai-test` and `/app/ai-settings` directly by URL and confirm both resolve correctly to the right tab; test on a narrow mobile viewport and confirm the drawer/collapse behavior works; spot-check at least 3 other pages (e.g. Appointments, Calendar, Billing) to confirm zero functional regression, only navigation changed.

Confirm your understanding and the Section 0 nav-item audit back to me before writing code. Once this is verified, we'll move to the broader UI/UX design-system pass as a separate next step.
