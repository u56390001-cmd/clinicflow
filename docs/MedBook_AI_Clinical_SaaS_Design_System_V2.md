# MedBook AI — Clinical SaaS Design System V2
## Master UI/UX Specification for AI Coding Agents

**Status:** Proposed master system  
**Product:** MedBook AI — AI-Powered Healthcare Practice Management Software  
**Purpose:** Single source of truth for all authenticated SaaS UI  
**Scope:** Dashboard, Appointments, Calendar, Patients, Patient Workspace, Billing, Inbox, Services, Availability, Doctors, AI Settings, Team, Settings, and future modules.

---

# 1. NON-NEGOTIABLE PRODUCT DIRECTION

MedBook AI is a modern clinical practice-management SaaS. The interface must feel:

- Clean
- Calm
- Spacious
- Premium
- Clinical
- Trustworthy
- Fast to scan
- Easy for receptionists, doctors, therapists and clinic staff
- Consistent across every module

## Critical visual principle

**Do NOT interpret "compact SaaS" as tiny text, cramped cards or minimum whitespace.**

The application has sufficient desktop space. Prefer comfortable information density.

The design should be:

> **Spacious + structured + information-rich, never crowded.**

Do not reduce font sizes simply to fit more information. When a screen is crowded, first improve hierarchy, grouping, progressive disclosure and layout before reducing typography.

---

# 2. DESIGN SYSTEM AUTHORITY

This document supersedes conflicting visual instructions in older enhancement prompts.

The existing codebase/design-system should be refactored toward this system rather than creating a second competing design language.

## Rule

There must be:

- One color token system
- One typography system
- One spacing scale
- One radius scale
- One elevation system
- One icon system
- One component vocabulary
- One responsive strategy
- One interaction/motion language

Feature-specific screens may compose these primitives but must not invent arbitrary visual tokens.

---

# 3. BRAND COLOR SYSTEM

## 3.1 Primary palette

| Token | Hex | Role |
|---|---|---|
| `brand-primary` | `#4F806C` | Primary actions, active controls, key accents |
| `brand-primary-hover` | `#3F6F5D` | Hover/pressed state |
| `brand-primary-medium` | `#679986` | Secondary emphasis, charts, supporting accents |
| `brand-sage` | `#DCEBE3` | Selected backgrounds, soft badges |
| `brand-sage-soft` | `#EEF5F1` | Very subtle highlighted sections |
| `app-background` | `#F7F9F7` | Main application canvas |
| `surface` | `#FFFFFF` | Cards, panels, dialogs |
| `text-primary` | `#29423A` | Main headings and high-priority text |
| `text-secondary` | `#667872` | Supporting text |
| `border` | `#DCE5E1` | Dividers, card/input borders |

## 3.2 Why this palette

Avoid very dark forest greens such as `#163A32` as a dominant UI color. They read too close to black.

MedBook AI should have a visibly green identity while remaining bright and approachable.

Use dark green only for text hierarchy, not as the dominant surface.

---

# 4. SEMANTIC COLOR ROLES

Never choose colors based only on visual preference inside individual components.

Use semantic roles.

## Primary action

- Background: `#4F806C`
- Text: `#FFFFFF`
- Hover: `#3F6F5D`
- Active/pressed: slightly darker than hover
- Focus ring: `#679986` with accessible contrast

Examples:
- Add Patient
- New Appointment
- Create Invoice
- Save
- Send
- Confirm

## Secondary action

Preferred appearance:

- Background: `#FFFFFF`
- Border: `#DCE5E1`
- Text: `#29423A`
- Hover background: `#EEF5F1`

Examples:
- Cancel
- Export
- Filter
- View details

## Soft action

- Background: `#EEF5F1`
- Text: `#3F6F5D`
- Hover: `#DCEBE3`

Use for low-emphasis actions.

## Destructive

- Primary: `#D9534F`
- Soft background: `#FCEDEC`
- Text on soft background: dark red
- Never use destructive red merely as decoration.

## Success

- Primary: `#249A67`
- Soft: `#EAF7F0`

Use with text/icon as well as color.

Examples:
- Paid
- Completed
- Active
- Confirmed

## Warning

- Primary: `#D99A32`
- Soft: `#FFF6E5`

Examples:
- Pending
- Waiting
- Expiring
- Requires attention

## Information

Use a restrained blue:

- `#3B82A0`
- Soft: `#EAF4F7`

Use for neutral informational states.

---

# 5. COLOR USAGE PROPORTION

The interface should visually feel approximately:

- 60–70% `#F7F9F7` / white surfaces
- 15–25% neutral text/borders
- 5–10% sage/soft green
- 2–5% primary green
- Semantic colors only where meaningful

Do not make every card green.

Do not make the entire sidebar dark green.

Do not use primary green for ordinary body text.

Do not use five accent colors on one screen.

---

# 6. TYPOGRAPHY

## Font

Preferred product font:

**Plus Jakarta Sans**

Fallback:

```text
Plus Jakarta Sans, Inter, system-ui, -apple-system, "Segoe UI", sans-serif
```

Use one product UI font consistently.

Avoid mixing Poppins, Inter, Roboto and Jakarta Sans within the authenticated application.

## Base rules

- Base font size: **16px**
- Default body line-height: **1.5**
- Body text must remain comfortable to read.
- Never use body text below 14px.
- 12px is reserved for rare metadata/captions only.
- Do not use tiny typography to solve layout problems.

---

# 7. TYPE SCALE

| Role | Size | Weight | Line height |
|---|---:|---:|---:|
| Display | 32px | 700 | 1.2 |
| Page title | 28px | 600–700 | 1.25 |
| H1 | 24px | 600 | 1.3 |
| H2 | 20px | 600 | 1.35 |
| H3 | 17px | 600 | 1.4 |
| Body large | 16px | 400 | 1.5 |
| Body | 15px | 400 | 1.5 |
| Body medium | 15px | 500 | 1.5 |
| Label | 14px | 500 | 1.4 |
| Small | 13px | 400–500 | 1.4 |
| Micro | 12px | 500 | 1.35 |

## Weight rules

Use:

- 400: normal content
- 500: labels, buttons, navigation
- 600: headings and emphasis
- 700: major KPI/value emphasis

Avoid excessive bold text.

---

# 8. TEXT HIERARCHY

Primary text:
`#29423A`

Secondary:
`#667872`

Muted:
Use a derived muted gray-green, approximately `#8A9793`.

Do not use low-contrast gray for essential information.

Do not use opacity as the only method of creating hierarchy.

Hierarchy should come from:

1. Size
2. Weight
3. Color
4. Spacing
5. Grouping

---

# 9. SPACING SYSTEM

Use an 8px base rhythm.

Tokens:

```text
space-1 = 4px
space-2 = 8px
space-3 = 12px
space-4 = 16px
space-5 = 20px
space-6 = 24px
space-7 = 28px
space-8 = 32px
space-10 = 40px
space-12 = 48px
space-16 = 64px
space-20 = 80px
```

## Application guidance

- Icon-to-label: 8px
- Form label-to-input: 6–8px
- Input internal horizontal padding: 12–16px
- Card internal padding: **20–24px**
- Large dashboard cards: **24px**
- Section gap: **24–32px**
- Page section separation: **32–40px**
- Main page horizontal padding desktop: **32px**
- Large desktop layouts may use 40px.

Avoid 8px cards that feel compressed.

---

# 10. LAYOUT SYSTEM

## Desktop

Preferred application structure:

```text
Global Header
---------------------------------------------
Sidebar | Main Content
        | Page Header
        | Content
```

Recommended desktop:

- Sidebar: 240–260px
- Header: 64–72px
- Main content horizontal padding: 32px
- Maximum content width: generally 1440px where appropriate
- Do not artificially constrain dashboards to narrow columns.

## Tablet

- Sidebar collapses or becomes drawer depending on width.
- Maintain 20–24px content padding.
- Two-column cards can become one/two responsive columns.
- Tables may simplify.

## Mobile

- Sidebar becomes drawer.
- Header becomes compact but readable.
- Content padding: 16px
- Cards: 16–20px padding
- Do not shrink fonts aggressively.
- Tables transform into mobile-friendly lists/cards where necessary.
- Actions may become full-width or grouped.

---

# 11. RESPONSIVE BREAKPOINTS

Use CSS media queries based on layout needs rather than device names.

Suggested:

```text
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

Principles:

- `<768px`: mobile
- `768–1023px`: tablet
- `1024px+`: desktop
- `1280px+`: comfortable desktop
- `1536px+`: large desktop

Never create horizontal overflow.

Never depend on hover for essential functionality.

---

# 12. APPLICATION SHELL

## Global header

Purpose:

- Brand
- Global patient search
- Inbox
- Notifications
- User/account controls

Recommended height:

**64–72px**

Keep it visually light.

Background:
`#FFFFFF`

Bottom border:
`#DCE5E1`

Avoid heavy shadows.

## Sidebar

Desktop:

- White or very light surface
- 240–260px
- Clear active navigation
- Comfortable item height: 40–44px
- Grouped navigation
- Section labels only when useful

### Active navigation

Use:

- Background: `#EEF5F1`
- Text/icon: `#3F6F5D`
- Optional 2–3px primary accent indicator

Do NOT use a huge dark block.

### Sidebar hover

- Background: `#F7F9F7`
- Text remains readable
- 150–200ms transition

---

# 13. PAGE HEADER

Every major page should have a predictable header:

```text
Page title
Short contextual description

[secondary actions] [primary action]
```

Example:

```text
Patients
Manage patient records and clinical information.

[Import] [Add Patient]
```

Do not repeat the same title three times.

Avoid unnecessary breadcrumbs on shallow navigation.

---

# 14. CARDS

Default:

- Background: `#FFFFFF`
- Border: `1px solid #DCE5E1`
- Radius: 12–14px
- Padding: 20–24px
- Shadow: extremely subtle or none

Cards should establish grouping, not decorate the page.

## KPI cards

Use:

- Label: 14px
- Value: 24–30px
- Supporting text: 13–14px
- Optional small icon
- Comfortable vertical spacing

Avoid oversized colorful KPI cards.

---

# 15. BUTTON SYSTEM

## Primary

Height:

- Desktop: 40–44px
- Comfortable large CTA: 44–48px
- Mobile: minimum 44px

Padding:

- 14–18px horizontal

Radius:
10px

Primary:
`#4F806C`

Hover:
`#3F6F5D`

## Secondary

White background + border.

## Ghost

Transparent with subtle hover.

## Destructive

Use only for irreversible/risky actions.

### Button rules

- Sentence case
- Clear verb
- Avoid "Click here"
- Icon optional
- Icon should support, not replace, the label unless universally understood.

---

# 16. INPUTS / FORMS

Default input:

- Height: 44–48px
- Font: 15–16px
- Border: `#DCE5E1`
- Background: `#FFFFFF`
- Radius: 10px
- Padding: 12–14px

Focus:

- Border: `#4F806C`
- Visible focus ring
- Never remove keyboard focus indication

Labels:

- Always visible
- 14px / 500
- Do not use placeholder as the only label

Helper text:
13–14px

Errors:
Place near the field and explain how to fix them.

---

# 17. TABLES

Desktop tables should be comfortable, not dense.

Recommended row height:
48–56px.

Header:
13–14px / 600

Cell:
14–15px

Use:

- clear column hierarchy
- enough horizontal padding
- hover state
- status badges
- action menu

Avoid 32px rows.

On mobile:
Do not force a 12-column table into a 360px viewport.

Transform to:
- cards
- stacked key/value rows
- horizontal scroll only when genuinely necessary and acceptable

---

# 18. BADGES / STATUS

Use semantic meaning.

Examples:

```text
Paid       → success
Pending    → warning
Cancelled  → danger
Confirmed  → success/primary
Waiting    → warning
Draft      → neutral
```

Soft badge style:

- colored pale background
- semantic text
- optional icon

Never use saturated backgrounds for every status.

---

# 19. ICON SYSTEM

Preferred:
**Lucide React** or existing consistent SVG icon library.

Rules:

- Stroke-based icons
- 1.75–2px stroke
- 16px small
- 18px standard
- 20px prominent
- 24px large

Never use emoji as navigation icons.

Icon-only controls must have accessible labels/tooltips where appropriate.

Do not mix filled and outline icon families randomly.

---

# 20. MODALS / DRAWERS

Modal:

- White surface
- 12–16px radius
- 24px padding
- Clear title
- Clear close action
- Primary + secondary footer actions
- Escape/cancel support

Use drawer for:

- quick edit
- filters
- contextual details
- mobile workflows

Do not place complex multi-step workflows in tiny dialogs.

---

# 21. DASHBOARD DESIGN

Dashboard should answer:

1. What is happening today?
2. What requires attention?
3. What are today's appointments?
4. What is the clinic performance?
5. What actions should I take?

Suggested hierarchy:

```text
Dashboard
Welcome/context
        ↓
KPI overview
        ↓
Today's appointments + priority/attention
        ↓
Charts / operational insights
        ↓
Recent activity
```

Do not fill every available area with a card.

Whitespace is intentional.

---

# 22. PATIENTS MODULE

Primary hierarchy:

```text
Patients
[Search] [Filters] [Add Patient]

Patient list
```

Patient row should prioritize:

1. Patient name
2. UHID / identifier
3. Contact
4. Last visit
5. Status
6. Primary action

Avoid displaying every possible patient field in the main table.

Use patient workspace for detail.

---

# 23. PATIENT WORKSPACE

The patient workspace is clinically important and should have strong hierarchy.

Recommended:

```text
Patient identity/header
Visit/token/status
--------------------------------
Overview | History | Health Info | Vitals
Prescriptions | Documents | Appointments
--------------------------------
Current/priority clinical content
```

The patient identity area should not duplicate the same patient details repeatedly.

Use tabs for genuinely different information categories.

"Documents" remains a first-class destination.

---

# 24. APPOINTMENTS

Appointment information should be scannable.

Priority:

1. Time
2. Patient
3. Doctor/provider
4. Appointment type
5. Status
6. Action

Status should be visually distinct but not visually dominant.

Appointment cards should have comfortable vertical spacing.

---

# 25. CALENDAR

Calendar needs:

- strong date hierarchy
- readable event blocks
- clear today state
- predictable navigation
- enough event height
- accessible event colors

Do not encode appointment meaning only through color.

---

# 26. BILLING

Billing should visually prioritize:

- outstanding amount
- paid amount
- invoice status
- due date
- patient
- action

Use success/warning/danger sparingly.

Financial numbers should be easy to scan.

---

# 27. INBOX

Inbox should follow familiar messaging hierarchy:

```text
Conversation list | Conversation
```

Unread:
- weight/color difference
- unread indicator
- never rely only on color

Keep message composition simple.

---

# 28. DATA VISUALIZATION

Charts should be:

- simple
- readable
- clinically/business relevant
- accessible
- lightly styled

Do not use excessive gradients.

Do not use 8–12 colors if 2–4 are sufficient.

Primary chart accent:
`#4F806C`

Secondary:
`#679986`

Supporting:
`#DCEBE3`

Semantic colors only where data meaning requires them.

---

# 29. INTERACTION STATES

Every interactive component should define:

```text
default
hover
focus
active/pressed
disabled
loading
success
error
```

Never implement only the default state.

### Timing

Typical UI transitions:

- 120–180ms: micro interaction
- 180–220ms: hover/state
- 220–300ms: drawer/modal
- Avoid excessive animation

Use:

```css
prefers-reduced-motion
```

Respect reduced-motion preferences.

---

# 30. HOVER RULE

Hover should communicate affordance without changing layout.

Good:

- subtle background
- subtle border
- slight shadow
- color shift

Avoid:

- large movement
- scale that changes surrounding layout
- dramatic glow
- heavy animation

---

# 31. FOCUS / ACCESSIBILITY

Minimum expectations:

- Keyboard navigation
- Visible focus
- Semantic HTML
- Accessible labels
- Correct heading hierarchy
- Accessible icon buttons
- Color contrast
- Do not communicate meaning through color alone
- Form labels
- Error messages adjacent to fields

Target sizes:

- Web interactive controls: at least approximately 44px where practical
- Icon buttons should have comfortable hit areas even if the icon itself is 18–20px.

---

# 32. EMPTY STATES

Empty state should answer:

1. What is empty?
2. Why?
3. What can the user do?

Example:

```text
No appointments today
There are no appointments scheduled for this date.

[Create appointment]
```

Avoid decorative illustrations unless they add value.

---

# 33. LOADING STATES

Prefer skeletons when content structure is known.

Skeletons should resemble the final layout.

Do not make the entire page flash or jump.

Reserve space to reduce layout shift.

---

# 34. ERROR STATES

Error messages should be:

- understandable
- close to the failed operation
- actionable

Example:

```text
Unable to load appointments
Please try again.

[Retry]
```

Avoid technical stack traces in user-facing UI.

---

# 35. RESPONSIVE COMPONENT BEHAVIOR

Do not simply shrink desktop.

Responsive behavior should be intentional.

### Sidebar

Desktop:
persistent.

Tablet:
collapsible.

Mobile:
drawer.

### Tables

Desktop:
full table.

Tablet:
reduce secondary columns.

Mobile:
cards/stacked rows.

### Action groups

Desktop:
horizontal.

Mobile:
wrap or stack.

### Filters

Desktop:
inline.

Mobile:
filter drawer/sheet.

### Modals

Desktop:
center modal.

Mobile:
near-full-screen sheet/drawer where appropriate.

---

# 36. DENSITY RULE

Three density levels:

## Comfortable — default

Use for most clinical SaaS screens.

- 16px base text
- 20–24px card padding
- 48–56px table rows

## Standard

For data-heavy views.

- 15px body
- 16–20px card padding
- 44–52px rows

## Dense — exceptional

Only for highly structured power-user tables.

Never use dense mode globally.

---

# 37. DESIGN TOKENS

Suggested CSS variables:

```css
:root {
  --color-primary: #4F806C;
  --color-primary-hover: #3F6F5D;
  --color-primary-medium: #679986;

  --color-sage: #DCEBE3;
  --color-sage-soft: #EEF5F1;

  --color-background: #F7F9F7;
  --color-surface: #FFFFFF;

  --color-text-primary: #29423A;
  --color-text-secondary: #667872;
  --color-text-muted: #8A9793;

  --color-border: #DCE5E1;

  --color-success: #249A67;
  --color-success-soft: #EAF7F0;

  --color-warning: #D99A32;
  --color-warning-soft: #FFF6E5;

  --color-danger: #D9534F;
  --color-danger-soft: #FCEDEC;

  --color-info: #3B82A0;
  --color-info-soft: #EAF4F7;

  --font-sans: "Plus Jakarta Sans", Inter, system-ui, sans-serif;

  --radius-sm: 8px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 18px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
}
```

Components must consume tokens rather than hardcoded hex values.

---

# 38. RADIUS SYSTEM

Use restrained rounding:

- Small controls: 8px
- Inputs/buttons: 10px
- Cards: 12–14px
- Large panels: 16–18px
- Pills: 9999px only for badges/chips

Do not make every object extremely rounded.

---

# 39. ELEVATION

Prefer borders over shadows.

Level 0:
flat surface.

Level 1:
subtle card shadow.

Level 2:
dropdown/popover.

Level 3:
modal.

Avoid strong floating shadows throughout the dashboard.

---

# 40. INFORMATION HIERARCHY

Every screen should have one primary visual focus.

Use:

```text
Primary
  ↓
Secondary
  ↓
Supporting
  ↓
Metadata
```

Do not give every section the same font size, color, border and visual weight.

---

# 41. COMPONENT REUSE

Before creating a new component, check whether an existing primitive can be reused.

Core primitives:

- Button
- IconButton
- Input
- Select
- Textarea
- Checkbox
- Radio
- Switch
- Badge
- Avatar
- Card
- Table
- Tabs
- Modal
- Drawer
- Dropdown
- Tooltip
- Toast
- Skeleton
- EmptyState
- PageHeader
- SectionHeader
- SearchInput
- FilterBar

Feature modules compose these.

Do not create `PatientButton`, `BillingButton`, `AppointmentButton` unless behavior genuinely differs.

---

# 42. AI CODING AGENT IMPLEMENTATION RULES

When an AI agent receives this design system, it MUST:

## Before editing

1. Inspect existing architecture.
2. Identify shared components.
3. Identify existing tokens.
4. Identify conflicting styles.
5. Identify feature-specific styles.
6. Report intended changes.
7. Preserve functionality.

## During editing

- Prefer existing shared components.
- Update tokens centrally.
- Avoid raw hex values in feature components.
- Do not duplicate CSS.
- Do not rewrite working business logic.
- Do not change API contracts.
- Do not change database schema.
- Do not change routes unless explicitly requested.
- Do not remove existing functionality.
- Do not introduce a second design system.

## After editing

Verify:

- Desktop
- Tablet
- Mobile
- Keyboard navigation
- Hover/focus
- Loading
- Empty
- Error
- Long text
- Long patient names
- Narrow viewport
- Large desktop viewport
- No horizontal overflow

---

# 43. SCREEN-BY-SCREEN REDESIGN PROTOCOL

When improving one module:

### Step 1 — Audit

Identify:

- current hierarchy
- duplicate content
- spacing problems
- typography problems
- component inconsistencies
- responsiveness
- accessibility issues

### Step 2 — Structure

Define:

- page header
- primary action
- sections
- cards
- tables/lists
- responsive transformation

### Step 3 — Apply tokens

No new colors unless a genuine semantic requirement exists.

### Step 4 — Apply shared components

Reuse existing Button, Card, Input, Tabs, etc.

### Step 5 — Responsive behavior

Explicitly define desktop/tablet/mobile.

### Step 6 — Polish

Fix:

- alignment
- spacing
- icon sizing
- line heights
- hover
- focus
- loading
- empty
- errors

### Step 7 — Regression check

Confirm functionality remains unchanged.

---

# 44. VISUAL QA CHECKLIST

Before considering a screen complete:

## Layout

- [ ] Clear page hierarchy
- [ ] Comfortable whitespace
- [ ] No unnecessary compression
- [ ] Alignment consistent
- [ ] Grid spacing consistent

## Typography

- [ ] Base text readable
- [ ] Headings hierarchical
- [ ] Labels not tiny
- [ ] Numbers readable
- [ ] No random font sizes

## Color

- [ ] Primary green used intentionally
- [ ] Background remains light
- [ ] Cards remain clear
- [ ] Semantic colors meaningful
- [ ] No excessive accent colors

## Components

- [ ] Buttons consistent
- [ ] Inputs consistent
- [ ] Cards consistent
- [ ] Icons consistent
- [ ] Badges consistent
- [ ] Radius consistent

## Responsive

- [ ] Desktop
- [ ] Tablet
- [ ] Mobile
- [ ] No horizontal overflow
- [ ] Touch targets comfortable
- [ ] Navigation works

## Accessibility

- [ ] Focus states
- [ ] Contrast
- [ ] Labels
- [ ] Keyboard support
- [ ] Color not sole indicator

---

# 45. WHAT THE FINAL MEDBOOK AI UI SHOULD FEEL LIKE

The desired visual language is:

> **Bright clinical workspace + premium SaaS organization + generous whitespace + calm sage/teal accents.**

It should NOT feel:

- like a generic Bootstrap admin panel
- like a dark developer dashboard
- like a crowded hospital ERP
- like a marketing website
- like a mobile app stretched onto desktop
- overly green
- overly rounded
- overly animated
- tiny-text dense

The user should immediately understand:

- where they are
- what matters
- what needs attention
- what action they can take

---

# 46. DESIGN DECISION PRIORITY

When two design decisions conflict, use this priority:

1. Clinical usability
2. Accessibility
3. Information hierarchy
4. Consistency
5. Readability
6. Responsive behavior
7. Visual polish
8. Decoration

Never sacrifice usability for visual novelty.

---

# 47. IMPORTANT ANTI-PATTERNS

AI agents MUST NOT:

- use arbitrary colors
- create random gradients
- use glassmorphism everywhere
- use huge shadows
- use tiny 11–12px body text
- make every card green
- make sidebar nearly black
- use emoji as icons
- create excessive pills
- use excessive animations
- use hover-only interactions
- hide important information solely on mobile
- force desktop tables onto mobile
- duplicate patient information unnecessarily
- create new components when an existing primitive works
- hardcode spacing differently on every page
- change working business logic during UI work

---

# 48. CHANGE MANAGEMENT

Any future design-system change should update this master specification first.

When a new component is introduced, document:

- purpose
- anatomy
- variants
- states
- sizes
- spacing
- responsive behavior
- accessibility
- usage examples
- prohibited usage

This prevents design drift.

---

# 49. FINAL AGENT INSTRUCTION

When this file is supplied to an AI coding agent, the agent should treat it as the **visual source of truth for MedBook AI authenticated SaaS UI**.

The agent's objective is not to make the interface "more compact."

The objective is:

> **Make the existing functional product look like a cohesive, premium, modern clinical SaaS product while preserving all existing functionality.**

For every UI task:

**Audit → Plan → Reuse → Implement → Responsive → Accessibility → Visual QA → Regression check.**

Never skip the audit.

Never redesign only the screenshot while ignoring the existing component architecture.

Never solve a local inconsistency by creating another competing style.

---

# 50. IMPLEMENTATION ROADMAP

Recommended implementation sequence:

### Phase A — Foundation
- Tokens
- Typography
- Global background
- Surface system
- Borders
- Radius
- Shadows
- Buttons
- Inputs
- Icons

### Phase B — App Shell
- Global header
- Sidebar
- Navigation
- Page header
- Responsive shell

### Phase C — Dashboard
- KPI cards
- Appointment overview
- Activity
- Charts
- Attention states

### Phase D — Patients
- Patient list
- Search
- Filters
- Patient workspace
- Tabs
- Documents

### Phase E — Appointments + Calendar
- Appointment cards
- Queue
- Calendar
- Event states

### Phase F — Billing
- Invoices
- Payments
- Billing summaries

### Phase G — Inbox
- Conversation list
- Message view
- Compose

### Phase H — Remaining modules
- Services
- Availability
- Doctors
- AI Settings
- Team
- Settings

### Phase I — Global QA
- Responsive audit
- Accessibility
- Interaction states
- Consistency audit
- Remove design drift

---

## MASTER RULE

**Do not rebuild the product. Upgrade its visual system.**

Existing functionality is an asset and must remain intact.

The finished application should feel like one product—not a collection of separately designed pages.
