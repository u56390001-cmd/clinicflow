# PRD Prompt: Build Production Ready Integrations Module

## Role

Act as a Senior Full Stack Engineer, Frontend Architect, Backend
Engineer, UX Engineer, Security Engineer, QA Engineer, and DevOps
Engineer.

You are working inside the existing ClinicFlow/Doxmate codebase.

Your task is NOT to create a demo.

Build a complete production-ready Integrations module that follows the
existing application architecture, coding standards, authentication
model, database patterns, and design system.

------------------------------------------------------------------------

# Feature

## Integrations Dashboard

Purpose:

Allow organizations to connect Doxmate with external tools and manage
automation integrations.

The module should provide:

-   Integration discovery
-   Search
-   Filtering
-   Connection management
-   Plan restrictions
-   Activation/deactivation
-   Configuration workflows
-   Status management
-   Future OAuth/API integrations support

------------------------------------------------------------------------

# Reference Material

Use the provided Integration HTML prototype and screenshot as the UI/UX
reference.

The prototype already defines:

-   Header
-   Sidebar
-   Integrations page layout
-   Filter tabs
-   Search
-   Integration cards
-   Status states
-   Modals
-   Toast notifications
-   Responsive behavior

The HTML uses Inter typography, Tailwind structure, and the Doxmate
dashboard tokens.

The prototype defines the application shell with: - Top header - Sidebar
navigation - Main content container - Integrations page header

Reference implementation details from the prototype should be converted
into reusable React components, not copied as static HTML.

------------------------------------------------------------------------

# Design System

## Visual Direction

Create a modern healthcare SaaS dashboard.

Style:

-   Light theme
-   Clean professional interface
-   Flat UI
-   Minimal shadows
-   Soft borders
-   Compact spacing
-   High information density

------------------------------------------------------------------------

# Colors

Primary:

#4E5DB5

Primary Dark:

#3E4A91

Background:

#F5F7F9

Surface:

#FFFFFF

Text:

#111827

Muted:

#6B7280

Border:

#E5E7EB

Success:

#22C55E

------------------------------------------------------------------------

# Typography

Font:

Inter

H1:

22px / 700

H2:

16px / 700

Body:

12px-14px

Line height:

1.5-1.65

------------------------------------------------------------------------

# Layout Requirements

## Application Shell

Reuse existing:

-   Header
-   Sidebar
-   Navigation
-   User menu
-   Notifications
-   Search

Add active sidebar state:

Integrations

------------------------------------------------------------------------

# Integrations Page

Structure:

    Integrations

    Page Description

    Filter Controls

    Search

    Integration Categories

    Integration Cards

    Connection Modals

    Toast Notifications

------------------------------------------------------------------------

# Filter System

Create functional filters:

## All Integrations

Shows everything.

## Activated

Shows connected/active integrations.

## Disabled

Shows disabled, unavailable, or locked integrations.

Requirements:

-   Active tab styling
-   Count badges
-   URL state support if project uses route filters
-   Loading states

------------------------------------------------------------------------

# Search

Create real-time integration search.

Search fields:

-   Integration name
-   Description
-   Provider name

Requirements:

-   Instant filtering
-   Empty results state
-   Clear search option

------------------------------------------------------------------------

# Integration Categories

Create configurable categories.

Initial categories:

## Google Workspace

Integrations:

### Google Calendar

Purpose: Sync doctor calendars and appointments.

States:

-   Locked
-   Available
-   Connected

### Google Meet

Purpose:

Generate meeting links for online consultations.

### Google Sheets

Purpose:

Export reports and organization data.

------------------------------------------------------------------------

## Video & Telemedicine

Integrations:

### Zoom Consultations

Features:

-   Active state
-   Enable/disable toggle
-   Configuration modal

### Microsoft Teams

Features:

-   Connect workflow
-   Status management

------------------------------------------------------------------------

## Automation & Patient Experience

Integrations:

### Queue Management

Features:

-   Active toggle
-   Details modal

### WhatsApp Reminders

Features:

-   Setup workflow

### SMS Gateway

Features:

-   Connect workflow

------------------------------------------------------------------------

# Integration Card Component

Create reusable component:

    IntegrationCard

Props:

    name
    description
    provider
    icon
    status
    planRequired
    actions

Card states:

## Locked

Display:

-   Lock icon
-   "Not on your plan"
-   Upgrade button

## Not Connected

Display:

-   Status indicator
-   Connect button

## Connected

Display:

-   Active badge
-   Toggle
-   Details button

## Disabled

Display:

-   Disabled status
-   Re-enable action

------------------------------------------------------------------------

# Connection Modal

Create reusable modal.

Features:

-   Provider name
-   Credentials/API fields
-   OAuth placeholder support
-   Sync frequency selection
-   Save settings
-   Validation
-   Loading state
-   Error state

Example fields:

-   API Key
-   Access Token
-   Sync Frequency

Never store secrets directly in frontend code.

------------------------------------------------------------------------

# Upgrade Modal

For premium integrations.

Features:

-   Explain required plan
-   Upgrade CTA
-   Cancel action

------------------------------------------------------------------------

# Toast System

Use existing notification system.

Required events:

Success:

"Integration activated successfully"

"Settings saved"

Info:

"Integration disabled"

Error:

"Connection failed"

------------------------------------------------------------------------

# Backend Requirements

Follow existing backend architecture.

Create:

-   Integration service layer
-   API routes/server actions
-   Validation schemas
-   Database models if required

Do not place API logic inside UI components.

------------------------------------------------------------------------

# Suggested Data Model

Adapt to existing database.

## integrations

Fields:

-   id
-   tenant_id
-   provider
-   name
-   status
-   configuration
-   enabled
-   created_at
-   updated_at

## integration_logs

Fields:

-   id
-   tenant_id
-   integration_id
-   action
-   status
-   error_message
-   created_at

------------------------------------------------------------------------

# Security Requirements

Must support:

-   Multi tenant isolation
-   Permission checks
-   Secure credential handling
-   Server-side validation
-   Audit logging

Never expose API keys/tokens.

------------------------------------------------------------------------

# Frontend Architecture

Create reusable components:

    IntegrationsPage

    IntegrationFilters

    IntegrationSearch

    IntegrationCategory

    IntegrationCard

    IntegrationModal

    UpgradeModal

    StatusBadge

    ToggleSwitch

    ToastNotification

Follow existing project folder structure.

------------------------------------------------------------------------

# Responsive Requirements

Support:

Desktop

Tablet

Mobile

Required behaviors:

-   Mobile sidebar drawer
-   Responsive card grid
-   Accessible buttons
-   Touch friendly controls

------------------------------------------------------------------------

# Testing Requirements

Verify:

## UI

-   Matches reference design
-   Correct spacing
-   Correct typography
-   Correct colors
-   Responsive layout

## Functional

-   Search works
-   Filters work
-   Modal workflows work
-   Toggle state works
-   Toast notifications work

## Technical

-   No TypeScript errors
-   No console errors
-   No broken imports
-   No security issues

------------------------------------------------------------------------

# Final Delivery Report

After coding provide:

## Summary

## Files Changed

## Components Created

## Database Changes

## API Changes

## Testing Completed

## Known Limitations

------------------------------------------------------------------------

# Final Instruction

Build this as a real production SaaS Integrations feature.

Use the existing frontend design system.

Do not create placeholder-only UI.

Implement clean, scalable, maintainable production code.
