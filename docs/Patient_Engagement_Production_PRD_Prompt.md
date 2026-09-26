# Patient Engagement Module --- Production Ready Development Prompt

## Role

Act as a Senior Full Stack Engineer, Frontend Architect, UX Engineer,
Backend Engineer, QA Engineer, Security Engineer, and DevOps Engineer.

Build a complete production-ready Patient Engagement & Automation module
inside the existing Doxmate application.

This is NOT a static UI task.

Convert the provided HTML/CSS prototype into a fully functional,
scalable, secure SaaS feature.

------------------------------------------------------------------------

# Primary Goal

Create a Patient Engagement system that helps clinics automate:

-   WhatsApp appointment reminders
-   Review requests
-   Prescription delivery
-   Billing receipt delivery
-   Check-in notifications
-   Appointment confirmation messages
-   No-show recovery
-   Post-visit follow-up automation

The final implementation must be production-ready, error-free,
maintainable, and integrated with the existing system.

------------------------------------------------------------------------

# Reference UI Requirement

Use the uploaded Patient Engagement HTML/CSS prototype as the exact UX
reference.

The implementation must preserve:

-   Layout structure
-   Navigation shell
-   Sidebar behavior
-   Card hierarchy
-   Typography
-   Spacing
-   Colors
-   Responsive behavior
-   Interactive states

The prototype uses: - Tailwind CSS structure - Inter font - Doxmate
dashboard design language - Component-based dashboard layout

Reference elements include:

-   Sticky top navigation
-   Sidebar with Engagement active state
-   Patient Engagement page header
-   Metric summary cards
-   Reminder/Automation switcher
-   Automation configuration cards
-   Live WhatsApp preview panel
-   Smart automation cards
-   Pro tips section
-   Modals
-   Toast notifications

------------------------------------------------------------------------

# Design System

## Theme

Modern healthcare SaaS dashboard.

Style:

-   Light theme
-   Minimal
-   Professional
-   Flat design
-   Soft borders
-   No excessive shadows
-   Clean information hierarchy

------------------------------------------------------------------------

# Colors

Primary:

#4E5DB5

Primary Hover:

#3E4A91

Surface:

#FFFFFF

Background:

#F8FAFC

Border:

#E5E7EB

Alternative Border:

#DADBDF

Success:

#10B981

WhatsApp Colors:

WhatsApp Green: #075E54

WhatsApp Header: #008069

WhatsApp Bubble: #DCF8C6

------------------------------------------------------------------------

# Typography

Font:

Inter

H1:

24px Weight 700

H3:

20px Weight 700

H4:

16px Weight 600

Body:

14px Weight 400

------------------------------------------------------------------------

# Application Layout

Reuse existing:

-   Header
-   Search
-   Notifications
-   AI credits badge
-   User profile
-   Sidebar
-   Mobile drawer
-   Navigation system

Sidebar active item:

Engagement

------------------------------------------------------------------------

# Page Structure

Create:

    PatientEngagementPage

    ├── Header Section
    ├── Metrics Cards
    ├── Engagement Tabs
    ├── Automation Workspace
    │
    ├── Left Column
    │   ├── Review Automation
    │   ├── Prescription Delivery
    │   ├── Receipt Delivery
    │   ├── Check-in Messages
    │   ├── Appointment Confirmation
    │   ├── General Settings
    │   ├── Recovery Automation
    │   └── Follow-up Automation
    │
    └── Right Column
        ├── WhatsApp Live Preview
        ├── Smart Automation Explanation
        └── Pro Tips

------------------------------------------------------------------------

# Metrics Dashboard

Create functional analytics cards:

## Reminders Sent

Display:

-   Total reminders
-   Previous period comparison

## Appointment Show-up Rate

Display:

-   Percentage
-   Trend

## Google Reviews

Display:

-   Review count
-   Trend

## Average Rating

Display:

-   Star rating
-   Empty state

Data must come from backend APIs.

------------------------------------------------------------------------

# Reminder System

Create:

## Reminder Templates

Support:

-   Multiple reminders
-   Timing configuration
-   Doctor targeting
-   Patient variables

Variables:

    {patient_name}
    {doctor_name}
    {appointment_date}
    {appointment_time}
    {clinic_location}

------------------------------------------------------------------------

# WhatsApp Message Builder

Functional features:

-   Text editor
-   Variable insertion buttons
-   Character count
-   Preview synchronization
-   Validation
-   Save template

------------------------------------------------------------------------

# Live WhatsApp Preview

Create realistic mobile preview.

Requirements:

-   Real-time message updates
-   WhatsApp styling
-   Patient placeholder replacement
-   Delivery status
-   Location card preview

------------------------------------------------------------------------

# Automation Features

## Google Review Automation

Features:

-   Enable/disable toggle
-   Smart filters
-   Message template
-   Delay settings
-   Review URL configuration
-   Save settings

## Prescription Delivery

Features:

-   Auto-send PDF prescription
-   WhatsApp delivery
-   Status tracking

## Billing Receipt

Features:

-   Auto-send receipt
-   Payment event trigger

## Check-in Confirmation

Features:

-   Queue token
-   Estimated waiting time
-   Patient notification

## Appointment Confirmation

Features:

-   Editable message template
-   Modal editor
-   Variable support

------------------------------------------------------------------------

# No-Show Recovery

Create automation workflow:

Trigger:

Appointment marked no-show

Actions:

-   Wait configured delay
-   Send WhatsApp recovery message
-   Offer rebooking

Track:

-   Messages sent
-   Responses
-   Rebookings
-   Recovery rate

------------------------------------------------------------------------

# Auto Follow-up Flow

Create:

Post consultation automation.

Features:

-   Schedule delay
-   Feedback collection
-   Recovery check
-   Follow-up appointment creation

Track:

-   Messages sent
-   Responses
-   Conversion rate

------------------------------------------------------------------------

# Backend Requirements

Follow existing backend architecture.

Create:

-   Services
-   API endpoints
-   Database models
-   Validation
-   Background jobs

Never put business logic inside React components.

------------------------------------------------------------------------

# Suggested Database Models

## engagement_templates

Fields:

-   id
-   organization_id
-   type
-   template_text
-   variables
-   enabled
-   created_at
-   updated_at

## engagement_automations

Fields:

-   id
-   organization_id
-   automation_type
-   status
-   trigger_config
-   action_config
-   created_at

## engagement_logs

Fields:

-   id
-   organization_id
-   patient_id
-   automation_id
-   message_status
-   sent_at
-   response_data

------------------------------------------------------------------------

# Security Requirements

Implement:

-   Multi-tenant isolation
-   Permission checks
-   Secure WhatsApp credentials
-   Audit logs
-   Server-side validation
-   Rate limiting

------------------------------------------------------------------------

# Components Required

Create reusable components:

    EngagementHeader

    MetricCard

    AutomationTabs

    ReminderCard

    AutomationCard

    MessageEditor

    VariablePicker

    WhatsAppPreview

    ToggleSwitch

    SettingsCard

    RecoveryCard

    FollowUpCard

    ConfirmationModal

    ToastNotification

------------------------------------------------------------------------

# Functional Requirements

Everything must work:

-   Tabs switch correctly
-   Toggles update state
-   Templates save
-   Preview updates instantly
-   Modals open/close
-   Forms validate
-   API errors display
-   Loading states exist
-   Empty states exist

------------------------------------------------------------------------

# Responsive Requirements

Support:

Desktop

Tablet

Mobile

Include:

-   Sidebar drawer
-   Responsive cards
-   Mobile preview handling
-   Touch-friendly controls

------------------------------------------------------------------------

# Testing Checklist

Verify:

## UI

✓ Matches HTML prototype UX

✓ Correct spacing

✓ Correct typography

✓ Correct colors

## Functional

✓ Automation toggles

✓ Message editing

✓ Preview sync

✓ Save actions

✓ API integration

## Technical

✓ No console errors

✓ No TypeScript errors

✓ No broken imports

✓ Production build succeeds

------------------------------------------------------------------------

# Final Delivery Report

After implementation provide:

## Summary

## Files Changed

## Components Added

## Database Changes

## API Changes

## Background Jobs

## Testing Results

## Remaining Limitations

------------------------------------------------------------------------

# Final Instruction

Build this as a real healthcare SaaS production module.

Do not create mock-only screens.

Implement complete working functionality using the existing Doxmate
architecture and frontend design system.
