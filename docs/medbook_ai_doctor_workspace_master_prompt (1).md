# Master Prompt: MedBook AI Doctor Workspace Enhancements

## Expert Role
Act as a Senior Full-Stack Developer with deep expertise in React, Next.js, TypeScript, Tailwind CSS, and Supabase. You have extensive experience building HIPAA-compliant, multi-tenant Electronic Medical Record (EMR) systems and complex modular user interfaces.

## Objective
Refactor and enhance the MedBook AI Doctor Workspace EMR module. The goal is to resolve patient identity duplication, consolidate the clinical workflow into a unified tabbed interface, and introduce an ambient AI voice dictation copilot to accelerate prescription data entry.

## Context & Background Information
MedBook AI is a multi-tenant EMR and clinic management platform. Currently, doctors face friction with fragmented patient profile creation (leading to duplicates) and a disjointed data entry experience. The clinical workflow needs to be streamlined so that doctors can seamlessly navigate patient history, clinical notes, and medications within a single view, while leveraging ambient voice AI to reduce manual typing. 

## User Requirements
1. **Patient Identity Management:** Doctors and receptionists must be able to uniquely identify patients via a printed QR code containing the `patient_code`. Administrators must be able to merge duplicate patient records seamlessly.
2. **Unified Clinical Workspace:** Doctors need all prescription and clinical modules accessible via a tabbed interface (History, Clinical, Medications, etc.) without leaving the current screen or losing context.
3. **Ambient Voice Dictation:** Doctors require a floating voice assistant that listens to the consultation and automatically extracts and fills relevant fields in the active prescription tab.

## Functional Requirements
1. **QR Code Generation:** 
   - Dynamically generate and embed a QR code on the PDF/print view of the prescription. 
   - The QR code must securely encode the unique `patient_code`.
2. **Patient Merging (Supabase RPC):**
   - Create a Postgres stored procedure/RPC named `merge_patient_profiles(primary_patient_id, duplicate_patient_id)`.
   - The RPC must re-parent all associated relational data (appointments, billing, prescriptions, clinical notes) from the duplicate ID to the primary ID.
   - Safely archive or soft-delete the duplicate profile after successful migration.
3. **Tabbed Prescription Interface:**
   - Embed the existing Prescription form into a robust tabbed component.
   - Tabs should include, but are not limited to: History, Clinical, Medications, Diagnostics.
   - The Medications tab must retain the searchable medicine database lookup functionality alongside inputs for manual dosage/frequency entry.
   - Preserve state across tabs so data isn't lost while switching views during a consultation.
4. **Ambient Voice Copilot Modal:**
   - Implement a globally accessible, floating action button (FAB) or draggable modal for the Voice Copilot.
   - Integrate speech-to-text capture.
   - Process the transcribed text to identify intent and map extracted medical entities (chief complaints, prescribed medicines, dosages) directly to the corresponding state variables of the unified tab form.

## Technical Requirements
- **Frontend:** Next.js, React (Functional Components, Hooks), TypeScript, Tailwind CSS for styling.
- **State Management:** Use efficient state management (e.g., Zustand or React Context) to handle form state across the tabbed interface to prevent unnecessary re-renders.
- **Backend/Database:** Supabase. Write optimized raw SQL for the `merge_patient_profiles` RPC, ensuring transaction safety (`BEGIN` and `COMMIT`).
- **Typing:** Strict TypeScript interfaces for all database queries and component props.

## Constraints
- Ensure all database operations are secured with Row Level Security (RLS) policies appropriate for a multi-tenant architecture.
- The voice copilot modal must not block critical UI elements; it should be highly responsive and lightweight.
- Form inputs mapped by the AI Copilot must trigger visual feedback (e.g., highlighting) so the doctor can review the AI-filled data before saving.

## Deliverables
1. SQL migration script for the `merge_patient_profiles` RPC.
2. Refactored React components for the unified Tabbed Prescription Workspace.
3. Code for the Floating Ambient Voice Copilot modal with integration logic for form state auto-filling.
4. Updated prescription print component featuring the embedded QR code.

## Output Format
Provide complete, modular, and well-commented code blocks. Separate the database SQL logic from the frontend React components. Explain the state management strategy used for bridging the Voice Copilot and the Tabbed Form.

## Writing Style & Quality Standards
- Write clean, DRY (Don't Repeat Yourself), and modular code.
- Follow enterprise-grade error handling (e.g., try/catch blocks for the RPC call and voice API).
- Provide a brief architectural explanation before jumping into code.

## Success Criteria
- A duplicate patient can be completely merged into a primary patient without data loss or foreign key constraint violations.
- A doctor can dictate a clinical note, and the text correctly maps into the "Clinical" or "Medications" tab fields automatically.
- The printed prescription successfully renders a scannable QR code resolving to the correct `patient_code`.