# MedBook AI — Appointments UI/UX + Responsive Improvement Prompt

## ROLE
You are a Senior Product Designer + Frontend Engineer specializing in premium clinical SaaS and healthcare practice-management applications.

You are working on **MedBook AI**, an already-functional clinic/practice management SaaS.

The Dashboard has already been redesigned and approved using the **MedBook AI Clinical SaaS Design System V2**. Your task is now to improve the **Appointments page** and its **Book Consultation / New Appointment modal** while preserving existing functionality.

## PRIMARY OBJECTIVE
Improve the existing Appointments screen and New Appointment / Book Consultation modal so they visually belong to the same approved MedBook AI design language as the Dashboard.

Target:
**Same functionality + same information architecture + better visual hierarchy, consistency, usability, and responsive behavior.**

Do NOT create a completely different product.
Do NOT unnecessarily redesign the information architecture.
Do NOT remove existing appointment-booking functionality.

The receptionist or doctor must be able to **book an appointment successfully from desktop, tablet, and mobile**.

## DESIGN AUTHORITY
Use **MedBook AI Clinical SaaS Design System V2** as the SINGLE SOURCE OF TRUTH for:
- colors
- typography
- spacing
- components
- border/radius system
- buttons and inputs
- interaction states
- responsive behavior
- accessibility
- visual hierarchy

The approved Dashboard is the visual reference. Do not invent a separate visual language for Appointments.

## REQUIRED SKILLS

### 1. `frontend-design` — PRIMARY
Use for overall visual implementation, page composition, layout, responsive frontend structure, and production-quality UI.

### 2. `ui-ux-pro-max` — UX / VISUAL REVIEW
Use for information hierarchy, form usability, spacing, interaction design, responsive UX, accessibility, cognitive-load reduction, and professional SaaS polish.

### 3. `shadcn` — COMPONENT CONSISTENCY
Use for Dialog/Modal, Button, Input, Select, Tabs, Badge, Checkbox, Dropdown and other reusable primitives.

Reuse existing project components first. If a component already exists, improve it instead of creating a duplicate. Do not introduce competing versions of the same component.

## VISUAL DIRECTION
The approved MedBook AI direction is:
- bright
- spacious
- calm
- premium
- clinical
- professional
- readable
- modern
- trustworthy

**DO NOT MAKE THE UI COMPACT.**

There is sufficient screen space. Do not solve responsiveness by making everything tiny.

Avoid:
- tiny fonts
- cramped forms
- excessive information compression
- excessive cards
- dark-heavy UI
- excessive shadows
- excessive gradients
- unnecessary animation
- decorative UI that reduces usability

Desktop should feel spacious. Tablet should feel comfortable. Mobile should be intelligently reorganized rather than merely shrunk.

## APPROVED COLOR SYSTEM

Primary Green: `#4F806C`
- primary actions
- active controls
- important positive interactions

Medium Green: `#679986`
- secondary emphasis
- supporting accents

Light Sage: `#DCEBE3`
- selected/soft backgrounds
- icon containers
- subtle highlights

Very Light Sage: `#EEF5F1`
- subtle surfaces
- selected navigation backgrounds
- gentle grouping

Page Background: `#F7F9F7`
- application/page background

Surface: `#FFFFFF`
- cards
- modal
- form surfaces

Main Text: `#29423A`
- page titles
- section titles
- important values
- primary labels

Secondary Text: `#667872`
- descriptions
- helper text
- metadata

Border: `#DCE5E1`
- inputs
- cards
- dividers
- tabs
- modal sections

Primary Hover: `#3F6F5D`
- primary button hover

Do not introduce arbitrary greens unless there is a documented semantic reason. Semantic status colors may remain success/warning/danger/information, but should be subtle and consistent with V2.

## TYPOGRAPHY
Use the same clean modern sans-serif direction as the Dashboard.

Recommended hierarchy:
- Page Title: 28px / 700
- Section Heading: 17–18px / 600
- KPI Number: 28–32px / 600
- Body: 15px / 400
- Labels: 13px / 500
- Buttons: 14px / 500
- Helper Text: 13px / 400

Do not use tiny text to fit more information. Maintain comfortable line-height and readability for clinical staff.

## APPOINTMENTS PAGE
Preserve the current major structure:
- Appointments title
- description
- Add/New Appointment action
- KPI/stat cards
- Consultations / Services tabs
- appointment status tabs
- Search
- Filters
- Export
- appointment content/table/empty state

Improve visual hierarchy, alignment, spacing, and consistency with the approved Dashboard.

### Page Header
Make **Appointments** the clear primary heading. Subtitle is secondary but readable. The New Appointment action should be obvious without overpowering the page.

If a global header CTA and local page CTA both exist, ensure hierarchy is intentional and avoid unnecessary duplication.

### KPI Cards
Keep:
- Today
- Confirmed
- Pending
- Cancelled

Improve:
- typography
- icon containers
- spacing
- alignment
- card padding
- semantic status treatment
- consistency with Dashboard KPI cards

The number should be easy to scan. Do not make cards unnecessarily tall.

### Tabs and Filters
Preserve the existing:
- Consultations
- Services
- Today
- Upcoming
- Completed
- All
- Cancelled

Improve active, hover, focus, spacing and typography states. Active states should use the approved green/sage system rather than heavy dark fills.

### Search / Filter / Export
Improve search, Filters, Export, alignment, touch targets and responsive behavior.

Desktop: comfortably aligned.
Tablet: sensible wrapping.
Mobile: do NOT squeeze everything into one row. Stack/reorganize controls logically.

Never create horizontal overflow.

### Empty State
Keep the current empty-state concept but polish it:
Icon
→ clear message
→ short explanation

It should feel intentional, calm and informative.

## NEW APPOINTMENT / BOOK CONSULTATION MODAL — HIGH PRIORITY

Preserve all existing fields and functionality, including where applicable:
- Phone number
- Full name
- Patient age
- Gender
- City
- WhatsApp number
- Known allergies
- Medical conditions
- Booking source
- Existing patient selection
- Duplicate record/merge action
- Service
- Doctor
- Appointment date
- Time slot
- Consultation type
- Additional notes
- Emergency mode
- Cancel
- Book Consultation

Do NOT remove fields simply to make the form shorter.

Improve:
- grouping
- hierarchy
- spacing
- labels
- helper text
- field alignment
- focus states
- validation states
- section headings
- button hierarchy

## MODAL DESKTOP
A two-column structure is appropriate where it improves scanning.

Patient Information → left.
Appointment Details → right.

Use comfortable field/section spacing. Do not make the modal excessively narrow or unnecessarily huge.

## MODAL MOBILE — CRITICAL
Must work properly at:
- 375px
- 390px
- 430px

Do NOT scale the desktop two-column form down.

Convert to a single-column flow with logical grouping, for example:

Book Consultation header
→ Patient Information
→ Phone
→ Full Name
→ Age / Gender
→ City
→ WhatsApp
→ Allergies
→ Medical Conditions
→ Booking Source
→ Appointment Details
→ Service
→ Doctor
→ Date
→ Time
→ Consultation Type
→ Notes
→ Emergency Mode
→ Actions

The long form may scroll, but the modal must have a clear scrollable content region. Prevent unexpected background/page scrolling.

### Mobile Modal Header
Ensure title, subtitle and close control never overlap or clip. Close button must have an adequate touch target.

### Mobile Modal Footer
Keep Cancel and Book Consultation usable. Stack vertically on narrow widths if needed. Never reduce button text to tiny sizes.

## FORM UX
Every field should have:
- clear label
- readable input
- useful placeholder
- helper text only where useful
- required indicator
- focus state
- error state where applicable

Avoid placeholder-only labels, excessive helper text, tiny labels and inconsistent input heights/radii.

### Gender Controls
Male / Female / Other / Unknown must remain easy to select on touch devices. Allow natural wrapping on narrow mobile widths rather than making controls tiny.

### Consultation Type
Maintain:
- In-Clinic Visit
- Online
- Video

Selected/unselected states must be clear and comfortably tappable.

### Emergency Mode
Do NOT hide or weaken it. Maintain clear clinical distinction using the existing semantic danger treatment. Checkbox/toggle and explanatory text must remain readable on mobile.

### Existing Patient / Duplicate Record
Keep:
- Select existing patient
- Duplicate record / Merge

Make them clear but subordinate to the main CTA.

## RESPONSIVE BREAKPOINTS
Explicitly test:

Desktop:
- 1440px+
- 1280px

Tablet:
- 1024px
- 900px
- 820px
- 768px

Mobile:
- 430px
- 390px
- 375px

Test both the Appointments page and New Appointment modal.

At every breakpoint verify:
- no horizontal scrolling
- no overlap
- no clipping
- no inaccessible controls
- no tiny text
- no broken modal
- no broken tabs
- no broken buttons
- no form overflow
- no hidden essential information
- no unexpected body scrolling

## TABLET UX
Tablet is NOT simply a smaller desktop.

Adapt:
- sidebar
- header
- appointment controls
- KPI grid
- appointment content
- modal layout

The modal should move toward a single-column layout when required by available width.

Do not compress everything merely to preserve desktop rows.

## MOBILE NAVIGATION
Use the application's existing responsive navigation architecture.

If the mobile sidebar/drawer already exists, verify:
- opens
- closes
- close button works
- backdrop works
- outside click closes where appropriate
- ESC closes where appropriate
- body scroll is locked while drawer is open

Do not duplicate navigation systems.

## INTERACTION STATES
Check:
- default
- hover
- active
- focus
- selected
- disabled
- loading
- error
- empty

Use subtle transitions. Avoid flashy animation.

## ACCESSIBILITY
Ensure:
- keyboard navigation
- visible focus states
- semantic controls
- adequate touch targets
- readable contrast
- accessible dialog behavior
- correct labels
- meaningful icon buttons
- screen-reader-friendly close button
- no color-only communication

## IMPLEMENTATION PROCESS

Before coding:
1. Inspect the existing Appointments implementation.
2. Identify exact files/components.
3. Identify reusable components.
4. Identify existing modal implementation.
5. Identify existing responsive behavior.
6. Compare against Design System V2.
7. Perform a gap analysis.
8. Make the smallest necessary structural changes.
9. Reuse components wherever possible.
10. Preserve all existing functionality.

Do NOT modify unrelated screens.
Do NOT redesign the approved Dashboard.

## FUNCTIONALITY PRESERVATION
Do not break:
- patient lookup
- existing patient selection
- doctor selection
- service selection
- date selection
- time-slot logic
- consultation type
- emergency mode
- booking source
- duplicate/merge workflow
- form validation
- appointment submission
- API calls
- state management

If a UI change risks functionality, preserve functionality first.

## CODE QUALITY
Prefer:
- existing architecture
- existing components
- existing hooks
- existing state management
- existing API layer
- design tokens
- reusable responsive components

Avoid:
- duplicated CSS
- random hardcoded colors
- duplicate components
- unnecessary dependencies
- unrelated refactors
- changing business logic

## FINAL VISUAL QA

Review as a Senior Product Designer:
- hierarchy
- typography
- spacing
- visual balance
- consistency
- clinical professionalism
- cognitive load

Review as a Senior Frontend Engineer:
- responsive behavior
- overflow
- modal scrolling
- touch targets
- component reuse
- state handling
- accessibility

## SUCCESS CRITERIA
The final result should look like:

> **The same approved MedBook AI Dashboard design system applied naturally to the Appointments workflow.**

It should NOT look like a separate template.

Users should immediately feel:
- same product
- same design language
- same typography
- same colors
- same component system
- same interaction patterns

while the Appointments workflow becomes:
- easier to scan
- easier to book
- easier to use
- more professional
- more readable
- fully responsive

## FINAL RULE
This is an **Appointments UI/UX refinement + responsive optimization task**.

Do not perform a ground-up redesign.
Do not change business functionality.
Do not redesign the Dashboard.
Use the approved Design System V2.

Use:
- `frontend-design` as PRIMARY
- `ui-ux-pro-max` for UX/visual QA
- `shadcn` for reusable UI primitives and consistency

Finish and validate the entire Appointments page AND the New Appointment / Book Consultation modal across desktop, tablet, and mobile before considering this task complete.
