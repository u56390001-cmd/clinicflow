# MedBook AI Psychology OPD Workflow & Patient Communication Improvement Prompt

## Context

MedBook AI already has WhatsApp integration for appointment reminders,
confirmations, receptionist communication and billing messages.

Extend the existing WhatsApp integration for Psychology OPD workflow. Do
not create a separate communication system.

## Goal

Create a digital Psychology OPD workflow where: - Receptionist manages
registration and appointments. - Patient receives links through
WhatsApp. - Patient completes questionnaires from mobile. - Submitted
answers automatically save in patient record. - Psychologist reviews AI
summaries before consultation.

## WhatsApp Psychology Features

Add WhatsApp actions:

### Send Pre-Visit Questionnaire

Patient receives a link before appointment and completes basic
questions.

### Send Psychometric Assessment Link

Support: - PHQ-9 - GAD-7 - BDI - PTSD Scale - Custom assessments

### Send Document Upload Link

Patient can upload: - Previous therapy reports - Psychiatric reports -
Prescriptions - Assessment documents

Uploaded files attach automatically to patient profile.

## Online Patient Flow

Appointment booked: ↓ WhatsApp message sent ↓ Pre-visit questions ↓
Document upload ↓ Psychometric assessment ↓ AI summary generation ↓
Psychologist review

## Walk-in Patient Flow

Receptionist: 1. Creates patient profile 2. Uploads old documents 3.
Sends assessment link through WhatsApp

Patient completes forms on mobile while waiting.

Results automatically appear in system.

## Data Integration

Patient answers should appear in:

### Overview & Safety

Show: - AI pre-visit summary - Main concern - Latest assessment scores -
Risk indicators - Uploaded documents

### Documents Tab

Create separate tab: - Patient uploaded documents - Receptionist
uploaded documents - Previous reports - Prescriptions - AI extracted
information

### Intake & History

Populate from: - Pre questions - Patient answers - Uploaded documents

Psychologist can edit and add clinical notes.

### Psychometrics

Show: - Assessment name - Score - Severity - Date - Completed by: -
Patient Online - Reception Desk - Psychologist

## Assessment Form Requirements

Forms should have: - Mobile friendly UI - Simple questions - Progress
indicator - Save and submit - Automatic scoring - Automatic result
generation

## AI Clinical Assistant

Inside clinical writing areas add: - AI Write - Voice to Note -
Summarize - Improve wording

AI assists documentation but psychologist approves before saving.

## Developer Rules

Do not rebuild existing clinic management system.

Extend: - Existing WhatsApp integration - Existing patient records -
Existing appointment system - Existing billing system

## Final Workflow

Appointment ↓ WhatsApp Reminder ↓ Pre-Visit Questionnaire ↓ Document
Upload ↓ Psychometric Assessment ↓ AI Summary ↓ Psychologist Review ↓
Mental Status Exam ↓ Session Notes ↓ Care Plan ↓ Follow-up Reminder

## Final Goal

MedBook AI Psychology OPD should provide: - Less paperwork - Less
typing - Faster assessment - Better psychologist preparation - WhatsApp
based patient engagement - AI assisted clinical documentation
