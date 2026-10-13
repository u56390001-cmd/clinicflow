# MedBook AI - Clinical Settings

# Assessment Library Comprehensive UX/UI & Functional Prompt

## Role

Act as a Senior Healthcare SaaS Product Designer, EHR Workflow
Architect, Clinical Documentation Specialist, and Senior React/shadcn UI
Engineer.

------------------------------------------------------------------------

# Task

Build a new section:

Settings → Clinical Settings → Assessment Library

This is a configuration area for creating and managing psychological
assessments that will later be used inside:

Patient Workspace → Psychometrics Tab

Do not place assessment creation inside Psychometrics.

Psychometrics is for patient usage and results. Assessment Library is
for setup and management.

------------------------------------------------------------------------

# Information Architecture

Settings

└── Clinical Settings

    ├── Assessment Library

    ├── Intake Forms

    ├── MSE Templates

    └── Note Templates

------------------------------------------------------------------------

# Assessment Library Purpose

The Assessment Library allows clinics to create, manage, and configure
clinical assessment tools.

Examples:

## Depression

-   PHQ-9
-   BDI-II

## Anxiety

-   GAD-7
-   Beck Anxiety Inventory

## Trauma

-   PCL-5
-   ACE Questionnaire

## Substance Use

-   AUDIT
-   DAST-10

## Other

-   ADHD Scale
-   Sleep Assessment
-   Custom questionnaires

------------------------------------------------------------------------

# Main Assessment Library UI

Create a professional EHR-style interface.

## Header

Show:

Assessment Library

Description:

"Create and manage clinical assessments used for patient screening and
progress tracking."

Actions:

-   -   Create Assessment
-   Import Template
-   Search

------------------------------------------------------------------------

# Categories Section

Allow organization by category.

Example:

Depression

Anxiety

Trauma

ADHD

Substance Use

Sleep

Custom

Features:

-   Create category
-   Rename category
-   Activate/deactivate category

------------------------------------------------------------------------

# Assessment List View

Show assessments as cards/table.

Columns:

-   Assessment Name
-   Category
-   Questions Count
-   Scoring Type
-   Used By
-   Status
-   Actions

Actions:

-   View
-   Edit
-   Duplicate
-   Disable
-   Delete

------------------------------------------------------------------------

# Assessment Builder

Create a flexible assessment builder.

## Step 1: Basic Information

Fields:

-   Assessment name
-   Category
-   Description
-   Target speciality
    -   Psychology
    -   Psychiatry
    -   General Medicine
-   Status
    -   Active
    -   Draft

------------------------------------------------------------------------

# Step 2: Question Builder

Allow adding questions.

Each question contains:

-   Question text
-   Question type

Supported types:

-   Single choice
-   Multiple choice
-   Text response
-   Scale rating

Example:

Question:

"Little interest or pleasure in doing things?"

Options:

0 - Not at all

1 - Several days

2 - More than half the days

3 - Nearly every day

------------------------------------------------------------------------

# Step 3: Scoring Configuration

Allow defining scoring rules.

Fields:

-   Score calculation method
-   Minimum score
-   Maximum score
-   Severity ranges

Example:

PHQ-9:

0-4 Minimal

5-9 Mild

10-14 Moderate

15-19 Moderately Severe

20-27 Severe

------------------------------------------------------------------------

# Step 4: AI Interpretation Rules

Allow AI-assisted summaries.

Example:

Score range:

10-14

AI interpretation:

"Moderate depressive symptoms detected. Consider clinical review."

AI must:

-   Never diagnose automatically
-   Provide clinical support only
-   Require clinician judgement

------------------------------------------------------------------------

# Assignment Integration

Created assessments should become available in:

Patient Workspace → Psychometrics → Assign Assessment

Workflow:

Psychologist selects:

Assign Assessment

↓

Select assessment from library

↓

Choose:

-   Send to patient
-   Complete during consultation
-   Manual entry

↓

Result saved in patient record

------------------------------------------------------------------------

# Permissions

Support roles:

## Admin

Can:

-   Create assessments
-   Edit templates
-   Manage scoring

## Doctor/Psychologist

Can:

-   Use assessments
-   View results
-   Assign assessments

## Receptionist

Can:

-   Send assigned forms only

Cannot:

-   Edit clinical assessments

------------------------------------------------------------------------

# UX Requirements

Design principles:

-   Modern clinical SaaS
-   Clean hierarchy
-   Easy scanning
-   Minimal cognitive load
-   Professional healthcare appearance

Use:

-   Cards
-   Tabs
-   Search
-   Filters
-   Clear actions

Avoid:

-   Complex forms
-   Technical language
-   Overcrowded layouts

------------------------------------------------------------------------

# Data Model Considerations

Assessment should store:

-   Assessment ID
-   Name
-   Category
-   Questions
-   Options
-   Scoring rules
-   Severity mapping
-   AI interpretation rules
-   Created by
-   Updated date
-   Status

------------------------------------------------------------------------

# Final Goal

Create a scalable Clinical Configuration system where MedBook AI can
support:

-   Psychological assessments
-   Intake workflows
-   MSE templates
-   Documentation templates

Assessment Library should become the foundation for AI-powered clinical
workflows across specialties.
