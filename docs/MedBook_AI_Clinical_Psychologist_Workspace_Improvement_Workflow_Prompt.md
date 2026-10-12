# MedBook AI Clinical Psychologist Workspace Improvement Workflow Prompt

## Purpose

This document defines the complete workflow improvement plan for the
MedBook AI Clinical Psychologist / Mental Health EHR workspace.

The goal is to transform the current system from a form-filling
interface into a modern clinical workflow platform where psychologists
can document faster using structured selections, AI assistance, and
voice-based documentation.

------------------------------------------------------------------------

# Core Design Principles

## 1. Reduce Manual Typing

The current workflow relies too heavily on empty text fields.

Replace unnecessary typing with:

-   Dropdown selections
-   Chips
-   Checkboxes
-   Searchable clinical options
-   Templates
-   Custom add option

Keep free text only where clinical judgement is required.

------------------------------------------------------------------------

## 2. AI Assisted Documentation

Every important narrative field should support:

-   AI Write
-   Voice to Note
-   Improve wording
-   Summarize session
-   Generate clinical draft

AI output must always require clinician review before saving.

------------------------------------------------------------------------

# Patient Header Improvements

Keep:

-   Patient name
-   Patient ID
-   Age
-   Gender
-   Phone
-   Appointment status
-   Token information

Add:

-   Current diagnosis
-   Main concern
-   Risk level indicator
-   Last session date
-   Current therapy plan

------------------------------------------------------------------------

# Tab 1: Overview & Safety

## Risk Level

Use selectable chips:

-   Low
-   Moderate
-   High
-   Crisis

## Risk Factors

Checkbox options:

-   Suicidal thoughts
-   Self harm history
-   Violence risk
-   Substance abuse
-   Abuse history
-   None known

## Mental Health Summary

Replace empty textbox with:

AI Patient Summary Card

Features:

-   Auto-generated summary
-   Editable by psychologist
-   Previous session context

## Current Concerns

Use multi-select:

-   Anxiety
-   Depression
-   Sleep problems
-   Relationship issues
-   Trauma
-   Anger
-   Addiction
-   Stress
-   Other + Custom

## Emergency Contact

Keep manual input.

------------------------------------------------------------------------

# Tab 2: Intake & History

## Previous Therapy History

Use dropdown:

-   None
-   CBT
-   DBT
-   Family Therapy
-   Counselling
-   Medication Therapy
-   Other

Allow:

-   Add details

------------------------------------------------------------------------

## Previous Diagnosis

Searchable clinical dropdown:

-   Depression
-   Anxiety Disorder
-   PTSD
-   OCD
-   ADHD
-   Bipolar Disorder
-   Other

------------------------------------------------------------------------

## Family Mental Health History

Checkbox:

-   Depression
-   Anxiety
-   Substance abuse
-   Suicide history
-   Psychiatric illness
-   None known

------------------------------------------------------------------------

## Psychosocial Background

Keep free text.

Add:

-   Voice recording
-   AI summary generation

------------------------------------------------------------------------

## Stressors

Use tags:

-   Work
-   Family
-   Financial
-   Relationship
-   Academic
-   Health
-   Trauma
-   Other

------------------------------------------------------------------------

# Tab 3: Mental Status Exam (MSE)

Convert most fields into structured clinical selections.

## Appearance

### Grooming

Options:

-   Well groomed
-   Poor hygiene
-   Disheveled
-   Appropriate

### Eye Contact

Options:

-   Good
-   Avoidant
-   Poor
-   Intense

### Behaviour

Multi-select:

-   Cooperative
-   Restless
-   Agitated
-   Withdrawn
-   Guarded

------------------------------------------------------------------------

# Speech

## Rate

-   Normal
-   Slow
-   Fast
-   Pressured

## Tone

-   Normal
-   Low
-   Flat
-   Loud

## Volume

-   Normal
-   Low
-   High

------------------------------------------------------------------------

# Mood & Affect

## Mood

Options:

-   Happy
-   Sad
-   Anxious
-   Angry
-   Irritable
-   Neutral

## Affect

Options:

-   Appropriate
-   Flat
-   Restricted
-   Blunted
-   Labile

------------------------------------------------------------------------

# Thought

## Thought Process

Options:

-   Logical
-   Linear
-   Circumstantial
-   Tangential
-   Disorganized

## Thought Content

Options:

-   Normal
-   Obsessions
-   Delusions
-   Paranoia
-   Hallucinations

------------------------------------------------------------------------

# Risk Thoughts

Dedicated section:

Suicidal ideation:

-   None
-   Passive thoughts
-   Active thoughts

Additional:

-   Plan
-   Intent
-   Severity

------------------------------------------------------------------------

# Cognition

## Orientation

Checkbox:

-   Person
-   Place
-   Time
-   Situation

## Memory

-   Intact
-   Mild impairment
-   Severe impairment

## Insight

-   Good
-   Fair
-   Poor

## Judgment

-   Good
-   Fair
-   Poor

------------------------------------------------------------------------

# Tab 4: Session Notes

Maintain:

-   BIRP
-   DAP formats

## Session Type

Options:

-   Individual therapy
-   Follow-up
-   Crisis
-   Assessment

------------------------------------------------------------------------

## Documentation Fields

Keep:

-   Behavior
-   Intervention
-   Response
-   Plan

Add inside each field:

-   AI Write button
-   Voice input
-   Generate summary

------------------------------------------------------------------------

# AI Clinical Psychology Copilot

Functions:

-   Convert voice into clinical note
-   Generate BIRP/DAP note
-   Summarize session
-   Improve documentation
-   Suggest templates

------------------------------------------------------------------------

# Tab 5: Psychometrics

## Assessment Library

Dropdown:

-   PHQ-9
-   GAD-7
-   BAI
-   BDI-II
-   PCL-5
-   OCD Scale
-   AUDIT
-   ADHD Scale
-   Custom Assessment

------------------------------------------------------------------------

## Scoring

Preferred workflow:

Questionnaire input → Automatic calculation → Severity result

Example:

Score: 14

Severity:

Moderate

------------------------------------------------------------------------

## Progress Tracking

Add:

-   Score history
-   Trend graphs
-   Improvement tracking

------------------------------------------------------------------------

# Tab 6: Care Plan

## Therapy Goals

Use goal cards:

Example:

Goal: Reduce anxiety

Progress: 25%

Status:

-   Active
-   Completed
-   Paused

------------------------------------------------------------------------

## Intervention Plan

Dropdown:

-   CBT
-   DBT
-   Exposure Therapy
-   Relaxation Training
-   Mindfulness
-   Psychoeducation

------------------------------------------------------------------------

## Homework Assignment

Templates:

-   Breathing exercise
-   Thought journal
-   Sleep diary
-   Exposure task
-   Custom

------------------------------------------------------------------------

## Follow-up Frequency

Dropdown:

-   Weekly
-   Biweekly
-   Monthly
-   Custom

------------------------------------------------------------------------

# Global AI Assistant Capsule

Add a small floating capsule throughout workspace:

✨ AI Assist 🎤 Voice

Available actions:

-   Write note
-   Summarize
-   Convert voice
-   Improve wording
-   Generate clinical documentation

------------------------------------------------------------------------

# Final Goal

MedBook AI Clinical Psychologist Workspace should become:

-   Faster for psychologists
-   Less typing
-   More clinically structured
-   AI-assisted
-   International EHR style
-   Easy for daily OPD workflow

The system should support conversation-first clinical practice, not
paperwork-first documentation.
