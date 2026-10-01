# Ambient Clinical Copilot Implementation Guide

## Overview

The Ambient Clinical Copilot is a Dragon-Copilot-style AI assistant integrated into the MedBookAI consultation workflow. It captures doctor-patient conversations in real-time, transcribes speech via Groq Whisper-v3, structures clinical facts into SOAP format, and auto-populates the prescription form.

## Architecture

### 3-Column Layout

```
+------------------+------------------+------------------+
| Left Sidebar     | Center Canvas    | Right Drawer     |
| (20% - 300px)    | (55% - flexible) | (25% - 320-384px)|
+------------------+------------------+------------------+
| Patient Details  | Prescription     | AI Copilot       |
| Vitals Form      | Form             | Workspace        |
| Pre-Consult Q&A  | Template Mgr     | - Mic Control    |
| Past Encounters  |                  | - Live Transcript|
|                  |                  | - Extract Preview|
|                  |                  | - Command Bar    |
+------------------+------------------+------------------+
```

## Setup Instructions

### 1. Environment Variables

Add the following to your `.env.local`:

```bash
# Required for audio transcription (Groq Whisper-v3)
GROQ_API_KEY=your_groq_api_key_here

# Required for SOAP structuring and command processing (OpenAI GPT-4o)
OPENAI_API_KEY=your_openai_api_key_here
```

**Getting API Keys:**
- **Groq API**: Sign up at [console.groq.com](https://console.groq.com)
- **OpenAI API**: Sign up at [platform.openai.com](https://platform.openai.com)

### 2. Database Migration

Apply the Supabase migration to create the required tables:

```bash
npx supabase db push
```

Or manually run the SQL from:
```
supabase/migrations/0041_ambient_copilot_tables.sql
```

This creates:
- `encounter_transcripts` - stores raw and processed audio transcripts
- `copilot_audit_logs` - tracks AI extractions and doctor feedback

### 3. Install Dependencies

All required dependencies are already in `package.json`. No additional installs needed.

## Usage Workflow

### Doctor Perspective

1. **Start Consultation**
   - Open consultation page with active patient visit
   - Copilot drawer appears on the right (collapsible)

2. **Capture Conversation**
   - Click "Start Consultation Capture" 
   - Browser requests microphone permission (one-time)
   - Speak naturally with patient while the copilot listens
   - Live transcript appears in real-time

3. **End & Process**
   - Click "End & Process Note" when conversation is complete
   - Audio is transcribed via Groq Whisper-v3 (~2-5 seconds)
   - Transcript is structured into SOAP JSON via GPT-4o (~3-6 seconds)
   - Extracted draft appears in preview card

4. **Review & Populate**
   - Review extracted orders in preview card
   - Check for drug-allergy warnings (red banner if conflicts detected)
   - Click "Populate Prescription Form"
   - Form fields auto-fill with amber rings indicating AI-written content

5. **Refine with Voice/Text Commands** (Optional)
   - Type natural language commands like:
     - "Change dosage to 7 days"
     - "Add CBC lab order"
     - "Remove last medicine"
   - AI updates the form in real-time

6. **Confirm & Save**
   - Edit any AI-filled fields (amber rings clear on edit)
   - Click "Save Prescription" to commit
   - All AI marks clear upon successful save

## API Routes

### `/api/scribe/transcribe`
- **Method**: POST
- **Input**: FormData with audio file (webm/opus)
- **Output**: `{ text: string, duration: number, segments: [] }`
- **Provider**: Groq Whisper-large-v3

### `/api/scribe/structure`
- **Method**: POST
- **Input**: `{ transcript: string, patientProfile: { allergies?, current_meds? } }`
- **Output**: `{ data: CopilotExtraction }`
- **Provider**: OpenAI GPT-4o (JSON mode)

### `/api/scribe/command`
- **Method**: POST
- **Input**: `{ currentFormState: CopilotExtraction, command: string }`
- **Output**: `{ data: CopilotExtraction }`
- **Provider**: OpenAI GPT-4o (JSON mode)

## Components

### `CopilotDrawer`
**Location**: `components/consultation/copilot-drawer.tsx`

Collapsible right sidebar with:
- Ambient mic controller (start/stop)
- Live transcript stream window
- Extracted orders preview card
- Drug-allergy safety interlock banner
- Natural language command bar

### `PrescriptionForm` (Enhanced)
**Location**: `components/consultation/prescription-form.tsx`

Now accepts `ref` with `populateFromCopilot(data)` method:
- Maps `CopilotExtraction` → `PrescriptionDraft`
- Marks populated fields for amber ring UI
- Integrates with existing draft context system

### `ConsultationView` (Enhanced)
**Location**: `components/consultation/consultation-view.tsx`

Modified layout:
- Changed from `grid-cols-[300px_1fr]` to `flex` layout
- Added `CopilotDrawer` as third column
- Wires copilot → form via ref

## Type System

### `CopilotExtraction` (Zod Schema)
```typescript
{
  chief_complaint: string;
  findings: string;
  diagnosis: string;
  icd10_candidates: string[];
  medicines: MedicineItem[];
  lab_orders: LabOrderItem[];
  follow_up_after?: string;
  follow_up_unit?: "Days" | "Weeks" | "Months";
  follow_up_notes?: string;
  doctor_notes?: string;
  denied_symptoms: string[];
  safety_warnings: string[];
}
```

### `MedicineItem`
```typescript
{
  name: string;
  route: string;  // default "Oral"
  form: "Tablet" | "Syrup" | "Injection" | ...;
  frequency: string;  // e.g., "1-0-1"
  duration: string;   // e.g., "5"
  unit: "Days" | "Weeks" | "Months";
  instructions: string;
}
```

## Safety Features

### Drug-Allergy Interlock
- System prompt checks extracted medicines against patient allergies
- Conflicts appear in `safety_warnings[]`
- Red banner displays in copilot drawer
- Doctor must acknowledge before populating form

### Amber Ring UI
- AI-populated fields show `ring-2 ring-status-warning/60`
- Small "AI" chip appears next to field labels
- Rings clear when doctor edits the field
- All rings clear on successful save (doctor confirmation)

### Grounding Rules (System Prompt)
1. **STRICT GROUNDING**: Only extract explicitly stated facts
2. **NEGATION DETECTION**: Distinguish positive vs denied symptoms
3. **DRUG & ALLERGY CHECK**: Cross-reference patient allergies
4. **STRUCTURED PARSING**: Break prescriptions into discrete fields
5. **THEMATIC CONSOLIDATION**: Merge scattered conversation points

## Browser Compatibility

### Audio Recording (Web Audio API)
- ✅ Chrome 49+
- ✅ Edge 79+
- ✅ Firefox 25+
- ✅ Safari 14.1+
- ❌ IE11 (not supported)

### Media Recording Format
- Uses `audio/webm;codecs=opus` (widely supported)
- Fallback to `audio/webm` if opus not available

## Performance Considerations

### Latency Breakdown
1. **Audio capture**: Real-time (0ms added)
2. **Groq transcription**: 2-5 seconds for 3-minute audio
3. **SOAP structuring**: 3-6 seconds (depends on transcript length)
4. **Total end-to-end**: ~5-11 seconds from "End" click to populated form

### Cost Estimates (per consultation)
- **Groq Whisper**: ~$0.005 per 5-minute audio
- **OpenAI GPT-4o**: ~$0.02-0.05 per SOAP extraction
- **Total per consultation**: ~$0.025-0.055

## Design System

The copilot UI follows the frontend-design skill principles:

### Color Palette
- **Primary accent**: Teal-500 to Teal-700 (distinctive, not cliché)
- **Safety warnings**: Amber-50 to Amber-900 (high contrast)
- **Background**: Gradient from slate-50 to white (subtle depth)
- **Borders**: Slate-200 (soft separation)

### Typography
- **Labels**: 10px uppercase tracking-widest (LIVE TRANSCRIPT)
- **Body**: 12px-13px (compact clinical UI)
- **Status badges**: 10px uppercase (LISTENING, READY)

### Layout Choices
- **No rounded cards everywhere**: Uses varied border-radius
- **No default gradients as decoration**: Gradient serves depth
- **No ALL-CAPS eyebrows**: Only for data labels
- **Intentional spacing**: gap-* utilities, no space-y-*

## Troubleshooting

### "Microphone access denied"
- Browser blocked mic permission
- Check browser settings → Site permissions → Microphone
- Ensure HTTPS in production (required for getUserMedia)

### "GROQ_API_KEY not configured"
- Missing environment variable
- Add to `.env.local` and restart dev server

### "No speech detected in recording"
- Audio too short or silent
- Check microphone input levels
- Test with longer recording

### Prescription form not populating
- Check browser console for errors
- Verify `ref` is properly forwarded
- Ensure `populateFromCopilot` method exists

### Amber rings not appearing
- Draft context may not be active
- Check if `bridge?.markApplied()` is called
- Verify `marked` Set contains field keys

## Future Enhancements

Potential additions (not yet implemented):

1. **Speaker diarization**: Distinguish doctor vs patient voice
2. **Multi-language support**: Hindi, Urdu, regional languages
3. **Offline mode**: Local Whisper model for no-internet clinics
4. **Voice commands during recording**: Interrupt-free "Add Paracetamol"
5. **Feedback loop**: Thumbs up/down to improve extractions
6. **Template suggestions**: "This sounds like viral fever — load template?"

## Technical Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Chrome/Edge/Firefox/Safari)                       │
├─────────────────────────────────────────────────────────────┤
│  CopilotDrawer Component                                    │
│  ├─ useAmbientRecorder hook                                 │
│  │  ├─ MediaRecorder API (audio/webm)                       │
│  │  └─ Real-time transcript state                           │
│  └─ Command bar for post-extraction edits                   │
└────────────┬────────────────────────────────────────────────┘
             │
             ├─ POST /api/scribe/transcribe (FormData)
             │  └─ Groq Whisper-v3 API
             │     └─ Returns: { text, duration, segments }
             │
             ├─ POST /api/scribe/structure (JSON)
             │  └─ OpenAI GPT-4o (JSON mode)
             │     ├─ System: CLINICAL_SYSTEM_PROMPT
             │     ├─ Context: Patient allergies/meds
             │     └─ Returns: CopilotExtraction (Zod validated)
             │
             └─ POST /api/scribe/command (JSON)
                └─ OpenAI GPT-4o (JSON mode)
                   └─ Updates existing extraction via NLP
┌─────────────────────────────────────────────────────────────┐
│  PrescriptionForm (forwardRef)                              │
│  ├─ populateFromCopilot(extraction)                         │
│  │  ├─ Maps to PrescriptionDraft                            │
│  │  ├─ Calls patch(updates)                                 │
│  │  └─ Marks fields with bridge.markApplied()              │
│  └─ Amber ring UI for AI-filled fields                     │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Supabase PostgreSQL (RLS enabled)                          │
│  ├─ encounter_transcripts (audio_duration, raw_transcript)  │
│  └─ copilot_audit_logs (extracted_json, feedback)          │
└─────────────────────────────────────────────────────────────┘
```

## License

This implementation follows the MedBookAI project license terms.

---

**Questions or Issues?**
- Check browser console for detailed error messages
- Verify all environment variables are set
- Ensure Supabase migration was applied successfully
- Test microphone access in browser settings
