# MedBook AI — Design System V2
## Patient Billing, Calendar, Inbox & Doctors UX/UI Improvement Prompt

> **Role:** Act as a senior healthcare SaaS product designer + UX architect + frontend design-system engineer.
>
> **Objective:** Improve the existing MedBook AI workspace UI/UX under **Design System V2** without changing the existing business functions, workflows, permissions, or data behavior.
>
> **Reference screens:** The attached screenshots are the current implementation. Treat them as the source of truth for existing functionality and information architecture, but **not** as a visual-quality target. Preserve useful content and workflows while correcting hierarchy, spacing, consistency, responsiveness, interaction design, and visual polish.

---

# 1. NON-NEGOTIABLE PRODUCT RULE

The goal is **not to redesign the product from scratch**.

Keep:
- Existing features and business logic
- Existing navigation destinations
- Existing data fields
- Existing appointment/billing/doctor/message functionality
- Existing actions and workflows
- Existing patient/doctor/service concepts
- Existing important information

Improve:
- UI hierarchy
- UX flow
- Component consistency
- Button placement
- Spacing
- Typography
- Information density
- Forms
- Tables
- Cards
- Tabs
- Filters
- Empty states
- Modals/popups
- Drawers
- Confirmation states
- Responsive behavior
- Accessibility
- Interaction feedback
- Visual hierarchy

**Do not remove functionality just because the current UI is visually weak.**

---

# 2. FIRST: AUDIT BEFORE MODIFYING

Before coding, inspect the existing application and create a short internal audit of:

1. Shared header
2. Top-level tabs
3. Left sidebar
4. Patient Billing
5. Calendar
6. Inbox
7. Doctors
8. Services
9. All modals/popups/drawers used by these sections
10. Shared buttons, inputs, dropdowns, badges, tabs, tables, cards and icons
11. Desktop/tablet/mobile layouts
12. Existing reusable components
13. Existing design tokens/styles
14. Existing interaction states

Identify:
- Inconsistent button heights
- Different border radii
- Inconsistent icon sizes
- Inconsistent typography
- Weak hierarchy
- Excessive whitespace
- Crowded areas
- Misplaced actions
- Duplicate controls
- Ambiguous labels
- Poor modal proportions
- Tables that do not adapt to smaller screens
- Horizontal overflow
- Controls that become unusable on touch devices
- Poor empty/loading/error states
- Inconsistent active/hover/focus/disabled states
- Any component that should become reusable

**Do not immediately start rewriting pages. Understand the existing architecture first.**

---

# 3. DESIGN SYSTEM V2 — GLOBAL FOUNDATION

Create/use a single consistent Design System V2 across all four sections.

## 3.1 Visual Direction

MedBook AI should feel:

- Modern healthcare SaaS
- Professional
- Calm
- Trustworthy
- Premium
- Clean
- Efficient
- Data-focused
- Human and approachable

Avoid:
- Excessive gradients
- Decorative UI with no functional purpose
- Giant headings
- Overly rounded "consumer app" cards
- Random colors
- Excessive shadows
- Visually noisy dashboards
- Too many competing primary buttons

Use the existing MedBook AI visual identity as the foundation, but make it more refined and systematic.

---

# 4. DESIGN TOKENS

Centralize reusable tokens instead of styling individual pages randomly.

Define:

## Typography
Create a clear hierarchy for:
- Page title
- Section title
- Card title
- Body
- Secondary text
- Table text
- Caption
- Labels
- Helper text

Avoid arbitrary font sizes throughout the application.

## Spacing
Use a consistent spacing scale.

Example:
- 4px
- 8px
- 12px
- 16px
- 20px
- 24px
- 32px
- 40px

Use spacing intentionally rather than page-specific random margins.

## Radius
Use a small controlled radius system:
- Inputs/buttons
- Cards
- Large panels/modals
- Pills/badges

Do not mix many unrelated radii.

## Borders
Use one consistent border language:
- Default
- Subtle
- Focus
- Error
- Selected

## Shadows
Use restrained elevation:
- Flat
- Card
- Floating/modal

## Color
Maintain the existing green/teal healthcare identity.

Create semantic colors:
- Primary
- Primary hover
- Success
- Warning
- Error
- Info
- Neutral
- Background
- Surface
- Border
- Text
- Muted text

Do not use green merely because something is "active"; use semantic meaning consistently.

---

# 5. GLOBAL HEADER + SIDEBAR

Improve the shared shell first because every workspace depends on it.

## Header

Keep the header simple.

Improve:
- Logo alignment
- Search field dimensions
- Notification positioning
- Message icon
- User/profile area
- New Appointment CTA
- Vertical alignment
- Responsive behavior

The header should not compete with page content.

### Search
Use:
- Consistent height
- Clear search icon
- Correct placeholder
- Focus state
- Mobile-friendly layout

### New Appointment
This should remain a strong primary CTA.

Use one consistent primary button component everywhere.

Do not create slightly different green buttons for different pages.

---

# 6. LEFT SIDEBAR

The sidebar currently has useful navigation but needs stronger hierarchy and consistency.

Improve:
- Icon alignment
- Icon size
- Label spacing
- Active state
- Hover state
- Selected indicator
- Vertical rhythm
- Grouping
- Collapse behavior

Active navigation should be immediately recognizable without becoming visually heavy.

Use:
- Subtle surface highlight
- Consistent left indicator
- Consistent icon/text color behavior

Do not give every sidebar item a different visual treatment.

## Sidebar responsive behavior

### Desktop
Persistent sidebar.

### Tablet
Allow compact/collapsed sidebar where appropriate.

### Mobile
Convert sidebar into:
- Drawer
- Overlay navigation
- Clear close action

Never allow the sidebar to consume most of a mobile screen.

---

# 7. TOP TABS

The current top-level "Dashboard / Analytics" area should be visually secondary to the main workspace navigation.

Create a clear hierarchy:

Header
↓
Top-level workspace tabs
↓
Sidebar
↓
Page content

Ensure:
- Same tab height
- Same typography
- Same active state
- Same spacing
- Same hover/focus states

Do not make tabs look like unrelated buttons.

---

# 8. PATIENT BILLING — UX/UI V2

Reference current Billing screen.

## Problems to solve

Improve:
- KPI cards
- Page heading
- Billing filters
- Search
- Status filter
- Add Bill CTA
- Table density
- Status badges
- Row actions
- Summary footer
- Responsive table behavior

## KPI cards

Keep the four existing concepts:
- Today's Collection
- Pending Amount
- Bills Today
- This Month's Revenue

Improve hierarchy:
- Label → large amount → supporting context
- Consistent icon container
- Consistent card height
- Consistent internal padding
- Avoid excessive visual decoration

The most important financial number should visually dominate.

## Filters

Create one unified filter/action row.

Recommended hierarchy:

[Today] [All Bills] [Pending]        [All Status] [Refresh] [Add Bill]

Then search below if necessary.

Avoid controls appearing randomly across the page.

## Billing table

Make the table highly scannable.

Improve:
- Header contrast
- Column alignment
- Amount formatting
- Patient name hierarchy
- Secondary phone/date text
- Status badge consistency
- Action spacing
- Row hover
- Selected row state
- Empty state
- Loading state

Actions should use consistent icon buttons with tooltips.

Do not mix icon-only buttons with inconsistent sizes.

## Mobile Billing

Do NOT simply shrink the desktop table.

On mobile:
- Convert each bill row into a compact bill card OR
- Use a horizontally scrollable table only if absolutely necessary

Preferred mobile card hierarchy:
Patient
→ Bill amount/status
→ Service/date
→ Payment mode
→ Actions

Important information must be visible without excessive horizontal scrolling.

---

# 9. CREATE NEW BILL MODAL — V2

The current modal has useful functionality but needs stronger hierarchy.

Redesign it as a professional healthcare billing form.

Structure:

### Header
Create New Bill
Short explanation
Close button

### Step/section 1
Patient Details

### Step/section 2
Bill Details

### Section 3
Line Items

### Section 4
Discount / adjustments

### Section 5
Total

### Footer
Cancel
Create Bill

Improve:
- Modal width
- Internal spacing
- Section separation
- Input hierarchy
- Labels
- Helper text
- Validation
- Sticky footer
- Error states
- Loading state
- Success feedback

Do not let the modal footer move unpredictably while the content scrolls.

On desktop:
- Centered large modal

On tablet:
- Near-full-width modal with safe margins

On mobile:
- Full-screen sheet/modal
- Sticky header
- Scrollable content
- Sticky footer actions

---

# 10. CALENDAR — UX/UI V2

The Calendar must become one of the most usable screens in the workspace.

Current functionality should remain.

Improve:
- Date navigation
- Today button
- Doctor filter
- Current date heading
- Calendar grid
- Appointment cards
- Time labels
- Status colors
- Empty slots
- Legend
- Booking interaction

## Toolbar hierarchy

Use:

[Previous] [Next] [Today] [Date selector] [Doctor filter]

Keep primary booking action accessible without cluttering the toolbar.

## Appointment cards

Make appointment blocks easier to scan.

Show only the information needed in the calendar:
- Time
- Patient
- Doctor/service when useful
- Status

Use semantic status colors consistently:
- Pending
- Confirmed
- Completed
- Cancelled
- No-show

Do not rely only on color; use labels/icons where needed.

## Empty calendar

Provide a useful empty state:
"No appointments scheduled"
with optional booking CTA.

## Calendar responsiveness

### Desktop
Full calendar experience.

### Tablet
Reduce columns/content density intelligently.

### Mobile
Use a mobile-first schedule:
- Date selector
- Day view
- Vertical timeline
- Appointment cards

Do not force the desktop calendar into a narrow mobile viewport.

---

# 11. INBOX — UX/UI V2

The Inbox should behave like a modern healthcare messaging workspace.

Current two-column layout is a good foundation.

Improve:
- Conversation list
- Active conversation
- Search
- Filters
- Unread indicators
- Patient identity
- Message area
- Bot Response toggle
- Composer
- Empty states

## Desktop

Use:
Left:
Conversation list

Right:
Conversation detail

The conversation list should have:
- Avatar
- Patient name
- Latest message
- Timestamp
- Unread badge
- Status/context when useful

## Conversation area

Improve:
- Header hierarchy
- Patient identity
- Bot Response control
- Message spacing
- Composer
- Send button
- Empty state

Avoid huge empty areas when a conversation is empty.

## Mobile

Use navigation pattern:

Conversation list
→ tap conversation
→ full-screen conversation
→ back button

Do not show both columns side-by-side on mobile.

---

# 12. DOCTORS — UX/UI V2

The Doctors screen currently mixes:
- Doctor management
- Services
- Search
- Filters
- Grid/list toggle
- Add Doctor
- Add Service

Create stronger hierarchy.

## Primary structure

Page heading:
Doctors

Supporting text

Workspace switch:
[Doctors] [Services]

Toolbar:
Search
Filters
View toggle
Primary action

Make the selected tab obvious.

## Doctor cards

Improve:
- Profile hierarchy
- Specialty
- Status
- Availability
- Patient count
- Schedule
- Actions

Actions should be:
- View
- Edit
- Availability/status
- Delete

Use consistent action hierarchy.

Avoid putting too many equally prominent controls inside the card.

## Services

Keep service cards if they are useful, but standardize:
- Service name
- Category
- Status
- Rating
- Bookings
- Available days
- Duration
- Fee
- Actions

Make long service names truncate gracefully with tooltip/full view.

---

# 13. ADD DOCTOR MODAL — V2

The current Add Doctor popup has good information architecture but needs refinement.

Keep the existing functional tabs:
- Details
- Availability & Slots
- Vitals Configuration

Improve:
- Tab hierarchy
- Sticky modal header
- Sticky footer
- Form sections
- Field grouping
- Required/optional indicators
- Error validation
- Upload areas
- Fee fields
- Pre-consultation questions
- Save state

Do not put too many visually competing colored containers around every section.

Use subtle section surfaces instead.

### Modal behavior

Desktop:
Large centered modal.

Tablet:
Responsive modal with safe margins.

Mobile:
Full-screen form experience.

Footer:
[Cancel] [Save/Add Doctor]

Primary action must remain easy to reach.

---

# 14. ALL POPUPS / MODALS / DRAWERS

This is mandatory.

Audit **every popup in these four tabs**, not only the examples in the screenshots.

Create one reusable Modal/Dialog system.

Every modal must have consistent:
- Width rules
- Header
- Title
- Subtitle
- Close button
- Content padding
- Section spacing
- Footer
- Primary button
- Secondary button
- Loading state
- Error state
- Success state
- Escape-key behavior
- Outside-click behavior where appropriate
- Mobile behavior

## Modal hierarchy

Use:

Header
Title
Supporting description

Content
Grouped sections

Footer
Secondary action | Primary action

Never create a new modal style for an individual feature unless there is a real UX reason.

---

# 15. BUTTON SYSTEM V2

This is one of the highest-priority fixes.

Create reusable button variants:

### Primary
Main action.

### Secondary
Important but non-primary action.

### Tertiary/Ghost
Low emphasis action.

### Destructive
Delete/remove/cancel irreversible action.

### Icon button
For compact actions.

### Link/button
For text-level actions.

Standardize:
- Height
- Padding
- Font weight
- Icon size
- Gap
- Radius
- Hover
- Active
- Focus
- Disabled
- Loading

Do not create page-specific button styles.

Primary CTA should be visually consistent across:
- New Appointment
- Add Bill
- Create Bill
- Add Doctor
- Add Service
- Save
- Confirm

---

# 16. INPUT / FORM SYSTEM V2

Standardize:
- Input height
- Border
- Radius
- Label
- Placeholder
- Helper text
- Required indicator
- Error message
- Success state
- Disabled state
- Focus ring

Use correct field types.

Examples:
- Date → date picker
- Doctor → searchable select
- Status → select
- Amount → numeric/currency field
- Phone → phone field
- Long text → textarea

Do not use text fields where a structured control would reduce errors.

---

# 17. DROPDOWNS / SELECTS / FILTERS

All dropdowns must share one component system.

Improve:
- Trigger size
- Option spacing
- Selected state
- Search inside long lists
- Clear selection
- Keyboard navigation
- Mobile touch target
- Positioning

Filters should clearly communicate active state.

Provide:
- Clear filters
- Active filter count where appropriate

---

# 18. TABLE / LIST SYSTEM V2

Create reusable data-table behavior.

Support:
- Header
- Rows
- Hover
- Selected
- Empty
- Loading
- Error
- Pagination/load-more
- Responsive behavior

Do not solve every table independently.

---

# 19. ICON SYSTEM

Use one icon library/style consistently.

Rules:
- Same visual weight
- Same default size
- Same alignment
- Same button container
- Tooltip for icon-only actions

Do not mix random icon styles.

---

# 20. STATUS SYSTEM

Create semantic status components.

Examples:

Appointment:
- Pending
- Confirmed
- Completed
- Cancelled
- No-show

Billing:
- Paid
- Pending
- Cancelled

Doctor/service:
- Active
- Inactive

Status styling must be consistent everywhere.

---

# 21. RESPONSIVE REQUIREMENT — HIGH PRIORITY

The application must be properly responsive, not merely "scaled down."

Test at minimum:

- 1440px
- 1280px
- 1024px
- 768px
- 600px
- 480px
- 390px
- 360px

## Desktop
Optimize for productivity and information density.

## Tablet
Reflow:
- Header
- Sidebar
- Toolbars
- Cards
- Tables
- Modals

## Mobile
Prioritize:
- Primary action
- Search
- Key information
- Touch-friendly controls

Avoid:
- Horizontal page overflow
- Overlapping elements
- Tiny text
- Tiny buttons
- Desktop tables squeezed into mobile
- Modals extending beyond viewport
- Fixed elements covering content

Minimum touch target should generally be around 44px.

---

# 22. ACCESSIBILITY

Implement:
- Keyboard navigation
- Visible focus states
- Proper labels
- Accessible icon buttons
- Tooltips
- Semantic HTML
- Sufficient contrast
- Screen-reader-friendly names
- Modal focus management

Do not sacrifice accessibility for visual minimalism.

---

# 23. MICRO-INTERACTIONS

Use restrained feedback:

- Button hover
- Press state
- Input focus
- Toggle transition
- Tab transition
- Modal entrance
- Toast feedback
- Loading indicators
- Skeleton loading

Animations should feel fast and professional.

Avoid excessive animation.

---

# 24. EMPTY / LOADING / ERROR STATES

Every major section must have proper states.

Create reusable:
- Loading skeleton
- Empty state
- Error state
- Retry action
- No search results
- No filtered results

Example:

"No bills found"
"Try changing your filters or search."

Do not leave blank white areas.

---

# 25. INFORMATION HIERARCHY RULES

Every screen must answer:

1. Where am I?
2. What is this page for?
3. What is the most important information?
4. What is the primary action?
5. What secondary actions are available?
6. What can I filter/search?
7. What happens if there is no data?

The user should understand the screen within seconds.

---

# 26. SPACE UTILIZATION

Use available screen space intelligently.

Do not:
- Stretch content unnecessarily
- Leave giant empty areas
- Make cards too narrow
- Make modals unnecessarily tall
- Push important actions below the fold

Do:
- Establish a sensible max content width
- Use responsive grids
- Increase useful data density on large screens
- Reflow intelligently on smaller screens

For large screens, the UI should feel intentionally designed rather than like a mobile layout stretched across a desktop.

---

# 27. COMPONENT ARCHITECTURE

Before creating new UI, search the existing codebase for reusable components.

Prefer:

- AppShell
- Header
- Sidebar
- PageHeader
- Tabs
- Button
- IconButton
- Input
- Select
- SearchInput
- FilterBar
- Card
- Badge
- Modal
- Drawer
- Toast
- Tooltip
- DataTable
- EmptyState
- LoadingState
- StatusBadge
- DatePicker
- FormSection

If a component appears more than once, consider making it reusable.

Do not duplicate near-identical components.

---

# 28. IMPLEMENTATION SAFETY

Do not:
- Break routing
- Rename backend fields unnecessarily
- Delete existing functionality
- Replace working business logic
- Change API contracts without necessity
- Remove data
- Create fake functionality
- Introduce unnecessary dependencies

If a visual improvement can be achieved with the current architecture, prefer that.

If refactoring is required:
1. Preserve behavior.
2. Refactor incrementally.
3. Verify existing functionality after each major change.

---

# 29. QUALITY CONTROL AFTER IMPLEMENTATION

After implementing Design System V2, inspect every screen again.

Check:

### Visual
- Alignment
- Spacing
- Typography
- Colors
- Borders
- Radius
- Shadows
- Icons

### UX
- Hierarchy
- CTA placement
- Search
- Filters
- Forms
- Modal flow
- Error prevention

### Responsive
- Desktop
- Tablet
- Mobile
- Touch targets
- Overflow
- Modals
- Tables

### Consistency
Compare:
- Billing vs Calendar
- Calendar vs Inbox
- Inbox vs Doctors
- Doctors vs Billing

The same interaction should look and behave the same everywhere.

---

# 30. FINAL DESIGN REVIEW

Before considering the work complete, act as a senior healthcare SaaS design reviewer.

Score each section from 1–10:

- Visual hierarchy
- UX clarity
- Component consistency
- Information density
- Button hierarchy
- Form usability
- Responsive behavior
- Accessibility
- Professional quality
- Healthcare SaaS suitability

Sections:
- Patient Billing
- Calendar
- Inbox
- Doctors
- Shared Header
- Sidebar
- Modals/Popups

If anything scores below **9.5/10**, fix it before finishing.

Do not stop after the first successful implementation.

Perform at least one final visual/UX refinement pass.

---

# 31. IMPORTANT DESIGN DECISION RULE

When deciding between two UI options, prioritize:

1. User task completion
2. Clarity
3. Consistency
4. Accessibility
5. Responsiveness
6. Information hierarchy
7. Visual polish

Do not choose a design merely because it looks impressive.

This is a working medical SaaS product, so **usability and speed are more important than decoration.**

---

# 32. FINAL EXPECTATION

The finished MedBook AI workspace should feel like a **single professionally designed product**, not four separately designed pages.

Patient Billing, Calendar, Inbox and Doctors must share:

- Same design language
- Same spacing system
- Same buttons
- Same inputs
- Same tabs
- Same filters
- Same modals
- Same status badges
- Same icon treatment
- Same responsive rules
- Same interaction behavior

**Keep the existing functionality. Upgrade the experience.**

The final result should be polished enough to look like a production-ready healthcare SaaS product designed by a top-tier product design team.
