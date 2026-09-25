# Implementation Plan — Patients EMR, Billing, AI Agent

**Created:** 2026-08-30
**Scope:** Three Doxmate-style modules specced by the product owner:
1. **Patients Module** — master-detail EMR workspace
2. **Billing System** — transactions table + 3 modals
3. **AI Agent** — WhatsApp automation config panel

**Status:** Phases 1–5 implemented and verified (see Part 6 for per-phase state). Phases 6–8 not started. Sections marked 🔴 **DECISION** need product owner sign-off before the phase that depends on them starts.

> **Recovery checkpoint — 2026-08-31.** A power cut ended the previous session mid-plan. Post-crash audit found **no partial work**: the interruption landed on a clean phase boundary. Last code edit was `components/patients/patient-record.tsx` at 08:32 (wiring `DocumentsWidget` into the record sidebar); this file was written *after* the last build at 08:25, so it had never been checked. It has now been verified — `npx tsc --noEmit` clean, `npm run lint` 0 errors (1 pre-existing unused-var warning in `components/app/dashboard-content.tsx`, Phase 9 code, unrelated). Phase 5's two files (`lib/ai/patient-summary.ts`, `app/api/patients/[id]/ai-summary/route.ts`) were confirmed absent, and the only `ai_summary` reads in the tree were the display-only card. **Phase 5 has since been completed in the recovery session; next up is Phase 6 (Billing table).**

**How to read this:** Part 0 is the codebase audit — read it first. It is the reason this plan is much smaller than the spec: a large share of the spec already exists and only needs restyling, not building. Parts 1–3 are per-module deltas. Part 4 is the consolidated migration. Part 5 lists open decisions. Part 6 is build order and current progress.

---

## Part 0 — Audit: what already exists

The specs were written as if building from scratch. They are not. Here is the real state.

### 0.1 Patients

| Spec item | Reality |
|---|---|
| Patient search / list / filters | ✅ Exists — `app/app/patients/page.tsx`, fully **server-side** against `patient_directory` view (RLS-scoped, paginated) |
| Patient cards | ✅ Exists — `components/patients/patient-directory.tsx` |
| Add / Edit patient | ✅ Exists — `components/patients/patient-form.tsx`, `lib/actions/patients.ts` |
| Patient profile | ⚠️ Exists but as a **separate page** — `app/app/patients/[id]/page.tsx` + `components/patients/patient-profile.tsx`. Spec wants split-pane. |
| Vitals data | ✅ Exists — `vitals` table (`0023`), extended in `0028` with systolic/diastolic BP, SpO2, respiratory rate, BMI |
| Prescriptions data | ✅ Exists — `prescriptions` table (`0024`): chief_complaint, findings, diagnosis, medicines (jsonb), lab_orders (jsonb), follow_up |
| Visit data | ✅ Exists — `visits` table (`0023`): check-in, token, queue position, consultation timings |
| Split-pane layout | ❌ New |
| KPI stats (Total / New This Month / Today) | ❌ New |
| Today / All Patients tabs | ❌ New |
| Returning / First Visit pills | ❌ New (existing filters are `all` / `upcoming` / `none` / `recent`) |
| UHID `CLI-YYYY-NNNNN` | ❌ **No such column.** Verified: `grep` finds no `patient_code` / UHID anywhere. |
| Blood group | ❌ No column (`known_allergies` and `medical_conditions` exist, blood group does not) |
| Patient documents | ❌ No table, no storage bucket |
| AI Patient Summary | ❌ New |

**`patients` table columns today:** `id, clinic_id, name, email, phone, notes, created_at, updated_at, date_of_birth, city, gender, age, known_allergies, medical_conditions`

**`patient_directory` view exposes today:** `id, clinic_id, name, email, phone, notes, date_of_birth, created_at, updated_at, appointment_count, last_appointment_at, upcoming_count`

> ⚠️ The view does **not** expose `gender`, `age`, `city`, `known_allergies`, `medical_conditions`. The spec's patient cards and Basic Health Info panel need these. **The view must be extended** — see §4.1 for the trap involved.

### 0.2 Billing

| Spec item | Reality |
|---|---|
| Bills / items / payments / receipts schema | ✅ Exists — `0025_patient_billing.sql` |
| Discounts | ✅ Exists — `discount_amount`, `discount_percent` added in `0028` |
| Payment methods incl. UPI + Waive | ✅ Exists — enum extended in `0028`: `cash, card, bank_transfer, upi, jazzcash, easypaisa, waive` |
| Atomic payment collection | ✅ Exists — `collect_patient_payment()` RPC with per-clinic advisory lock, returns receipt |
| Collect Payment modal | ⚠️ Exists — `components/patient-billing/collect-payment-modal.tsx` (131 lines). Needs the 3-column redesign + charges/discount accordions. |
| Create New Bill modal | ⚠️ Exists — `components/patient-billing/new-bill-modal.tsx` (319 lines). Needs phone lookup, bill type, doctor field. |
| Bill Details view | ⚠️ Exists — `components/patient-billing/billing-sheet.tsx` (303 lines). Needs the 2-column modal redesign. |
| Receipt preview / print | ✅ Exists — `components/patient-billing/receipt-preview.tsx` |
| Queries | ✅ Exists — `lib/patient-billing-queries.ts`: `fetchPatientBills`, `fetchBillDetails`, `fetchActiveServices`, `fetchPendingVisits` |
| **Transactions table** | ❌ Current UI is a **card list**, not a datatable — `components/patient-billing/billing-dashboard.tsx` |
| Today / All Bills / Pending tabs + count badge | ❌ New |
| Refresh button | ❌ New |
| Row actions (eye / printer / 3-dots) | ❌ New |
| Analytics sub-tab | ❌ New — **spec gives no content for it** (see §5.6) |
| **`bill_number` (`BILL-20260810-004`)** | ❌ **No such column.** Search currently matches raw UUID. |
| Bill status `waived` / `cancelled` | ❌ Enum is only `pending, paid, partially_paid`. Row actions "Waive bill" / "Cancel bill" have nowhere to write. |
| `bill_type` (Consultation / Procedure / Other) | ❌ No column |
| `bill_date` | ❌ No column (only `created_at`) |
| `doctor_id` on bill | ❌ No column |
| Payment reference number | ❌ No column on `patient_payments` |

### 0.3 AI Agent

Good news — this module is mostly built. `components/ai/ai-settings-form.tsx` is **732 lines** and already covers most of the spec.

| Spec item | Reality |
|---|---|
| Agent name input | ✅ Exists (`agent_name`) |
| Active toggle | ✅ Exists (`enabled`, `is_activated`, `whatsapp_enabled`) |
| Tone selector incl. **Empathetic** | ✅ Exists — UI has all four; DB check relaxed in `0019` to allow `empathetic` |
| Agent tier (Chatbot / AI Agent) | ✅ Exists (`agent_tier`) |
| Greeting style (Custom / AI Generated) | ✅ Exists (`greeting_style`) |
| Save config | ✅ Exists |
| Orchestrator / tools / rate limit / logging | ✅ Exists — `lib/ai/orchestrator.ts` (441 lines), `tools.ts`, `system-prompt.ts`, `rate-limit.ts`, `logging.ts` |
| **Per-clinic LLM model selector** | ❌ New. Model is **global via env** — `lib/ai/gemini-provider.ts` reads `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL`. |
| **BYO API key input** | ❌ New. Key is **global via env** — `process.env.GEMINI_API_KEY`. |
| API key verification handshake + green badge | ❌ New |
| "Open Google Gemini Console" link | ❌ New (trivial) |
| OpenAI / Anthropic providers | ❌ New — **much larger than a dropdown**, see §5.4 |

**Existing per-clinic secret pattern to copy:** `clinic_whatsapp_secrets` (`0019`) — separate RLS-protected table holding only the token, FK to the config row. Do **not** put API keys on `clinic_ai_settings`.

---

## Part 1 — Module A: Patients EMR

### 1.1 Route & layout

🔴 **DECISION D1** — Recommended: **keep `/app/patients/[id]` and turn it into the split-pane**, rather than the spec's `/patients?id=`.

Reasoning: deep links keep working, and existing inbound links do not break — `components/patients/patient-directory.tsx` and `components/app/header-patient-search.tsx` already point at `/patients/{id}`. The query-param version means maintaining two routes plus redirects for no user-visible gain.

Layout:
- `app/app/patients/layout.tsx` — new. Renders the master list (left) as a persistent shell; `children` fills the right pane.
- `app/app/patients/page.tsx` — becomes the right-pane empty state ("Select a patient").
- `app/app/patients/[id]/page.tsx` — becomes the right-pane detail view.
- Left pane: `w-full lg:w-[360px] xl:w-[33%]`, `min-w-[360px]`, independently scrollable (`overflow-y-auto`).
- Right pane: `flex-1`.
- **Mobile:** below `lg`, do not shrink both panes. Show the list only; selecting a patient pushes the detail as a full-screen view with a back button. The spec assumes desktop; without this the module is unusable on a phone.

### 1.2 Left pane — patient directory

Restyle `components/patients/patient-directory.tsx`:
- Header: "Patients" + primary "Add Patient" button (already exists)
- Search input with magnifier, placeholder "Search by name or phone…"
- **New:** KPI row — 3 bordered cards: Total / New This Month / Today
- **New:** sub-tabs "Today" | "All Patients"
- **New:** segment pills "All" | "Returning" | "First Visit"
- Patient cards: circular initial avatar, bold name, meta line `F · 30 Aug 2026 · CLI-2026-00001`
- Active card gets high-contrast highlight
- Keep existing pagination

🔴 **DECISION D2 — search behaviour.** Recommended: **stay server-side.**

The spec asks for instant client-side re-render. That requires shipping the whole patient list to the browser; at 5,000+ patients it will janks the UI and gives up the RLS-scoped, paginated query that exists today. Recommendation: keep the server query and drive it with a debounced (~300 ms) `router.replace` inside `useTransition`. It feels instant and still scales. If the owner insists on true client-side, cap it at clinics under ~500 patients and fall back to server mode above that.

🔴 **DECISION D3 — "Returning" vs "First Visit" data source.** Recommended: **count `visits`, not `appointments`.**

An appointment is a booking (and can be cancelled); a visit is the patient actually arriving. The spec's own logic keys off `consultation_count`. If this filters on `appointment_count`, a patient who booked and never showed up is labelled "Returning" — clinically wrong and it will be noticed. Requires adding `visit_count` to the view (§4.1).

Definitions to implement:
- **First Visit** — `visit_count <= 1`
- **Returning** — `visit_count > 1`
- **Today** tab — patients with a `visits` row where `checked_in_at` is today **in clinic timezone** (use `access.clinic.timezone` and the existing `lib/time.ts` helpers — do not use UTC `date_trunc`, it will show the wrong day for early-morning and late-night check-ins)

KPI definitions:
- **Total** — `count(*)` for the clinic, respecting active filters
- **New This Month** — `created_at` within current calendar month, clinic timezone
- **Today** — distinct patients checked in today, clinic timezone

### 1.3 Right pane — clinical file viewer

New: `components/patients/patient-workspace.tsx` (split-pane shell) and `components/patients/patient-detail.tsx`.

**Header banner:** large circular initials, name, status pill (First Visit / Returning), meta grid (Patient since / sex / UHID / phone), "Edit" button (reuse existing `PatientForm`).

**Context actions:** "Write Prescription" (secondary) and "Start Consultation" (solid green primary) — render these **only when the patient has an open `visits` row today**. Showing them unconditionally would let staff start a consultation for someone who never checked in, bypassing the queue/token flow in `0023`.

**Sub-tabs** with active underline: Visit History · Health Info · Vitals · Prescriptions · Documents · All Appointments.

Each tab is a component under `components/patients/tabs/`:

| Tab | Data source | Build |
|---|---|---|
| Visit History | `visits` + `prescriptions` | New timeline component; empty state per spec |
| Health Info | `patients` columns | New; mostly display |
| Vitals | `vitals` via `visits` | New display; data + `record_vitals` RPC already exist |
| Prescriptions | `prescriptions` | New display; reuse `components/consultation/prescription-preview.tsx` |
| Documents | `patient_documents` (new) | New — table + bucket + upload |
| All Appointments | `appointments` | ✅ Largely reuse `components/appointments/appointment-detail.tsx` (already used by `patient-profile.tsx`) |

**Right sub-column (~40%):**
- Basic Health Info card: Patient ID (UHID), Blood Group, Height/Weight (latest `vitals`), Allergies (`known_allergies`), Current Meds (latest `prescriptions.medicines`)
- Documents widget: dashed dropzone, "No documents yet", "Upload Document" button

**Left sub-column (~60%):** AI Summary card + active tab content.

### 1.4 AI Patient Summary

New route: `app/api/patients/[id]/ai-summary/route.ts`

🔴 **DECISION D4 — cache + PHI.** Recommended: **cached, manual refresh only.**

Two separate concerns:
1. **Cost/latency** — generating on every page load means an LLM call per patient view. Cache it: `ai_summary`, `ai_summary_generated_at`, `ai_summary_visit_count` on `patients`. Regenerate only when the refresh icon is clicked, or when `visit_count` has changed since generation. Reuse `lib/ai/rate-limit.ts`.
2. **Privacy** — this sends real clinical data (diagnoses, prescribed drugs, doctor notes) to Google Gemini. The existing AI receptionist sends booking data, which is a materially lower sensitivity class. This is a conscious product/compliance call, not a technical detail. If the answer is "not yet", build the card and the empty state and leave the LLM call unwired — the UI cost is the same either way.

Behaviour:
- `visit_count == 0` → render literal: *"Summary will be available after consultation history is created"*. **No LLM call.**
- `visit_count > 0` → structured bulleted summary from historical vitals, diagnoses, medicines, doctor notes.

Implementation notes:
- Server-side only. Never call the model from a client component.
- Reuse `lib/ai/gemini-provider.ts`; add a dedicated prompt in `lib/ai/patient-summary.ts` — do **not** overload `lib/ai/system-prompt.ts`, which is scoped to the receptionist agent.
- Log via `lib/ai/logging.ts`.
- Gate on `canManageClinical(access.role)` — the same check `app/app/patients/page.tsx` already uses.

### 1.5 Documents

- New table `patient_documents` (§4.3).
- New **private** storage bucket `patient-documents`.
- ⚠️ Do **not** copy the `websites` bucket pattern from `0009` — that bucket is `public: true`. Medical reports on public URLs is a data breach. Use `public: false` + short-lived signed URLs on read.
- Upload path: `{clinic_id}/{patient_id}/{uuid}-{filename}`.
- RLS on `storage.objects` scoped by `clinic_id` prefix, modelled on `0010_billing.sql` policies.
- Validate on the server: allowlist MIME types (`application/pdf`, `image/png`, `image/jpeg`, `image/webp`), max size ~10 MB. Client-side `accept` is not validation.
- New action in `lib/actions/patient-documents.ts`.

---

## Part 2 — Module B: Billing

### 2.1 Transactions table

Replace the card list in `components/patient-billing/billing-dashboard.tsx` with a datatable.

Columns: PATIENT (avatar + bold name) · SERVICE · BILL NO · TIME · AMOUNT · MODE · STATUS · ACTIONS

- MODE: `---` when pending; coloured dot + method label when paid
- STATUS: orange capsule Pending / green capsule Paid (plus new Waived / Cancelled states)
- Sub-tabs: "Dashboard" | "Analytics"
- Filter pills: "Today" | "All Bills" | "Pending" (with grey count badge)
- Right-aligned: "+ Add Bill" primary, "All Status" dropdown, circular Refresh icon
- Omni search: "Search patient, phone, or bill number…"

> Current search matches `bill.id` (a UUID) — unusable for staff. This is why `bill_number` matters (§4.2).

**Row actions:**
- Eye → Bill Details modal
- Printer → reuse `receipt-preview.tsx`
- 3-dots → Collect payment · View details · Waive bill · Cancel bill

⚠️ **Waive and Cancel are destructive and currently unrepresentable.** `waive` exists as a *payment method* but there is no bill *status* for either. Both need: new enum values (§4.2), a confirm dialog, an audit trail row in `app_event_logs` (table exists, `0013`), and a role gate. A waived or cancelled bill must be excluded from revenue totals.

**Responsive:** an 8-column table will not fit a phone. Below `md`, fall back to the existing card layout rather than horizontal-scrolling the table.

### 2.2 Bill Details modal

Redesign `components/patient-billing/billing-sheet.tsx`.

- Header ribbon: dark blue, "Bill Details", `{bill_number} · {date}`, status capsule, X
- Left card — Patient Information: name, "43 Years • male", phone, "View Profile →" link to `/app/patients/{id}`
- Right card — Schedule Details: doctor name, speciality, date, slot, time range, Token #
- Line items table: ITEM · QTY · UNIT PRICE · TOTAL, then Subtotal, then bold Final Total
- Payment panel: method, reference number, timestamp, Amount Paid (green), Amount Due (orange)
- Footer: "Close" · "Waive bill" (red-tinted) · "₹ Collect payment" (green)

Doctor/token/slot come via `visit_id → appointments → doctors`. `fetchBillDetails` in `lib/patient-billing-queries.ts` must be extended — it currently selects only patient, items, payments, receipts.

⚠️ Manual bills have `visit_id = null`, so there is no doctor or token. Render "—" rather than crashing. This is why `doctor_id` on the bill is worth adding (§4.2).

### 2.3 Collect Payment modal

Redesign `components/patient-billing/collect-payment-modal.tsx` to 3 columns:
- **Col 1** — patient avatar, name, bill number, slot, date (read-only)
- **Col 2** — read-only "TOTAL PAYMENT", editable "AMOUNT PAID" (prefilled with total), due-amount status bar with green ✓ Paid, 2×2 payment mode grid: Cash / UPI / Card / Waive
- **Col 3** — accordions: "+ Additional Charges", "% Apply Discount"
- Footer: Total on the left, "Cancel" + green "✓ Collect & Send Receipt"

Backend: `collect_patient_payment()` already exists with an advisory lock and returns a receipt. It takes `(clinic_id, bill_id, payment_method, amount)`.

⚠️ **Additional charges change the bill total after the bill was created.** The current RPC signature has no room for new line items or a discount delta. Either extend it (preferred — keeps the mutation atomic) or run two statements, which risks a half-applied bill if the second fails. Recommend extending the RPC in `0029`.

Also: server must re-validate that `amount_paid <= total_after_adjustments`. Client-side arithmetic is not trustworthy.

### 2.4 Create New Bill modal

Extend `components/patient-billing/new-bill-modal.tsx`:
- Header ribbon: "Create New Bill" / "Manual bill — not linked to an appointment"
- Left: phone-number lookup → green confirmation box with name, age, gender, "View Patient Profile" link
- Right: Doctor (optional) dropdown, Bill Date, Bill Type capsules (Consultation / Procedure / Other)
- Line items builder: "Select item" dropdown (from `fetchActiveServices`), Qty, Unit Price, read-only row total, trash icon, "+ Add Row"
- Floating summary: Total, Amount Paid, Final Total, Due Amount, Payment Mode selector
- Footer: Cancel + wide blue "✓ Create Bill"

⚠️ Phone lookup must be an **exact match**, server-side, clinic-scoped. A partial-match patient search keyed on phone number is a PHI enumeration vector — a user could probe for which numbers exist in the clinic.

⚠️ If the phone number is not found, the spec has no path. Recommend an inline "Not registered — Add patient" that opens the existing `PatientForm`.

---

## Part 3 — Module C: AI Agent

Most of this module exists. The genuine work is provider/key management.

### 3.1 Restyle (small)

`components/ai/ai-settings-form.tsx` (732 lines) already has agent name, tone, tier, greeting style, and save. Spec asks for tone and tier to be **visual selectable cards** rather than the current select/radio controls. Presentation change only — no schema change, no logic change.

Sidebar label should read "AI Agent" (route can stay `/app/ai-settings`).

### 3.2 LLM model selector

New columns `llm_provider`, `llm_model` on `clinic_ai_settings` (§4.4).

⚠️ **Do not hardcode "Gemini 2.5 Flash" from the spec.** `lib/ai/gemini-provider.ts` already defaults to `gemini-3.5-flash-lite` with `gemini-3.1-flash-lite` as fallback. Implementing the spec literally would downgrade a working configuration. Populate the dropdown from a constant list and default to whatever env currently resolves to.

🔴 **DECISION D5 — OpenAI / Anthropic.** Recommended: **ship the dropdown, enable Gemini only, mark the others "Coming soon" (disabled).**

The spec presents this as a three-option dropdown. It is not. `lib/ai/orchestrator.ts` and `lib/ai/tools.ts` are written against Gemini's function-calling shape; OpenAI and Anthropic have different tool-call protocols, different streaming envelopes, and different error/quota semantics. Supporting them means extracting a provider interface behind `gemini-provider.ts` and reimplementing the tool loop per provider — a project of its own, and a booking agent that silently mis-executes tool calls is worse than one that is unavailable. A visibly disabled option is honest; a half-working one is a support burden.

If Anthropic is added later, use current model IDs (`claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5-20251001`) — not whatever is written in the spec.

### 3.3 BYO API key + handshake

🔴 **DECISION D6 — this is the highest-risk item in the whole plan.**

Today the Gemini key is a single server-side env var. The spec moves to per-clinic customer-supplied keys. That changes the security posture materially:

- A leaked key means fraudulent charges against **the customer's** Google account.
- Keys must never reach the browser — not in props, not in a server-component payload, not in an API response.
- The UI can only ever show a masked form (`AIza…4f2b`) plus a `verified` boolean.

Recommended shape, following the existing `clinic_whatsapp_secrets` precedent:
- New table `clinic_ai_secrets` — `config_id` FK, `api_key`, RLS enabled, **no client-readable policy**
- Never `select` the key into a client component; read it only inside server actions / route handlers
- `llm_key_verified` + `llm_key_verified_at` on `clinic_ai_settings` for the green badge
- "Connect API" → server action → cheapest possible model call → store verified flag; never echo the key back
- Encrypt at rest if the platform supports it; at minimum document that this table holds customer credentials

Also decide the fallback: if a clinic's key is missing, invalid, or quota-exhausted, does the agent fall back to the platform env key (platform absorbs cost) or fail closed with a dashboard alert? Recommend **fail closed with an alert** — a silent fallback means the platform silently pays the customer's bill.

### 3.4 Greeting style

`greeting_style` column already exists. Wiring "AI Generated" means the orchestrator composes a greeting from patient context on first inbound message. Touches `lib/ai/orchestrator.ts` + `lib/ai/system-prompt.ts`.

⚠️ Patient context in a greeting is a privacy consideration: WhatsApp numbers get reassigned and phones get shared. Recommend greeting by first name only — never referencing conditions, medications, or appointment reasons in an unsolicited opening message.

---

## Part 4 — Migration `0029`

One additive migration, following the established `do $$ ... exception when duplicate_column then null; end $$;` idiom used throughout this project.

### 4.1 Extend `patient_directory` view

⚠️ **Read the comment block at `supabase/migrations/0006_patients_crm.sql:56-66` before touching this view.**

The appointment aggregates use `LEFT JOIN LATERAL`, not a plain `LEFT JOIN`, specifically because the view is `security_invoker = true`. With a plain join, patients with zero appointments get a NULL-extended row, the appointments RLS policy (`is_clinic_member(clinic_id)`) evaluates false on a NULL `clinic_id`, and the LEFT JOIN silently degrades to an INNER JOIN — **every zero-appointment patient disappears from the directory.** Recreating the view without preserving both `security_invoker = true` and the LATERAL shape will reintroduce that bug, and it will look like data loss rather than a view error.

Changes:
- Add pass-through columns: `gender`, `age`, `city`, `known_allergies`, `medical_conditions`, `blood_group`, `patient_code`
- Add `visit_count` and `last_visit_at` via a **second `LEFT JOIN LATERAL`** over `visits` (same reasoning as above)
- End with `notify pgrst, 'reload schema';` — PostgREST caches the schema and the new columns will 404 without it

### 4.2 `patient_bills` / `patient_payments`

```
patient_bills:
  + bill_number        text     -- BILL-YYYYMMDD-NNN, unique per clinic
  + bill_type          text     -- consultation | procedure | other
  + bill_date          date     -- defaults to created_at::date
  + doctor_id          uuid     -- composite FK (clinic_id, doctor_id)

patient_bill_status enum:
  + 'waived'
  + 'cancelled'

patient_payments:
  + payment_reference  text     -- UPI / card txn reference
```

**`bill_number` generation.** Format `BILL-20260810-004` is a per-clinic, per-day sequence. Generate it **inside a DB function under the existing per-clinic advisory lock**, not in application code — two receptionists creating a bill in the same second will otherwise collide. The `receipts` table in `0025` already solves this exact problem; copy that approach. Add `unique (clinic_id, bill_number)` as a backstop.

**Backfill.** Existing bills have no number. Backfill deterministically by `(clinic_id, created_at::date, row_number)` so historical bills get stable numbers. Add the unique index *after* backfill.

⚠️ Postgres will not let you `alter type ... add value` and then use the new value in the same transaction. Split the enum additions into their own statement/migration step, as `0028` does.

### 4.3 New: `patient_documents` + `patients` additions

```
patients:
  + patient_code           text  -- UHID, unique per clinic
  + blood_group            text  -- check against a fixed list
  + whatsapp_number        text
  + registered_branch      text
  + ai_summary             text
  + ai_summary_generated_at timestamptz
  + ai_summary_visit_count  int

patient_documents (new):
  id, clinic_id, patient_id, document_name, file_path,
  mime_type, size_bytes, uploaded_by_user_id, uploaded_at, created_at
  - composite FK (clinic_id, patient_id) -> patients   [same-clinic guarantee]
  - RLS: is_clinic_member(clinic_id)
  - index (clinic_id, patient_id)

storage bucket 'patient-documents' — public: false
```

🔴 **DECISION D7 — UHID.** Recommended: **add the column and backfill.**

`CLI-2026-00001` — per-clinic yearly sequence, generated under advisory lock, `unique (clinic_id, patient_code)`. Backfill existing patients in `created_at` order.

The alternative (show the first 8 characters of the UUID) needs no migration but produces an identifier no receptionist can read over the phone or write on a form, which defeats the purpose of a UHID.

Open sub-question: does the `CLI-` prefix stay literal, or derive from the clinic (e.g. `slug`)? A multi-clinic deployment where every patient ID starts `CLI-` makes IDs ambiguous across clinics. Recommend a short per-clinic prefix.

### 4.4 `clinic_ai_settings` + `clinic_ai_secrets`

```
clinic_ai_settings:
  + llm_provider          text  -- google | openai | anthropic
  + llm_model             text
  + llm_key_verified      boolean default false
  + llm_key_verified_at   timestamptz

clinic_ai_secrets (new):
  id, settings_id (FK, unique), api_key, created_at, updated_at
  - RLS enabled, NO client-readable policy
```

### 4.5 ✅ DECISION D8 — RESOLVED: Pakistan / PKR

**Decided by product owner 2026-08-30: Pakistani market. Currency PKR. Pakistani payment rails only.**

Consequences to implement everywhere:
- Currency symbol is **`Rs`** (or `PKR`) — **not `₹`**. The spec's `₹1,000` examples are to be read as `Rs 1,000`.
- `patient_bills.currency` default `'PKR'` (already correct in `0025`) — no change needed.
- **Payment modes shown in UI:** Cash · Card · JazzCash · EasyPaisa · Bank Transfer · Waive.
- **`upi` is hidden from the UI.** It stays in the `patient_payment_method` enum (added `0028`) because Postgres cannot drop an enum value, and old rows may reference it. Filter it out at the presentation layer via a `PATIENT_PAYMENT_METHODS` constant; do not attempt to remove it from the enum.
- Replace the **`IndianRupee`** lucide icon in `components/patient-billing/billing-dashboard.tsx` — use a neutral icon (`Receipt`, `Wallet`) since lucide has no PKR glyph.
- The spec's 2×2 payment grid (Cash / UPI / Card / Waive) becomes a **2×3 grid**: Cash / Card / JazzCash / EasyPaisa / Bank Transfer / Waive.

`currency` stays a per-clinic column rather than a hardcoded constant, so the symbol is still rendered from data. That keeps a future market change a config change instead of a code change.

---

## Part 5 — Open decisions

| # | Decision | Recommendation |
|---|---|---|
| D1 | Split-pane route | Keep `/app/patients/[id]`, not `?id=` |
| D2 | Search: client-instant vs server | Server-side + debounced navigation |
| D3 | Returning/First Visit source | `visits`, not `appointments` |
| D4 | AI summary caching + PHI to Gemini | ✅ **RESOLVED — built, shipped dark.** Cached + manual refresh; de-identified payload; `PATIENT_AI_SUMMARY_ENABLED` off by default. |
| D5 | OpenAI / Anthropic providers | Dropdown with Gemini only; others disabled "Coming soon" |
| D6 | Per-clinic BYO API keys | Separate RLS'd secrets table; never expose to client; fail closed |
| D7 | UHID | Add `patient_code` + backfill; decide prefix scheme |
| D8 | **Currency PKR vs INR** | ✅ **RESOLVED — PKR / Pakistan.** Rs symbol; Cash, Card, JazzCash, EasyPaisa, Bank Transfer, Waive. `upi` hidden in UI. |

**D1, D2, D3, D5, D7 — proceeding on the recommendations above** (owner said "start the implementation" without amending them).

**D4 and D6 still need an explicit answer**, but neither blocks Phase 1:
- **D4** — ✅ **RESOLVED 2026-08-31: built, shipped dark.** The model call is wired but gated on `PATIENT_AI_SUMMARY_ENABLED`, which is off by default. Flipping one env var turns the feature on with no code change; until then no clinical data leaves the server. The payload is de-identified either way.
- **D6** (per-clinic API keys) is needed before Phase 8. The migration creates `clinic_ai_secrets` with no client-readable policy, which is safe whichever way the decision lands.

### 5.6 Missing from the spec

- **Analytics sub-tab** — named in the Billing spec with no content defined. Not planned. Needs its own spec (which metrics, which date ranges, which charts).
- **Sidebar items** referenced but not specced: Growth Agent, Engagement, Integrations, Help & Support.
- **Height/Weight** in Basic Health Info — spec does not say whether to show the latest reading or a trend. Assuming latest.
- **"Speciality"** on the Bill Details doctor card — need to confirm `doctors` has this column.
- **Age vs date_of_birth** — `patients` has *both* `age` (integer) and `date_of_birth`. These will drift: a stored `age` is wrong within a year. Recommend deriving age from `date_of_birth` for display and treating `age` as legacy input-only.

---

## Part 6 — Build order

Sequenced so each phase is independently testable. Do not start a phase before the one it depends on is verified.

**Phase 1 — Migration `0029`** — `[x]` ✅ **DONE**
Schema + view + enums + bucket + backfills, in `supabase/migrations/0029_patients_billing_ai_enhancements.sql` (12 sections, manual verification queries at the foot of the file). Applied to the database and confirmed by the product owner. `types/database.ts` carries every new column and table. The D8/PKR sweep landed with it (`lib/utils/currency.ts`, `IndianRupee` removed from the billing dashboard).

> The RPC extension for Collect Payment adjustments (§2.3) is **not** in `0029` — it belongs to Phase 7 and needs its own migration.

**Phase 2 — Patients split-pane shell** — `[x]` ✅ **DONE**
`app/app/patients/layout.tsx`, `patients-workspace.tsx`, `patient-list-pane.tsx`. KPI strip (Total / New This Month / Today), scope tabs, segment pills, server-side debounced search, mobile single-pane behaviour.

> Deviation from D1: the workspace lives at `/app/patients?id=` after all, and `/app/patients/[id]` redirects to it. Deep links still work, which was the reason D1 preferred the path form.

**Phase 3 — Patients detail tabs** — `[x]` ✅ **DONE**
`patient-record.tsx` plus `components/patients/record/`: `record-banner`, `visit-history-tab`, `health-info-tab`, `vitals-tab`, `prescriptions-tab`, `appointments-tab`, `basic-health-info`, `ai-summary-card` (display-only — no LLM call).

**Phase 4 — Documents** — `[x]` ✅ **DONE** (verified post-crash: tsc + lint clean)
Private-bucket upload, server-side validation, signed-URL reads, Documents tab + sidebar widget. Files: `lib/patient-documents-queries.ts`, `lib/actions/patient-documents.ts`, `app/api/patients/documents/[id]/route.ts`, `components/patients/record/{documents-tab,documents-widget,document-uploader,document-row-actions}.tsx`.

> Stronger than planned: the type allowlist is enforced by **sniffing the file's magic bytes**, not by reading `File.type`. The browser derives `type` from the extension, so a renamed file would otherwise have been stored with a `mime_type` it does not have and served back under it.
>
> Reads go through `/api/patients/documents/{id}` → 60-second signed URL → 302. `file_path` never reaches the browser; `PatientDocumentView` omits the column so it cannot be passed as a prop by accident. The route uses the caller's own client rather than the service role — the `0029` storage policies already scope reads to clinic members by the first path segment.
>
> Delete order is metadata row first, then the storage object. A failed storage delete leaves an unreferenced blob (a storage cost); the reverse order would leave a row pointing at a missing file, which surfaces as a document that errors when opened.

**Phase 5 — AI Patient Summary** — `[x]` ✅ **DONE**
D4 resolved: **built, shipped dark.** `lib/ai/patient-summary.ts` (digest builder + prompt + generation), `app/api/patients/[id]/ai-summary/route.ts` (POST — auth, `canManageClinical`, cache check, rate limit, persist), refresh control wired into `ai-summary-card.tsx`. Verified: tsc clean, lint 0 errors, `npm run build` compiles the route.

> **The model is never called unless `PATIENT_AI_SUMMARY_ENABLED=true`.** Unset is the default and means no clinical data leaves the server; the card still renders any cached `ai_summary` and the refresh control is hidden. Documented with the full PHI warning in `.env.example`.
>
> **Payload is de-identified.** The route selects only `age, date_of_birth, gender, blood_group, known_allergies, medical_conditions` (+ cache columns) — name, phone, email, WhatsApp number, `patient_code`, city and branch are never read, so they cannot be sent. The digest builder also omits the treating doctors' names, which `PatientVisitRow.doctorName` makes available but a clinical summary does not need. The narrow `select` is the real guarantee, not the TypeScript type.
>
> **Cache key is the visit count**, not a TTL. `ai_summary_visit_count` is stamped at generation; the card marks the summary stale when `visit_count` has moved past it. The view's `visit_count` and `record.visits.length` are equal by construction (same `(clinic_id, patient_id)` predicate, same RLS), so the stamp and the comparison agree.
>
> **Rate limit applies to generation only** (`PATIENT_AI_SUMMARY_RATE_LIMIT`, default 20/user/hour) — cached reads are free, so clicking through twenty patients never trips it. The flag check sits *after* the cache check on purpose: turning the feature off stops new generations without blanking summaries a clinic already has.
>
> Provider change: `AIProvider` gained `complete()` for single-turn, tool-free generation, implemented in `GeminiProvider`. Not `chat()` with an empty tool array — that would configure function calling for a request that has no functions. The primary/fallback quota policy was extracted into one generic private helper both methods share, so the fallback cannot apply to only one of them.
>
> Unrelated fix the interface change surfaced: `request/` (a 17-file reference snapshot of the AI/widget subsystem, complete with its own `.env.example` and `widget.js`) was being typechecked because `tsconfig.json` includes `**/*.ts`. Added to `exclude` alongside `Asset`, `Screenshot` and `medbook-ai-opencode-starter`.

**Phase 6 — Billing table** — `[ ]` ⬜ **NOT STARTED**
Datatable, tabs, pills, count badge, refresh, omni search on `bill_number`, row actions. Waive/Cancel with confirm dialogs + `app_event_logs` audit + role gate. `bill_number` already exists and the dashboard search already matches it, but the UI is still the card list.

**Phase 7 — Billing modals** — `[ ]` ⬜ **NOT STARTED**
Bill Details 2-column, Collect Payment 3-column (+ a new migration extending `collect_patient_payment()` for adjustments), Create New Bill (phone lookup, bill type, doctor, line-item builder).

**Phase 8 — AI Agent** — `[ ]` ⬜ **NOT STARTED**
Tone/tier visual cards, model dropdown, secrets table wiring, "Connect API" handshake, verified badge, console link, greeting wiring. Gated on D6.

### Testing per phase
- `npm run lint` and a TypeScript build must pass.
- RLS: verify cross-clinic isolation on every new table and the modified view — a clinic must never read another clinic's patients, bills, or documents.
- Billing arithmetic: subtotal, discount, additional charges, amount paid, due — assert server-side, including partial payments and the waive path.
- Timezone: KPI counts and the "Today" tab must be correct for a clinic whose local day differs from UTC.

### Outstanding manual verification

Neither of these blocks Phase 5, but both are worth doing before this module is called finished:

- **Phase 1 queries** at the foot of `0029` — in particular `count(patient_directory) == count(patients)`, which is the zero-visit-patient regression the `LEFT JOIN LATERAL` shape exists to prevent (§4.1).
- **Phase 4 storage isolation** — as clinic A, confirm a signed URL cannot be minted for a clinic B document, and that `select id, public from storage.buckets where id = 'patient-documents'` still reports `public = false`. `.rls-test.ps1` is the existing harness.

---

## Part 7 — Files at a glance

Naming here is what is **actually in the repo**, not the guess this plan opened with. Two conventions settled during Phases 2–4 and the rest of the module should follow them: the workspace shell is `patients-workspace.tsx` / `patient-record.tsx` (plural for the shell, singular for the record), and every panel inside the record lives in `components/patients/record/` suffixed `-tab.tsx` rather than in a `tabs/` directory.

### Built — Phases 1–5

**New**
```
supabase/migrations/0029_patients_billing_ai_enhancements.sql
app/app/patients/layout.tsx
app/api/patients/documents/[id]/route.ts        signed-URL redirect, 60s expiry
components/patients/patients-workspace.tsx      master-detail shell
components/patients/patient-list-pane.tsx       left pane: KPIs, scope, segments, search
components/patients/patient-record.tsx          banner + sub-tabs + sidebar
components/patients/record/record-banner.tsx
components/patients/record/record-primitives.tsx   RecordEmpty and shared row chrome
components/patients/record/visit-history-tab.tsx
components/patients/record/health-info-tab.tsx
components/patients/record/vitals-tab.tsx
components/patients/record/prescriptions-tab.tsx
components/patients/record/appointments-tab.tsx
components/patients/record/documents-tab.tsx
components/patients/record/document-uploader.tsx   dropzone + inline variants
components/patients/record/document-row-actions.tsx
components/patients/record/documents-widget.tsx
components/patients/record/basic-health-info.tsx
components/patients/record/ai-summary-card.tsx     display-only until Phase 5
lib/patient-record.ts                           visits/vitals/prescriptions in one pass
lib/patient-documents-queries.ts
lib/actions/patient-documents.ts                upload + delete, magic-byte sniffing
lib/utils/currency.ts                           PKR formatting (D8)
lib/utils/avatar.ts
lib/utils/datetime.ts
lib/ai/patient-summary.ts                       Phase 5: digest + prompt + generation
app/api/patients/[id]/ai-summary/route.ts       Phase 5: POST, cached, rate-limited
```

**Modified**
```
app/app/patients/page.tsx                       -> directory query, KPIs, record fetch
app/app/patients/[id]/page.tsx                  -> redirects to /app/patients?id=
components/patients/patient-form-modal.tsx      -> new demographic fields
components/patient-billing/billing-dashboard.tsx     -> PKR, bill_number search
components/patient-billing/billing-sheet.tsx         -> PKR
components/patient-billing/collect-payment-modal.tsx -> PKR, method set
components/patient-billing/new-bill-modal.tsx        -> PKR
components/patient-billing/receipt-preview.tsx       -> PKR
lib/patient-directory.ts                        -> tabs, segments, href builder
lib/constants.ts                                -> payment methods, statuses
lib/validation/schemas.ts                       -> new field validation
lib/time.ts                                     -> clinic-timezone day/month helpers
types/database.ts                               -> 0029 columns, view, documents table
components/patients/record/ai-summary-card.tsx  -> refresh control, generate states
components/patients/patient-record.tsx          -> threads patientId + aiSummaryEnabled
components/patients/patients-workspace.tsx      -> threads aiSummaryEnabled
lib/ai/types.ts                                 -> AIProvider.complete()
lib/ai/gemini-provider.ts                       -> complete() + shared quota fallback
.env.example                                    -> PATIENT_AI_SUMMARY_* + PHI warning
tsconfig.json                                   -> exclude the request/ reference snapshot
```

**Deleted**
```
components/patients/patient-directory.tsx       -> superseded by patient-list-pane.tsx
components/patients/patient-profile.tsx         -> superseded by patient-record.tsx
```

> The original plan said "Deleted: none. This plan is additive throughout." That did not survive contact with the code: the old directory and profile components were full rewrites, not extensions, and keeping both would have meant two sources of truth for the same screen.

### Planned — Phases 6–8

```
supabase/migrations/00XX_collect_payment_adjustments.sql   Phase 7 (RPC extension)
components/patient-billing/bills-table.tsx      Phase 6
components/patient-billing/bill-row-actions.tsx Phase 6
components/patient-billing/bill-details-modal.tsx  Phase 7
```

**To be modified**
```
components/patient-billing/billing-dashboard.tsx -> table, tabs, pills, count Phase 6
components/patient-billing/collect-payment-modal.tsx -> 3-column, adjustments Phase 7
components/patient-billing/new-bill-modal.tsx   -> phone lookup, type, doctor Phase 7
lib/patient-billing-queries.ts                  -> doctor/token/slot          Phase 6
lib/actions/patient-billing.ts                  -> waive, cancel, adjustments Phase 6-7
components/ai/ai-settings-form.tsx              -> visual cards, model, key   Phase 8
lib/actions/ai-settings.ts                      -> provider/model handshake   Phase 8
lib/ai/gemini-provider.ts                       -> per-clinic key + model     Phase 8
components/app/app-sidebar.tsx                  -> "AI Agent" label           Phase 8
```
