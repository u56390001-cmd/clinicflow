# MedBook AI --- Specialized Clinical Workspaces Implementation Prompt

## Role

Act as a Principal Healthcare SaaS Architect and Senior Next.js
Engineer.

Implement specialty-based clinical workspaces inside the existing
MedBook AI clinic management system.

Use existing:

-   Patient Workspace
-   Consultation Engine
-   Appointment Engine
-   RBAC
-   Doctor Specialty System
-   AI Copilot
-   Design System

Do not create separate applications.

------------------------------------------------------------------------

# Core Objective

Create automatic specialty-based doctor workspace routing.

The system should automatically open the correct clinical workspace
based on the doctor's specialty.

Flow:

Doctor Specialty → Workspace Template → Clinical Consultation UI

Do not add manual workspace selection for admins.

------------------------------------------------------------------------

# IMPORTANT: Preserve Existing Doctor Workspace Layout

The existing consultation shell must remain unchanged.

Do NOT redesign the whole doctor workspace.

Keep this structure:

## 1. Fixed Top Patient Header

Keep:

-   Patient name
-   Age / Gender
-   Token information
-   Appointment details
-   Consultation actions

------------------------------------------------------------------------

## 2. Left Side Patient Context / Queue Panel

Keep existing left panel.

It should continue showing:

-   Waiting queue
-   Patient context
-   Previous visits
-   Basic patient history
-   Existing patient information

Do not move or remove this section.

------------------------------------------------------------------------

## 3. Center Clinical Workspace Area

ONLY this area changes according to doctor specialty.

Specialty-specific tabs and workflows should load here.

Example:

General Physician:

Overview History Vitals Prescription Labs Documents

Clinical Psychologist:

Overview & Safety Intake History Mental Status Examination Session Notes
Psychometrics Care Plan

Dermatologist:

Skin Overview Examination Photos & Body Mapping Procedures Treatment
Plan Documents

------------------------------------------------------------------------

## 4. Right Side AI Copilot Panel

Keep existing AI Copilot component.

Do NOT create separate AI assistants.

The same AI Copilot should change context based on specialty.

Example:

### General Physician AI Copilot

-   Clinical summary
-   Prescription assistance
-   Drug interaction support
-   Lab suggestions
-   SOAP note assistance

### Clinical Psychologist AI Copilot

-   Session summary
-   BIRP/DAP note drafting
-   Risk summary
-   Therapy plan assistance

### Dermatologist AI Copilot

-   Skin examination summary
-   Clinical note assistance
-   Treatment summary
-   Patient instruction generation

------------------------------------------------------------------------

## 5. Bottom Consultation Actions

Keep existing action bar.

Maintain:

-   Save Draft
-   Print Preview
-   Complete Consultation

Do not remove existing consultation workflow.

------------------------------------------------------------------------

# Workspace Routing Logic

Doctor profile already contains:

-   Name
-   Role
-   Specialty
-   Services
-   Availability

Use specialty as the workspace trigger.

Example:

General Physician → General Medical Workspace

Clinical Psychologist → Psychology Workspace

Dermatology → Dermatology Workspace

No additional workspace field should be required.

------------------------------------------------------------------------

# Clinical Psychologist Workspace

## Purpose

Create a psychotherapy-focused consultation workspace.

Do not use the general prescription workflow.

Focus on:

-   Therapy sessions
-   Mental health assessment
-   Psychological documentation
-   Progress tracking

## Tabs

### Overview & Safety

Include:

-   Mental health summary
-   Current concerns
-   Risk level badge: Low / Moderate / High / Crisis
-   Emergency contact
-   AI mental health summary

### Intake & Psychological History

Include:

-   Previous mental health history
-   Previous therapy records
-   Family psychiatric history
-   Psychosocial background
-   Current stressors
-   Substance use history

### Mental Status Examination (MSE)

Structured assessment:

Appearance & Behaviour

-   Grooming
-   Eye contact
-   Behaviour

Speech

-   Rate
-   Tone
-   Volume

Mood & Affect

-   Patient reported mood
-   Observed affect

Thought

-   Thought process
-   Thought content
-   Risk assessment

Cognition

-   Orientation
-   Memory
-   Insight
-   Judgment

### Therapy Session Notes

Support:

BIRP format:

-   Behavior
-   Intervention
-   Response
-   Plan

DAP format:

-   Data
-   Assessment
-   Plan

Support:

-   Save draft
-   Complete session
-   Follow-up

### Psychometrics

Support:

-   PHQ-9
-   GAD-7
-   Psychological assessments

Display:

-   Scores
-   History
-   Progress trends

### Care Plan

Include:

-   Therapy goals
-   Intervention plan
-   Homework assignments
-   Follow-up schedule
-   Psychiatrist referral option

------------------------------------------------------------------------

# Dermatology Workspace

## Purpose

Create a visual skin-specialist workflow.

Focus on:

-   Skin examination
-   Images
-   Lesion tracking
-   Procedures
-   Treatment plans

## Tabs

### Skin Overview

Include:

-   Skin profile
-   Allergies
-   Previous skin conditions
-   Chronic conditions
-   Biopsy alerts

### Skin Examination

Structured fields:

Chief complaint:

-   Rash
-   Itching
-   Pain
-   Lesion

Morphology:

-   Macule
-   Papule
-   Plaque
-   Vesicle
-   Nodule

Distribution:

-   Localized
-   Generalized
-   Dermatomal

Diagnosis:

-   Clinical diagnosis
-   ICD support

### Photo & Body Mapping

Include:

-   Skin image upload
-   Lesion location tagging
-   Before/after comparison
-   Previous visit comparison

### Procedures

Support:

-   Biopsy
-   Cryotherapy
-   Chemical peel
-   Laser procedures
-   Minor procedures

Fields:

-   Procedure type
-   Date
-   Notes
-   Consent

### Dermatology Treatment Plan

Support:

Topical medications:

-   Cream
-   Ointment
-   Gel
-   Lotion

Include:

-   Application instructions
-   Skincare routine
-   AM/PM routine
-   Patient education

------------------------------------------------------------------------

# Architecture Rules

Important separation:

Role controls permissions.

Specialty controls workspace.

Service controls booking and performer.

Appointment controls assigned doctor.

Do not duplicate responsibilities.

------------------------------------------------------------------------

# Testing Requirements

Verify:

1.  General Physician opens existing workspace.
2.  Clinical Psychologist opens psychology workspace.
3.  Dermatologist opens dermatology workspace.
4.  Patient queue remains unchanged.
5.  Patient history remains available.
6.  Appointment workflow remains unchanged.
7.  Existing prescription workflow is not broken.
8.  RBAC permissions remain secure.

------------------------------------------------------------------------

# Final Goal

Transform MedBook AI into a modular specialty-based healthcare SaaS.

One clinic.

Multiple doctors.

Multiple specialties.

Same patient system.

Automatic intelligent clinical workspace routing.
