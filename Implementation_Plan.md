# Project Implementation Plan & Status

## Executive Summary

- **Overall Completion:** 63%
- **Current Active Phase:** Phase 6
- **Last Updated:** 2026-09-03

This plan captures the three-module build (Patients EMR, Billing, AI Agent) that is the current workstream, derived from `docs/IMPLEMENTATION_PLAN.md` and re-verified line-by-line against the live source tree on 2026-09-03. Phases 1–5 are fully implemented, verified (`npx tsc --noEmit` clean, `npm run lint` 0 errors, `npm run build` compiles) and merged. Phase 6 (Billing transactions table) is next. Phases 6–8 are not started beyond their migration prerequisites.

> The broader SaaS foundation (12-phase roadmap: auth, multi-tenant RLS, appointments, queue/vitals, consultation/prescriptions, AI receptionist, websites, platform billing, analytics/team, observability, WhatsApp) is already built and shipping (see `PHASE_9_NOTES.md`). This plan's phases 1–8 are the Patients/Billing/AI-Agent module layered on top of that foundation.

---

## Phase Breakdown

### Phase 1: Migration `0029` — Schema, View, Enums, Bucket, Backfills (Status: Completed)

> **Goal:** Add every data-model prerequisite for the Patients, Billing, and AI-Agent modules in one additive, idempotent migration.

- [x] Extend `patient_directory` view with `gender`, `age`, `city`, `known_allergies`, `medical_conditions`, `blood_group`, `patient_code`
  - [x] Add `visit_count` and `last_visit_at` via a second `LEFT JOIN LATERAL` (preserves `security_invoker = true` shape so zero-visit patients do not vanish — see `0006:56-66`)
  - [x] End with `notify pgrst, 'reload schema';` so PostgREST serves the new columns
- [x] Extend `patient_bills`: `bill_number`, `bill_type`, `bill_date`, `doctor_id`
  - [x] `patient_bill_status` enum gains `waived` and `cancelled` (split into its own statement)
  - [x] `patient_payments` gains `payment_reference`
  - [x] Deterministic `bill_number` backfill (`BILL-YYYYMMDD-NNN`, generated under per-clinic advisory lock) + `unique (clinic_id, bill_number)`
- [x] Extend `patients`: `patient_code` (UHID), `blood_group`, `whatsapp_number`, `registered_branch`, `ai_summary`, `ai_summary_generated_at`, `ai_summary_visit_count`
  - [x] New `patient_documents` table (composite `(clinic_id, patient_id)` FK, RLS `is_clinic_member`, index)
  - [x] New **private** storage bucket `patient-documents` (`public: false`)
- [x] Extend `clinic_ai_settings`: `llm_provider`, `llm_model`, `llm_key_verified`, `llm_key_verified_at`
  - [x] New `clinic_ai_secrets` table (per-clinic API key, RLS enabled, **no client-readable policy**)
- [x] Apply D8 / PKR decision sweep (`lib/utils/currency.ts`, `IndianRupee` icon removed from billing dashboard)
- [x] `types/database.ts` carries every new column and table
- [x] Manual verification queries at foot of `0029` (incl. `count(patient_directory) == count(patients)` zero-visit regression)

### Phase 2: Patients Split-Pane Shell (Status: Completed)

> **Goal:** Master–detail workspace where the left pane is a persistent directory and the right pane is the selected patient's record.

- [x] `app/app/patients/layout.tsx` — persistent master-list shell
- [x] `components/patients/patients-workspace.tsx` — split-pane container (left `[360px–33%]`, right `flex-1`)
- [x] `components/patients/patient-list-pane.tsx` — left pane
  - [x] KPI strip (Total / New This Month / Today) resolved in clinic timezone
  - [x] Scope tabs ("Today" / "All Patients") + segment pills ("All" / "Returning" / "First Visit") keyed off `visit_count`, not `appointment_count`
  - [x] Debounced (~300 ms) server-side search via `router.replace` inside `useTransition`
  - [x] Circular initial avatar, name, meta line (`F · 30 Aug 2026 · CLI-2026-00001`), active highlight, pagination
- [x] `app/app/patients/page.tsx` — right-pane empty state ("Select a patient")
- [x] `app/app/patients/[id]/page.tsx` — redirects to `/app/patients?id=` (deep links preserved)
- [x] Mobile single-pane behaviour (list or detail, never both-constrained)

### Phase 3: Patients Detail Tabs (Status: Completed)

> **Goal:** Right-pane clinical file viewer with a banner and per-domain sub-tabs.

- [x] `components/patients/patient-record.tsx` — banner + sub-tab chrome + right sidebar
- [x] `components/patients/record/record-banner.tsx` — initials, name, First Visit/Returning pill, meta grid, Edit button
- [x] Sub-tab components in `components/patients/record/`:
  - [x] `visit-history-tab.tsx` — timeline of visits + prescriptions, per-spec empty state
  - [x] `health-info-tab.tsx` — demographics display
  - [x] `vitals-tab.tsx` — vitals via `visits` (`record_vitals` RPC already exists)
  - [x] `prescriptions-tab.tsx` — reuses `components/consultation/prescription-preview.tsx`
  - [x] `appointments-tab.tsx` — reuses existing appointment-detail components
- [x] `basic-health-info.tsx` (right column): UHID, blood group, height/weight (latest vitals), allergies, current meds
- [x] `ai-summary-card.tsx` (display-only until Phase 5) + `documents-widget.tsx`
- [x] `lib/patient-record.ts` — visits/vitals/prescriptions fetched in one pass
- [x] Context actions ("Write Prescription", "Start Consultation") render **only** when an open `visits` row exists today

### Phase 4: Documents (Status: Completed)

> **Goal:** Per-patient document storage in a private bucket with server-side validation and signed-URL reads.

- [x] `lib/patient-documents-queries.ts` — clinic-scoped list queries
- [x] `lib/actions/patient-documents.ts` — upload + delete server actions
  - [x] MIME allowlist enforced by **sniffing file magic bytes**, not `File.type`
  - [x] Max size ~10 MB, upload path `{clinic_id}/{patient_id}/{uuid}-{filename}`
- [x] `app/api/patients/documents/[id]/route.ts` — 60-second signed URL → 302; uses caller's own client, never the service role
- [x] `components/patients/record/`: `documents-tab.tsx`, `document-uploader.tsx`, `document-row-actions.tsx`
  - [x] `PatientDocumentView` type omits `file_path` so it cannot reach the browser as a prop
  - [x] Delete order: metadata row first, then storage object (avoids dangling references)
- [x] RLS storage policies scoped by `clinic_id` path prefix (`0029`)
- [x] Verified post-crash: tsc + lint clean; `.rls-test.ps1` cross-clinic isolation harness

### Phase 5: AI Patient Summary (Status: Completed)

> **Goal:** Structured, cached patient summary generated by an LLM, shipped dark.

- [x] `lib/ai/patient-summary.ts` — de-identified digest builder + prompt + generation (does not overload `system-prompt.ts`)
- [x] `app/api/patients/[id]/ai-summary/route.ts` — POST: auth, `canManageClinical`, cache check, rate limit, persist
  - [x] Payload selects **only** `age, date_of_birth, gender, blood_group, known_allergies, medical_conditions` — name/phone/email/WhatsApp/city never read
  - [x] Cache key is `ai_summary_visit_count` (not a TTL); refresh control on `ai-summary-card.tsx`
  - [x] `visit_count == 0` renders literal empty-state string, **no LLM call**
- [x] `AIProvider.complete()` added to `lib/ai/types.ts` + `GeminiProvider` (shared primary/fallback quota helper)
- [x] Gated on `PATIENT_AI_SUMMARY_ENABLED` (off by default) — no clinical data leaves the server until flipped; documented in `.env.example` with full PHI warning
- [x] Rate limit on generation only (`PATIENT_AI_SUMMARY_RATE_LIMIT`, default 20/user/hour)
- [x] `tsconfig.json` excludes the `request/` reference snapshot from typechecking

### Phase 6: Billing Transactions Table (Status: In Progress)

> **Goal:** Replace the patient-billing card list with an 8-column datatable, filter pills, count badge, omni search, and row actions including destructive Waive/Cancel.

- [x] Migration `0030_billing_table_prerequisites.sql`:
  - [x] `visits` unique `(clinic_id, id)`
  - [x] `patient_bills` composite FKs to `patients` and `visits` (same-clinic guarantee)
  - [x] `app_event_logs.category` CHECK widened to accept `billing`
- [x] `lib/patient-billing-queries.ts` — `fetchPatientBills` returns `PatientBillListRow` (patients, items, payments, receipts, `visits`, `doctors` embeds) + `truncated` flag; omni search already matches `bill_number`
- [x] Backend actions `waivePatientBillAction` / `cancelPatientBillAction` (`lib/actions/patient-billing.ts`) — owner/admin-gated, advisory-locked write, `app_event_logs` billing audit row
- [x] Billing page gate (`app/app/patient-billing/page.tsx`) + PKR formatting
- [ ] Datatable component `components/patient-billing/bills-table.tsx` — currently `billing-dashboard.tsx` is still the **card list**
  - [ ] Columns PATIENT · SERVICE · BILL NO · TIME · AMOUNT · MODE · STATUS · ACTIONS
  - [ ] MODE `---` when pending; coloured dot + method label when paid
  - [ ] STATUS orange capsule Pending / green Paid / Waived / Cancelled
  - [ ] Sub-tabs "Dashboard" | "Analytics"
  - [ ] Filter pills "Today" | "All Bills" | "Pending" with grey count badge
  - [ ] Right-aligned "+ Add Bill", "All Status" dropdown, circular Refresh
  - [ ] Omni search "Search patient, phone, or bill number…"
  - [ ] Row actions: Eye (details) · Printer (receipt) · 3-dots (Collect payment · View details · Waive bill · Cancel bill) with confirm dialogs
  - [ ] Responsive: below `md`, fall back to card layout rather than horizontal-scrolling
- [ ] `components/patient-billing/bill-row-actions.tsx` — wire existing waive/cancel actions + confirm dialogs + audit trail
- [ ] Integration: render `BillsTable` from `PatientBillingPage`, thread `bills` + `truncated`, revalidate after mutations
- [ ] Verify: RLS cross-clinic isolation, waive/cancel status transitions, revenue exclusion for waived/cancelled

### Phase 7: Billing Modals (Status: Not Started)

> **Goal:** Redesign the three billing modals to the 2-column / 3-column specs, with atomic backend adjustments.

- [ ] `components/patient-billing/bill-details-modal.tsx` — 2-column redesign of `billing-sheet.tsx`
  - [ ] Header ribbon (dark blue, "Bill Details", `{bill_number} · {date}`, status capsule)
  - [ ] Left: patient info + "View Profile →"; Right: doctor, speciality, date, slot, time range, Token #
  - [ ] Line items table + Subtotal + bold Final Total; payment panel (method, reference, timestamp, Amount Paid green / Amount Due orange)
  - [ ] Footer: Close · Waive bill (red) · Collect payment (green)
  - [ ] Manual bills (`visit_id = null`) render "—" for doctor/token instead of crashing
  - [ ] Extend `fetchBillDetails` to include `visits`/`doctors`/`appointments`
- [ ] `components/patient-billing/collect-payment-modal.tsx` — 3-column redesign
  - [ ] Col 1: patient + bill read-only; Col 2: TOTAL / AMOUNT PAID / due-status bar + 2×3 payment grid (Cash / Card / JazzCash / EasyPaisa / Bank Transfer / Waive); Col 3: "+ Additional Charges", "% Apply Discount" accordions
  - [ ] Server re-validates `amount_paid <= total_after_adjustments`
- [ ] New migration `00XX_collect_payment_adjustments.sql` — extend `collect_patient_payment()` RPC for additional-charge / discount deltas atomically (advisory-locked)
- [ ] `components/patient-billing/new-bill-modal.tsx` — phone lookup (exact match, clinic-scoped), optional doctor, Bill Type capsules, line-item builder, floating summary
  - [ ] Inline "Not registered — Add patient" path opening `PatientForm`
- [ ] Verify: billing arithmetic asserted server-side (subtotal, discount, charges, paid, due, partial + waive)

### Phase 8: AI Agent (Status: Not Started)

> **Goal:** Per-clinic LLM provider/model selector and BYO API-key handshake layered onto the existing 732-line settings form.

- [ ] Restyle tone/tier as visual selectable cards in `components/ai/ai-settings-form.tsx`
- [ ] Sidebar label "AI Settings" → "AI Agent" in `components/app/app-sidebar-shell.tsx` (route stays `/app/ai-settings`)
- [ ] LLM model selector
  - [ ] Populate from a constant list; default to whatever env currently resolves (do **not** hardcode a spec value that would downgrade the working `gemini-3.5-flash-lite` default)
  - [ ] Provider dropdown with Gemini enabled; OpenAI/Anthropic shown disabled "Coming soon" (D5)
- [ ] BYO API key + handshake (D6)
  - [ ] Write into `clinic_ai_secrets` (RLS'd, no client-readable policy) — never expose the key to the browser (masked `AIza…4f2b` only)
  - [ ] Server action "Connect API" → cheapest model call → set `llm_key_verified` + `_at` for green badge; never echo the key back
  - [ ] "Open Google Gemini Console" link
  - [ ] Decision: fail closed with dashboard alert when a clinic key is missing/invalid/exhausted (recommended), no silent platform-key fallback
- [ ] `lib/actions/ai-settings.ts` — persist `llm_provider` / `llm_model` / verification; `lib/ai/gemini-provider.ts` reads per-clinic key + model
- [ ] Greeting wiring: "AI Generated" (`greeting_style`) composed by orchestrator from patient context — first name only, never health data (privacy)
- [ ] Verify: key never appears in props/SSR payload/API response; cross-clinic secrets isolation

---

## Current Status & Next Steps

### 1. Fully Implemented Features

- **Patients:** split-pane workspace (`patients-workspace.tsx`, `patient-list-pane.tsx`, `patient-record.tsx`), all record sub-tabs, basic health info, documents (private bucket + signed URLs + magic-byte validation), AI summary (shipped dark), `lib/patient-record.ts` one-pass fetch.
- **Admin/billing prerequisites:** migration `0030` (composite FKs, `visits` unique constraint, `app_event_logs` billing category); waive/cancel server actions with owner/admin gate, advisory-locked update, and audit trail; PKR/`Rs` currency formatting and `upi` hidden in the UI.
- **AI schema:** `clinic_ai_settings` LLM columns and `clinic_ai_secrets` table exist and are RLS-protected (`0029`).
- **Foundation (built & verified):** full auth flow, multi-tenant RLS, clinic onboarding, appointments, queue/check-in/vitals, consultation + prescriptions, AI receptionist + WhatsApp, no-code websites, platform billing, analytics + team management, observability.

### 2. Partially Implemented Features

- **`components/patient-billing/billing-dashboard.tsx`** — still the card list. The queries (`fetchPatientBills` with `bill_number` omni-search), status meta, PKR, and waive/cancel backend all exist and are ready to be consumed by the new `BillsTable`; the datatable itself does not.
- **`components/ai/ai-settings-form.tsx` (732 lines)** — has agent name, tone, tier, greeting style, active toggle, WhatsApp, FAQs, and save, but no LLM provider/model selector, no BYO-API-key UI, no verification handshake, no green badge, and no console link. The columns/table it needs are already in the DB (`0029`).
- **`components/patient-billing/billing-sheet.tsx` / `collect-payment-modal.tsx` / `new-bill-modal.tsx`** — functional but single/two-column legacy layouts; the new 2-column / 3-column specs are untouched, and `collect_patient_payment()` is not yet extended for additional-charge/discount deltas.

### 3. Not Started / Remaining Features

- **Phase 6:** `bills-table.tsx`, `bill-row-actions.tsx`, Dashboard/Analytics sub-tabs, Today/All/Pending pills + count badge, Refresh, 8-column datatable, responsive card fallback.
- **Phase 7:** `bill-details-modal.tsx`, 3-column collect-payment redesign, `00XX_collect_payment_adjustments.sql` RPC extension, new-bill phone-lookup + bill-type + doctor + line-item builder, inline "Add patient" path.
- **Phase 8:** visual tone/tier cards, model/provider selector, BYO key handshake + verified badge, console link, Gemini-provider per-clinic key/model, greeting wiring, "AI Agent" sidebar label.
- Also un-specced (documented in `docs/IMPLEMENTATION_PLAN.md` §5.6): Billing Analytics sub-tab content, Growth Agent / Engagement / Integrations / Help sidebar items, UHID `CLI-` prefix scheme (D7), `doctors.speciality` confirmation, age-vs-DOB derivation.

### 4. Recommended Next Action

Execute the first Phase-6 task: **create `components/patient-billing/bills-table.tsx`** (a `"use client"` datatable consuming the existing `fetchPatientBills` `PatientBillListRow[]` from `app/app/patient-billing/page.tsx`), then update `billing-dashboard.tsx`/`PatientBillingPage` to render it with the full column set, filter pills, count badge, refresh, and omni search, before building `bill-row-actions.tsx` (Eye / Printer / 3-dots → waive/cancel using the already-written `waivePatientBillAction` / `cancelPatientBillAction`). Since the entire backend for Phase 6 already exists, this is a front-end build against known-good queries and actions — verifiable with `npm run lint` + `npx tsc --noEmit`.
