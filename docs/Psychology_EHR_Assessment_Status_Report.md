# MedBook AI — Psychology EHR & Assessment Module: Repository Status Report

_Generated from current repository state (branch HEAD `a3b1de8`). Scope: what already exists ahead of Phase 1 Core Validated Instruments (PHQ-9, GAD-7, C-SSRS, PCL-5, WHODAS 2.0), the deterministic scoring engine, and clinical safety alert pipelines._

---

## 1. Database & Migrations

Migrations live in `supabase/migrations/` (numbering `0001`–`0086`, applied by hand, all re-runnable). The psychology/assessment stack is in **0077–0086**.

### Existing tables

| Table | Migration | Purpose |
|---|---|---|
| `psych_safety` | 0077, widened 0079 | One row per patient. `risk_level` (low/moderate/high/crisis), `risk_factors`, `current_concerns`, `updated_at`. |
| `psych_intake` | 0077 | Intake & history: presenting concern, previous diagnosis/therapy, family history, stressors, substance use, structured provenance. |
| `psych_mse` | 0077 | Mental Status Exam; `risk_thoughts` legacy field + structured findings (0082). |
| `psych_sessions` | 0077, widened 0079 | Session notes; `session_type` (initial/individual/follow_up/crisis/group), DAP/BIRP format. |
| `psych_assessments` | 0077, 0079, 0080, 0085, 0086 | **Assessment records.** `assessment_type`, `score`, `severity`, `conducted_at`, `notes`; later `answers` JSONB (item-level), `completed_by` (patient_online/reception/psychologist), `source_link_id`, `template_id`. |
| `psych_care_plans` | 0077 | Therapy goals, intervention plan, homework, follow-up frequency, psychiatrist referral. |
| `patient_share_links` | 0080, 0085 | Generic tokenised patient-completable links (`kind`, `status`, `template_id`). |
| `clinic_assessment_categories` | 0085 | Clinic-scoped category buckets (migration 0085). |
| `assessment_templates` | 0085 | **Assessment templates**: `questions`/`scoring`/`interpretation` JSONB, `target_specialty`, `status` (draft/active). |
| `patient_alerts` | 0051 | AI-OCR-staged allergies/known conditions with approval workflow (`active_pending`/`approved`/`dismissed`). **Not yet a clinical risk-alert pipeline.** |

### Key constraints / gaps relevant to Phase 1

- `psych_assessments.assessment_type` was a 9-literal CHECK (0079) → widened to free text ≤120 chars (0086). No dedicated instrument registry columns (no `instrument_key`, `is_validated`, per-item scoring metadata).
- `psych_assessments.score` bounded `0–150`. Rules out raw scoring shapes above that without a change.
- `psych_assessments.answers` is `Record<string, number>` — **no room for C-SSRS categorical/ordinal branching** (yes/no + ideation intensity levels) or WHODAS item text today.
- **No** migrations exist for: a deterministic scoring engine, scoring runs/audit, instrument definitions/seeding, or safety-alert/risk-escalation tables. `patient_alerts` is allergy/condition OCR staging only.
- **No `C-SSRS` or `WHODAS` references anywhere** in the repo (grep returned zero matches).

---

## 2. Settings & Assessment Builder

Route: `app/app/settings/assessment-library/page.tsx`. Components in `components/settings/`:

- `assessment-library-manager.tsx` — list/CRUD of clinic templates, categories, status.
- `assessment-builder-dialog.tsx` — template builder.
- `assessment-category-dialog.tsx` — category CRUD.
- `assessment-import-dialog.tsx` — import a standard instrument from the catalog.
- `assessment-template-view-dialog.tsx` — read-only template peek (meta, questions, scoring bands, interpretation rules).
- `assessment-guide-dialog.tsx` — step-by-step guide (5 steps: meta → questions → scoring → bands → AI interpretation).

Capabilities (`lib/assessment-library.ts`):

- **Question types:** `single`, `multiple`, `text`, `scale`.
- **Scoring methods:** `sum`, `average`; `min_score`/`max_score`; `bands[] {min,max,label}`.
- **Interpretation rules:** `interpretation[] {min,max,text}`.

**Catalog** (`ASSESSMENT_CATALOG`, code-side, copied into clinic DB on import):

| Key | Full question bank? | Online-capable | Scoring bands |
|---|---|---|---|
| **PHQ-9** | Yes (9 items) | Yes | 5 bands, 0–27 |
| **GAD-7** | Yes (7 items) | Yes | 4 bands, 0–21 |
| **BDI-II** | Yes (21 items) | Yes | 4 bands, 0–63 |
| **PCL-5** | Yes (20 items) | Yes | 3 bands, 0–80 |
| BAI / OCI-R / AUDIT / ASRS | No (scoring bands only) | No | bands only |

**Gaps:** no `C-SSRS` (safety/branching) or `WHODAS 2.0` catalog entries; no per-item scoring direction/weights (needed for WHODAS differential item functioning and reverse-scored items); no instrument versioning/provenance or validated-instrument registry.

Shared helpers exist: `severityFromBands`, `interpretationForScore`, `templateMaxScore`, `canSendOnline`, `scorableCount`, `scoreTemplateAnswers` (sum/average). Liquid scoring engine but not instrument-aware.

---

## 3. Psychologist Workspace

Gated by specialty routing (0077, `lib/specialty-workspaces.ts`). Entry point: `components/patients/record/workspaces/psych-workspace.tsx`.

**Tabs** (`PSYCH_TABS`, `lib/specialty-workspaces.ts:34`):

| Tab ID | Label | Component |
|---|---|---|
| `psy_overview` | Overview & Safety | inline `OverviewSafetyTab` (in `psych-workspace.tsx`) |
| `psy_intake` | Intake & History | `psych-intake-tab.tsx` + `psych-intake-suggestions-card.tsx` |
| `psy_mse` | Mental Status Exam | `psych-mse-tab.tsx` |
| `psy_sessions` | Session Notes | `psych-sessions-tab.tsx` |
| `psy_psychometrics` | Psychometrics | inline `PsychometricsTab` |
| `psy_documents` | Documents | shared `documents-tab.tsx` |
| `psy_care_plan` | Care Plan | inline `CarePlanTab` |

Features present:
- **Overview & Safety:** AI summary card, `SafetySnapshotCard` (risk level + factors, derived from `psych_safety` else inferred from MSE risk thoughts / PHQ-9 item 9 / BDI-II item 9), current concerns, clinical context, latest assessment scores, clinical timeline, documents, care-plan snapshot.
- **Psychometrics:** log a built-in instrument **by total score** (with severity autofill from bands), or a library template; score-history trend rows with per-item "View responses"; per-assessment **AI-guided interpretation** action; delete; `PatientLinksPanel` to send an online assessment link.
- **Copilot drawer** (`mode="psychology"`) and session recorder mounted at workspace level.

**Gaps:** no patient-facing validated instrument runner inside the workspace beyond share links; no branching/conditional items; no auto-administered C-SSRS; no cross-instrument composite/severity dashboard.

---

## 4. Scoring / Logic

There **is** basic scoring, but no deterministic, instrument-aware engine.

- `lib/psychometrics.ts` — built-in bank for **PHQ-9, GAD-7, BDI-II, PCL-5** only. `scoreInstrument()` = plain sum; `severityFor()` = band lookup. No C-SSRS/WHODAS, no item direction/weights, no subscales.
- `lib/assessment-library.ts` — `scoreTemplateAnswers()` (sum/average over numeric items), `severityFromBands()`, `interpretationForScore()`. Generic but not validated-instrument-aware.
- `components/patients/record/workspaces/psych-workspace.tsx` — the workspace logs **a clinician-entered total score**; the internal `ASSESSMENT_LIBRARY` (lines 909–991) mirrors the same 8 instruments + bands. PHQ-9 item 9 is used only as a *risk signal* in the Overview, not as a scored item engine.
- `lib/actions/specialty-workspaces.ts` — `savePsychAssessmentAction` (Zod: score 0–150, free severity), `generateAssessmentInterpretationAction` (LLM interpretation seeded by clinician rules + item answers).
- `components/assessment/assessment-form.tsx` + `app/(patient-forms)/assessment/[token]/page.tsx` — public patient form; scores via `severityFromBands` from template bands.

**Gaps:** no deterministic scoring engine (weights, reverse-scoring, subscales, cut-offs, flag rules); no C-SSRS classifier (ideation → behavior → lethality); no WHODAS domain scoring/algorithm; no scoring audit trail; LLM interpretation is present but **rule-based severity only**, not validated clinical logic.

### Safety / alert pipelines

- Overview derives a **risk snapshot** but it is **read-only and inferred** (see `buildSafetySnapshot`, `psych-workspace.tsx:515`). It does not create alerts.
- `patient_alerts` (0051) is **AI-OCR allergy/condition staging**, unrelated to psychometric risk.
- **No** alert/escalation tables, no notification fan-out on high-risk scores, no GP↔Psychologist handoff triggers, no audit of safety decisions.

---

## Summary Against Phase 1 Goals

| Phase 1 need | Current state |
|---|---|
| PHQ-9 | Present (bank + bands + online form + interpretation) |
| GAD-7 | Present |
| PCL-5 | Present (bands differ slightly: `Minimal/Subthreshold/Probable PTSD` vs catalog `Below threshold/Threshold/Probable PTSD`) |
| **C-SSRS** | **Absent** (no branching items, no classifier, no catalog entry, no schema support) |
| **WHODAS 2.0** | **Absent** (no domain scoring, no catalog entry) |
| Deterministic scoring engine | **Partial** — sum/average only, no weights/reverse/subscales/cutoff flags |
| Clinical safety alert pipeline | **Absent** — inferred read-only snapshot + OCR alerts only; no escalation/notify/audit |

### Notable inconsistencies to resolve in Phase 1
- Duplicate instrument banks: `lib/psychometrics.ts` vs `ASSESSMENT_CATALOG` in `lib/assessment-library.ts` vs inline `ASSESSMENT_LIBRARY` in `psych-workspace.tsx`.
- PCL-5 band labels differ between `lib/psychometrics.ts` and `lib/assessment-library.ts`.
- `psych_assessments.answers` numeric-only shape can't hold C-SSRS/WHODAS responses.
- `assessment_templates.scoring` has no instrument/version/allowed-scoring provenance fields.
