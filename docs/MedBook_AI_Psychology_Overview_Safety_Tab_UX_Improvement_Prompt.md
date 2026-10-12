# MedBook AI Psychology Workspace

# Overview & Safety Tab UX Improvement Prompt

## Role

Act as a senior:

-   Clinical SaaS Product Designer
-   Healthcare UX Specialist
-   Senior React Frontend Engineer
-   shadcn/ui Design System Expert
-   EHR Workflow Designer

Your task is to improve ONLY the existing Psychology Workspace "Overview
& Safety" tab.

Do not rebuild the workspace. Do not change backend logic. Do not create
new workflows.

Modify the existing implementation into a cleaner, modern, professional
clinical dashboard experience.

------------------------------------------------------------------------

# Main Goal

Transform the current Overview & Safety tab from an information page
into a:

"Psychologist Clinical Command Center"

where a psychologist can understand the patient within 30 seconds.

Prioritize:

1.  Patient understanding
2.  Safety awareness
3.  Clinical context
4.  Recent progress
5.  AI assisted insights

------------------------------------------------------------------------

# Skills To Apply

## UI UX Pro Max Skill

Use for:

-   Information hierarchy
-   Clinical dashboard structure
-   Better readability
-   Visual prioritization
-   Professional UX decisions

## Frontend Design Skill

Use for:

-   Premium SaaS design
-   Clean spacing system
-   Component layout
-   Responsive design
-   Visual consistency

## shadcn/ui Skill

Use for:

-   Cards
-   Status indicators
-   Buttons
-   Badges
-   Empty states
-   Clinical components

## React Best Practices Skill

Use for:

-   Reusable components
-   Clean component structure
-   Maintainable code
-   Avoid unnecessary complexity

------------------------------------------------------------------------

# Important Rule

Keep existing Psychology Workspace architecture.

Do not modify:

-   Intake & History
-   Mental Status Exam
-   Session Notes
-   Psychometrics
-   Documents
-   Care Plan

Only improve:

Psychology Workspace → Overview & Safety Tab

Do not add unnecessary data entry forms.

This tab should become a clinical dashboard, not a form.

------------------------------------------------------------------------

# Final Overview & Safety Structure

## 1. AI Patient Summary

Position: Top full width card.

Purpose: Provide quick patient understanding.

Improve current empty state.

Instead of:

"No summary has been generated for this patient."

Use:

"No clinical summary available yet.

Complete intake, assessments, or upload documents to generate AI patient
insights."

When data exists, show:

-   Patient overview
-   Main concern
-   Clinical history summary
-   Important observations
-   Suggested focus areas

Actions:

-   Edit Summary
-   Refresh Summary

AI content should look trustworthy and clinician controlled.

------------------------------------------------------------------------

# 2. Safety Snapshot

Keep this as a high priority section.

Purpose: Mental health risk monitoring.

Include:

## Risk Level

Display:

-   Low
-   Moderate
-   High
-   Crisis

Use clear visual hierarchy.

Example:

Low Risk

Last reviewed: Date

## Risk Factors

Current excessive chips should be simplified.

Show:

None identified

or show active risks only:

-   Self harm
-   Suicidal thoughts
-   Substance use
-   Violence risk
-   Trauma

## Emergency Contact

Move emergency contact inside Safety Snapshot.

Reason:

Emergency information belongs with safety information.

------------------------------------------------------------------------

# 3. Current Concerns

Keep this section.

Improve excessive pills/chips.

Display only active concerns.

Example:

-   Low Mood
-   Anxiety
-   Sleep Disturbance

If more exist:

"+3 more"

Avoid showing every possible option.

------------------------------------------------------------------------

# 4. Clinical Impression

Replace current empty textarea.

Overview should not contain empty forms.

Replace:

"Narrative summary of presentation, history and impression"

with:

Clinical Impression card.

Show:

-   AI generated summary
-   Psychologist notes
-   Edit option

------------------------------------------------------------------------

# 5. Patient Context

Keep patient information.

Show:

-   Patient name
-   Patient ID
-   Age
-   Gender
-   Phone
-   Last session
-   Previous sessions

Keep it compact.

------------------------------------------------------------------------

# 6. Latest Assessment Scores

Keep this card.

Show:

Example:

PHQ-9

Score: 14

Severity: Moderate

GAD-7

Score: 11

Severity: Moderate

Add:

View history

------------------------------------------------------------------------

# 7. Clinical Timeline

Add new section.

Purpose: Show patient journey.

Example:

Today: Assessment completed

10 Oct: Document uploaded

5 Oct: Initial consultation

Use timeline component.

------------------------------------------------------------------------

# 8. Documents Summary

Keep as a summary card only.

Do not show full document list.

Show:

-   Number of documents
-   Latest document
-   View Documents action

------------------------------------------------------------------------

# 9. Care Plan Snapshot

Add small summary card.

Show:

-   Current therapy approach
-   Active goals
-   Next follow-up

Example:

Therapy: CBT

Goal: Reduce anxiety

Follow-up: Weekly

------------------------------------------------------------------------

# Remove From Overview

Move these features to their correct tabs:

## Remove:

-   Send Patient Links
-   Send Assessment button
-   Upload document actions

Reason:

Overview is for understanding the patient, not performing workflow
actions.

Move actions to:

-   Intake & History
-   Psychometrics
-   Documents

------------------------------------------------------------------------

# Layout Recommendation

Desktop layout:

Top: AI Patient Summary

Main area:

Left: - Safety Snapshot - Clinical Context

Right: - Patient Context - Latest Assessments

Bottom:

-   Clinical Timeline
-   Documents Summary
-   Care Plan Snapshot

------------------------------------------------------------------------

# UX Rules

Remove:

-   Excessive badges
-   Too many chips
-   Duplicate information
-   Empty form fields
-   Large unused spaces

Improve:

-   Typography hierarchy
-   Card grouping
-   Section spacing
-   Empty states
-   Clinical readability

------------------------------------------------------------------------

# Final Acceptance Criteria

The improved Overview & Safety tab should:

✓ Feel like a premium international EHR product

✓ Be understandable within seconds

✓ Reduce psychologist cognitive load

✓ Prioritize patient safety

✓ Support AI assisted workflow

✓ Avoid form-like appearance

✓ Match MedBook AI design system

✓ Reuse existing components where possible

Only modify:

Psychology Workspace → Overview & Safety Tab
