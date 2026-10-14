# Phase 1 — Clinical Sign-off Checklist

**Feature:** Deterministic psychometric scoring + clinical safety triage (MedBook AI Psychology EHR)
**Migration:** `supabase/migrations/0087_assessment_scoring_safety.sql`
**Engine:** `lib/scoring/` · **Safety pipeline:** `lib/scoring/safety.ts`
**Status:** ⛔ **NOT APPROVED FOR CLINICAL USE** — every item below is implemented to the specification's defaults and requires review by a credentialed clinician.
**Requested reviewer:** Psychiatrist and/or licensed Clinical Psychologist acting for the clinic.

---

## 1. Purpose

Phase 1 scores five validated instruments with a deterministic engine ("no LLM math") and raises clinical safety alerts. The algorithms were implemented from `docs/medbook-ai-phase1-specification.md`. Where the published instrument and the specification diverge — or where the specification simplifies a published algorithm — the code is marked `CLINICAL-VALIDATION-REQUIRED` and listed here.

**No item in this document should be treated as clinically validated until a reviewer signs it.**

---

## 2. How to complete this checklist

For each row in the tables below, choose one:

- **☐ Approve** — implement as-is.
- **☐ Change** — write the required change in the *Decision / notes* column.

Then complete the **Sign-off** block (§8). A developer will apply any requested changes and re-version the affected instrument (`version` field, currently `1.0.0`).

**Legend:** ✅ = matches published instrument · ⚠️ = simplified or deviates from published instrument · 🔴 = safety-critical.

---

## 3. Scoring, imputation & validity (per instrument)

### 3.1 PHQ-9 — Depression
Files: `lib/scoring/instruments/phq9.ts`
Source: spec §1.1. 9 items, 0–3 Likert, sum 0–27.

| ID | Rule as implemented | Type | Decision / notes |
|----|----------------------|------|------------------|
| PHQ-01 | Missing items: mean-impute **exactly 1** missing item (mean of answered items). | ⚠️ | ☐ Approve ☐ Change |
| PHQ-02 | Item 9 (self-harm) is **never imputed** — if unanswered the whole score is marked invalid rather than inventing a value. | 🔴 ⚠️ | ☐ Approve ☐ Change |
| PHQ-03 | Severity bands: 0–4 Minimal · 5–9 Mild · 10–14 Moderate · 15–19 Moderately severe · 20–27 Severe. | ✅ | ☐ Approve ☐ Change |
| PHQ-04 | Safety trigger: item 9 ≥ 1 → **MODERATE**. | 🔴 | ☐ Approve ☐ Change |
| PHQ-05 | Safety trigger: item 9 ≥ 2 → **HIGH**. | 🔴 | ☐ Approve ☐ Change |

### 3.2 GAD-7 — Generalised Anxiety
Files: `lib/scoring/instruments/gad7.ts`
Source: spec §1.2. 7 items, 0–3 Likert, sum 0–21.

| ID | Rule as implemented | Type | Decision / notes |
|----|----------------------|------|------------------|
| GAD-01 | Missing items: mean-impute **exactly 1** missing item. (The spec's `round(7/6 × Σ)` proration is mathematically the same as single mean imputation.) | ⚠️ | ☐ Approve ☐ Change |
| GAD-02 | Severity bands: 0–4 Minimal · 5–9 Mild · 10–14 Moderate · 15–21 Severe. | ✅ | ☐ Approve ☐ Change |
| GAD-03 | No safety/suicide item (matches instrument). | ✅ | ☐ Approve ☐ Change |

### 3.3 C-SSRS — Columbia-Suicide Severity Rating Scale (Screen)
Files: `lib/scoring/instruments/cssrs.ts`
Source: spec §1.3. 6 binary (Yes/No) items.

| ID | Rule as implemented | Type | Decision / notes |
|----|----------------------|------|------------------|
| CSS-01 | Items: Q1 wish to be dead · Q2 non-specific active ideation · Q3 active ideation, any methods, no intent · Q4 active ideation, some intent, no plan · Q5 active ideation with plan and intent · Q6 suicidal behaviour history. | ⚠️ | ☐ Approve ☐ Change |
| CSS-02 | Branching: Q3–Q5 asked **only when Q2 = Yes**; otherwise *not applicable* (not "missing"). Q1, Q2, Q6 always asked. | ⚠️ | ☐ Approve ☐ Change |
| CSS-03 | No imputation: any unanswered applicable item → score invalid. | 🔴 | ☐ Approve ☐ Change |
| CSS-04 | Triage matrix: Q1 or Q2 only → **LOW** · Q3 → **MODERATE** · Q4, Q5 or Q6 → **HIGH**. | 🔴 ⚠️ | ☐ Approve ☐ Change |
| CSS-05 | Q6 window: item conflates **past 3 months / lifetime** (published C-SSRS separates past-month vs lifetime behaviour windows). | ⚠️ | ☐ Approve ☐ Change |
| CSS-06 | This is the spec's **6-item simplified screener**, not the full published C-SSRS triage (5 ideation levels + 4 behaviour categories). | ⚠️ | ☐ Approve ☐ Change |

### 3.4 PCL-5 — PTSD Checklist for DSM-5
Files: `lib/scoring/instruments/pcl5.ts`
Source: spec §1.4. 20 items, 0–4 Likert, sum 0–80.

| ID | Rule as implemented | Type | Decision / notes |
|----|----------------------|------|------------------|
| PCL-01 | Provisional cutoff: **0–30** "Below clinical threshold" · **31–80** "Probable PTSD". (Pre-existing 3-band UI table has been aligned to this.) | ⚠️ | ☐ Approve ☐ Change |
| PCL-02 | Missing items: **cluster-specific mean imputation**, ≤ 1 missing per cluster and ≤ 4 missing overall. | ⚠️ | ☐ Approve ☐ Change |
| PCL-03 | Clusters: B intrusion (items 1–5) · C avoidance (6–7) · D negative cognition/mood (8–14) · E arousal/reactivity (15–20). | ✅ | ☐ Approve ☐ Change |
| PCL-04 | DSM-5 provisional criterion (diagnostic flag): ≥1 B item, ≥1 C item, ≥2 D items and ≥2 E items each endorsed at **≥ 2**. | ⚠️ | ☐ Approve ☐ Change |

### 3.5 WHODAS 2.0 — WHO Disability Assessment Schedule (12-item)
Files: `lib/scoring/instruments/whodas12.ts`
Source: spec §1.5. 12 items, 0–4 Likert, raw sum 0–48, scaled metric 0–100.

| ID | Rule as implemented | Type | Decision / notes |
|----|----------------------|------|------------------|
| WHO-01 | "Simple scoring": raw = sum of 12 items; scaled = `round(raw / 48 × 100, 1 dp)`. The official WHODAS 2.0 uses a **complex weighted algorithm** (and day-recoding in the 36-item form) that is **not** applied. | ⚠️ | ☐ Approve ☐ Change |
| WHO-02 | Missing items: mean-impute **exactly 1** missing item. | ⚠️ | ☐ Approve ☐ Change |
| WHO-03 | Domains (2 items each): cognition · mobility · self-care · getting along · life activities · participation. | ✅ | ☐ Approve ☐ Change |
| WHO-04 | Severity bands: 0–4 little/no · 5–9 mild · 10–19 moderate · 20–29 severe · 30–48 extreme disability. Bands are **unverified** against WHO reference tables. | ⚠️ | ☐ Approve ☐ Change |

---

## 4. Cross-cutting data-handling rules

| ID | Rule as implemented | Type | Decision / notes |
|----|----------------------|------|------------------|
| X-01 | Partial submissions are **persisted** (patient drafts / incomplete) and flagged `is_valid = false`, rather than rejected. Invalid records carry no numeric score but **still run safety evaluation** on whatever was answered. | 🔴 | ☐ Approve ☐ Change |
| X-02 | Safety evaluation runs on raw answers **regardless of score validity** — a partially completed form can still reveal risk. | 🔴 | ☐ Approve ☐ Change |
| X-03 | Each response snapshots the instrument's exact structure + version (`template_snapshot`) so any score can be re-audited after the definition changes. | — | ☐ Approve ☐ Change |
| X-04 | Administration mode is recorded: `SELF_REPORT` · `CLINICIAN_ENTERED` · `PROXY` (backfilled from existing `completed_by`). | — | ☐ Approve ☐ Change |

---

## 5. Safety alert pipeline & triage lifecycle

Source: spec §2. Files: `lib/scoring/safety.ts`, `lib/actions/patient-links.ts`, `lib/actions/specialty-workspaces.ts`.

| ID | Rule as implemented | Type | Decision / notes |
|----|----------------------|------|------------------|
| SAF-01 | A flag is raised when the instrument risk level is **MODERATE or HIGH**. | 🔴 | ☐ Approve ☐ Change |
| SAF-02 | On flag: raise (never lower) the patient's `psych_safety.risk_level` to **high** (for HIGH) or **moderate** (for MODERATE), and append the reason to `risk_factors`. | 🔴 | ☐ Approve ☐ Change |
| SAF-03 | Alert recipients = clinic members with role **owner, clinic_admin, doctor, admin**. Delivery is by **email only** (no SMS/realtime/WhatsApp). | 🔴 | ☐ Approve ☐ Change |
| SAF-04 | Every flag writes an immutable `assessment_safety_events` row and an append-only `audit_logs` entry. Non-flagged scores write a `CLEAR` event. | — | ☐ Approve ☐ Change |
| SAF-05 | Triage state machine: `CLEAR → PENDING_REVIEW → UNDER_REVIEW → ACTIONED_SAFETY_PLAN / ESCALATED_EMERGENCY → RESOLVED`. `CLEAR` is system-only. | 🔴 | ☐ Approve ☐ Change |
| SAF-06 | Any provider with clinical-record permission can action a flag (no separate credentialed-provider gate). **Is that acceptable, or should escalation require a specific role?** | 🔴 | ☐ Approve ☐ Change |
| SAF-07 | There is **no automatic lifecycle timeout** — a `PENDING_REVIEW` flag stays visible until a provider acts. | 🔴 | ☐ Approve ☐ Change |
| SAF-08 | Alert email links the provider to the patient record; **no** clinical detail beyond instrument name, risk level and reason is emailed. | — | ☐ Approve ☐ Change |
| SAF-09 | All side effects are **best-effort / non-throwing**: a failed email or audit write never loses the triggering assessment. | — | ☐ Approve ☐ Change |

---

## 6. Clinical wording / patient-facing copy

| ID | Item | Decision / notes |
|----|------|------------------|
| TXT-01 | Severity labels shown to patients (e.g. "Probable PTSD", "High Risk", "Extreme disability") — approve wording, or provide preferred phrasing. | ☐ Approve ☐ Change |
| TXT-02 | Reviewer confirms no patient-facing text reads as a diagnosis without clinician involvement. | ☐ Approve ☐ Change |

---

## 7. Scope notes (for awareness — no action required unless disagreement)

- Phase 1 is **psychology-only**; the GP workspace does not yet surface these instruments.
- Scores are **decision-support only** and never presented as a diagnosis.
- `version` is `1.0.0` for all five instruments; any change from this review bumps the version.

---

## 8. Sign-off

By signing below, the reviewer confirms each row marked **☐ Approve** is clinically acceptable to use in the clinic, and that any **☐ Change** rows have written instructions for the developers.

| Field | Entry |
|-------|-------|
| Reviewer name | |
| Credentials / registration no. | |
| Role (Psychiatrist / Clinical Psychologist / other) | |
| Clinic | |
| Date | |
| Items approved as-is | |
| Items requiring change (list IDs) | |
| Overall decision | ☐ Approved ☐ Approved with changes ☐ Not approved |
| Signature | |

**Developer follow-up owner:** ______________________  **Target version:** ________

---

## Appendix — Source of record

- Specification: `docs/medbook-ai-phase1-specification.md`
- Assessment library guide: `docs/Assessment_Library_Guide.md`
- Implementation status: `docs/Psychology_EHR_Assessment_Status_Report.md`
- Engine: `lib/scoring/instruments/{phq9,gad7,cssrs,pcl5,whodas12}.ts`, `lib/scoring/registry.ts`
- Safety: `lib/scoring/safety.ts`, `lib/scoring/labels.ts`
- Migration + tests: `supabase/migrations/0087_assessment_scoring_safety.sql`, `supabase/tests/assessment_scoring_safety_test.sql`
- Automated golden cases: `scripts/scoring-golden.mts` (`npm run test:scoring`)
