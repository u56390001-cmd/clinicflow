# Patient Workspace UX Improvement - Phase 1

## Role

Act as a Senior Full Stack Engineer + UX Engineer.

Follow existing project architecture. Do not rebuild existing components unnecessarily. First inspect current Patient page implementation, components, state management and styling patterns before making changes.

---

# Objective

Improve the current EHR Patient tab workspace.

The goal is to create a more efficient doctor workflow by maximizing workspace area and preparing the foundation for future consultation + AI Copilot integration.

---

# Phase 1 Changes Only

Do not implement consultation fields, prescription redesign, or Copilot yet.

Only implement:

1. Collapsible left navigation/sidebar improvement
2. Patient list workspace improvement
3. Fixed patient header foundation
4. Doctor-focused tab structure foundation

---

# 1. Sidebar Improvement

Current issue:

The permanent left sidebar consumes valuable screen space.

Required:

- Add collapse/expand functionality.
- When collapsed:
  - show only icons.
  - keep tooltip on hover.
- When expanded:
  - show existing menu labels.
- Save user preference if existing state management supports it.

---

# 2. Patient Queue Panel

Improve patient list workspace:

- Keep patient queue panel collapsible.
- Add toggle button.
- Maintain patient search, queue filters and selection functionality.

Expanded view:
- Patient name
- Token
- Status
- Waiting/Completed

Collapsed view:
- Compact patient indicators/icons

---

# 3. Fixed Patient Header

After selecting patient, create a fixed header area.

Include:

- Patient avatar
- Patient name
- Age
- Gender
- UHID
- Visit status
- Allergy alerts
- Critical conditions
- Start Consultation action
- Edit Patient action

Header remains visible while scrolling inside patient workspace.

---

# 4. Patient Workspace Tabs

Create simplified doctor-focused tabs:

- Overview
- History
- Clinical
- Medications
- Documents
- Appointments

Do not remove existing data functionality.

Only reorganize the UI structure.

---

# 5. Layout Structure

Target:

```
Fixed Patient Header

Tabs

Patient Workspace

Left Context Panel        Main Work Area

Patient Summary           Selected Tab Content

Allergies                 Forms
Conditions                Tables
Previous Data             Actions
```

---

# 6. Design Requirements

Follow existing EHR design language:

- Inter typography
- White card layout
- Soft gray borders
- Rounded corners
- Compact professional spacing
- Medical SaaS style
- Status pills
- Clear hierarchy

Do not introduce unrelated visual styles.

---

# 7. Technical Requirements

Before coding inspect:

- Current Patient page component
- Layout components
- CSS/Tailwind configuration
- Existing reusable components

Reuse existing components where possible.

Avoid duplicate UI systems.

---

# Acceptance Criteria

Phase 1 complete when:

- Sidebar collapse/expand works
- Patient queue collapse/expand works
- Selected patient has fixed header
- Doctor workspace has simplified tabs
- More working area is available
- Existing patient data continues working
- Existing navigation is not broken

---

# Future Phases (Do Not Implement Now)

Future:

- Overview dashboard
- Consultation workspace
- Prescription inside same screen
- Lab ordering workflow
- AI Copilot panel
- Ambient voice integration
