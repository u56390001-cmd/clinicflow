# INIT PROMPT — MedBook AI
## Phase 19: Payment Collection, Patient Billing & Receipts
**Reference documents:** Base PRD (Phases 1–9) + `PRD-Feature-Expansion-v1.1.md` (Phases 10–16) + the Clinic Patient Queue/Consultation/Billing Feature Specification — **Part 3 of 3 (final part)**: Payment collection, billing, receipts. Completes the full check-in → queue → consultation → billing workflow.
**Target tool:** OpenCode
**Prerequisite:** Phase 17 (Check-in/Queue/Vitals) and Phase 18 (Consultation/Prescription) complete and verified.

---

## 0. IMPORTANT — READ BEFORE STARTING

**CRITICAL NAMING/SCOPE BOUNDARY — this is the most important rule in this phase:**
This project already has a **"Billing" system from Phase 8** for the **clinic's SaaS subscription to MedBook AI** (`subscription_plans`, `subscriptions`, `payment_methods`, `payment_submissions` — Bank Transfer/JazzCash/Easypaisa, admin-approved). This phase builds a **completely separate** billing domain: **patient visit/consultation payments** — a patient pays the clinic for their consultation/service, collected by clinic staff, not verified by a MedBook AI platform admin. **Do not reuse, extend, rename, or cross-reference Phase 8's tables for this.** New tables, new routes, new UI — entirely within the clinic's own operational area, nothing to do with MedBook AI's own revenue.

Before writing any code:
1. Confirm Phase 17's `visits.payment_status` field and its current possible values (`pending`, `collected_pre`, `collected_post`, `not_required`).
2. Confirm Phase 11's Notification Dispatcher (`notifyPatient()`) interface and its current channel support (email real, whatsapp real if Phase 13 is built, or still stubbed if not).
3. Confirm whether any print/PDF/document infrastructure exists (used in Phase 18 for prescription printing) that can be reused for receipts.
4. Report findings before implementing.

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect from this project.

## 2. OBJECTIVE
Let clinic staff collect payment for a patient visit (before or after consultation), generate a bill and receipt, deliver the receipt via the Notification Dispatcher (email, and WhatsApp if connected), and separately create ad-hoc bills for walk-in/phone patients via a patient-phone lookup flow — all safely idempotent against duplicate charges.

## 3. SCOPE

### A. Patient Billing Data Model (new, separate from Phase 8)
```
patient_bills:     id, clinic_id, visit_id (nullable — a bill can exist without a visit, see New Bill flow),
                    patient_id, total_amount, currency, status ('pending' | 'paid' | 'partially_paid'),
                    created_at, updated_at
patient_bill_items: id, bill_id, description (service/product name), quantity, unit_price, line_total
patient_payments:  id, bill_id, amount, payment_method (cash/card/bank/jazzcash/easypaisa — reuse the same
                    method vocabulary style as Phase 8 for consistency, but this is a separate table),
                    collected_by_user_id, collected_at, created_at
receipts:          id, bill_id, receipt_number (clinic-scoped sequential), generated_at, pdf_path (nullable)
```
- RLS scoped via `clinic_members`, same established pattern — completely independent of Phase 8's RLS policies (different tables, same pattern, no shared access logic).
- `receipt_number` should be a clean, sequential, clinic-scoped number (e.g. resets or continues per clinic, your judgment — a simple per-clinic auto-increment is sufficient, don't over-engineer numbering schemes).

### B. Collect Payment (from a visit)
- From the Billing/Today view, a visit with `payment_status = 'pending'` shows a "Collect Payment" action.
- Opens a payment collection form: itemized charges (pre-filled from the visit's service/consultation per existing appointment/service data — reuse `services.price` where applicable, per Phase 2/3), ability to add applicable additional charges (extra line items), payment method selection, amount.
- On submission:
  1. Create/update the `patient_bills` + `patient_bill_items` records.
  2. Record the `patient_payments` entry.
  3. Update `patient_bills.status` and the linked `visits.payment_status` to `collected_post` (or `collected_pre` if this happens before consultation — same flow, different timing per the spec's scenarios).
  4. Generate a `receipts` record.
  5. Trigger receipt delivery via `notifyPatient()` (Phase 11's dispatcher) — `channel: 'email'` always, and `channel: 'whatsapp'` additionally if the patient has a `whatsapp_number` and `notification_preference` includes WhatsApp (Phase 11/13) and the clinic's WhatsApp is connected (Phase 12) — reuse the dispatcher exactly as designed, do not build a separate WhatsApp-sending call here.
- **Idempotency (critical, matches the spec's explicit requirement)**: if `visits.payment_status` is already `collected_pre`/`collected_post` for this visit, the Collect Payment action must not be offered again (or must be a safe no-op/clearly-labeled "already paid" state) — an already-paid appointment must never be charged twice. Protect the submission endpoint itself against duplicate/rapid double-submission (e.g. a request-level idempotency check or a DB constraint preventing two `patient_payments` for the same bill within the same action), not just a UI-level disable-after-click.

### C. Billing Dashboard View
- A billing list/view (e.g. `/app/patient-billing`, distinct in name and route from the existing `/app/billing` which is Phase 8's SaaS subscription page — do not collide routes) showing patient bills with status (pending/paid), amount, patient, linked visit/appointment, and a "Collect Payment" action for pending ones.

### D. New Bill (independent flow, not tied to an existing visit)
Per the spec's explicit independent flow:
1. Staff enters a patient phone number.
2. If a matching patient exists (reuse Phase 4's patient lookup), retrieve and display their details; if not, offer quick patient creation (reuse Phase 4's quick-create, same as the appointment-booking quick-create pattern).
3. Select service/product (reuse existing `services`, or allow a free-text line item if the charge doesn't map to a configured service — e.g. a miscellaneous product/consumable charge).
4. Enter price (pre-filled from the service's configured price if selected, editable).
5. Create bill → creates a `patient_bills` record with `visit_id = null` (a bill not tied to a specific visit — e.g. a walk-in product sale).
6. Show a clear success/bill-created confirmation state.
- This flow can immediately proceed into the same Collect Payment step (C above) or leave the bill `pending` for later collection — support both (staff may create the bill now and collect payment at the same time, or later).

### E. Receipt
- A receipt is generated after any successful payment (from either flow B or D) — clean, itemized, clinic-branded (name/logo/address from existing clinic settings), showing bill items, total, payment method, receipt number, date.
- Reuse whatever print/PDF infrastructure Phase 18 used for prescriptions (per Section 0's audit) for visual/format consistency, if that pattern fits; otherwise a simple print-optimized HTML view is acceptable, matching Phase 18's approach for consistency between the two document types.
- Deliverable both as an on-screen/print view and via the Notification Dispatcher (Section 3B.5).

## 4. CONCURRENCY & SAFETY
- Duplicate payment submission prevented (Section 3B's idempotency requirement) — this is the single most important correctness requirement in this phase.
- Already-paid visits/bills must not be charged again anywhere in the UI (Collect Payment action correctly hidden/disabled once paid).
- Receipt generation should not duplicate receipt numbers under concurrent access — use a DB-level sequence/constraint, not a client-computed number.

## 5. DATABASE WORK REQUIRED
- Migrations: `patient_bills`, `patient_bill_items`, `patient_payments`, `receipts` (Section 3A), RLS scoped via `clinic_members`.
- Confirm `visits.payment_status` (Phase 17) is correctly updated by this phase's flows — no schema change needed there beyond using the existing field correctly.

## 6. DEFINITION OF DONE
- [ ] Collect Payment works from a pending visit, correctly itemized, supports additional charges.
- [ ] Payment submission is provably idempotent — a rapid double-click or duplicate request does not create two payments/charges.
- [ ] Already-paid visits cannot be charged again.
- [ ] Receipt generates correctly and is delivered via the Notification Dispatcher (email always, WhatsApp when applicable/available).
- [ ] New Bill flow works end-to-end via phone lookup, independent of any existing visit.
- [ ] Billing dashboard correctly lists real bills/payment statuses, at a route distinct from Phase 8's SaaS billing page.
- [ ] Zero collision/confusion with Phase 8's subscription billing tables, routes, or RLS policies — fully separate domains.
- [ ] Cross-tenant isolation verified.

## 7. CONSTRAINTS
- Do not reuse, rename, or extend any Phase 8 table/route for this feature — entirely separate patient-billing domain.
- Do not duplicate the WhatsApp-sending or email-sending logic — reuse Phase 11's `notifyPatient()` dispatcher exactly.
- Do not allow double-charging under any code path — this is the phase's core safety requirement.
- Do not disable RLS.

## 8. PROCESS
1. Complete the Section 0 inspection and report findings before writing code.
2. Propose the exact schema and the idempotency mechanism (DB constraint vs. application-level check, or both) before implementing.
3. Implement: migrations → Collect Payment flow (with idempotency) → receipt generation + Notification Dispatcher wiring → Billing dashboard view → New Bill (phone-lookup) flow.
4. Provide a verification checklist matching the spec's acceptance-gate items 25–28 (plus the idempotency requirement threaded throughout): pending billing can be collected; additional charges can be included; successful payment produces a receipt; receipt is delivered via email (and WhatsApp if applicable); new bills can be created independently via patient phone lookup; attempt a duplicate payment submission (rapid double-click and/or a manually repeated request) and confirm it's safely rejected/no-op'd, not double-charged; confirm cross-tenant isolation; confirm zero interference with Phase 8's SaaS billing.

Confirm your understanding and the Section 0 inspection findings back to me before writing code. This is the final phase of the 3-part Patient Queue/Consultation/Billing feature — after this, the full check-in → queue → consultation → prescription → billing workflow (the spec's complete 28-step acceptance gate) should work end-to-end.
