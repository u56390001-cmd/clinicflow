# PRD Prompt: Build Growth Agent Tab (ClinicFlow / Doxmate Style)

## Role

You are a Senior Software Architect, Principal Full-Stack Engineer,
Product Engineer, UX Engineer, Database Architect, Security Engineer, QA
Engineer, and DevOps Engineer.

Your responsibility is to build a production-ready feature inside the
existing ClinicFlow system.

Do not behave like a code generator. First inspect the existing
repository, architecture, database schema, components, authentication,
permissions, API patterns, and design system.

------------------------------------------------------------------------

# Feature Name

Growth Agent

------------------------------------------------------------------------

# Objective

Build a complete new application tab named:

**Growth Agent**

This tab does not currently exist in the system. Implement it from
scratch while following the existing ClinicFlow architecture and
conventions.

The final result must be:

-   Production ready
-   Fully functional
-   Responsive
-   Secure
-   Maintainable
-   Integrated with existing authentication and multi-tenant
    architecture
-   Free from TypeScript errors
-   Free from runtime errors
-   Tested

------------------------------------------------------------------------

# Reference UI Requirement

Use the provided Growth Agent dashboard reference as the visual and UX
source.

The goal is to recreate the same user experience and layout style:

-   Same information hierarchy
-   Same dashboard structure
-   Same spacing rhythm
-   Same card-based layout
-   Same interaction patterns
-   Same visual quality

Do not copy raw HTML. Convert the design into proper reusable
React/Next.js components following the existing project architecture.

Reference assets provided:

-   Growth Agent HTML prototype
-   Dashboard screenshot
-   Design system tokens

The prototype includes:

-   Header navigation
-   Sidebar navigation
-   Growth Agent dashboard
-   Connection banner
-   Metrics cards
-   AI post generator
-   Automation settings
-   Live preview panel
-   Post queue management
-   Modal interactions
-   Toast notifications

------------------------------------------------------------------------

# Design System

Follow these tokens:

## Colors

Primary:

#4E5DB5

Accent:

#3E4A91

Surface:

#FFFFFF

Background:

#F9FAFB

Muted:

#6B7280

Border:

#D1D5DB

------------------------------------------------------------------------

# Typography

Font:

Inter

Headings:

-   H1: 24px / 600
-   H3: 20px / 700
-   H4: 16px / 700

Body:

14px / 400

------------------------------------------------------------------------

# Layout Rules

Use:

-   4px spacing system
-   Rounded cards
-   Soft borders
-   Flat modern SaaS dashboard style
-   No unnecessary shadows

Card:

-   White background
-   Border
-   12px radius
-   24px padding

Buttons:

-   Primary color
-   White text
-   12px radius

Inputs:

-   Light background
-   Border
-   8px radius

------------------------------------------------------------------------

# Product Understanding

Growth Agent helps clinics improve patient acquisition and online
visibility.

The feature should support:

1.  Google Business Profile management
2.  AI-generated clinic posts
3.  Content scheduling
4.  Approval workflow
5.  Performance analytics
6.  Profile health monitoring

------------------------------------------------------------------------

# Required Screens / Sections

## 1. Growth Agent Header

Include:

-   Page title
-   Description
-   Primary actions
-   Time range filters

Example:

Growth Agent

"Automate post generation, boost search visibility, and monitor clinic
metrics."

------------------------------------------------------------------------

# 2. Google Business Profile Connection

Create a connection module.

States:

-   Not connected
-   Connecting
-   Connected
-   Error

Actions:

-   Connect profile
-   Sync data
-   Configure settings

------------------------------------------------------------------------

# 3. Metrics Dashboard

Create reusable metric cards:

Required metrics:

## GMB Views

Shows profile visibility.

## Profile Calls

Shows patient phone interactions.

## Direction Requests

Shows location searches.

## Profile Health Score

Shows optimization score.

Each card needs:

-   Icon
-   Value
-   Trend
-   Comparison period

------------------------------------------------------------------------

# 4. AI Post Generator

Create a complete working form.

Fields:

-   Content topic
-   Keywords
-   Writing tone
-   Call to action

Actions:

-   Generate post
-   Save draft
-   Preview content

The AI integration should be abstracted behind a service layer.

Do not place AI API logic directly inside components.

------------------------------------------------------------------------

# 5. Live Preview

Create Google Business style preview.

Must update dynamically when:

-   Topic changes
-   CTA changes
-   Keywords change
-   Generated content changes

------------------------------------------------------------------------

# 6. Auto Publishing Settings

Create settings:

-   Enable auto post
-   Frequency
-   Day selection
-   Time selection
-   Approval requirement

Persist settings.

------------------------------------------------------------------------

# 7. Post Queue

Create queue management.

Statuses:

-   Draft
-   Scheduled
-   Published
-   Failed

Actions:

-   Edit
-   Approve
-   Publish
-   Delete

Include:

-   Loading states
-   Empty states
-   Error states
-   Confirmation states

------------------------------------------------------------------------

# Backend Requirements

Before implementation inspect:

-   Existing Supabase schema
-   Existing tables
-   Authentication model
-   Tenant structure
-   User roles
-   Existing API patterns

Create database changes only if required.

Any database migration must be:

-   Safe
-   Reversible
-   Backward compatible

------------------------------------------------------------------------

# Suggested Data Entities

Only create if they do not already exist.

Possible entities:

## growth_agent_settings

Stores automation preferences.

## growth_posts

Stores generated posts.

Fields:

-   id
-   tenant_id
-   created_by
-   content
-   topic
-   keywords
-   status
-   scheduled_at
-   published_at
-   created_at
-   updated_at

## growth_metrics

Stores performance data.

------------------------------------------------------------------------

# Security Requirements

Must implement:

-   Tenant isolation
-   Permission checks
-   Server-side authorization
-   Input validation
-   Secure API handling

Never trust frontend permissions.

------------------------------------------------------------------------

# Engineering Requirements

Before coding:

1.  Inspect repository.
2.  Identify existing patterns.
3.  Create implementation plan.
4.  Confirm affected files.
5.  Implement incrementally.

------------------------------------------------------------------------

# Component Requirements

Build reusable components:

Example:

-   GrowthAgentPage
-   MetricCard
-   ConnectionCard
-   PostGenerator
-   PreviewPanel
-   AutomationSettings
-   PostQueue
-   StatusBadge

Follow existing component conventions.

------------------------------------------------------------------------

# Testing Requirements

Verify:

## UI

-   Responsive layout
-   Loading states
-   Empty states
-   Error states

## Functional

-   Generate post
-   Save settings
-   Update preview
-   Change filters
-   Manage queue

## Security

-   Tenant boundaries
-   Permissions

------------------------------------------------------------------------

# Final Response Format

After implementation report:

## Understanding

## Files Changed

## Database Changes

## Features Implemented

## Testing Performed

## Remaining Assumptions

Do not claim anything was tested unless actually verified.

------------------------------------------------------------------------

# Golden Rule

Build this feature like a production SaaS module that will be maintained
by a professional engineering team.

Preserve ClinicFlow architecture.

Do not create isolated demo code.

Deliver a complete integrated Growth Agent module.
