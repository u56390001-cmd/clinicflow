# Doxmate Queue Management System (QMS) - Complete Architecture & Implementation Guide

## Executive Summary
The **Doxmate Queue Management System (QMS)** is an end-to-end clinic workflow automation engine. It seamlessly connects patient appointment bookings (via WhatsApp AI Chatbot or manual receptionist entry), check-in processing, dynamic token allocation, live waiting queue management, real-time waiting area TV display screens, doctor EMR consultation workflows, digital prescription generation, and automated billing settlement.

---

## 1. System Architecture & Patient Lifecycle States

```
+---------------------------------------------------------------------------------------------------+
|                                     PATIENT LIFECYCLE FLOW                                        |
+---------------------------------------------------------------------------------------------------+
|  1. SCHEDULED / NOT YET ARRIVED                                                                   |
|     - Patient books via WhatsApp Chatbot or Receptionist manually creates appointment.            |
|     - Appears in "Not Yet Arrived" list with scheduled time slot.                                 |
|                                                                                                   |
|  2. CHECK-IN & TOKEN ASSIGNMENT                                                                   |
|     - Patient arrives at clinic; Receptionist clicks "Check In".                                  |
|     - Fee collected (optional); Automatic unique dynamic Token Number assigned (e.g., Token #1).   |
|     - Patient moves to "Waiting Queue" section.                                                   |
|                                                                                                   |
|  3. WAITING QUEUE & VITALS RECORDING                                                              |
|     - Receptionist/Nurse enters patient vitals (BP, Pulse, Temp, Weight, etc.).                   |
|     - Patient details & token status reflect live on Waiting Area Smart TV Display.               |
|                                                                                                   |
|  4. IN CONSULTATION                                                                               |
|     - Doctor sees Token #1 on EMR screen with active "Start Consultation" button.                 |
|     - Doctor clicks "Start Consultation"; Patient status flips to "In Consultation".              |
|     - Smart TV updates with audio announcement calling Token #1.                                  |
|                                                                                                   |
|  5. COMPLETED & BILLING                                                                           |
|     - Doctor writes digital prescription, saves record, and clicks "Next Patient".                |
|     - Patient session marks as "Completed"; Next waiting token automatically moves to top.        |
|     - Post-consultation billing/receipt PDF dispatched automatically to WhatsApp.                 |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Component-by-Component UI/UX & Functional Specifications

### 2.1 Appointments & Queue Dashboard (Receptionist Interface)

* **Top KPI Summary Metrics Grid**:
  * `Checked In`: Integer count of checked-in patients currently waiting.
  * `In Consultation`: Integer count of active ongoing consultations.
  * `Not Arrived`: Integer count of scheduled appointments who haven't checked in yet.
  * `Completed`: Integer count of finished consultations for the day.

* **Segmented Tabs & Search Controls**:
  * Main Navigation Tabs: `Consultations` and `Services`.
  * Sub-Tabs: `Today`, `Upcoming`, `Completed`, `All`, `Cancelled`.
  * Controls: Search input bar (`Search by patient name or phone...`), `Filters` dropdown (Doctor, Status, Source, Date Range), and `Export` button.
  * Primary Action CTA: Floating/Top-Right `+ New Appointment` button.

* **Queue Accordion Sections**:
  1. **`In Consultation` Panel**: Displays active patient card currently inside the doctor's room with live timer/status banner.
  2. **`Waiting Queue` Panel**: Ordered list of checked-in patient cards showing Token Badges (`Token #1`, `Token #2`, etc.), Patient Name, Assigned Doctor, Slot Time, and action buttons (`Add Vitals`, Three-Dots Menu).
  3. **`Not Yet Arrived` Panel**: List of upcoming scheduled appointments for the day with green `Check In` CTA buttons.

---

### 2.2 Patient Check-In & Payment Modal Popup

Triggered when clicking the **`Check In`** button on any patient in the "Not Yet Arrived" list.

* **Modal Structure**: 3-Column Split Horizontal Grid with top dark-blue header ribbon.
  * **Header**: Title `"Check In Patient"`, Patient Name, Subtitle *"Token #X will be assigned"*, and `"Returning Patient"` / `"First Visit"` badge.
  * **Column 1 (Patient Confirmation)**: Profile initial badge, Name, Age, Location, Phone, Patient ID (`CIT-2026-XXXXX`), Booking Source (`Walk-in` / `WhatsApp`), Assigned Doctor, Slot Name, and Slot Time Range.
  * **Column 2 (Collect Payment)**:
    * `CONSULTATION FEE (₹)`: Editable fee input box (with pencil edit controller).
    * `PAYMENT MODE` (2x2 Grid Tiles): `Cash (Physical cash)`, `UPI (GPay / PhonePe)`, `Card (Debit / Credit)`, `Waive (No charge)`.
  * **Column 3 (Add-ons & Adjustments)**:
    * `+ Additional Charges` accordion (for adding procedure/lab fees).
    * `% Apply Discount` accordion.
  * **Footer Bar**: Total Amount display, `Collect Payment` secondary button, and solid green **`Check In`** primary button.

* **Check-In Execution Logic**:
  1. System checks the current highest token assigned for the doctor/clinic today.
  2. Assigns `Next Token Number = Highest Token + 1`.
  3. Flips patient status from `SCHEDULED` to `CHECKED_IN` / `WAITING`.
  4. Generates Invoice/Receipt record (`RCP-YYYYMMDD-XXX`) if payment collected, and dispatches digital receipt via WhatsApp.
  5. Pushes real-time WebSocket update to update Receptionist Dashboard, Doctor EMR, and Smart TV Display.

---

### 2.3 Waiting Area Smart TV Queue Display Integration

Designed for high-resolution LED screens / Smart TVs placed in the clinic waiting area.

* **Layout Structure**:
  * **Header Bar**: Clinic Logo, Clinic Name, Address, Date & Live Clock.
  * **Left Banner (`CURRENT PATIENT`)**:
    * Large bold display of `TOKEN NUMBER` (e.g. `1`).
    * Active Patient Name (e.g. `Sonu Sharma`).
    * Assigned Doctor Name (e.g. `Dr. Arjun Mehta`).
    * Green status pill: `Consultation In Progress`.
  * **Right Panel (`UPCOMING PATIENTS`)**:
    * Table columns: `TOKEN` | `PATIENT NAME` | `STATUS`.
    * Lists upcoming waiting tokens (e.g. Token 2 Manoj Kumar - Waiting, Token 3 Vivek - Waiting).
  * **Footer Ticker Banner**: Custom marquee text (*"City Care Clinic — Please be seated. We will call you shortly."*) + *"Powered by Doxmate"*.

* **Audio Announcement Engine**:
  * When doctor clicks "Start Consultation" or "Next Patient", the TV screen triggers a voice alert: *"Token number 1, Sonu Sharma, please proceed to Dr. Arjun Mehta's consultation room."*

---

### 2.4 Priority & Emergency Token Re-Ordering Logic

When an emergency or high-priority patient arrives:
1. Receptionist opens patient row menu (`⋮`) or token controller.
2. Selects **`Token Update / Shift to Top`**.
3. System updates database token mapping: moves selected patient to `Token #1` position and increments existing waiting tokens (`Token #1` -> `Token #2`, etc.).
4. Real-time WebSocket event broadcasts new queue order.
5. Doctor EMR screen immediately updates, enabling the **`Start Consultation`** button for the updated `Token #1` patient.

---

### 2.5 Doctor EMR Consultation & Prescription Workflow

* **Queue List View in EMR**:
  * Displays real-time list of waiting patients who have completed check-in.
  * **Single-Active Button Rule**: The **`Start Consultation`** button is ONLY active for `Token #1` (top of queue). Subsequent tokens have disabled state until they reach the top position.

* **EMR Prescription Writer**:
  * **Patient Banner**: Displays Name, Age, Gender, City, Patient ID, and recorded Vitals (BP, Pulse, Temp, Weight, SpO2).
  * **Chief Complaint**: Text input with autocomplete suggestions.
  * **Clinical Findings / On Examination**: Multi-line clinical observation notes.
  * **Diagnosis**: Autocomplete dropdown with custom diagnosis creation (`+ Add Custom Diagnosis`).
  * **Medicines Row Builder**:
    * Fields: `Medicine Name`, `Route/Form` (Oral, Tab, Cap, Syrup), `Frequency` (OD 1-0-0, BD 1-0-1, TDS 1-1-1, QID, HS), `Duration + Unit` (e.g. 5 Days), `Instructions` (Before Food, After Food, With Food).
    * `+ Add Medicine` button for adding multiple drugs.
  * **Lab Tests Ordered**: Multi-select tags (e.g. `CBC`, `CRP`, `HbA1c`).
  * **Follow-up & Notes**: Follow-up duration/date, follow-up instructions, and doctor's private notes.
  * **Templates Engine**: `Save Template` (e.g. "Fever Standard Protocol") and `Load Template` (auto-fills prescription parameters in 1 click).
  * **Actions**: `Print Preview`, `Save` (generates prescription PDF and sends to WhatsApp).

* **"Next Patient" Event Handler**:
  * Doctor clicks **`Next Patient`** button.
  * System marks current patient consultation as `COMPLETED`.
  * Automatically shifts next waiting patient to `IN_CONSULTATION` state.
  * Clears prescription canvas for the new session and updates TV display screen.

---

## 3. Database Schema Blueprint (SQL / PostgreSQL)

```sql
-- 1. APPOINTMENTS & QUEUE TOKENS TABLE
CREATE TYPE appointment_status AS ENUM (
    'SCHEDULED', 'NOT_YET_ARRIVED', 'WAITING', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW'
);

CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL,
    patient_id UUID NOT NULL REFERENCES patients(id),
    doctor_id UUID NOT NULL REFERENCES doctors(id),
    appointment_date DATE NOT NULL,
    slot_time_start TIME NOT NULL,
    slot_time_end TIME NOT NULL,
    
    -- Queue & Token State
    status appointment_status NOT NULL DEFAULT 'SCHEDULED',
    token_number INTEGER DEFAULT NULL, -- Assigned upon Check-In
    check_in_time TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    consultation_start_time TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    consultation_end_time TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    
    consultation_type VARCHAR(50) DEFAULT 'IN_CLINIC', -- IN_CLINIC / ONLINE
    booking_source VARCHAR(50) DEFAULT 'WHATSAPP', -- WHATSAPP / MANUAL_DASHBOARD / PHONE_CALL
    emergency_flag BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. PATIENT VITALS TABLE
CREATE TABLE patient_vitals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID UNIQUE NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id),
    
    height_cm DECIMAL(5, 2),
    weight_kg DECIMAL(5, 2),
    bmi DECIMAL(4, 2),
    systolic_bp INTEGER,
    diastolic_bp INTEGER,
    pulse_bpm INTEGER,
    temperature_f DECIMAL(4, 1),
    spo2_percent INTEGER,
    resp_rate INTEGER,
    
    recorded_by UUID REFERENCES staff_users(id),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. WebSocket Event Architecture (Real-Time Synchronization)

| Event Name | Trigger Source | Target Clients | Payload Data | Action Required |
| :--- | :--- | :--- | :--- | :--- |
| `PATIENT_CHECKED_IN` | Receptionist Check-In Modal | Doctor EMR, TV Display, Receptionist Dashboard | `{ appointment_id, token_number, patient_name, doctor_id }` | Update Waiting Queue lists & add token to list |
| `CONSULTATION_STARTED` | Doctor EMR / Receptionist | TV Display, Receptionist Dashboard | `{ appointment_id, token_number, patient_name, doctor_name }` | Flip status banner to "In Consultation", trigger TV Audio Announcement |
| `PRIORITY_TOKEN_SHIFTED` | Receptionist Dashboard | Doctor EMR, TV Display | `{ reordered_queue_array }` | Re-index token numbers and enable "Start Consultation" button for new Token #1 |
| `CONSULTATION_COMPLETED` | Doctor EMR ("Next Patient") | Receptionist Dashboard, TV Display, Billing | `{ completed_id, next_patient_id, next_token }` | Mark current completed, promote next token to "In Consultation" |

---

## 5. Implementation Checklist for AI Coding Agents

- [ ] **Database & State Machine Setup**:
  - [ ] Implement `appointments` table schema with token tracking fields and status ENUMs.
  - [ ] Build atomic sequence generator for daily token numbers (`Token #1`, `Token #2`) scoped per doctor/clinic date.
- [ ] **Receptionist Dashboard UI**:
  - [ ] Build KPI cards (`Checked In`, `In Consultation`, `Not Arrived`, `Completed`).
  - [ ] Build accordion sections (`In Consultation`, `Waiting Queue`, `Not Yet Arrived`).
  - [ ] Implement `Check In Patient` 3-column modal with fee collection and WhatsApp receipt dispatch trigger.
- [ ] **Priority Re-Ordering Engine**:
  - [ ] Build API endpoint `POST /api/queue/reorder` to handle emergency queue priority shifts.
- [ ] **Doctor EMR Queue & Prescription Integration**:
  - [ ] Implement token check logic: enable `Start Consultation` button ONLY for active `Token #1`.
  - [ ] Build Prescription Writer form (Chief Complaint, Findings, Diagnosis, Medicines builder, Templates).
  - [ ] Connect `Next Patient` event handler to clear session and promote next token.
- [ ] **Smart TV Display View**:
  - [ ] Build high-contrast dark theme view (`/tv-display?clinic_id=X`).
  - [ ] Connect WebSocket listener for `PATIENT_CHECKED_IN`, `CONSULTATION_STARTED`, and `CONSULTATION_COMPLETED`.
  - [ ] Integrate Web Speech API / Audio chime for automated vocal token callouts.
