# MedBook AI --- Calendar Tab UI/UX Improvement Prompt (Design System V2)

## Role and objective

Act as a **Senior Product Designer, UX Architect, Frontend Engineer,
Accessibility Specialist, and Responsive Web-App Engineer** working on
MedBook AI, a clinical practice-management SaaS.

Improve the existing **Calendar tab** in the current repository. Before
changing code, inspect the existing application architecture, routing,
calendar implementation, data models, appointment flows, doctor/service
configuration, shared components, and **Design System V2**. Then
implement the improvements within the existing architecture.

The goal is a polished, calm, modern, clinically appropriate calendar
that is easy for clinic staff to scan and operate on desktop, tablet,
and mobile. It must feel like a consistent part of MedBook AI---not a
separate product or a visual mockup.

## Required skills and how to apply them

Use these skills deliberately during the task:

1.  **Repository / Codebase Analysis**
    -   Trace the Calendar route, components, styles, state,
        data-fetching logic, appointment actions, and shared layout.
    -   Identify reusable components and existing patterns before adding
        new ones.
    -   Follow current framework, naming conventions, and project
        structure. Do not rewrite the app or introduce a second calendar
        architecture unnecessarily.
2.  **Product UX and Information Architecture**
    -   Prioritize the main clinical scheduling tasks: identify the
        date, see clinic hours, understand which doctor is available,
        spot booked slots, and create/open an appointment quickly.
    -   Establish a clear hierarchy between page title, date navigation,
        view controls, doctor filter, calendar grid, appointment
        details, and status legend.
    -   Reduce clutter and avoid redundant controls or excessive empty
        space.
3.  **Design System / Design Tokens**
    -   Locate and use the existing **MedBook AI Design System V2** as
        the source of truth.
    -   Reuse its color tokens, typography, spacing scale, radii,
        borders, shadows, icon style, button variants, input heights,
        focus states, and responsive breakpoints.
    -   Do not invent a competing palette or add arbitrary one-off
        styles. If a calendar-specific token is genuinely missing, add
        it consistently to the existing token system.
    -   Keep the brand's calm healthcare aesthetic: sage/green primary
        actions, clean neutral surfaces, clear text contrast, and
        restrained status colors. Use the exact V2 tokens already
        defined in the repository rather than hardcoding approximations.
4.  **Responsive Design / Adaptive UI**
    -   Build and test mobile-first behavior for phone, tablet, laptop,
        and wide desktop.
    -   Components must adapt intelligently---not merely shrink. Reflow
        toolbars, switch to suitable calendar layouts, keep essential
        actions accessible, and prevent horizontal overflow or clipped
        content.
    -   Preserve functionality at narrow widths and touch-friendly
        sizing.
5.  **Calendar and Scheduling UX**
    -   Implement coherent **Day, Week, and Month** views.
    -   Show readable day/date headers, clinic operating hours, time
        labels, and appointments in the correct date/time positions.
    -   Support doctor-wise filtering and make it obvious which doctor
        an appointment belongs to.
    -   Ensure date navigation and view switching remain synchronized
        and predictable.
6.  **Accessibility**
    -   Use semantic buttons, labels, keyboard navigation, visible focus
        states, accessible names for icon-only controls, and sufficient
        contrast.
    -   Do not rely on color alone to communicate appointment status.
    -   Respect reduced-motion preferences and touch target guidance.
7.  **Frontend Engineering and State Management**
    -   Reuse existing state management, API hooks, routing, validation,
        and data contracts.
    -   Keep date/time calculations correct, avoid duplicate event
        handlers, and prevent layout shifts where practical.
    -   Do not use fake/static appointment data in production paths. Use
        fixtures only in tests or clearly isolated development previews.
8.  **Quality Assurance / Regression Testing**
    -   Run available lint, type-check, tests, and build commands.
    -   Verify calendar interactions, responsive breakpoints,
        appointment actions, and existing behavior.
    -   Fix regressions introduced by the changes and report any
        pre-existing blockers honestly.

## First: audit the current implementation

Before coding:

-   Inspect the existing Calendar page and all components it depends on.
-   Find the Design System V2 documentation, tokens, CSS variables,
    component library, and shared button/input/card patterns.
-   Trace the actual appointment schema and how doctor, service, status,
    date, start time, and end time are stored.
-   Check the existing New Appointment flow and
    appointment-detail/edit/cancel actions.
-   Identify the source of clinic opening hours, timezone, doctor
    availability, and working days.
-   Check whether a calendar library is already installed. Reuse it if
    it fits; do not add a new dependency without a clear need.
-   Write a brief implementation plan based on what actually exists,
    then implement it. Do not stop after providing recommendations.

## Calendar page layout

Create a compact, consistent page structure:

1.  **Page heading**
    -   Title: `Calendar`.
    -   A subtle clinic/location or timezone subtitle only if the
        application already provides that information.
    -   Do not duplicate global-header controls or add unnecessary
        alert/notification elements.
2.  **Calendar toolbar**
    -   Previous and next date navigation.
    -   A clearly visible `Today` action.
    -   Current date range/date label that changes with the selected
        view.
    -   Segmented `Day / Week / Month` switch.
    -   Doctor filter with an `All doctors` option.
    -   Optional service/status filters only if supported by existing
        data and useful at the current screen size.
    -   Primary `New appointment` action using the Design System V2
        primary button.
    -   Keep controls aligned and consistently spaced. On small screens,
        wrap into intentional rows or a compact toolbar; do not allow
        overlap.
3.  **Calendar grid**
    -   Use a clean surface with subtle borders and clear alignment.
    -   Keep the time axis and day columns aligned exactly.
    -   Display clinic hours from the real clinic configuration; do not
        hardcode arbitrary operating hours if the app already stores
        them.
    -   Support scrolling through the schedule without losing important
        context. If sticky day/time headers are used, ensure they do not
        cover appointments.
    -   Avoid large blank regions, excessively tall appointment strips,
        heavy gridlines, and unnecessary decoration.
4.  **Appointment status legend**
    -   Keep it compact and consistent with existing status semantics.
    -   Use readable labels and restrained colors. Do not rely on color
        alone.

## Required view behavior

### Day view

-   Show the selected weekday and full date in a clear horizontal header
    above the time grid.
-   Show clinic time labels vertically along the left.
-   Display appointments at their correct start time and duration.
-   Each appointment should use a compact card/block, not a full-width
    strip with little information.
-   Show the patient name, start--end time, doctor name or initials
    where space permits, and a short service label when available.
-   Show status in a compact badge or clear visual marker.
-   Avoid truncating essential patient identity or making appointment
    text unreadably small. Use a detail popover/drawer on click/tap if
    more information is needed.

### Week view

-   Show **Monday through Sunday** (or the application's established
    locale convention) as horizontal day columns, with readable
    abbreviated weekday labels and dates.
-   Highlight the current day subtly.
-   Keep the time axis aligned with all seven day columns.
-   Display appointments in their correct day/time positions and sized
    according to duration where the current calendar implementation
    supports it.
-   Make doctor identity easy to recognize, especially when several
    doctors have appointments on the same day.
-   At narrow widths, do not squeeze seven columns until they become
    unusable. Use a deliberate responsive strategy, such as horizontally
    scrollable day columns with a sticky time axis, or a
    mobile-appropriate agenda/list presentation. Preserve access to
    every day and its appointments.

### Month view

-   Show weekday headings across the top and a conventional month grid.
-   Include previous/next month navigation and a clear month/year label.
-   Display a small number of compact appointment summaries in each date
    cell, such as time + patient name, with a `+N more` affordance when
    a cell is full.
-   Clicking/tapping an appointment should open its existing detail
    action; clicking a date or its add affordance should start the
    existing appointment-creation flow with that date preselected when
    supported.
-   Keep adjacent-month dates visually subdued but legible.
-   On mobile, preserve date navigation and appointment access; use a
    responsive agenda/list fallback if a full month grid becomes too
    cramped.

## Doctor-wise scheduling

-   The doctor filter must use real doctor records and remain consistent
    across Day, Week, and Month views.
-   `All doctors` shows appointments for all relevant doctors.
-   Selecting one doctor filters the visible appointments without
    breaking date navigation or view switching.
-   If the current system supports doctor-specific working hours or
    availability, visually distinguish unavailable/non-working periods
    in a subtle, accessible way.
-   Make doctor identity clear through name/initials and, if the
    established design supports it, a restrained color marker. Do not
    invent conflicting color systems.
-   If several doctors share a time period, prevent appointment overlap
    from making cards impossible to read. Use the existing calendar's
    collision/stacking approach or implement a robust equivalent.

## Appointment card UX

Create one consistent appointment-card pattern reused across views where
practical.

-   **Primary information:** patient name.
-   **Time:** start and end time, formatted using the clinic's
    locale/time settings.
-   **Doctor:** doctor name or initials, especially in `All doctors`
    mode.
-   **Service:** short service name where available.
-   **Status:** pending, confirmed, completed, cancelled, or
    no-show---using the application's real statuses.
-   **Interaction:** open the existing appointment details on click/tap;
    expose supported actions in a predictable detail panel/menu rather
    than crowding every card with icons.
-   Use consistent padding, typography, border radius, status marker,
    hover/focus/selected states, and truncation rules.
-   Provide a useful tooltip or accessible detail view when content is
    truncated.
-   Do not put essential actions only on hover; touch users must have
    equivalent access.
-   Keep the visual weight appropriate to duration and avoid overlapping
    cards.

## Popups, drawers, and actions

Review all calendar-related dialogs, popovers, dropdowns, drawers, and
appointment forms.

-   Reuse the existing modal/drawer and form components from Design
    System V2.
-   Apply consistent heading hierarchy, field labels, spacing,
    validation, error states, footer actions, and button order.
-   Use clear action labels such as `Save appointment`, `Cancel`, and
    `View details`; do not rely on ambiguous icon-only buttons.
-   On mobile, use a suitable full-screen or near-full-screen
    sheet/drawer when a centered desktop modal would be cramped.
-   Keep dialogs within the viewport, allow internal scrolling when
    necessary, and prevent background content from scrolling while a
    modal is open.
-   Preserve all current appointment-creation, edit, detail,
    cancellation, and confirmation behavior. Do not remove an existing
    workflow merely to simplify the UI.

## Responsive acceptance requirements

Test at minimum: **360 px, 390 px, 430 px, 768 px, 1024 px, 1280 px, and
1440 px** widths.

-   No horizontal page overflow.
-   No overlapping or clipped toolbar controls.
-   No hidden doctor filter or primary appointment action without an
    accessible alternative.
-   Day headers and time labels stay aligned with the grid.
-   Week view remains usable at phone width via intentional horizontal
    scrolling or an appropriate agenda layout.
-   Month cells remain readable and appointment details remain
    accessible.
-   Touch targets should generally be around 44 × 44 CSS pixels where
    practical.
-   Long patient names, long doctor names, and long service labels must
    not break the layout.
-   Modals and dropdowns must fit within the viewport.
-   Keyboard focus and screen-reader labels remain usable.
-   The interface should feel like a carefully adapted mobile SaaS
    interface, not a desktop page compressed into a phone.

## Design system consistency rules

-   Use the existing V2 design tokens and shared components before
    creating new ones.
-   Keep the same global header, navigation, page gutters, typography,
    buttons, form controls, card borders, radii, shadows, and icon
    stroke style used elsewhere in MedBook AI.
-   Avoid adding extra header alerts or duplicate global actions.
-   Use the existing primary/secondary/tertiary button hierarchy
    consistently.
-   Use consistent icon placement and sizing. Icon-only buttons need
    accessible labels and tooltips where appropriate.
-   Keep spacing systematic; do not tune every element with unrelated
    arbitrary values.
-   Use subtle transitions only where they help orientation; avoid
    decorative animation.
-   Do not redesign the whole application or unrelated tabs as part of
    this task.

## Functional and data integrity rules

-   Preserve all existing calendar behavior, routes, permissions, API
    calls, and data contracts.
-   Do not replace live data with sample records.
-   Do not invent doctor availability, appointment status, opening
    hours, or timezone.
-   Respect clinic timezone and locale when displaying dates and times.
-   Date navigation must update the displayed date range correctly in
    all views.
-   Changing the doctor filter must not reset the selected date
    unexpectedly.
-   View switching should preserve the selected date and selected
    doctor.
-   Empty states should explain that no appointments are scheduled and
    provide the existing `New appointment` action when permitted.
-   Loading, API error, empty, and populated states should all be
    designed consistently.
-   Use optimistic updates only if the existing architecture supports
    them safely.

## Implementation workflow

1.  Inspect the repository and report the relevant Calendar files,
    Design System V2 source, and existing scheduling data flow.
2.  Identify the highest-impact usability problems in the current
    implementation.
3.  Make a short, evidence-based implementation plan.
4.  Implement the improvements using existing architecture and shared
    components.
5.  Test Day, Week, and Month views with real application data.
6.  Test doctor filtering, date navigation, appointment
    opening/creation, and supported appointment actions.
7.  Check responsive behavior at the specified widths and verify
    popups/drawers.
8.  Run the project's available lint, type-check, unit/integration
    tests, and production build.
9.  Fix any regressions caused by the changes.
10. Summarize changed files, behavior improved, tests run, and any
    remaining limitations.

## Definition of done

The task is complete only when:

-   Day, Week, and Month views all show clear date/day headings and
    clinic time context.
-   Doctor-wise filtering works consistently across all views.
-   Appointment cards communicate patient, time, doctor, service, and
    status at an appropriate level for each view.
-   The calendar uses the **existing MedBook AI Design System V2**
    rather than a competing design language.
-   Mobile and tablet behavior is intentionally designed, with all
    important features accessible.
-   Calendar popups, forms, dropdowns, and drawers follow the same
    design system and work on small screens.
-   Existing workflows and data contracts are preserved.
-   The implementation passes all available checks, or any pre-existing
    blockers are clearly documented.

**Important:** Do not stop at a visual-only redesign or return only
recommendations. Inspect the actual codebase, implement the changes, and
verify the result. Make sensible design decisions from the existing
product context without asking for approval on every minor detail.
