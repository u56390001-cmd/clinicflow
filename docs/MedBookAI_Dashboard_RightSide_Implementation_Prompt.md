# MedBook AI — Dashboard Right-Side UI/UX Upgrade (Production Implementation Brief)

**Role:** Act as a Principal Frontend Engineer, Senior Healthcare SaaS Product Designer, Next.js Architect, and Supabase Security Engineer.

**Project:** Existing MedBook AI / ClinicFlow multi-tenant clinic management application.

**Approved visual reference:** `MedBookAI_Dashboard_UX_Mockup.html` — provide this file to the coding agent **alongside this prompt**. Use its **dashboard main-content layout, typography, color tokens, spacing, cards, status pills, and information hierarchy** as the visual source of truth. It is a *visual prototype with fictional data*, **not production business logic**. The user's existing dashboard screenshot and live repository are the functional source of truth.

## 0. Non-negotiable scope

**CHANGE ONLY THE DASHBOARD'S RIGHT-SIDE CONTENT AREA (the main dashboard overview) and, if necessary, minimal existing top-header styling that belongs to that area.**

- **Do not change, rebuild, relocate, or redesign the sidebar.** Preserve its exact existing items, sections, icons, styling, width, active states, collapse/mobile behavior, clinic logo, permissions, and navigation routes.
- **Do not change** other application pages: Appointments, Calendar, Patients, Consultations, TV Queue, Inbox, Website Builder, Settings, Billing, etc.
- Preserve existing global topbar/search behavior and auth/session state. Improve dashboard-context branding, breadcrumb/search alignment, and quick-action presentation *only if safe*, without affecting shared navigation on other routes.
- Do not rebuild any existing feature, database schema, RBAC, RLS, or backend integrations. No blanket global CSS replacements.
- The new dashboard must connect to **real, tenant-scoped existing data and actions**. Never deploy mockup's invented counts, names, appointments, messages, or activity as live data.
- **Do not overwrite tenant clinics' logos** when displaying MedBook AI branding.

## 1. Skills to use, in this order

1. **`frontend-design` — PRIMARY:** Use the approved mockup as the design reference. Build responsive, clear typography, compact healthcare workflows, balanced card density, polished status labels and hover/focus states.
2. **`ui-ux-pro-max` — DESIGN AUDIT:** Review information hierarchy, readability, consistency, data-dense layouts, loading/empty/error states, accessibility, and mobile behavior. *Refine the approved layout, not redesign it.* Use if installed/available.
3. **`shadcn-ui` / `shadcn` — COMPONENT SUPPORT:** Reuse the project's current shadcn/ui primitives (Card, Button, Tabs, Badge, Table, Tooltip, Skeleton, Dialog) where appropriate. **Do not reinitialize shadcn or replace working application components unnecessarily.**
4. **Next.js / React / TypeScript best practices:** Server Components and server-side Supabase access where suitable, minimal client components, efficient data loading, cache correctness, strong types.
5. **Supabase + security best practices:** Preserve existing tenant scoping, RLS, RBAC, and server authorization. No generic elevated-service-role reads.
6. **Playwright / browser testing:** Visually compare the delivered dashboard to the provided mockup, test desktop/tablet/mobile and functional actions. If any named skill is unavailable, state so and use equivalent established practices; don't invent installed skills.

## 2. Exact approved color scheme — replace the old teal treatment **only within this dashboard content**

Derive/apply scoped dashboard design tokens from the approved HTML:

```css
.medbook-dashboard-overview {
  --forest: #203D34;
  --deep: #162F27;
  --sage: #527A65;
  --accent: #356F59;
  --pale: #EAF3ED;
  --wash: #F4F7F3;
  --muted: #64776C;
  --ink: #23342D;
  --line: #E4EAE6;
  --paper: #FFFFFF;
  --surface: #F8FAF8;
  --orange: #BA6A22;
  --orange-wash: #FFF2E1;
  --red: #B64549;
  --red-wash: #FDEEF0;
  --blue: #466D98;
  --blue-wash: #EAF2FC;
}
```

- Visual goal: **Premium Sage + Forest Green**, soft neutral dashboard, high contrast, restrained borders/shadows.
- Do **not** apply mockup CSS globally; prevent changes to the sidebar, all other routes, and existing clinic website-builder themes.
- Clinical safety/error statuses retain meaningful red/amber/green semantic colors; distinguish color with text/icons, not color alone.
- Use current project font infrastructure if already established. Prefer **Plus Jakarta Sans for headings** and **Inter or existing compatible UI font for body**; avoid redundant font loading. Maintain readability and AA contrast.
- This is an **incremental dashboard-content theme migration**. Do not claim the whole SaaS has been rebranded in this phase.

## 3. First: inspect the real codebase; present a source-to-component mapping

Before implementation:

1. Find the live authenticated dashboard route and existing dashboard component tree. Inspect its layout, shared header, sidebar, data fetching, RBAC guards and tenant-scoping approach.
2. Inspect existing appointment, patient, check-in, consultation, queue, WhatsApp/inbox, analytics, and activity/audit models and application services. **Reuse existing queries/services/API routes**; do not guess field names, table names or statuses.
3. Confirm clinic timezone source (example clinic uses `Asia/Karachi`) and how appointments, date boundaries, patient states and historical metrics are computed.
4. Identify which mockup data fields can be connected now, which need safe derivation, and which are unsupported. **Report any blockers rather than inventing features.**
5. Identify shared components that can be reused without changing other pages, and a safe way to isolate dashboard-only styles.
6. Provide a brief implementation plan and file list before writing code, then proceed in small, reviewable steps.

## 4. Dashboard main-content structure to implement

Match this hierarchy from the approved mockup; it replaces the old eight equal-sized KPI cards and pushes operational tasks above secondary analytics.

### A. Dashboard content header

- Personalized heading: **`Good morning, {clinicName}`** (appropriate morning/afternoon/evening greeting for the authenticated clinic's timezone; fallback `Clinic` if missing).
- Subtitle: **`Your clinic at a glance — know what needs attention today.`**
- Right-aligned **clinic-local date** and working **New appointment** button that opens/navigates to the **existing** appointment-creation flow.
- Preserve existing global navigation, search, notification and user menu behavior. Do not replace functional auth-aware elements with placeholder mockup buttons.
- The mockup's **“Interactive design preview” banner must not appear in production**; it belongs only in the standalone mockup.

### B. Today's clinic flow — four primary KPI cards

Show real numbers with labels and relevant states:

1. **Appointments today** — clinic-local-date appointments, honoring the app's existing definition of canceled/no-show records.
2. **Patients waiting** — patients checked in and currently waiting according to *existing queue semantics*.
3. **In consultation** — patients actively being seen, using the app's actual visit/consultation status.
4. **Completed visits** — actual visits completed/checked out today.

**Important:** Do not derive these four counts by making up one-to-one relations between appointment status and visit status. Confirm exact statuses from the codebase. If a metric cannot be reliably derived, show an honest unavailable/empty state or omit pending proper data support.

### C. Compact secondary performance ribbon

Four secondary metrics, visually subordinate to daily clinic operations:

- New patients this week
- AI-assisted bookings (percentage)
- Website bookings (percentage)
- Cancellation rate (last 30 days)

**Define every metric precisely** from existing stored source data. Verify denominators, date ranges and event sources; handle `0` denominator with `—` / `Not enough data`, not an invented `0%`.

- AI-assisted booking attribution must originate in real booking-source data, not a guess from WhatsApp messages.
- Website booking attribution must originate in existing booking-source data.
- Cancellation rate should match the application's existing reporting definition.
- If source data is unavailable, show `Not available` or omit that secondary metric until supported. **Never hardcode sample 3%, 6%, 9%.**

### D. Today's schedule — primary actionable panel

- Real appointments for clinic-local today; sort by appointment start time, showing useful upcoming/relevant entries.
- Keep the approved simple table structure: **Time | Patient (service secondary line) | Doctor | Status | Action**.
- Status presentation: Waiting, In consultation, Upcoming, Completed, Cancelled **only if these correspond to mapped real workflow states**; normalize display labels using existing app semantics rather than inventing enum values.
- Filters: `All`, `Waiting`, `Upcoming` (client-side filtering on an already fetched appropriate result set or reuse server query if data is large).
- Working row action should navigate to/open the existing appointment or consultation details **only for authorized roles**.
- **View all appointments** must link to the existing route. No demo modal that simulates saving a booking.
- If no appointments: calm, helpful empty state with an authorized **New appointment** CTA.
- Mobile: responsive stacked list/cards if the table becomes cramped; do not allow horizontal overflow or unreadably tiny text.
- Keep PII within authenticated authorized views only.

### E. Queue snapshot — high-visibility operational panel

Reuse the system's existing check-in/queue/consultation logic and TV queue data source; do not build a new queue engine.

Display if available:

- Waiting patients count
- Now serving / current consultation token and room
- Next token and waiting room label
- Simple patient-flow progress visualization based on real statuses (Completed / In progress / Waiting)
- **View queue** navigates to the existing queue interface
- **Check in patient** invokes/navigates to the existing authorized reception/check-in flow

When clinic queue is empty, display **`Queue is clear`**; do not fake `A-024`, `A-025`, `3 waiting` or invent assigned rooms. If the TV display hides patient identity, do not expose extra details on this dashboard.

### F. Recent messages — compact, scannable inbox preview

- Read from the existing clinic-scoped inbox / WhatsApp integration, respecting RBAC and tenancy.
- Show up to 3 relevant recent conversations, optionally with unread-first sorting **if this is consistent with existing inbox logic**.
- Show sender display name (where available), last message preview, relative time, unread indicator.
- **Open inbox** navigates to the existing Inbox page.
- Graceful states for no messages, integration not connected, or data unavailable.
- No fictional Sara/Ali/Fatima conversations in production. Avoid exposing complete medical content in the overview preview.

### G. Recent activity — useful events with clear hierarchy

- Show up to 3–5 recent *real* clinic events where supported: appointment booked, patient check-in, payment/billing update, or integration warning.
- Use the existing activity/audit/event source if available. Do not repurpose security audit data without checking authorization and sensitivity.
- Replace noisy repeated `AI Provider Error` rows in the overview with a **single appropriate integration-health alert/link** where deduplication is supported; keep raw error details accessible through the correct existing logs/settings screen.
- **Never hide critical clinical, security or integration errors merely for aesthetics.**
- **View log** links to a real authorized page, or omit this action if no such view exists.
- If no reliable event source, show a legitimate empty state — do not create placeholder activity records.

## 5. Existing system wiring is required — not just a static UI

**Yes, this design can be integrated with the existing SaaS, provided it is mapped to actual schemas, routes, and services. The mockup alone does not wire anything.**

Implementation rules:

- Use current app authentication/session handling and derive the **active clinic/tenant ID server-side** through the existing tenant guard, never trust a caller-supplied clinic ID.
- Use the established Supabase client pattern, RLS, RBAC, and scoped existing services. Never use a service-role key directly in browser code.
- The main dashboard should render accurate data **for the currently selected clinic only**. Test tenant switching and unauthorized access.
- Prefer a server-side dashboard loader/aggregation layer that reuses existing services and avoids unnecessary many separate browser requests; optimize DB round trips and indexes where appropriate **without making speculative schema changes**.
- Handle loading, empty, partial-failure and permission-denied states distinctly. Never display demo values when fetching fails.
- Use existing app query invalidation/revalidation or realtime subscriptions if they are already in place. After a real appointment/check-in/status change, relevant counts and previews should update on the expected refresh path.
- Clinic-local date boundaries and time zones must be consistent across KPIs, schedule and queue.
- Only show authorized actions; hide or disable actions appropriately in UI **and validate permissions on the server**.
- Existing AI/WhatsApp connections are BYOK; do not introduce AI calls, extra usage costs, or a new chat service into the dashboard.
- Keep patient billing separate from SaaS subscription billing; this is a dashboard overview UI task only.
- Do not touch migrations, billing guard triggers, plan entitlements, payment approvals, RLS policies or security-sensitive APIs unless a verified requirement demands review and explicit approval.

## 6. Implementation architecture

- Keep the existing dashboard route and layout. No unnecessary new route or route redirect.
- Refactor dashboard main-content components into maintainable reusable pieces only as needed. Suggested component organization (adjust to repository conventions):

```text
components/dashboard/overview/
  DashboardOverviewHeader.tsx
  TodayFlowMetrics.tsx
  SecondaryMetrics.tsx
  TodaySchedule.tsx
  QueueSnapshot.tsx
  RecentMessages.tsx
  RecentActivity.tsx
  DashboardLoadingState.tsx
```

- Keep data types/interfaces close to actual services and avoid duplicated data definitions.
- Where possible, retain Server Components for data loading and use lightweight Client Components only for filters, menus or interactivity.
- Use existing UI primitives; no new CSS framework, arbitrary new component library, or reimplementation of the sidebar.
- If implementing the demo's search in the shared topbar would change application-wide behavior, preserve the current working search exactly and use local schedule filters instead.

## 7. Design acceptance criteria

- The **main/right dashboard area** visually matches the approved mockup's premium, compact, calm hierarchy.
- Existing sidebar looks and behaves **exactly the same** as before.
- Fonts are readable: section titles ~15–18px, normal content 13–14px where reasonable; key KPI numbers 26–32px; avoid tiny table/status text.
- Use Forest Green for headings, Sage for supporting UI, white cards and light neutrals for surfaces. Keep clinical warning colors semantic.
- Preserve whitespace intentionally; don't place eight competing cards above real operational tasks.
- Good keyboard accessibility, visible focus styles, accessible names on icon-only controls, semantic headings/table labels, `aria` for filters and status; support reduced motion.
- Respect existing clinic logo, localization/timezone, and authenticated staff permissions.
- No unsupported fabricated data. Production removes prototype-only banners and demo behaviors.

## 8. Required QA before merging/deploying

**Visual:** Capture before/after screenshots of the right-side dashboard at desktop `1440px`, `1280px`, tablet `768px`, and mobile `390px` (also check `320px`). Confirm no unexpected change in sidebar across routes.

**Functional:** Test, using a safe test clinic with fictional data:

1. No appointments / empty queue / no messages → correct empty states.
2. Active appointments + waiting/consulting/completed → correct counts, status mapping and schedule.
3. Date boundary in the clinic timezone.
4. New appointment action, existing appointment detail route, Inbox link, View Queue link and check-in action.
5. RBAC differences for owner/admin/doctor/receptionist, including direct API access.
6. Two different clinics, no cross-tenant leakage; tenant switching refreshes all widgets correctly.
7. Disconnected/failed WhatsApp integration and partially unavailable metrics.
8. Mobile accessibility, scroll and menu behavior.
9. Ensure actual patient information is not included in screenshots or public artifacts.

**Engineering:** Run actual available typecheck, lint, unit/integration tests, RLS/security checks where relevant, and the production build. Report commands and real results, not hypothetical passes. If some checks cannot run, report the blocker clearly.

## 9. Delivery workflow

**Phase A — Code audit & mapping:** Identify real dashboard source file, data services, clinic timezone, queue statuses, RBAC permissions and concrete gaps. Briefly report impact/file list.

**Phase B — Right-side UI implementation:** Implement approved visuals, scoped theme tokens, and working actions without modifying sidebar or unrelated pages.

**Phase C — Data integration:** Connect all widgets to authorized existing data. Mark unsupported metrics honestly, avoid mock data.

**Phase D — QA & review:** Provide screenshots and demonstrate actual end-to-end behavior with a test clinic. Do **not** push directly to production without reviewing the result if production is in use; prefer a feature branch/Vercel Preview, then request approval to merge.

### Required handoff report

- Files changed and reason
- Mockup-to-production component mapping
- Each KPI/section → actual data source and status/metric definition
- Interactions linked to existing route/action
- Confirmed sidebar unchanged
- Before/after desktop + mobile screenshots
- Lint/typecheck/build/test commands and actual results
- Open issues, unsupported metrics and safe fallbacks

**FINAL TARGET:** A fully functional, integrated, calm and premium **right-side dashboard overview** that looks like `MedBookAI_Dashboard_UX_Mockup.html`, uses **real tenant-scoped clinic data**, and leaves the existing sidebar, other pages, billing, auth and security intact.
