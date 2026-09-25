# INIT PROMPT — MedBook AI
## Phase 8: Email Notifications (Resend) + Subscription Billing (Manual Bank Transfer / JazzCash / Easypaisa — replaces Stripe)
**Target tool:** OpenCode
**Prerequisite:** Phases 1–7 complete and verified — auth, clinic/services/availability, appointments/calendar, patients CRM, AI receptionist + public widget, and the website builder are all working.

---

## 0. IMPORTANT — READ BEFORE STARTING
This is an **extension of the existing project**, not a new build:
- Do **not** rebuild, replace, or unnecessarily refactor any existing functionality from Phases 1–7.
- Do **not** create a new project or a parallel billing system.
- The original PRD (Section 32–35 / Phase 11) specified **Stripe** for SaaS subscription billing. **This is an approved replacement**: Stripe is replaced with a **manual, Pakistan-friendly payment verification system** (Bank Transfer, JazzCash, Easypaisa + admin-reviewed proof upload). This is a deliberate scope change from the original PRD, not a deviation to flag back — proceed with the manual system as specified below.
- **This billing system is exclusively for the clinic/doctor's SaaS subscription to MedBook AI.** It is completely unrelated to patient appointment/consultation fees. Do not touch appointment pricing, patient booking, or the `services.price` field's existing behavior.
- Before writing any code: inspect the existing repo structure, database schema/migrations, auth/clinic-ownership logic (Phase 1–2), and the existing Resend setup if one already exists from earlier phases. Reuse existing tables/conventions — do not create duplicate user/clinic/subscription structures. Report findings before implementing.

---

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect from Phases 1–7. This phase adds financial/administrative logic — apply the same rigor as Phase 6/7's public-surface security work, plus careful handling of money, proof documents, and admin authorization.

## 2. OBJECTIVE
Build two related systems in this phase:
1. **Transactional email notifications** via Resend (appointment + auth emails, per the PRD).
2. **Manual subscription billing**: clinics choose a plan, pay via Bank Transfer/JazzCash/Easypaisa outside the app, upload proof, and a platform admin manually approves/rejects the payment — which then activates/extends the clinic's subscription. No automatic card charging, no Stripe.

---

## 3. SCOPE — PART A: Email Notifications (Resend)

Implement all required transactional emails using Resend (reuse the existing integration if one was scaffolded in an earlier phase — confirm first):

**Patient-facing:**
- Appointment confirmation
- Appointment cancellation
- Appointment reschedule

**Doctor/clinic-facing:**
- New appointment booked
- Appointment cancellation
- Appointment reschedule

**Auth-related** (confirm these don't already exist from Phase 1 — Supabase Auth may already send some of these natively; only build custom ones if the project needs branded versions):
- Email verification
- Password reset

**Billing-related** (see Part B for full detail):
- Payment submitted (under review)
- Payment approved (subscription active)
- Payment rejected (with reason)
- Subscription expiring soon (reminder)

All emails should use the clinic's/product's branding consistent with the established MedBook AI design tokens (teal `#0D9488` primary, Inter font) in a simple, clean HTML email template — not inline walls of unstyled text.

---

## 4. SCOPE — PART B: Manual Subscription Billing

### B1. Subscription Plans (data-driven, not hardcoded)
Reuse the plan concept from the PRD (Starter / Professional / Enterprise). The **database is the source of truth** for plan name, price, currency, billing interval, features, and active status — **never hardcode prices in the frontend**, and never trust a price passed via URL/query params (e.g. `/billing/checkout?plan=professional` must have the server look up the real plan/price from the DB, ignoring any price-like value from the client).

### B2. Admin-Configurable Payment Methods
Build an admin-only settings interface where the **platform owner** (not clinic owners) can configure:
- Bank Transfer details (bank name, account title, account number, IBAN)
- JazzCash (account/wallet number, account title)
- Easypaisa (account/wallet number, account title)
- Instructions text per method, active/inactive toggle, display order
- These must be **stored in the database and editable without a code change** — never hardcoded into React components.

### B3. Clinic Checkout / Payment Submission Page (`/app/billing/checkout`)
A 3-step flow (progress indicator: Step 1 → 2 → 3):
1. **Subscription Summary**: clinic name, selected plan, billing cycle, price, currency, final payable amount (visually prominent), current subscription status if applicable.
2. **Payment Method Selection**: display the admin-configured Bank/JazzCash/Easypaisa options as clear cards, with copy-to-clipboard buttons for account numbers/IBAN, and the configured instructions text.
3. **Upload Proof**: drag-and-drop upload (JPG/JPEG/PNG/WebP, PDF if practical), plus fields: payment method (pre-selected from step 2), sender name, sender mobile number, transaction ID/reference number, optional account title, optional notes. Validate: correct file type, max file size, required reference info, required proof file — do not allow submission without sufficient information.

On submit: create a `payment_submissions` record with status `pending`, send the "Payment submitted" email, and show a clear success/pending confirmation screen (not a silent redirect).

### B4. Admin Billing Review Panel (admin-only route)
Table/list of submissions showing: clinic, owner email, plan, amount, payment method, submitted date, transaction ID, sender phone, payment proof (viewable via secure signed URL, not a public link), and status (`pending`/`approved`/`rejected`/`expired`).
- **Approve** action → subscription becomes `active` (or extends its period on renewal), triggers the "Payment approved" email.
- **Reject** action → requires a rejection reason (free text), sets submission to `rejected`, subscription stays inactive/pending, triggers the "Payment rejected" email with the reason.
- Record `reviewed_by` (admin user id) and `reviewed_at` on every decision — audit trail, not just a status flip.

### B5. Subscription Lifecycle
Implement real states, not just a boolean:
```
pending_payment → payment_submitted → under_review → approved → active → expiring → expired
```
(and `payment_submitted → rejected → resubmit`)
- **A subscription only becomes `active` via explicit admin approval** — never by the clinic merely visiting checkout or uploading a file. This is a hard rule, not a suggestion.
- Feature access/entitlements must be derived from the current subscription status + plan (per PRD Section 35: `trialing`/`active`/`past_due`/`cancelled`/`incomplete` concepts adapt here to the manual-verification states above — map sensibly, e.g. `active` = full access, `expired`/`rejected`/`pending_payment` = restricted/read-only per whatever gating this phase decides to enforce).
- Renewal: when a subscription approaches expiry, show "Your subscription expires on [date]" with a **[Renew Subscription]** CTA that reopens the same checkout/proof flow — no automatic charging, ever.

### B6. Clinic Billing Dashboard (`/app/billing` or similar)
Shows: current plan, subscription status, amount, start date, expiry/renewal date, actions (`Renew Subscription`, `Change Plan`, `View Payment History`), and a payment history list (date, plan, amount, method, status, transaction reference) including any visible rejection reasons.

---

## 5. DATABASE WORK REQUIRED
First inspect the existing schema — do not duplicate tables/fields that already exist from earlier phases (e.g. if a `clinics` table already carries something plan-related, adapt rather than duplicate). Introduce, adapted to existing naming conventions:
```
subscription_plans:   id, code, name, price, currency, billing_interval, features (jsonb), active, created_at, updated_at
subscriptions:        id, clinic_id, plan_id, status, current_period_start, current_period_end, created_at, updated_at
payment_methods:      id, type, name, account_title, account_number, iban, instructions, active, sort_order, created_at, updated_at
payment_submissions:  id, clinic_id, subscription_id, payment_method_id, amount, currency, sender_name, sender_phone,
                       transaction_reference, notes, proof_file_path, status, rejection_reason, reviewed_by, reviewed_at,
                       created_at, updated_at
billing_events:       (audit trail — id, subscription_id or payment_submission_id, event_type, actor_user_id, metadata jsonb, created_at)
```
- If any Stripe-specific fields/env vars/dependencies already exist in the codebase from earlier scaffolding (per the original PRD's Phase 11 mention), **do not blindly delete them** — inspect first, then safely remove/deprecate what's genuinely unused, and report what was removed.
- **RLS**: maintain the existing multi-tenant pattern. Clinic A must never see/modify Clinic B's subscription, payment submissions, or payment proofs. Only platform admins can review/approve/reject submissions across clinics — this requires a real admin-role concept; check whether one already exists (e.g. a `platform_admins` table or a role flag) and use/extend it rather than inventing a second, incompatible admin system.
- **Storage**: create a **private** Supabase Storage bucket (e.g. `payment-proofs`) for uploaded proof files. Files must not be publicly accessible — serve them via signed URLs to authorized clinic users (their own submissions only) and authorized admins only. Never expose the service-role key client-side (same discipline as Phases 6–7).

---

## 6. SECURITY REQUIREMENTS (mandatory)
- Never trust plan price from the URL/query string or any client-supplied value — server computes/looks up amount from `subscription_plans`.
- Only admin-role users can approve/reject payments or otherwise activate a subscription — clinic users cannot self-activate.
- Payment proof files remain private; access via signed URLs/policies only.
- Validate uploaded file type and size server-side, not just in the UI.
- Cross-tenant isolation verified (RLS + explicit test).
- Record who approved/rejected and when (audit trail via `billing_events` and/or the `reviewed_by`/`reviewed_at` fields).
- Validate subscription period dates server-side when approving/extending.
- No secrets in client-side code.

---

## 7. DESIGN
Follow the existing `design.md` exactly — do not introduce a new visual language:
- Primary `#0D9488`, Secondary `#0F172A`, App background `#F9FAFB`, Surface `#FFFFFF`
- Text: primary `#111827`, secondary `#4B5563`, muted `#9CA3AF`
- Status: success `#22C55E`, error `#EF4444`, warning `#F59E0B`, info `#0EA5E9`
- Inter font; cards `12px` radius with subtle shadow; buttons `8px`; inputs `8px`
- UX polish beyond a plain clone of any reference layout: clear Step 1→2→3 progress indicator, responsive mobile layout, copy-to-clipboard for account numbers/IBAN, upload progress + file preview, clear pending/success/rejection states, strong CTA hierarchy, accessible labels/keyboard navigation, loading/skeleton/empty/error states, and the final payable amount visually prominent.

## 8. DEFINITION OF DONE
- [ ] All required Resend emails implemented and correctly triggered (appointment lifecycle, auth where applicable, billing lifecycle).
- [ ] Subscription plans are fully data-driven; no hardcoded prices in the frontend; server ignores any client-supplied price.
- [ ] Admin can configure payment methods without a code change.
- [ ] Clinic checkout flow (3 steps) works end-to-end with proper validation.
- [ ] Admin billing panel: view, approve (with audit fields), reject (with required reason) — all functional.
- [ ] Subscription only activates on explicit admin approval — verified, not just assumed.
- [ ] Clinic billing dashboard shows accurate status, history, and renewal CTA.
- [ ] RLS-enforced cross-tenant isolation verified for subscriptions, payment submissions, and proof files.
- [ ] Payment proof files are private, served only via signed URL to authorized users.
- [ ] Any leftover Stripe scaffolding inspected and safely removed/deprecated (reported, not silently deleted without review).

## 9. CONSTRAINTS
- Do not implement Stripe or any automatic card-charging flow — manual verification only.
- Do not connect this billing system to patient/appointment pricing in any way.
- Do not activate a subscription without explicit admin approval, under any code path.
- Do not expose payment proof files publicly or expose the service-role key client-side.
- Do not duplicate existing user/clinic/admin structures — extend what's already there.
- Keep this compatible with the existing Next.js/Supabase/Resend/Gemini architecture already established in Phases 1–7.

## 10. PROCESS
1. Inspect: existing repo structure, PRD.md, design.md, Supabase schema/migrations, existing auth/clinic-ownership and admin-role logic, existing Resend implementation, and any existing Stripe/Phase-11 scaffolding. Report findings — what's reusable, what needs to be added/changed — before writing code.
2. Propose the final DB schema (adapted to what already exists) and route structure before implementing.
3. Implement: migrations (plans, subscriptions, payment methods, submissions, billing events, storage bucket + policies) → admin payment-methods settings UI → clinic checkout/proof-upload flow → admin billing review panel → subscription lifecycle/entitlement logic → clinic billing dashboard → Resend email templates and triggers for the full billing lifecycle → appointment-related emails if not already done in an earlier phase.
4. Provide a verification checklist covering: cross-tenant isolation (Clinic A cannot see Clinic B's billing), valid payment submission end-to-end, invalid/missing-proof submission correctly rejected by validation, admin approval activates the subscription and sends the correct email, admin rejection with reason blocks activation and sends the correct email, unauthorized users cannot access proof files (test a direct URL guess), an expired subscription correctly loses paid-plan access, a renewal submission works, and confirm the frontend cannot manipulate plan price or self-activate a subscription (attempt it deliberately and confirm it's rejected server-side).

## 11. FINAL DELIVERABLE / REPORT FORMAT
At the end, provide a concise report containing: files created, files modified, database migrations created, storage bucket/policies created, RLS policies added, admin billing functionality summary, clinic billing functionality summary, Resend email functionality summary, testing performed (matching the checklist above), any required environment variables, any manual Supabase configuration needed (e.g. creating the admin role/first admin user), and any remaining limitations.

---

## 12. IMPLEMENTATION GUIDANCE

### 12A. API Route Structure (Next.js App Router)

**Email Routes** (`/app/api/email/`):
- `POST /api/email/appointment-confirmation` — sends confirmation to patient
- `POST /api/email/appointment-notification` — notifies clinic of new booking
- `POST /api/email/appointment-cancellation` — sends cancellation to patient/clinic
- `POST /api/email/appointment-reschedule` — sends reschedule notification
- `POST /api/email/billing-submitted` — payment proof received
- `POST /api/email/billing-approved` — subscription activated
- `POST /api/email/billing-rejected` — payment rejected with reason
- `POST /api/email/billing-expiring` — subscription renewal reminder

**Billing Routes** (`/app/api/billing/`):
- `GET /api/billing/plans` — returns active subscription plans (public-safe)
- `GET /api/billing/checkout` — returns checkout session data (clinic-authenticated)
- `POST /api/billing/checkout` — validates + creates payment submission
- `GET /api/billing/submissions` — lists clinic's submissions (clinic-scoped via RLS)
- `GET /api/billing/subscription` — returns current subscription status
- `POST /api/billing/renew` — initiates renewal flow

**Admin Billing Routes** (`/app/api/admin/billing/`):
- `GET /api/admin/billing/payment-methods` — list all payment methods
- `POST /api/admin/billing/payment-methods` — create payment method
- `PUT /api/admin/billing/payment-methods/[id]` — update payment method
- `DELETE /api/admin/billing/payment-methods/[id]` — soft-delete/deactivate
- `GET /api/admin/billing/submissions` — list all submissions (with filters)
- `GET /api/admin/billing/submissions/[id]` — single submission detail
- `POST /api/admin/billing/submissions/[id]/approve` — approve + activate
- `POST /api/admin/billing/submissions/[id]/reject` — reject with reason
- `GET /api/admin/billing/subscriptions` — list all subscriptions
- `GET /api/admin/billing/proof/[id]` — signed URL for proof file

**Admin Settings Routes** (`/app/api/admin/settings/`):
- `GET/POST/PUT/DELETE /api/admin/settings/payment-methods` — CRUD for methods

### 12B. Component Architecture

**Public/Billing Components** (`/components/billing/`):
- `PlanCard.tsx` — displays a single plan with features, price, CTA
- `PlanSelector.tsx` — grid of PlanCards for plan comparison
- `CheckoutWizard.tsx` — 3-step progress container (wraps steps below)
- `CheckoutSummary.tsx` — Step 1: plan + amount summary
- `PaymentMethodSelect.tsx` — Step 2: method cards with copy-to-clipboard
- `PaymentProofUpload.tsx` — Step 3: drag-drop upload + form fields
- `SubmissionStatus.tsx` — pending/approved/rejected status display
- `SubscriptionBadge.tsx` — small badge for sidebar/header showing plan + status
- `BillingDashboard.tsx` — full billing page layout (status + history + actions)
- `PaymentHistory.tsx` — table/list of past submissions
- `RenewalCTA.tsx` — prominent renewal banner when approaching expiry

**Email Components** (`/components/emails/`):
- `EmailBase.tsx` — shared HTML email wrapper (head, body, branding)
- `AppointmentConfirmation.tsx` — patient appointment confirmed
- `AppointmentNotification.tsx` — clinic new booking alert
- `AppointmentCancellation.tsx` — cancellation notice
- `AppointmentReschedule.tsx` — reschedule notice
- `BillingSubmitted.tsx` — proof received, under review
- `BillingApproved.tsx` — subscription activated
- `BillingRejected.tsx` — rejected with reason
- `BillingExpiring.tsx` — renewal reminder

**Admin Components** (`/components/admin/billing/`):
- `PaymentMethodManager.tsx` — CRUD interface for methods
- `PaymentMethodForm.tsx` — add/edit form with validation
- `SubmissionList.tsx` — filterable table of submissions
- `SubmissionDetail.tsx` — full detail + proof viewer + approve/reject
- `ProofViewer.tsx` — secure image/PDF viewer via signed URL
- `SubscriptionList.tsx` — all subscriptions table
- `RejectDialog.tsx` — modal requiring rejection reason

### 12C. Supabase Storage Setup

Create bucket `payment-proofs`:
- **Visibility**: Private (not public)
- **File size limit**: 10MB
- **Allowed MIME types**: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
- **Path structure**: `payment-proofs/{clinic_id}/{submission_id}/{filename}`
- **RLS policies**:
  - Clinic users can INSERT to their own `clinic_id` path
  - Clinic users can SELECT from their own `clinic_id` path (own submissions only)
  - Admin users can SELECT from any `clinic_id` path
  - No UPDATE/DELETE from client (admin handles via server)

### 12D. RLS Policy Patterns

**subscription_plans**:
```sql
-- Public can read active plans
CREATE POLICY "Public read active plans" ON subscription_plans
  FOR SELECT USING (active = true);
```

**subscriptions**:
```sql
-- Clinic owners see only their own
CREATE POLICY "Clinic owns subscription" ON subscriptions
  FOR SELECT USING (clinic_id = auth.uid()::text);

-- Admin sees all (requires admin role check function)
CREATE POLICY "Admin full access" ON subscriptions
  FOR ALL USING (is_platform_admin(auth.uid()));
```

**payment_methods**:
```sql
-- Public can read active methods (for checkout page)
CREATE POLICY "Public read active methods" ON payment_methods
  FOR SELECT USING (active = true);

-- Admin manages all
CREATE POLICY "Admin manages methods" ON payment_methods
  FOR ALL USING (is_platform_admin(auth.uid()));
```

**payment_submissions**:
```sql
-- Clinic sees only their own
CREATE POLICY "Clinic views own submissions" ON payment_submissions
  FOR SELECT USING (clinic_id = auth.uid()::text);

-- Clinic creates own submissions
CREATE POLICY "Clinic creates own submissions" ON payment_submissions
  FOR INSERT WITH CHECK (clinic_id = auth.uid()::text);

-- Admin sees and manages all
CREATE POLICY "Admin manages submissions" ON payment_submissions
  FOR ALL USING (is_platform_admin(auth.uid()));
```

**billing_events**:
```sql
-- Admin reads all; clinic reads events for their subscriptions
CREATE POLICY "Clinic reads own billing events" ON billing_events
  FOR SELECT USING (
    subscription_id IN (
      SELECT id FROM subscriptions WHERE clinic_id = auth.uid()::text
    )
  );

CREATE POLICY "Admin reads all billing events" ON billing_events
  FOR SELECT USING (is_platform_admin(auth.uid()));

CREATE POLICY "System inserts billing events" ON billing_events
  FOR INSERT WITH CHECK (true); -- server-side only via service role
```

### 12E. Email Template Specifications

Use `react-email` or plain HTML templates with inline styles (compatible with Resend). Each template must:
- Include MedBook AI logo/branding header (teal `#0D9488` banner)
- Use Inter font via Google Fonts `@import` or system font fallback
- Include a clear heading, body content, and CTA button where applicable
- Include a footer with MedBook AI branding + unsubscribe link (where required)
- Be responsive (max-width 600px, fluid images)
- Use dynamic clinic name, patient name, appointment details, plan details, amounts

**Email Subject Lines:**
| Email | Subject |
|-------|---------|
| Appointment Confirmation | `Your appointment is confirmed — {date} at {time}` |
| Appointment Notification | `New booking: {patient_name} — {date} at {time}` |
| Appointment Cancellation | `Appointment cancelled — {date} at {time}` |
| Appointment Reschedule | `Appointment rescheduled — {new_date} at {new_time}` |
| Payment Submitted | `Payment proof received — under review` |
| Payment Approved | `Payment approved — {plan_name} subscription active` |
| Payment Rejected | `Payment requires attention — please review` |
| Subscription Expiring | `Your {plan_name} subscription expires on {expiry_date}` |

### 12F. Subscription Entitlement Logic

Create a utility function `getSubscriptionEntitlements(clinicId)` that returns:
```typescript
{
  status: 'active' | 'pending' | 'expired' | 'rejected',
  plan: { name, code, features } | null,
  isExpired: boolean,
  daysUntilExpiry: number | null,
  canAccess: boolean, // true only when status=active AND not expired
  restrictedFeatures: string[] // features gated off when not active
}
```

**Enforcement points:**
- Middleware or layout-level check for `/app/` routes — redirect to `/billing` if `canAccess=false`
- API routes for premium features check entitlement before processing
- Public widget and website builder pages are NOT gated (free-tier access)
- AI receptionist responses may be limited or disabled for inactive subscriptions
- Do NOT gate patient/clinic auth, CRM, or basic appointment management

### 12G. Migration Strategy

Run migrations in order:
1. `subscription_plans` table + seed data (3 plans)
2. `subscriptions` table + foreign keys
3. `payment_methods` table + seed data (3 methods)
4. `payment_submissions` table + foreign keys
5. `billing_events` table
6. `is_platform_admin()` function
7. All RLS policies
8. Storage bucket + policies
9. Update any existing `clinics` table to add `subscription_id` FK if needed

### 12H. Environment Variables Required

```
RESEND_API_KEY=re_...          # Already exists from earlier phases
RESEND_FROM_EMAIL=billing@medbook.ai  # Or existing verified domain
RESEND_REPLY_TO=support@medbook.ai
SUPABASE_SERVICE_ROLE_KEY=...  # Already exists (server-side only for storage/emails)
NEXT_PUBLIC_SUPABASE_URL=...  # Already exists
NEXT_PUBLIC_SUPABASE_ANON_KEY=... # Already exists
ADMIN_EMAIL=admin@medbook.ai  # Platform admin email for critical notifications
```

---

## 13. TESTING CHECKLIST (verification before marking complete)

### Email Testing
- [ ] Send test appointment confirmation → renders correctly in Gmail, Outlook, Apple Mail
- [ ] Send test appointment cancellation → renders correctly
- [ ] Send test appointment reschedule → renders correctly
- [ ] Send test payment submitted email → renders correctly
- [ ] Send test payment approved email → renders correctly with plan details
- [ ] Send test payment rejected email → renders correctly with rejection reason
- [ ] Send test subscription expiring email → renders correctly with expiry date
- [ ] All emails show correct clinic branding (teal header, Inter font)
- [ ] All emails are responsive (test at 320px, 768px, 1200px width)

### Billing Flow Testing
- [ ] Clinic sees only active plans on checkout page
- [ ] Clinic selects plan → Step 1 shows correct amount from DB (not URL)
- [ ] Clinic selects payment method → copy-to-clipboard works for account/IBAN
- [ ] Clinic uploads proof → validates file type (reject .exe, .svg, etc.)
- [ ] Clinic uploads proof → validates file size (reject >10MB)
- [ ] Clinic uploads proof → validates required fields (sender name, phone, ref#)
- [ ] Submission created with status `pending` in database
- [ ] Clinic sees submission in payment history
- [ ] Clinic sees current subscription status on billing dashboard

### Admin Testing
- [ ] Admin can view all submissions across clinics
- [ ] Admin can view payment proof via signed URL (not public link)
- [ ] Admin can approve submission → subscription becomes `active`
- [ ] Admin approval triggers "Payment approved" email
- [ ] Admin approval records `reviewed_by` and `reviewed_at`
- [ ] Admin can reject submission with required reason
- [ ] Admin rejection triggers "Payment rejected" email with reason
- [ ] Admin cannot approve their own submission (if they're also a clinic owner)

### Security Testing
- [ ] Clinic A cannot see Clinic B's subscription (direct DB query attempt)
- [ ] Clinic A cannot see Clinic B's payment submissions (RLS enforced)
- [ ] Clinic A cannot access Clinic B's proof files (storage policy enforced)
- [ ] Non-admin user cannot access admin billing routes
- [ ] Non-admin user cannot approve/reject submissions
- [ ] Proof file URL is signed, expires, and is not publicly indexable
- [ ] Client-side code cannot manipulate plan price (server ignores it)
- [ ] Client-side code cannot self-activate subscription
- [ ] Service role key is never exposed to client

### Subscription Lifecycle Testing
- [ ] New clinic → subscription status is `pending_payment`
- [ ] After submission → status is `pending`
- [ ] After approval → status is `active` with correct period
- [ ] After rejection → status is `rejected`, can resubmit
- [ ] Approaching expiry → reminder email sent
- [ ] After expiry → status is `expired`, access restricted
- [ ] Renewal submission → extends subscription period on approval
- [ ] Feature gating enforced for inactive/expired subscriptions

---

## 14. EDGE CASES TO HANDLE

- **Double submission**: clinic submits while previous is still `pending` — allow or block? Recommend: block, show message "A payment is already under review"
- **Concurrent admin approval**: two admins approve same submission — use DB transaction + `FOR UPDATE` lock
- **Proof file corruption**: retry upload on failure, show clear error
- **Subscription expired mid-session**: check entitlement on each page load/API call
- **Plan change during active subscription**: prorate or wait until expiry? For manual system: wait until expiry, then switch on renewal
- **Currency mismatch**: ensure plan currency matches payment submission currency
- **Missing payment method**: if admin deactivates a method while checkout is in progress, gracefully handle
- **Large proof files**: chunked upload not needed for 10MB limit, but show progress indicator

---

## 15. DEPLOYMENT NOTES

- Run migrations via Supabase CLI or dashboard SQL editor
- Verify Resend domain is verified and DKIM/SPF records are set
- Set `RESEND_FROM_EMAIL` to a verified domain email
- Create first admin user manually in Supabase (INSERT into `platform_admins` or equivalent)
- Configure storage bucket via Supabase dashboard or CLI
- Test proof upload/access flow end-to-end in staging before production
- Monitor Resend delivery rates and bounce rates post-launch

---

## 16. WHAT NOT TO BUILD

- Do NOT build a Stripe integration or any card payment flow
- Do NOT build automated recurring billing (manual only)
- Do NOT build patient appointment fee collection
- Do NOT build invoice PDF generation (out of scope)
- Do NOT build refund processing (out of scope)
- Do NOT build multi-currency conversion (use single currency per plan)
- Do NOT build trial period logic (optional — discuss if needed)
- Do NOT build webhook endpoints for payment gateways

---

## 17. FUTURE CONSIDERATIONS (document but do not build)

These items are out of scope for Phase 8 but should be noted:
- Stripe integration for automatic card payments (may be added later for international users)
- Invoice PDF generation and email attachment
- Refund request workflow
- Usage-based billing (e.g., per-AI-response pricing)
- Team/seat-based pricing for multi-user clinics
- Coupon/discount code system
- Tax calculation and compliance
- Multi-currency support with real-time exchange rates

---

Confirm your understanding and the Step 1 inspection findings back to me before writing code. Do not start any further phase (Analytics, Production polish/launch) — I'll provide that init prompt once this phase is verified.
