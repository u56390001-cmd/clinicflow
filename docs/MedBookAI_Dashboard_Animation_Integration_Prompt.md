# MedBook AI Dashboard --- Interactive UI Polish & Missing Integration Prompt

## Role

Act as a Senior SaaS Product Designer, Frontend Architect and UI/UX
Motion Specialist.

Use these skills: - Frontend Design - UI UX Pro Max - shadcn/ui -
Next.js App Router best practices - React performance optimization -
Accessibility and interaction design

## Objective

Improve the existing MedBook AI dashboard without changing the existing
structure, routes, database logic, security or sidebar.

This phase is ONLY: - UI polish - Hover animations -
Micro-interactions - Better visual hierarchy - Missing integration
completion

Do not redesign the dashboard.

## Preserve

-   Sidebar unchanged
-   Existing cards unchanged
-   Existing Supabase connections unchanged
-   Existing permissions unchanged
-   Existing routes unchanged

Do not use fake production data.

------------------------------------------------------------------------

# Design System

Keep:

Dark Forest Green: #203D34\
Primary Sage: #527A65\
CTA Green: #356F59\
Soft Background: #F4F7F3\
White: #FFFFFF

------------------------------------------------------------------------

# Improvements Required

## 1. Dashboard Header

Improve: - Clinic overview section - Greeting animation - Subtitle
hierarchy - Date badge styling

Existing New Appointment button already exists in the dashboard header.

Do not create another button.

Only improve: - hover state - shadow - subtle scale animation - smooth
transition

------------------------------------------------------------------------

## 2. KPI Cards

Keep all existing cards:

-   Appointments today
-   Patients waiting
-   In consultation
-   Completed visits
-   New patients this week
-   AI-assisted bookings
-   Website bookings
-   Cancellation rate

Improve only:

-   Card spacing
-   Typography
-   Icon containers
-   Hover elevation
-   Smooth number loading animation

Hover: - move card upward 3-5px - increase shadow softly - animate icon
container

Avoid flashy animations.

------------------------------------------------------------------------

## 3. Today's Schedule

Improve: - Appointment table readability - Empty state design - Row
hover effects - Status visibility

Add: - Better healthcare empty state - Smooth loading states - Action
button visibility on hover

------------------------------------------------------------------------

## 4. Queue Snapshot

Integrate with existing queue system.

Display:

-   Waiting patients
-   Now serving
-   In consultation
-   Up next
-   Waiting room

Add: - Live indicator - Smooth counter updates - Better button
interactions

Buttons: - View Queue - Check In Patient

Use: - hover lift - icon animation - smooth transitions

------------------------------------------------------------------------

## 5. Recent Messages

Improve WhatsApp/inbox preview:

-   Better patient avatars
-   Message card design
-   Timestamp hierarchy
-   Unread indicators

Hover: - subtle background highlight - arrow animation

------------------------------------------------------------------------

## 6. Recent Activity

Convert into a clean SaaS activity timeline.

Improve: - Icons - Event priority colors - Hover expansion

Include: - Integration alerts - Billing events - Patient activity -
System events

------------------------------------------------------------------------

# Integration Verification

Confirm these work with real data:

## Appointment Engine

-   Today's appointments
-   Doctor
-   Patient
-   Status
-   Actions

## Queue System

-   Waiting count
-   Current consultation
-   Next token
-   TV queue state

## Inbox / WhatsApp

-   Messages
-   Conversation status

## Billing

-   Subscription alerts
-   Payment events

## AI Assistant

-   AI activity
-   Booking events
-   Integration status

If data is unavailable: show a professional empty state.

Never add fake data.

------------------------------------------------------------------------

# Motion Guidelines

Use: - Framer Motion - CSS transitions - shadcn/ui patterns

Recommended: - Fade in - Slide up - Soft scale - Hover elevation -
Number animation

Avoid: - Bounce effects - Large movements - Distracting animations

------------------------------------------------------------------------

# Testing

Test:

1440px desktop\
1280px laptop\
768px tablet\
390px mobile

Check: - No overflow - Smooth animations - Touch support - Existing
functionality preserved

Run: npm run build

Provide: - Components changed - Integrations completed - Animation
approach - Screenshots before/after

## Goal

Make MedBook AI dashboard feel like a premium healthcare SaaS product:

Professional. Calm. Fast. Interactive. Trustworthy.

This is a production polish phase, not a redesign.
