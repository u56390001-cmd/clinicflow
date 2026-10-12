# MedBook AI Psychology Workspace

# Session Notes Tab UX Improvement Prompt

## Task

Improve ONLY: Psychology Workspace → Session Notes Tab

Do not modify: - Overview & Safety - Intake & History - Mental Status
Exam - Psychometrics - Documents - Care Plan

## Core Workflow

Therapy Session ↓ Voice Recording / Transcript ↓ AI Clinical Note Draft
↓ Psychologist Review & Edit ↓ Approve ↓ Save to Patient Record

AI assists documentation but does not replace psychologist judgement.

------------------------------------------------------------------------

# Note Formats

Support:

## BIRP

Default for therapy sessions.

Behavior: Patient presentation, concerns, statements

Intervention: Therapeutic techniques used

Response: Patient reaction and progress

Plan: Next steps

## SOAP

Support medical/psychiatric documentation.

Subjective: Patient reported symptoms

Objective: Observed behaviour and MSE observations

Assessment: Clinical impression

Plan: Treatment and follow-up

## DAP

Data: Session information

Assessment: Clinical interpretation

Plan: Next actions

------------------------------------------------------------------------

# Note Format Selection

Add selector:

-   BIRP
-   SOAP
-   DAP

Selected format controls AI generation.

Default can depend on psychologist speciality, but clinician can change
it.

------------------------------------------------------------------------

# AI Copilot Context

AI must understand active workspace context.

Session Notes tab: Transcript → Session Note Draft

Intake & History: Transcript → Patient History

Mental Status Exam: Transcript → MSE suggestions

AI must not generate the wrong document type.

------------------------------------------------------------------------

# Recording Workflow

Recording must continue when psychologist navigates between tabs.

Use:

-   Floating AI Copilot
-   Background recording state
-   Live transcript

Psychologist can open MSE during session while recording continues.

------------------------------------------------------------------------

# Session Notes UI

Header:

-   Patient name
-   Session date
-   Session type
-   Therapist name
-   Note format

Actions:

-   Start Recording
-   Stop Recording
-   Generate AI Note

Main editor:

Structured sections based on selected format.

Example BIRP:

Behavior

AI Draft

Edit

Intervention

AI Draft

Edit

Response

AI Draft

Edit

Plan

AI Draft

Edit

------------------------------------------------------------------------

# AI Features

Add:

-   Voice to Note
-   AI Draft
-   Improve wording
-   Summarize
-   Regenerate

AI should:

-   Convert transcript into professional clinical language
-   Maintain factual accuracy
-   Never invent diagnosis
-   Use available records only

------------------------------------------------------------------------

# Approval Workflow

AI notes remain Draft until psychologist approves.

Actions:

-   Edit
-   Approve
-   Save

------------------------------------------------------------------------

# Previous Session Context

Optional side panel:

-   Previous goals
-   Previous interventions
-   Progress
-   Pending plan

------------------------------------------------------------------------

# Record Management

Save:

-   Patient
-   Therapist
-   Date/time
-   Session type
-   Note format
-   Final approved note

Support:

-   PDF export
-   Print
-   Patient history record

------------------------------------------------------------------------

# AI Training Rules

AI Copilot should understand:

-   SOAP structure
-   BIRP structure
-   DAP structure
-   Clinical documentation language

Rules:

-   Separate observation and interpretation
-   Do not create unsupported information
-   Require psychologist approval
-   Use transcript and patient records only

------------------------------------------------------------------------

# Final UX Goal

Create:

"AI-assisted psychotherapy documentation system"

Not:

"A simple text editor with recording."

Priorities:

1.  Fast psychologist workflow
2.  Accurate notes
3.  Continuous recording
4.  AI assistance
5.  Secure patient records
