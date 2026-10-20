# Plan — Redesigned plans (PK market), full module coverage, first-run setup, per-clinic AI key

> **Review this document, then decide: execute or not.**
> Status: **planning only — nothing implemented yet.** The 4 open questions in
> §7 need your answer before I start.

## Executive summary (2 minutes)

**What is broken**
1. A plan is decoration. `lib/plan-features.ts` (a correct gate engine) is used
   in exactly one place — `lib/actions/integrations.ts`. `app/app/layout.tsx`
   has no gate; the sidebar filters by **role**, not plan. Result: **Majid
   Wellness Center (Starter, PKR 2,999) has every module** — AI Agent, Website,
   Growth, WhatsApp, Integrations.
2. A clinic approved through the new funnel lands straight in the dashboard —
   the first-run setup wizard never opens (it only shows for users with *no*
   clinic, and the wizard would create a **second** clinic if run).
3. Every clinic without its own LLM key silently uses the **platform's**
   `GEMINI_API_KEY` (`lib/ai/provider.ts:54-58`) — that is why "my key got
   applied to this clinic too".

**What I propose**
- A **contract**: every one of the 28 modules is classified as plan feature,
  add-on, or always-on core — no orphan pages (§2).
- An **enforcement layer**: one resolver consulted by the route guard, the
  server actions, the sidebar and the dashboard cards (§1, §4.B).
- **Redesigned plans** priced for the Pakistani market: Solo 2,499 / Clinic
  6,999 / Practice 16,999, with seat limits instead of patient caps, and
  WhatsApp/TV queue moved into the Clinic tier because WhatsApp *is* the
  product here (§3).
- **Mandatory first-run setup** after approval (§4.C).
- **BYOK**: every clinic uses its own Gemini key; the platform key is never a
  silent fallback, and no page dead-ends when a key is missing (§4.E).

**What it costs / risks**
- Two migrations (0113, 0114), ~15 files touched, ~2–3 days of work.
- Main risk: existing clinics losing access to Growth/Engagement/WhatsApp on
  deploy day → handled by the 0114 backfill (§4.A).
- The plan data changes are reversible (a migration), but the **marketing
  copy** on the landing page must be updated in the same release or it will
  promise the old packaging.

**Order of work** (each step is independently shippable): see §6.

---

## 0. The core principle we are fixing

Right now a plan is **decoration** and the app is **all-or-nothing**:

- `lib/plan-features.ts` (a correct gate engine) is used in exactly **one**
  place — `lib/actions/integrations.ts`. Nothing else reads a plan.
- `app/app/layout.tsx` has no gate; `components/app/app-sidebar.tsx` filters
  the nav **by role only** (`FULL_NAV_ROLES` includes `owner`).
- `subscription_plans.features` has 8 keys for ~27 modules.
- The add-on catalogue (`clinic_addons`) is never used to gate a page.

Result: **Majid Wellness Center (Starter, PKR 2,999) has every module** —
AI Agent, Website, Booking Page, Growth Agent, Engagement, WhatsApp Setup,
Integrations. The plan did not work because there is no *entitlement layer* at
all, not because the plan data is wrong.

The fix has two halves, and both are needed:

**(a) A contract** — every module in the product is named in the plan data
(plan feature, add-on, or always-on core). No module may be unclassified.
**(b) An enforcement layer** — one resolver, consulted by the route guard, the
server actions, the sidebar and the dashboard cards.

---

## 1. Best practice being applied

Entitlements are **derived state**, never a stored flag:

```
entitlements(clinic) = subscription.state × plan.features      (boolean modules)
                     + plan.limits                            (numeric: seats)
                     + active clinic_addons                   (boolean + quantity)
```

| # | Layer | What it does | Why |
|---|---|---|---|
| 1 | **Resolver** `getEntitlements(clinicId)` | one cached query set → `{plan, state, features[], addons[], limits, used}` | single source of truth; no drift between screens |
| 2 | **Route guard** (middleware) | path → required entitlement → upgrade screen | typing the URL must not bypass it |
| 3 | **Action gate** (server actions) | re-check before every write (incl. seat limits) | a hidden button is not access control |
| 4 | **UI affordance** | lock badge + "Upgrade" / "Add-on" CTA; locked dashboard card | the user must see what they can buy |
| 5 | **Lifecycle** | `pending_payment → payment_submitted → active → expiring → expired → grace → locked` | payment state decides what is unlocked |

Rules that keep it from feeling punitive:
- **No dead ends** — a locked module renders a *page* (what it does, which plan
  has it, one button). Never a 403, never a blank.
- **Downgrade keeps data** — locking hides the entry point; records survive.
- **Grace** — `expired` → read-only for a few days with a renewal prompt.
- **BYOK** — each clinic brings its own LLM key; the platform key is never a
  silent fallback.

---

## 2. Full module inventory → entitlement (nothing left over)

Every sidebar item, settings-rail item and public surface in the app:

| # | Module | Route | Classification | Solo | Clinic | Practice |
|---|---|---|---|---|---|---|
| 1 | Dashboard | `/app/dashboard` | core | ✔ | ✔ | ✔ |
| 2 | Appointments | `/app/appointments` | core `appointments` | ✔ | ✔ | ✔ |
| 3 | Consultation & prescriptions | `/app/consultation` | core `consultations` | ✔ | ✔ | ✔ |
| 4 | Calendar | `/app/calendar` | core | ✔ | ✔ | ✔ |
| 5 | Inbox | `/app/inbox` | core | ✔ | ✔ | ✔ |
| 6 | Patients (records, docs, vitals, alerts) | `/app/patients` | core `patients` | ✔ | ✔ | ✔ |
| 7 | Patient Billing (invoices, receipts) | `/app/patient-billing` | core `patient_billing` | ✔ | ✔ | ✔ |
| 8 | Doctors | `/app/doctors` | core + seat limit | 1 seat | 5 seats | unlimited |
| 9 | Manage Team | `/app/settings/team` | core + seat limit | 3 logins | 15 logins | 50 logins |
| 10 | Patient ID / Bill settings / Prescription | `/app/settings/*` | core | ✔ | ✔ | ✔ |
| 11 | **Public online booking page** | `/app/booking-page`, `/book/[slug]` | plan `online_booking` | ✔ | ✔ | ✔ |
| 12 | Google Sheets export | `/app/integrations` | plan `google_sheets` | ✔ | ✔ | ✔ |
| 13 | **AI Receptionist (chat)** | `/app/ai-settings`, `/app/ai-test` | plan `ai_receptionist` | ✘ | ✔ | ✔ |
| 14 | **Website builder + custom domain** | `/app/website` | plan `website` | ✘ | ✔ | ✔ |
| 15 | **WhatsApp Business connection** | `/app/whatsapp` | plan `whatsapp` | ✘ | ✔ | ✔ |
| 16 | **Patient Engagement (WhatsApp reminders/reviews)** | `/app/engagement` | plan `whatsapp` | ✘ | ✔ | ✔ |
| 17 | **Smart TV queue display** | `/app/settings/tv-display`, `/display/queue` | plan `queue` (1 display) | ✘ | ✔ | ✔ (unlimited) |
| 18 | **Video consultations (telehealth)** | `/app/settings/video-calling` | plan `telehealth` | ✘ | ✔ | ✔ |
| 19 | Google Calendar / Meet sync | `/app/integrations` | plan `google_calendar` / `google_meet` | ✘ | ✔ | ✔ |
| 20 | **Multi-branch** (`parent_organization_id`) | organization | plan `multi_branch` | ✘ | ✘ | ✔ |
| 21 | **Assessment library + AI psychometrics** | `/app/settings/assessment-library` | plan `assessments` | ✘ | ✘ | ✔ |
| 22 | Coming soon: Intake / MSE / Note templates | `/app/settings/*` | plan `clinical_templates` | ✘ | ✘ | ✔ (planned) |
| 23 | **Growth Agent** (Google posts) | `/app/growth-agent` | **add-on** `growth-agent` | add-on | add-on | add-on |
| 24 | AI Review Assistant | (coming soon) | **add-on** `ai-review-assistant` | add-on | add-on | add-on |
| 25 | Add-ons marketplace | `/app/addons` | always | ✔ | ✔ | ✔ |
| 26 | Subscription billing | `/app/billing` | always | ✔ | ✔ | ✔ |
| 27 | Help & support | `/app/support` | always (priority tier = faster) | ✔ | ✔ | ✔ |
| 28 | Registrations / Payment submissions / Payment methods | `/app/admin/*` | platform admin (internal, not a plan) | — | — | — |

**Every module is classified.** No extras, no orphan pages.

---

## 3. The redesigned plans (Pakistani market)

### Market grounding
- A solo GP in Lahore/Karachi charges PKR 1,500–2,500 per patient, sees 15–30
  patients/day → a clinic will pay for software that removes admin work, not
  for features.
- A 2–4 doctor polyclinic runs PKR 6,000–15,000 revenue per doctor per month.
- Software budget reality: **PKR 1,500–5,000/month** for a small clinic;
  above ~PKR 8,000 the ROI must be visible (WhatsApp answering, bookings
  captured, fewer no-shows).
- **WhatsApp is the default channel** in Pakistan — a clinic without WhatsApp
  automation is not really "set up". It is the *aha* feature, so it belongs in
  the mid tier, not behind a PKR 1,299 add-on nobody will discover.
- Payment reality: cash/JazzCash/Easypaisa/transfer, no auto-renew — the
  manual payment + admin approval flow we built is genuinely market-correct.
- **No patient-record cap.** Capping records punishes a busy clinic; the
  current marketing promise ("up to 100 patients") is both hostile and easy to
  break. Cap **seats** and sell **extra seats** instead.

### The three plans

| | **Solo** | **Clinic** | **Practice** |
|---|---|---|---|
| Price / month | **PKR 2,499** | **PKR 6,999** | **PKR 16,999** |
| Code (unchanged) | `starter` | `professional` | `enterprise` |
| Who it is for | 1 doctor, small practice | 2–5 doctor clinic | Hospital / multi-branch group |
| Doctor seats | 1 | 5 | unlimited |
| Team logins | 3 | 15 | 50 |
| Appointments, calendar, inbox, patients, prescriptions, consultation | ✔ | ✔ | ✔ |
| Patient billing (invoices, receipts) | ✔ | ✔ | ✔ |
| Public online booking page | ✔ | ✔ | ✔ |
| Google Sheets export | ✔ | ✔ | ✔ |
| Website builder + custom domain | ✘ | ✔ | ✔ |
| AI Receptionist (web chat, clinic's own key) | ✘ | ✔ | ✔ |
| WhatsApp Business + AI receptionist + engagement | ✘ | ✔ | ✔ |
| Google Calendar + Meet sync | ✘ | ✔ | ✔ |
| Video consultations | ✘ | ✔ | ✔ |
| Smart TV queue (1 display) | ✘ | ✔ | ✔ |
| Multi-branch | ✘ | ✘ | ✔ |
| Assessment library + AI psychometrics | ✘ | ✘ | ✔ |
| Priority support + dedicated onboarding | ✘ | ✘ | ✔ |

Price ladder: 2,499 → 6,999 (2.8×) → 16,999 (2.4×) — a clean step-up each
time, and every price is a "just under" number the market uses.

### Add-ons (scalable extras only, never "features you need to use the product")

| slug | Price | Purpose |
|---|---|---|
| `extra-doctor-seat` | 199 /mo | each doctor beyond the plan's seats |
| `extra-tv-display` | 299 /mo | each additional waiting-room display |
| `extra-whatsapp-number` | 499 /mo | a second WhatsApp Business number (new) |
| `growth-agent` | 1,500 /mo | Google Business Profile posts + campaigns |
| `ai-review-assistant` | 1,500 /mo | Coming Soon (keep as is) |
| `priority-setup` | 2,500 one-time | data migration + setup session (new) |
| `whatsapp-ai-receptionist` (legacy) | — | **now included in Clinic+**; keep the row so existing purchases stay valid, relabel it "Included in Clinic plan" |
| `queue-management-system` (legacy) | — | **now included in Clinic+**; same treatment |

**Change from the earlier decision (flagged for you):** WhatsApp + Engagement
+ the TV queue move from *add-ons* to *plan features* of the Clinic tier. In
Pakistan WhatsApp automation is the product, not an upsell. What remains
sellable as an add-on is *scale* (extra seats, extra displays, extra numbers).

---

## 4. Work items

### A. Data (migrations)

**0113 — plans rewritten**
- `subscription_plans`: prices 2,499 / 6,999 / 16,999; display names
  Solo / Clinic / Practice (codes unchanged); `features` jsonb replaced with the
  authoritative key set from §2; **new column `limits jsonb not null default '{}'`**
  for `{"doctor_seats":n,"team_seats":n}`.
- Feature keys added: `online_booking`, `whatsapp`, `queue`, `telehealth`,
  `multi_branch`, `assessments`, `clinical_templates` (alongside the existing
  `appointments`, `patients`, `ai_receptionist`, `website`, `priority_support`,
  `google_*`).
- Legacy add-ons: `whatsapp-ai-receptionist` and `queue-management-system` get
  `badge_text = 'Included in Clinic plan'` (rows kept → existing purchases stay
  valid). New add-on rows: `extra-whatsapp-number`, `priority-setup`.
- `clinics.onboarding_completed_at timestamptz` (see §4.C).

**0114 — backfill (rollout safety)**
- Existing clinics keep what they use today: every clinic with an active
  subscription gets `growth-agent` + `whatsapp-ai-receptionist` +
  `queue-management-system` rows in `clinic_addons` (active) so nobody is
  locked out of a module on deploy day. New clinics must buy them.
- Existing `subscription_plans` rows are re-pointed at the new features/limits
  by plan code — clinics that were on Professional keep the modules they had
  (Professional is a superset of the old Professional).

### B. Resolver + route guard
- **New `lib/entitlements.ts`** (edge-safe, importable by the middleware):
  - `getEntitlements(supabase, clinicId)` → `{ plan, subscriptionState,
    hasActiveSubscription, features: string[], addons: string[],
    limits: {doctorSeats, teamSeats}, usage: {doctors, members} }`
  - `ROUTE_ENTITLEMENTS: Record<string, {feature?: string; addon?: string;
    label: string}>` — the §2 table, one place, used by the guard, the sidebar,
    the dashboard cards and the upgrade copy.
  - `isRouteAllowed(entitlements, pathname)`.
  - Reuse `isFeatureIncluded` / `isGrantingSubscription` from
    `lib/plan-features.ts`; read add-ons through the existing `is_addon_active`
    RPC.
- **`middleware.ts`**: after the existing auth redirect, for `/app/*`:
  1. **First-run gate** → `onboarding_completed_at IS NULL` → `/app/clinic/setup`
     (allowlist: the setup page, `/app/billing`, `/app/support`, `/app/admin/*`).
  2. **Entitlement gate** → path needs a feature/add-on the clinic lacks →
     `/app/billing?upgrade=<key>` (the billing page reads `?upgrade=` and shows
     "X is not in your plan" with the right plan + add-on).

### C. First-run clinic setup (mandatory, the missing step after approval)
- `lib/clinic-access.ts`: read `onboarding_completed_at` → `access.clinic.onboardingCompleted`.
- **New action** `completeClinicSetupAction` (`lib/actions/onboarding.ts`):
  **updates the existing clinic** (organization_type, facility_size, timezone,
  phone, email, address, doctor_name) + creates the team invites + stamps
  `onboarding_completed_at = now()`. It must never create a second clinic
  (today's `createClinicOnboardingAction` would).
- `createClinicOnboardingAction` (no-clinic path) also stamps the column.
- `components/clinic/onboarding-wizard.tsx`: `mode: "create" | "complete"`; the
  "complete" mode prefills from the existing clinic.
- New page `app/app/clinic/setup/page.tsx`; `/app/clinic/new` stays for the
  no-clinic case.
- `lib/actions/registrations.ts` (approval) creates the clinic with
  `onboarding_completed_at = null` → the first login lands in the wizard.

### D. Seat limits (the "limits" half of the contract)
- `subscription_plans.limits` → resolver → used by:
  - `createDoctorAction` — refuse beyond `doctor_seats` (+ purchased
    `extra-doctor-seat` quantity) with "Your Solo plan includes 1 doctor seat.
    Upgrade to Clinic or add a doctor seat (PKR 199)."
  - `inviteTeamMemberAction` — same for `team_seats`.
  - `/app/doctors` and `/app/settings/team` — show "2 of 5 doctor seats used"
    + the upgrade/add-on CTA.

### E. Per-clinic AI key (BYOK)
- `lib/ai/provider.ts`: `resolveProviderForClinic` becomes **strict** — no
  verified clinic key → typed `ClinicAiKeyMissingError`; the env fallback is
  removed. Every clinic-facing AI path goes through it:
  `app/api/ai/chat/route.ts`, `app/api/widget/chat/route.ts`,
  `lib/whatsapp/adapter.ts`, `lib/actions/ocr-actions.ts`,
  `lib/ai/patient-summary.ts`, `lib/ai/growth-post.ts`,
  `lib/ai/longitudinal-summary.ts`, and the 7 direct `getGeminiProvider()`
  calls in `lib/actions/specialty-workspaces.ts`.
- **No dead end**: the AI Agent page shows an "add your Gemini key" state with
  the key form; the Test Assistant shows the same; the public widget says
  "this clinic has not enabled AI yet"; the WhatsApp adapter already falls
  back to deterministic replies.

### F. UI consistency
- `components/app/app-sidebar.tsx`: locked items get a lock badge and link to
  the upgrade screen (same map as the middleware).
- `components/app/overview/dashboard-overview.tsx`: module cards respect the
  gate (locked card + CTA, not a broken tile).
- `app/app/billing`: read `?upgrade=` → show what is missing, which plan
  includes it, and the add-on alternative.
- `app/app/addons`: mark the add-ons that the current plan already includes as
  "Included in your plan" (not purchasable).
- `components/landing/data.ts`: `PLAN_META` bullets + `PRICING_NOTE` rewritten
  to the new packaging so the marketing page stops promising add-on modules
  as plan features.

### G. Verification
1. New Solo clinic → approve → first login → **setup wizard** → dashboard.
2. Sidebar shows: Dashboard…Booking Page, Sheets, Billing, Settings, Support
   unlocked; **AI Agent, Website, WhatsApp, Engagement, TV Display, Telehealth,
   Google Calendar/Meet, Growth, Add-ons-as-locked** with lock badges.
3. Direct URL to a locked module → upgrade screen (not a blank page).
4. Upgrade to Clinic → AI Agent, Website, WhatsApp, Engagement, TV, Telehealth
   unlock; doctor seats 1 → 5; Growth still locked (add-on) with the
   "add-on" CTA.
5. Buy `growth-agent` → Growth Agent unlocks.
6. AI Agent with no key → "add your key"; after verify → Test Assistant works.
7. Practice tier → multi-branch + assessment library unlock, seats unlimited.

---

## 6. Execution order (each step is independently shippable)

| Step | What | Files | Ships as |
|---|---|---|---|
| **1** | Plan data + limits column | `supabase/migrations/0113_plan_entitlements.sql` | data only, no behaviour change |
| **2** | Resolver + route→entitlement map | `lib/entitlements.ts` (new) | no behaviour change yet |
| **3** | Rollout backfill | `supabase/migrations/0114_entitlement_backfill.sql` | protects existing clinics |
| **4** | Route guard | `middleware.ts` | modules start locking |
| **5** | Sidebar + dashboard lock states | `components/app/app-sidebar.tsx`, `components/app/overview/dashboard-overview.tsx` | UI matches the guard |
| **6** | Upgrade screen | `app/app/billing/page.tsx` + `?upgrade=` handling | locked modules explain themselves |
| **7** | Seat limits | `subscription_plans.limits`, `lib/actions/doctors.ts`, `lib/actions/team.ts`, doctors/team pages | seat caps enforced |
| **8** | First-run setup | `clinics.onboarding_completed_at` (0113), `lib/clinic-access.ts`, `lib/actions/onboarding.ts`, `components/clinic/onboarding-wizard.tsx`, `app/app/clinic/setup/page.tsx`, `lib/actions/registrations.ts` | new clinics get the wizard |
| **9** | BYOK | `lib/ai/provider.ts` + the 8 AI call sites + AI settings UI | no shared platform key |
| **10** | Add-on catalogue + marketing copy | `supabase/migrations/0113` (add-on rows), `app/app/addons`, `components/landing/data.ts` | landing page tells the truth |
| **11** | Verify | local + production script (§4.G) | — |

**Rollback:** every step is additive. Reverting = un-deploy the commit; the
data migrations are reversible with a compensating migration (no data is
destroyed — `clinic_addons` rows are only ever added).

---

## 7. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Existing clinics locked out of Growth/Engagement/WhatsApp on deploy | high | 0114 backfill grants those add-ons to every clinic with an active subscription |
| Landing page advertises the old packaging | medium | step 10 ships in the same release as step 1 |
| Route guard adds latency to every `/app` request | medium | one cached query set; the middleware already does a `getUser()` round trip |
| A clinic's data becomes unreachable after a downgrade | high | downgrade locks the *entry point* only; records stay and come back on re-upgrade |
| BYOK removes AI for clinics that never saved a key | medium | the AI page shows the key form inline (never a dead end); the public widget says "not enabled yet" |
| Seat limits block a clinic mid-month | low | the message names the exact remedy (upgrade or buy the seat) |
| New clinic's first login lands on a page it cannot leave | low | the setup wizard is the only route allowed while incomplete; billing/support/admin stay reachable |

---

## 8. Open questions (your call before I execute)

1. **Plan names** — rename to Solo / Clinic / Practice (codes unchanged), or
   keep Starter / Professional / Enterprise? My default: **rename** — the
   current names are US-SaaS vocabulary; "Clinic" is exactly the Pakistani
   segment.
2. **Legacy add-on rows** (`whatsapp-ai-receptionist`, `queue-management-system`)
   — I plan to keep the rows (so the 3 active purchases on SkinDotsClinics stay
   valid) and relabel them "Included in Clinic plan". Alternative: delete them
   and re-point that clinic to the plan feature. My default: **keep + relabel**.
3. **Seat caps** — is 1 doctor / 3 logins right for Solo, and 5 / 15 for
   Clinic? A reception-heavy clinic in Pakistan often has 1 doctor + 4–5
   staff, so 3 logins may be too tight for Solo. My default: **Solo = 1 doctor
   / 5 logins, Clinic = 5 doctors / 15 logins, Practice = unlimited / 50**.
4. **Online booking in Solo** — I put the public booking page in Solo (a
   standalone link, no website needed) because it is the cheapest lead
   channel. My default: **include it in Solo**.

---

## 9. Your decision

Reply with either:

- **"Execute"** + your answers to the 4 questions in §8 (or "use your
  defaults" for all four) — I implement steps 1→11 in order, with a commit per
  step so any of them can be reverted on its own.
- **"Hold"** + what you want changed in this document — I revise the plan
  (this file is the single source of truth for the work) and re-present it.

Nothing is implemented yet. The only things that exist from the earlier
registration work are already merged and pushed (`eda272f`, `364e89a`,
`5b6da2e`, `176adcc`, `139eb13`) — this plan is the **next** piece of work.
