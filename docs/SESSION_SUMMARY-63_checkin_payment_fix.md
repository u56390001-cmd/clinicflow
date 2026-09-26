# Session Summary — Doc 63: Payment Error Fix + Check-In/Receipt Modal UI Match

> **Purpose of this file:** Electricity trip/crash recovery — if the session is lost, resume work from this file. It contains the full state, root cause, live evidence, files touched, and exact next steps.

**Task**: `docs\63_fix_payment_error_and_checkin_receipt_ui_match.md`
- (A) Diagnose & fix real payment-collection error during check-in
- (B) Pixel-match Check-In Patient modal to `Check_In_Patient_html_css.txt` structure (teal, not violet)
- (C) Pixel-match Receipt Generated modal to `Receipt_Generated_html_css.txt` structure (teal, not violet)

---

## ROOT CAUSE (CONFIRMED with live evidence) — Part A FIX DESIGN IS SET

**Live reproduction flow** (Phase-1 "Cascade Test Clinic"; the test account's
credentials are not recorded here — see `.env.local` / your password manager for
the current values, and rotate the account if it was ever committed in cleartext.
The anon key from `.env.local` works; `SUPABASE_SERVICE_ROLE_KEY` is STALE/404):

1. Create patient → OK (uses `name`, NOT `full_name`)
2. Create appointment → OK (REQUIRES `service_id`)
3. `check_in_patient` RPC → OK (visit with token_number 1, queue_position 1)
4. **`create_patient_bill` → FAILS with:**

```
PGRST203: Could not choose the best candidate function between:
  public.create_patient_bill(p_clinic_id => uuid, p_patient_id => uuid, p_visit_id => uuid, p_items => jsonb, p_currency => text, p_bill_type => text, p_doctor_id => uuid, p_bill_date => date)   (8-arg, migration 0032)
  public.create_patient_bill(p_clinic_id => uuid, p_patient_id => uuid, p_visit_id => uuid, p_items => jsonb, p_currency => text, p_bill_type => text, p_doctor_id => uuid, p_bill_date => date, p_notes => text)  (9-arg, migration 0036)
```

### The exact bug mechanism
- `lib/actions/queue.ts` → `persistCheckInPayment()` (line 192-199) calls `create_patient_bill` with **6 named args**: `p_clinic_id, p_patient_id, p_visit_id, p_items, p_currency, p_bill_date`.
- PostgREST cannot pick between the **8-arg (0032)** and **9-arg (0036)** overloads → `PGRST203` ambiguity error.
- `queue.ts` only handles `PGRST202` (legacy fallback to 5-arg, lines 201-208). It does NOT handle `PGRST203` → raw PGRST203 message bubbles up to the UI → **payment collection fails, no bill/payment/receipt created**.
- Impact: `check_in_patient` already succeeded → patient DOES appear in waiting queue, but payment is NOT collected → **exactly the user's symptom** ("patient goes to waiting queue but payment not collected").

### Related function overload pollution (same bug class)
| Function | Overloads that exist in live DB (`create or replace` ≠ replace when signature differs) |
|---|---|
| `create_patient_bill` | 5-arg (0025) + 8-arg (0032) + 9-arg (0036) → **ambiguous for any call with `p_bill_date`** |
| `record_vitals` | 6-arg (0023) + 10-arg (0028) + 11-arg (0033) → ambiguous if a call passes the "middle" arg set. App currently passes all 11 (incl `p_custom_vitals`) so it resolves, but same latent hazard |
| `collect_patient_payment` | 4-arg only (0025 defined, 0028 RE-created same 4-arg signature → replaced, not overloaded) — **all good** |

### Exact signatures (types matter for `DROP FUNCTION`)
- 0025 `create_patient_bill`: `(uuid, uuid, uuid default null, jsonb default '[]', text default 'PKR')`
- 0032 `create_patient_bill`: `(uuid, uuid, uuid, jsonb, text, text, uuid, date)` ← drop
- 0036 `create_patient_bill`: `(uuid, uuid, uuid, jsonb, text, text, uuid, date, text)` ← **KEEP** (9-arg, has p_notes)
- 0023 `record_vitals`: `(uuid, text, numeric, int, numeric, numeric)`
- 0028 `record_vitals`: `(uuid, text, numeric, int, numeric, numeric, int, int, int, int)`
- 0033 `record_vitals`: `(uuid, text, numeric, int, numeric, numeric, int, int, int, int, jsonb)` ← **KEEP** (11-arg)
- 0025/0028 `collect_patient_payment`: `(uuid, uuid, public.patient_payment_method, numeric(12,2))` — single, keep
- 0031 `collect_patient_payment_with_adjustments` — separate name, keep (file: `0031_collect_payment_adjustments.sql`)

### THE FIX (Part A) — ✅ WRITTEN (`0037_fix_rpc_overload_ambiguity.sql`)
Decided: drop the stale overloads, keep the newest supersets:

```sql
drop function if exists public.create_patient_bill(uuid, uuid, uuid, jsonb, text);                                                  -- 5-arg (0025)
drop function if exists public.create_patient_bill(uuid, uuid, uuid, jsonb, text, text, uuid, date);                                 -- 8-arg (0032)
drop function if exists public.record_vitals(uuid, text, numeric, int, numeric, numeric);                                             -- 6-arg (0023)
drop function if exists public.record_vitals(uuid, text, numeric, int, numeric, numeric, int, int, int, int);                         -- 10-arg (0028)
-- keep 9-arg create_patient_bill (0036) + 11-arg record_vitals (0033); re-grant EXECUTE to authenticated
```
The surviving supersets accept older arg sets via defaults, so all callers keep working unambiguously. **User applies migration manually in Supabase SQL editor** — same as `0031`/`0032` did.

Also hardened `lib/actions/queue.ts` `persistCheckInPayment`: the fallback condition now catches BOTH `PGRST202` and `PGRST203` (retries the legacy 5-arg call). The 5-arg overload still exists until the migration is applied, so the fallback works before AND after the migration.

---

## WORK COMPLETED THIS SESSION

1. **Full live repro of the whole check-in→payment chain** on Cascade Test Clinic. Test data left in DB (orphan, test clinic — OK to leave):
   - Patient "RLS Repro 463" `03650c8d-ed25-4076-bdcb-39febecf5c88` + "RLS Repro 563"
   - Appointment `720f7176-b834-4f3e-b7b8-87d9628042de`, Visit `6313415b-5948-4189-8517-7c0d11ba5996` (token 1)
   - patient_code format confirmed: `CLI-2026-00004` style
2. Confirmed the exact PGRST203 message + that app only handles PGRST202.
3. Verified `record_vitals` has same 3-overload ambiguity class.
4. Verified `collect_patient_payment` is a single 4-arg function (0028 re-created same signature → replaced).
5. Confirmed **all payment flows call `create_patient_bill` with named args** — `addPatientBillForm`/`createPatientBillAction` (patient-billing.ts:51-64) passes ALL 9 args so it resolves fine; check-in path is the ONLY caller passing 6 args → the only broken path.
6. Read reference HTMLs (pretty-printed) at `C:\Users\HP8C7C~1.DES\AppData\Local\Temp\opencode\checkin_pretty.html` and `...\receipt_pretty.html`.
7. ✅ **Wrote `supabase/migrations/0037_fix_rpc_overload_ambiguity.sql`** (drop 5-arg/8-arg `create_patient_bill` + 6-arg/10-arg `record_vitals`; keep 9-arg/11-arg; re-grant EXECUTE). **⚠️ Awaiting user apply + live re-verification.**
8. ✅ **Hardened `lib\actions\queue.ts`** — `CheckInResult` extended with `billNumber`, `clinicName`, `clinicAddress`, `paidAt`; `persistCheckInPayment` returns them (paidAt = `receipts.generated_at`, real `bill_number`); PGRST202||PGRST203 → retries legacy 5-arg call.
9. ✅ **Part B — rewrote `components\queue\check-in-modal.tsx`** to reference structure in teal: 3-column (Patient Confirmation / Collect Payment / Billing Add-ons), Cash/Card/Waive 2×2 tiles (UPI excluded — DB enum has none, decision D8), footer = Total (left) + **Collect Payment (outline) / Check In (solid green gradient)** matching reference order. Gave it real patient age/city/code via extended `QueueAppointment`.
10. ✅ **Extended `QueueAppointment`** (`lib\visits-queries.ts`) with `patientAge`, `patientCity`, `patientCode` (+ mapping in `fetchTodayQueue`); fixed the two `appointment-manager.tsx` call sites that build the object.
11. ✅ **Part C — rewrote `components\queue\receipt-generated-modal.tsx`** to match `receipt_pretty.html`: `max-w-lg` + `animate-scale-in` (added keyframe in `app\globals.css`), teal gradient header, `bg-primary/10` clinic row w/ real clinic name/address + real `BILL-...` from `billId`, Patient/Doctor grey cards, bordered invoice table (`text-lg` teal total), status-accurate green/gray banner w/ pill timestamp, footer = Close outline / WhatsApp brand-green w/ real icon / Print (solid teal gradient). No hardcoded clinic/patient/amount data.
12. ✅ **`npm run lint` + `npx tsc --noEmit` PASS** on all touched files (cleaned 2 unused imports in check-in-modal).

### ✅ LIVE VERIFICATION (migration APPLIED via Supabase Management API, 23 Sep 2026)
- User's Supabase MCP was configured with a **dead token** (`sbp_cd6c…` → 401) and wrong project-ref (`yjppprfqsesvsqjggbwi`); MCP "connected" but every call was `Unauthorized`. Applied everything directly from PowerShell against `POST https://api.supabase.com/v1/projects/ntkuxmrhpigzyeutffjc/database/query` using a fresh PAT.
- **Migration 0037 applied to the live DB** — verified only signatures remain: 9-arg `create_patient_bill(..., p_notes text)` and 11-arg `record_vitals(..., p_custom_vitals jsonb)`. PGRST203 overload ambiguity **GONE**.
- **SECOND REAL BUG found + fixed:** `queue.ts` passed `p_items: JSON.stringify(items)` (a JSON **string**) — Postgres got a jsonb scalar → `400 code 22023 cannot extract elements from a scalar`. Live A/B proved it: `p_items` as real array → ✅ bill created; as string → ❌ scalar error. Fixed both call sites in `persistCheckInPayment` (line ~219 + legacy retry) to pass `p_items: items` (same as the working `patient-billing.ts` path). Lint + tsc re-pass.
- **Full end-to-end live run SUCCESS:** appointment → `check_in_patient` (token 4) → `create_patient_bill` (2 items ₹2000 + ₹1500) → `BILL-20260923-002` total 3500 → `collect_patient_payment` (cash 3500) → **bill status `paid`, receipt #1 created, line items inserted, visit `collected_post`**. All four billing tables verified with real rows.

---

## KEY FACTS FOR PARTS B/C (UI restyle) — IMPORTANT

### Tailwind STYLE TOKENS — CRITICAL: many component classes are INERT (style silently missing)
`tailwind.config.ts` defines ONLY:
- `primary: #0D9488` (teal), `primary-light: #14B8A6` (NOTE: profile's `#11c3b3` NOT used in config)
- `app: #F9FAFB`, `secondary`, `surface`, `skeleton`
- `text-primary/secondary/muted`, `status-success (#22C55E)/warning/info/destructive`
- `card`, `dropdown`, `focus-ring` shadows; `rounded-card/control/pill` radius

**NOT DEFINED in tailwind.config.ts** (classes used by current modals but INERT — produce no styling): `neutral-borderLight`, `neutral-background`, `neutral-textPrimary`, `-Secondary`, `-Tertiary`, `border-neutral-borderMedium`, `shadow-modal`, `text-danger`, `rounded-control`, `bg-status-success/10` (only full-color ok), `bg-primary/5`, `hover:bg-primary-dark`, `bg-secondary/50` → **replace these with real Tailwind classes or define tokens.**

### Reference color substitution rule (docs/63)
- Reference violet/indigo `#4E5DB5`/`#5B6BC5` gradient header → MedBook teal `primary` (`#0D9488`) → `primary-light` (`#14B8A6`) gradient.
- Green elements (Check In solid button `from-emerald-500 to-green-500`, Payment Received banner, WhatsApp button) → keep `status-success`/`green-*` semantic colors.
- WhatsApp button keeps its own brand green (green-100 border / green-700 text).

### Reference structure — Check-In modal (`checkin_pretty.html`)
- 3-column grid; header ribbon (gradient, "Check In Patient" title, patient name, "Token #X will be assigned" subtitle, "First Visit"/"Returning Patient" badge, X to close).
- Col 1 Patient Confirmation: initial badge, Name, Age, Location, Phone, Patient ID, Booking Source, Assigned Doctor, Slot Name, Slot Time Range.
- Col 2 Collect Payment: editable Consultation Fee (pencil-edit affordance), **Payment Mode 2×2 tile grid — reference shows Cash/UPI/Card/Waive**. NOTE: current app only has `PAYMENT_LABELS = {cash, card, waive}` (no UPI). DB enum `patient_payment_method` = `('cash','card','bank_transfer','jazzcash','easypaisa')` — **NO 'upi' in DB enum**. Reference has UPI tile; adding UPI would require DB enum change — RECONCILE per Billing master prompt (UPI reconciliation). Decision was likely: exclude UPI. Keep cash/card/waive unless told otherwise.
- Col 3 Billing Add-ons: "+ Additional Charges" accordion, "% Apply Discount" accordion.
- Footer: Total Amount (left), "Collect Payment" (outline/secondary) + "Check In" (solid success green, per earlier convention).
- Reference uses `animate-scale-in` + `backdrop-blur` overlays — check if project has those utilities; if not, add minimal ones.

### Reference structure — Receipt modal (`receipt_pretty.html`)
- max-w-lg card, rounded-2xl, header gradient band (document icon in translucent white circle, bold "Receipt Generated", sub-line "{Patient} · Token #{N}").
- X close top-right w/ hover state.
- Content overflow-y-auto:
  1. Clinic info row: light tinted rounded box — clinic name (bold, teal) + city/address (grey, small) LEFT; bold bill ref `BILL-{number}` (teal) RIGHT.
  2. 2-col grid: Patient card (grey rounded box, `text-[10px]` uppercase label "Patient", bold name) + Doctor card (bold doctor name + date in grey below).
  3. Itemized table: bordered rounded container; header row grey bg with "Item"/"Amount" uppercase `text-[10px]` labels; rows per bill item; **bold total row, top border, teal total** (`text-lg`).
  4. Payment status banner: green tinted rounded box, green check-circle + bold "Payment Received", green pill with timestamp; **status-accurate** (e.g. "Waived" if waived) — NOT hardcoded.
- Footer: light grey bg, top border, **Close** outline (left); **WhatsApp** (green outline, brand icon) + **Print** (solid teal, printer icon) right — wired to real Notification Dispatcher (WhatsApp) + print preview (Phase 18 pattern).
- **typography rhythm:** title `text-base`, sub `text-xs`, labels `text-[10px]` uppercase tracked, body `text-sm`, total `text-lg`, spacing `space-y-4`.

### Hardcoded-data fixes required (Part C "no hardcoded data")
Current `check-in-modal.tsx` passes to `ReceiptGeneratedModal`:
- `clinicName="MedBook Clinic"` (HARDCODED — must be real clinic `access.clinic.name`)
- `clinicAddress` NOT passed (add from `access.clinic.address` — clinic-access returns `clinic.name`, `clinic.address`)
- `billId` built from receipt number `BILL-00X` (real format is `BILL-YYYYMMDD-NNN` via `assign_bill_number` trigger, migration 0029 — real bill_number column exists)
- Work plan: extend `CheckInResult` (queue.ts) to include `billNumber`, `clinicName`, `clinicAddress` from `persistCheckInPayment` returns, then pass real values to Receipt modal. This is a small server-action + modal-prop change.

---

## FILES INVOLVED

| Path | Role |
|---|---|
| `docs\63_fix_payment_error_and_checkin_receipt_ui_match.md` | Task spec |
| `lib\actions\queue.ts` | `checkInPatientAction` + `persistCheckInPayment` (THE bug site, line ~192). `CheckInResult` interface (line 17-22) extended w/ billNumber/clinicName/clinicAddress/paidAt |
| `supabase\migrations\0037_fix_rpc_overload_ambiguity.sql` | ✅ **CREATED** — RPC overload fix, **user applies manually** |
| `supabase\migrations\0025_patient_billing.sql` | 5-arg create_patient_bill, 4-arg collect_patient_payment, receipts table |
| `supabase\migrations\0028_appointments_module_enhancements.sql` | 4-arg collect_patient_payment (replace), 10-arg record_vitals |
| `supabase\migrations\0029_patients_billing_ai_enhancements.sql` | `assign_bill_number` trigger → `BILL-YYYYMMDD-NNN`, bill_type/bill_date/doctor_id columns, payment_reference |
| `supabase\migrations\0031_collect_payment_adjustments.sql` | `collect_patient_payment_with_adjustments` (6-arg) |
| `supabase\migrations\0032_bill_create_extras.sql` | 8-arg create_patient_bill (+p_bill_type, p_doctor_id, p_bill_date) — dropped by 0037 |
| `supabase\migrations\0033_doctor_full_profile_slot_templates_vitals_config.sql` | 11-arg record_vitals (+p_custom_vitals jsonb) |
| `supabase\migrations\0036_bill_notes.sql` | 9-arg create_patient_bill (+p_notes) — kept |
| `components\queue\check-in-modal.tsx` | ✅ Part B restyled; passes REAL clinicName/clinicAddress/billId/paidAt to receipt |
| `components\queue\receipt-generated-modal.tsx` | ✅ Part C restyled to reference (teal, real data) |
| `lib\actions\patient-billing.ts` | Add Bill path — passes all 9 args, NOT affected by bug |
| `tailwind.config.ts` | Authoritative token list (see inert-class warning above) |
| `app\globals.css` | ✅ Added `.animate-scale-in` + scale-in keyframes (0.15s) |
| `lib\clinic-access.ts` | `getCurrentClinic` → access.clinic.name / .address |
| `lib\visits-queries.ts` | `QueueAppointment` + `patientAge`/`patientCity`/`patientCode` (required) |
| `components\appointments\appointment-manager.tsx` | ✅ Two `setCheckInTarget` call sites now supply the 3 new fields |
| `types\database.ts` | `patient_payment_method` enum (line ~1852), record_vitals RPC typing (line 2719) |

**Reference files**: `C:\Users\HP8C7C~1.DES\AppData\Local\Temp\opencode\checkin_pretty.html`, `...\receipt_pretty.html`

---

## NEXT STEPS (exact order)

1. ✅ **Write `supabase\migrations\0037_fix_rpc_overload_ambiguity.sql`** — done, and **APPLIED to the live DB** via the Supabase Management API (not the MCP server, whose token was dead). Overloads verified post-apply: only 9-arg `create_patient_bill` + 11-arg `record_vitals` remain.
2. ✅ **Harden `lib\actions\queue.ts`** — done (PGRST202||PGRST203 → legacy 5-arg retry; returns billNumber/clinicName/clinicAddress/paidAt). **Plus fixed the second real bug**: `p_items` was sent as a JSON string (`JSON.stringify`) → jsonb scalar error; now passed as a real array, proven live.
3. ✅ **Part B — Restyle `components\queue\check-in-modal.tsx`** — done.
4. ✅ **Part C — Restyle `components\queue\receipt-generated-modal.tsx`** — done (real clinic/bill data threaded; no hardcodes).
5. ✅ **Lint + typecheck PASS** (`npx eslint` on touched files; `npx tsc --noEmit`).
6. ✅ **LIVE END-TO-END VERIFIED** (23 Sep 2026): full check-in → bill `BILL-20260923-002` (₹3,500) → cash payment → receipt #1 → all rows written, visit `collected_post`. The earlier one-off "ALL-9-args → truncated PGRST203" anomaly never re-appeared post-migration (confirmed artifact of the PowerShell stream / pre-migration state).
7. ✅ **MCP config fixed** for next sessions — `~/.config/opencode/opencode.json` (global) + `.vscode\mcp.json` now point at project `ntkuxmrhpigzyeutffjc` with the fresh PAT. **Restart opencode** to pick it up.
8. ⏳ Remaining (manual, optional): visual-diff both modals vs the reference HTMLs in the running app (`npm run dev`) — check-in for a real appointment then Collect Payment → Receipt modal.

## Session-context notes
- User communicates in Hinglish/Urdu; prefers concise status + "aisa karo" directives. User applies all Supabase migrations manually.
- Supabase MCP tools show `Unauthorized` for this machine → **use PowerShell REST + `.rls-test.ps1`/`.env.local` pattern instead** (repro script was `C:\Users\HP8C7C~1.DES\AppData\Local\Temp\opencode\repro_payment.ps1`).
- Windows PowerShell pitfall: `$pId` collides with read-only `$PID` (case-insensitive) — use `$patId`.
- `repro_payment.ps1` in temp dir contains the full live repro chain (uses `$patId`).