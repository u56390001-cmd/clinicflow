# MedBookAI Ambient Clinical Copilot Engine — Comprehensive Implementation Specification

**Document Version:** 1.0.0  
**Target System:** `medbook-ai` Electronic Health Record (EHR)  
**Audience:** AI Coding Agent (Cursor / Windsurf / Claude Dev) & Engineering Team  
**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript 5, Tailwind CSS, Supabase PostgreSQL (RLS), Groq Whisper-v3 API, Zod, Framer Motion.

---

## 1. Executive Summary & Architecture Overview

This specification details the technical blueprint for integrating an **Ambient Clinical AI Copilot** (Dragon Copilot style) into the `medbook-ai` EHR system. The Copilot operates as a **collapsible right sidebar drawer** on the Doctor's Active Consultation Page, capturing ambient doctor-patient dialogue during visits, transcribing speech in real-time via Groq Whisper-v3, parsing clinical facts into structured JSON, auto-populating the main prescribing form (`prescription-form.tsx`), and enabling voice/text commands for post-draft refinements.

### 1.1 3-Column Worksurface Layout
```
+------------------------------------+------------------------------------+------------------------------------+
| LEFT RAIL (20%)                    | CENTER MAIN CANVAS (55%)           | RIGHT COLLAPSIBLE DRAWER (25%)     |
| Patient Context & History Vault    | Active Consultation Form           | Ambient AI Copilot Workspace       |
+------------------------------------+------------------------------------+------------------------------------+
| • Basic Details (Age, Gender, UHID)| • Consultation Action Header       | 🔴 Ambient Mic Status & Timer      |
| • Critical Alerts (⚠️ ALLERGIES)   | • Chief Complaint (Textarea)       | • Live Speech Transcript Window    |
| • Past Illnesses & Conditions      | • Clinical Findings (Textarea)     | • Extracted Orders Preview Card    |
| • AI Patient Summary Banner        | • Diagnosis & ICD-10 Search Box    | • [Populate Prescription Form] Btn |
| • Uploaded Lab Scans & Documents   | • Medicines Structured Table Grid  | 💬 Natural Language Command Bar    |
| • Past Vitals & Encounter Log      | • Lab Orders Tag Input             | ⚠️ Drug-Allergy Safety Interlock   |
|                                    | • Follow-up & Doctor Notes         | 👍/👎 Feedback & Rollback Controls |
+------------------------------------+------------------------------------+------------------------------------+
```

---

## 2. Directory Structure & File Layout

All new components and API routes must be placed strictly within the existing project architecture:

```
app/
├── (dashboard)/
│   └── patients/
│       └── [id]/
│           └── consultation/
│               └── components/
│                   ├── CopilotDrawer.tsx                <-- Main Collapsible Drawer Parent
│                   ├── AmbientMicController.tsx         <-- Audio Recorder & Waveform
│                   ├── LiveTranscriptStream.tsx         <-- Real-time Diarized Transcript
│                   ├── ExtractedOrdersCard.tsx          <-- Extracted Orders & 1-Click Populate
│                   ├── NaturalLanguageCommandBar.tsx    <-- Voice/Text Command Bar
│                   └── DrugAllergySafetyBanner.tsx      <-- Safety Interlock Warning
├── api/
│   └── scribe/
│       ├── transcribe/
│       │   └── route.ts                                 <-- Groq Whisper-v3 Audio STT API
│       ├── structure/
│       │   └── route.ts                                 <-- LLM SOAP & JSON Structuring API
│       └── command/
│           └── route.ts                                 <-- Natural Language Form Edit API
lib/
├── copilot/
│   ├── types.ts                                         <-- Zod Schemas & TypeScript Types
│   ├── hooks/
│   │   ├── useAmbientRecorder.ts                       <-- Audio Web API & Streaming Hook
│   │   └── useCopilotHydration.ts                       <-- Prescription Form Auto-Fill Hook
│   └── prompts/
│       └── clinical-soap-prompt.ts                      <-- System Prompts & Grounding Rules
supabase/
└── migrations/
    └── 0041_ambient_copilot_tables.sql                  <-- Supabase Transcripts & Audit Logs
```

---

## 3. Database Schema & Supabase RLS Migrations

Create migration file `supabase/migrations/0041_ambient_copilot_tables.sql`:

```sql
-- Migration: 0041_ambient_copilot_tables.sql
-- Description: Creates tables for ambient audio transcripts, AI extraction audit logs, and copilot settings.

-- 1. ENCOUNTER TRANSCRIPTS TABLE
create table if not exists public.encounter_transcripts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  doctor_id uuid not null references public.profiles(id) on delete cascade,
  visit_id uuid not null references public.visits(id) on delete cascade,
  audio_duration_seconds integer default 0,
  raw_transcript text not null default '',
  diarized_transcript jsonb default '[]'::jsonb,
  processing_status text check (processing_status in ('recording', 'transcribing', 'structuring', 'completed', 'failed')) default 'recording',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint encounter_transcripts_clinic_visit_unique unique (clinic_id, visit_id)
);

-- 2. COPILOT AUDIT LOGS TABLE
create table if not exists public.copilot_audit_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  visit_id uuid not null references public.visits(id) on delete cascade,
  doctor_id uuid not null references public.profiles(id) on delete cascade,
  extracted_json jsonb not null,
  applied_changes jsonb,
  was_populated_to_form boolean default false,
  feedback_rating integer check (feedback_rating in (-1, 1)), -- -1 = Thumbs Down, 1 = Thumbs Up
  feedback_notes text,
  created_at timestamptz not null default now()
);

-- RLS POLICIES (Matching 0024_consultation_prescription.sql pattern)
alter table public.encounter_transcripts enable row level security;
alter table public.copilot_audit_logs enable row level security;

create policy "Clinic members can view transcripts"
  on public.encounter_transcripts for select
  using (public.is_clinic_member(clinic_id));

create policy "Clinic members can insert transcripts"
  on public.encounter_transcripts for insert
  with check (public.is_clinic_member(clinic_id));

create policy "Clinic members can update transcripts"
  on public.encounter_transcripts for update
  using (public.is_clinic_member(clinic_id));

create policy "Clinic members can view audit logs"
  on public.copilot_audit_logs for select
  using (public.is_clinic_member(clinic_id));

create policy "Clinic members can insert audit logs"
  on public.copilot_audit_logs for insert
  with check (public.is_clinic_member(clinic_id));

-- INDEXES FOR PERFORMANCE
create index if not exists idx_transcripts_clinic_visit on public.encounter_transcripts(clinic_id, visit_id);
create index if not exists idx_copilot_logs_clinic_visit on public.copilot_audit_logs(clinic_id, visit_id);
```

---

## 4. TypeScript Types & Zod Schemas (`lib/copilot/types.ts`)

```typescript
import { z } from 'zod';

export const MedicineItemSchema = z.object({
  name: z.string().describe("Brand or generic medicine name"),
  route: z.string().default("Oral").describe("Route e.g., Oral, Topical, IV"),
  form: z.enum(["Tablet", "Syrup", "Injection", "Inhaler", "Capsule", "Ointment", "Other"]).default("Tablet"),
  frequency: z.string().describe("e.g., 1-0-1 or Once daily"),
  duration: z.string().describe("e.g., 5"),
  unit: z.enum(["Days", "Weeks", "Months"]).default("Days"),
  instructions: z.string().describe("e.g., Take after meals")
});

export const LabOrderItemSchema = z.object({
  test_name: z.string().describe("Name of lab test e.g., CBC, Chest X-Ray, HbA1c"),
  notes: z.string().optional().describe("Special lab instructions")
});

export const CopilotExtractionSchema = z.object({
  chief_complaint: z.string().describe("Patient's primary stated symptoms and duration"),
  findings: z.string().describe("Objective physical examination findings observed by doctor"),
  diagnosis: z.string().describe("Primary working clinical diagnosis"),
  icd10_candidates: z.array(z.string()).describe("List of candidate ICD-10 codes"),
  medicines: z.array(MedicineItemSchema).describe("List of prescribed medications"),
  lab_orders: z.array(LabOrderItemSchema).describe("List of ordered lab/radiology tests"),
  follow_up_after: z.string().optional().describe("Follow up duration number e.g. '2'"),
  follow_up_unit: z.enum(["Days", "Weeks", "Months"]).optional().default("Weeks"),
  follow_up_notes: z.string().optional().describe("Follow-up advice or BP re-check notes"),
  doctor_notes: z.string().optional().describe("Lifestyle advice or special instructions"),
  denied_symptoms: z.array(z.string()).describe("Negative symptoms explicitly denied by patient"),
  safety_warnings: z.array(z.string()).describe("Potential drug-allergy or drug-interaction warnings")
});

export type CopilotExtraction = z.infer<typeof CopilotExtractionSchema>;
export type MedicineItem = z.infer<typeof MedicineItemSchema>;
export type LabOrderItem = z.infer<typeof LabOrderItemSchema>;
```

---

## 5. API Routes Specifications

### 5.1 Route 1: Groq Whisper-v3 Transcription (`app/api/scribe/transcribe/route.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('file') as File;

    if (!audioFile) {
      return NextResponse.json({ error: 'Audio file is required' }, { status: 400 });
    }

    // Call Groq Speech-to-Text API (whisper-large-v3)
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3',
      language: 'en', // Handles English + Roman Urdu / Code-switching
      response_format: 'verbose_json',
      temperature: 0.0,
    });

    return NextResponse.json({
      text: transcription.text,
      duration: transcription.duration,
      segments: transcription.segments || []
    });
  } catch (error: any) {
    console.error('Groq Transcription Error:', error);
    return NextResponse.json({ error: error.message || 'Transcription failed' }, { status: 500 });
  }
}
```

---

### 5.2 Route 2: Structured SOAP JSON Generator (`app/api/scribe/structure/route.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { CopilotExtractionSchema } from '@/lib/copilot/types';
import { CLINICAL_SYSTEM_PROMPT } from '@/lib/copilot/prompts/clinical-soap-prompt';

export async function POST(req: NextRequest) {
  try {
    const { transcript, patientProfile } = await req.json();

    if (!transcript) {
      return NextResponse.json({ error: 'Transcript is required' }, { status: 400 });
    }

    const payload = {
      model: 'gpt-4o', // Or claude-3-5-sonnet / gemini-1.5-flash
      response_format: { type: 'json_object' },
      temperature: 0.1,
      messages: [
        { role: 'system', content: CLINICAL_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `PATIENT CONTEXT:\nAllergies: ${patientProfile?.allergies || 'None'}\nCurrent Meds: ${patientProfile?.current_meds || 'None'}\n\nTRANSCRIPT:\n${transcript}`
        }
      ]
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    const rawContent = data.choices[0].message.content;
    const parsedJSON = JSON.parse(rawContent);

    // Validate output against Zod Schema
    const validatedData = CopilotExtractionSchema.parse(parsedJSON);

    return NextResponse.json({ data: validatedData });
  } catch (error: any) {
    console.error('SOAP Structuring Error:', error);
    return NextResponse.json({ error: error.message || 'Structuring failed' }, { status: 500 });
  }
}
```

---

### 5.3 Route 3: Natural Language Command Refinement (`app/api/scribe/command/route.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { CopilotExtractionSchema } from '@/lib/copilot/types';

export async function POST(req: NextRequest) {
  try {
    const { currentFormState, command } = await req.json();

    const prompt = `You are a clinical AI editor. Update the current prescription JSON state according to the doctor's natural language command.
Return ONLY the updated JSON object matching the schema.

CURRENT FORM STATE:
${JSON.stringify(currentFormState, null, 2)}

DOCTOR COMMAND:
"${command}"`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const updatedJSON = JSON.parse(data.choices[0].message.content);
    const validatedData = CopilotExtractionSchema.parse(updatedJSON);

    return NextResponse.json({ data: validatedData });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Command processing failed' }, { status: 500 });
  }
}
```

---

## 6. System Prompt Engineering (`lib/copilot/prompts/clinical-soap-prompt.ts`)

```typescript
export const CLINICAL_SYSTEM_PROMPT = `
You are an advanced Ambient Clinical AI Copilot integrated into the MedBookAI Electronic Health Record (EHR) system.
Your objective is to process an unstructured, multi-party doctor-patient encounter transcript and convert it into a structured JSON object adhering strictly to the provided schema.

CRITICAL CLINICAL RULES:
1. STRICT GROUNDING: Extract ONLY clinical facts explicitly stated or directly observed during the conversation. Never invent, extrapolate, or assume dosages, diagnoses, or lab tests not mentioned.
2. NEGATION DETECTION: Clearly distinguish between positive symptoms and negative/denied symptoms (e.g., "denies fever", "no shortness of breath"). Map denied symptoms explicitly to "denied_symptoms".
3. DRUG & ALLERGY INTERLOCK: Check extracted medicines against the patient's known allergies provided in context. If a conflict exists (e.g. Patient allergic to Milk/Penicillin and drug contains lactose or penicillin derivative), add a clear warning to "safety_warnings".
4. STRUCTURED MEDICINE PARSING: Break down prescriptions into discrete fields: Name, Route (default "Oral"), Form ("Tablet" | "Syrup" | "Injection" | "Inhaler" | "Capsule" | "Ointment"), Frequency (e.g., "1-0-1"), Duration, Unit ("Days" | "Weeks"), and Instructions.
5. THEMATIC CONSOLIDATION: Consolidate non-linear conversation points scattered across the transcript into coherent fields. Ignore non-clinical small talk.

REQUIRED JSON OUTPUT SCHEMA:
{
  "chief_complaint": "string",
  "findings": "string",
  "diagnosis": "string",
  "icd10_candidates": ["string"],
  "medicines": [
    {
      "name": "string",
      "route": "string",
      "form": "Tablet|Syrup|Injection|Inhaler|Capsule|Ointment|Other",
      "frequency": "string",
      "duration": "string",
      "unit": "Days|Weeks|Months",
      "instructions": "string"
    }
  ],
  "lab_orders": [
    { "test_name": "string", "notes": "string" }
  ],
  "follow_up_after": "string",
  "follow_up_unit": "Days|Weeks|Months",
  "follow_up_notes": "string",
  "doctor_notes": "string",
  "denied_symptoms": ["string"],
  "safety_warnings": ["string"]
}
`;
```

---

## 7. Collapsible Right Sidebar Component (`CopilotDrawer.tsx`)

```tsx
'use client';

import React, { useState } from 'react';
import { Mic, Square, Sparkles, ChevronRight, ChevronLeft, RefreshCw, AlertTriangle, Send } from 'lucide-react';
import { useAmbientRecorder } from '@/lib/copilot/hooks/useAmbientRecorder';
import { CopilotExtraction } from '@/lib/copilot/types';

interface CopilotDrawerProps {
  patientProfile: { allergies?: string; current_meds?: string };
  onPopulateForm: (data: CopilotExtraction) => void;
}

export const CopilotDrawer: React.FC<CopilotDrawerProps> = ({ patientProfile, onPopulateForm }) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [commandInput, setCommandInput] = useState<string>('');
  const [isProcessingCommand, setIsProcessingCommand] = useState<boolean>(false);

  const {
    isRecording,
    recordingTime,
    transcript,
    extractedData,
    isProcessing,
    startRecording,
    stopRecording,
    setExtractedData
  } = useAmbientRecorder({ patientProfile });

  const handleCommandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim() || !extractedData) return;

    setIsProcessingCommand(true);
    try {
      const res = await fetch('/api/scribe/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentFormState: extractedData, command: commandInput })
      });
      const result = await res.json();
      if (result.data) {
        setExtractedData(result.data);
        setCommandInput('');
      }
    } catch (err) {
      console.error('Command failed:', err);
    } finally {
      setIsProcessingCommand(false);
    }
  };

  return (
    <div className={`relative transition-all duration-300 ease-in-out border-l border-slate-800 bg-slate-900 text-slate-100 ${isOpen ? 'w-80 lg:w-96' : 'w-12'}`}>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="absolute -left-3 top-6 bg-teal-600 text-white rounded-full p-1 shadow-lg hover:bg-teal-500 transition"
        title={isOpen ? 'Collapse Copilot' : 'Expand Copilot'}
      >
        {isOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      {!isOpen ? (
        <div className="flex flex-col items-center pt-12 space-y-6">
          <Sparkles className="text-teal-400 animate-pulse" size={20} />
          <span className="rotate-90 text-xs font-semibold tracking-wider text-slate-400 uppercase whitespace-nowrap">AI Copilot</span>
        </div>
      ) : (
        <div className="flex flex-col h-full p-4 space-y-4 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <Sparkles className="text-teal-400" size={20} />
              <h3 className="font-semibold text-sm text-slate-100">Ambient AI Copilot</h3>
            </div>
            <span className="text-xs bg-teal-950 text-teal-400 border border-teal-800 px-2 py-0.5 rounded-full font-medium">Ready</span>
          </div>

          {/* Ambient Mic Widget */}
          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {isRecording ? (
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                ) : (
                  <div className="h-3 w-3 rounded-full bg-slate-500" />
                )}
                <span className="text-xs font-medium text-slate-300">
                  {isRecording ? 'Listening...' : 'Mic Ready'}
                </span>
              </div>
              <span className="text-xs font-mono text-slate-400">{recordingTime}</span>
            </div>

            {!isRecording ? (
              <button
                onClick={startRecording}
                className="w-full py-2 px-3 bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs rounded-lg flex items-center justify-center space-x-2 transition"
              >
                <Mic size={14} />
                <span>Start Consultation Capture</span>
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="w-full py-2 px-3 bg-red-600 hover:bg-red-500 text-white font-medium text-xs rounded-lg flex items-center justify-center space-x-2 transition"
              >
                <Square size={14} />
                <span>End & Process Note</span>
              </button>
            )}
          </div>

          {/* Safety Warning Interlock */}
          {extractedData?.safety_warnings && extractedData.safety_warnings.length > 0 && (
            <div className="p-3 bg-amber-950/50 border border-amber-800 rounded-xl space-y-1">
              <div className="flex items-center space-x-1.5 text-amber-400 text-xs font-semibold">
                <AlertTriangle size={14} />
                <span>Drug-Allergy Warning</span>
              </div>
              <ul className="text-xs text-amber-200 list-disc list-inside">
                {extractedData.safety_warnings.map((warn, i) => (
                  <li key={i}>{warn}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Live Transcript Window */}
          <div className="flex-1 min-h-[140px] bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 overflow-y-auto">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Live Transcript</span>
            <p className="text-xs text-slate-300 leading-relaxed italic">
              {transcript || (isRecording ? 'Listening to doctor-patient discussion...' : 'No active recording. Click start above.')}
            </p>
          </div>

          {/* Extracted Orders & Auto-Fill Action */}
          {extractedData && (
            <div className="p-3 bg-teal-950/40 border border-teal-800/60 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-teal-300">Extracted Prescription Draft</span>
                <span className="text-[10px] text-teal-400 font-mono">{extractedData.medicines?.length || 0} Meds</span>
              </div>

              <div className="text-xs space-y-1 text-slate-300">
                <p><strong>Chief Complaint:</strong> {extractedData.chief_complaint || 'N/A'}</p>
                <p><strong>Diagnosis:</strong> {extractedData.diagnosis || 'N/A'}</p>
              </div>

              <button
                onClick={() => onPopulateForm(extractedData)}
                className="w-full py-2 px-3 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs rounded-lg transition shadow-md"
              >
                Populate Prescription Form
              </button>
            </div>
          )}

          {/* Natural Language Voice/Text Command Bar */}
          <form onSubmit={handleCommandSubmit} className="relative">
            <input
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              placeholder="Command Copilot (e.g., 'Change dosage to 7 days')..."
              className="w-full pl-3 pr-8 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-teal-500"
              disabled={isProcessingCommand}
            />
            <button
              type="submit"
              disabled={isProcessingCommand || !commandInput.trim()}
              className="absolute right-2 top-2 text-teal-400 hover:text-teal-300 disabled:opacity-40"
            >
              {isProcessingCommand ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </form>

          {/* Disclaimer */}
          <p className="text-[10px] text-slate-500 text-center leading-tight">
            AI Draft requires clinician review before saving.
          </p>
        </div>
      )}
    </div>
  );
};
```

---

## 8. Prescribing Form State Hydration Hook (`lib/copilot/hooks/useCopilotHydration.ts`)

Integrate into `app/(dashboard)/patients/[id]/consultation/components/prescription-form.tsx`:

```typescript
import { useCallback } from 'react';
import { CopilotExtraction } from '@/lib/copilot/types';

export function useCopilotHydration(formMethods: any) {
  const populateForm = useCallback((extracted: CopilotExtraction) => {
    if (!extracted) return;

    // 1. Chief Complaint
    if (extracted.chief_complaint) {
      formMethods.setValue('chiefComplaint', extracted.chief_complaint, { shouldDirty: true });
    }

    // 2. Clinical Findings / Examination
    if (extracted.findings) {
      formMethods.setValue('findings', extracted.findings, { shouldDirty: true });
    }

    // 3. Diagnosis
    if (extracted.diagnosis) {
      formMethods.setValue('diagnosis', extracted.diagnosis, { shouldDirty: true });
    }

    // 4. Medicines Structured Array Grid
    if (extracted.medicines && extracted.medicines.length > 0) {
      const formattedMeds = extracted.medicines.map((m) => ({
        medicine_name: m.name,
        route_form: m.form || 'Tablet',
        frequency: m.frequency,
        duration: m.duration,
        duration_unit: m.unit || 'Days',
        instructions: m.instructions
      }));
      formMethods.setValue('medicines', formattedMeds, { shouldDirty: true });
    }

    // 5. Lab Orders Array
    if (extracted.lab_orders && extracted.lab_orders.length > 0) {
      const formattedLabs = extracted.lab_orders.map((l) => ({
        test_name: l.test_name,
        notes: l.notes || ''
      }));
      formMethods.setValue('lab_orders', formattedLabs, { shouldDirty: true });
    }

    // 6. Follow-up
    if (extracted.follow_up_after) {
      formMethods.setValue('followUpAfter', extracted.follow_up_after, { shouldDirty: true });
      formMethods.setValue('followUpUnit', extracted.follow_up_unit || 'Weeks', { shouldDirty: true });
    }
    if (extracted.follow_up_notes) {
      formMethods.setValue('followUpNotes', extracted.follow_up_notes, { shouldDirty: true });
    }

    // 7. Doctor Notes
    if (extracted.doctor_notes) {
      formMethods.setValue('doctorNotes', extracted.doctor_notes, { shouldDirty: true });
    }
  }, [formMethods]);

  return { populateForm };
}
```

---

## 9. Implementation Checklist for AI Coding Agent

Follow these exact steps in sequence to implement the Copilot engine:

1. **Environment Setup**:
   - Add `GROQ_API_KEY` and `OPENAI_API_KEY` to `.env.local`.
   - Install dependencies: `npm install groq-sdk zod lucide-react framer-motion`.

2. **Database Migration**:
   - Apply `supabase/migrations/0041_ambient_copilot_tables.sql` using Supabase CLI (`npx supabase db push` or SQL Editor).

3. **Backend API Endpoints**:
   - Create `/api/scribe/transcribe/route.ts`
   - Create `/api/scribe/structure/route.ts`
   - Create `/api/scribe/command/route.ts`

4. **Frontend Components & Hooks**:
   - Create `lib/copilot/types.ts`
   - Create `lib/copilot/prompts/clinical-soap-prompt.ts`
   - Create `lib/copilot/hooks/useAmbientRecorder.ts`
   - Create `lib/copilot/hooks/useCopilotHydration.ts`
   - Create `CopilotDrawer.tsx` component.

5. **EHR View Integration**:
   - Import `CopilotDrawer` into consultation page component.
   - Attach `useCopilotHydration` to `prescription-form.tsx`.
   - Pass `populateForm` to `CopilotDrawer`.

6. **Verification & Testing**:
   - Test audio capture from Web Browser mic.
   - Verify Groq Whisper STT output in live transcript window.
   - Click "Populate Prescription Form" and verify that textareas, diagnosis dropdown, medicines grid, and lab orders populate instantly.
   - Verify Supabase audit logging.
