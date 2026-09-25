# MASTER ENHANCEMENT PROMPT — Complete the Billing Tab (Table, Filters, 4 Modals, Sequential Numbering)
**Target tool:** OpenCode
**Type:** Completion/audit-and-build pass on Phase 19's patient billing feature — reuses Phase 19's schema (`patient_bills`, `patient_bill_items`, `patient_payments`, `receipts`) and existing components (the Check-In Patient modal's payment section, the Receipt Generated modal from an earlier fix), extending them to match this full reference blueprint.
**Design authority:** `design_system_profile.json` — teal, not the reference's blue/orange/green literal colors (map orange→`semantic.warning`, green→`semantic.success`, blue→`brand.primary`).

---

## 0. IMPORTANT — READ BEFORE STARTING

### Reconciliation — UPI payment method (resolve before implementing)
An earlier fix prompt in this project explicitly **removed UPI** as a payment option from the Check-In Patient modal's payment column. This new Billing-page spec **includes UPI** in both the Collect Payment modal and the Create New Bill modal. These must be reconciled into **one consistent decision across the whole app** — either UPI is a real, supported payment method everywhere (Check-In modal, Collect Payment modal, Create Bill modal), or it's removed everywhere. **Ask me to confirm which** before implementing, rather than guessing — don't ship an inconsistent state where UPI exists in one payment flow and not another.

### Audit first
1. Confirm Phase 19's current `patient_bills`/`patient_bill_items`/`patient_payments`/`receipts` schema and whatever Billing dashboard/New Bill UI already exists.
2. Confirm whether the Check-In Patient modal's payment section (Collect Payment column, Additional Charges/Discount accordions) is already a reusable component — this new Billing page's "Collect Payment" modal is functionally the same interaction, just triggered from a different entry point (the Billing table row menu, not the check-in flow) — reuse the same component rather than building a second one.
3. Confirm whether the "Receipt Generated" modal (built in an earlier fix, WhatsApp/Print footer) already exists as a reusable component — this Billing page's printer-icon action and post-payment flow should trigger the **same** modal, not a rebuilt copy.
4. Confirm the current bill/receipt ID generation (if any) — this phase requires a specific sequential format (Section 3).
Report all findings before implementing.

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect from this project.

## 2. OBJECTIVE
Build the complete Billing tab: a filterable/searchable transactions table, and four modals (Bill Details, Collect Payment, Receipt Generated, Create New Bill) — reusing Phase 19's data model and existing payment/receipt components wherever they already exist, extending them to match this full spec.

## 3. Sequential Numbering (foundational — implement first)
- **Bill Number**: format `BILL-YYYYMMDD-XXX` (e.g. `BILL-20260810-004`) — sequential **per clinic per day**, generated at bill creation (whether auto-created at check-in or manually via Create New Bill).
- **Receipt Number**: format `RCP-YYYYMMDD-XXX` — sequential per clinic per day, generated at successful payment collection (receipt generation time), independent counter from Bill Number.
- Implement via a DB-safe sequential mechanism (a per-clinic-per-day counter table, or a `COUNT()+1`-with-unique-constraint-retry pattern, or a Postgres sequence reset daily — pick whichever is simplest and safe under concurrent check-ins) — must not produce duplicate numbers under concurrent bill/receipt creation (same discipline as Phase 19's original idempotency requirement).
- Add `bill_number`/`receipt_number` columns to `patient_bills`/`receipts` if not already present in the right format.

## 4. Billing Tab — Main Table View
**Sub-nav**: Dashboard | Analytics tabs (already established elsewhere in the app — confirm this page sits correctly under the existing global header/sidebar pattern).

**Filter pills** (left): **Today** (default active), **All Bills**, **Pending {count}** (real, live count badge).

**Controls** (right): **"+ Add Bill"** (primary teal button, opens Create New Bill modal), **"All Status"** dropdown (All Status / Pending / Paid / Waived / Cancelled — real filter, must actually narrow the table per the established "filters must genuinely work" standard from earlier fixes), circular **Refresh** icon button (re-fetches table data).

**Search bar**: "Search patient, phone, or bill number..." — real, working, debounced search across patient name/phone and `bill_number`.

**Table columns**: PATIENT (avatar-initial + name), SERVICE (real service/consultation name), BILL NO (`bill_number`), TIME (real timestamp), AMOUNT (bold ₹ value), MODE (`---` if Pending, else a colored dot + method name e.g. "• cash"), STATUS (pill: `semantic.warning`-tinted "Pending" / `semantic.success`-tinted "Paid" / appropriate styling for "Waived"/"Cancelled"), ACTIONS (Eye icon, Printer icon, three-dot menu).

**Row actions**:
- **Eye icon** → Bill Details modal (Section 5).
- **Printer icon** → Receipt/Print Preview (reuse the existing Receipt Generated modal's Print action/print-preview rendering).
- **Three-dot menu**: "Collect payment" (green text, opens Collect Payment modal — only meaningful/shown for Pending bills), "View details" (same as Eye icon), "Waive bill" (marks the bill waived — reuse Phase 19's waive logic if built, or implement per the established waive-must-resolve-cleanly rule), "Cancel bill" (red text — cancels the bill; confirm this doesn't conflict with any linked appointment's own cancel logic, keep them independent concepts).

## 5. Modal 1 — Bill Details (Eye icon / "View details")
- Header: bill icon, "Bill Details" title, `bill_number · date` subtitle, real status pill, close "X".
- Two-column info: **Patient Information** (Full Name, Age & Gender, Phone Number, "View Profile →" link to the patient's Phase 4 profile) and **Schedule Details** (Doctor + Specialty if linked, Date, Slot/Time, Token — all real, and gracefully omitted/blank if this bill isn't linked to a visit, e.g. a manually-created bill).
- **Line Items** table (ITEM / QTY / UNIT PRICE / TOTAL), real `patient_bill_items` rows, Subtotal + bold Final Total.
- **Payment Information** card: Method, Reference, Paid On (real values once paid, blank/dash before payment), Amount Paid (green) / Amount Due (orange/warning) — both real, live values.
- Footer: **Close** (left), **Waive bill** (outline, danger/warning accent) + **"₹ Collect payment"** (solid success/teal — confirm which color reads best against the design system) — both only meaningfully actionable while the bill is Pending; hide/disable appropriately once Paid/Waived/Cancelled.

## 6. Modal 2 — Collect Payment
**Reuse the exact existing Check-In Patient modal's payment-collection component** (Patient Confirmation / Collect Payment / Additional Charges+Discount columns) — this is the same interaction, just entry-pointed from the Billing table instead of the check-in flow. If that component isn't already generalized to be triggerable from multiple entry points, refactor it to accept a `billId`/context prop rather than building a second copy.
- Column 1: Patient Confirmation (avatar, name, age/doctor, Bill #, Slot, Date).
- Column 2: Total Payment (read-only), Amount Paid (editable), a live Due Amount status bar (green "✓ Paid" once Amount Paid meets Total), Payment Mode (2×2 grid: Cash / UPI / Card / Waive — per the Section 0 UPI reconciliation).
- Column 3: Additional Charges accordion, Apply Discount accordion (both reusing Phase 19's existing bill-items/discount logic).
- Footer: bold running Total (left), Cancel + **"✓ Collect & Send Receipt"** (solid success green, right) — on success, this must: mark the bill Paid, record the payment (idempotent, per Phase 19's established duplicate-payment-prevention rule), generate a receipt with the new sequential `receipt_number`, and open the Receipt Generated modal (Section 7) while also triggering WhatsApp delivery via the Notification Dispatcher (Phase 11) automatically as part of this single action (not requiring a separate click) — confirm this matches or reasonably extends the earlier Receipt modal fix's WhatsApp-button-must-be-clicked pattern; if "Collect & Send Receipt" implies auto-sending, wire it that way, with the modal's own WhatsApp button available as a resend/manual-trigger option.

## 7. Modal 3 — Receipt Generated
**Reuse the existing Receipt Generated modal** built in an earlier fix — extend it only if needed to show the new `receipt_number` (e.g. "RECEIPTS NO. RCP-20260810-004") alongside the existing `bill_number` display, and confirm the Doctor/Schedule info section renders correctly for both visit-linked and manually-created bills (gracefully omitting doctor/schedule fields for a standalone Create-New-Bill invoice with no linked visit).

## 8. Modal 4 — Create New Bill ("+ Add Bill") — extend Phase 19's existing New Bill flow
This is richer than Phase 19's original spec — extend it, don't replace the underlying data model:
- **Patient Details**: Phone Number search input (magnifying-glass icon) → real patient lookup (reuse Phase 4's matching logic); on match, show a compact match card (name, age/gender, "View Patient Profile →", "Change" button to search again); if no match, offer quick patient creation (reuse the existing quick-create pattern from booking flows).
- **Bill Details**: Doctor (Optional) dropdown ("No Doctor" default, else real clinic doctors per Phase 10), Bill Date (date picker, defaults to today), **Bill Type** segmented pills: Consultation / Procedure / Other — new field on `patient_bills` (or derive from the line items if that's a cleaner fit — your call, note which).
- **Line Items builder**: multi-row table — Description ("Select item" searchable dropdown of real services, or free text for a non-catalog charge), Qty, Unit Price (auto-filled from the selected service's price, editable), computed Total per row, delete icon per row, **"+ Add Row"** to add more lines.
- **Notes** field (optional free text on the bill).
- **Payment Details** (bottom): Total Amount (computed from line items), Amount Paid (editable — allows creating a bill that's immediately partially/fully paid, not only ever starting Pending), a calculation summary (Subtotal / Final Total / Amount Paid / Due Amount / Payment Status — all computed live), and the same Payment Mode tiles (Cash/UPI/Card/Waive, per the Section 0 reconciliation) — only relevant/enabled when Amount Paid > 0.
- Footer: Cancel + **"✓ Create Bill"** (solid teal) — creates the `patient_bills` (+ `patient_bill_items`) record with the new sequential `bill_number`, `visit_id = null` (standalone bill, per Phase 19's original design), and — if an Amount Paid was entered — also records the payment/generates a receipt/opens the Receipt modal in the same flow as Section 6.

## 9. Auto-Invoicing on Check-In (confirm/wire this connection)
- Per the reference's described business logic: when a patient is checked in (Phase 17), the system should already be creating/associating a `patient_bills` record for that visit (this may already be true per Phase 17/19's original design — confirm). If this auto-creation isn't currently happening, wire it in: check-in should create a Pending bill for the visit's linked service/consultation fee, so it appears correctly in this Billing table's "Today" view immediately after check-in, without requiring a separate manual bill-creation step.

## 10. DATABASE WORK REQUIRED
- Add `bill_number`, `receipt_number` sequential-numbering support (Section 3).
- Add `bill_type` to `patient_bills` if not deriving it from line items.
- Confirm/extend the UPI payment-method enum per the Section 0 reconciliation.
- Confirm the check-in → auto-bill-creation link (Section 9) — add if missing.

## 11. DEFINITION OF DONE
- [ ] UPI reconciliation resolved consistently across Check-In, Collect Payment, and Create Bill modals (confirmed with me, not guessed).
- [ ] Sequential Bill Number and Receipt Number generation works correctly and safely under concurrent creation.
- [ ] Billing table shows real data with working filters (Today/All Bills/Pending count, Status dropdown), working search, and working Refresh.
- [ ] All four modals implemented/extended per spec, reusing existing components (Collect Payment reuses the Check-In modal's payment component; Receipt Generated reuses the existing receipt modal) rather than duplicating.
- [ ] Waive/Cancel row actions work correctly and resolve the bill's status cleanly.
- [ ] Create New Bill supports multi-line items, optional immediate payment, and Bill Type.
- [ ] Auto-bill-creation at check-in confirmed/wired.
- [ ] All colors map to `design_system_profile.json`.
- [ ] Zero regression to Phase 17/19's existing check-in, payment, or receipt functionality.

## 12. CONSTRAINTS
- Do not duplicate the payment-collection or receipt-generation components — reuse and, if needed, generalize the existing ones.
- Do not implement inconsistent UPI availability across different payment modals — one resolved decision, applied everywhere.
- Do not allow duplicate bill/receipt numbers under concurrent use.
- Do not disable RLS.

## 13. PROCESS
1. Report the Section 0 audit findings and get explicit confirmation on the UPI reconciliation before implementing.
2. Propose the sequential numbering mechanism and the Collect Payment/Receipt component-reuse plan before implementing.
3. Implement: sequential numbering → Billing table (filters/search/columns/row actions) → Bill Details modal → Collect Payment (reused component, wired to this entry point) → Receipt Generated (extended with receipt_number) → Create New Bill (extended per Section 8) → auto-bill-creation-at-check-in verification/wiring.
4. Provide a verification checklist: confirm Bill/Receipt numbers are correctly sequential and collision-free even when creating multiple bills rapidly; confirm each table filter and search genuinely narrows results; open Bill Details for a real Pending bill and confirm all data is real; collect payment via the Billing table entry point and confirm it correctly reuses the same underlying logic as the Check-In modal's payment flow, generates a receipt, and triggers WhatsApp delivery; waive a bill and confirm clean resolution; cancel a bill; create a manual multi-line-item bill with immediate partial payment and confirm correct calculation and status; confirm a real check-in automatically produces a corresponding Pending bill visible in Today's view.

Confirm your Section 0 audit findings and the UPI reconciliation decision back to me before writing code.
