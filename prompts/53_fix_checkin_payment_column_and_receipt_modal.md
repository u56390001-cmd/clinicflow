# FIX/UPDATE PROMPT — Check-In Patient Modal: Remove UPI, Redesign Add-ons Column & Bottom Bar + New "Receipt Generated" Modal & Toast

## Context
This refines the **Check-In Patient Modal** (Column 2: Collect Payment, Column 3: Add-ons, and the Bottom Action Bar) already specified/built from the earlier master Appointments prompt (Section 10), and adds a **new confirmation modal + toast** that must appear after a successful "Collect Payment" action.

Reference: an additional transcript segment (Hindi) confirms the exact intended flow — check-in → (optionally) collect payment before consultation, generate bill, send receipt via WhatsApp → OR check in directly without payment if collected post-consultation → OR confirm an already-collected booking-time payment. This matches Phase 17/19's existing logic exactly — this update only changes the **UI presentation** of that already-correct flow, not the underlying payment scenarios/logic.

**One clarification for you, not a task**: the small icon that appears inside/next to the "Check In" button (per the original component blueprint) is understood to be a **decorative icon accompanying the button's label** (e.g. a clock or check-style icon), not a separate hidden function — the row's actual secondary actions live in the separate three-dot menu, already specified. If your audit finds this icon triggers something specific already in the current implementation, report that back rather than assuming it's purely decorative.

---

## Part 1 — Update the Check-In Patient Modal (Columns 2 & 3, Bottom Bar)

### Column 2 (Collect Payment) — remove UPI
- Remove the **UPI** payment method option entirely.
- Remaining payment method options: **Cash / Card / Waive** only.
- Confirm the `patient_payments.payment_method` enum (extended in the earlier master prompt to include `cash`, `upi`, `card`, `waive`) is adjusted — remove `upi` from the enum/options if it was added, or simply stop offering it in the UI if removing the enum value entirely would be disruptive to any already-recorded data (check for existing `upi` payment records first; if none exist, safe to fully remove; if some exist, keep the value supported in the schema but don't offer it as a new selectable option going forward — report which case applies).

### Column 3 (Add-ons) — redesign exactly as follows
Replace/update this column's content to be two accordion-style expandable list items (not previously detailed this precisely):
1. **Additional Charges** — row with a **"+"** icon on the left, label text "Additional Charges," and a right-facing chevron indicating it expands into an accordion revealing the actual additional-charges input/list (reuse Phase 19's `patient_bill_items` add-line-item functionality — this is the same underlying capability, just presented as a collapsed-by-default accordion here).
2. **Apply Discount** — row with a **"%"** icon on the left, label text "Apply Discount," and a right-facing chevron, expanding into the discount input (reuse/confirm the `patient_bills` discount field added in the earlier master prompt).
- Both start collapsed; clicking either expands it in place (accordion behavior — expanding one does not need to collapse the other, unless that's a more natural pattern given the existing design system's accordion component convention already used elsewhere in this project, e.g. Website Builder's editor sidebar accordions from Phase 7 — reuse that same accordion component/pattern for visual consistency).

### Bottom Action Bar — restyle
- Persistent white bar at the very bottom of the modal, visually separated from the card content above (border-top or subtle shadow).
- **Left**: "Total Amount:" label + large bold amount (e.g. "₹400") — use `colorPalette.brand.primary` (teal) for this bold amount text, not the blueprint's literal "deep blue."
- **Right**, two buttons:
  1. **Collect Payment** — outline-style button (teal outline/text on white/transparent background) with a small icon.
  2. **Check In** — solid button using `colorPalette.semantic.success` (green) background, white text, checkmark icon.
- Confirm both buttons' underlying actions are unchanged from what's already built (Collect Payment → Phase 19's payment flow; Check In → Phase 17's check-in transition) — this task only restyles them and finalizes the Add-ons column content, it does not change what clicking them does, except for the new modal in Part 2 below appearing after a successful Collect Payment.

## Part 2 — New "Receipt Generated" Modal + Toast Notification (appears after successful "Collect Payment")

### Toast (top-right, appears immediately on successful check-in/payment action)
- Floating pill-shaped banner, top-right of the screen, solid `colorPalette.semantic.success` (green) background, white text.
- Content: white checkmark-circle icon, then text: **"{Patient Name} checked in · Token #{N} assigned"** — populate with the real patient name and the real token number just assigned (Phase 17 logic), never placeholder text.
- Standard toast behavior: auto-dismiss after a few seconds, matching whatever toast/notification pattern (library/component) is already used elsewhere in this project — reuse it, don't introduce a new toast system if one already exists.

### Receipt Generated Modal (appears alongside/after the toast, once payment is successfully collected)
**Header band**: solid `colorPalette.brand.primary` (teal, not the blueprint's literal deep blue) rectangular band.
- Left: document icon + bold white title **"Receipt Generated"**, with smaller light sub-text below: **"{Patient Name} • Token #{N}"**.
- Right: white "X" close icon.

**Content area:**
1. **Clinic header card** (light neutral-shaded rounded box): left side — clinic name (bold) + city/address (grey, smaller) pulled from real clinic settings (Phase 2) — never hardcode "Doxmate AI Clinic"/"Jaipur, Rajasthan," these must be the actual clinic's real configured name/address; right side — bill reference tag (e.g. "BILL-{id}" — reuse Phase 19's real `patient_bills.id` or an existing formatted bill-reference convention if one exists).
2. **Patient & Doctor details card** (two-column, light neutral shading): left — "PATIENT" label (small caps/grey), real patient name (bold), real age; right — "DOCTOR" label, real doctor name (or clinic default if no doctor assigned), real appointment date.
3. **Itemized invoice table**: header row "ITEM" (left) / "AMOUNT" (right); one row per real `patient_bill_items` entry (e.g. "Consultation Fee" — ₹{amount}, plus any Additional Charges/Discount lines from Part 1 if applicable); bold "Total Paid" row with the real total.
4. **Payment status banner** (light green/success-tinted pill): left — green checkmark + bold "Payment Received" text (or an appropriately different status label if the payment was a "Waive" case — confirm this banner correctly reflects Waived vs. Paid rather than always saying "Payment Received"); right — real timestamp of the payment.

**Bottom action bar** (three buttons):
1. **Close** (left) — outline/light button, closes the modal.
2. **WhatsApp** (center-right) — light-green-tinted button with a WhatsApp icon — triggers actual receipt delivery via Phase 11's Notification Dispatcher (`channel: 'whatsapp'`, `type` appropriate to a receipt/payment-confirmation notification) — reuse this exactly, do not build a separate WhatsApp-sending call here. If the patient has no WhatsApp number or the clinic isn't WhatsApp-connected (Phase 12), handle gracefully (disabled state with a tooltip, or a clear inline message) rather than silently failing.
3. **Print** (far right) — solid `colorPalette.brand.primary` (teal, not literal blue) button with a document/printer icon — reuse whatever print/print-preview infrastructure was established for prescriptions (Phase 18) for visual and technical consistency, rendering this same receipt content in a print-friendly view.

## Verification Checklist
1. Confirm UPI no longer appears as a selectable payment method; Cash/Card/Waive still work correctly.
2. Confirm the Add-ons column shows the two accordion items (Additional Charges, Apply Discount) with correct icons and expand behavior, and that expanding either still correctly feeds into the real bill/discount data.
3. Confirm the Bottom Action Bar shows the correct teal Total Amount, outline Collect Payment button, and solid green Check In button, both still triggering their existing correct underlying logic.
4. Complete a real check-in + payment collection and confirm: the toast appears with the correct real patient name and token number; the Receipt Generated modal opens with all real data (clinic info, patient/doctor details, correct itemized amounts including any additional charges/discount, correct payment-received/waived status, correct timestamp).
5. Click WhatsApp in the Receipt modal and confirm it correctly triggers (or gracefully handles the absence of) real WhatsApp delivery via the Notification Dispatcher.
6. Click Print and confirm a correctly formatted receipt print-preview appears, consistent with the prescription print pattern from Phase 18.
7. Confirm a "Waive" scenario shows an appropriately different payment-status message rather than falsely claiming "Payment Received."

## Constraints
- Do not change any underlying payment/check-in/receipt-generation logic — this task is UI presentation and one new confirmation-modal addition, all wired to existing Phase 17/19/11 functions.
- Do not hardcode any clinic/patient/doctor/amount values anywhere in the Receipt modal — everything must be real, live data.
- Do not introduce a new toast/notification library if one already exists in the project.
- Do not use literal blue anywhere — MedBook AI teal (`colorPalette.brand.primary`) per the design system; green elements (success states, WhatsApp button, Check In button) may reasonably map to `colorPalette.semantic.success`.

Report back: whether any `upi` payment records already exist (affecting how cleanly UPI can be removed), and confirm every item in the Verification Checklist with real data, not assumed behavior.
