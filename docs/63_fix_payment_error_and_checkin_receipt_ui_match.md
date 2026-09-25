# FIX + PIXEL-MATCH PROMPT — Payment Collection Error + Exact Check-In / Receipt Modal UI Match
**Target tool:** OpenCode
**Type:** (A) Diagnose-and-fix a real payment-collection bug, (B) match the Check-In Patient modal and Receipt Generated modal's visual design **exactly** to the provided reference markup — same structure, spacing, and component layout, but using MedBook AI's own primary color instead of the reference's violet/indigo gradient.

---

## 0. IMPORTANT — READ BEFORE STARTING
- The reference files (`Check_In_Patient_html_css.txt`, `Receipt_Generated_html_css.txt`) are the **exact visual source of truth** for these two modals' layout, spacing, typography scale, card structure, and component arrangement. Match them precisely.
- **Ignore the large block of `--qb-*` and `--lt-*` CSS custom properties** in the `Receipt_Generated_html_css.txt` file — that's unrelated noise injected by a browser extension (a grammar/writing-assistant tool) captured accidentally during inspection, not part of the actual Doxmate component. Only the actual component markup/Tailwind classes are relevant.
- **Color substitution rule (applies throughout both modals)**: wherever the reference uses `#4E5DB5`/`#5B6BC5` (the violet/indigo gradient header) or any other reference-specific brand color, substitute MedBook AI's own `colorPalette.brand.primary` (teal, from `design_system_profile.json`) — as a solid color or an equivalent teal-toned gradient if a gradient reads better, your call. Green elements (Payment Received banner, WhatsApp button) can reasonably stay mapped to `colorPalette.semantic.success`, since that's already a correct semantic color, not an arbitrary reference brand color.
- This work reuses and must stay consistent with Phase 19's billing schema and the earlier Billing-tab master prompt's Collect Payment / Receipt Generated components — **do not build a second, parallel implementation**; fix and restyle the existing ones.
- Before writing any code: reproduce the payment-collection error and capture the **real, specific error** (console error, network response, server log) — do not guess at the cause. Report the exact error text/stack before proposing a fix.

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect from this project.

## 2. OBJECTIVE
1. Fix the real bug causing payment collection to fail during check-in.
2. Restyle the Check-In Patient modal and Receipt Generated modal to match the reference markup's exact structure/spacing/layout, in MedBook AI's own color palette.

---

## Part A — Diagnose and Fix the Payment Collection Error

### Step 1 — Reproduce and capture real evidence
1. Go through the actual flow: Appointments → Today → Check In a patient → fill in payment details → click Collect Payment (or Check In, whichever triggers the failure).
2. Capture the exact error: browser console error (full stack trace), any failed network request (status code + response body), and server-side logs if accessible.
3. Report this exact evidence before proposing a fix — do not guess-and-patch.

### Step 2 — Likely causes to check (informed by this project's history of similar bugs)
- **Validation/payload mismatch**: confirm the payment form's submitted payload matches exactly what the server action's Zod schema expects (field names, types — e.g. amount as string vs. number, payment method enum value mismatch) — this project has hit this exact class of bug multiple times before (generic "Invalid input" errors from schema/payload mismatches).
- **Payment method enum mismatch**: confirm the payment method value sent (Cash/UPI/Card/Waive — per whatever was decided in the UPI reconciliation from the Billing master prompt) exactly matches the real enum values in `patient_payments.payment_method`.
- **RLS/authorization gap**: confirm the insert into `patient_payments`/`patient_bills`/`receipts` isn't being blocked by a missing or incorrectly-scoped RLS policy for the current user's role.
- **Idempotency/duplicate-guard false rejection**: confirm the duplicate-payment-prevention logic (from Phase 19) isn't incorrectly flagging a legitimate first-time payment as a duplicate due to a bug in how it checks prior payment state.
- **Sequential numbering failure**: if bill/receipt number generation (from the Billing master prompt) was recently added, confirm it isn't throwing due to a race condition or an incorrectly-scoped uniqueness constraint.
- **Missing/incorrect linkage**: confirm the check-in flow correctly has a real `bill_id`/`visit_id` to attach the payment to at the moment "Collect Payment" is clicked (e.g. if the auto-bill-creation-at-check-in step from the Billing master prompt hasn't fired yet, the payment collection call might be operating on a null/missing bill reference).

### Step 3 — Fix and verify
- Fix the actual confirmed root cause.
- Re-test the full flow: check in a patient, collect payment via Cash and via Card (and UPI if that reconciliation kept it), confirm a bill and receipt are correctly created with sequential numbers, confirm no error, confirm the receipt appears correctly (leads into Part B/C below).

---

## Part B — Check-In Patient Modal: Exact UI Match
Reference: `Check_In_Patient_html_css.txt`. Reproduce this exact structure:
- 3-column horizontal grid, header ribbon (teal instead of the reference's dark-blue/violet).
- Header: "Check In Patient" title, patient name, "Token #X will be assigned" subtitle, "Returning Patient"/"First Visit" badge.
- Column 1 (Patient Confirmation): initial badge, Name, Age, Location, Phone, Patient ID, Booking Source, Assigned Doctor, Slot Name, Slot Time Range.
- Column 2 (Collect Payment): editable Consultation Fee input with pencil-edit affordance, Payment Mode 2×2 tile grid.
- Column 3 (Add-ons): "+ Additional Charges" accordion, "% Apply Discount" accordion.
- Footer: Total Amount, "Collect Payment" secondary button, solid **Check In** primary button (success green per earlier established convention).
- Confirm this matches (or supersedes, if a later prompt already refined specific details like Patient Limit/Waive handling) what's already been built for this modal across earlier prompts — this task's job is pixel/structure fidelity to the reference, not re-deciding functional behavior already settled.

## Part C — Receipt Generated Modal: Exact UI Match
Reference: `Receipt_Generated_html_css.txt`. Reproduce this exact structure precisely:
- Rounded-2xl card, max-width ~32rem (`max-w-lg`), header gradient band (teal-toned, not the reference's violet/indigo) with a document icon in a translucent white circle, bold title **"Receipt Generated"**, and a light sub-line showing **"{Patient Name} · Token #{N}"**.
- Close "X" icon, top-right, with a hover state.
- Content (scrollable if needed, `overflow-y-auto`):
  1. Clinic info row: light tinted rounded box, clinic name (bold, teal) + city/address (grey, smaller) on the left, bold bill reference (e.g. "BILL-{number}") on the right, teal-toned text — real clinic data, never hardcoded.
  2. Two-column grid: **Patient** card (grey rounded box, small uppercase label, bold patient name) and **Doctor** card (same style, bold doctor name + date below it in grey).
  3. Itemized table: bordered rounded container, header row (grey background, uppercase small "Item"/"Amount" labels), one row per real bill item, and a bold total row with a top border separating it, teal-colored total amount.
  4. Payment status banner: light green tinted rounded box, green checkmark-circle icon + bold "Payment Received" text on the left, a green pill badge with the real payment timestamp on the right — reflect "Waived" or another correct real status label here instead of "Payment Received" when applicable, per the earlier-established rule that this banner must be status-accurate, not hardcoded.
- Footer: light grey background, top border, **Close** button (outline) on the left; on the right, a green-outline **WhatsApp** button (with the real WhatsApp icon/brand color, since that's a recognizable brand mark rather than this app's own UI color) and a solid teal **Print** button (document/printer icon) — both wired to the real, already-established Notification Dispatcher (WhatsApp) and print-preview (reusing Phase 18's prescription print pattern) logic, not rebuilt.
- Match the reference's exact rounded corners, padding rhythm, font sizes (bold title `text-base`, sub-line `text-xs`, card labels `text-[10px]` uppercase tracked, body text `text-sm`, total amount `text-lg`), and spacing between sections (`space-y-4` equivalent) as closely as the project's existing component/utility conventions allow.

## 3. DEFINITION OF DONE
- [ ] Real payment-collection error identified and fixed, with evidence (Part A).
- [ ] Full check-in → payment → receipt flow works end-to-end with no errors, across each supported payment method.
- [ ] Check-In Patient modal visually matches the reference's exact structure/spacing/layout, in MedBook AI teal.
- [ ] Receipt Generated modal visually matches the reference's exact structure/spacing/layout, in MedBook AI teal (with WhatsApp's brand green kept as-is since it's a recognizable external brand mark).
- [ ] No hardcoded clinic/patient/doctor/amount data anywhere in the Receipt modal — all real.
- [ ] Existing WhatsApp delivery and Print functionality confirmed still correctly wired, not rebuilt.
- [ ] Zero regression to any other part of the Appointments/Billing modules.

## 4. CONSTRAINTS
- Do not guess the root cause of the payment error without first capturing real evidence.
- Do not build a second, parallel Check-In or Receipt component — restyle/fix the existing ones.
- Do not use the reference's literal violet/indigo — MedBook AI teal throughout, except WhatsApp's own brand green icon.
- Do not change any underlying payment/receipt/check-in business logic while doing the visual match — Part B/C are presentation-layer tasks, separate from Part A's logic fix.

## 5. PROCESS
1. Reproduce and report the real payment-collection error (Part A, Step 1) before anything else.
2. Fix the confirmed root cause.
3. Restyle the Check-In modal and Receipt modal to match the reference markup exactly, substituting colors per Section 0's rule.
4. Provide a verification checklist: complete a full check-in-with-payment flow with no errors for each payment method; visually compare the rebuilt Check-In and Receipt modals against the reference screenshots/markup and confirm structural fidelity; confirm WhatsApp and Print buttons still function correctly; confirm no hardcoded data anywhere in the Receipt modal.

Report back the real error found in Part A before proposing any fix, and confirm the full Definition of Done checklist with evidence once complete.

---

**Note for future reference (not part of this task's scope):** the `doxmate-queue-management-system-guide.md` and video transcript describe a broader real-time architecture (WebSocket events for check-in/consultation-start/token-reorder/consultation-complete, and a Waiting Area Smart TV Display with audio announcements) beyond what this prompt covers. These are understood and noted for a **future phase** — this current prompt is scoped strictly to fixing the payment error and matching the two modals' UI, not implementing WebSocket real-time sync or the Smart TV display.
