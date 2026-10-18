# MedBook AI — Psychology Patient Workspace UI/UX Improvement

## Objective

Improve the existing **Patient Workspace → Clinical Psychology workspace** using the already-approved **MedBook AI V2 design system**.

This is a **refinement and responsive UX task, NOT a rebuild**.

Preserve all existing:
- functionality
- fields
- data
- APIs
- permissions
- clinical workflows
- AI/scoring logic
- specialty-specific features

Improve:
- information hierarchy
- button hierarchy and placement
- spacing
- component consistency
- use of available space
- navigation
- responsive behavior
- mobile/tablet usability
- accessibility
- visual polish

The existing desktop design is already generally good. Do not redesign it unnecessarily.

---

## Required Skills

Use the installed skills deliberately:

### 1. Front-end Design Skill — PRIMARY
Use for:
- responsive architecture
- desktop/tablet/mobile layouts
- spacing
- sizing
- drawers/sheets
- scrolling
- breakpoint behavior
- layout refactoring

### 2. UI/UX ProMax Skill — PRIMARY
Use for:
- information hierarchy
- action hierarchy
- button placement
- usability
- cognitive-load reduction
- clinician workflow
- consistency
- responsive UX

### 3. shadcn Skill — PRIMARY FOR UI COMPONENT CONSISTENCY
Use/reuse for:
- Button
- Input
- Select
- Tabs
- Accordion
- Dialog
- Sheet
- Dropdown
- Tooltip
- Badge
- Card
- ScrollArea
- form controls

Prefer existing project components/tokens where they already work. Do not replace everything blindly.

### Skill priority

1. Existing MedBook AI V2 design system
2. Front-end Design Skill
3. UI/UX ProMax Skill
4. shadcn Skill

---

# 1. Approved Visual Direction

Continue the existing MedBook AI V2 system.

Current brand direction:
- Primary: `#527A65`
- Dark: `#203D34`
- CTA: `#356F59`
- Background: `#F4F7F3`
- White surfaces
- subtle clinical borders
- restrained green/teal accents
- clean typography
- compact modern clinical SaaS aesthetic

Do NOT introduce:
- gradients
- glassmorphism
- excessive shadows
- decorative effects
- oversized cards
- random colors
- unrelated design patterns

The result should feel:
**clinical + calm + premium + compact + efficient.**

---

# 2. Global Header

Keep the global header SIMPLE.

Current intended structure:
- MedBook AI logo
- global patient search
- essential account/navigation
- New Appointment

Do NOT add patient-specific alerts/risk alerts to the global header.

Clinical alerts and safety information belong in **Overview & Safety**.

Do not duplicate clinical information in the header.

---

# 3. Patient Header / Action Hierarchy

Audit the patient header carefully.

Patient identity should include:
- patient name
- patient ID
- first visit
- token
- waiting/status
- billing status
- age
- gender
- phone

Keep the patient name strongest.

### Action hierarchy

Primary:
**Start Consultation**

Secondary:
- Write Session Note
- Video Call

Tertiary:
- Merge Duplicate
- Edit Profile

Do NOT make every button look like a primary CTA.

Use consistent:
- button heights
- icon sizes
- padding
- radius
- typography
- variants

Suggested hierarchy:
- Primary = solid CTA
- Secondary = outlined
- Tertiary = ghost/text/icon

---

# 4. Workspace Tabs

Psychology tabs:

1. Overview & Safety
2. Intake & History
3. Mental Status Exam
4. Session Notes
5. Psychometrics
6. Documents
7. Care Plan

Treat these as ONE navigation system.

Every tab must have:
- identical height
- consistent typography
- consistent spacing
- consistent active indicator
- predictable interaction

### Desktop
Horizontal tabs.

### Tablet
Horizontal scrolling if required.

### Mobile
Horizontal scrolling or another compact touch-friendly pattern.

Do NOT:
- wrap tabs into multiple rows
- make text microscopic
- cause page-level horizontal scrolling
- squeeze tabs until unreadable

Active tab should remain visually obvious.

---

# 5. Left Patient Sidebar

The patient list/navigation is useful on desktop but too expensive on small screens.

### Desktop
Keep compact/collapsible.

### Tablet
Allow narrow/collapsed behavior.

### Mobile
Convert it to a **Sheet/Drawer/Off-canvas panel**.

It MUST:
- open
- close reliably
- have an obvious close control
- close after selecting a patient where appropriate
- close on backdrop click
- support Escape
- never remain stuck open
- never permanently cover the workspace

Main clinical content should occupy nearly the full mobile width.

---

# 6. Right Clinical Psychology Copilot

Current Copilot is a persistent right-side panel.

### Desktop
Keep it as a secondary panel, but do not let it squeeze the clinical workspace excessively.

### Tablet
Reduce width or make collapsible.

### Mobile
Do NOT keep it as a permanent right column.

Use:
- Sheet/Drawer, OR
- stacked section with a clear trigger

The main clinical content always gets priority.

---

# 7. Space Utilization

Use screen space intelligently.

### Desktop
Preferred mental model:

`Patient navigation | Main clinical workspace | Copilot`

Main workspace gets the majority of width.

### Tablet
Prefer:

`Main clinical workspace`

with side panels collapsible/on-demand.

### Mobile
Prefer:

`Patient header`
`Workspace tabs`
`Clinical content`

Side panels become drawers.

Avoid:
- giant empty spaces
- unnecessarily narrow forms
- oversized cards
- excessive vertical gaps
- desktop columns squeezed into mobile

---

# 8. Responsive Breakpoints

Test at minimum:

Desktop:
- 1440px
- 1280px
- 1024px

Tablet:
- 900px
- 768px
- 600px

Mobile:
- 430px
- 414px
- 390px
- 375px
- 360px

Do not simply shrink the desktop UI. Adapt the layout.

---

# 9. Responsive Rules

At smaller widths:
- reduce horizontal padding
- reduce gaps
- stack multi-column forms
- use full-width controls where appropriate
- preserve readable text
- keep touch targets comfortable
- prevent overlap
- prevent clipping
- prevent horizontal page overflow
- avoid fixed desktop widths
- keep bottom actions reachable

Every form must remain usable by a doctor/receptionist on phone and tablet.

---

# 10. Overview & Safety

Existing content:
- AI Patient Summary
- Safety Snapshot
- Clinical Context
- Current Concerns
- Latest Assessment Scores
- Clinical Timeline
- Documents
- Care Plan

Improve:
- visual hierarchy
- grid proportions
- card spacing
- empty states
- responsive stacking

Safety information should be prominent without being visually alarming when no risk is present.

---

# 11. Intake & History

Existing content:
- Send intake form
- AI Extracted History
- Presenting Concern
- Previous Therapy History
- Previous Diagnosis
- Family Mental Health History
- Social & Psychosocial History
- Current Stressors
- Substance Use History
- Additional Clinical Notes

Keep the accordion structure where useful.

Improve:
- section hierarchy
- accordion headers
- field spacing
- voice-note placement
- AI action placement
- empty states

Do not make AI Draft / Improve / Summarise equally strong as clinical actions.

---

# 12. Mental Status Exam

Existing sections include:
- Appearance
- Behavior & Attitude
- Consciousness
- Orientation
- Speech
- Mood
- Affect
- Thought Process
- Thought Content
- Perception
- Cognition
- Insight
- Judgment
- Risk Assessment
- Functioning / ADLs
- Substance Use
- Additional Notes
- Clinical Summary

Keep the accordion architecture.

Improve:
- scanability
- consistent icons
- open/closed states
- completion state where useful
- spacing
- touch targets
- accessibility

On mobile:
- sections full width
- fields stack
- no cramped horizontal controls

---

# 13. Session Notes

Preserve the existing BIRP/SOAP/DAP workflow.

Improve:
- note-format selector
- recording section
- AI controls
- Behavior
- Intervention
- Response
- Plan
- Save Draft
- Approve Note

Hierarchy:

Primary:
**Approve Note**

Secondary:
**Save Draft**

Utilities:
- AI Draft
- Improve
- Summarise
- Voice note

On mobile, the four clinical sections should stack vertically.

---

# 14. Psychometrics

Existing:
- Score History
- AI Longitudinal Summary
- Recurring Assessments
- Log Assessment
- Send Patient Links

Recommended visual priority:
1. score/history
2. trend/summary
3. record assessment
4. recurring scheduling
5. patient links

Responsive requirements:
- fields stack on mobile
- buttons remain accessible
- date/select controls remain usable
- no overflow

DO NOT alter scoring logic.

---

# 15. Documents

Existing:
- Upload Document
- document area
- Copilot

Improve:
- upload action prominence
- empty state
- document presentation
- responsive layout

Avoid oversized empty states.

---

# 16. Care Plan

Existing:
- Psychiatrist referral
- Therapy goals
- Follow-up frequency
- Intervention plan
- Homework assignments
- Referral notes

Improve:
- grouping
- field hierarchy
- chip layout
- spacing
- mobile stacking

Chips must wrap cleanly and never create horizontal overflow.

---

# 17. Complete Button Audit

Audit EVERY button in the Psychology workspace.

Check:
- purpose
- priority
- location
- variant
- size
- icon
- icon position
- label
- disabled state
- loading state
- mobile behavior

Standardize:

### Primary
Only the most important action.

### Secondary
Supporting actions.

### Tertiary / Ghost
Low-priority utilities.

### Destructive
Only destructive operations.

### AI utilities
Consistent AI treatment but visually subordinate to clinical save/approval actions.

Fix:
- inconsistent heights
- inconsistent radii
- inconsistent icons
- inconsistent padding
- random teal shades
- buttons that compete unnecessarily
- icon-only buttons without accessible labels/tooltips

---

# 18. Icon Audit

Use the existing icon library consistently.

Standardize:
- stroke style
- icon size
- alignment
- spacing

Do not add decorative icons without purpose.

---

# 19. Cards / Containers

The existing card system is good; refine it.

Standardize:
- radius
- border
- padding
- section title
- header spacing
- internal gaps

Remove unnecessary nested containers when they provide no semantic value.

---

# 20. Empty States

Make empty states:
- compact
- clear
- calm
- useful
- actionable where appropriate

Avoid huge boxes with a single sentence.

---

# 21. Form System

Every field should have:
- clear label
- appropriate input
- consistent height
- consistent spacing
- helper text only when needed
- clear validation

Desktop:
Use columns where helpful.

Tablet:
Reduce columns.

Mobile:
Stack fields.

Never force a desktop 3/4-column form onto a narrow screen.

---

# 22. Scrolling

Audit all scrolling.

Avoid:
- unnecessary nested scrollbars
- body-scroll conflicts
- horizontal page scroll
- fixed panels exceeding viewport
- inaccessible bottom actions

On mobile, prioritize normal document scrolling.

---

# 23. Accessibility

Ensure:
- keyboard navigation
- visible focus
- semantic buttons
- accessible icon-only controls
- ARIA labels where needed
- adequate contrast
- touch-friendly controls
- proper dialog/sheet focus behavior
- Escape closes overlays

---

# 24. Clinician Workflow

Optimize around:

1. Identify patient
2. Review immediate status/safety
3. Start consultation
4. Review intake/history
5. Perform MSE/assessment
6. Record session
7. Review psychometrics
8. Manage documents
9. Update care plan
10. Save/approve clinical information

Actions should be near the content they affect.

---

# 25. Do Not Overdesign

This is a clinical SaaS application.

Avoid:
- marketing-style hero sections
- oversized headings
- excessive rounded containers
- excessive shadows
- gradients
- glass effects
- decorative animations
- unnecessary badges
- excessive AI controls
- giant empty cards

Keep it compact and professional.

---

# 26. Implementation Process

## Step 1 — Inspect first

Inspect the actual repository before editing.

Review:
- source structure
- routing
- Patient Workspace
- Psychology workspace
- shared components
- design tokens
- Tailwind/CSS
- shadcn components
- responsive utilities

## Step 2 — Map the architecture

Understand:

`Global Header`
→ `Patient Navigation`
→ `Patient Header`
→ `Workspace Tabs`
→ `Main Clinical Workspace`
→ `Copilot`

## Step 3 — Find systemic problems

Identify:
- duplicated styles
- inconsistent buttons
- inconsistent spacing
- fixed widths/heights
- hardcoded desktop assumptions
- overflow problems
- repeated patterns that should be shared

## Step 4 — Refactor shared patterns

Reuse/create sensible shared components such as:
- PatientHeader
- WorkspaceTabs
- ActionButtonGroup
- SectionCard
- EmptyState
- ResponsivePatientDrawer
- CopilotPanel

Do not over-componentize tiny markup.

## Step 5 — Implement

Improve the Psychology workspace systematically.

## Step 6 — Responsive audit

Test every breakpoint.

## Step 7 — Cross-tab consistency audit

Compare all 7 tabs side-by-side.

## Step 8 — Regression check

Verify all existing functions still work.

---

# 27. Testing Checklist

### Desktop
- [ ] no overlap
- [ ] no clipping
- [ ] good space utilization
- [ ] clear primary action
- [ ] consistent buttons
- [ ] consistent tabs
- [ ] clean patient header
- [ ] Copilot does not squeeze main content excessively

### Tablet
- [ ] no page-level horizontal overflow
- [ ] no overlapping controls
- [ ] patient navigation adapts
- [ ] Copilot adapts/collapses
- [ ] tabs remain usable
- [ ] forms remain readable
- [ ] header never overlaps

### Mobile
- [ ] header works at 360px
- [ ] logo/search/navigation never overlap
- [ ] patient drawer opens
- [ ] patient drawer closes reliably
- [ ] backdrop closes it
- [ ] Escape closes it
- [ ] Copilot is not a permanent side column
- [ ] tabs remain touch-usable
- [ ] no page horizontal scrollbar
- [ ] forms stack
- [ ] buttons never overlap
- [ ] primary action remains discoverable
- [ ] accordions are touch-friendly
- [ ] bottom content is reachable
- [ ] dialogs/sheets fit viewport

---

# 28. Required Visual QA

Actually inspect the rendered UI at:

- 1440×900
- 1280×800
- 1024×768
- 900×800
- 768×1024
- 600×900
- 430×932
- 414×896
- 390×844
- 375×812
- 360×800

Check ALL seven tabs:
- Overview & Safety
- Intake & History
- Mental Status Exam
- Session Notes
- Psychometrics
- Documents
- Care Plan

Pay special attention to:
- patient header
- tab bar
- patient sidebar
- Copilot
- MSE accordions
- Session Notes
- Psychometrics forms
- Care Plan chips
- Documents
- dialogs/sheets

---

# 29. Final Quality Standard

The final result should feel like:

> **One polished MedBook AI Psychology Patient Workspace that naturally adapts from desktop → tablet → mobile.**

The UI should look like one coherent product, not seven independently designed pages.

The primary improvement must come from:

**better hierarchy + better button placement + better spacing + better component consistency + better use of space + better responsive architecture.**

Do not change functionality unnecessarily.

Do not introduce a new design language.

Use the approved V2 MedBook AI design system throughout.

## Final instruction to coding agent

**First analyze the existing implementation and identify the highest-impact UX/responsive problems. Then implement the improvements systematically. Do not make superficial cosmetic changes only. Fix the underlying layout/component patterns so the improvements remain consistent across every Psychology tab and at every screen size.**
