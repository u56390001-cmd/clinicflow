# Master Prompt: MedBook AI Doctor-Patient Workspace & Embedded Prescription Encounter Workflow

> **Role & Instructions for AI System Developer / Generator:**
>
> You are acting as a Senior Software Architect and Principal Full-Stack Engineer specializing in **Next.js 15 (App Router)**, **React 19**, **Supabase RLS (PostgreSQL)**, **Tailwind CSS**, and **Healthcare EHR Systems**.
>
> Your task is to implement the updated **Doctor-Patient Workspace**, **7 Sub-Tabs Navigation Layout**, **Embedded Prescription Sub-Tab**, **UHID QR Code Identity System**, and **Standalone Ambient AI Copilot Modal** for **MedBook AI** strictly following the codebase specifications outlined in `EHR_SYSTEM_SPECS.md`.

## 1. Executive Summary & Architecture Goals

This implementation resolves two critical real-world clinical workflow problems:

1. **Patient Identity Mismatch on Phone Number Change:** Returning patients using a new phone number are often misidentified as new patients, fragmenting history. Solution: Print a scannable **UHID + QR Code** on every prescription slip and provide a **Smart Multi-Field Search & Profile Merge Tool** for receptionists and doctors.

2. **Clunky Encounter UI & Disjointed Copilot:** Full-screen popups interrupt clinical flow. Solution: Convert the patient record workspace into a **7 Sub-Tab layout** where the `Prescription` sub-tab is embedded directly into the workspace. The **Ambient Voice AI Copilot** operates as a standalone, non-intrusive floating modal/popup overlay that streams live transcripts, extracts clinical structured fields, and syncs directly into the active prescription form.

## 2. Technical Stack & File Context

* **Framework:** Next.js 15.5+ (App Router), React 19, TypeScript (`strict: true`)

* **Styling & UI Tokens:** Tailwind CSS 3.4+, Radix UI Primitives, Lucide Icons, Sonner Toasts

* **Database:** Supabase Postgres with RLS, TypeScript types mapped in `types/database.ts`

* **Validation:** Zod schemas (`lib/validation/schemas.ts`)

* **Packages:** `qrcode` for QR rendering, `@google/genai` for Gemini provider

* **Core Files to Modify / Create:**

  * `components/patients/patient-record.tsx` (7 Sub-tabs integration)

  * `components/patients/patients-workspace.tsx` (Main EMR container)

  * `components/consultation/embedded-prescription-tab.tsx` (NEW: Embedded prescription form)

  * `components/consultation/prescription-preview.tsx` (QR code header integration)

  * `components/copilot/ambient-copilot-modal.tsx` (NEW: Floating Ambient Copilot popup)

  * `lib/actions/patients.ts` (Profile search & merge server action)

  * `lib/actions/consultation.ts` (Prescription upsert server action)

## 3. Comprehensive Specifications & Requirements

### Module A: Patient Identity & Printed QR Code (Resolving Mobile Number Changes)

#### 1. QR Code Generation on Printed Prescription (`prescription-preview.tsx`)

* Utilize the installed `qrcode` package to convert the patient's unique metadata into a high-density, scannable matrix.

* Payload encoded in QR Code:

  ```
  {
    "patient_code": "CLI-2026-00014",
    "patient_id": "uuid-v4-string",
    "clinic_id": "uuid-v4-string"
  }
  
  ```

* Position the QR Code prominently in the **top-right header of `PrescriptionPreview`** next to clinic branding, alongside printed UHID (`patient_code`), Barcode/QR label, and patient demographic metadata (Name, Age, Gender, Date).

#### 2. Multi-Field Identity Search & Duplicate Soft-Match

* Update `PatientListPane` search logic: Allow searching by **Name**, **UHID (`patient_code`)**, **Phone Number**, or **QR Code Scan Input**.

* If a patient registers under a new phone number, typing their Name + Gender triggers a soft-match prompt:

  > *"1 Potential Matching Profile Found: Zimal Fatima (UHID: CLI-2026-00014, Age 25). Is this a returning patient?"*

#### 3. Database RPC & Server Action for Profile Merging

* Create a Supabase SQL RPC function `merge_patient_profiles(target_patient_id UUID, duplicate_patient_id UUID, clinic_id UUID)`.

* Re-assign all associated records (`visits`, `prescriptions`, `vitals`, `patient_documents`, `patient_bills`) from `duplicate_patient_id` to `target_patient_id`, then flag or soft-delete the duplicate record.

* Add `mergePatientProfilesAction` in `lib/actions/patients.ts`.

### Module B: The 7 Sub-Tabs Patient Workspace (`patient-record.tsx`)

Convert the patient detail workspace tab navigation into a clean 7-tab bar:

```
[ Overview ]  [ History ]  [ Clinical ]  [ Medications ]  [ Documents ]  [ Appointments ]  [ Prescription ]

```

#### Detailed Tab Breakdown:

1. **`Overview` Tab:**

   * Highlights: Key Vitals widget (BP, Pulse, Temp, SpO2, BMI), Critical Alerts (Known Allergies, Chronic Conditions), First-Visit Baseline Badge / Banner, Last Primary Diagnosis.

2. **`History` Tab:**

   * Complete Medical & Surgical History, Past Family History, Pre-Consultation Intake Q&A answers (`pre_consultation_answers`).

3. **`Clinical` Tab:**

   * Timeline of all previous clinical encounters/visits, past chief complaints, examination notes, and doctor SOAP notes.

4. **`Medications` Tab:**

   * Active ongoing medications list, past prescription history table, drug allergy alerts.

5. **`Documents` Tab:**

   * Receptionist & Patient Upload Zone: Lab PDFs, Scans, Imaging, Physical paper reports.

   * Includes File Quality Badge: `[Clear]` / `[Flagged Unreadable]`.

   * Action: 1-Click `[Request Re-upload via WhatsApp]`.

6. **`Appointments` Tab:**

   * Historical and upcoming appointments, Consultation Type badges (`[In-Person OPD]` vs `[Online Telemedicine]`), Payment status (`[Paid]` / `[Pending]`).

7. **`Prescription` Tab (Active Encounter Form):**

   * **Inline Prescription Workspace** embedded directly inside the workspace (eliminating the need for forced full-screen modal overlays during active encounters).

### Module C: Embedded Prescription Form (`embedded-prescription-tab.tsx`)

Build a clean, structured, responsive clinical form that manages the 10 plain-text/JSON fields of `public.prescriptions`:

1. **Chief Complaint (`chief_complaint`):**

   * `<Textarea>` with multi-line support, quick phrase chips (e.g., "Fever x 3 days", "Chest pain", "Dry cough").

2. **Examination Findings (`findings`):**

   * `<Textarea>` for clinical/physical examination notes (Symptom duration, system examination).

3. **Diagnosis & Custom Diagnosis (`diagnosis`, `custom_diagnosis`):**

   * Searchable autocomplete combobox for common diagnoses + free-text input for custom clinical diagnoses.

4. **Searchable Medicines Table (`medicines` JSONB):**

   * **Search Input:** Dynamic catalog search for generic and brand medicine names (e.g., Paracetamol, Amoxicillin, Omeprazole).

   * **Manual Dose Controls per Row:**

     * `Name`: Auto-filled from search or custom typed.

     * `Form`: Dropdown (`Tablet`, `Syrup`, `Injection`, `Capsule`, `Ointment`).

     * `Dose / Strength`: Input (e.g., `500mg`, `5ml`, `1 puff`).

     * `Frequency`: Dropdown (`1-0-1` \[BD\], `1-1-1` \[TDS\], `1-0-0` \[OD\], `0-0-1` \[HS\], `PRN` \[As needed\]).

     * `Timing`: Radio / Select (`Before Food`, `After Food`, `With Food`).

     * `Duration`: Input + Unit select (e.g., `5 Days`, `2 Weeks`, `1 Month`).

     * `Instructions`: Input (e.g., "Take with plenty of water").

   * Action buttons: `[+ Add Medicine Row]`, `[Remove Row]`.

5. **Searchable Lab & Imaging Orders (`lab_orders` JSONB):**

   * **Search Input:** Autocomplete search for standard Lab Tests & Radiologic Exams (e.g., `CBC`, `LFTs`, `Chest X-Ray PA View`, `HbA1c`, `Ultrasound Abdomen`).

   * Manual notes field per order item (e.g., "Fasting required", "Urgent").

6. **Follow-Up & Doctor Notes (`follow_up_date`, `follow_up_notes`, `doctor_notes`):**

   * Date picker for follow-up visit.

   * Textarea for private/internal clinical notes and specific patient instructions.

7. **Footer Actions Bar:**

   * `[Save Draft]` button (runs `savePrescriptionAction`).

   * `[Print Preview]` CTA button (triggers print preview modal with QR code header).

   * `[Complete & Next Patient]` primary action button (invokes `complete_and_advance` RPC).

### Module D: Standalone Ambient AI Copilot Modal (`ambient-copilot-modal.tsx`)

The Ambient Voice Copilot is implemented as a **Standalone Floating Modal / Drawer Popup Overlay** that sits quietly over the screen without disrupting the 7-tab workspace layout.

#### 1. Visual Trigger & Dock:

* Floating pill button in the bottom-right corner of the Consultation Workspace: `[ 🎙️ Open Ambient Copilot ]` with active status pulsing indicator when recording.

#### 2. Modal Interface Layout:

* **Header:**

  * Patient Name & UHID Context.

  * Recording Controls: `[🔴 Start Listening]`, `[⏸️ Pause]`, `[⏹️ Stop & Extract]`.

  * Audio Waveform animation indicator.

* **Body Pane 1: Live Speech-to-Text Transcript:**

  * Real-time streaming transcription box showing conversation between Doctor and Patient.

* **Body Pane 2: Clinical AI Field Extraction (Gemini Structured Parsing):**

  * Displays parsed structured JSON cards for extracted items:

    * *Detected Complaints:* "Severe headache for 2 days"

    * *Detected Findings:* "BP elevated at 140/90"

    * *Detected Diagnosis:* "Essential Hypertension"

    * *Detected Medicines:* "Tab. Amlodipine 5mg OD x 30 days"

    * *Detected Labs:* "Serum Electrolytes, ECG"

* **Footer Action Bridge:**

  * **`[ ✨ Apply All Extracted Fields to Prescription Tab ]`** button.

  * On click: Auto-populates the corresponding fields in `embedded-prescription-tab.tsx` using React state setters, showing a success toast ("Prescription form populated from Copilot transcript!").

### Module E: Edge Case & Fallback Handlers

#### 1. First-Time Patient Fallback (Zero Prior Records)

* In `check-in-modal.tsx` and `Documents` tab, document upload is **100% optional**.

* Provide a 1-click **`"First Visit / No Prior Records"`** toggle for receptionists.

* In the `Overview` tab, if no prior visits or documents exist, display a clean **`"First Visit Baseline Profile"`** card encouraging baseline vitals and allergy intake.

#### 2. Online Consultation Flow (Telemedicine)

* When `appointment.consultation_type === 'online'`:

  * Vitals recorded manually or self-reported by patient are tagged with a visual badge: `[Self-Reported by Patient]` vs `[Clinic Verified]`.

  * Display a prominent `[📹 Start Online Video / Audio Call]` CTA button at the header of the workspace.

#### 3. Unreadable / Blurry Document Fallback

* In the `Documents` tab, if a uploaded photo or scan is blurry, the doctor can click `[Flag Unreadable]`.

* System triggers a automated WhatsApp message/SMS to the patient with a re-upload link.

#### 4. Emergency Walk-In Express Check-In

* Receptionist can click **`[⚡ Emergency Express Check-In]`** which bypasses document upload, billing pre-collection, and detailed registration—taking only Name + Mobile, generating an instant high-priority queue token, and routing directly to the Doctor's active queue.

## 4. Implementation Steps & Deliverables

### Step 1: Database & Server Actions Setup

1. Implement `merge_patient_profiles` Postgres RPC in a new Supabase migration SQL file.

2. Add `mergePatientProfilesAction` in `lib/actions/patients.ts`.

3. Update `savePrescriptionAction` in `lib/actions/consultation.ts` to cleanly parse and validate JSON payloads for medicines and lab orders.

### Step 2: QR Code Header Integration in `prescription-preview.tsx`

1. Import `qrcode` in `components/consultation/prescription-preview.tsx`.

2. Generate base64 data URL for the patient QR code (`patient_code`, `patient_id`, `clinic_id`).

3. Render the scannable QR Code image alongside the official prescription header.

### Step 3: Implement 7 Sub-Tabs Layout in `patient-record.tsx`

1. Extend the workspace tab state to support 7 distinct tabs.

2. Render `[Overview]`, `[History]`, `[Clinical]`, `[Medications]`, `[Documents]`, `[Appointments]`, and `[Prescription]`.

3. Map existing sub-components and create placeholder shells for missing views.

### Step 4: Build Embedded Prescription Form Component (`embedded-prescription-tab.tsx`)

1. Create `components/consultation/embedded-prescription-tab.tsx`.

2. Wire up controlled inputs for `chief_complaint`, `findings`, `diagnosis`, `custom_diagnosis`, `medicines`, `lab_orders`, `follow_up_date`, `follow_up_notes`, `doctor_notes`.

3. Add searchable medicine combobox with dosage, frequency, timing