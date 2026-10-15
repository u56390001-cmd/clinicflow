# ClinicFlow — Phase 3 & Phase 4 Technical Implementation Prompts

This document contains production-ready, highly detailed technical prompts for implementing **Phase 3** and **Phase 4** of the **ClinicFlow / MedBook AI** platform.

---

## 🚀 Recommendation: Where Should We Start First?

### **Recommendation: Implement Phase 3 First.**

#### **Strategic & Technical Justification:**
1. **Data Pipeline Precondition (Data Flow Dependencies)**:
   * **Phase 4** (Psychometrics, Trend Graphs, and AI Insights) relies heavily on longitudinal patient assessment data collected over time.
   * Without **Phase 3** (Patient Assessment Delivery, WhatsApp Invites, Secure One-Time Token Links, Patient Intake Forms), there will be no patient-submitted standardized scores (e.g., PHQ-9, GAD-7) flowing into the system to visualize or analyze in Phase 4.
2. **Immediate Operational Value**:
   * Enabling clinicians to send assessment links via WhatsApp or SMS delivers instant real-world utility and patient engagement right away.
3. **Natural Execution Sequence**:
   * **Phase 3** = Data Collection & Patient Assessment Gateway
   * **Phase 4** = Data Analytics, Visual Progress Tracking, & Clinician AI Summaries

---

## 📱 Prompt 1: Phase 3 — Patient Mobile Assessment & Secure Links

```text
Act as a Principal Full-Stack Healthcare Software Engineer and Security Architect.

Implement "Phase 3 — Patient Mobile Assessment & Secure Links" for the ClinicFlow (MedBook AI) Next.js 15 + Supabase multi-tenant EHR platform.

### Objective
Enable clinicians to issue patient-facing psychometric assessments (e.g., PHQ-9, GAD-7, PCL-5) via secure one-time-token links sent through WhatsApp/SMS or completed directly on a mobile-responsive patient portal session without requiring patient password registration.

---

### Technical Specifications & Requirements

#### 1. Database & Security Schema (Supabase PostgreSQL + RLS)
- Create table `patient_assessment_invites`:
  - `id`: UUID (Primary Key, default `gen_random_uuid()`)
  - `clinic_id`: UUID (FK to `clinics.id`, NOT NULL)
  - `patient_id`: UUID (FK to `patients.id`, NOT NULL)
  - `clinician_id`: UUID (FK to `auth.users.id`, NOT NULL)
  - `assessment_type`: VARCHAR(50) (e.g., 'PHQ9', 'GAD7', 'PCL5')
  - `token_hash`: TEXT (SHA-256 hashed one-time token, UNIQUE, NOT NULL)
  - `expires_at`: TIMESTAMPTZ (Default: `NOW() + INTERVAL '72 hours'`)
  - `completed_at`: TIMESTAMPTZ (NULL until completed)
  - `delivery_channel`: VARCHAR(20) ('WHATSAPP', 'SMS', 'IN_CLINIC')
  - `delivery_status`: VARCHAR(20) ('PENDING', 'SENT', 'DELIVERED', 'FAILED')
  - `metadata`: JSONB (Default `{}`)
  - `created_at`: TIMESTAMPTZ (Default `NOW()`)

- Create Row-Level Security (RLS) Policies:
  - Clinicians can SELECT/INSERT/UPDATE invites matching their `clinic_id` via `clinic_members`.
  - Unauthenticated patients can ONLY access non-expired, uncompleted assessment invites using RPC / Edge Function matching `token_hash`.

#### 2. Secure Token Delivery & Link Generator (`lib/assessments/tokens.ts`)
- Implement token generation using Node `crypto`:
  - Generate raw 32-byte cryptographic random string.
  - Store `SHA-256` hash in database (`token_hash`).
  - Return raw token only once for the URL path: `/eval/[token]`.

#### 3. WhatsApp Integration & Edge Delivery (`app/api/assessments/send/route.ts`)
- Server Action / API Route accepting `patient_id`, `assessment_type`, `delivery_channel`.
- Support WhatsApp Business API (Twilio / Meta Graph API webhook interface):
  - Formulate structured message template: *"Hello [Patient Name], Dr. [Clinician Name] from [Clinic Name] has requested you complete your wellness check: [Secure Link]"*
  - Support fallback to direct link copy for manual sharing.

#### 4. Patient-Facing Mobile Interface (`app/eval/[token]/page.tsx`)
- Lightweight, mobile-first UI built with Tailwind CSS and Radix Primitives.
- Mobile UX Requirements:
  - Step-by-step wizard UI (one question at a time or clean grouped cards).
  - Clear visual scale indicators (e.g., "0 = Not at all" to "3 = Nearly every day").
  - Auto-save form progress locally in session memory.
  - Full RTL layout support (Arabic/Urdu) using Tailwind logical properties.
  - Submission handler: Post answers securely via Server Action, compute score, insert into `patient_assessments` table, mark token invite as `completed_at = NOW()`.

#### 5. Verification & Safety Constraints
- Validate token expiration and single-use invalidation upon submission.
- Prevent caching on `/eval/*` routes via headers (`Cache-Control: no-store`).

---

### Deliverables Expected
1. SQL migration file for `patient_assessment_invites` with RLS.
2. Token generation & verification module (`lib/assessments/tokens.ts`).
3. Server Action for sending WhatsApp/SMS assessment invites.
4. Clean, responsive React component for patient evaluation (`app/eval/[token]/page.tsx`).
```

---

## 📊 Prompt 2: Phase 4 — Psychometrics Trend Graphs & AI Insights

```text
Act as a Senior Clinical Informatics Lead and Full-Stack Next.js Developer.

Implement "Phase 4 — Psychometrics Trend Graphs & AI Insights" for ClinicFlow (MedBook AI).

### Objective
Provide clinicians with interactive longitudinal progress tracking charts, historical severity range overlays, and clinician-approved AI summaries based on accumulated psychometric score trends.

---

### Technical Specifications & Requirements

#### 1. Data Aggregation & Schema (`patient_assessments` Analysis)
- Query structured patient assessment records containing:
  - `score`: INTEGER
  - `assessment_type`: VARCHAR (e.g., 'PHQ9', 'GAD7')
  - `responses`: JSONB (Individual item scores)
  - `created_at`: TIMESTAMPTZ

#### 2. Interactive Longitudinal Progress Charts (`components/clinical/TrendChart.tsx`)
- Build visual chart engine using Recharts / Tremor / Chart.js:
  - X-Axis: Assessment Date (formatted using `date-fns`).
  - Y-Axis: Total Score scale calibrated to measure type (e.g., PHQ-9 scale 0 to 27).
  - Multi-line comparison option (e.g., Overlaying PHQ-9 Depression and GAD-7 Anxiety trends on a single chart).
  - Severity Range Overlays (Visual shaded bands for clinical severity zones):
    - *PHQ-9 Ranges*: 0–4 (Minimal), 5–9 (Mild), 10–14 (Moderate), 15–19 (Moderately Severe), 20–27 (Severe).
  - Hover Tooltips displaying full breakdown (Date, Score, Severity Level, Clinician Notes).

#### 3. AI Longitudinal Insight Generator (`lib/ai/longitudinal-summary.ts`)
- Integration with LLM provider (OpenAI / Anthropic API / Vercel AI SDK):
  - Input Context: Patient demographic context (age, gender), chronological assessment scores array, intervention milestones (medication changes, therapy starts).
  - System Prompt Requirements:
    - Act as an expert clinical assistant.
    - Summarize overall trajectory (e.g., "35% reduction in depressive symptoms over 8 weeks").
    - Highlight notable fluctuations or acute score spikes.
    - Draft non-diagnostic, decision-support clinical notes for review.
- Output Format: Structured JSON containing:
  - `trajectory`: 'IMPROVING' | 'STABLE' | 'DETERIORATING' | 'FLUCTUATING'
  - `summary_markdown`: Structured clinical summary draft.
  - `key_observations`: Bulleted clinical signals.

#### 4. Clinician-in-the-Loop Approval Workflow (`components/clinical/AISummaryCard.tsx`)
- UI component for displaying AI Insights inside the Patient Record Dashboard:
  - Draft State: Highlighted box showing generated AI summary.
  - Action Controls:
    - `[Approve & Save to EHR]` -> Writes approved summary to `clinical_notes`.
    - `[Edit Summary]` -> Inline text area allowing clinician modification before saving.
    - `[Regenerate]` -> Triggers re-computation with custom parameters.
  - Watermark/Audit requirement: Unapproved AI output must never be marked as official medical documentation.

---

### Deliverables Expected
1. React component for interactive trend visualization (`components/clinical/TrendChart.tsx`).
2. AI Service file for score trend analysis (`lib/ai/longitudinal-summary.ts`).
3. Dashboard card component with approval & edit workflows (`components/clinical/AISummaryCard.tsx`).
4. TypeScript interfaces defining all psychometric data models.
```

---

## 📌 Implementation Checklist & Roadmap Matrix

| Phase | Description | Key Deliverable | Recommended Order |
| :--- | :--- | :--- | :--- |
| **Phase 3** | Patient Mobile Assessment & Secure Links | WhatsApp links, intake form UI, single-use tokens | 1️⃣ **Start Here** |
| **Phase 4** | Psychometric Trend Graphs & AI Insights | Recharts score trends, severity zones, AI summaries | 2️⃣ **Next Step** |
| **Phase 5** | Safety Alerts & Escalation Workflow | C-SSRS / PHQ-9 Q9 triggers & immediate alerts | 3️⃣ Follows Phase 3/4 |
| **Phase 6 & 7** | Reminders & Advanced Measure Families | Automated schedule rules & multi-rater tools | 4️⃣ Final Optimization |