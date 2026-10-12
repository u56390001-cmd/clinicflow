# MedBook AI Psychology Workspace

# Intake & History Tab - UX Improvement Prompt

## Task

Improve ONLY the Psychology Workspace → Intake & History Tab.

Do not modify: - Overview & Safety - Mental Status Exam - Session
Notes - Psychometrics - Documents - Care Plan

## Core Workflow

Patient completes Initial Intake Form ↓ AI extracts and structures
information ↓ Psychologist reviews and approves ↓ History record is
saved

This tab is a clinician workspace, not the patient-facing form.

## UX Direction

Replace the current flat layout with:

-   Accordion based sections (similar to MSE)
-   Clean clinical cards
-   Better hierarchy
-   Less cognitive load
-   Professional EHR design

Reduce excessive badges. Use: - Checkbox / multi-select for structured
history - Searchable dropdowns for diagnoses - Narrative fields with AI
assistance

## Top AI Review Section

Add:

AI Extracted History

Show: - Patient Intake Form data - Uploaded document data - Previous
record data

Actions: - Review Changes - Accept All - Edit

AI must never overwrite clinical records without clinician approval.

## Accordion Sections

### Presenting Concern

Include: - Main concern - Duration - Severity - Patient words

### Previous Therapy History

Multi-select: - CBT - DBT - Family Therapy - Group Therapy -
Counselling - Psychodynamic - Medication Therapy - Other

### Previous Diagnosis

Use searchable diagnosis selector.

Support: - Multiple diagnoses - Custom diagnosis

### Family Mental Health History

Options: - None known - Depression - Anxiety - Bipolar disorder -
Substance use - Suicide history - Psychiatric illness - Other

Add relationship/details note.

### Social & Psychosocial History

Narrative field:

-   Family background
-   Education
-   Occupation
-   Relationships
-   Social support
-   Important life events

Actions: - Voice to Note - AI Draft - Improve - Summarize

### Current Stressors

Options: - Work - Academic - Family - Relationship - Financial -
Health - Trauma - Housing - Isolation - Other

### Substance Use History

Structured + notes:

Options: - None - Alcohol - Tobacco - Drugs - Other

Details: - Frequency - Duration - Last use - Treatment history

Actions: - Voice to Note - AI Draft - Summarize

### Additional Clinical Notes

Support: - Voice dictation - AI improvement - Summary generation

## Source Tracking

Every field should show source:

-   Patient reported
-   AI extracted
-   Clinician added

Show status: - Pending review - Approved - Updated

## Data Reuse

Saved history should be available for:

-   Overview & Safety AI summary
-   Session Notes
-   Care Plan
-   Future visits

## Empty State

Show:

"No intake history available yet.

Send patient intake form or add history during consultation."

## Final Goal

Create:

"AI-assisted clinical history management"

Not:

"A digital checklist."

Priorities: 1. Fast psychologist workflow 2. Easy AI review 3. Accurate
documentation 4. Clean EHR readability 5. Reusable patient history
