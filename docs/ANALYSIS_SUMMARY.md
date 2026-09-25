# MedBook AI — Codebase Analysis Summary Report

**Date:** 2026-09-03
**Scope:** Three-module build — Patients EMR, Billing, AI Agent — plus the broader SaaS foundation
**Reference:** `docs/IMPLEMENTATION_PLAN.md`
**Output:** `Implementation_Plan.md` (root) generated from this analysis

---

## 1. Project Overview

MedBook AI is a **multi-tenant healthcare SaaS** (Next.js 15 / App Router, React 19, TypeScript strict, Tailwind + Radix, Supabase). It delivers clinic management, an AI booking receptionist, a no-code clinic website builder, and a patient billing/EMR system. Tenant isolation is enforced by Row-Level Security in the database, not by the app.

The current workstream is the **Patients / Billing / AI-Agent module layer** built on top of an already-shipping 12-phase foundation.

---

## 2. What Was Analyzed

- **Routes** (`app/`): `(auth)`, `(app)` dashboard, patients workspace, patient-billing, ai-settings, consultations, appointments, queue, settings/team, website, widget, API routes.
- **Components** (`components/`): patients workspace + record tabs, patient-billing, AI settings, queue, consultation, clinics, and UI primitives.
- **Backend / DB** (`lib/`, `supabase/migrations/`): 30 migrations (`0001`–`0030`), server actions, queries, AI provider/orchestrator, notification layer, WhatsApp adapter.
- **Types** (`types/database.ts`): every table and the `patient_directory` view.

---

## 3. Module Status Summary

| Module | Phase Range | Status | Completion |
|---|---|---|---|
| Patients EMR (migration → split-pane → tabs → documents → AI summary) | 1–5 | **Completed** | 100% |
| Billing — transactions table | 6 | **In Progress** | ~40% (backend done, UI pending) |
| Billing — modals | 7 | **Not Started** | 0% |
| AI Agent (provider/key management) | 8 | **Not Started** | ~20% (schema only) |

**Overall module completion: 63%** — active phase is **Phase 6**.

---

## 4. Fully Implemented Features (verified in source)

### Patients EMR (Phases 1–5)
- **Migration `0029`** — additive, idempotent:
  - `patient_directory` view extended (`gender`, `age`, `city`, allergies, blood group, `patient_code`, `visit_count`, `last_visit_at`) via **second `LEFT JOIN LATERAL`** preserving `security_invoker = true` (prevents zero-visit patients disappearing).
  - `patient_bills`: `bill_number`, `bill_type`, `bill_date`, `doctor_id`; status enum `+waived`, `+cancelled`; `patient_payments.payment_reference`.
  - `patients`: `patient_code` (UHID), `blood_group`, `whatsapp_number`, `registered_branch`, AI-summary cache columns.
  - New `patient_documents` table (composite same-clinic FK, RLS).
  - New **private** bucket `patient-documents` (`public: false`).
  - `clinic_ai_settings` LLM columns + `clinic_ai_secrets` (RLS, no client-read).
  - D8/PKR sweep (`lib/utils/currency.ts`, `IndianRupee` removed).
- **Split-pane shell** — `patients-workspace.tsx`, `patient-list-pane.tsx`: KPI strip, scope tabs, segment pills (keyed on `visit_count`), debounced server-side search, mobile single-pane.
- **Detail tabs** — `patient-record.tsx` + `record/`: visit-history, health-info, vitals, prescriptions, appointments, basic-health-info, ai-summary-card, documents-widget.
- **Documents** — private-bucket upload, **magic-byte MIME sniffing** (not `File.type`), signed-URL reads (60 s via caller's client, never service role), metadata-first delete order, `file_path` never reaches browser.
- **AI Patient Summary** — de-identified payload (only age/DOB/gender/blood type/allergies/conditions), `visit_count` cache key, generation rate-limited, gated on `PATIENT_AI_SUMMARY_ENABLED` (off by default); `AIProvider.complete()` added.

### Billing backend (Phase 6 prerequisites)
- Migration `0030`: `visits` unique `(clinic_id, id)`, `patient_bills` composite FKs to `patients` + `visits`, `app_event_logs` category `+billing`.
- `fetchPatientBills` → `PatientBillListRow` (patients/items/payments/receipts/visits/doctors embeds + `truncated`); omni-search already matches `bill_number`.
- `waivePatientBillAction` / `cancelPatientBillAction`: owner/admin-gated, advisory-locked write, `app_event_logs` billing audit row.

### Foundation (built & shipping)
Auth (full), multi-tenant RLS, clinic onboarding, appointments, queue/check-in/vitals, consultation + prescriptions, AI receptionist + WhatsApp, no-code websites, platform billing, analytics + team management, observability, WhatsApp connection.

---

## 5. Partially Implemented Features

| File | Current State | What's Missing |
|---|---|---|
| `components/patient-billing/billing-dashboard.tsx` | Card list | 8-column datatable, Dashboard/Analytics tabs, Today/All/Pending pills + count badge, Refresh, responsive fallback |
| `components/ai/ai-settings-form.tsx` (732 lines) | Has name/tone/tier/greeting/WhatsApp/FAQs/save | Visual tone/tier cards, LLM model/provider selector, BYO-API-key UI, verification handshake, green badge, console link |
| `components/patient-billing/billing-sheet.tsx` | Legacy single/2-col | New 2-column spec, doctor/token/slot from `visit_id→appointments→doctors` |
| `components/patient-billing/collect-payment-modal.tsx` | Legacy single-col | 3-column layout, 2×3 payment grid, additional-charge/discount accordions; RPC not extended |
| `components/patient-billing/new-bill-modal.tsx` | Basic phone search + items | Exact phone lookup, bill type capsules, optional doctor, floating summary, inline "Add patient" |

---

## 6. Not Started / Remaining

- **Phase 6:** `bills-table.tsx`, `bill-row-actions.tsx` (Eye/Printer/3-dots → waive/cancel + confirm dialogs).
- **Phase 7:** `bill-details-modal.tsx`, 3-column collect-payment, `00XX_collect_payment_adjustments.sql` RPC extension, new-bill enhancements.
- **Phase 8:** provider/model selector (Gemini enabled; OpenAI/Anthropic "Coming soon"), BYO-key handshake into `clinic_ai_secrets`, `lib/ai/gemini-provider.ts` per-clinic key/model, `ai-settings` server action persistence, "AI Agent" sidebar label, greeting wiring.
- **Un-specced (see `docs/IMPLEMENTATION_PLAN.md` §5.6):** Billing Analytics content, Growth Agent / Engagement / Integrations / Help sidebar items, UHID `CLI-` prefix scheme (D7), `doctors.speciality` confirmation, age-vs-DOB derivation.

---

## 7. Architecture & Security Notes

- **RLS-first isolation**: all tenant tables scope by `clinic_id` via `is_clinic_member`; verified cross-clinic impossible.
- **Composite FKs** (`clinic_id, x`) everywhere, incl. `sidebar` of `patient_bills` → same-clinic guarantee; explicit `!constraint_name` PostgREST hints (four FKs on `patient_bills`).
- **PHI discipline**: AI summary payload de-identified; `file_path` never a prop; keys never enter browser; secrets table has no client-read policy.
- **Concurrency**: `bill_number` generated under per-clinic advisory lock; collect/waive re-guard on permitted statuses.
- **Timezone**: all "today"/month KPI windows resolved in clinic timezone, not UTC.

---

## 8. Recommended Next Action

Build **`components/patient-billing/bills-table.tsx`** — a client-side datatable consuming the existing `PatientBillListRow[]` from `fetchPatientBills`, rendered by `app/app/patient-billing/page.tsx`, with the full 8-column set, filter pills, count badge, refresh, and omni search. The entire backend for Phase 6 already exists, so this is a front-end build against known-good queries and actions, verifiable with `npm run lint` + `npx tsc --noEmit`. Follow with `bill-row-actions.tsx` wiring the existing waive/cancel actions + confirm dialogs + audit trail.

---

*Full task-level breakdown with checkboxes: see `Implementation_Plan.md` (root).*
