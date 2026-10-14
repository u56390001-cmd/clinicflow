# MedBook AI Psychology EHR: Phase 1 Core Instruments & Scoring Engine Specification

## Executive Summary & System Scope

Phase 1 of the **MedBook AI Psychology Electronic Health Record (EHR)** platform defines the clinical, psychometric, and software architecture required to deliver continuous **Measurement-Based Care (MBC)**. 

The primary objective of Phase 1 is to establish a deterministic, audit-compliant assessment pipeline that automates questionnaire administration, scoring calculations, subscale aggregations, severity classification, and real-time safety risk triage.

### Core Architectural Principles
1. **Deterministic Scoring ("No LLM Math"):** All score calculations, subscale sums, missing-item imputations, and cutoff logic are performed strictly by deterministic backend microservices and database functions. Large Language Models (LLMs) are restricted solely to post-computation clinical narrative generation and are structurally prohibited from computing or altering numerical scores.
2. **Immutable Template Versioning:** Assessment templates are version-controlled using Semantic Versioning (`MAJOR.MINOR.PATCH`). Submitted patient responses store a JSON snapshot of the exact questions, scales, and weights active at the time of completion to ensure long-term data integrity and legal auditability.
3. **Automated Safety Triage Pipeline:** Submissions containing acute risk indicators (such as suicidal ideation or self-harm endorsement) immediately trigger clinical alert workflows, locking encounter progression until acknowledged and actioned by a credentialed provider.

---

## 1. Instrument Specifications & Psychometric Scoring Algorithms

Phase 1 integrates five core validated clinical instruments representing the primary P1 baseline library:
* **PHQ-9** (Depression)
* **GAD-7** (Anxiety)
* **C-SSRS Screening Version** (Suicide/Self-harm Risk)
* **PCL-5** (Trauma / PTSD)
* **WHODAS 2.0 - 12-item Version** (Global Functional Disability)

---

### 1.1 Patient Health Questionnaire-9 (PHQ-9)

The PHQ-9 is a 9-item self-report instrument screening for Major Depressive Disorder and quantifying symptom severity over a 2-week lookback period.

* **Item Response Scale (0–3 Likert):**
  * `0`: Not at all
  * `1`: Several days
  * `2`: More than half the days
  * `3`: Nearly every day
* **Deterministic Scoring Formula:**
  $$S_{\text{PHQ9}} = \sum_{i=1}^{9} x_i \quad \text{where } x_i \in \{0, 1, 2, 3\}$$
* **Severity Cutoff Bands:**
  | Total Score ($S_{\text{PHQ9}}$) | Severity Category | Clinical Guidance |
  | :--- | :--- | :--- |
  | **0 – 4** | Minimal / No Depression | No treatment required; monitor at baseline. |
  | **5 – 9** | Mild Depression | Watchful waiting; repeat PHQ-9 at follow-up. |
  | **10 – 14** | Moderate Depression | Treatment plan consideration (psychotherapy/pharmacotherapy). |
  | **15 – 19** | Moderately Severe Depression | Active treatment required with close monitoring. |
  | **20 – 27** | Severe Depression | Immediate active treatment and safety risk evaluation. |

* **Missing Data Imputation Rule:**
  * If **exactly 1 item** is missing ($|A| = 8$), the missing item value $x_{\text{missing}}$ is imputed using the mean of the 8 answered items:
    $$x_{\text{missing}} = \frac{1}{8} \sum_{i \in A} x_i$$
    $$S_{\text{PHQ9}} = \operatorname{round}\left( \sum_{i \in A} x_i + x_{\text{missing}} \right)$$
  * If **$\ge 2$ items** are missing, score generation is halted, `is_valid` is set to `FALSE`, and the response is flagged as incomplete.

---

### 1.2 Generalized Anxiety Disorder-7 (GAD-7)

The GAD-7 is a 7-item questionnaire designed to screen for Generalized Anxiety Disorder and track overall anxiety symptom severity over a 2-week lookback period.

* **Item Response Scale (0–3 Likert):**
  * `0`: Not at all
  * `1`: Several days
  * `2`: More than half the days
  * `3`: Nearly every day
* **Deterministic Scoring Formula:**
  $$S_{\text{GAD7}} = \sum_{i=1}^{7} x_i \quad \text{where } x_i \in \{0, 1, 2, 3\}$$
* **Severity Cutoff Bands:**
  | Total Score ($S_{\text{GAD7}}$) | Severity Category | Clinical Action |
  | :--- | :--- | :--- |
  | **0 – 4** | Minimal Anxiety | Baseline monitoring. |
  | **5 – 9** | Mild Anxiety | Watchful waiting; follow-up monitoring. |
  | **10 – 14** | Moderate Anxiety | Conduct detailed clinical assessment; consider active therapy. |
  | **15 – 21** | Severe Anxiety | Active clinical intervention and treatment optimization. |

* **Missing Data Imputation Rule:**
  * If **exactly 1 item** is missing ($|A| = 6$), score is calculated using mean imputation:
    $$S_{\text{GAD7}} = \operatorname{round}\left( \frac{7}{6} \sum_{i \in A} x_i \right)$$
  * If **$\ge 2$ items** are missing, score generation fails and `is_valid = FALSE`.

---

### 1.3 Columbia-Suicide Severity Rating Scale (C-SSRS) — Screening Version

The C-SSRS Screener evaluates suicidal ideation and behavior over past-month and lifetime lookback windows using binary (Yes/No) structured branching.

* **Core Assessment Questions:**
  1. *Wish to be Dead* (Yes/No)
  2. *Non-Specific Active Suicidal Thoughts* (Yes/No)
  3. *Active Suicidal Ideation with Any Methods (Not Plan) without Intent to Act* (Yes/No)
  4. *Active Suicidal Ideation with Some Intent to Act, without Specific Plan* (Yes/No)
  5. *Active Suicidal Ideation with Specific Plan and Intent* (Yes/No)
  6. *Suicidal Behavior History* (Yes/No; past 3 months / lifetime)
* **Conditional Branching Logic:**
  * Questions 1 and 2 are always administered.
  * If Question 2 = `Yes`, Questions 3, 4, and 5 **must** be administered.
  * If Question 2 = `No`, skip Questions 3–5 and proceed directly to Question 6 (Suicidal Behavior).
* **Risk Stratification Matrix:**
  | Risk Level | Triggering Criteria | System Alert State |
  | :--- | :--- | :--- |
  | **Low Risk** | Questions 1 or 2 = `Yes`; Questions 3–6 = `No` | CLEAR / Routine Review |
  | **Moderate Risk** | Question 3 = `Yes` | `PENDING_REVIEW` (Moderate Risk Alert) |
  | **High Risk** | Questions 4, 5, or 6 = `Yes` | `PENDING_REVIEW` (High Risk Urgent Banner) |

* **Missing Data Rule:** 0 missing items allowed. Any skipped required item invalidates submission.

---

### 1.4 Posttraumatic Stress Disorder Checklist for DSM-5 (PCL-5)

The PCL-5 is a 20-item measure mapping directly onto the DSM-5 diagnostic criteria for Posttraumatic Stress Disorder (PTSD) over a 30-day lookback period.

* **Item Response Scale (0–4 Likert):**
  * `0`: Not at all
  * `1`: A little bit
  * `2`: Moderately
  * `3`: Quite a bit
  * `4`: Extremely
* **Deterministic Scoring Formula:**
  $$S_{\text{PCL5}} = \sum_{i=1}^{20} x_i \quad \text{where } x_i \in \{0, 1, 2, 3, 4\}$$ (Range: 0–80)
* **DSM-5 Symptom Cluster Subscales:**
  * **Cluster B (Intrusion; Items 1–5):** $S_B = \sum_{i=1}^{5} x_i$
  * **Cluster C (Avoidance; Items 6–7):** $S_C = \sum_{i=6}^{7} x_i$
  * **Cluster D (Negative Alterations in Cognition/Mood; Items 8–14):** $S_D = \sum_{i=8}^{14} x_i$
  * **Cluster E (Arousal/Reactivity; Items 15–20):** $S_E = \sum_{i=15}^{20} x_i$
* **DSM-5 Provisional Diagnostic Rule:**
  An item is endorsed if $x_i \ge 2$ ("Moderately"). Provisional PTSD diagnosis is indicated if:
  * $\ge 1$ Cluster B item endorsed ($x_{1..5} \ge 2$), AND
  * $\ge 1$ Cluster C item endorsed ($x_{6..7} \ge 2$), AND
  * $\ge 2$ Cluster D items endorsed ($x_{8..14} \ge 2$), AND
  * $\ge 2$ Cluster E items endorsed ($x_{15..20} \ge 2$).
* **Clinical Cutoff:**
  * `0 – 30`: Below clinical threshold for PTSD.
  * `31 – 80`: Probable PTSD; comprehensive evaluation required.
* **Missing Data Imputation Rule:** Up to 4 missing items overall permitted, provided no single cluster has $> 1$ missing item. Cluster-specific mean imputation is applied for missing items within that cluster. Exceeding 4 missing items globally or $> 1$ missing item per cluster sets `is_valid = FALSE`.

---

### 1.5 WHO Disability Assessment Schedule 2.0 (WHODAS 2.0, 12-Item)

The 12-item WHODAS 2.0 measures global health and functional disability across 6 ICF domains over a 30-day lookback period.

* **Item Response Scale (0–4 Likert):**
  * `0`: None
  * `1`: Mild
  * `2`: Moderate
  * `3`: Severe
  * `4`: Extreme or cannot do
* **Scoring Methods:**
  * **Simple Total Raw Score:** Sum of 12 items (Range: 0–48).
  * **Standardized Metric Score (0–100%):**
    $$\text{Metric Score (\%)} = \left( \frac{\text{Raw Score}}{48} \right) \times 100$$
* **Disability Severity Classification:**
  | Simple Score (0–48) | Metric Score (0–100%) | Severity Level |
  | :--- | :--- | :--- |
  | **0 – 4** | 0.0 – 9.3% | Little to No Disability |
  | **5 – 9** | 10.4 – 19.8% | Mild Disability |
  | **10 – 19** | 20.8 – 40.6% | Moderate Disability |
  | **20 – 29** | 41.7 – 61.5% | Severe Disability |
  | **30 – 48** | 62.5 – 100.0% | Extreme Disability |

* **Missing Data Rule:** Maximum 1 missing item permitted; imputed using the arithmetic mean of 11 answered items. $\ge 2$ missing items invalidates the submission.

---

## 2. Clinical Safety Protocols & Automated Alert Workflows

### 2.1 Automated Safety Triggers
Real-time safety flags are evaluated instantly upon payload submission:
* **PHQ-9 Safety Trigger:** Item 9 ("Thoughts that you would be better off dead, or of hurting yourself") $> 0$ (values 1, 2, or 3).
* **C-SSRS Moderate Risk Trigger:** Item 3 = `1` (`Yes`).
* **C-SSRS High Risk Trigger:** Item 4, Item 5, or Item 6 = `1` (`Yes`).

### 2.2 Alert Execution Lifecycle & State Machine
```
   [ Patient Response Submission ]
                 │
                 ▼
    ┌──────────────────────────┐
    │  Scoring Engine Check    │
    └────────────┬─────────────┘
                 │
        Safety Triggered?
        ┌────────┴────────┐
     NO │                 │ YES
        ▼                 ▼
 ┌─────────────┐   ┌──────────────────────────┐
 │ Status:     │   │ Status: PENDING_REVIEW   │
 │ CLEAR       │   │ High Risk Banner Active  │
 └─────────────┘   └────────────┬─────────────┘
                                │ Clinician Accesses Record
                                ▼
                   ┌──────────────────────────┐
                   │ Status: UNDER_REVIEW     │
                   └────────────┬─────────────┘
                                │ Action Taken
                    ┌───────────┴───────────┐
                    ▼                       ▼
      ┌───────────────────────────┐   ┌───────────────────────────┐
      │ ACTIONED_SAFETY_PLAN      │   │ ESCALATED_EMERGENCY       │
      └─────────────┬─────────────┘   └─────────────┬─────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
                       ┌──────────────────────────┐
                       │ Status: RESOLVED         │
                       │ Audit Log Signed & Stored│
                       └──────────────────────────┘
```

### 2.3 Review Status Workflow Definitions
* **`CLEAR`**: Baseline state; no safety-sensitive responses.
* **`PENDING_REVIEW`**: Active risk detected; immediate WebSockets/SMS/Email notifications dispatched to care team; persistent red header banner on patient chart.
* **`UNDER_REVIEW`**: Credentialed provider opened the flagged submission; system logs Provider ID and timestamp.
* **`ACTIONED_SAFETY_PLAN`**: Brief Suicide Safety Assessment (BSSA) and outpatient safety plan completed.
* **`ESCALATED_EMERGENCY`**: Acute crisis protocol activated (mobile crisis team, emergency transfer).
* **`RESOLVED`**: Workflow formally closed with mandatory clinical rationale logged in audit trail.

---

## 3. Database Architecture & API Validation

### 3.1 PostgreSQL Schema (`assessment_templates` & `assessment_responses`)

```sql
-- 1. Immutable Assessment Templates Table
CREATE TABLE assessment_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL,
    version VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    structure JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_template_code_version UNIQUE (code, version)
);

-- 2. Patient Assessment Responses Table
CREATE TABLE assessment_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES assessment_templates(id),
    patient_id UUID NOT NULL,
    encounter_id UUID,
    administered_by UUID NOT NULL,
    administration_mode VARCHAR(20) NOT NULL CHECK (administration_mode IN ('SELF_REPORT', 'CLINICIAN_ENTERED', 'PROXY')),
    answers JSONB NOT NULL,
    raw_score NUMERIC(5,2),
    scaled_score NUMERIC(5,2),
    subscale_scores JSONB DEFAULT '{}'::jsonb,
    severity_band VARCHAR(50),
    diagnostic_criteria_results JSONB DEFAULT '{}'::jsonb,
    safety_flag_raised BOOLEAN NOT NULL DEFAULT false,
    risk_level VARCHAR(20) NOT NULL DEFAULT 'NONE' CHECK (risk_level IN ('NONE', 'LOW', 'MODERATE', 'HIGH')),
    review_status VARCHAR(30) NOT NULL DEFAULT 'CLEAR' CHECK (review_status IN ('CLEAR', 'PENDING_REVIEW', 'UNDER_REVIEW', 'ACTIONED_SAFETY_PLAN', 'ESCALATED_EMERGENCY', 'RESOLVED')),
    is_valid BOOLEAN NOT NULL DEFAULT true,
    invalidation_reason TEXT,
    completed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Performance & Safety Indexes
CREATE INDEX idx_assessment_responses_patient ON assessment_responses(patient_id);
CREATE INDEX idx_assessment_responses_safety ON assessment_responses(safety_flag_raised, review_status) WHERE safety_flag_raised = true;
CREATE INDEX idx_assessment_responses_template ON assessment_responses(template_id);
```

### 3.2 Zod Runtime API Validation Schemas

```typescript
import { z } from 'zod';

export const AdministrationModeEnum = z.enum(['SELF_REPORT', 'CLINICIAN_ENTERED', 'PROXY']);

// PHQ-9 Zod Validation Schema
export const PHQ9SubmissionSchema = z.object({
  template_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  encounter_id: z.string().uuid().optional(),
  administered_by: z.string().uuid(),
  administration_mode: AdministrationModeEnum,
  completed_at: z.string().datetime(),
  answers: z.object({
    phq9_1: z.number().int().min(0).max(3).optional(),
    phq9_2: z.number().int().min(0).max(3).optional(),
    phq9_3: z.number().int().min(0).max(3).optional(),
    phq9_4: z.number().int().min(0).max(3).optional(),
    phq9_5: z.number().int().min(0).max(3).optional(),
    phq9_6: z.number().int().min(0).max(3).optional(),
    phq9_7: z.number().int().min(0).max(3).optional(),
    phq9_8: z.number().int().min(0).max(3).optional(),
    phq9_9: z.number().int().min(0).max(3).optional(),
  }).refine((data) => {
    const answeredCount = Object.values(data).filter(val => val !== undefined).length;
    return answeredCount >= 8;
  }, { message: "Invalid PHQ-9 submission: Maximum 1 missing item permitted." })
});

// C-SSRS Zod Validation Schema
export const CSSRSSubmissionSchema = z.object({
  template_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  administered_by: z.string().uuid(),
  administration_mode: AdministrationModeEnum,
  completed_at: z.string().datetime(),
  answers: z.object({
    cssrs_1: z.number().int().min(0).max(1),
    cssrs_2: z.number().int().min(0).max(1),
    cssrs_3: z.number().int().min(0).max(1).optional(),
    cssrs_4: z.number().int().min(0).max(1).optional(),
    cssrs_5: z.number().int().min(0).max(1).optional(),
    cssrs_6: z.number().int().min(0).max(1),
  }).refine((data) => {
    if (data.cssrs_2 === 1) {
      return data.cssrs_3 !== undefined && data.cssrs_4 !== undefined && data.cssrs_5 !== undefined;
    }
    return true;
  }, { message: "Invalid C-SSRS logic: Active suicidal ideation (Q2=1) requires items 3, 4, and 5." })
});
```

---

## 4. Incomplete Questionnaire Handling Matrix

| Instrument | Max Missing Items Allowed | Imputation Method | Invalidation Condition |
| :--- | :--- | :--- | :--- |
| **PHQ-9** | 1 Item | Mean of 8 answered items imputed for missing item; total rounded to integer. | $\ge 2$ missing items. System sets `is_valid = FALSE`. |
| **GAD-7** | 1 Item | Mean of 6 answered items imputed for missing item; total rounded to integer. | $\ge 2$ missing items. System sets `is_valid = FALSE`. |
| **C-SSRS** | 0 Items | None. Mandatory branching enforced via Zod schema. | Any skipped required item invalidates submission. |
| **PCL-5** | 4 Items overall (max 1 per cluster) | Cluster-specific mean imputation substituted for missing item. | $> 4$ missing items overall OR $> 1$ missing item in any single cluster. |
| **WHODAS 2.0 (12-item)** | 1 Item | Mean of 11 answered items imputed for missing item. | $\ge 2$ missing items. System sets `is_valid = FALSE`. |

---

## 5. Phase 1 Execution & Verification Plan

### Step 1: Immediate Starting Point (PHQ-9 End-to-End Test)
* Test questionnaire submission from patient delivery mode (WhatsApp link / tablet / portal).
* Verify Zod validation gateway catches invalid payloads and missing items.
* Verify deterministic score calculation, severity band mapping, and PHQ-9 Item 9 safety trigger.
* Verify record insertion in PostgreSQL `assessment_responses` with JSONB answer payload.

### Step 2: Core P1 Instruments Integration
* Integrate GAD-7, C-SSRS, PCL-5, and WHODAS 2.0 templates.
* Validate subscale score generation for PCL-5 (Clusters B, C, D, E) and provisional diagnostic rules.
* Validate metric score conversion for WHODAS 2.0.

### Step 3: Safety Triage & Audit Trail Deployment
* Deploy WebSockets real-time safety alert banner on clinician workspace.
* Verify provider state transitions (`PENDING_REVIEW` $\rightarrow$ `UNDER_REVIEW` $\rightarrow$ `RESOLVED`).
* Validate immutable audit log creation in PostgreSQL for all risk state updates.
