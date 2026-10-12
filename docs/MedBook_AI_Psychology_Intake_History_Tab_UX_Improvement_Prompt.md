# MedBook AI Psychology Workspace

# Intake & History Tab UX Improvement Prompt

## Role

Act as a senior: - Clinical SaaS UX Designer - Healthcare EHR Workflow
Specialist - Senior React Frontend Engineer - shadcn/ui Design System
Expert - AI Assisted Documentation Designer

## Task

Improve ONLY the existing Psychology Workspace:

**Intake & History Tab**

Do not modify: - Overview & Safety - Mental Status Exam - Session
Notes - Psychometrics - Documents - Care Plan

Convert the current tab into a modern AI-assisted clinical history
workspace.

------------------------------------------------------------------------

# Core Purpose

Intake & History is not a dashboard.

It is used for:

-   Collecting patient background
-   Reviewing AI extracted history
-   Psychologist approval
-   Adding clinical details
-   Maintaining long-term patient history

Overview & Safety should only show summarized information.

------------------------------------------------------------------------

# Data Sources

The tab should receive information from:

## AI Extracted Data

Sources: - Patient pre-visit questionnaire - WhatsApp intake - Uploaded
documents - Previous session notes

AI should suggest information with:

-   Source
-   Date
-   Approve
-   Edit
-   Reject

AI suggestions must require psychologist approval before saving.

------------------------------------------------------------------------

## Manual Psychologist Entry

Support:

-   Checkboxes
-   Multi-select
-   Searchable dropdowns
-   Custom add option
-   Structured fields
-   Narrative fields

Avoid unnecessary typing.

------------------------------------------------------------------------

## Voice Assisted History

Narrative fields should support:

-   Voice to Note
-   AI Write
-   Improve wording
-   Summarize

Psychologist can speak naturally and AI converts it into clinical
documentation.

------------------------------------------------------------------------

# UI/UX Requirements

Create:

-   Modern clinical SaaS UI
-   High readability
-   Professional EHR experience
-   Low cognitive load

Avoid:

-   Long forms
-   Excessive badges
-   Too many visible options
-   Empty text areas without assistance

------------------------------------------------------------------------

# Required Sections

## Previous Therapy History

Use structured selection:

-   None
-   CBT
-   DBT
-   Family Therapy
-   Group Therapy
-   Counselling
-   Psychodynamic
-   Medication Therapy
-   Other

Show selected items clearly with source information.

------------------------------------------------------------------------

## Previous Diagnosis

Use searchable clinical dropdown:

-   Depression
-   Anxiety Disorder
-   Panic Disorder
-   PTSD
-   OCD
-   ADHD
-   Bipolar Disorder
-   Substance Use
-   Other

Allow multiple selections and custom additions.

------------------------------------------------------------------------

## Family Mental Health History

Use checklist:

-   Depression
-   Anxiety
-   Bipolar Disorder
-   Substance Use
-   Suicide History
-   Psychiatric illness
-   None Known

Allow additional notes.

------------------------------------------------------------------------

## Stressors

Use selectable clinical options:

-   Work
-   Academic
-   Family
-   Relationship
-   Financial
-   Health
-   Trauma
-   Housing
-   Isolation
-   Other

Show only selected items.

------------------------------------------------------------------------

## Psychosocial Background

Keep as narrative section.

Support:

-   Voice input
-   AI Draft
-   Improve wording

Include:

-   Family background
-   Education
-   Occupation
-   Relationships
-   Social support
-   Important life events

------------------------------------------------------------------------

## Substance Use History

Hybrid UI:

Structured:

-   None
-   Alcohol
-   Tobacco
-   Drugs
-   Other

Details:

-   Frequency
-   Duration
-   Last use
-   Treatment history

Add AI and voice assistance.

------------------------------------------------------------------------

# Source Tracking

Every history item should show:

Source: - Patient Intake - Uploaded Document - Previous Session -
Psychologist Added - AI Extracted

Example:

Family Therapy

Source: Previous document

Approved by: Psychologist

Date: 12 Oct 2026

------------------------------------------------------------------------

# Record Management

Approved history data should:

-   Save permanently in patient record
-   Be available for future visits
-   Support AI Summary generation
-   Support Session Notes context
-   Support Care Plan suggestions

------------------------------------------------------------------------

# Empty State

Avoid blank forms.

Example:

"No history information available yet.

Complete patient intake or upload previous records to generate AI
suggestions."

------------------------------------------------------------------------

# Final Goal

The Intake & History tab should feel like:

"AI assisted clinical history collection"

not:

"Manual paperwork form"

It should help psychologists:

✓ Review history faster ✓ Reduce typing ✓ Capture accurate background ✓
Maintain longitudinal records ✓ Reuse information across the workspace

Only modify:

Psychology Workspace → Intake & History Tab
