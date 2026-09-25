# ENHANCEMENT PROMPT — Dashboard Redesign (Header, Empty States, Upcoming Appointments, Recent Activity, Quick Actions)
**Target tool:** OpenCode
**Type:** UI/content restructure on the Dashboard page only — zero functional/logic changes to underlying data, routes, or other pages.
**Design authority:** `design_system_profile.json` (attached alongside this prompt) — this is now the authoritative design system for this project going forward. Save it into the repo (e.g. `docs/design-system.json` or wherever design references already live) and reference it for this task and every future UI task.

---

## 0. IMPORTANT — READ BEFORE STARTING
- Do **not** change any business logic, data fetching, server actions, or API routes — every number, list, and status shown must continue to come from real, existing data (Phase 9's analytics queries, Phase 3's appointments, etc.). This is a **presentation and content-layout change only**.
- Do **not** break the global header/sidebar work already done in earlier enhancement prompts — this task is scoped to the **Dashboard page's own content area**, below the shared header/sidebar.
- Before writing any code: inspect the current Dashboard page structure exactly as it exists today (the "Dashboard" heading text, the analytics cards from Phase 9, the `MediFlow / owner / /mediflow-com · Timezone: UTC` block, the current "Next Appointment" widget, and the current Recent Activity / Quick Actions sections if they exist in any form) — report findings before restructuring, so nothing gets silently dropped that shouldn't be.

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect already established across this project, now also applying UI/UX design-system discipline: every color, spacing value, type size, card style, and empty-state pattern used in this task must come from `design_system_profile.json`, not be invented ad hoc.

## 2. OBJECTIVE
Restructure the Dashboard page's content (top-to-bottom): clinic-name greeting header → analytics cards (kept, restyled to the design system) → remove the redundant clinic-info block → full-width paginated Upcoming Appointments list → two-column Recent Activity + Quick Actions section — all using real existing data, styled per `design_system_profile.json`.

## 3. SCOPE (top to bottom, exactly matching the requested order)

### A. Page Header — replace "Dashboard" heading with clinic greeting
- Currently, the Dashboard page's top-left area shows the literal word "Dashboard" as a heading. Replace this with a dynamic greeting using the **real, current clinic's name** (from the existing clinic data already available on this page/route — do not hardcode "ClinicFlow" or any example name):
  ```
  Hey, {clinic_name}
  Here's what's happening at your Organization today.
  ```
- Style per `design_system_profile.json` → `typography.scale.pageTitle` (24px, weight 600) for the "Hey, {clinic_name}" line, and `typography.scale.body` (14px, textSecondary) for the subtitle line.
- This is a **display-only change** — the clinic name must come from the same real data source already powering the rest of the dashboard (e.g. whatever query already provides the clinic context to this page).

### B. Analytics Cards — keep exactly as-is functionally, restyle only
The following cards and their real data logic **stay completely unchanged** — do not touch their underlying queries/values:
- Appointments today
- This week
- New patients this week / 15 this month
- Cancellation rate (Last 30 days)
- No-show rate (Last 30 days)
- AI booking rate (Booked by your AI receptionist · last 30 days)
- Website booking rate (Booked via your website widget · last 30 days)
- Bookings trend (chart, last 30 days)

Apply `design_system_profile.json` styling only:
- Card container: `patterns.dataDisplay.statCards` (4-column grid on desktop), card radius/padding per `spacing.componentSpacing.cardPadding` (24px) and the general card border-radius (12px per `cursorInstructions.keyPrinciples`).
- Metric number: `typography.scale.cardMetricValue` (28px, weight 700).
- Metric label: `typography.scale.cardMetricLabel` (14px, weight 500, textSecondary).
- Comparison/sub-text (e.g. "Last 30 days", percentage deltas): `typography.scale.small` (12px, textTertiary), with positive-change indicators using `colorPalette.semantic.success` and any negative-change indicators using `colorPalette.semantic.danger` (check if this dashboard shows negative deltas at all today — if not, this is just future-proofing, no need to invent a scenario).
- Icon badges inside cards: colored circle backgrounds per the existing pattern in the reference screenshot (each metric's icon in a small colored square/circle) — use `colorPalette.brand.primary` or contextually appropriate semantic colors, consistent with `iconography` (outlined icons, 20px, inherit or colored per status).

### C. REMOVE the redundant clinic-info block
- Directly below the analytics cards, there is currently a block showing:
  ```
  MediFlow
  owner
  /mediflow-com · Timezone: UTC
  ```
- **Delete this block entirely** from the Dashboard page. This information is redundant now that the clinic name appears in the header greeting (Section A), and role/slug/timezone belong in Clinic Settings, not the dashboard. Confirm this doesn't remove any component that's reused elsewhere (e.g. if this is a shared component also used on another page, only remove its usage on the Dashboard, don't delete the component itself if it's needed elsewhere).

### D. Upcoming Appointments — full-width, paginated list (replaces the current single "Next Appointment" widget)
- Replace the current "Next Appointment" single-item widget with a **full-width "Upcoming Appointments" section** showing the next appointments directly in a list (not just the single next one).
- Show the **first 5–6 upcoming appointments** by default, each row showing the same kind of detail currently shown for the single next appointment (time, patient name, status, doctor/service — reuse the exact same data fields already displayed today, just repeated as a list of rows instead of one item).
- **Pagination**: below the list, show page number controls (e.g. `1 2 3 ...` or `Previous / Next`) to browse further upcoming appointments rather than loading all of them at once — implement this as a real paginated query (reuse Phase 3's appointments-fetching logic with pagination, matching the pattern already established in Phase 4's Patient Directory pagination) — do not fetch all appointments and paginate client-side if the existing pattern uses server-side pagination elsewhere.
- **Empty state** (when there are no upcoming appointments at all): follow `design_system_profile.json` → `components.emptyState` exactly — faded/outlined icon (40–60px) centered, grey title ("No upcoming appointments"), centered, no fabricated content.
- Section heading style: `typography.scale.sectionTitle` (18px, weight 600).

### E. Recent Activity + Quick Actions — two-column row below Upcoming Appointments
**Left column — Recent Activity:**
- If a real activity/event log already exists in this codebase (e.g. Phase 9's observability logging, or any audit-trail table from earlier phases), use it to populate this list with real recent events (new bookings, cancellations, payments, etc.) — most recent first, reasonably limited (e.g. last 5–10 events).
- If no such real activity/event source currently exists or is queryable for this purpose, **do not fabricate activity data** — show the honest empty state per `design_system_profile.json` → `components.emptyState`: centered faded icon, "No recent activity" grey heading, centered. Report back which case applies (real data was available and wired in, vs. empty-state-only because no source exists yet) rather than inventing content either way.

**Right column — Quick Actions:**
A list of action rows, each with an icon, label, and a right-arrow affordance, linking to **real, existing** destinations only:
1. **Schedule New Appointment** → links to `/app/appointments?new=consultation` (the existing appointment-creation entry point already wired in an earlier enhancement).
2. **Manage Reviews** → links to the Google Review settings from Addendum Phase 16, if that phase has been built in this codebase. If Phase 16 isn't built yet, either omit this action entirely or show it in a clearly-disabled/pending state — do not link to a non-existent page.
3. **View Reports** → links to the existing Analytics page/tab (Phase 9, or the Dashboard/Analytics tab combination from the earlier header enhancement).
4. **Complete WhatsApp Setup** with a **"Required"** badge → links to the WhatsApp connection section of AI Settings (Addendum Phase 12), if built. The "Required" badge should be **conditionally shown** — only appear if the clinic's WhatsApp connection status (per Phase 12's `clinic_whatsapp_config.connection_status`) is genuinely not yet connected; if already connected, either hide this action or change its label/badge to reflect the connected state (e.g. remove "Required" or show a different status) rather than always statically showing "Required" regardless of actual state. If Phase 12 isn't built yet in this codebase, omit this action or mark it clearly pending.
- Style per `design_system_profile.json`: icon badges in colored rounded squares (per the reference pattern), row hover states per `animation.transitions.hover` (150ms ease), section heading per `typography.scale.sectionTitle`.

## 4. DESIGN SYSTEM APPLICATION (apply throughout, not just where called out above)
- Colors: `colorPalette.brand.primary` (#0D9488) for primary actions/active states, `colorPalette.neutral.*` for backgrounds/text/borders, `colorPalette.semantic.*` for status indicators — do not introduce colors outside this palette.
- Typography: use the exact `typography.scale` entries referenced above; font family per `typography.fontFamily.primary` (Inter).
- Spacing: card padding, gaps, and section spacing per `spacing.componentSpacing` (cardPadding 24px, cardGap 16px, sectionGap 24px).
- Empty states: exactly per `components.emptyState` structure everywhere an empty state is needed on this page (Upcoming Appointments, Recent Activity).
- Icons: outlined/line style, 20px, per `iconography`.
- Radius: cards 12px, buttons 8px, pills 9999px per `cursorInstructions.keyPrinciples`.

## 5. DEFINITION OF DONE
- [ ] Dashboard header shows real clinic name in "Hey, {clinic_name}" + subtitle, replacing the literal "Dashboard" heading, using real data.
- [ ] All analytics cards retain their exact existing data/logic, restyled per the design system.
- [ ] The redundant `MediFlow / owner / /mediflow-com · Timezone: UTC` block is removed from the Dashboard.
- [ ] Upcoming Appointments shows a real, paginated list (5–6 per page) with a correct, styled empty state when none exist.
- [ ] Recent Activity shows real data if a source exists, otherwise an honest empty state — no fabricated content either way.
- [ ] Quick Actions links all point to real, existing destinations (or are cleanly omitted/marked pending if the target phase isn't built yet); the WhatsApp "Required" badge reflects real, live connection status, not a hardcoded label.
- [ ] Every visual choice (color, spacing, type size, radius, empty-state layout) traces back to `design_system_profile.json`.
- [ ] Zero functional regressions — every other page and every underlying data query continues to work exactly as before.

## 6. CONSTRAINTS
- Do not change any underlying data logic for the analytics cards — presentation only.
- Do not fabricate Recent Activity content or a static "Required" badge state if real data/status is available — always prefer real data or an honest empty/pending state.
- Do not link Quick Actions to placeholder or non-existent routes.
- Do not introduce colors, spacing, or type sizes outside `design_system_profile.json`.
- Do not affect the global header/sidebar from earlier enhancement prompts — this is Dashboard-content-area scoped.

## 7. PROCESS
1. Save `design_system_profile.json` into the repo and report where you placed it.
2. Audit and report the current Dashboard page structure (header text, analytics cards, the clinic-info block, current "Next Appointment" widget, existing Recent Activity/Quick Actions if any) before restructuring.
3. Confirm which of Addendum Phases 12 (WhatsApp) and 16 (Google Review) are present in this codebase, since Quick Actions depends on this.
4. Implement in order: header greeting → analytics card restyle → remove clinic-info block → Upcoming Appointments (list + pagination + empty state) → Recent Activity (real data or empty state) → Quick Actions (real links + dynamic WhatsApp badge).
5. Provide a verification checklist: confirm the header shows the correct real clinic name; confirm all analytics numbers are unchanged from before this change (same data, new styling); confirm the clinic-info block is gone; confirm Upcoming Appointments correctly paginates through more than 6 appointments if the test clinic has that many, and shows the correct empty state if none exist; confirm Recent Activity shows real events or an honest empty state; confirm every Quick Action link navigates correctly and the WhatsApp badge reflects real connection status.

Confirm your Section 0 audit and Section 7.3 phase-presence findings back to me before writing code.
